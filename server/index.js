import { File } from 'node:buffer';
if (!globalThis.File) globalThis.File = File;

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Groq, { toFile } from 'groq-sdk';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Intent Detection ──────────────────────────────────────────────────────────
// Klasifikasi pertanyaan sebelum diproses — menentukan jalur terbaik

const SMALL_TALK_PATTERNS = [
  'halo', 'hai', ' hi ', 'hello', 'hey',
  'siapa kamu', 'kamu siapa', 'nama kamu', 'kamu apa', 'apa itu sela',
  'apa kabar', 'gimana kabar', 'baik-baik',
  'selamat pagi', 'selamat siang', 'selamat sore', 'selamat malam',
  'good morning', 'good afternoon', 'good evening', 'good night',
  'how are you', 'who are you', 'what are you', 'introduce yourself',
  'perkenalkan', 'kenalkan',
];

const CAMPUS_PATTERNS = [
  'ucic', 'universitas', 'kampus', 'mahasiswa', 'mahasiswi',
  'fakultas', 'jurusan', 'prodi', 'program studi',
  'pendaftaran', 'pmb', 'daftar kuliah', 'kuliah di',
  'wisuda', 'akademik', 'dosen', 'semester', 'sks', 'ipk',
  'beasiswa', 'krs', 'khs', 'ospek', 'orientasi',
  'catur insan', 'cirebon',
];

/**
 * Deteksi intent dari query user (rule-based, tanpa latency API call)
 * @returns {'small_talk' | 'campus' | 'general' | 'unclear'}
 */
function detectIntent(query) {
  const q = ' ' + query.toLowerCase().trim() + ' ';
  if (q.trim().length < 3) return 'unclear';
  if (SMALL_TALK_PATTERNS.some(p => q.includes(p))) return 'small_talk';
  if (CAMPUS_PATTERNS.some(p => q.includes(p))) return 'campus';
  return 'general';
}

// ── Query Rewriting ───────────────────────────────────────────────────────────
// Bersihkan query vague/ambigu sebelum masuk web search


function isVagueQuery(query) {
  const q = query.toLowerCase().trim();
  if (q.length < 5) return true;
  const words = q.split(/\s+/);
  const vagueWords = ['itu', 'ini', 'tadi', 'gimana', 'bagaimana', 'nih', 'sih', 'deh', 'loh'];
  const vagueCount = words.filter(w => vagueWords.includes(w)).length;
  // Lebih dari setengah kata adalah kata samar → perlu rewrite
  return vagueCount / words.length > 0.45;
}

/**
 * Rewrite query samar menggunakan LLM kecil (llama-3.1-8b-instant = cepat)
 * @param {string} query
 * @param {string} recentContext - beberapa pesan terakhir sebagai konteks
 * @returns {Promise<string>} query yang sudah dibersihkan
 */
async function rewriteQuery(query, recentContext = '') {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Rewrite the user query into a clear, specific, searchable question. If context is provided, use it to resolve vague references like "itu", "ini", "tadi". Output ONLY the rewritten query in the same language as the input. No explanation, no quotes.',
        },
        {
          role: 'user',
          content: recentContext
            ? `Recent conversation:\n${recentContext}\n\nUser query to rewrite: ${query}`
            : `User query to rewrite: ${query}`,
        },
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 60,
    });
    const rewritten = completion.choices[0]?.message?.content?.trim();
    console.log(`[SELA Rewrite] "${query}" → "${rewritten}"`);
    return rewritten || query;
  } catch (e) {
    console.error('[SELA Rewrite] Gagal:', e.message);
    return query;
  }
}

// ── Confidence Check ──────────────────────────────────────────────────────────
// Deteksi kalau LLM menjawab "tidak tahu" → trigger fallback web search

const UNCERTAIN_PHRASES = [
  'belum punya info', 'belum ada informasi', 'sela belum',
  'tidak memiliki informasi', 'tidak tahu', 'nggak tau', 'nggak tahu',
  "doesn't have", "don't have", "don't know", "sela doesn't",
  'sorry, sela', 'maaf, sela belum',
];

