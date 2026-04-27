import Fuse from 'fuse.js';
import dataset from '../data/ucic_dataset.json';
import ragGoldens from '../data/rag_goldens.json';

// ── RAG Setup ────────────────────────────────────────────────────────────────

let fuse = null;
let learnedTypoCache = null;

const EXCLUDED_RAG_CATEGORIES = new Set([]);
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

const QUERY_PHRASE_ALIASES = [
  [/\bkelas karyawan\b/g, 'kelas sore rpl'],
  [/\bbiaya masuk\b/g, 'biaya pendaftaran'],
  [/\bdaftar ulang\b/g, 'registrasi ulang'],
  [/\banak desain\b/g, 'dkv desain komunikasi visual'],
  [/\banak komputer\b/g, 'teknik informatika sistem informasi'],
  [/\bkuliah malam\b/g, 'kelas sore'],
  [/\bwa\b/g, 'whatsapp'],
  [/\bva\b/g, 'virtual account'],
  [/\be wallet\b/g, 'ewallet'],
  [/\bjalur masuk\b/g, 'pendaftaran pmb'],
  [/\borang tua\b/g, 'wali orang tua'],
];

const RAG_STOPWORDS = new Set([
  'apa', 'apakah', 'siapa', 'nama', 'itu', 'ini', 'yang', 'di', 'ke', 'dari',
  'dan', 'atau', 'untuk', 'tentang', 'mengenai', 'dong', 'nih', 'sih', 'ya',
  'min', 'admin', 'sela', 'universitas', 'kampus', 'catur', 'insan',
  'cendekia', 'ucic', 'cic',
  'gimana', 'bagaimana', 'gmn', 'eh', 'sila', 'anu', 'dongg', 'nihh',
  'jadi', 'kayak', 'kaya', 'ituh', 'tuh', 'nihh', 'yaa',
  'what', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 'the', 'of',
  'about', 'please', 'campus', 'university',
]);

const RAG_SYNONYMS = {
  biaya: ['uang', 'bayar', 'pembayaran', 'spp', 'ukt', 'harga', 'cost', 'fee', 'tuition'],
  beasiswa: ['kip', 'bantuan', 'scholarship'],
  daftar: ['pendaftaran', 'pmb', 'registrasi', 'masuk', 'apply', 'admission'],
  dosen: ['pengajar', 'lecturer'],
  fasilitas: ['sarana', 'lab', 'laboratorium', 'perpustakaan', 'facility'],
  fakultas: ['jurusan', 'prodi', 'program', 'studi', 'major'],
  jurusan: ['fakultas', 'prodi', 'program', 'studi', 'major'],
  kontak: ['nomor', 'telepon', 'wa', 'whatsapp', 'email', 'alamat', 'hubungi'],
  kelas: ['jadwal', 'jam', 'pagi', 'sore', 'malam', 'karyawan', 'rpl'],
  lokasi: ['alamat', 'dimana', 'where'],
  orientasi: ['ospek', 'pkkmb', 'maba', 'camaba'],
  pembayaran: ['bayar', 'cicilan', 'transfer', 'virtual', 'account', 'midtrans', 'ovo', 'gopay', 'dana'],
  pendaftaran: ['daftar', 'registrasi', 'pmb', 'masuk', 'jalur'],
  rektor: ['pimpinan', 'ketua', 'pemimpin', 'direktur', 'kepala', 'chancellor', 'rector'],
  syarat: ['persyaratan', 'berkas', 'dokumen', 'requirement', 'requirements'],
  visi: ['misi', 'tujuan'],
};

const TYPO_TOKEN_MAP = {
  dmn: 'dimana',
  dmnnya: 'dimana',
  gmn: 'gimana',
  gmna: 'gimana',
  gimna: 'gimana',
  knp: 'kenapa',
  kpn: 'kapan',
  brp: 'berapa',
  syg: 'sayang',
  daftarin: 'daftar',
  daftarnya: 'daftar',
  daftar2: 'daftar',
  daftaru: 'daftar',
  persaratan: 'persyaratan',
  persyaratn: 'persyaratan',
  persyaratanya: 'persyaratan',
  persyaratannya: 'persyaratan',
  syaratny: 'syarat',
  bayarannya: 'pembayaran',
  bayarnya: 'pembayaran',
  biayanya: 'biaya',
  kuliahnya: 'kuliah',
  kelasnya: 'kelas',
  jadwalnya: 'jadwal',
  jurusannya: 'jurusan',
  prodinya: 'prodi',
  ospeknya: 'ospek',
  orientasinya: 'orientasi',
  kampusnya: 'kampus',
  ewallet: 'ewallet',
  gopaynya: 'gopay',
};

const REFERENTIAL_TOKENS = new Set([
  'itu', 'ituh', 'tadi', 'yang', 'yg', 'nya', 'terus', 'trus', 'lanjut', 'lanjutnya',
  'kalo', 'kalau', 'tersebut', 'begitu', 'gitu', 'gini', 'ini', 'ygitu',
]);

const TOPIC_HINTS = {
  pendaftaran: ['daftar', 'pendaftaran', 'pmb', 'registrasi', 'masuk', 'camaba'],
  syarat: ['syarat', 'persyaratan', 'berkas', 'dokumen', 'upload'],
  biaya: ['biaya', 'bayar', 'pembayaran', 'cicilan', 'spp', 'ukt', 'virtual', 'account', 'ewallet', 'midtrans'],
  kelas: ['kelas', 'jadwal', 'jam', 'pagi', 'sore', 'malam', 'rpl', 'karyawan'],
  jurusan: ['jurusan', 'prodi', 'fakultas', 'informatika', 'si', 'dkv', 'manajemen', 'akuntansi', 'bisnis'],
  kontak: ['kontak', 'whatsapp', 'telepon', 'email', 'alamat', 'hubungi'],
  orientasi: ['ospek', 'orientasi', 'pkkmb', 'maba'],
  beasiswa: ['beasiswa', 'kip', 'bantuan'],
  fasilitas: ['fasilitas', 'lab', 'perpustakaan', 'gedung', 'ruang'],
};

const INTENT_PATTERNS = {
  pendaftaran: ['daftar', 'pendaftaran', 'registrasi', 'pmb', 'masuk kuliah', 'masuk kampus'],
  syarat: ['syarat', 'persyaratan', 'berkas', 'dokumen', 'siapin apa', 'bawa apa'],
  biaya: ['biaya', 'bayar', 'cicilan', 'uang masuk', 'spp', 'ukt', 'mahal'],
  kelas: ['kelas', 'jam', 'jadwal', 'sore', 'malam', 'karyawan', 'rpl'],
  jurusan: ['jurusan', 'prodi', 'fakultas', 'anak komputer', 'anak desain', 'anak bisnis'],
  kontak: ['kontak', 'nomor', 'whatsapp', 'telepon', 'hubungi', 'alamat'],
  orientasi: ['ospek', 'orientasi', 'pkkmb', 'maba'],
  beasiswa: ['beasiswa', 'kip', 'potongan', 'bantuan'],
  fasilitas: ['fasilitas', 'lab', 'perpustakaan', 'wifi', 'gedung'],
};

