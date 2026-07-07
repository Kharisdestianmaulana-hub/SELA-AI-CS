const DEFAULT_STOPWORDS = new Set([
  "apa",
  "ada",
  "aja",
  "atau",
  "bagaimana",
  "bisa",
  "catur",
  "cendekia",
  "cic",
  "dan",
  "dari",
  "dengan",
  "di",
  "gimana",
  "insan",
  "itu",
  "kampus",
  "ke",
  "mana",
  "seperti",
  "sih",
  "ucic",
  "universitas",
  "untuk",
  "yang",
]);

const CATEGORY_ALIAS_BANK = {
  akademik: [
    "baak",
    "aturan akademik",
    "layanan akademik",
    "mahasiswa aktif",
  ],
  akreditasi: ["akreditasi kampus", "ban pt", "status akreditasi"],
  beasiswa: ["beasiswa", "bantuan biaya", "kip", "potongan biaya"],
  biaya: [
    "biaya",
    "bayar",
    "pembayaran",
    "uang kuliah",
    "spp",
    "ukt",
    "cicilan",
  ],
  dosen: ["dosen", "pengajar", "daftar dosen"],
  fasilitas: ["fasilitas", "sarana", "prasarana", "lab", "perpustakaan"],
  jadwal: ["jadwal", "jam kuliah", "kelas sore", "kelas karyawan"],
  jurusan: ["jurusan", "prodi", "program studi", "fakultas"],
  karir: ["karir", "prospek kerja", "peluang kerja", "alumni"],
  kegiatan: ["kegiatan", "ukm", "organisasi mahasiswa", "hmp"],
  kontak: ["kontak", "nomor", "whatsapp", "admin", "hubungi"],
  kurikulum: ["kurikulum", "mata kuliah", "semester", "matkul"],
  lokasi: ["lokasi", "alamat", "kampus 1", "kampus 2"],
  nilai: ["nilai", "budaya", "karakter"],
  pendaftaran: ["pendaftaran", "pmb", "daftar", "registrasi"],
  profil: ["profil", "sejarah", "rektor", "pimpinan", "yayasan"],
  visi_misi: ["visi", "misi", "tujuan"],
};

function normalizeText(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function tokenize(text = "") {
  return normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 1 && !DEFAULT_STOPWORDS.has(token));
}

function getIdAliases(id = "") {
  const normalized = normalizeText(String(id).replace(/_/g, " "));
  const parts = normalized
    .split(" ")
    .filter((part) => part.length > 1 && !DEFAULT_STOPWORDS.has(part));
  return [normalized, ...parts];
}

function getTitleAliases(title = "") {
  const normalized = normalizeText(title);
  const tokens = tokenize(normalized);
  const pairs = tokens
    .map((token, index) => [token, tokens[index + 1]].filter(Boolean).join(" "))
    .filter((pair) => pair.split(" ").length === 2);
  return [normalized, ...tokens, ...pairs];
}

function getContentAliases(content = "") {
  const normalized = normalizeText(content);
  if (!normalized) return [];

  const sentences = String(content)
    .split(/[\n.?!]/)
    .map(normalizeText)
    .filter((line) => line.length >= 8 && line.length <= 90)
    .slice(0, 10);
  const headingLike = String(content)
    .split("\n")
    .map((line) => line.replace(/^[-\d.)\s]+/, ""))
    .map(normalizeText)
    .filter((line) => line.length >= 4 && line.length <= 70)
    .slice(0, 12);
  const strongTokens = tokenize(normalized)
    .filter((token) => token.length >= 4)
    .slice(0, 80);

  return [...sentences, ...headingLike, ...strongTokens];
}

export function buildDatasetAliasesForItem(item = {}) {
  const category = normalizeText(item.category);
  return unique([
    category,
    ...getIdAliases(item.id),
    ...getTitleAliases(item.title),
    ...(item.keywords || []),
    ...(CATEGORY_ALIAS_BANK[category] || []),
    ...getContentAliases(item.content),
  ]).slice(0, 180);
}

export function buildDatasetAliasIndex(items = []) {
  return items.map((item) => {
    const aliases = buildDatasetAliasesForItem(item);
    return {
      id: item.id,
      category: normalizeText(item.category),
      title: item.title || "",
      aliases,
      aliasText: aliases.join(" "),
    };
  });
}

function scoreAliasMatch(query, queryTokens, entry) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return { score: 0, matchedAliases: [] };

  let score = 0;
  const matchedAliases = [];
  for (const alias of entry.aliases || []) {
    if (!alias || alias.length < 2) continue;
    const aliasTokens = tokenize(alias);
    const isPhrase = alias.includes(" ");
    const queryIncludesAlias = normalizedQuery.includes(alias);
    const aliasIncludesQuery =
      normalizedQuery.length >= 5 && alias.includes(normalizedQuery);
    const tokenOverlap = aliasTokens.filter((token) =>
      queryTokens.includes(token),
    ).length;

    if (queryIncludesAlias || aliasIncludesQuery) {
      score += isPhrase ? 10 : 5;
      matchedAliases.push(alias);
      continue;
    }

    if (tokenOverlap > 0) {
      score += tokenOverlap * (isPhrase ? 2.2 : 1.2);
      if (tokenOverlap >= Math.min(2, aliasTokens.length)) {
        matchedAliases.push(alias);
      }
    }
  }

  if (entry.category && normalizedQuery.includes(entry.category)) score += 3;
  if (entry.id && normalizedQuery.includes(normalizeText(entry.id))) score += 12;

  return {
    score,
    matchedAliases: unique(matchedAliases).slice(0, 8),
  };
}

export function matchDatasetReferences(query = "", aliasIndex = [], options = {}) {
  const limit = options.limit || 5;
  const queryTokens = tokenize(query);
  if (!normalizeText(query) || queryTokens.length === 0) return [];

  return aliasIndex
    .map((entry) => {
      const { score, matchedAliases } = scoreAliasMatch(
        query,
        queryTokens,
        entry,
      );
      return {
        id: entry.id,
        category: entry.category,
        title: entry.title,
        score,
        matchedAliases,
      };
    })
    .filter((item) => item.score >= 6)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function rewriteQueryWithDatasetReferences(query = "", references = []) {
  const refs = references.slice(0, 3);
  if (!refs.length) return query;
  const refText = refs
    .flatMap((ref) => [
      ref.id,
      ref.title,
      ...(ref.matchedAliases || []).slice(0, 3),
    ])
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
  return `${query} ${refText}`.replace(/\s+/g, " ").trim();
}
