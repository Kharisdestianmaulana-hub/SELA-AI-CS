const LIST_DETAIL_TOPICS = new Set([
  "jurusan",
  "beasiswa",
  "fasilitas",
  "biaya",
  "pembayaran",
]);

const BRIEF_INTENTS = new Set(["profil", "rektor", "lokasi", "kontak"]);

const AGGREGATE_PRIORITY_IDS = {
  profil: ["profil_ucic"],
  jurusan: ["jurusan_ucic", "jurusan_fti", "jurusan_feb", "jurusan_fps"],
  beasiswa: ["beasiswa"],
  fasilitas: ["fasilitas_kampus_lengkap"],
  biaya: ["biaya_kuliah"],
  lokasi: ["lokasi_kampus"],
  kontak: ["pmb_alur_kontak", "faq_awam_kontak_admin"],
  rektor: ["rektor"],
};

const INTEREST_PROGRAM_MAP = [
  {
    tag: "coding",
    programs: ["Teknik Informatika", "Sistem Informasi"],
    patterns: [
      "coding",
      "ngoding",
      "programming",
      "programmer",
      "game",
      "gaming",
      "pro gaming",
      "esport",
      "e sport",
      "e-sport",
      "game developer",
      "developer game",
      "software",
      "teknologi",
      "komputer",
      "it",
      "ti",
      "aplikasi",
      "web",
      "mobile",
      "machine learning",
      "artificial intelligence",
      "cyber",
      "keamanan siber",
    ],
  },
  {
    tag: "data_system",
    programs: ["Sistem Informasi", "Teknik Informatika"],
    patterns: [
      "data",
      "sistem",
      "database",
      "erp",
      "analisis",
      "aplikasi perusahaan",
      "bisnis teknologi",
      "teknologi informasi",
    ],
  },
  {
    tag: "design",
    programs: ["Desain Komunikasi Visual"],
    patterns: [
      "desain",
      "gambar",
      "ui ux",
      "ui",
      "ux",
      "fotografi",
      "video",
      "konten",
      "visual",
      "ilustrasi",
      "multimedia",
    ],
  },
  {
    tag: "business_digital",
    programs: ["Bisnis Digital", "Manajemen"],
    patterns: [
      "bisnis online",
      "jualan online",
      "startup",
      "digital marketing",
      "e commerce",
      "ecommerce",
      "marketplace",
      "sosial media",
    ],
  },
  {
    tag: "finance",
    programs: ["Akuntansi"],
    patterns: [
      "uang",
      "keuangan",
      "pajak",
      "audit",
      "akuntansi",
      "laporan keuangan",
    ],
  },
  {
    tag: "management",
    programs: ["Manajemen"],
    patterns: [
      "manajemen",
      "organisasi",
      "leadership",
      "hrd",
      "sdm",
      "mengatur",
      "pemimpin",
      "marketing",
    ],
  },
  {
    tag: "sport",
    programs: ["Pendidikan Kepelatihan Olahraga"],
    patterns: [
      "olahraga",
      "pelatih",
      "atlet",
      "fitness",
      "futsal",
      "guru olahraga",
      "personal trainer",
    ],
  },
  {
    tag: "practical_it",
    programs: ["D3 Manajemen Informatika"],
    patterns: [
      "cepat kerja",
      "praktis",
      "it support",
      "teknisi",
      "d3",
      "diploma",
    ],
  },
];

function getInterestMatches(normalized = "") {
  const matches = [];
  const programScores = new Map();

  for (const entry of INTEREST_PROGRAM_MAP) {
    const hit = entry.patterns.some((phrase) => normalized.includes(phrase));
    if (!hit) continue;

    matches.push(entry.tag);
    entry.programs.forEach((program, index) => {
      const score = (programScores.get(program) || 0) + (index === 0 ? 2 : 1);
      programScores.set(program, score);
    });
  }

  const recommendedPrograms = [...programScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([program]) => program)
    .slice(0, 2);

  return {
    interestTags: matches,
    recommendedPrograms,
  };
}

