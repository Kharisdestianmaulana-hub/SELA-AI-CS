import Fuse from 'fuse.js';
import dataset from '../data/ucic_dataset.json';

// ── RAG Setup ────────────────────────────────────────────────────────────────

let fuse = null;

async function getFuse() {
  if (fuse) return fuse;
  try {
    fuse = new Fuse(dataset, {
      keys: ['keywords', 'title', 'content'],
      threshold: 0.6,
      ignoreLocation: true,
      includeScore: true,
    });
  } catch (e) {
    console.error('Gagal inisialisasi RAG dataset:', e);
  }
  return fuse;
}

// ── Language Auto-Detection ──────────────────────────────────────────────────
// Deteksi bahasa dari teks user — digunakan untuk override lang prop
// kalau user jelas bicara dalam bahasa yang berbeda

const EN_INDICATORS = [
  'the ', ' is ', ' are ', ' was ', ' were ',
  'what ', 'how ', 'when ', 'where ', 'why ',
  ' can ', ' could ', ' would ', 'please ',
  ' you ', ' your ', ' my ', ' me ', ' i ',
  "i'm ", "it's ", "don't ", "can't ", "what's ",
];

const ID_INDICATORS = [
  'yang ', ' di ', ' ke ', ' dari ',
  ' ini ', ' itu ', ' ada ', ' tidak ', ' bisa ',
  ' saya ', ' kamu ', ' kami ', ' apa ',
  'gimana', 'bagaimana', 'dimana', 'kapan', 'kenapa',
  ' nih', ' sih', ' ya ', ' dong', ' deh',
  'apakah', 'tolong', 'banget', 'emang',
];

/**
 * Deteksi bahasa teks — return 'en' atau 'id'
 * Hanya override jika deteksi Inggris jelas (margin > 1) agar tidak false positive
 */
function detectLang(text) {
  if (!text || text.length < 5) return null; // terlalu pendek, tidak bisa deteksi
  const lower = ' ' + text.toLowerCase() + ' ';
  const enScore = EN_INDICATORS.filter(w => lower.includes(w)).length;
  const idScore = ID_INDICATORS.filter(w => lower.includes(w)).length;
  if (enScore > idScore + 1) return 'en';  // jelas Inggris
  if (idScore > enScore) return 'id';      // jelas Indonesia
  return null; // tidak yakin — pakai lang dari prop
}

// ── Transcribe ───────────────────────────────────────────────────────────────

/**
 * Transcribe audio blob ke teks via backend proxy
 * @param {Blob} audioBlob
 * @param {string} lang - 'id' | 'en'
 * @returns {Promise<string>}
 */
export async function transcribeAudio(audioBlob, lang = 'id') {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('lang', lang);

  const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Gagal mengenali suara. Coba lagi ya!');
  const { text } = await res.json();
  return text;
}

// ── Chat Completion ──────────────────────────────────────────────────────────

/**
 * Get AI response dengan Hybrid RAG. System prompt + konteks dibangun di sini
 * (di frontend), lalu dikirim ke backend sebagai messages array biasa.
 * @param {Array} messageHistory - [{role, content}]
 * @param {string} lang - 'id' | 'en'
 * @returns {Promise<{ text: string, detectedLang: string }>}
 */
