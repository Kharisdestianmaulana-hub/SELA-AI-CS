import { load } from 'cheerio';
import { createWriteStream } from 'fs';
import { writeFileSync } from 'fs';

const PAGES = [
  // Profil kampus
  { url: 'https://www.cic.ac.id/',                                          category: 'profil' },
  { url: 'https://www.cic.ac.id/about/sambutan_rektor',                     category: 'profil' },
  { url: 'https://www.cic.ac.id/about/visimisi',                            category: 'visi_misi' },
  { url: 'https://www.cic.ac.id/about/sejarah',                             category: 'profil' },

  // Program studi — FTI
  { url: 'https://www.cic.ac.id/fakultas/prodi_ti',                         category: 'akademik' },
  { url: 'https://www.cic.ac.id/fakultas/profil_prodi_sistem_informasi',    category: 'akademik' },
  { url: 'https://www.cic.ac.id/fakultas/prodi_dkv',                        category: 'akademik' },
  { url: 'https://www.cic.ac.id/fakultas/prodi_mi',                         category: 'akademik' },
  { url: 'https://www.cic.ac.id/fakultas/prodi_ka',                         category: 'akademik' },

  // Program studi — FEB
  { url: 'https://www.cic.ac.id/fakultas/prodi_manajemen',                  category: 'akademik' },
  { url: 'https://www.cic.ac.id/fakultas/prodi_akuntansi',                  category: 'akademik' },
  { url: 'https://www.cic.ac.id/fakultas/prodi_manajemen_bisnis',           category: 'akademik' },

  // Pengumuman & kegiatan
  { url: 'https://www.cic.ac.id/pengumuman/',                               category: 'pengumuman' },
  { url: 'https://www.cic.ac.id/artikel/',                                  category: 'berita' },
  { url: 'https://www.cic.ac.id/kegiatan/',                                 category: 'kegiatan' },
];

const STOPWORDS = new Set([
  'yang','dan','di','ke','dari','ini','itu','ada','tidak','bisa','untuk',
  'dengan','pada','adalah','juga','akan','sudah','atau','dalam','the',
  'and','of','in','to','for','is','are','was','were','a','an',
]);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
};

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

function extractKeywords(title) {
  return title.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w))
    .join(' ');
}

function escapeCSV(val) {
  const str = String(val).replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
  return `"${str}"`;
}

async function scrapePage({ url, category }) {
  console.log(`Scraping: ${url}`);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.warn(`  → HTTP ${res.status}, skip`); return []; }
    const html = await res.text();
    const $ = load(html);

    // Hapus elemen noise
    $('nav, header, footer, script, style, .menu, .sidebar, .navbar, .footer, .header, noscript, iframe').remove();

    const sections = [];
    let sectionIndex = 0;

    // Cari setiap heading sebagai section
    $('h1, h2, h3').each((_, el) => {
      const title = $(el).text().trim();
      if (!title || title.length < 3) return;

      // Ambil semua p dan li setelah heading ini sampai heading berikutnya
      const contentParts = [];
      $(el).nextUntil('h1, h2, h3').each((_, sib) => {
        const tag = sib.tagName?.toLowerCase();
        if (tag === 'p' || tag === 'li' || tag === 'div') {
          const text = $(sib).text().trim().replace(/\s+/g, ' ');
          if (text.length > 20) contentParts.push(text);
        }
      });

      const content = contentParts.join(' ').trim();
      if (content.length < 50) return;

      const id = `${slugify(title)}_${sectionIndex++}`;
      const keywords = extractKeywords(title);

      sections.push({ id, category, keywords, title, content });
    });

    // Kalau tidak ada heading, ambil semua paragraf sebagai satu section
    if (sections.length === 0) {
      const allText = $('p').map((_, el) => $(el).text().trim()).get()
        .filter(t => t.length > 30).join(' ');
      if (allText.length > 50) {
        const title = $('title').text().trim() || url;
        sections.push({
          id: `${slugify(title)}_0`,
          category,
          keywords: extractKeywords(title),
          title,
          content: allText.slice(0, 2000),
        });
      }
    }

    console.log(`  → ${sections.length} section ditemukan`);
    return sections;
  } catch (e) {
    console.warn(`  → Gagal: ${e.message}`);
    return [];
  }
}

async function main() {
  const rows = ['id,category,keywords,title,content'];

  for (const page of PAGES) {
    const sections = await scrapePage(page);
    for (const s of sections) {
      rows.push([
        escapeCSV(s.id),
        escapeCSV(s.category),
        escapeCSV(s.keywords),
        escapeCSV(s.title),
        escapeCSV(s.content),
      ].join(','));
    }
    // Jeda kecil agar tidak dianggap spam
    await new Promise(r => setTimeout(r, 800));
  }

  writeFileSync('ucic_raw.csv', rows.join('\n'), 'utf8');
  console.log(`\nSelesai! ${rows.length - 1} baris ditulis ke ucic_raw.csv`);
}

main();