function buildLeadSignals(normalized = "", intent = null) {
  const { interestTags, recommendedPrograms } = getInterestMatches(normalized);
  const hasInterest =
    interestTags.length > 0 ||
    includesAny(normalized, [
      "suka",
      "minat",
      "bakat",
      "hobi",
      "cita cita",
      "cita-cita",
      "ingin jadi",
      "pengen jadi",
    ]);
  const confusedChoosingMajor =
    (intent === "jurusan" ||
      includesAny(normalized, ["jurusan", "prodi", "program studi"])) &&
    includesAny(normalized, [
      "bingung",
      "cocok",
      "cocoknya",
      "pilih",
      "rekomendasi",
      "saran",
      "ambil",
      "masuk",
    ]);
  const readyToApply = includesAny(normalized, [
    "mau daftar",
    "ingin daftar",
    "pengen daftar",
    "siap daftar",
    "daftarin",
    "lanjut daftar",
    "mulai daftar",
    "cara daftar",
    "bagaimana daftar",
    "gimana daftar",
    "link daftar",
    "registrasi",
    "pmb",
    "verifikasi",
  ]);

  return {
    hasInterest,
    interestTags,
    recommendedPrograms,
    readyToApply,
    confusedChoosingMajor,
  };
}

function buildCounselorState({
  intent = null,
  displayMode = "brief",
  directFactQuestion = false,
  leadSignals = {},
}) {
  if (directFactQuestion && ["rektor", "lokasi", "kontak"].includes(intent)) {
    return {
      counselorMode: "answer_only",
      nextAction: "none",
    };
  }

  if (leadSignals.readyToApply || intent === "pendaftaran") {
    const nextAction =
      intent === "pendaftaran" || displayMode === "step_detail"
        ? "explain_registration_steps"
        : "offer_pmb_link";
    return {
      counselorMode:
        nextAction === "offer_pmb_link" ? "handoff_to_pmb" : "application_guidance",
      nextAction,
    };
  }

  if (intent === "syarat" || intent === "pembayaran") {
    return {
      counselorMode: "application_guidance",
      nextAction: "show_cost_or_requirement",
    };
  }

  if (intent === "jurusan") {
    if (leadSignals.hasInterest && leadSignals.recommendedPrograms?.length > 0) {
      return {
        counselorMode: "program_recommendation",
        nextAction: "recommend_program",
      };
    }

    if (leadSignals.confusedChoosingMajor) {
      return {
        counselorMode: "interest_discovery",
        nextAction: "ask_interest",
      };
    }

    return {
      counselorMode: "confidence_building",
      nextAction: "suggest_followup",
    };
  }

  if (["biaya", "fasilitas", "profil"].includes(intent)) {
    return {
      counselorMode: "confidence_building",
      nextAction:
        intent === "biaya" ? "show_cost_or_requirement" : "suggest_followup",
    };
  }

  return {
    counselorMode: "answer_only",
    nextAction: "none",
  };
}

function normalizePlanText(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(normalized, phrases = []) {
  return phrases.some((phrase) => normalized.includes(phrase));
}

function truncateSentence(text = "", maxLength = 160) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;

  const clipped = normalized.slice(0, maxLength);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("?"),
    clipped.lastIndexOf("!"),
  );
  if (sentenceEnd > 80) return clipped.slice(0, sentenceEnd + 1).trim();
  return `${clipped.replace(/\s+\S*$/, "").trim()}.`;
}

function countReadableParagraphs(text = "") {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length;
}

function countReadableListItems(text = "") {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:\d+[.)]|[-*])\s+/.test(line)).length;
}