const AWAM_TOPIC_ALIASES = {
  pendaftaran: ['masuk sini', 'masuk kampus ini', 'jadi mahasiswa sini', 'daftar kuliah', 'cara masuk ucic'],
  syarat: ['harus apa', 'siapin apa', 'bawa apa', 'surat lulus', 'ijazah sementara', 'berkas sekolah'],
  biaya: ['uang masuk', 'bayar awal', 'uang pertama', 'biaya pertama', 'uang daftar'],
  kelas: ['kelas orang kerja', 'kuliah sambil kerja', 'kuliah malam', 'kelas malam', 'kelas pegawai'],
  jurusan: ['anak komputer', 'anak desain', 'anak bisnis', 'bagusan jurusan mana', 'pilih jurusan apa'],
  kontak: ['nomor admin', 'wa kampus', 'hubungi kampus', 'kontak pmb'],
  orientasi: ['ospek maba', 'acara anak baru', 'orientasi anak baru'],
  beasiswa: ['potongan biaya', 'bantuan biaya', 'beasiswa anak pintar'],
  fasilitas: ['gedungnya gimana', 'ada lab ga', 'fasilitas kampus apa aja'],
};

const CANONICAL_REWRITE_MAP = {
  pendaftaran: 'cara pendaftaran mahasiswa baru ucic',
  syarat: 'syarat berkas pendaftaran mahasiswa baru ucic',
  biaya: 'biaya kuliah dan metode pembayaran ucic',
  kelas: 'jadwal kelas sore pagi rpl untuk mahasiswa bekerja ucic',
  jurusan: 'jurusan program studi rekomendasi jurusan ucic',
  kontak: 'kontak admin pmb dan alamat kampus ucic',
  orientasi: 'orientasi mahasiswa baru ospek pkkmb ucic',
  beasiswa: 'program beasiswa dan bantuan biaya ucic',
  fasilitas: 'fasilitas kampus laboratorium perpustakaan ucic',
};

const RAG_FAILURE_LOG_KEY = 'sela_rag_failure_log';
const SESSION_ARCHIVE_KEY = 'sela_session_archive_v1';
const LEARNED_ARTIFACTS_KEY = 'sela_learned_artifacts_v1';
const RAG_EVALUATION_KEY = 'sela_rag_evaluation_v1';
const SESSION_RETENTION_LIMIT = 20;
const SESSION_RETENTION_MS = 1000 * 60 * 60 * 24 * 14;
const SHADOW_REVIEW_MIN_SOURCE_COUNT = 2;

const SLOT_PATTERNS = {
  biaya: {
    pendaftaran: ['pendaftaran', 'daftar', 'uang daftar', 'uang masuk'],
    metode: ['metode', 'transfer', 'virtual account', 'va', 'ovo', 'gopay', 'dana', 'midtrans'],
    cicilan: ['cicilan', 'nyicil', 'bertahap', 'angsuran'],
  },
  kelas: {
    pagi: ['pagi'],
    sore: ['sore', 'malam', 'kelas malam', 'kuliah malam'],
    pekerja: ['kerja', 'karyawan', 'orang kerja', 'pegawai'],
    rpl: ['rpl'],
  },
  jurusan: {
    komputer: ['komputer', 'it', 'programming', 'coding'],
    desain: ['desain', 'dkv', 'gambar', 'visual'],
    bisnis: ['bisnis', 'usaha', 'marketing'],
    olahraga: ['olahraga', 'sport'],
  },
  kontak: {
    pmb: ['pmb', 'daftar', 'admin'],
    umum: ['kampus', 'umum', 'informasi'],
  },
  syarat: {
    dokumen: ['dokumen', 'berkas', 'file', 'upload'],
    identitas: ['ktp', 'kk', 'akta'],
    kelulusan: ['ijazah', 'skl', 'surat lulus'],
  },
};

const DECOMPOSITION_SEPARATORS = [
  /\bterus\b/g,
  /\blalu\b/g,
  /\bhabis itu\b/g,
  /\babis itu\b/g,
  /\bselain itu\b/g,
  /\btrus\b/g,
];

