function countListLines(text = "") {
  return String(text || "")
    .split("\n")
    .filter((line) => /^\s*(?:\d+[.)]|[-*])\s+/.test(line)).length;
}

function containsProgramRecommendation(text = "") {
  return /\b(teknik informatika|sistem informasi|dkv|desain komunikasi visual|bisnis digital|manajemen|akuntansi|pendidikan kepelatihan olahraga|manajemen informatika)\b/i.test(
    String(text || ""),
  );
}

export function needsCounselorQualityFallback(text = "", responsePlan = null) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!responsePlan || responsePlan.counselorMode === "answer_only") return false;
  if (!clean) return true;

  const lastWord = clean
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .pop()
    ?.toLowerCase();
  const danglingWords = new Set([
    "agar",
    "supaya",
    "untuk",
    "yang",
    "dan",
    "atau",
    "karena",
    "kalau",
    "jika",
    "biar",
    "dengan",
    "ke",
    "di",
    "dari",
    "lalu",
    "kemudian",
  ]);

  if (lastWord && danglingWords.has(lastWord)) return true;

  if (responsePlan.counselorMode === "interest_discovery") {
    const hasQuestion = /[?？]/.test(clean);
    if (containsProgramRecommendation(clean)) return false;
    return clean.length < 80 || !hasQuestion;
  }

  if (responsePlan.counselorMode === "program_recommendation") {
    return (
      clean.length < 120 ||
      !containsProgramRecommendation(clean)
    );
  }

  if (responsePlan.counselorMode === "application_guidance") {
    return clean.length < 120;
  }

  return false;
}

export function buildCounselorQualityFallback(responsePlan = null, lang = "id") {
  if (!responsePlan) return "";
  const programs = responsePlan.leadSignals?.recommendedPrograms || [];

  if (lang === "en") {
    if (responsePlan.counselorMode === "interest_discovery") {
      return "Sure, SELA can help you choose. Are you more interested in computers or coding, design and content, business, finance, or sports?";
    }
    if (responsePlan.counselorMode === "program_recommendation" && programs.length) {
      return [
        "Based on your interest, SELA recommends:",
        ...programs
          .slice(0, 2)
          .map(
            (program, index) =>
              `${index + 1}. ${program}: this is the closest match to your interest.`,
          ),
        "Next, you can ask about the tuition or application steps for that program.",
      ].join("\n");
    }
    return "";
  }

  if (responsePlan.counselorMode === "interest_discovery") {
    return "Bisa, SELA bantu arahkan. Kamu lebih tertarik ke komputer atau coding, desain dan konten, bisnis, keuangan, atau olahraga?";
  }

  if (responsePlan.counselorMode === "program_recommendation" && programs.length) {
    return [
      "Dari minat kamu, rekomendasi SELA:",
      ...programs
        .slice(0, 2)
        .map(
          (program, index) =>
            `${index + 1}. ${program}: paling dekat dengan minat yang kamu sebutkan.`,
        ),
      "Setelah itu, kamu bisa tanya biaya atau cara daftar untuk jurusan tersebut.",
    ].join("\n");
  }

  return "";
}

export function needsDetailedFallback(text = "", responsePlan = null, intent = null) {
  const clean = String(text || "").trim();
  if (!clean) return true;

  if (responsePlan?.displayMode === "step_detail") {
    return clean.length < 160 || countListLines(clean) < 3;
  }

  if (responsePlan?.displayMode === "list_detail") {
    if (intent === "jurusan") return clean.length < 180 || countListLines(clean) < 3;
    return clean.length < 140 || countListLines(clean) < 3;
  }

  if (responsePlan?.displayMode === "compare_detail") {
    return clean.length < 140 || countListLines(clean) < 2;
  }

  return false;
}

export function extractResponseLinks(text = "") {
  return [
    ...new Set(
      (String(text || "").match(/https?:\/\/[^\s),]+/g) || []).map((url) =>
        url.replace(/[.!?]+$/, ""),
      ),
    ),
  ].map((url) => ({
    label: /pmb/i.test(url) ? "PMB UCIC" : "Link",
    url,
  }));
}

function getScreenMode(responsePlan = null, intent = null) {
  if (responsePlan?.counselorMode === "interest_discovery") {
    return "interest";
  }
  if (responsePlan?.counselorMode === "program_recommendation") {
    return "recommend";
  }
  if (
    responsePlan?.counselorMode === "handoff_to_pmb" ||
    responsePlan?.nextAction === "offer_pmb_link"
  ) {
    return "handoff";
  }
  if (responsePlan?.displayMode === "step_detail") return "steps";
  if (responsePlan?.displayMode === "list_detail") return "list";
  if (responsePlan?.displayMode === "compare_detail") return "compare";
  if (intent === "jurusan") return "recommend";
  return "brief";
}