function isUncertainResponse(text) {
  const lower = text.toLowerCase();
  return UNCERTAIN_PHRASES.some(p => lower.includes(p));
}

// ── Web Search — DuckDuckGo (utama) + Serper (fallback) ──────────────────────
// DDG: gratis, no key, no setup | Serper: fallback kalau DDG kosong/tidak relevan
// ucicContext: true = tambah prefix UCIC, false = query murni

// Stop words bahasa ID+EN — diabaikan saat cek relevansi hasil search
const STOP_WORDS = new Set([
  'yang','dan','di','ke','dari','ini','itu','ada','tidak','bisa','saya','kamu',
  'kami','apa','atau','juga','sudah','akan','untuk','dengan','pada','adalah',
  'the','is','are','was','were','a','an','of','in','to','for','how','what',
]);

/**
 * Cek apakah hasil search relevan dengan query user.
 * Minimal 30% kata bermakna dari query harus muncul di hasil.
 */
function isResultRelevant(query, result) {
  if (!result || result.length < 20) return false;
  const queryWords = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
  if (queryWords.length === 0) return true; // query terlalu pendek, loloskan
  const resultLower = result.toLowerCase();
  const matchCount = queryWords.filter(w => resultLower.includes(w)).length;
  const ratio = matchCount / queryWords.length;
  console.log(`[SELA Relevance] ${ratio.toFixed(2)} (${matchCount}/${queryWords.length} kata match)`);
  return ratio >= 0.3;
}