export async function getChatCompletion(messageHistory, lang = 'id') {
  // Conversation memory: cap ke 10 pesan terakhir (5 giliran) agar tidak overflow token
  // tapi tetap punya konteks percakapan yang cukup
  const cappedHistory = messageHistory.slice(-10);

  const userQuery = cappedHistory.length > 0
    ? cappedHistory[cappedHistory.length - 1].content
    : '';

  // Auto-detect bahasa dari query user — override lang kalau deteksi yakin
  const autoLang = detectLang(userQuery);
  const effectiveLang = autoLang || lang;
  if (autoLang && autoLang !== lang) {
    console.log(`[SELA Lang] Auto-detect: "${autoLang}" (prop: "${lang}")`);
  }

  // 1. Local RAG Retrieval via Fuse.js
  const f = await getFuse();
  let contextStr = '';
  let ragScore = 1; // default: tidak ada match (Fuse: 0=sempurna, 1=tidak relevan)

  if (f && userQuery) {
    const results = f.search(userQuery);
    console.log('RAG Match Score (Top 1):', results[0]?.score, 'Query:', userQuery);
    if (results.length > 0) {
      ragScore = results[0].score ?? 1;
      contextStr = results.slice(0, 2)
        .map(r => `Topik: ${r.item.title}\nInfo: ${r.item.content}`)
        .join('\n\n');
    }
  }

  // 2. System prompt bilingual + konteks RAG
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const todayEN = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const systemPromptID = `Kamu adalah SELA (Smart Educational Learning Assistant), asisten virtual Universitas Catur Insan Cendekia (UCIC) yang asyik, ceria, dan selalu siap membantu.
Hari ini adalah ${today}. Gunakan informasi ini saat menjawab pertanyaan yang berkaitan dengan waktu atau tanggal.
Gaya bicaramu kasual (pakai 'nih', 'sih', 'ya', 'banget'). Jawabanmu harus singkat padat (maksimal 2-3 kalimat) agar nyaman didengar lewat suara/TTS.

[ATURAN KONTEKS KAMPUS]:
- Jika [KONTEKS KAMPUS] di bawah relevan dengan pertanyaan tentang UCIC, JADIKAN FAKTA MUTLAK.
- Jika user tanya soal UCIC tapi tidak ada di konteks, jawab "Maaf, SELA belum punya info detail soal itu."
- Untuk pertanyaan di luar kampus, abaikan [KONTEKS KAMPUS] dan jawab natural.

[KONTEKS KAMPUS]:
${contextStr || 'Kosong'}

[ATURAN HASIL PENCARIAN WEB]:
- Untuk pertanyaan UCIC, [KONTEKS KAMPUS] tetap jadi sumber utama dan paling valid.
- Gunakan [HASIL WEB] HANYA jika pertanyaan UCIC jelas meminta info terkini seperti pengumuman terbaru, jadwal terbaru, atau kegiatan terbaru.
- Untuk pertanyaan non-UCIC, jika ada [HASIL WEB], gunakan itu sebagai referensi utama karena bisa lebih terkini.

[BATASAN TOPIK]:
- SELA HANYA membahas UCIC dan kehidupan kampus: pendaftaran, akademik, program/jurusan, jadwal.
/* DISABLED (incomplete data): beasiswa, fasilitas detail, kegiatan kampus */
- Pengetahuan umum sederhana (sains, sejarah, tokoh dunia, dll) boleh dijawab singkat.
- TOLAK dan JANGAN jawab topik berikut:
  • Politik, partai, pilpres, pemilu, capres/cawapres
  • SARA (suku, agama, ras, antar golongan)
  • Hiburan tidak relevan (film, musik, game, resep masakan, artis)
  • Konten dewasa, kekerasan, atau berbahaya
  Gunakan respons: "Wah, itu di luar bidang SELA nih. Ada yang bisa SELA bantu soal UCIC?"

/* [ESKALASI KE STAFF]: DISABLED - Menunggu data lengkap
Jika pertanyaan butuh info yang SELA tidak punya (dokumen resmi, kasus personal, konfirmasi data), arahkan user ke:
- Info umum & pendaftaran : Humas UCIC / PMB
- Akademik & nilai        : BAA (Biro Administrasi Akademik)
- Keuangan & beasiswa     : BAK (Biro Administrasi Keuangan)
- Kemahasiswaan           : Bagian Kemahasiswaan
- Website resmi           : ucic.ac.id
*/

[PERTANYAAN LANJUTAN]:
Setelah menjawab pertanyaan user, SELALU tambahkan 2-3 pertanyaan lanjutan yang relevan di AKHIR jawaban.
Format: [Pertanyaan 1?] | [Pertanyaan 2?] | [Pertanyaan 3?]
Contoh:
User: "Kapan pendaftaran dibuka?"
Jawab: "Pendaftaran dibuka bulan Maret. [Bagaimana cara daftar online?] | [Apa saja persyaratan pendaftaran?] | [Berapa biaya pendaftaran?]"
Pastikan pertanyaan lanjutan RELEVAN dengan topik yang baru dijawab.`;

  const systemPromptEN = `You are SELA (Smart Educational Learning Assistant), a fun, cheerful, and helpful virtual assistant for Universitas Catur Insan Cendekia (UCIC).
Today is ${todayEN}. Use this when answering questions related to time or dates.
Your speaking style is casual and friendly. Your answers MUST be short and concise (max 2-3 sentences) so they are comfortable to be spoken via TTS.
You MUST ALWAYS answer the user in ENGLISH.

[CAMPUS CONTEXT RULES]:
- If [CAMPUS CONTEXT] below is relevant to a UCIC question, use it as ABSOLUTE FACT.
- If asked about UCIC details not in the context, say "Sorry, SELA doesn't have detailed info about that yet."
- For non-campus questions, ignore [CAMPUS CONTEXT] and answer naturally.

[CAMPUS CONTEXT]:
${contextStr || 'Empty'}

[WEB SEARCH RESULTS RULES]:
- For UCIC questions, [CAMPUS CONTEXT] remains the primary and most valid source.
- Use [WEB RESULTS] for UCIC only when the question clearly asks for latest information such as announcements, recent schedules, or current events.
- For non-UCIC questions, if [WEB RESULTS] exists, use it as the primary reference because it may be more up to date.

[TOPIC RESTRICTIONS]:
- SELA ONLY discusses UCIC and campus life: admissions, academics, programs/majors, schedules.
/* DISABLED (incomplete data): scholarships, facility details, campus activities */
- Simple general knowledge (science, history, world figures, etc.) is OK to answer briefly.
- REFUSE and DO NOT answer:
  • Politics, elections, political parties
  • SARA (ethnicity, religion, race, inter-group issues)
  • Unrelated entertainment (movies, music, games, recipes, celebrities)
  • Adult content, violence, or harmful content
  Response: "That's outside SELA's area! Is there anything about UCIC I can help with?"

/* [ESCALATION TO STAFF]: DISABLED - Waiting for complete data
If a question needs info SELA doesn't have (official documents, personal data, direct confirmation), direct the user to:
- Admissions info      : Humas UCIC / PMB office
- Academic & grades    : BAA (Academic Administration Bureau)
- Finance & scholarships : BAK (Finance Administration Bureau)
- Student affairs      : Student Affairs department
- Official website     : ucic.ac.id
*/

[FOLLOW-UP QUESTIONS]:
After answering the user's question, ALWAYS add 2-3 relevant follow-up questions at the END of your answer.
Format: [Question 1?] | [Question 2?] | [Question 3?]
Example:
User: "When does registration open?"
Answer: "Registration opens in March. [How do I register online?] | [What are the registration requirements?] | [What is the registration fee?]"
Make sure the follow-up questions are RELEVANT to the topic you just answered.`;

  const messages = [
    { role: 'system', content: effectiveLang === 'en' ? systemPromptEN : systemPromptID },
    ...cappedHistory,
  ];

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      lang: effectiveLang,
      userQuery,
      ragScore,
    }),
  });

  if (!res.ok) throw new Error('Maaf, otak SELA lagi loading nih. Coba tanya lagi ya.');
  const { text } = await res.json();

  // Parse follow-up suggestions from response
  const { text: cleanText, suggestions } = parseSuggestions(text || '');

  return {
    text: cleanText || 'Maaf, SELA agak bingung. Bisa diulang?',
    suggestions,
    detectedLang: effectiveLang,
  };
}