function getScreenTitle(mode = "brief", intent = null, effectiveLang = "id") {
  const titles = {
    id: {
      steps: intent === "pendaftaran" ? "Cara Daftar UCIC" : "Langkah Penting",
      list: intent === "fasilitas" ? "Fasilitas UCIC" : "Ringkasan Informasi",
      compare: "Perbandingan",
      recommend: "Rekomendasi SELA",
      interest: "Pilih Minat",
      handoff: "Arahan Lanjutan",
      brief: "Informasi UCIC",
    },
    en: {
      steps: intent === "pendaftaran" ? "How to Apply to UCIC" : "Key Steps",
      list: intent === "fasilitas" ? "UCIC Facilities" : "Information Summary",
      compare: "Comparison",
      recommend: "SELA Recommendation",
      interest: "Choose Interest",
      handoff: "Next Direction",
      brief: "UCIC Information",
    },
  };

  return (titles[effectiveLang] || titles.id)[mode] || titles.id.brief;
}

function stripInlineNoise(text = "") {
  return String(text || "")
    .replace(/\[(.*?)\]/g, "")
    .replace(/https?:\/\/pmb\.cic\.ac\.id\/register/gi, "website PMB UCIC")
    .replace(/https?:\/\/pmb\.cic\.ac\.id\/?/gi, "website PMB UCIC")
    .replace(/https?:\/\/[^\s]+/g, "link yang tampil di layar")
    .replace(/\s+/g, " ")
    .trim();
}

function isIntroLine(line = "") {
  return /^(baik|oke|ok|siap|bisa|tentu|selamat|berikut|untuk|kalau|agar|saya|seLA)\b/i.test(
    String(line || "").trim(),
  );
}

function getInterestItems(effectiveLang = "id") {
  return effectiveLang === "en"
    ? ["Computer / Coding", "Design / Content", "Business", "Finance", "Sports"]
    : [
        "Komputer / Coding",
        "Desain / Konten",
        "Bisnis",
        "Keuangan",
        "Olahraga",
      ];
}

function isActionItem(item = "") {
  return /^(pilih|isi|daftar|siapkan|unggah|upload|bayar|konfirmasi|tunggu|hubungi|scan|buka|datang|ikuti|cek|lihat|choose|fill|prepare|upload|pay|confirm|wait|contact|scan|open|visit|follow|check)\b/i.test(
    item,
  );
}

function isRecommendationItem(item = "") {
  return /\b(teknik informatika|sistem informasi|dkv|desain komunikasi visual|bisnis digital|manajemen|akuntansi|pendidikan kepelatihan olahraga|manajemen informatika)\b/i.test(
    item,
  );
}

function isListItem(item = "") {
  if (isIntroLine(item)) return false;
  return item.length >= 4;
}

function filterItemsForMode(items = [], mode = "brief") {
  if (mode === "steps" || mode === "handoff") {
    return items.filter(isActionItem);
  }
  if (mode === "recommend") {
    return items.filter(isRecommendationItem);
  }
  if (mode === "list" || mode === "compare") {
    return items.filter(isListItem);
  }
  return items.filter((item) => !isIntroLine(item));
}

function getMaxItemsForMode(mode = "brief") {
  if (mode === "interest") return 5;
  if (mode === "steps" || mode === "handoff") return 4;
  if (mode === "recommend" || mode === "compare") return 3;
  return 4;
}

function extractScreenItems(text = "", mode = "brief", effectiveLang = "id") {
  if (mode === "interest") return getInterestItems(effectiveLang);

  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const listItems = lines
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s+/, "").trim())
    .filter(
      (line, index) =>
        line !== lines[index] || /^\s*(?:\d+[.)]|[-*])\s+/.test(lines[index]),
    )
    .map(stripInlineNoise)
    .filter(Boolean);

  if (listItems.length > 0) {
    const filteredItems = filterItemsForMode(listItems, mode);
    if (
      filteredItems.length === 0 &&
      (mode === "steps" || mode === "handoff" || mode === "recommend")
    ) {
      return [];
    }

    return (filteredItems.length > 0 ? filteredItems : listItems).slice(
      0,
      getMaxItemsForMode(mode),
    );
  }
  if (mode === "brief") return [];
  if (mode === "steps" || mode === "handoff" || mode === "recommend") return [];

  return filterItemsForMode(
    stripInlineNoise(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 8)
      .slice(0, 5),
    mode,
  ).slice(0, getMaxItemsForMode(mode));
}

export function buildScreenResponse(
  displayText = "",
  responsePlan = null,
  intent = null,
  effectiveLang = "id",
) {
  const mode = getScreenMode(responsePlan, intent);
  const links = extractResponseLinks(displayText);
  const items = extractScreenItems(displayText, mode, effectiveLang);
  const shouldShow = mode !== "brief" || links.length > 0 || items.length >= 2;

  if (!shouldShow) {
    return links.length > 0
      ? {
          mode: "brief",
          title: getScreenTitle("brief", intent, effectiveLang),
          items: [],
          links,
        }
      : null;
  }

  return {
    mode,
    title: getScreenTitle(mode, intent, effectiveLang),
    items,
    links,
  };
}
