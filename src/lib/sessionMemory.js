const STORAGE_KEY = "sela_active_session_memory";
const MAX_PROMPT_TURNS = 24;
const MAX_RELEVANT_PROMPT_TURNS = 8;
const MAX_RELEVANT_MEMORY_ITEMS = 6;
const SESSION_SUMMARY_EVERY_TURNS = 8;
const MAX_ATTENTION_STACK = 16;
const DATASET_CATEGORIES = [
  "pendaftaran",
  "biaya",
  "jurusan",
  "kurikulum",
  "fasilitas",
  "akademik",
  "profil",
  "dosen",
  "jadwal",
  "kontak",
  "lokasi",
  "kegiatan",
  "karir",
  "beasiswa",
  "akreditasi",
  "visi_misi",
  "nilai",
];
const SESSION_END_PATTERNS = [
  /\b(terima kasih|terimakasih|makasih|thanks|thank you)\b/i,
  /\b(sudah cukup|cukup dulu|selesai|sampai jumpa|dadah|bye)\b/i,
];

const CATEGORY_KEYWORDS = [
  {
    category: "pendaftaran",
    keywords: ["daftar", "pendaftaran", "pmb", "registrasi", "daftar ulang", "syarat", "berkas"],
  },
  {
    category: "biaya",
    keywords: ["biaya", "bayar", "pembayaran", "spp", "ukt", "uang", "tagihan", "cicilan"],
  },
  {
    category: "jurusan",
    keywords: ["jurusan", "prodi", "program studi", "fakultas", "rekomendasi", "saran", "cocok", "minat"],
  },
  {
    category: "kurikulum",
    keywords: ["kurikulum", "mata kuliah", "matkul", "semester", "peminatan"],
  },
  {
    category: "fasilitas",
    keywords: ["fasilitas", "lab", "laboratorium", "perpustakaan", "parkir", "ibadah", "sarpras"],
  },
  {
    category: "akademik",
    keywords: ["krs", "sks", "uts", "uas", "ujian", "cuti", "absen", "kehadiran", "wisuda", "yudisium"],
  },
  {
    category: "profil",
    keywords: ["profil", "rektor", "sejarah", "logo", "yayasan", "pimpinan", "ucic itu"],
  },
  {
    category: "dosen",
    keywords: ["dosen", "pengajar"],
  },
  {
    category: "jadwal",
    keywords: ["jadwal", "kelas sore", "kelas pekerja", "rpl"],
  },
  {
    category: "kontak",
    keywords: ["kontak", "nomor", "whatsapp", "wa", "admin", "hubungi"],
  },
  {
    category: "lokasi",
    keywords: ["lokasi", "alamat", "kampus dimana", "letak"],
  },
  {
    category: "kegiatan",
    keywords: ["ukm", "organisasi", "hmp", "ospek", "kegiatan"],
  },
  {
    category: "karir",
    keywords: ["prospek", "karir", "kerja", "lulusan", "career"],
  },
  {
    category: "beasiswa",
    keywords: ["beasiswa", "kip", "bantuan"],
  },
  {
    category: "akreditasi",
    keywords: ["akreditasi", "ban pt"],
  },
  {
    category: "visi_misi",
    keywords: ["visi", "misi", "tujuan"],
  },
  {
    category: "nilai",
    keywords: ["great", "nilai budaya", "commitment", "integrity", "caring"],
  },
];

const PROGRAM_ALIASES = [
  {
    name: "S1 Teknik Informatika",
    aliases: ["s1 teknik informatika", "teknik informatika", "informatika", "ti", "ilmu komputer"],
  },
  {
    name: "S1 Sistem Informasi",
    aliases: ["s1 sistem informasi", "sistem informasi", "si"],
  },
  {
    name: "S1 Desain Komunikasi Visual",
    aliases: ["s1 desain komunikasi visual", "desain komunikasi visual", "dkv", "desain"],
  },
  {
    name: "S1 Bisnis Digital",
    aliases: ["s1 bisnis digital", "bisnis digital", "bisnis online"],
  },
  {
    name: "S1 Manajemen",
    aliases: ["s1 manajemen", "manajemen"],
  },
  {
    name: "S1 Akuntansi",
    aliases: ["s1 akuntansi", "akuntansi"],
  },
  {
    name: "S1 Pendidikan Kepelatihan Olahraga",
    aliases: ["s1 pendidikan kepelatihan olahraga", "pendidikan kepelatihan olahraga", "kepelatihan olahraga", "olahraga"],
  },
  {
    name: "D3 Manajemen Informatika",
    aliases: ["d3 manajemen informatika", "manajemen informatika", "d3 mi"],
  },
  {
    name: "D3 Manajemen Bisnis",
    aliases: ["d3 manajemen bisnis", "manajemen bisnis"],
  },
];

const INTEREST_ALIASES = [
  ["coding", "coding"],
  ["programming", "coding"],
  ["pemrograman", "coding"],
  ["aplikasi", "coding"],
  ["website", "coding"],
  ["ai", "ai"],
  ["data", "data"],
  ["komputer", "teknologi"],
  ["teknologi", "teknologi"],
  ["game", "gaming"],
  ["gaming", "gaming"],
  ["pro gaming", "gaming"],
  ["esport", "gaming"],
  ["desain", "desain"],
  ["konten", "konten"],
  ["foto", "konten"],
  ["video", "konten"],
  ["bisnis", "bisnis"],
  ["jualan", "bisnis"],
  ["marketing", "marketing"],
  ["akuntansi", "keuangan"],
  ["keuangan", "keuangan"],
  ["pajak", "keuangan"],
  ["olahraga", "olahraga"],
  ["atlet", "olahraga"],
  ["pelatih", "olahraga"],
];

const TOPIC_ENTITY_KEYWORDS = [
  {
    type: "campus_service",
    category: "fasilitas",
    keywords: [
      "perpustakaan",
      "laboratorium",
      "lab komputer",
      "lab ai",
      "ruang kelas",
      "parkir",
      "mushola",
      "auditorium",
      "wifi",
      "ict",
      "podcast",
      "student business corner",
    ],
  },
  {
    type: "pmb_service",
    category: "pendaftaran",
    keywords: ["pmb", "daftar online", "registrasi", "upload berkas", "daftar ulang"],
  },
  {
    type: "academic_service",
    category: "akademik",
    keywords: [
      "baak",
      "krs",
      "siakad",
      "skripsi",
      "tugas akhir",
      "sidang",
      "yudisium",
      "wisuda",
      "cuti",
      "pindah kelas",
      "legalisir",
      "ijazah",
      "transkrip",
    ],
  },
  {
    type: "student_activity",
    category: "kegiatan",
    keywords: ["ukm", "hmp", "organisasi", "sekber", "futsal", "basket", "karate", "musik"],
  },
  {
    type: "contact_channel",
    category: "kontak",
    keywords: ["whatsapp pmb", "admin pmb", "instagram", "website pmb", "nomor pmb"],
  },
  {
    type: "campus_location",
    category: "lokasi",
    keywords: ["kampus 1", "kampus 2", "kesambi", "cirebon"],
  },
  {
    type: "financial_topic",
    category: "biaya",
    keywords: ["pendaftaran", "perlengkapan", "dpp", "uang gedung", "cicilan", "early bird"],
  },
  {
    type: "institution_topic",
    category: "profil",
    keywords: ["rektor", "yayasan", "sejarah", "logo", "universitas catur insan cendekia"],
  },
  {
    type: "scholarship_topic",
    category: "beasiswa",
    keywords: ["beasiswa", "kip", "bantuan biaya", "potongan"],
  },
  {
    type: "accreditation_topic",
    category: "akreditasi",
    keywords: ["akreditasi", "baik sekali", "ban pt"],
  },
];

function nowIso() {
  return new Date().toISOString();
}