// Wikipedia API — gratis, reliable, akurat untuk pertanyaan faktual
// Coba id.wikipedia.org dulu, fallback ke en.wikipedia.org
async function searchViaWikipedia(query) {
  for (const lang of ['id', 'en']) {
    try {
      // Step 1: cari judul artikel yang paling relevan
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search` +
        `&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=1&srprop=snippet`;
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
      if (!searchRes.ok) continue;
      const searchData = await searchRes.json();
      const title = searchData.query?.search?.[0]?.title;
      if (!title) continue;

      // Step 2: ambil ringkasan intro artikel
      const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(5000) });
      if (!summaryRes.ok) continue;
      const data = await summaryRes.json();
      const text = data.extract;
      if (text && text.length > 100) {
        console.log(`[SELA Wiki] Hasil dari ${lang}.wikipedia.org: "${title}"`);
        return text;
      }
    } catch (e) {
      console.warn(`[SELA Wiki] ${lang} gagal: ${e.message}`);
    }
  }
  return null;
}

async function searchViaDuckDuckGo(searchQuery) {
  // Tier utama: Wikipedia API (gratis, tidak pernah diblokir, sangat akurat)
  try {
    const text = await searchViaWikipedia(searchQuery);
    if (text) return text;
  } catch (e) {
    console.warn(`[SELA Wiki] Gagal: ${e.message}`);
  }

  // Tier fallback: DDG Instant Answer API
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`DDG API error: ${res.status}`);
  const data = await res.json();
  const results = [];
  if (data.Answer)       results.push(data.Answer);
  if (data.AbstractText) results.push(`${data.AbstractSource}: ${data.AbstractText}`);
  data.RelatedTopics?.slice(0, 3).forEach(t => {
    if (t.Text && t.Text.length > 30) results.push(t.Text);
  });
  return results.length > 0 ? results.join('\n\n') : null;
}

async function searchViaSerper(searchQuery) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey || apiKey === 'isi_api_key_serper_disini') return null;

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: searchQuery, gl: 'id', hl: 'id', num: 5 }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) throw new Error(`Serper error: ${res.status}`);
  const data = await res.json();

  const results = [];
  if (data.answerBox?.answer)  results.push(data.answerBox.answer);
  if (data.answerBox?.snippet) results.push(data.answerBox.snippet);
  data.organic?.slice(0, 3).forEach(r => {
    if (r.snippet) results.push(`${r.title}: ${r.snippet}`);
  });

  return results.length > 0 ? results.join('\n\n') : null;
}

async function searchWeb(query, ucicContext = false) {
  const searchQuery = ucicContext
    ? `UCIC Universitas Catur Insan Cendekia ${query}`
    : query;

  // Tier 1: DuckDuckGo (gratis, no key)
  try {
    const r = await searchViaDuckDuckGo(searchQuery);
    if (r && isResultRelevant(query, r)) {
      console.log(`[SELA Search] DDG OK — relevan`);
      return r;
    }
    if (r) console.log(`[SELA Search] DDG dapat hasil tapi tidak relevan, lanjut ke Serper`);
  } catch (e) {
    console.warn(`[SELA Search] DDG gagal (${e.message}), fallback ke Serper...`);
  }

  // Tier 2: Serper (fallback)
  try {
    const r = await searchViaSerper(searchQuery);
    if (r && isResultRelevant(query, r)) {
      console.log(`[SELA Search] Serper OK — relevan`);
      return r;
    }
    if (r) console.log(`[SELA Search] Serper dapat hasil tapi tidak relevan, skip`);
  } catch (e) {
    console.error(`[SELA Search] Serper gagal: ${e.message}`);
  }

  return null; // tidak ada hasil relevan → LLM jawab dari pengetahuannya sendiri
}

// Kata kunci yang butuh info terkini → trigger web search
const TIME_KEYWORDS = [
  'sekarang', 'terbaru', 'hari ini', 'tahun ini', 'bulan ini',
  'terkini', 'update', 'berita', 'pengumuman', 'event', 'kegiatan',
  'jadwal terbaru', '2025', '2026', '2027',
  'now', 'latest', 'today', 'current', 'news', 'announcement',
];

function shouldSearchWebForIntent(intent, searchQuery, ragScore) {
  const queryLower = searchQuery.toLowerCase();
  const hasTimeKeyword = TIME_KEYWORDS.some(kw => queryLower.includes(kw));
  const poorRagMatch = ragScore > 0.45;

  if (intent === 'small_talk') return false;
  if (searchQuery.length <= 3) return false;

  // UCIC/campus questions are dataset-first. Only allow web for explicitly time-sensitive asks.
  if (intent === 'campus') return hasTimeKeyword;

  return hasTimeKeyword || poorRagMatch;
}

// ── Helper: inject web results ke system message ──────────────────────────────
function injectWebResults(messages, webResults, lang) {
  return messages.map((msg, i) => {
    if (i === 0 && msg.role === 'system') {
      const label = lang === 'en' ? '\n\n[WEB RESULTS]:\n' : '\n\n[HASIL WEB]:\n';
      return { ...msg, content: msg.content + label + webResults };
    }
    return msg;
  });
}

// ── POST /api/transcribe ──────────────────────────────────────────────────────
app.post('/api/transcribe', upload.single('file'), async (req, res) => {
  try {
    console.log('[transcribe] req.file:', req.file ? `name=${req.file.originalname} size=${req.file.size}` : 'UNDEFINED');
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const lang = req.body.lang || 'id';
    const buffer = req.file.buffer;
    const fileName = req.file.originalname || 'audio.webm';

    const file = await toFile(buffer, fileName, { type: req.file.mimetype || 'audio/webm' });

    // Prompt kaya: kata kampus + kata percakapan sehari-hari agar Whisper lebih akurat
    const promptID = 'SELA, UCIC, Universitas Catur Insan Cendekia, Cirebon, kampus, mahasiswa, akademik, fakultas, pendaftaran, beasiswa, wisuda, oke, ya, tidak, gimana, kenapa, kapan, di mana, berapa, siapa, tolong, bisa, mau, ingin, bagaimana, apakah, dong, sih, nih, loh, deh, emang, memang, banget';
    const promptEN = 'SELA, UCIC, Universitas Catur Insan Cendekia, Cirebon, campus, student, academic, faculty, registration, scholarship, graduation, okay, yes, no, how, why, when, where, how much, who, please, can, want, would like, really, actually';

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3',
      language: lang,
      response_format: 'json',
      prompt: lang === 'en' ? promptEN : promptID,
    });

    res.json({ text: transcription.text });
  } catch (err) {
    console.error('Transcription error:', err?.message || err);
    res.status(500).json({ error: 'Gagal mengenali suara.', detail: err?.message });
  }
});

// ── POST /api/chat ────────────────────────────────────────────────────────────
// Terima { messages, lang, userQuery, ragScore }, return { text }
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, lang = 'id', userQuery = '', ragScore = 1 } = req.body;

    // 1. Intent detection — tentukan jalur pemrosesan
    const intent = detectIntent(userQuery);
    console.log(`[SELA Intent] "${userQuery.slice(0, 50)}" → ${intent}`);

    // 2. Ambil konteks percakapan terakhir untuk query rewriting
    const recentContext = messages
      .filter(m => m.role !== 'system')
      .slice(-4)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    // 3. Rewrite query kalau samar/ambigu (skip untuk small talk)
    let searchQuery = userQuery;
    if (intent !== 'small_talk' && userQuery.length > 2 && isVagueQuery(userQuery)) {
      searchQuery = await rewriteQuery(userQuery, recentContext);
    }

    // 4. Tentukan apakah perlu web search:
    //    - small_talk  : tidak perlu
    //    - campus      : hanya kalau ada time keyword (jadwal, terbaru, dll) — info statis dari RAG
    //    - general     : kalau RAG jelek (> 0.45) ATAU ada time keyword
    const needsWebSearch = shouldSearchWebForIntent(intent, searchQuery, ragScore);

    let finalMessages = messages;

    if (needsWebSearch) {
      // Campus intent atau RAG jelek → pakai prefix UCIC
      // General intent dengan time keyword → cari tanpa prefix
      const ucicContext = intent === 'campus'; // hanya tambah prefix UCIC kalau memang pertanyaan kampus
      console.log(`[SELA Search] Trigger — intent:${intent} ragScore:${ragScore?.toFixed(2)} ucicContext:${ucicContext}`);
      const webResults = await searchWeb(searchQuery, ucicContext);
      if (webResults) {
        finalMessages = injectWebResults(messages, webResults, lang);
        console.log('[SELA Search] Web results injected');
      }
    }

    // 5. LLM call utama
    const completion = await groq.chat.completions.create({
      messages: finalMessages,
      model: 'llama-3.3-70b-versatile',
      temperature: 0.6,
      max_tokens: 200,
    });

    let responseText = completion.choices[0]?.message?.content || '';

    // 6. Confidence fallback — kalau LLM bilang "tidak tahu" dan belum web search
    if (
      isUncertainResponse(responseText)
      && !needsWebSearch
      && searchQuery.length > 3
      && intent !== 'campus'
    ) {
      console.log('[SELA Fallback] LLM tidak yakin, coba web search...');
      // Coba UCIC context dulu, kalau kosong coba general
      const fallbackResults = await searchWeb(searchQuery, true)
        || await searchWeb(searchQuery, false);

      if (fallbackResults) {
        const fallbackMessages = injectWebResults(messages, fallbackResults, lang);
        const retry = await groq.chat.completions.create({
          messages: fallbackMessages,
          model: 'llama-3.3-70b-versatile',
          temperature: 0.6,
          max_tokens: 200,
        });
        const retryText = retry.choices[0]?.message?.content || '';
        if (retryText) {
          responseText = retryText;
          console.log('[SELA Fallback] Berhasil dengan web fallback');
        }
      }
    }

    res.json({ text: responseText });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Gagal mendapat respons AI.' });
  }
});

const PORT = process.env.SERVER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`SELA backend running on http://localhost:${PORT}`);
});