function normalizeText(text = '') {
  let normalized = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const [pattern, replacement] of QUERY_PHRASE_ALIASES) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/([a-z])\1{2,}/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a = '', b = '') {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

function getKnownVocabulary() {
  const vocab = new Set([
    ...Object.keys(RAG_SYNONYMS),
    ...Object.keys(TYPO_TOKEN_MAP),
    ...Object.keys(CANONICAL_REWRITE_MAP),
  ]);
  const intentBank = getIntentSynonymBank();

  for (const values of Object.values(RAG_SYNONYMS)) values.forEach(v => vocab.add(v));
  for (const values of Object.values(TOPIC_HINTS)) values.forEach(v => vocab.add(v));
  for (const values of Object.values(AWAM_TOPIC_ALIASES)) values.forEach(v => normalizeText(v).split(' ').forEach(token => vocab.add(token)));
  for (const values of Object.values(intentBank)) values.forEach(v => normalizeText(v).split(' ').forEach(token => vocab.add(token)));
  for (const groups of Object.values(SLOT_PATTERNS)) {
    Object.values(groups).forEach(values => values.forEach(v => normalizeText(v).split(' ').forEach(token => vocab.add(token))));
  }
  const learnedArtifacts = getLearnedArtifacts();
  Object.values(learnedArtifacts.learned_typo_map || {}).forEach(v => vocab.add(v));
  Object.entries(learnedArtifacts.learned_awam_aliases || {}).forEach(([topic, aliases]) => {
    vocab.add(topic);
    (aliases || []).forEach(alias => normalizeText(alias).split(' ').forEach(token => vocab.add(token)));
  });

  return [...vocab].filter(Boolean);
}

function sanitizeTextForLearning(text = '') {
  return String(text)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(?:\+?\d[\d\s-]{7,}\d)\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim();
}

function createEmptyArtifacts() {
  return {
    learned_typo_map: {},
    learned_awam_aliases: {},
    learned_topic_patterns: {},
    shadow_faq_candidates: [],
    shadow_faq_reviews: {
      approved_topics: {},
      rejected_topics: {},
      last_reviewed_at: null,
    },
    session_stats: {
      total_sessions: 0,
      total_turns: 0,
      farewell_sessions: 0,
      last_session_at: null,
    },
  };
}

function getStoredJson(key, fallback) {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setStoredJson(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getArchivedSessions() {
  return getStoredJson(SESSION_ARCHIVE_KEY, []);
}

function setArchivedSessions(sessions) {
  setStoredJson(SESSION_ARCHIVE_KEY, sessions);
}

function getLearnedArtifacts() {
  return getStoredJson(LEARNED_ARTIFACTS_KEY, createEmptyArtifacts());
}

function setLearnedArtifacts(artifacts) {
  setStoredJson(LEARNED_ARTIFACTS_KEY, artifacts);
}

function getIntentSynonymBank() {
  const learnedArtifacts = getLearnedArtifacts();
  const approvedTopics = learnedArtifacts.shadow_faq_reviews?.approved_topics || {};
  const bank = {};

  for (const intent of new Set([
    ...Object.keys(INTENT_PATTERNS),
    ...Object.keys(TOPIC_HINTS),
    ...Object.keys(AWAM_TOPIC_ALIASES),
    ...Object.keys(learnedArtifacts.learned_awam_aliases || {}),
    ...Object.keys(approvedTopics),
  ])) {
    bank[intent] = mergeUniqueStrings(
      [],
      [
        intent,
        ...(INTENT_PATTERNS[intent] || []),
        ...(TOPIC_HINTS[intent] || []),
        ...(AWAM_TOPIC_ALIASES[intent] || []),
        ...(learnedArtifacts.learned_awam_aliases?.[intent] || []),
        ...(approvedTopics[intent]?.query_forms || []),
      ],
      120,
    ).map(normalizeText).filter(Boolean);
  }

  return bank;
}

function getBaseTokensForLearning(text = '') {
  return normalizeText(text)
    .split(' ')
    .map(token => {
      let normalized = normalizeText(token);
      if (normalized.length > 4) {
        normalized = normalized
          .replace(/(nya|kah|lah|pun)$/g, '')
          .replace(/(ku|mu)$/g, '')
          .trim();
      }
      return TYPO_TOKEN_MAP[normalized] || normalized;
    })
    .filter(token => token.length > 1 && !RAG_STOPWORDS.has(token));
}

function getLearnedTypoMap() {
  if (learnedTypoCache) return learnedTypoCache;
  if (typeof window === 'undefined' || !window.localStorage) return {};

  try {
    const failures = JSON.parse(window.localStorage.getItem(RAG_FAILURE_LOG_KEY) || '[]');
    const tokenCounts = new Map();
    for (const entry of failures) {
      const tokens = getBaseTokensForLearning(entry?.userQuery || '');
      tokens.forEach(token => tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1));
    }

    const knownVocabulary = getKnownVocabulary();
    const learned = {};

    for (const [token, count] of tokenCounts.entries()) {
      if (count < 2 || token.length < 4 || knownVocabulary.includes(token) || TYPO_TOKEN_MAP[token]) continue;

      let bestMatch = null;
      let bestDistance = Infinity;

      for (const vocab of knownVocabulary) {
        if (Math.abs(vocab.length - token.length) > 2) continue;
        const distance = levenshtein(token, vocab);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = vocab;
        }
      }

      if (bestMatch && bestDistance <= 2) learned[token] = bestMatch;
    }

    const persistedTypoMap = getLearnedArtifacts().learned_typo_map || {};
    learnedTypoCache = { ...persistedTypoMap, ...learned };
    return learnedTypoCache;
  } catch {
    return {};
  }
}

function normalizeToken(token = '') {
  let normalized = normalizeText(token);

  if (normalized.length > 4) {
    normalized = normalized
      .replace(/(nya|kah|lah|pun)$/g, '')
      .replace(/(ku|mu)$/g, '')
      .trim();
  }

  normalized = TYPO_TOKEN_MAP[normalized] || normalized;
  normalized = getLearnedTypoMap()[normalized] || normalized;

  return normalized;
}

function getSearchTokens(text = '') {
  const tokens = getBaseSearchTokens(text);

  const expanded = new Set(tokens);
  for (const token of tokens) {
    if (RAG_SYNONYMS[token]) {
      RAG_SYNONYMS[token].forEach(alias => expanded.add(alias));
    }
    for (const [canonical, aliases] of Object.entries(RAG_SYNONYMS)) {
      if (aliases.includes(token)) expanded.add(canonical);
    }
  }

  return [...expanded];
}

function getBaseSearchTokens(text = '') {
  return normalizeText(text)
    .split(' ')
    .map(normalizeToken)
    .filter(token => token.length > 1 && !RAG_STOPWORDS.has(token));
}

function detectTopicHints(text = '') {
  const normalized = normalizeText(text);
  const tokens = getBaseSearchTokens(text);
  const hints = new Set();
  const intentBank = getIntentSynonymBank();

  for (const [topic, aliases] of Object.entries(intentBank)) {
    if (aliases.some(alias => normalized.includes(alias) || tokens.includes(alias))) {
      hints.add(topic);
    }
  }

  return [...hints];
}

function classifyCampusIntent(text = '') {
  const normalized = normalizeText(text);
  const hits = Object.entries(getIntentSynonymBank())
    .map(([intent, patterns]) => ({
      intent,
      score: patterns.reduce((sum, pattern) => (
        sum + (normalized.includes(pattern) ? (pattern.includes(' ') ? 2 : 1) : 0)
      ), 0),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return hits[0]?.intent || null;
}

function resolveSlots(text = '', intent = null) {
  const normalized = normalizeText(text);
  const slotGroups = SLOT_PATTERNS[intent] || {};
  const resolved = {};

  for (const [slotName, patterns] of Object.entries(slotGroups)) {
    if (patterns.some(pattern => normalized.includes(normalizeText(pattern)))) {
      resolved[slotName] = true;
    }
  }

  return resolved;
}

function decomposeUserQuery(userQuery = '', topicState = null) {
  let normalized = userQuery;
  for (const separator of DECOMPOSITION_SEPARATORS) {
    normalized = normalized.replace(separator, ' | ');
  }
  normalized = normalized.replace(/\s+(dan|sama)\s+/g, ' | ');

  const parts = normalized
    .split('|')
    .map(part => part.trim())
    .filter(Boolean);

  const decomposed = (parts.length > 0 ? parts : [userQuery]).map(part => {
    const intent = classifyCampusIntent(part) || topicState?.activeTopic || null;
    return {
      text: part,
      intent,
      slots: resolveSlots(part, intent),
    };
  });

  return decomposed;
}

function mergeUniqueStrings(existing = [], next = [], limit = 25) {
  return [...new Set([...(existing || []), ...(next || [])])]
    .filter(Boolean)
    .slice(-limit);
}

function extractSessionSignals(messages = []) {
  const userMessages = messages.filter(message => message.role === 'user');
  const topicCounts = new Map();
  const typoCandidates = new Map();
  const shadowCandidates = new Map();
  const followupPatterns = [];

  for (let index = 0; index < userMessages.length; index++) {
    const message = userMessages[index];
    const cleanText = sanitizeTextForLearning(message.text || '');
    const topicState = {
      activeTopic: null,
      orderedTopics: [],
    };
    const parts = decomposeUserQuery(cleanText, topicState);
    const intents = [...new Set(parts.map(part => part.intent).filter(Boolean))];

    intents.forEach(intent => topicCounts.set(intent, (topicCounts.get(intent) || 0) + 1));

    const rawTokens = normalizeText(cleanText)
      .split(' ')
      .filter(token => token.length > 2 && !RAG_STOPWORDS.has(token));
    const normalizedTokens = getBaseTokensForLearning(cleanText);
    rawTokens.forEach((token, tokenIndex) => {
      const canonical = normalizedTokens[tokenIndex];
      if (canonical && token !== canonical && !TYPO_TOKEN_MAP[token]) {
        typoCandidates.set(token, canonical);
      }
    });

    intents.forEach(intent => {
      const bucket = shadowCandidates.get(intent) || [];
      bucket.push(cleanText);
      shadowCandidates.set(intent, bucket);
    });

    if (index < userMessages.length - 1) {
      const nextMessage = userMessages[index + 1];
      const nextIntent = classifyCampusIntent(nextMessage.text || '')
        || detectTopicHints(nextMessage.text || '')[0]
        || null;
      const currentIntent = intents[0] || null;
      if (currentIntent && nextIntent) {
        followupPatterns.push({
          topic: currentIntent,
          followup: sanitizeTextForLearning(nextMessage.text || ''),
          nextIntent,
        });
      }
    }
  }

  const dominantTopic = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    dominantTopic,
    topicCounts: Object.fromEntries(topicCounts),
    typoCandidates: Object.fromEntries(typoCandidates),
    shadowCandidates: Object.fromEntries(
      [...shadowCandidates.entries()].map(([topic, queries]) => [topic, queries.slice(0, 5)]),
    ),
    followupPatterns,
  };
}

function getAliasBoostTopics(text = '') {
  const normalized = normalizeText(text);
  const topics = new Set();
  for (const [topic, aliases] of Object.entries(getIntentSynonymBank())) {
    if ((aliases || []).some(alias => normalized.includes(normalizeText(alias)))) topics.add(topic);
  }
  return [...topics];
}

function deriveConversationTopicState(messageHistory = []) {
  const recentUserMessages = [...messageHistory]
    .filter(message => message.role === 'user' && message.content)
    .slice(-4);

  const scores = new Map();
  const orderedTopics = [];
  const learnedPatterns = getLearnedArtifacts().learned_topic_patterns || {};

  for (const message of recentUserMessages) {
    const topics = new Set([
      classifyCampusIntent(message.content),
      ...detectTopicHints(message.content),
      ...getAliasBoostTopics(message.content),
    ].filter(Boolean));

    for (const topic of topics) {
      scores.set(topic, (scores.get(topic) || 0) + 1);
    }
  }

  const latestMessage = recentUserMessages[recentUserMessages.length - 1]?.content || '';
  const latestNormalized = normalizeText(latestMessage);
  for (const [topic, patternData] of Object.entries(learnedPatterns)) {
    if ((patternData?.common_followups || []).some(pattern => latestNormalized.includes(normalizeText(pattern)))) {
      scores.set(topic, (scores.get(topic) || 0) + 2);
    }
  }

  orderedTopics.push(
    ...[...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic)
  );

  return {
    activeTopic: orderedTopics[0] || null,
    orderedTopics,
    recentUserMessages: recentUserMessages.map(message => message.content),
  };
}

function getTokenVariants(token) {
  const variants = new Set([token]);
  if (RAG_SYNONYMS[token]) {
    RAG_SYNONYMS[token].forEach(alias => variants.add(alias));
  }
  for (const [canonical, aliases] of Object.entries(RAG_SYNONYMS)) {
    if (aliases.includes(token)) variants.add(canonical);
  }
  return [...variants];
}

function itemContainsTokenVariant(item, token) {
  const variants = getTokenVariants(token);
  const title = normalizeText(item.title);
  const category = normalizeText(item.category);
  const keywords = (item.keywords || []).map(normalizeText);
  const content = normalizeText(item.content);

  return variants.some(variant => (
    keywords.some(keyword => keyword.includes(variant))
    || title.includes(variant)
    || category.includes(variant)
    || content.includes(variant)
  ));
}

function hasEnoughTokenCoverage(item, baseTokens) {
  if (baseTokens.length === 0) return item.id === 'profil_ucic';
  const matchedCount = baseTokens.filter(token => itemContainsTokenVariant(item, token)).length;
  const requiredMatches = baseTokens.length === 1 ? 1 : Math.min(2, baseTokens.length);
  return matchedCount >= requiredMatches;
}

function scoreDatasetItem(item, tokens, topicHints = []) {
  if (tokens.length === 0) {
    const q = normalizeText(item.title);
    return item.id === 'profil_ucic' || q.includes('profil universitas') ? 1 : 0;
  }

  const title = normalizeText(item.title);
  const category = normalizeText(item.category);
  const keywords = (item.keywords || []).map(normalizeText);
  const content = normalizeText(item.content);
  let score = 0;

  for (const token of tokens) {
    if (keywords.some(keyword => keyword === token)) score += 8;
    if (keywords.some(keyword => keyword.includes(token))) score += 4;
    if (title.split(' ').includes(token)) score += 7;
    else if (title.includes(token)) score += 3;
    if (category === token) score += 3;
    if (content.split(' ').includes(token)) score += 2;
    else if (content.includes(token)) score += 0.5;
  }

  const matchedTokens = tokens.filter(token => (
    keywords.some(keyword => keyword.includes(token))
    || title.includes(token)
    || content.includes(token)
    || category.includes(token)
  ));

  if (tokens.length > 1 && matchedTokens.length > 1) score += matchedTokens.length * 3;

  for (const topic of topicHints) {
    if (
      keywords.some(keyword => keyword.includes(topic))
      || title.includes(topic)
      || category.includes(topic)
      || content.includes(topic)
    ) {
      score += 4;
    }
  }

  return score;
}

function retrieveCampusContext(userQuery, fuseResults = [], topicState = null) {
  const tokens = getSearchTokens(userQuery);
  const baseTokens = getBaseSearchTokens(userQuery);
  const topicHints = [...new Set([
    ...detectTopicHints(userQuery),
    ...getAliasBoostTopics(userQuery),
    ...(topicState?.orderedTopics || []).slice(0, 2),
  ])];
  const intent = classifyCampusIntent(userQuery) || topicState?.activeTopic || null;
  const fuseRank = new Map(fuseResults.map((result, index) => [result.item.id, {
    score: result.score ?? 1,
    rank: index,
  }]));

  const ranked = ragDataset
    .map(item => {
      const lexicalScore = scoreDatasetItem(item, tokens, topicHints);
      const fuseMeta = fuseRank.get(item.id);
      const fuseBoost = fuseMeta ? Math.max(0, 4 - fuseMeta.rank * 0.35) : 0;
      const fuseQualityBoost = fuseMeta ? Math.max(0, 1 - fuseMeta.score) : 0;
      return {
        item,
        score: lexicalScore + fuseBoost + fuseQualityBoost,
        fuseScore: fuseMeta?.score,
      };
    })
    .filter(result => result.score >= 5 && hasEnoughTokenCoverage(result.item, baseTokens))
    .sort((a, b) => b.score - a.score);

  return {
    matches: ranked.slice(0, 5),
    tokens,
    topicHints,
    intent,
  };
}

function getTopicFallbackMatches(intent = null, topicHints = []) {
  const topics = new Set([intent, ...topicHints].filter(Boolean));
  if (topics.size === 0) return [];

  const fallback = ragDataset
    .map(item => ({
      item,
      score: scoreDatasetItem(item, [...topics], [...topics]),
    }))
    .filter(result => result.score >= 6)
    .sort((a, b) => b.score - a.score);

  return fallback.slice(0, 3);
}

function buildCanonicalRewrite(userQuery = '', topicState = null) {
  const decomposed = decomposeUserQuery(userQuery, topicState);
  const rewrites = decomposed.map(part => {
    const detectedTopic = part.intent
      || detectTopicHints(part.text)[0]
      || getAliasBoostTopics(part.text)[0]
      || topicState?.activeTopic
      || null;

    if (!detectedTopic) return '';

    const canonical = CANONICAL_REWRITE_MAP[detectedTopic] || '';
    if (!canonical) return '';

    const slotTokens = Object.keys(part.slots || {}).join(' ');
    const baseTokens = getBaseSearchTokens(part.text);
    const specifics = baseTokens
      .filter(token => !Object.keys(CANONICAL_REWRITE_MAP).includes(token))
      .slice(0, 4)
      .join(' ');

    return `${canonical} ${slotTokens} ${specifics}`.trim();
  }).filter(Boolean);

  return rewrites.join(' ');
}

function buildRetrievalQuery(messageHistory = [], userQuery = '', topicState = null) {
  const latestTokens = getBaseSearchTokens(userQuery);
  const latestNormalized = normalizeText(userQuery);
  const latestTopics = [...new Set([
    ...detectTopicHints(userQuery),
    ...getAliasBoostTopics(userQuery),
    ...(topicState?.orderedTopics || []).slice(0, 2),
  ])];
  const hasReferentialWords = latestNormalized
    .split(' ')
    .some(token => REFERENTIAL_TOKENS.has(token));
  const genericFollowUp = latestTokens.length <= 2 || hasReferentialWords || latestTopics.length === 0;

  const previousUserMessages = [...messageHistory]
    .slice(0, -1)
    .reverse()
    .filter(message => message.role === 'user' && message.content)
    .slice(0, 2);

  if (!genericFollowUp && latestTopics.length > 0) return userQuery;
  if (previousUserMessages.length === 0) return userQuery;

  const previousContext = previousUserMessages
    .map(message => message.content)
    .reverse()
    .join(' ');

  const historyTopics = detectTopicHints(previousContext).filter(topic => !latestTopics.includes(topic));
  const topicSuffix = historyTopics.length > 0 ? ` ${historyTopics.join(' ')}` : '';
  const canonicalRewrite = buildCanonicalRewrite(userQuery, topicState);

  return `${previousContext} ${userQuery} ${canonicalRewrite}${topicSuffix}`.trim();
}

function computeAnswerability(finalMatches = [], userQuery = '', topicState = null) {
  if (finalMatches.length === 0) return { level: 'none', reason: 'no_match' };

  const top = finalMatches[0];
  const score = top.score || 0;
  const detectedTopic = classifyCampusIntent(userQuery) || topicState?.activeTopic;

  if (score >= 18) return { level: 'high', reason: 'strong_match', detectedTopic };
  if (score >= 10) return { level: 'partial', reason: 'medium_match', detectedTopic };
  return { level: 'weak', reason: 'low_confidence', detectedTopic };
}

function buildClarificationHint(answerability, decomposedQueries, topicState) {
  if (answerability.level === 'high') return '';

  const intents = [...new Set(decomposedQueries.map(part => part.intent).filter(Boolean))];
  if (intents.length > 1) {
    return `User tampaknya menanyakan beberapa hal sekaligus: ${intents.join(', ')}. Jika konteks tidak cukup untuk semua bagian, jawab bagian yang jelas terlebih dahulu lalu minta user memilih bagian yang ingin diperjelas.`;
  }

  if (answerability.level === 'partial') {
    return `Jika ada informasi yang hanya terjawab sebagian, berikan jawaban parsial dulu lalu akhiri dengan satu klarifikasi singkat yang spesifik ke topik ${answerability.detectedTopic || topicState?.activeTopic || 'kampus'}.`;
  }

  return `Maksud user masih samar. Ajukan satu pertanyaan klarifikasi yang sangat singkat dan ramah, fokus pada topik ${answerability.detectedTopic || topicState?.activeTopic || 'yang paling mungkin dimaksud'}.`;
}

function buildConfidenceRouting(answerability, decomposedQueries, topicState) {
  const intents = [...new Set(decomposedQueries.map(part => part.intent).filter(Boolean))];
  const primaryTopic = answerability.detectedTopic || topicState?.activeTopic || intents[0] || 'kampus';

  if (answerability.level === 'high') {
    return {
      route: 'answer_direct',
      label: 'tinggi',
      instruction: `Confidence tinggi. Jawab langsung dengan fokus utama pada topik ${primaryTopic}.`,
    };
  }

  if (answerability.level === 'partial') {
    return {
      route: 'answer_then_clarify',
      label: 'sedang',
      instruction: `Confidence sedang. Jawab dulu bagian yang paling jelas dari topik ${primaryTopic}, lalu akhiri dengan satu klarifikasi singkat jika masih ada detail yang belum pasti.`,
    };
  }

  return {
    route: 'clarify_first',
    label: 'rendah',
    instruction: `Confidence rendah. Jangan menebak. Ajukan satu pertanyaan klarifikasi yang pendek, ramah, dan spesifik ke topik ${primaryTopic}.`,
  };
}

function applySessionLearningToArtifacts(artifacts, session) {
  const next = typeof structuredClone !== 'undefined'
    ? structuredClone(artifacts)
    : JSON.parse(JSON.stringify(artifacts));
  const signals = extractSessionSignals(session.messages || []);

  next.session_stats.total_sessions += 1;
  next.session_stats.total_turns += session.turns || 0;
  if (session.ended_by_farewell) next.session_stats.farewell_sessions += 1;
  next.session_stats.last_session_at = session.ended_at;

  Object.entries(signals.typoCandidates || {}).forEach(([token, canonical]) => {
    if (token && canonical && token !== canonical) {
      next.learned_typo_map[token] = canonical;
    }
  });

  Object.entries(signals.shadowCandidates || {}).forEach(([topic, queries]) => {
    next.learned_awam_aliases[topic] = mergeUniqueStrings(next.learned_awam_aliases[topic], queries, 40);

    const patternBucket = next.learned_topic_patterns[topic] || { common_followups: [] };
    patternBucket.common_followups = mergeUniqueStrings(patternBucket.common_followups, queries.slice(0, 3), 20);
    next.learned_topic_patterns[topic] = patternBucket;

    const existingCandidate = next.shadow_faq_candidates.find(candidate => candidate.suggested_topic === topic);
    if (existingCandidate) {
      existingCandidate.query_forms = mergeUniqueStrings(existingCandidate.query_forms, queries, 15);
      existingCandidate.source_count += 1;
      existingCandidate.last_seen_at = session.ended_at;
    } else {
      next.shadow_faq_candidates.push({
        suggested_topic: topic,
        query_forms: [...new Set(queries)].slice(0, 10),
        source_count: 1,
        last_seen_at: session.ended_at,
      });
    }
  });

  for (const pattern of signals.followupPatterns || []) {
    const bucket = next.learned_topic_patterns[pattern.topic] || { common_followups: [] };
    bucket.common_followups = mergeUniqueStrings(bucket.common_followups, [pattern.followup], 25);
    next.learned_topic_patterns[pattern.topic] = bucket;
  }

  next.shadow_faq_candidates = next.shadow_faq_candidates
    .sort((a, b) => (b.source_count || 0) - (a.source_count || 0))
    .slice(0, 50);

  return {
    artifacts: next,
    signals,
  };
}

function pruneArchivedSessions(sessions = []) {
  const now = Date.now();
  return sessions
    .filter(session => {
      const endedAt = new Date(session.ended_at || 0).getTime();
      return endedAt && now - endedAt <= SESSION_RETENTION_MS;
    })
    .slice(-SESSION_RETENTION_LIMIT);
}

export function archiveConversationSession({
  currentChat,
  lang = 'id',
  endedByFarewell = true,
  endReason = endedByFarewell ? 'farewell' : 'session_end',
} = {}) {
  if (!currentChat?.messages?.length || typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  const endedAt = new Date().toISOString();
  const sanitizedMessages = currentChat.messages.map(message => ({
    role: message.role,
    text: sanitizeTextForLearning(message.text || ''),
    ts: message.ts ? new Date(message.ts).toISOString() : null,
  }));

  const session = {
    session_id: currentChat.id || `session_${Date.now()}`,
    started_at: currentChat.createdAt ? new Date(currentChat.createdAt).toISOString() : endedAt,
    ended_at: endedAt,
    lang,
    turns: sanitizedMessages.length,
    messages: sanitizedMessages,
    ended_by_farewell: endedByFarewell,
    end_reason: endReason,
  };

  const sessions = pruneArchivedSessions([...getArchivedSessions(), session]);
  setArchivedSessions(sessions);

  const { artifacts, signals } = applySessionLearningToArtifacts(getLearnedArtifacts(), session);
  setLearnedArtifacts(artifacts);
  learnedTypoCache = null;

  return {
    session,
    dominantTopic: signals.dominantTopic,
    artifacts,
  };
}

function logRetrievalFailure(payload) {
  console.warn('[SELA RAG] Retrieval weakness:', payload);
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const existing = JSON.parse(window.localStorage.getItem(RAG_FAILURE_LOG_KEY) || '[]');
    const next = [...existing, { ...payload, ts: new Date().toISOString() }].slice(-50);
    window.localStorage.setItem(RAG_FAILURE_LOG_KEY, JSON.stringify(next));
    learnedTypoCache = null;
  } catch (error) {
    console.warn('[SELA RAG] Gagal menyimpan log retrieval:', error);
  }
}

function setLatestRetrievalEvaluation(report) {
  setStoredJson(RAG_EVALUATION_KEY, report);
}

export function getLatestRetrievalEvaluation() {
  return getStoredJson(RAG_EVALUATION_KEY, null);
}

async function getFuse() {
  if (fuse) return fuse;
  try {
    fuse = new Fuse(ragDataset, {
      keys: [
        { name: 'title', weight: 0.45 },
        { name: 'keywords', weight: 0.4 },
        { name: 'category', weight: 0.1 },
        { name: 'content', weight: 0.05 },
      ],
      threshold: 0.55,
      ignoreLocation: true,
      includeScore: true,
    });
  } catch (e) {
    console.error('Gagal inisialisasi RAG dataset:', e);
  }
  return fuse;
}

async function resolveRetrievalState(messageHistory = [], userQuery = '') {
  const cappedHistory = messageHistory.slice(-10);
  const topicState = deriveConversationTopicState(cappedHistory);
  const decomposedQueries = decomposeUserQuery(userQuery, topicState);
  const retrievalQuery = buildRetrievalQuery(cappedHistory, userQuery, topicState);
  const canonicalRewrite = buildCanonicalRewrite(userQuery, topicState);
  const f = await getFuse();

  let matches = [];
  let finalMatches = [];
  let topicHints = [];
  let intent = null;
  let ragScore = 1;
  let contextStr = '';
  let mediaResults = [];
  let answerability = { level: 'none', reason: 'no_match', detectedTopic: topicState.activeTopic || null };

  if (f && userQuery) {
    const fuseResults = f.search(retrievalQuery);
    const retrieval = retrieveCampusContext(retrievalQuery, fuseResults, topicState);
    matches = retrieval.matches;
    topicHints = retrieval.topicHints;
    intent = retrieval.intent;
    finalMatches = matches.length > 0 ? matches : getTopicFallbackMatches(intent, topicHints);
    answerability = computeAnswerability(finalMatches, userQuery, topicState);

    if (finalMatches.length > 0) {
      ragScore = finalMatches[0].fuseScore ?? Math.max(0, 1 - (finalMatches[0].score / 20));
      contextStr = finalMatches.slice(0, 4)
        .map(r => `Topik: ${r.item.title}\nKategori: ${r.item.category}\nInfo: ${r.item.content}`)
        .join('\n\n');
      mediaResults = finalMatches
        .flatMap(r => r.item.media || [])
        .filter(m => m?.url);
    }
  }

  return {
    cappedHistory,
    topicState,
    decomposedQueries,
    retrievalQuery,
    canonicalRewrite,
    matches,
    finalMatches,
    topicHints,
    intent,
    ragScore,
    contextStr,
    mediaResults,
    answerability,
    confidenceRouting: buildConfidenceRouting(answerability, decomposedQueries, topicState),
    clarificationHint: buildClarificationHint(answerability, decomposedQueries, topicState),
  };
}

export async function evaluateRetrievalGoldens() {
  const cases = [];
  let passed = 0;

  for (const golden of ragGoldens) {
    const state = await resolveRetrievalState([{ role: 'user', content: golden.query }], golden.query);
    const topIds = state.finalMatches.map(match => match.item.id);
    const retrievedIntents = [...new Set([
      state.intent,
      state.answerability.detectedTopic,
      ...state.topicHints,
      ...state.decomposedQueries.map(part => part.intent),
    ].filter(Boolean))];
    const idHit = (golden.expected_ids || []).some(id => topIds.includes(id));
    const intentHit = (golden.expected_intents || []).some(intentName => retrievedIntents.includes(intentName));
    const ok = idHit || intentHit;

    cases.push({
      id: golden.id,
      query: golden.query,
      ok,
      answerability: state.answerability.level,
      confidence_route: state.confidenceRouting.route,
      expected_ids: golden.expected_ids || [],
      expected_intents: golden.expected_intents || [],
      top_ids: topIds.slice(0, 5),
      retrieved_intents: retrievedIntents,
    });

    if (ok) passed += 1;
  }

  const report = {
    evaluated_at: new Date().toISOString(),
    total: ragGoldens.length,
    passed,
    failed: ragGoldens.length - passed,
    pass_rate: ragGoldens.length > 0 ? Number(((passed / ragGoldens.length) * 100).toFixed(1)) : 0,
    cases,
  };

  setLatestRetrievalEvaluation(report);
  return report;
}

export function getShadowFaqReviewQueue(minSourceCount = SHADOW_REVIEW_MIN_SOURCE_COUNT) {
  const artifacts = getLearnedArtifacts();
  const approvedTopics = artifacts.shadow_faq_reviews?.approved_topics || {};
  const rejectedTopics = artifacts.shadow_faq_reviews?.rejected_topics || {};

  return (artifacts.shadow_faq_candidates || [])
    .filter(candidate => (candidate.source_count || 0) >= minSourceCount)
    .filter(candidate => !approvedTopics[candidate.suggested_topic] && !rejectedTopics[candidate.suggested_topic])
    .sort((a, b) => (b.source_count || 0) - (a.source_count || 0));
}

export function reviewShadowFaqCandidate(topic, action = 'approve') {
  if (!topic) return null;

  const artifacts = getLearnedArtifacts();
  const candidate = (artifacts.shadow_faq_candidates || []).find(item => item.suggested_topic === topic);
  if (!candidate) return null;

  const next = typeof structuredClone !== 'undefined'
    ? structuredClone(artifacts)
    : JSON.parse(JSON.stringify(artifacts));

  next.shadow_faq_reviews = next.shadow_faq_reviews || {
    approved_topics: {},
    rejected_topics: {},
    last_reviewed_at: null,
  };

  if (action === 'approve') {
    next.shadow_faq_reviews.approved_topics[topic] = {
      ...candidate,
      reviewed_at: new Date().toISOString(),
    };
    delete next.shadow_faq_reviews.rejected_topics[topic];
    next.learned_awam_aliases[topic] = mergeUniqueStrings(
      next.learned_awam_aliases[topic],
      candidate.query_forms || [],
      60,
    );
  } else {
    next.shadow_faq_reviews.rejected_topics[topic] = {
      topic,
      reviewed_at: new Date().toISOString(),
    };
    delete next.shadow_faq_reviews.approved_topics[topic];
  }

  next.shadow_faq_reviews.last_reviewed_at = new Date().toISOString();
  setLearnedArtifacts(next);
  learnedTypoCache = null;

  return next.shadow_faq_reviews;
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
  const userQuery = messageHistory.length > 0
    ? messageHistory[messageHistory.length - 1].content
    : '';
  const retrievalState = await resolveRetrievalState(messageHistory, userQuery);
  const {
    cappedHistory,
    topicState,
    decomposedQueries,
    retrievalQuery,
    canonicalRewrite,
    matches,
    finalMatches,
    topicHints,
    intent,
    ragScore,
    contextStr,
    mediaResults,
    answerability,
    confidenceRouting,
    clarificationHint,
  } = retrievalState;

  // Auto-detect bahasa dari query user — override lang kalau deteksi yakin
  const autoLang = detectLang(userQuery);
  const effectiveLang = autoLang || lang;
  if (autoLang && autoLang !== lang) {
    console.log(`[SELA Lang] Auto-detect: "${autoLang}" (prop: "${lang}")`);
  }
  console.log('RAG Retrieval State:', {
    query: userQuery,
    retrievalQuery,
    canonicalRewrite,
    answerability: answerability.level,
    route: confidenceRouting.route,
    intent,
    topicHints,
    topicState,
    matches: matches.map(r => ({
      id: r.item.id,
      score: Number(r.score.toFixed(2)),
      fuseScore: r.fuseScore,
    })),
  });

  if (matches.length === 0 && finalMatches.length > 0) {
    console.log('RAG Fallback activated with topic-based matches:', finalMatches.map(r => r.item.id));
  }

  if (finalMatches.length === 0) {
    console.log('RAG no relevant context found for query:', userQuery);
  }

  if (answerability.level === 'none' || answerability.level === 'weak') {
    logRetrievalFailure({
      userQuery,
      retrievalQuery,
      canonicalRewrite,
      topicState,
      decomposedQueries,
      answerability,
      confidenceRouting,
      topMatches: finalMatches.map(match => ({
        id: match.item.id,
        title: match.item.title,
        score: Number((match.score || 0).toFixed(2)),
      })),
    });
  }

  // 2. System prompt bilingual + konteks RAG
  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const todayEN = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const systemPromptID = `Kamu adalah SELA, wujud Customer Service virtual Universitas Catur Insan Cendekia (UCIC) yang berkarakter lembut, karismatik, berwibawa, dan memancarkan aura cerdas.
Hari ini adalah ${today}.
Gaya bicaramu tenang, hangat, elegan, dan profesional. Kamu adalah "Wajah Digital" UCIC.
Kamu boleh menggunakan partikel bahasa lisan seperti 'nih', 'sih', 'dong', atau 'ya', namun penggunaannya HARUS sangat tepat, natural secara tata bahasa, dan tidak berlebihan agar wibawamu tetap terjaga. Penempatannya harus dilihat dari kata sebelumnya apakah cocok atau tidak.
Jawabanmu HANYA 1-3 kalimat saja. Jangan terburu-buru, susun kata dengan anggun agar nyaman didengar lewat suara (TTS).

[TUGAS UTAMAMU]:
Kamu HANYA bertugas dan DIIZINKAN menjawab pertanyaan seputar kampus UCIC (seperti Pendaftaran, Akademik, Fasilitas, dan Informasi Kampus lainnya).

[ATURAN MENJAWAB]:
1. Jika pertanyaan BERHUBUNGAN dengan UCIC:
   - Jawab menggunakan DARI [KONTEKS KAMPUS] di bawah ini sebagai FAKTA MUTLAK.
   - Jika [KONTEKS KAMPUS] memuat informasi yang ditanyakan, WAJIB jawab berdasarkan konteks tersebut. Jangan mengatakan belum punya informasi kalau jawabannya ada di konteks.
   - Jika pertanyaan user masih samar seperti "yang itu", "terus gimana", atau "berapa yang tadi", gunakan konteks percakapan terakhir dan jawab bagian yang paling mungkin dimaksud user dengan tetap hati-hati.
   - Jika konteks yang ada hanya menjawab sebagian, berikan jawaban parsial yang membantu. Jangan langsung menolak kalau masih ada bagian yang bisa dijawab dari konteks.
   - Jika [KONTEKS KAMPUS] kosong atau benar-benar tidak memuat informasinya, tolak dengan jujur dan berwibawa: "Mohon maaf, SELA belum punya informasi sedetail itu saat ini. Mungkin Anda bisa menanyakannya langsung ke bagian informasi kampus." Jangan mengarang info.

2. Jika pertanyaan TIDAK BERHUBUNGAN dengan UCIC (Topik umum, tokoh dunia, cuaca, hiburan, politik, dll):
   - Kamu DILARANG KERAS menjawab kelanjutan dari pertanyaan tersebut (Bahkan jika kamu tahu faktanya).
   - Selalu tolak dengan elegan dan lembut khas SELA, lalu arahkan kembali pembicaraan ke UCIC.
   - Contoh penolakan elegan: "Maaf ya, ranah SELA saat ini spesifik hanya untuk membantu informasi seputar kampus UCIC. Ada hal tentang pendaftaran atau akademik yang bisa SELA bantu jelaskan?"

3. ANTI-NOISE (ABAIKAN OBROLAN ACAK):
   - Jika kalimat dari user sangat pendek, tidak memiliki makna yang jelas, atau terdengar seperti potongan obrolan orang yang sedang lewat (contoh: "eh", "iya", "halo", "oh gitu", "lagi apa", "makan yuk"), JANGAN dijawab.
   - Kamu HANYA boleh membalas dengan SATU KATA ini: [IGNORE_NOISE]
   - Jangan tambahkan teks apa pun selain [IGNORE_NOISE] jika mendeteksi obrolan acak.

[KONTEKS KAMPUS]:
${contextStr || 'Kosong'}

[ARAH KLARIFIKASI]:
${clarificationHint || 'Kosong'}

[ROUTING KEPERCAYAAN]:
${confidenceRouting.instruction}

[PERTANYAAN LANJUTAN]:
Setelah menjawab pertanyaan SEPUTAR UCIC, SELALU berikan 2 saran pertanyaan lanjutan yang BISA DITANYAKAN OLEH USER.
Saran ini HARUS DITULIS DARI SUDUT PANDANG USER (seolah-olah user yang sedang bertanya), BUKAN AI yang bertanya kepada user.
Gunakan format di AKHIR jawaban: [Pertanyaan 1?] | [Pertanyaan 2?]
Contoh: "Pendaftaran dibuka bulan Maret. [Bagaimana cara mendaftar ke UCIC?] | [Apa saja syarat pendaftarannya?]"
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
   - If the [CAMPUS CONTEXT] contains the requested information, you MUST answer from that context. Do not say the information is unavailable when it exists in the context.
   - If the user's wording is vague, such as "that one", "then how", or "how much for that", use the recent conversation context and answer the most likely intended topic carefully.
   - If the context only answers part of the request, still provide the helpful partial answer instead of declining immediately.
   - If the [CAMPUS CONTEXT] is empty or truly does not contain the specific info, answer honestly and elegantly: "I apologize, but SELA does not have detailed information on that just yet. You might want to check with the campus staff." Do not make up answers.

2. If the question is NOT RELATED to UCIC (General topics, world figures, weather, entertainment, politics, etc.):
   - You are STRICTLY FORBIDDEN from answering the question.
   - Always politely decline in your gentle and authoritative style, then steer the conversation back to UCIC topics.
   - Example refusal: "I apologize, but SELA's focus is perfectly tailored to serving information regarding the UCIC campus. Is there anything about our academic programs or admissions that I can help you with?"

3. ANTI-NOISE (IGNORE RANDOM CHATTER):
   - If the user's sentence is very short, meaningless, or sounds like fragmented background chatter of passersby (e.g., "uh", "yeah", "hello", "oh really", "what's up", "let's eat"), DO NOT answer it.
   - You MUST ONLY reply with this EXACT WORD: [IGNORE_NOISE]
   - Do not add any other text besides [IGNORE_NOISE] if you detect random chatter.

[CAMPUS CONTEXT]:
${contextStr || 'Empty'}

[CLARIFICATION DIRECTION]:
${clarificationHint || 'Empty'}

[CONFIDENCE ROUTING]:
${confidenceRouting.instruction}

[FOLLOW-UP QUESTIONS]:
After answering a UCIC-RELATED question, ALWAYS add 2 relevant follow-up questions at the END of your answer that the USER CAN ASK NEXT.
These suggestions MUST BE WRITTEN FROM THE USER'S PERSPECTIVE (as if the user is asking), NOT as the AI asking the user.
Use the format: [Question 1?] | [Question 2?]
Example: "Registration opens in March. [How do I apply to UCIC?] | [What are the admission requirements?]"
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

  // Cek IGNORE_NOISE sebelum parsing, agar tidak muncul sebagai suggestion
  if (text?.trim().includes('[IGNORE_NOISE]')) {
    return {
      text: '[IGNORE_NOISE]',
      suggestions: [],
      media: [],
      detectedLang: effectiveLang,
    };
  }

  // Parse follow-up suggestions from response
  const { text: cleanText, suggestions } = parseSuggestions(text || '');

  return {
    text: cleanText || 'Maaf, SELA agak bingung. Bisa diulang?',
    suggestions,
    media: mediaResults,
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