function createSessionId() {
  return `sela_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeText(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function includesAny(text = "", keywords = []) {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function tokenize(text = "") {
  return unique(
    normalizeText(text)
      .toLowerCase()
      .split(/[^a-z0-9\u00c0-\u024f]+/i)
      .filter((word) => word.length >= 3 && !["yang", "dan", "atau", "apa", "aja", "ucic"].includes(word)),
  );
}

function countKeywordHits(text = "", queryTokens = []) {
  const lower = normalizeText(text).toLowerCase();
  return queryTokens.filter((token) => lower.includes(token)).length;
}

function detectCategory(text = "", fallback = null) {
  const lower = text.toLowerCase();
  if (/(biaya|bayar|pembayaran|spp|ukt|tagihan|cicilan)/.test(lower)) {
    return "biaya";
  }
  const found = CATEGORY_KEYWORDS.find(({ keywords }) =>
    keywords.some((keyword) => lower.includes(keyword)),
  );
  return found?.category || fallback || null;
}

function detectSubCategory(text = "", category = null, role = "user") {
  const lower = text.toLowerCase();

  if (category === "jurusan") {
    if (/(selain itu|alternatif|saran lain|lainnya)/.test(lower)) {
      return "ask_alternative";
    }
    if (/(bedanya|perbedaan|banding|compare)/.test(lower)) {
      return "program_comparison";
    }
    if (/(rekomendasi|saran|cocok|minat|bingung pilih)/.test(lower)) {
      return role === "sela" ? "program_recommendation" : "interest_discovery";
    }
    return "program_detail";
  }

  if (category === "pendaftaran") {
    if (/(syarat|berkas)/.test(lower)) return "requirements";
    if (/(jadwal|gelombang|kapan)/.test(lower)) return "pmb_schedule";
    return "registration_steps";
  }

  if (category === "biaya") {
    if (/(cara bayar|pembayaran|transfer|va|virtual account|cicilan)/.test(lower)) {
      return "payment_method";
    }
    if (extractPrograms(text).length) return "fee_by_program";
    return "tuition_fee";
  }

  return category ? `${category}_info` : null;
}

function detectDiscourseIntent(text = "") {
  const lower = normalizeText(text).toLowerCase();
  if (!lower) return null;
  if (/(ulang|ulangi|nggak dengar|gak dengar|nggak denger|gak denger|repeat)/.test(lower)) {
    return "ask_repeat";
  }
  if (/(tadi.*saran|saranin apa|rekomendasi.*tadi|rekomendasi.*sebelumnya|jurusan.*tadi)/.test(lower)) {
    return "ask_previous_recommendation";
  }
  if (/(selain itu|alternatif|saran lain|yang lain)/.test(lower)) {
    return "ask_alternative";
  }
  if (/(detail|jelasin lagi|lebih jelas|lebih lengkap)/.test(lower)) {
    return "ask_detail";
  }
  if (/(bedanya|perbedaan|banding)/.test(lower)) {
    return "ask_compare";
  }
  if (/(biaya|bayar|pembayaran)/.test(lower)) {
    return "ask_cost";
  }
  if (/(syarat|berkas)/.test(lower)) {
    return "ask_requirement";
  }
  if (/(link|qr|scan)/.test(lower)) {
    return "ask_link";
  }
  if (/(bukan|maksud saya|maksudnya)/.test(lower)) {
    return "correction";
  }
  return null;
}

function extractPrograms(text = "") {
  const lower = text.toLowerCase();
  return PROGRAM_ALIASES.filter((program) =>
    program.aliases.some((alias) => {
      if (alias.length <= 2) return new RegExp(`\\b${alias}\\b`).test(lower);
      return lower.includes(alias);
    }),
  ).map((program) => program.name);
}

function extractInterests(text = "") {
  const lower = text.toLowerCase();
  return unique(
    INTEREST_ALIASES.filter(([keyword]) => lower.includes(keyword)).map(
      ([, tag]) => tag,
    ),
  );
}

function extractTopicEntities(text = "", category = null) {
  const lower = text.toLowerCase();
  const matches = [];

  for (const group of TOPIC_ENTITY_KEYWORDS) {
    if (category && group.category !== category) continue;
    for (const keyword of group.keywords) {
      if (lower.includes(keyword)) {
        matches.push({
          type: group.type,
          category: group.category,
          value: keyword,
        });
      }
    }
  }

  return matches;
}

function getQueryMemorySignals(text = "") {
  const category = detectCategory(text);
  return {
    category,
    subCategory: detectSubCategory(text, category, "user"),
    programs: extractPrograms(text),
    interests: extractInterests(text),
    topicEntities: extractTopicEntities(text, category),
    documents: extractDocuments(text),
    tokens: tokenize(text),
    recallIntent: detectMemoryRecallIntent(text),
  };
}

function pushMention(stack = [], mention) {
  if (!mention?.value) return stack;
  const next = [
    mention,
    ...stack.filter(
      (item) => item.type !== mention.type || item.value !== mention.value,
    ),
  ];
  return next.slice(0, 12);
}

function pushAttention(stack = [], item) {
  if (!item?.value) return stack;
  const nextItem = {
    ...item,
    confidence: item.confidence ?? 0.7,
  };
  const next = [
    nextItem,
    ...stack.filter(
      (entry) => entry.type !== nextItem.type || entry.value !== nextItem.value,
    ),
  ];
  return next.slice(0, MAX_ATTENTION_STACK);
}

function normalizeDatasetCategory(category = null) {
  return DATASET_CATEGORIES.includes(category) ? category : null;
}

function inferUserGoal(category = null, subCategory = null, text = "") {
  const lower = text.toLowerCase();
  if (category === "pendaftaran") return "mencari panduan pendaftaran";
  if (category === "biaya") return "memahami biaya dan pembayaran";
  if (category === "jurusan") return "memilih atau memahami program studi";
  if (category === "fasilitas") return "mengetahui fasilitas kampus";
  if (category === "akademik") return "memahami layanan atau aturan akademik";
  if (category === "kontak") return "mencari kontak layanan UCIC";
  if (category === "lokasi") return "mencari lokasi kampus";
  if (category === "beasiswa") return "mencari informasi beasiswa";
  if (category === "karir") return "memahami prospek karir";
  if (/daftar|pmb|registrasi/.test(lower)) return "mencari panduan pendaftaran";
  return subCategory ? `membahas ${subCategory}` : category ? `membahas ${category}` : null;
}

function detectPendingQuestion(text = "", role = "sela") {
  if (role !== "sela") return null;
  const clean = normalizeText(text);
  if (!clean.includes("?")) return null;
  const question = clean
    .split(/(?<=\?)\s+/)
    .find((part) => part.includes("?"));
  return question ? summarizeAnswer(question) : null;
}

function extractDocuments(text = "") {
  const lower = text.toLowerCase();
  const docs = [
    ["ktp", "KTP"],
    ["kartu keluarga", "Kartu Keluarga"],
    ["kk", "Kartu Keluarga"],
    ["akta", "Akta kelahiran"],
    ["ijazah", "Ijazah"],
    ["skl", "SKL"],
    ["pas foto", "Pas foto"],
    ["foto", "Pas foto"],
    ["transkrip", "Transkrip"],
  ];
  return unique(docs.filter(([keyword]) => lower.includes(keyword)).map(([, label]) => label));
}

function buildDatasetReference({ category, subCategory, programs = [], topics = [], turn }) {
  const normalizedCategory = normalizeDatasetCategory(category);
  if (!normalizedCategory) return null;
  return {
    category: normalizedCategory,
    subCategory: subCategory || null,
    programs,
    topics: topics.map((topic) => topic.value || topic),
    sourceHint: `${normalizedCategory}${subCategory ? `/${subCategory}` : ""}`,
    turn,
  };
}

function getEntityBucket(topicType = "") {
  if (topicType === "campus_service") return "facilities";
  if (topicType === "pmb_service") return "services";
  if (topicType === "academic_service") return "academicServices";
  if (topicType === "student_activity") return "services";
  if (topicType === "contact_channel") return "contactChannels";
  if (topicType === "campus_location") return "places";
  if (topicType === "financial_topic") return "financialTopics";
  if (topicType === "scholarship_topic") return "scholarships";
  if (topicType === "accreditation_topic") return "accreditations";
  return "services";
}

function buildSessionSummary(memory = {}) {
  const wm = memory.workingMemory || {};
  const categories = Object.values(wm.categoryMemory || {})
    .sort((a, b) => (a.lastTurn || 0) - (b.lastTurn || 0))
    .map((item) => {
      const topics = item.topics?.length ? ` (${item.topics.slice(-3).join(", ")})` : "";
      return `${item.category}${topics}`;
    });
  const goals = (wm.goals || [])
    .slice(-4)
    .map((goal) => goal.goal)
    .join(", ");
  const answered = (wm.answeredQuestions || [])
    .slice(-3)
    .map((item) => item.question)
    .filter(Boolean)
    .join(" | ");
  const last = wm.lastUserQuestion ? `Pertanyaan terakhir user: ${wm.lastUserQuestion}` : "";
  return [
    categories.length ? `Topik yang sempat dibahas: ${categories.join(" -> ")}.` : "",
    goals ? `Kebutuhan/tujuan user: ${goals}.` : "",
    answered ? `Yang sudah dijawab: ${answered}.` : "",
    last,
  ]
    .filter(Boolean)
    .join(" ");
}

export function shouldEndSession(text = "") {
  const clean = normalizeText(text);
  return SESSION_END_PATTERNS.some((pattern) => pattern.test(clean));
}

function buildDefaultWorkingMemory() {
  return {
    sessionSummary: "",
    activeState: {
      category: null,
      subTopic: null,
      entity: null,
      entityType: null,
      userGoal: null,
      pendingQuestion: null,
      confidence: 0,
      updatedAtTurn: null,
    },
    activeTopic: null,
    activeCategory: null,
    activeSubCategory: null,
    lastUserQuestion: null,
    lastSelaAnswer: null,
    lastSelaSpokenText: null,
    lastAssistantTurn: null,
    lastLinks: [],
    lastIntent: null,
    lastScreenMode: null,
    userInterests: [],
    userProfile: {
      interests: [],
      goals: [],
      constraints: [],
      preferences: [],
    },
    attention: {
      currentFocus: null,
      activeProgram: null,
      activeNeed: null,
      unresolvedQuestion: null,
    },
    entities: {
      programs: [],
      interests: [],
      topics: [],
      links: [],
      people: [],
      places: [],
      documents: [],
    },
    entityMemory: {
      programs: [],
      facilities: [],
      services: [],
      academicServices: [],
      documents: [],
      places: [],
      contactChannels: [],
      financialTopics: [],
      scholarships: [],
      accreditations: [],
      links: [],
    },
    recommendations: {
      programs: [],
    },
    categoryMemory: {},
    topicHistory: [],
    episodicMemory: [],
    goals: [],
    pendingClarification: null,
    answeredQuestions: [],
    mentionStack: [],
    attentionStack: [],
    datasetReferences: [],
    unresolvedReferences: [],
    visualContext: {
      lastScreenTitle: null,
      lastScreenItems: [],
      lastQrLinks: [],
    },
    speechState: {
      lastSpokenText: null,
      lastSpokenAt: null,
      lastTtsChunks: null,
    },
    corrections: [],
    referenceResolution: null,
  };
}

function upsertGoal(workingMemory, nextGoal) {
  const current = workingMemory.goals || [];
  const existingIndex = current.findIndex((goal) => goal.goal === nextGoal.goal);
  if (existingIndex >= 0) {
    workingMemory.goals = current.map((goal, index) =>
      index === existingIndex ? { ...goal, ...nextGoal } : goal,
    );
    return;
  }
  workingMemory.goals = [...current, nextGoal].slice(-8);
}

function upsertRecommendedProgram(workingMemory, recommendation) {
  const current = workingMemory.recommendations?.programs || [];
  const existingIndex = current.findIndex(
    (item) => item.name === recommendation.name,
  );

  const nextRecommendation = {
    name: recommendation.name,
    priority: recommendation.priority || "alternative",
    reason: recommendation.reason || "",
    sourceTurn: recommendation.sourceTurn,
  };

  if (existingIndex >= 0) {
    workingMemory.recommendations.programs = current.map((item, index) =>
      index === existingIndex
        ? {
            ...item,
            ...nextRecommendation,
            priority:
              item.priority === "primary"
                ? "primary"
                : nextRecommendation.priority,
          }
        : item,
    );
    return;
  }

  workingMemory.recommendations.programs = [
    ...current,
    nextRecommendation,
  ].slice(-8);
}

function buildRecommendationReason(workingMemory, answerText = "") {
  const interests = workingMemory.userProfile?.interests || [];
  if (interests.length) {
    return `berdasarkan minat user: ${interests.join(", ")}`;
  }
  const clean = normalizeText(answerText);
  return clean.length > 120 ? `${clean.slice(0, 117).trim()}...` : clean;
}

function resolveReference(text = "", workingMemory = {}) {
  const lower = normalizeText(text).toLowerCase();
  const hasReference =
    /\b(tadi|sebelumnya|yang itu|itu tadi|yang tadi|barusan|satunya)\b/.test(
      lower,
    );

  if (!hasReference) return null;

  const latestProgram =
    workingMemory.mentionStack?.find((item) => item.type === "program") ||
    null;
  const latestTopic =
    workingMemory.mentionStack?.find(
      (item) =>
        !["program", "interest", "category"].includes(item.type),
    ) || null;
  const latestCategory =
    workingMemory.mentionStack?.find((item) => item.type === "category") ||
    null;
  const latestAttention = workingMemory.attentionStack?.[0] || null;

  const resolvedTo =
    latestProgram?.value ||
    workingMemory.attention?.activeProgram ||
    latestTopic?.value ||
    latestAttention?.value ||
    latestCategory?.value ||
    workingMemory.activeCategory ||
    null;

  if (!resolvedTo) {
    return {
      phrase: "rujukan ambigu",
      resolvedTo: null,
      confidence: 0.2,
    };
  }

  return {
    phrase: "tadi/sebelumnya/yang itu",
    resolvedTo,
    resolvedType: latestProgram?.type || latestTopic?.type || latestAttention?.type || latestCategory?.type || "category",
    category: latestProgram ? "jurusan" : latestTopic?.category || latestAttention?.category || latestCategory?.value || workingMemory.activeCategory || null,
    sourceTurn: latestProgram?.turn || latestTopic?.turn || latestAttention?.turn || latestCategory?.turn || null,
    confidence: latestProgram ? 0.86 : latestTopic ? 0.78 : latestAttention?.confidence || 0.68,
  };
}

function getTurnLabel(turn) {
  if (turn.role === "sela") return "SELA";
  if (turn.role === "user") return "User";
  return turn.role || "unknown";
}

function summarizeAnswer(text = "") {
  const clean = normalizeText(text);
  if (clean.length <= 220) return clean;
  return `${clean.slice(0, 217).trim()}...`;
}

function summarizeTopic(text = "") {
  const clean = normalizeText(text);
  if (clean.length <= 90) return clean;
  return `${clean.slice(0, 87).trim()}...`;
}

function extractLinksFromScreen(screen = null) {
  if (!screen?.links?.length) return [];
  return screen.links
    .map((link) => {
      if (typeof link === "string") return { label: "Link", url: link };
      if (!link?.url) return null;
      return { label: link.label || "Link", url: link.url };
    })
    .filter(Boolean);
}

export function createSessionMemory({
  lang = "id",
  greetingText = "",
  startedAt = nowIso(),
} = {}) {
  const memory = {
    sessionId: createSessionId(),
    startedAt,
    endedAt: null,
    lang,
    turns: [],
    workingMemory: buildDefaultWorkingMemory(),
  };

  if (greetingText) {
    return appendSessionTurn(memory, {
      role: "sela",
      type: "auto_greeting",
      text: greetingText,
      spokenText: greetingText,
      time: startedAt,
    });
  }

  return memory;
}

export function finalizeSessionMemory(
  memory,
  { endedAt = nowIso(), endReason = "session_end" } = {},
) {
  if (!memory) return memory;
  const workingMemory = {
    ...buildDefaultWorkingMemory(),
    ...(memory.workingMemory || {}),
  };
  workingMemory.sessionSummary = buildSessionSummary({
    ...memory,
    workingMemory,
  });
  return {
    ...memory,
    endedAt,
    endReason,
    workingMemory,
  };
}

export function appendSessionTurn(memory, turn = {}) {
  if (!memory) return memory;

  const nextTurnNumber = memory.turns.length + 1;
  const text = normalizeText(turn.text);
  const extractedPrograms = unique([
    ...extractPrograms(text),
    ...(turn.screen?.items || []).flatMap((item) => extractPrograms(item)),
  ]);
  const extractedInterests = extractInterests(text);
  const category =
    turn.category ||
    normalizeDatasetCategory(turn.intent) ||
    detectCategory(text, turn.intent);
  const topicEntities = extractTopicEntities(text, category);
  const extractedDocuments = extractDocuments(text);
  const subCategory =
    turn.subCategory || detectSubCategory(text, category, turn.role);
  const discourseIntent =
    turn.memoryIntent || detectDiscourseIntent(text) || subCategory;
  const nextTurn = {
    turn: nextTurnNumber,
    time: turn.time || nowIso(),
    role: turn.role || "unknown",
    type: turn.type || "message",
    text,
  };

  if (turn.spokenText) nextTurn.spokenText = normalizeText(turn.spokenText);
  if (turn.intent) nextTurn.intent = turn.intent;
  if (turn.counselorMode) nextTurn.counselorMode = turn.counselorMode;
  if (category) nextTurn.category = category;
  if (subCategory) nextTurn.subCategory = subCategory;
  if (discourseIntent) nextTurn.memoryIntent = discourseIntent;
  if (
    extractedPrograms.length ||
    extractedInterests.length ||
    topicEntities.length ||
    extractedDocuments.length
  ) {
    nextTurn.extractedEntities = {
      programs: extractedPrograms,
      interests: extractedInterests,
      topics: topicEntities.map((topic) => topic.value),
      documents: extractedDocuments,
    };
  }
  if (turn.screen?.mode) nextTurn.screenMode = turn.screen.mode;
  const links = extractLinksFromScreen(turn.screen);
  if (links.length) nextTurn.links = links;

  const workingMemory = {
    ...buildDefaultWorkingMemory(),
    ...memory.workingMemory,
    userProfile: {
      ...buildDefaultWorkingMemory().userProfile,
      ...(memory.workingMemory?.userProfile || {}),
    },
    attention: {
      ...buildDefaultWorkingMemory().attention,
      ...(memory.workingMemory?.attention || {}),
    },
    entities: {
      ...buildDefaultWorkingMemory().entities,
      ...(memory.workingMemory?.entities || {}),
    },
    entityMemory: {
      ...buildDefaultWorkingMemory().entityMemory,
      ...(memory.workingMemory?.entityMemory || {}),
    },
    recommendations: {
      ...buildDefaultWorkingMemory().recommendations,
      ...(memory.workingMemory?.recommendations || {}),
    },
    categoryMemory: {
      ...buildDefaultWorkingMemory().categoryMemory,
      ...(memory.workingMemory?.categoryMemory || {}),
    },
    activeState: {
      ...buildDefaultWorkingMemory().activeState,
      ...(memory.workingMemory?.activeState || {}),
    },
    visualContext: {
      ...buildDefaultWorkingMemory().visualContext,
      ...(memory.workingMemory?.visualContext || {}),
    },
    speechState: {
      ...buildDefaultWorkingMemory().speechState,
      ...(memory.workingMemory?.speechState || {}),
    },
  };

  if (nextTurn.role === "user") {
    workingMemory.lastUserQuestion = nextTurn.text;
    workingMemory.userInterests = unique([
      ...(workingMemory.userInterests || []),
      ...extractedInterests,
    ]);
    workingMemory.userProfile.interests = unique([
      ...(workingMemory.userProfile.interests || []),
      ...extractedInterests,
    ]);
    if (category === "jurusan" || extractedInterests.length) {
      workingMemory.attention.currentFocus = "memilih jurusan";
      workingMemory.attention.activeNeed =
        discourseIntent === "ask_alternative"
          ? "mencari alternatif jurusan"
          : "rekomendasi berdasarkan minat";
      upsertGoal(workingMemory, {
        goal: "mencari jurusan yang cocok",
        status: "in_progress",
        evidenceTurn: nextTurn.turn,
      });
    }
    if (category && category !== "jurusan") {
      workingMemory.attention.currentFocus = category;
      workingMemory.attention.activeNeed = subCategory || `${category}_info`;
      upsertGoal(workingMemory, {
        goal: `membahas ${category}`,
        status: "in_progress",
        evidenceTurn: nextTurn.turn,
      });
    }
    const inferredGoal = inferUserGoal(category, subCategory, nextTurn.text);
    if (inferredGoal) {
      workingMemory.userProfile.goals = unique([
        ...(workingMemory.userProfile.goals || []),
        inferredGoal,
      ]).slice(-8);
    }
    if (discourseIntent === "correction") {
      workingMemory.corrections = [
        ...workingMemory.corrections,
        {
          text: nextTurn.text,
          turn: nextTurn.turn,
          time: nextTurn.time,
        },
      ].slice(-8);
    }
  }

  if (nextTurn.role === "sela") {
    workingMemory.lastSelaAnswer = nextTurn.text;
    workingMemory.lastSelaSpokenText = nextTurn.spokenText || nextTurn.text;
    workingMemory.lastAssistantTurn = nextTurn.turn;
    workingMemory.lastIntent = nextTurn.intent || workingMemory.lastIntent;
    workingMemory.lastScreenMode =
      nextTurn.screenMode || workingMemory.lastScreenMode;
    if (nextTurn.links?.length) workingMemory.lastLinks = nextTurn.links;
    if (nextTurn.spokenText || nextTurn.text) {
      workingMemory.speechState = {
        ...workingMemory.speechState,
        lastSpokenText: nextTurn.spokenText || nextTurn.text,
        lastSpokenAt: nextTurn.time,
      };
    }
    if (category === "jurusan" || extractedPrograms.length) {
      const priority =
        discourseIntent === "ask_alternative" ||
        /selain|alternatif/i.test(nextTurn.text)
          ? "alternative"
          : workingMemory.recommendations.programs?.length
            ? "alternative"
            : "primary";
      for (const program of extractedPrograms) {
        upsertRecommendedProgram(workingMemory, {
          name: program,
          priority,
          reason: buildRecommendationReason(workingMemory, nextTurn.text),
          sourceTurn: nextTurn.turn,
        });
      }
      if (extractedPrograms[0]) {
        workingMemory.attention.activeProgram = extractedPrograms[0];
      }
    }
    if (/\b(minat|tertarik|cita-cita|bidang)\b/i.test(nextTurn.text)) {
      workingMemory.pendingClarification = {
        question: nextTurn.text,
        options: ["komputer/coding", "desain/konten", "bisnis", "keuangan", "olahraga"],
        askedAtTurn: nextTurn.turn,
      };
    }
    const pendingQuestion = detectPendingQuestion(nextTurn.text, nextTurn.role);
    if (pendingQuestion) {
      workingMemory.activeState.pendingQuestion = pendingQuestion;
      workingMemory.pendingClarification = {
        ...(workingMemory.pendingClarification || {}),
        question: pendingQuestion,
        askedAtTurn: nextTurn.turn,
      };
    }
    if (nextTurn.type === "answer") {
      workingMemory.answeredQuestions = [
        ...workingMemory.answeredQuestions,
        {
          question: workingMemory.lastUserQuestion,
          answerSummary: summarizeAnswer(nextTurn.text),
          turn: nextTurn.turn,
        },
      ].slice(-10);
    }
  }

  if (category) {
    workingMemory.activeCategory = category;
    workingMemory.activeTopic = category;
    const topicValues = topicEntities.map((topic) => topic.value);
    const previousCategoryMemory = workingMemory.categoryMemory?.[category] || {};
    workingMemory.categoryMemory = {
      ...(workingMemory.categoryMemory || {}),
      [category]: {
        category,
        subCategory: subCategory || previousCategoryMemory.subCategory || null,
        lastUserQuestion:
          nextTurn.role === "user"
            ? nextTurn.text
            : previousCategoryMemory.lastUserQuestion || null,
        lastSelaAnswer:
          nextTurn.role === "sela"
            ? summarizeAnswer(nextTurn.text)
            : previousCategoryMemory.lastSelaAnswer || null,
        lastTurn: nextTurn.turn,
        lastTouchedAt: nextTurn.time,
        topics: unique([...(previousCategoryMemory.topics || []), ...topicValues]).slice(-10),
        links:
          links.length
            ? links
            : previousCategoryMemory.links || [],
      },
    };
    workingMemory.topicHistory = [
      {
        category,
        subCategory: subCategory || null,
        summary: summarizeTopic(text),
        role: nextTurn.role,
        turn: nextTurn.turn,
        time: nextTurn.time,
      },
      ...(workingMemory.topicHistory || []),
    ].slice(0, 16);
    const datasetReference = buildDatasetReference({
      category,
      subCategory,
      programs: extractedPrograms,
      topics: topicEntities,
      turn: nextTurn.turn,
    });
    if (datasetReference) {
      workingMemory.datasetReferences = [
        datasetReference,
        ...(workingMemory.datasetReferences || []).filter(
          (item) =>
            item.category !== datasetReference.category ||
            item.subCategory !== datasetReference.subCategory ||
            item.turn !== datasetReference.turn,
        ),
      ].slice(0, 18);
    }
  }
  if (subCategory) workingMemory.activeSubCategory = subCategory;
  if (turn.intent) {
    workingMemory.activeTopic = turn.intent;
    if (!workingMemory.activeCategory) {
      workingMemory.activeCategory = detectCategory(turn.intent);
    }
  }
  if (extractedPrograms.length) {
    workingMemory.entities.programs = unique([
      ...(workingMemory.entities.programs || []),
      ...extractedPrograms,
    ]);
    for (const program of extractedPrograms) {
      workingMemory.mentionStack = pushMention(workingMemory.mentionStack, {
        type: "program",
        value: program,
        turn: nextTurn.turn,
        time: nextTurn.time,
      });
      workingMemory.attentionStack = pushAttention(workingMemory.attentionStack, {
        type: "program",
        category: "jurusan",
        value: program,
        turn: nextTurn.turn,
        time: nextTurn.time,
        confidence: 0.9,
      });
    }
    workingMemory.entityMemory.programs = unique([
      ...(workingMemory.entityMemory.programs || []),
      ...extractedPrograms,
    ]).slice(-16);
  }
  if (extractedInterests.length) {
    workingMemory.entities.interests = unique([
      ...(workingMemory.entities.interests || []),
      ...extractedInterests,
    ]);
    for (const interest of extractedInterests) {
      workingMemory.mentionStack = pushMention(workingMemory.mentionStack, {
        type: "interest",
        value: interest,
        turn: nextTurn.turn,
        time: nextTurn.time,
      });
      workingMemory.attentionStack = pushAttention(workingMemory.attentionStack, {
        type: "interest",
        value: interest,
        turn: nextTurn.turn,
        time: nextTurn.time,
        confidence: 0.78,
      });
    }
  }
  if (topicEntities.length) {
    workingMemory.entities.topics = unique([
      ...(workingMemory.entities.topics || []),
      ...topicEntities.map((topic) => `${topic.category}:${topic.value}`),
    ]).slice(-30);
    for (const topic of topicEntities) {
      const bucket = getEntityBucket(topic.type);
      workingMemory.mentionStack = pushMention(workingMemory.mentionStack, {
        type: topic.type,
        category: topic.category,
        value: topic.value,
        turn: nextTurn.turn,
        time: nextTurn.time,
      });
      workingMemory.attentionStack = pushAttention(workingMemory.attentionStack, {
        type: topic.type,
        category: topic.category,
        value: topic.value,
        turn: nextTurn.turn,
        time: nextTurn.time,
        confidence: 0.84,
      });
      workingMemory.entityMemory[bucket] = unique([
        ...(workingMemory.entityMemory[bucket] || []),
        topic.value,
      ]).slice(-16);
    }
  }
  if (extractedDocuments.length) {
    workingMemory.entities.documents = unique([
      ...(workingMemory.entities.documents || []),
      ...extractedDocuments,
    ]).slice(-20);
    workingMemory.entityMemory.documents = unique([
      ...(workingMemory.entityMemory.documents || []),
      ...extractedDocuments,
    ]).slice(-20);
    for (const document of extractedDocuments) {
      workingMemory.attentionStack = pushAttention(workingMemory.attentionStack, {
        type: "document",
        category: category || "pendaftaran",
        value: document,
        turn: nextTurn.turn,
        time: nextTurn.time,
        confidence: 0.82,
      });
    }
  }
  if (category) {
    workingMemory.mentionStack = pushMention(workingMemory.mentionStack, {
      type: "category",
      value: category,
      turn: nextTurn.turn,
      time: nextTurn.time,
    });
    workingMemory.attentionStack = pushAttention(workingMemory.attentionStack, {
      type: "category",
      value: category,
      turn: nextTurn.turn,
      time: nextTurn.time,
      confidence: topicEntities.length || extractedPrograms.length ? 0.82 : 0.66,
    });
  }
  if (links.length) {
    workingMemory.entities.links = unique([
      ...(workingMemory.entities.links || []),
      ...links.map((link) => link.url),
    ]);
    workingMemory.visualContext.lastQrLinks = links;
    workingMemory.entityMemory.links = unique([
      ...(workingMemory.entityMemory.links || []),
      ...links.map((link) => link.url),
    ]).slice(-12);
  }
  if (turn.screen) {
    workingMemory.visualContext = {
      ...workingMemory.visualContext,
      lastScreenTitle: turn.screen.title || workingMemory.visualContext.lastScreenTitle,
      lastScreenItems: turn.screen.items || workingMemory.visualContext.lastScreenItems,
    };
  }
  workingMemory.referenceResolution = resolveReference(nextTurn.text, workingMemory);
  if (
    workingMemory.referenceResolution?.resolvedTo === null ||
    (workingMemory.referenceResolution?.confidence || 1) < 0.5
  ) {
    workingMemory.unresolvedReferences = [
      {
        text: nextTurn.text,
        turn: nextTurn.turn,
        time: nextTurn.time,
        reason: workingMemory.referenceResolution?.phrase || "rujukan ambigu",
      },
      ...(workingMemory.unresolvedReferences || []),
    ].slice(0, 10);
  }

  const topAttention = workingMemory.attentionStack?.[0] || null;
  workingMemory.activeState = {
    ...workingMemory.activeState,
    category: category || workingMemory.activeState.category || workingMemory.activeCategory || null,
    subTopic: subCategory || workingMemory.activeState.subTopic || null,
    entity:
      topAttention?.value ||
      extractedPrograms[0] ||
      topicEntities[0]?.value ||
      extractedDocuments[0] ||
      workingMemory.activeState.entity ||
      null,
    entityType: topAttention?.type || workingMemory.activeState.entityType || null,
    userGoal:
      inferUserGoal(category, subCategory, nextTurn.text) ||
      workingMemory.activeState.userGoal ||
      null,
    confidence:
      workingMemory.referenceResolution?.confidence ||
      topAttention?.confidence ||
      (category ? 0.66 : workingMemory.activeState.confidence || 0),
    updatedAtTurn: nextTurn.turn,
  };

  workingMemory.episodicMemory = [
    {
      turn: nextTurn.turn,
      time: nextTurn.time,
      actor: nextTurn.role,
      event:
        nextTurn.role === "user"
          ? `User membahas ${category || "topik umum"}`
          : `SELA menjawab ${category || workingMemory.activeCategory || "topik umum"}`,
      category: category || null,
      subCategory: subCategory || null,
      entities: {
        programs: extractedPrograms,
        topics: topicEntities.map((topic) => topic.value),
        documents: extractedDocuments,
      },
      summary: summarizeTopic(nextTurn.text),
    },
    ...(workingMemory.episodicMemory || []),
  ].slice(0, 20);

  if (nextTurn.turn % SESSION_SUMMARY_EVERY_TURNS === 0 || nextTurn.role === "sela") {
    workingMemory.sessionSummary = buildSessionSummary({
      ...memory,
      turns: [...memory.turns, nextTurn],
      workingMemory,
    });
  }

  return {
    ...memory,
    turns: [...memory.turns, nextTurn],
    workingMemory,
  };
}

export function clearSessionMemory(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem?.(STORAGE_KEY);
  } catch {
    // sessionStorage can be unavailable in restricted contexts.
  }
}

export function saveSessionMemory(
  memory,
  storage = globalThis.sessionStorage,
) {
  if (!memory) return;
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Ignore quota/private-mode failures; in-memory ref still works.
  }
}

export function loadSessionMemory(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.sessionId || !Array.isArray(parsed.turns)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function detectMemoryRecallIntent(text = "") {
  const lower = normalizeText(text).toLowerCase();
  if (!lower) return null;

  if (/\b(link|qr|barcode|scan)\b/.test(lower)) return "last_link";
  if (
    /(tadi.*saran|saranin apa|rekomendasi.*tadi|rekomendasi.*sebelumnya|jurusan.*tadi|kamu saranin apa)/.test(
      lower,
    )
  ) {
    return "previous_recommendation";
  }
  if (
    /\b(ulang|ulangi|repeat|nggak dengar|gak dengar|nggak denger|gak denger|tidak dengar|belum dengar)\b/.test(
      lower,
    )
  ) {
    return "repeat_last_answer";
  }
  if (/\b(sebelumnya|tadi|barusan|yang itu|itu tadi|yang tadi)\b/.test(lower)) {
    return "previous_context";
  }
  if (/^(detailnya|jelasin lagi|lebih detail|terus gimana)/.test(lower)) {
    return "previous_context";
  }

  return null;
}

export function buildDirectRecallResponse(memory, text = "") {
  const intent = detectMemoryRecallIntent(text);
  if (!intent || !memory?.workingMemory) return null;

  const wm = memory.workingMemory;

  if (intent === "previous_recommendation") {
    const programs = wm.recommendations?.programs || [];
    if (!programs.length) return null;
    const programLines = programs
      .map((program, index) => {
        const priority =
          program.priority === "primary" ? "rekomendasi utama" : "alternatif";
        return `${index + 1}. ${program.name} (${priority})`;
      })
      .join("\n");
    const spokenPrograms = programs
      .map((program) => {
        const priority =
          program.priority === "primary" ? "utama" : "alternatif";
        return `${program.name} sebagai ${priority}`;
      })
      .join(", ");

    return {
      text: `Yang tadi SELA sarankan:\n${programLines}`,
      spokenText: `Yang tadi SELA sarankan adalah ${spokenPrograms}.`,
      screen: {
        mode: "recommend",
        title: "Rekomendasi Sebelumnya",
        items: programs.map((program) => `${program.name}: ${program.reason}`),
        links: [],
      },
      suggestions: ["Apa bedanya jurusan itu?", "Berapa biaya jurusan itu?"],
      media: [],
      detectedLang: "id",
      debug: {
        chatProvider: "session_memory",
        counselorMode: "program_recommendation",
        nextAction: "suggest_followup",
        displayMode: "recommend",
        intent: "jurusan",
      },
    };
  }

  if (intent === "last_link") {
    if (!wm.lastLinks?.length) return null;
    const linksText = wm.lastLinks
      .map((link, index) => `${index + 1}. ${link.label}: ${link.url}`)
      .join("\n");
    return {
      text: `Ini link yang tadi SELA tampilkan:\n${linksText}`,
      spokenText: "Ini link yang tadi SELA tampilkan. Silakan scan QR atau buka link di layar.",
      screen: {
        mode: "handoff",
        title: "Link Sebelumnya",
        items: wm.lastLinks.map((link) => link.label),
        links: wm.lastLinks,
      },
      suggestions: ["Bisa ulangi penjelasannya?", "Apa langkah berikutnya?"],
      media: [],
      detectedLang: "id",
      debug: {
        chatProvider: "session_memory",
        counselorMode: "answer_only",
        nextAction: "none",
        displayMode: "brief",
        intent: wm.lastIntent || null,
      },
    };
  }

  if (intent === "repeat_last_answer" && wm.lastSelaSpokenText) {
    const repeatText = wm.lastSelaAnswer || wm.lastSelaSpokenText;
    return {
      text: `Baik, SELA ulangi ya.\n${repeatText}`,
      spokenText: `Baik, SELA ulangi ya. ${wm.lastSelaSpokenText}`,
      suggestions: ["Bisa jelaskan lebih detail?", "Apa langkah berikutnya?"],
      media: [],
      detectedLang: "id",
      debug: {
        chatProvider: "session_memory",
        counselorMode: "answer_only",
        nextAction: "none",
        displayMode: "brief",
        intent: wm.lastIntent || null,
      },
    };
  }

  if (intent === "previous_context") {
    if (wm.referenceResolution && (wm.referenceResolution.confidence || 0) < 0.5) {
      return {
        text: "Maksudnya yang tadi tentang bagian apa ya? Pendaftaran, biaya, fasilitas, akademik, atau kontak?",
        spokenText:
          "Maksudnya yang tadi tentang bagian apa ya? Pendaftaran, biaya, fasilitas, akademik, atau kontak?",
        suggestions: ["Pendaftaran", "Biaya", "Fasilitas"],
        media: [],
        detectedLang: "id",
        debug: {
          chatProvider: "session_memory",
          counselorMode: "answer_only",
          nextAction: "ask_clarification",
          displayMode: "brief",
          intent: wm.activeCategory || wm.lastIntent || null,
        },
      };
    }
    const latestTopic = wm.topicHistory?.[0] || null;
    const latestCategory =
      latestTopic?.category || wm.referenceResolution?.category || wm.activeCategory;
    const categoryMemory = latestCategory
      ? wm.categoryMemory?.[latestCategory]
      : null;

    if (!latestTopic && !categoryMemory && !wm.lastSelaAnswer) return null;

    const title = latestCategory
      ? `Konteks ${latestCategory}`
      : "Konteks Sebelumnya";
    const answerSummary =
      categoryMemory?.lastSelaAnswer ||
      latestTopic?.summary ||
      wm.lastSelaAnswer ||
      "";
    const topicList = categoryMemory?.topics?.length
      ? categoryMemory.topics
      : latestTopic?.summary
        ? [latestTopic.summary]
        : [];

    return {
      text: `Yang tadi sedang dibahas adalah ${latestCategory || "topik sebelumnya"}.\n${answerSummary}`,
      spokenText: `Yang tadi sedang dibahas adalah ${latestCategory || "topik sebelumnya"}. ${answerSummary}`,
      screen: {
        mode: latestCategory === "pendaftaran" ? "steps" : "brief",
        title,
        items: topicList,
        links: categoryMemory?.links || [],
      },
      suggestions: ["Bisa jelaskan lebih detail?", "Apa langkah berikutnya?"],
      media: [],
      detectedLang: "id",
      debug: {
        chatProvider: "session_memory",
        counselorMode: "answer_only",
        nextAction: "suggest_followup",
        displayMode: "brief",
        intent: latestCategory || wm.lastIntent || null,
      },
    };
  }

  return null;
}

export function resolveSessionMemoryQuery(text = "", memory = null) {
  const clean = normalizeText(text);
  const lower = clean.toLowerCase();
  const wm = memory?.workingMemory;
  if (!wm) {
    return {
      query: clean,
      resolution: null,
    };
  }

  const mentionedPrograms = extractPrograms(clean);
  if (mentionedPrograms.length) {
    return {
      query: clean,
      resolution: {
        phrase: "program disebut eksplisit",
        resolvedTo: mentionedPrograms[0],
        confidence: 1,
      },
    };
  }

  const hasReference =
    /\b(yang itu|itu|tadi|sebelumnya|barusan|satunya)\b/.test(lower);
  if (!hasReference) {
    return {
      query: clean,
      resolution: null,
    };
  }

  const activeCategory =
    wm.referenceResolution?.category ||
    wm.activeCategory ||
    wm.topicHistory?.[0]?.category ||
    null;
  const activeTopicEntity =
    wm.referenceResolution?.resolvedType &&
    wm.referenceResolution.resolvedType !== "category" &&
    wm.referenceResolution.resolvedType !== "program" &&
    (!activeCategory || wm.referenceResolution.category === activeCategory)
      ? wm.referenceResolution.resolvedTo
      : wm.mentionStack?.find(
          (item) =>
            !["program", "interest", "category"].includes(item.type) &&
            (!activeCategory || item.category === activeCategory),
        )?.value || null;
  const activeProgram =
    wm.referenceResolution?.resolvedTo &&
    extractPrograms(wm.referenceResolution.resolvedTo).length
      ? wm.referenceResolution.resolvedTo
      : wm.attention?.activeProgram ||
        wm.mentionStack?.find((item) => item.type === "program")?.value ||
        wm.recommendations?.programs?.[0]?.name ||
        null;

  let topic = "";
  if (includesAny(lower, ["biaya", "bayar", "pembayaran"])) topic = "biaya";
  else if (includesAny(lower, ["syarat", "berkas"])) topic = "syarat";
  else if (includesAny(lower, ["kurikulum", "mata kuliah", "semester"])) {
    topic = "kurikulum";
  } else if (includesAny(lower, ["prospek", "kerja", "karir"])) {
    topic = "prospek kerja";
  } else if (includesAny(lower, ["syarat", "ketentuan", "aturan"])) {
    topic = "syarat";
  } else if (includesAny(lower, ["alur", "cara", "langkah"])) {
    topic = activeCategory === "pendaftaran" ? "alur pendaftaran" : "alur";
  } else if (includesAny(lower, ["jam", "jadwal", "kapan"])) {
    topic = "jadwal";
  } else if (includesAny(lower, ["lokasi", "alamat", "dimana"])) {
    topic = "lokasi";
  } else if (includesAny(lower, ["kontak", "nomor", "wa", "whatsapp"])) {
    topic = "kontak";
  } else if (includesAny(lower, ["fasilitas", "lab", "perpustakaan"])) {
    topic = "fasilitas";
  } else if (includesAny(lower, ["akreditasi"])) {
    topic = "akreditasi";
  } else if (includesAny(lower, ["beasiswa", "kip", "bantuan"])) {
    topic = "beasiswa";
  } else if (includesAny(lower, ["bedanya", "perbedaan"])) {
    const programs = wm.recommendations?.programs?.map((item) => item.name) || [];
    if (programs.length >= 2) {
      return {
        query: `perbedaan ${programs.slice(0, 2).join(" dan ")} UCIC`,
        resolution: {
          phrase: "perbandingan rekomendasi sebelumnya",
          resolvedTo: programs.slice(0, 2).join(" vs "),
          confidence: 0.88,
        },
      };
    }
  }

  const programScopedTopic =
    activeProgram &&
    ["biaya", "syarat", "kurikulum", "prospek kerja", "akreditasi"].includes(topic);

  if (!topic && activeProgram) {
    return {
      query: clean,
      resolution: {
        phrase: "rujukan program",
        resolvedTo: activeProgram,
        confidence: 0.72,
      },
    };
  }

  if (!topic && (activeTopicEntity || activeCategory)) {
    return {
      query: `${activeTopicEntity || activeCategory} UCIC`,
      resolution: {
        phrase: "rujukan topik/kategori",
        resolvedTo: activeTopicEntity || activeCategory,
        category: activeCategory,
        confidence: activeTopicEntity ? 0.8 : 0.68,
        rewrittenFrom: clean,
      },
    };
  }

  if (!topic) {
    return {
      query: clean,
      resolution: {
        phrase: "rujukan ambigu",
        resolvedTo: null,
        confidence: 0.2,
      },
    };
  }

  return {
    query: programScopedTopic
      ? `${topic} ${activeProgram} UCIC`
      : `${topic} ${activeTopicEntity || activeCategory || activeProgram || ""} UCIC`.replace(/\s+/g, " ").trim(),
    resolution: {
      phrase: "yang itu/tadi",
      resolvedTo: programScopedTopic
        ? activeProgram
        : activeTopicEntity || activeCategory || activeProgram,
      category: programScopedTopic ? "jurusan" : activeCategory,
      confidence: programScopedTopic || activeTopicEntity ? 0.86 : 0.72,
      rewrittenFrom: clean,
    },
  };
}

function scoreByCategory(itemCategory, signals, activeCategory = null) {
  if (!itemCategory) return 0;
  if (signals.category && itemCategory === signals.category) return 5;
  if (activeCategory && itemCategory === activeCategory) return 2;
  if (signals.recallIntent && itemCategory === activeCategory) return 2;
  return 0;
}

function scoreByEntities(text = "", signals) {
  const clean = normalizeText(text);
  let score = countKeywordHits(clean, signals.tokens);
  for (const program of signals.programs) {
    if (clean.includes(program)) score += 4;
  }
  for (const topic of signals.topicEntities) {
    if (clean.toLowerCase().includes(topic.value)) score += 4;
  }
  for (const document of signals.documents) {
    if (clean.toLowerCase().includes(document.toLowerCase())) score += 3;
  }
  for (const interest of signals.interests) {
    if (clean.toLowerCase().includes(interest)) score += 2;
  }
  return score;
}

function scoreRecency(turn = 0, latestTurn = 0) {
  if (!turn || !latestTurn) return 0;
  const distance = Math.max(0, latestTurn - turn);
  if (distance <= 2) return 4;
  if (distance <= 5) return 2;
  if (distance <= 10) return 1;
  return 0;
}

function topScored(items = [], scoreFn, limit = MAX_RELEVANT_MEMORY_ITEMS) {
  return items
    .map((item) => ({ item, score: scoreFn(item) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function selectRelevantSessionMemory(memory, latestUserText = "") {
  const wm = memory?.workingMemory || {};
  const signals = getQueryMemorySignals(latestUserText);
  const latestTurn = memory?.turns?.length || 0;
  const activeCategory =
    signals.category ||
    wm.activeState?.category ||
    wm.referenceResolution?.category ||
    wm.activeCategory ||
    null;

  const relevantTurns = topScored(
    memory?.turns || [],
    (turn) =>
      scoreByCategory(turn.category || turn.intent, signals, activeCategory) +
      scoreByEntities(turn.text, signals) +
      scoreRecency(turn.turn, latestTurn) +
      (signals.recallIntent ? 2 : 0),
    MAX_RELEVANT_PROMPT_TURNS,
  );

  const alwaysRecentTurns = (memory?.turns || []).slice(-4);
  const selectedTurns = [
    ...alwaysRecentTurns,
    ...relevantTurns.filter(
      (turn) => !alwaysRecentTurns.some((recent) => recent.turn === turn.turn),
    ),
  ]
    .sort((a, b) => a.turn - b.turn)
    .slice(-MAX_RELEVANT_PROMPT_TURNS);

  const categoryItems = Object.values(wm.categoryMemory || {});
  const relevantCategories = topScored(
    categoryItems,
    (item) => {
      const relevance =
        scoreByCategory(item.category, signals, activeCategory) +
        scoreByEntities(
          `${item.category} ${item.subCategory || ""} ${(item.topics || []).join(" ")} ${item.lastUserQuestion || ""} ${item.lastSelaAnswer || ""}`,
          signals,
        );
      return relevance ? relevance + scoreRecency(item.lastTurn, latestTurn) : 0;
    },
    MAX_RELEVANT_MEMORY_ITEMS,
  );

  const relevantDatasetReferences = topScored(
    wm.datasetReferences || [],
    (item) => {
      const relevance =
        scoreByCategory(item.category, signals, activeCategory) +
        scoreByEntities(
          `${item.category} ${item.subCategory || ""} ${(item.topics || []).join(" ")} ${(item.programs || []).join(" ")}`,
          signals,
        );
      return relevance ? relevance + scoreRecency(item.turn, latestTurn) : 0;
    },
    MAX_RELEVANT_MEMORY_ITEMS,
  );

  const relevantEpisodes = topScored(
    wm.episodicMemory || [],
    (item) => {
      const relevance =
        scoreByCategory(item.category, signals, activeCategory) +
        scoreByEntities(
          `${item.event || ""} ${item.summary || ""} ${(item.entities?.programs || []).join(" ")} ${(item.entities?.topics || []).join(" ")} ${(item.entities?.documents || []).join(" ")}`,
          signals,
        );
      return relevance ? relevance + scoreRecency(item.turn, latestTurn) : 0;
    },
    MAX_RELEVANT_MEMORY_ITEMS,
  );

  const relevantAttention = topScored(
    wm.attentionStack || [],
    (item) => {
      const relevance =
        scoreByCategory(item.category || item.value, signals, activeCategory) +
        scoreByEntities(`${item.type} ${item.category || ""} ${item.value}`, signals);
      return relevance
        ? relevance + scoreRecency(item.turn, latestTurn) + (item.confidence || 0)
        : 0;
    },
    MAX_RELEVANT_MEMORY_ITEMS,
  );

  const relevantEntityMemory = Object.fromEntries(
    Object.entries(wm.entityMemory || {})
      .map(([key, values]) => {
        if (!Array.isArray(values) || !values.length) return [key, []];
        const selected = topScored(
          values,
          (value) =>
            scoreByEntities(`${key} ${value}`, signals) +
            (signals.recallIntent ? 1 : 0),
          5,
        );
        return [key, selected.length ? selected : values.slice(-3)];
      })
      .filter(([, values]) => values.length),
  );

  return {
    signals,
    activeCategory,
    selectedTurns,
    relevantCategories,
    relevantDatasetReferences,
    relevantEpisodes,
    relevantAttention,
    relevantEntityMemory,
  };
}

/*
 * Kept intentionally absent: the prompt builder should consume the selected
 * memory above instead of dumping every stored item into the LLM context.
 */

export function buildSessionMemoryPrompt(memory, latestUserText = "") {
  if (!memory?.turns?.length) {
    return "Tidak ada memori sesi aktif.";
  }

  const wm = memory.workingMemory || {};
  const selected = selectRelevantSessionMemory(memory, latestUserText);
  const turns = selected.selectedTurns.length
    ? selected.selectedTurns
    : memory.turns.slice(-MAX_RELEVANT_PROMPT_TURNS);
  const turnLines = turns.map((turn) => {
    const extras = [];
    if (turn.intent) extras.push(`intent=${turn.intent}`);
    if (turn.screenMode) extras.push(`screen=${turn.screenMode}`);
    const suffix = extras.length ? ` (${extras.join(", ")})` : "";
    return `${turn.turn}. [${turn.time}] ${getTurnLabel(turn)}${suffix}: ${turn.text}`;
  });
  const recallIntent = detectMemoryRecallIntent(latestUserText);
  const resolvedQuery = resolveSessionMemoryQuery(latestUserText, memory);
  const recommendationLines = (wm.recommendations?.programs || []).map(
    (program, index) =>
      `${index + 1}. ${program.name} | ${program.priority || "alternative"} | alasan: ${program.reason || "tidak dicatat"} | turn ${program.sourceTurn || "-"}`,
  );
  const mentionLines = (wm.mentionStack || [])
    .slice(0, 8)
    .map((mention) => `${mention.type}:${mention.value} (turn ${mention.turn})`);
  const attentionLines = (selected.relevantAttention || [])
    .slice(0, MAX_RELEVANT_MEMORY_ITEMS)
    .map(
      (item) =>
        `${item.type}:${item.value}${item.category ? `/${item.category}` : ""} confidence=${item.confidence} turn=${item.turn}`,
    );
  const datasetReferenceLines = (selected.relevantDatasetReferences || [])
    .slice(0, MAX_RELEVANT_MEMORY_ITEMS)
    .map(
      (item) =>
        `${item.sourceHint} turn=${item.turn} topics=${(item.topics || []).join(", ") || "-"} programs=${(item.programs || []).join(", ") || "-"}`,
    );
  const episodeLines = (selected.relevantEpisodes || [])
    .slice(0, MAX_RELEVANT_MEMORY_ITEMS)
    .map(
      (item) =>
        `turn ${item.turn} ${item.actor}: ${item.event}; ${item.summary}`,
    );
  const entityMemoryLines = Object.entries(selected.relevantEntityMemory || {})
    .filter(([, values]) => Array.isArray(values) && values.length)
    .map(([key, values]) => `${key}: ${values.slice(-8).join(", ")}`);
  const unresolvedLines = (wm.unresolvedReferences || [])
    .slice(0, 5)
    .map((item) => `turn ${item.turn}: ${item.text} (${item.reason})`);
  const goalLines = (wm.goals || []).map(
    (goal) => `${goal.goal} | status=${goal.status} | turn=${goal.evidenceTurn}`,
  );
  const answeredLines = (wm.answeredQuestions || [])
    .slice(-5)
    .map(
      (item) =>
        `Q: ${item.question || "-"} => ${summarizeAnswer(item.answerSummary)} (turn ${item.turn})`,
    );
  const categoryLines = (selected.relevantCategories || [])
    .slice(0, MAX_RELEVANT_MEMORY_ITEMS)
    .map((item) => {
      const topics = item.topics?.length ? ` topik=${item.topics.join(", ")}` : "";
      const summary = item.lastSelaAnswer
        ? ` jawaban=${summarizeAnswer(item.lastSelaAnswer)}`
        : "";
      return `${item.category}/${item.subCategory || "-"} turn=${item.lastTurn}${topics}${summary}`;
    });
  const topicHistoryLines = (wm.topicHistory || [])
    .filter((item) => !selected.activeCategory || item.category === selected.activeCategory || recallIntent)
    .slice(0, MAX_RELEVANT_MEMORY_ITEMS)
    .map(
      (item) =>
        `${item.category}/${item.subCategory || "-"} ${item.role} turn=${item.turn}: ${item.summary}`,
    );

  return [
    `Session ID: ${memory.sessionId}`,
    `Mulai: ${memory.startedAt}`,
    `Jumlah turn sejauh ini: ${memory.turns.length}`,
    `Ringkasan sesi singkat: ${summarizeAnswer(wm.sessionSummary) || "belum ada"}`,
    `Active state: category=${wm.activeState?.category || "belum ada"}; subTopic=${wm.activeState?.subTopic || "belum ada"}; entity=${wm.activeState?.entity || "belum ada"}; entityType=${wm.activeState?.entityType || "belum ada"}; userGoal=${wm.activeState?.userGoal || "belum ada"}; pendingQuestion=${wm.activeState?.pendingQuestion || "tidak ada"}; confidence=${wm.activeState?.confidence || 0}`,
    `Memory selection: queryCategory=${selected.signals.category || "tidak ada"}; activeCategory=${selected.activeCategory || "tidak ada"}; selectedTurns=${turns.length}; selectedCategories=${selected.relevantCategories.length}; selectedDatasetRefs=${selected.relevantDatasetReferences.length}`,
    `Kategori aktif: ${wm.activeCategory || wm.activeTopic || "belum ada"}`,
    `Subkategori aktif: ${wm.activeSubCategory || "belum ada"}`,
    `Fokus perhatian: ${wm.attention?.currentFocus || "belum ada"}`,
    `Program aktif: ${wm.attention?.activeProgram || "belum ada"}`,
    `Kebutuhan aktif: ${wm.attention?.activeNeed || "belum ada"}`,
    `Pertanyaan user terakhir: ${wm.lastUserQuestion || "belum ada"}`,
    `Jawaban SELA terakhir: ${summarizeAnswer(wm.lastSelaAnswer) || "belum ada"}`,
    `Teks suara SELA terakhir: ${summarizeAnswer(wm.lastSelaSpokenText) || "belum ada"}`,
    `Minat user yang tertangkap: ${(wm.userProfile?.interests || wm.userInterests || []).join(", ") || "belum ada"}`,
    `Goals percakapan: ${goalLines.length ? goalLines.join(" || ") : "belum ada"}`,
    `Pending klarifikasi: ${
      wm.pendingClarification
        ? `${wm.pendingClarification.question} (turn ${wm.pendingClarification.askedAtTurn})`
        : "tidak ada"
    }`,
    `Rekomendasi prodi yang sudah diberikan:\n${recommendationLines.length ? recommendationLines.join("\n") : "belum ada"}`,
    `Entity memory:\n${entityMemoryLines.length ? entityMemoryLines.join("\n") : "belum ada"}`,
    `Memori kategori dataset relevan:\n${categoryLines.length ? categoryLines.join("\n") : "belum ada"}`,
    `Riwayat topik relevan:\n${topicHistoryLines.length ? topicHistoryLines.join("\n") : "belum ada"}`,
    `Mention stack terbaru: ${mentionLines.length ? mentionLines.join(" | ") : "belum ada"}`,
    `Attention stack terbaru: ${attentionLines.length ? attentionLines.join(" | ") : "belum ada"}`,
    `Dataset references relevan:\n${datasetReferenceLines.length ? datasetReferenceLines.join("\n") : "belum ada"}`,
    `Episodic memory relevan:\n${episodeLines.length ? episodeLines.join("\n") : "belum ada"}`,
    `Rujukan ambigu sebelumnya: ${unresolvedLines.length ? unresolvedLines.join(" | ") : "tidak ada"}`,
    `Resolusi rujukan terakhir: ${
      wm.referenceResolution
        ? `${wm.referenceResolution.phrase} -> ${wm.referenceResolution.resolvedTo || "ambigu"} (confidence ${wm.referenceResolution.confidence})`
        : "tidak ada"
    }`,
    `Rewrite query dari memori: ${
      resolvedQuery.resolution?.rewrittenFrom
        ? `${resolvedQuery.resolution.rewrittenFrom} -> ${resolvedQuery.query}`
        : "tidak perlu"
    }`,
    `Pertanyaan yang sudah dijawab: ${answeredLines.length ? answeredLines.join(" || ") : "belum ada"}`,
    `Link terakhir: ${
      wm.lastLinks?.length
        ? wm.lastLinks.map((link) => `${link.label}: ${link.url}`).join(" | ")
        : "tidak ada"
    }`,
    `Maksud referensial terdeteksi: ${recallIntent || "tidak ada"}`,
    "",
    "Aturan khusus saat membaca memori:",
    "- Memori berlaku untuk semua kategori dataset UCIC: pendaftaran, biaya, jurusan, kurikulum, fasilitas, akademik, profil, dosen, jadwal, kontak, lokasi, kegiatan, karir, beasiswa, akreditasi, visi_misi, dan nilai.",
    "- Jangan menganggap semua follow-up sebagai jurusan. Gunakan kategori aktif, memori kategori, dan riwayat topik terbaru.",
    "- Gunakan active state, attention stack, entity memory, dan episodic memory untuk memahami maksud 'itu/tadi/sebelumnya'.",
    "- Gunakan dataset references sebagai petunjuk pengambilan konteks RAG; memory bukan sumber fakta final.",
    "- Prompt ini hanya berisi memory yang dipilih berdasarkan relevansi query terbaru, kategori aktif, entitas, dan recency.",
    "- Jika user bertanya rekomendasi/saran sebelumnya, jawab dari daftar rekomendasi prodi di atas. Jangan tambah prodi baru kecuali user minta alternatif baru.",
    "- Jika user memakai kata 'itu', 'tadi', 'sebelumnya', atau 'satunya', gunakan mention stack dan resolusi rujukan.",
    "- Jika confidence resolusi rendah atau rujukan ambigu, tanya klarifikasi singkat.",
    "- Jika user minta biaya/syarat/kurikulum/prospek untuk 'yang itu' dan rujukannya program, gunakan program aktif/rewrite query dari memori.",
    "- Jika rujukannya fasilitas, pendaftaran, akademik, kontak, lokasi, beasiswa, atau kategori lain, lanjutkan konteks kategori itu, bukan rekomendasi jurusan.",
    "",
    "Riwayat turn sesi aktif terseleksi:",
    turnLines.join("\n"),
  ].join("\n");
}