function voiceFriendlyStepText(text = "") {
  return String(text || "")
    .replace(/https?:\/\/pmb\.cic\.ac\.id\/register/gi, "website PMB UCIC")
    .replace(/https?:\/\/pmb\.cic\.ac\.id\/?/gi, "website PMB UCIC")
    .replace(/https?:\/\/[^\s]+/g, "link yang tampil di layar")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

function extractLeadSentence(text = "", maxLength = 150) {
  const flattened = String(text || "")
    .replace(/\[(.*?)\]/g, " ")
    .replace(/(?:^|\n)\s*\d+\.\s*/g, " ")
    .replace(/(?:^|\n)\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!flattened) return "";
  const firstSentence = flattened.match(/^.*?[.!?](?=\s|$)/)?.[0] || flattened;
  return truncateSentence(firstSentence, maxLength);
}

function extractJurusanCounts(matches = []) {
  const facultyNames = new Set();
  const programNames = new Set();

  for (const match of matches) {
    const item = match?.item || match;
    if (!item?.content) continue;

    const eligible =
      String(item.id || "").startsWith("jurusan_") ||
      /fakultas/i.test(String(item.title || ""));
    if (!eligible) continue;

    const lines = String(item.content)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const clean = line.replace(/^-+\s*/, "").trim();

      if (/^Fakultas /i.test(clean)) {
        facultyNames.add(clean.split(":")[0].trim());
      }

      if (clean.includes(":")) {
        const afterColon = clean.split(":").slice(1).join(":");
        afterColon
          .split(",")
          .map((segment) =>
            segment
              .replace(/^(Program )?(S1|D3|S2)\s+/i, "")
              .replace(/[.]+$/g, "")
              .trim(),
          )
          .filter(Boolean)
          .forEach((program) => programNames.add(program));
        continue;
      }

      if (/^-\s*/.test(line)) {
        const program = clean.replace(/[.]+$/g, "").trim();
        if (
          program &&
          !/^Program /i.test(program) &&
          !/ fokus /i.test(program) &&
          !/^Fakultas /i.test(program)
        ) {
          programNames.add(program);
        }
      }
    }
  }

  return {
    facultyCount: facultyNames.size,
    programCount: programNames.size,
  };
}

function buildGenericSummary(intent, displayMode, lang) {
  const labels = {
    id: {
      jurusan: "daftar jurusan",
      beasiswa: "daftar beasiswa",
      fasilitas: "daftar fasilitas",
      biaya: "rincian biaya",
      pembayaran: "rincian pembayaran",
      pendaftaran: "langkah pendaftaran",
      syarat: "syarat lengkap",
      akademik: "langkah akademik",
      defaultList: "daftar lengkap",
      defaultSteps: "langkah lengkap",
      defaultCompare: "perbandingan ringkas",
    },
    en: {
      jurusan: "the full program list",
      beasiswa: "the full scholarship list",
      fasilitas: "the full facilities list",
      biaya: "the cost details",
      pembayaran: "the payment details",
      pendaftaran: "the registration steps",
      syarat: "the full requirements",
      akademik: "the academic steps",
      defaultList: "the full list",
      defaultSteps: "the full steps",
      defaultCompare: "the comparison summary",
    },
  };

  const copy = labels[lang] || labels.id;

  if (displayMode === "list_detail") {
    const noun = copy[intent] || copy.defaultList;
    return lang === "en"
      ? `I am showing ${noun} on screen so it is easier to review.`
      : `${noun.charAt(0).toUpperCase() + noun.slice(1)} saya tampilkan di layar supaya lebih mudah dilihat.`;
  }

  if (displayMode === "step_detail") {
    const noun = copy[intent] || copy.defaultSteps;
    return lang === "en"
      ? `I am showing ${noun} on screen.`
      : `${noun.charAt(0).toUpperCase() + noun.slice(1)} saya tampilkan di layar.`;
  }

  return lang === "en"
    ? `I am showing ${copy.defaultCompare} on screen.`
    : `${copy.defaultCompare.charAt(0).toUpperCase() + copy.defaultCompare.slice(1)} saya tampilkan di layar.`;
}