// ── Text-to-Speech ───────────────────────────────────────────────────────────

/**
 * Speak text using browser's native Web Speech API
 * @param {string} text
 * @param {function} onStart
 * @param {function} onEnd
 * @param {string} lang - 'id' | 'en'
 */
export function speakText(text, onStart, onEnd, lang = 'id') {
  if (!('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis API not supported in this browser.');
    if (onEnd) onEnd();
    return;
  }

  window.speechSynthesis.cancel();

  const doSpeak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'en' ? 'en-US' : 'id-ID';
    utterance.rate = 1.0;
    utterance.pitch = 1.1;

    utterance.onstart = () => { if (onStart) onStart(); };
    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = (e) => {
      // "interrupted" sering terjadi di Chrome karena cancel() sebelumnya,
      // abaikan saja dan tetap panggil onEnd supaya loop tidak putus
      console.warn('SpeechSynthesis error:', e.error);
      if (e.error !== 'interrupted') {
        if (onEnd) onEnd();
      }
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const targetedLang = lang === 'en' ? 'en' : 'id';
      const available = voices.filter(v => v.lang.includes(targetedLang));
      if (available.length > 0) {
        utterance.voice = available.find(v => v.name.toLowerCase().includes('female')) || available[0];
      }
    }

    window.speechSynthesis.speak(utterance);
  };

  // Chrome bug: cancel() butuh jeda sebelum speak() baru bisa jalan
  if (window.speechSynthesis.getVoices().length > 0) {
    setTimeout(doSpeak, 100);
  } else {
    window.speechSynthesis.onvoiceschanged = () => setTimeout(doSpeak, 100);
  }
}

