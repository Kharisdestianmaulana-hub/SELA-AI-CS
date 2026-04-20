import { readFileSync, writeFileSync } from 'fs';

// Parse CSV with quoted field handling
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// Read & parse ucic_raw.csv
const csv = readFileSync('ucic_raw.csv', 'utf8');
const csvLines = csv.split('\n').slice(1).filter(l => l.trim());
const csvEntries = [];

for (const line of csvLines) {
  const [id, category, keywordsStr, title, content] = parseCSVLine(line);
  if (content.trim().length < 50) continue;

  const keywords = keywordsStr.trim().split(/\s+/).filter(w => w.length > 0);
  csvEntries.push({ id, category, keywords, title: title.trim(), content: content.trim() });
}

console.log(`[MERGE] CSV entries parsed: ${csvEntries.length}`);

// Read existing JSON
const existing = JSON.parse(readFileSync('../src/data/ucic_dataset.json', 'utf8'));
console.log(`[MERGE] Existing JSON entries: ${existing.length}`);

// Filter CSV entries: exclude student achievements & outdated announcements/news from 2024/2025
const EXCLUDE_PATTERNS = [
  'mahasiswa berprestasi',
  'mahasiswa prestasi',
  /pengumuman.*2024/i,
  /pengumuman.*2025/i,
  /berita.*2024/i,
  /berita.*2025/i,
];

function shouldExclude(entry) {
  const titleLower = entry.title.toLowerCase();
  const contentLower = entry.content.toLowerCase();

  // Exclude if in exclude patterns
  for (const pattern of EXCLUDE_PATTERNS) {
    if (typeof pattern === 'string') {
      if (titleLower.includes(pattern) || contentLower.includes(pattern)) {
        return true;
      }
    } else {
      if (pattern.test(entry.title) || pattern.test(entry.content)) {
        return true;
      }
    }
  }
  return false;
}

const filtered = csvEntries.filter(e => !shouldExclude(e));
console.log(`[MERGE] After filtering: ${filtered.length} (excluded ${csvEntries.length - filtered.length})`);

// Find new entries: check if title similarity exists in JSON
function isTitleInJSON(csvTitle, jsonArray) {
  const csvLower = csvTitle.toLowerCase().trim();
  return jsonArray.some(j => {
    const jsonLower = j.title.toLowerCase().trim();
    // Exact match or very close match
    return jsonLower === csvLower ||
           jsonLower.includes(csvLower) ||
           csvLower.includes(jsonLower);
  });
}

const newEntries = filtered.filter(e => !isTitleInJSON(e.title, existing));
console.log(`[MERGE] New entries to add: ${newEntries.length}`);

// Show what's being added
console.log('\n--- NEW ENTRIES TO ADD ---');
newEntries.forEach(e => {
  console.log(`• [${e.category}] ${e.title}`);
});

// Merge: existing + new
const merged = [...existing, ...newEntries];
console.log(`\n[MERGE] Final merged dataset: ${merged.length} entries`);

// Write merged dataset
writeFileSync('../src/data/ucic_dataset.json', JSON.stringify(merged, null, 2), 'utf8');
console.log('\n✓ Merged dataset saved to ../src/data/ucic_dataset.json');