export function buildResponsePlan(userQuery = "", { intent = null } = {}) {
  const normalized = normalizePlanText(userQuery);
  const leadSignals = buildLeadSignals(normalized, intent);
  const hasEnumerationRequest =
    includesAny(normalized, [
      "apa aja",
      "apa saja",
      "semua",
      "seluruh",
      "sebutkan",
      "rincikan",
      "list",
    ]) ||
    /\bdaftar (jurusan|prodi|fakultas|beasiswa|fasilitas|metode|pembayaran)\b/.test(
      normalized,
    );

  const hasCompareRequest =
    includesAny(normalized, [
      "beda",
      "bedanya",
      "perbedaan",
      "bandingkan",
      "vs",
      "mana yang cocok",
      "pilih mana",
      "lebih cocok",
    ]) || /cocok.*(jurusan|prodi)|(?:jurusan|prodi).*cocok/.test(normalized);

  const hasStepRequest =
    includesAny(normalized, [
      "cara",
      "alur",
      "langkah",
      "proses",
      "tahapan",
      "syarat",
      "persyaratan",
      "daftar online",
      "daftar offline",
      "online",
      "offline",
      "setelah daftar",
      "abis daftar",
      "habis daftar",
      "sesudah daftar",
      "lanjut daftar",
      "cara bayar",
      "cara pembayaran",
      "bayarnya lewat",
      "bayar lewat",
      "pembayaran lewat",
      "metode bayar",
      "metode pembayaran",
    ]) ||
    ((intent === "pendaftaran" || intent === "akademik") &&
      includesAny(normalized, ["gimana", "bagaimana"]));

  const specificCostFact =
    includesAny(normalized, ["biaya pendaftaran", "uang daftar"]) &&
    !hasEnumerationRequest;
  const directFactQuestion =
    /^(siapa|where|who|alamat|dimana|di mana|nomor|kontak|jam)\b/.test(
      normalized,
    ) || specificCostFact;

  const hasListTopicSignal =
    includesAny(normalized, [
      "jurusan",
      "prodi",
      "fakultas",
      "beasiswa",
      "fasilitas",
      "metode pembayaran",
      "pembayaran",
    ]) &&
    (hasEnumerationRequest ||
      includesAny(normalized, ["ada", "tersedia", "pilihan", "apa"]));

  let displayMode = "brief";
  if (hasCompareRequest) {
    displayMode = "compare_detail";
  } else if (hasStepRequest || intent === "syarat") {
    displayMode = "step_detail";
  } else if (
    hasListTopicSignal ||
    (LIST_DETAIL_TOPICS.has(intent) &&
      !directFactQuestion &&
      includesAny(normalized, ["ada", "apa", "pilihan", "tersedia", "metode"]))
  ) {
    displayMode = "list_detail";
  } else if (!directFactQuestion && BRIEF_INTENTS.has(intent) === false) {
    if (
      intent === "pendaftaran" &&
      includesAny(normalized, ["gimana", "bagaimana"])
    ) {
      displayMode = "step_detail";
    }
  }

  const mustEnumerateAll = displayMode === "list_detail" && hasEnumerationRequest;
  const counselorState = buildCounselorState({
    intent,
    displayMode,
    directFactQuestion,
    leadSignals,
  });

  return {
    displayMode,
    ttsMode: displayMode === "brief" ? "full" : "adaptive",
    mustEnumerateAll,
    maxContextItems: displayMode === "brief" ? 3 : 6,
    intent,
    ...counselorState,
    leadSignals,
  };
}

export function buildCounselorPlanPrompt(responsePlan = null, lang = "id") {
  const plan = responsePlan || buildResponsePlan();
  const programs = plan.leadSignals?.recommendedPrograms || [];
  const interestOptions =
    lang === "en"
      ? "computer, design, business, finance, or sports"
      : "komputer, desain, bisnis, keuangan, atau olahraga";

  if (lang === "en") {
    switch (plan.counselorMode) {
      case "interest_discovery":
        return `Counselor mode: discover interest. Do not list all majors yet. Ask exactly one short question about whether the user is more interested in ${interestOptions}.`;
      case "program_recommendation":
        return `Counselor mode: recommend a program. Recommend ${programs.join(" or ") || "the most relevant UCIC program"} from campus context, give one short reason, then offer a relevant next step such as cost or application steps.`;
      case "application_guidance":
        return "Counselor mode: guide application. Explain the practical next step in numbered lines and direct the user to prepare documents, choose a program, payment/verification, or PMB link when available in context.";
      case "handoff_to_pmb":
        return "Counselor mode: hand off to PMB. Give a short next-step direction and mention the PMB link/contact only when it appears in campus context.";
      case "confidence_building":
        return "Counselor mode: build confidence. Answer the fact first, then add one short helpful direction connected to choosing a program, checking cost, requirements, facilities, or applying.";
      default:
        return "Counselor mode: answer only. Keep it direct and do not force a registration pitch.";
    }
  }

  switch (plan.counselorMode) {
    case "interest_discovery":
      return `Mode counselor: gali minat. Jangan langsung daftar semua jurusan. Ajukan tepat 1 pertanyaan pendek, misalnya user lebih tertarik ke ${interestOptions}.`;
    case "program_recommendation":
      return `Mode counselor: rekomendasi jurusan. Rekomendasikan ${programs.join(" atau ") || "prodi UCIC yang paling relevan"} dari konteks kampus, beri 1 alasan singkat, lalu arahkan next step seperti biaya atau cara daftar.`;
    case "application_guidance":
      return "Mode counselor: pandu pendaftaran. Jelaskan langkah praktis dengan nomor pendek dan arahkan user ke pilih prodi, siapkan berkas, pembayaran/verifikasi, atau link PMB jika tersedia di konteks.";
    case "handoff_to_pmb":
      return "Mode counselor: arahan ke PMB. Beri arahan next step singkat dan sebutkan link/kontak PMB hanya jika tersedia di konteks kampus.";
    case "confidence_building":
      return "Mode counselor: bangun keyakinan. Jawab fakta utama dulu, lalu tambah 1 arahan singkat yang membantu user lanjut memilih jurusan, cek biaya, syarat, fasilitas, atau daftar.";
    default:
      return "Mode counselor: jawab saja. Tetap langsung ke inti dan jangan memaksa promosi pendaftaran.";
  }
}

