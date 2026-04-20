import { readFileSync, writeFileSync } from 'fs';

const csv = readFileSync('ucic_raw.csv', 'utf8');
const lines = csv.split('\n');

// Skip header
const dataLines = lines.slice(1).filter(l => l.trim());

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

const seen = new Set();
const dataset = [];

for (const line of dataLines) {
  const fields = parseCSVLine(line);
  if (fields.length < 5) continue;

  const [id, category, keywordsStr, title, content] = fields;

  if (content.trim().length < 50) continue;
  if (seen.has(title.trim().toLowerCase())) continue;
  seen.add(title.trim().toLowerCase());

  const keywords = keywordsStr.trim().split(/\s+/).filter(w => w.length > 0);

  dataset.push({ id, category, keywords, title, content });
}

writeFileSync('ucic_dataset_new.json', JSON.stringify(dataset, null, 2), 'utf8');
console.log(`Konversi selesai: ${dataset.length} entri → ucic_dataset_new.json`);
console.log('\nCek hasilnya, kalau sudah oke jalankan:');
console.log('cp ucic_dataset_new.json ../src/data/ucic_dataset.json');
