import Fuse from 'fuse.js';
import dataset from '../data/ucic_dataset.json';

// ── RAG Setup ────────────────────────────────────────────────────────────────

let fuse = null;

const EXCLUDED_RAG_CATEGORIES = new Set(['berita', 'dosen', 'akademik']);
const EXCLUDED_RAG_IDS = new Set([
  'data_lengkap_ucic',
  'informasi_kampus_0',
  'info_pmb_1',
  'berita_seputar_kampus_2',
  'kegiatan_kampus_3',
  'informasi_artikel_berita_seputar_univers_0',
  'kegiatan_seputar_universitas_cic_0',
  'data_lengkap',
]);

const ragDataset = dataset.filter(item => (
  !EXCLUDED_RAG_CATEGORIES.has(item.category)
  && !EXCLUDED_RAG_IDS.has(item.id)
));

async function getFuse() {
  if (fuse) return fuse;
  try {
    fuse = new Fuse(ragDataset, {
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

  const systemPromptID = `Kamu adalah SELA, wujud resepsionis virtual Universitas Catur Insan Cendekia (UCIC) yang berkarakter lembut, karismatik, berwibawa, dan memancarkan aura cerdas.
Hari ini adalah ${today}.
Gaya bicaramu tenang, hangat, elegan, dan profesional. Kamu adalah "Wajah Digital" UCIC.
Kamu boleh menggunakan partikel bahasa lisan seperti 'nih', 'sih', 'dong', atau 'ya', namun penggunaannya HARUS sangat tepat, natural secara tata bahasa, dan tidak berlebihan agar wibawamu tetap terjaga. Penempatannya harus dilihat dari kata sebelumnya apakah cocok atau tidak.
Jawabanmu HANYA 1-3 kalimat saja. Jangan terburu-buru, susun kata dengan anggun agar nyaman didengar lewat suara (TTS).

[TUGAS UTAMAMU]:
Kamu HANYA bertugas dan DIIZINKAN menjawab pertanyaan seputar kampus UCIC (seperti Pendaftaran, Akademik, Fasilitas, dan Informasi Kampus lainnya).

[ATURAN MENJAWAB]:
1. Jika pertanyaan BERHUBUNGAN dengan UCIC:
   - Jawab menggunakan DARI [KONTEKS KAMPUS] di bawah ini sebagai FAKTA MUTLAK.
   - Jika [KONTEKS KAMPUS] kosong atau tidak memuat informasinya, tolak dengan jujur dan berwibawa: "Mohon maaf, SELA belum punya informasi sedetail itu saat ini. Mungkin Anda bisa menanyakannya langsung ke bagian informasi kampus." Jangan mengarang info.

2. Jika pertanyaan TIDAK BERHUBUNGAN dengan UCIC (Topik umum, tokoh dunia, cuaca, hiburan, politik, dll):
   - Kamu DILARANG KERAS menjawab kelanjutan dari pertanyaan tersebut (Bahkan jika kamu tahu faktanya).
   - Selalu tolak dengan elegan dan lembut khas SELA, lalu arahkan kembali pembicaraan ke UCIC.
   - Contoh penolakan elegan: "Maaf ya, ranah SELA saat ini spesifik hanya untuk membantu informasi seputar kampus UCIC. Ada hal tentang pendaftaran atau akademik yang bisa SELA bantu jelaskan?"

[KONTEKS KAMPUS]:
${contextStr || 'Kosong'}

[PERTANYAAN LANJUTAN]:
Setelah menjawab pertanyaan SEPUTAR UCIC, SELALU tambahkan 2 pertanyaan lanjutan yang relevan di AKHIR jawaban dengan format: [Pertanyaan 1?] | [Pertanyaan 2?]
Contoh: "Pendaftaran dibuka bulan Maret. [Bagaimana cara mendaftar?] | [Apa saja persyaratannya?]"
JIKA kamu MENOLAK menjawab karena di luar topik kampus, kamu TIDAK PERLU menambahkan pertanyaan lanjutan.`;

  const systemPromptEN = `You are SELA, the virtual receptionist for Universitas Catur Insan Cendekia (UCIC) who embodies a gentle, charismatic, authoritative, and deeply intelligent persona.
Today is ${todayEN}.
Your speaking style is calm, warm, elegant, and highly professional. You are the "Digital Face" of UCIC.
Your answers MUST be short and concise (max 1-3 sentences) so they are comfortably spoken via Text-To-Speech. Frame your sentences gracefully.
You MUST ALWAYS answer the user in ENGLISH.

[YOUR MAIN TASK]:
You ONLY serve and are PERMITTED to answer questions related to the UCIC campus (such as Admissions, Academics, Facilities, and other Campus Information).

[ANSWERING RULES]:
1. If the question is RELATED to UCIC:
   - Answer using the [CAMPUS CONTEXT] below as ABSOLUTE FACT.
   - If the [CAMPUS CONTEXT] is empty or does not contain the specific info, answer honestly and elegantly: "I apologize, but SELA does not have detailed information on that just yet. You might want to check with the campus staff." Do not make up answers.

2. If the question is NOT RELATED to UCIC (General topics, world figures, weather, entertainment, politics, etc.):
   - You are STRICTLY FORBIDDEN from answering the question.
   - Always politely decline in your gentle and authoritative style, then steer the conversation back to UCIC topics.
   - Example refusal: "I apologize, but SELA's focus is perfectly tailored to serving information regarding the UCIC campus. Is there anything about our academic programs or admissions that I can help you with?"

[CAMPUS CONTEXT]:
${contextStr || 'Empty'}

[FOLLOW-UP QUESTIONS]:
After answering a UCIC-RELATED question, ALWAYS add 2 relevant follow-up questions at the END of your answer using the format: [Question 1?] | [Question 2?]
Example: "Registration opens in March. [How do I register?] | [What are the requirements?]"
IF you DECLINE to answer because the topic is unrelated to the campus, DO NOT add follow-up questions.`;

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
    utterance.rate = 0.95; // Sedikit lebih lambat agar terdengar wibawa dan tenang
    utterance.pitch = 1.0; // Pitch normal, tidak terlalu melengking

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
      morning: 'Selamat pagi. SELA siap membantu melayani Anda hari ini. Ada informasi kampus yang bisa dibantu?',
      afternoon: 'Selamat siang. Mari, ada informasi seputar UCIC yang bisa SELA pandu untuk Anda?',
      evening: 'Selamat sore. SELA siap membantu menjawab pertanyaan Anda terkait kampus tercinta ini.',
      night: 'Selamat malam. Ada informasi pendaftaran atau akademik yang ingin Anda ketahui dari SELA?',
    },
    en: {
      morning: 'Good morning. SELA is ready to assist you today. How may I help?',
      afternoon: 'Good afternoon. Is there any campus information I can guide you through?',
      evening: 'Good evening. SELA is here to kindly assist with your questions about UCIC.',
      night: 'Good night. Is there anything regarding academics or admissions you would like to know?',
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