export function buildFallbackSuggestions(responsePlan = null, lang = "id") {
  const plan = responsePlan || buildResponsePlan();
  const idSuggestions = {
    interest_discovery: [
      "Saya suka komputer, cocok jurusan apa?",
      "Saya suka desain, cocok jurusan apa?",
    ],
    program_recommendation: [
      "Apa bedanya Teknik Informatika dan Sistem Informasi?",
      "Berapa biaya jurusan itu?",
    ],
    application_guidance: [
      "Apa saja berkas yang perlu disiapkan?",
      "Bisa daftar online lewat mana?",
    ],
    handoff_to_pmb: [
      "Bisa daftar online lewat mana?",
      "Kontak PMB UCIC berapa?",
    ],
    confidence_building: [
      "Jurusan apa yang cocok untuk saya?",
      "Bagaimana cara daftar ke UCIC?",
    ],
    answer_only: [
      "Jurusan apa saja yang ada di UCIC?",
      "Bagaimana cara daftar ke UCIC?",
    ],
  };
  const enSuggestions = {
    interest_discovery: [
      "I like computers, which major fits me?",
      "I like design, which major fits me?",
    ],
    program_recommendation: [
      "What is the difference between Informatics and Information Systems?",
      "How much does that program cost?",
    ],
    application_guidance: [
      "What documents should I prepare?",
      "Where can I apply online?",
    ],
    handoff_to_pmb: [
      "Where can I apply online?",
      "What is the PMB contact?",
    ],
    confidence_building: [
      "Which major fits me best?",
      "How do I apply to UCIC?",
    ],
    answer_only: [
      "What programs are available at UCIC?",
      "How do I apply to UCIC?",
    ],
  };

  const bank = lang === "en" ? enSuggestions : idSuggestions;
  return bank[plan.counselorMode] || bank.answer_only;
}

export function buildResponsePlanPrompt(responsePlan, lang = "id") {
  const plan = responsePlan || buildResponsePlan();

  if (lang === "en") {
    switch (plan.displayMode) {
      case "list_detail":
        return `Depth mode: concise numbered list. Use short numbered lines (1, 2, 3). No long intro, no extra explanation.${plan.mustEnumerateAll ? " Enumerate every relevant item, but keep each item short." : " Include only the most relevant items."}`;
      case "step_detail":
        return "Depth mode: practical steps. Use 3 to 6 short numbered lines. If the user asks about online/offline registration, separate the online and offline paths. Include the next practical step when it exists in the campus context. Keep each line short enough for voice.";
      case "compare_detail":
        return "Depth mode: concise comparison. Use short numbered lines (1, 2, 3) for the main differences only.";
      default:
        return "Depth mode: brief. Answer directly in 1 or 2 short sentences, focusing only on the fact the user asked for.";
    }
  }

  switch (plan.displayMode) {
    case "list_detail":
      return `Mode jawaban: daftar bernomor singkat. Jawab langsung dengan nomor pendek (1, 2, 3). Jangan pakai bullet lingkaran, pembuka panjang, atau penjelasan yang tidak ditanya.${plan.mustEnumerateAll ? " Sebutkan semua item relevan, tetapi tiap item tetap pendek." : " Cukup item yang paling relevan."}`;
    case "step_detail":
      return "Mode jawaban: langkah praktis. Gunakan 3 sampai 6 nomor pendek. Jika user menanyakan daftar online/offline, pisahkan jalur online dan offline. Sertakan next step praktis jika ada di konteks kampus. Tiap poin harus singkat agar nyaman dibacakan.";
    case "compare_detail":
      return "Mode jawaban: perbandingan singkat. Gunakan nomor pendek (1, 2, 3) untuk perbedaan utama saja.";
    default:
      return "Mode jawaban: singkat. Jawab langsung ke inti dalam 1 atau 2 kalimat pendek tanpa pengantar bertele-tele.";
  }
}