// ── Time-based Greeting ──────────────────────────────────────────────────────

/**
 * Get greeting based on current time of day
 * @param {string} lang - 'id' | 'en'
 * @returns {string} - Time-appropriate greeting
 */
export function getTimeBasedGreeting(lang = 'id') {
  const hour = new Date().getHours();
  let period;

  if (hour >= 5 && hour < 11) period = 'morning';
  else if (hour >= 11 && hour < 15) period = 'afternoon';
  else if (hour >= 15 && hour < 19) period = 'evening';
  else period = 'night';

  const greetings = {
    id: {
      morning: 'Pagi, apa yang bisa SELA bantu? 🌅',
      afternoon: 'Siang, ada yang bisa SELA bantu? ☀️',
      evening: 'Sore, apa pertanyaannya? 🌤️',
      night: 'Malam, SELA siap membantu 🌙',
    },
    en: {
      morning: 'Good morning, how can SELA help? 🌅',
      afternoon: 'Good afternoon, what can I help with? ☀️',
      evening: 'Good evening, any questions? 🌤️',
      night: 'Good night, SELA is here to help 🌙',
    },
  };

  return greetings[lang]?.[period] || greetings[lang].afternoon;
}

// ── Follow-up Suggestion Parser ──────────────────────────────────────────────

/**
 * Parse follow-up suggestions from LLM response
 * Format: "Some response text [Question1?] | [Question2?] | [Question3?]"
 * Returns: { text (without suggestions), suggestions (array of strings) }
 * @param {string} text - Response text from LLM
 * @returns {object} - { text: string, suggestions: Array<string> }
 */
export function parseSuggestions(text) {
  if (!text) return { text: '', suggestions: [] };

  // Extract all [Question?] patterns
  const matches = text.match(/\[(.*?)\]/g);

  if (matches && matches.length > 0) {
    const suggestions = matches.map(s => s.slice(1, -1).trim()).filter(s => s.length > 0);
    // Remove suggestion markers from display text, including separator pipes
    const cleanText = text.replace(/\s*\[.*?\]\s*\|?\s*/g, '').trim();
    return { text: cleanText, suggestions };
  }

  return { text, suggestions: [] };
}