export function prioritizeResponseMatches(
  matches = [],
  { responsePlan = null, intent = null, catalog = [] } = {},
) {
  const plan = responsePlan || buildResponsePlan();
  const limit = plan.maxContextItems || 4;
  const preferredIds =
    AGGREGATE_PRIORITY_IDS[intent] &&
    (plan.displayMode === "list_detail" || plan.displayMode === "brief")
      ? AGGREGATE_PRIORITY_IDS[intent]
      : [];

  if (preferredIds.length === 0) return matches.slice(0, limit);

  const existingById = new Map(
    matches
      .filter((match) => match?.item?.id)
      .map((match) => [match.item.id, match]),
  );
  const injected = [];
  const baseScore = matches[0]?.score || 20;

  preferredIds.forEach((id, index) => {
    if (existingById.has(id)) return;
    const item = catalog.find((entry) => entry.id === id);
    if (!item) return;

    injected.push({
      item,
      score: baseScore - index * 0.1,
      injected: true,
    });
  });

  const orderedPreferred = preferredIds
    .map(
      (id) =>
        existingById.get(id) ||
        injected.find((candidate) => candidate.item?.id === id),
    )
    .filter(Boolean);

  const preferredSet = new Set(preferredIds);
  const remaining = [...matches, ...injected]
    .filter((match) => !preferredSet.has(match?.item?.id))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const ordered = [];
  const seen = new Set();

  for (const match of [...orderedPreferred, ...remaining]) {
    const id = match?.item?.id;
    if (!id || seen.has(id)) continue;
    ordered.push(match);
    seen.add(id);
    if (ordered.length >= limit) break;
  }

  return ordered;
}

export function buildSpokenText(
  displayText = "",
  responsePlan = null,
  lang = "id",
  matches = [],
) {
  const plan = responsePlan || buildResponsePlan();
  const cleanedText = String(displayText || "").trim();
  if (!cleanedText) return "";
  if (plan.ttsMode === "full") return cleanedText;

  const paragraphCount = countReadableParagraphs(cleanedText);
  const listItemCount = countReadableListItems(cleanedText);

  if (
    plan.displayMode === "step_detail" &&
    listItemCount >= 3
  ) {
    return voiceFriendlyStepText(cleanedText);
  }

  if (
    plan.displayMode === "list_detail" &&
    plan.intent !== "jurusan" &&
    listItemCount >= 3 &&
    cleanedText.length <= 900
  ) {
    return voiceFriendlyStepText(cleanedText);
  }

  const shouldSummarize =
    plan.ttsMode === "summary_only" ||
    paragraphCount >= 3 ||
    (plan.displayMode === "step_detail" && cleanedText.length > 900) ||
    (plan.displayMode === "list_detail" &&
      cleanedText.length > 900);

  if (!shouldSummarize) return cleanedText;

  if (plan.displayMode === "list_detail" && plan.intent === "jurusan") {
    const { facultyCount, programCount } = extractJurusanCounts(matches);
    if (facultyCount > 0 || programCount > 0) {
      if (lang === "en") {
        return `UCIC has ${facultyCount || "several"} faculties and ${programCount || "multiple"} study programs. I am showing the full list on screen.`;
      }
      return `UCIC punya ${facultyCount || "beberapa"} fakultas dan ${programCount || "beberapa"} program studi. Daftar lengkapnya saya tampilkan di layar.`;
    }
  }

  const summaryLead = buildGenericSummary(
    plan.intent,
    plan.displayMode,
    lang,
  );

  const core = extractLeadSentence(cleanedText, 140);
  if (!core) return summaryLead;

  if (lang === "en") {
    return `${summaryLead} In short, ${core}`;
  }

  return `${summaryLead} Intinya, ${core}`;
}
