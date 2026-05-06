import { File } from "node:buffer";
if (!globalThis.File) globalThis.File = File;

import express from "express";
import cors from "cors";
import multer from "multer";
import Groq, { toFile } from "groq-sdk";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Intent Detection ──────────────────────────────────────────────────────────
// Klasifikasi pertanyaan sebelum diproses — menentukan jalur terbaik

const SMALL_TALK_PATTERNS = [
  "halo",
  "hai",
  " hi ",
  "hello",
  "hey",
  "siapa kamu",
  "kamu siapa",
  "nama kamu",
  "kamu apa",
  "apa itu sela",
  "apa kabar",
  "gimana kabar",
  "baik-baik",
  "selamat pagi",
  "selamat siang",
  "selamat sore",
  "selamat malam",
  "good morning",
  "good afternoon",
  "good evening",
  "good night",
  "how are you",
  "who are you",
  "what are you",
  "introduce yourself",
  "perkenalkan",
  "kenalkan",
];

const CAMPUS_PATTERNS = [
  "ucic",
  "universitas",
  "kampus",
  "mahasiswa",
  "mahasiswi",
  "fakultas",
  "jurusan",
  "prodi",
  "program studi",
  "pendaftaran",
  "pmb",
  "daftar kuliah",
  "kuliah di",
  "wisuda",
  "akademik",
  "dosen",
  "semester",
  "sks",
  "ipk",
  "beasiswa",
  "krs",
  "khs",
  "ospek",
  "orientasi",
  "catur insan",
  "cirebon",
];

/**
 * Deteksi intent dari query user (rule-based, tanpa latency API call)
 * @returns {'small_talk' | 'campus' | 'general' | 'unclear'}
 */
function detectIntent(query) {
  const q = " " + query.toLowerCase().trim() + " ";
  if (q.trim().length < 3) return "unclear";
  if (SMALL_TALK_PATTERNS.some((p) => q.includes(p))) return "small_talk";
  if (CAMPUS_PATTERNS.some((p) => q.includes(p))) return "campus";
  return "general";
}

// Web search functionality and Query rewriting have been removed.
// SELA will now purely rely on Local RAG and internal prompts.

// ── POST /api/transcribe ──────────────────────────────────────────────────────
app.post("/api/transcribe", upload.single("file"), async (req, res) => {
  try {
    console.log(
      "[transcribe] req.file:",
      req.file
        ? `name=${req.file.originalname} size=${req.file.size}`
        : "UNDEFINED",
    );
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const lang = req.body.lang || "id";
    const buffer = req.file.buffer;
    const fileName = req.file.originalname || "audio.webm";

    const file = await toFile(buffer, fileName, {
      type: req.file.mimetype || "audio/webm",
    });

    // Prompt kaya: kata kampus + kata percakapan sehari-hari agar Whisper lebih akurat
    const promptID =
      "SELA, UCIC, Universitas Catur Insan Cendekia, Cirebon, kampus, mahasiswa, akademik, fakultas, pendaftaran, beasiswa, wisuda, oke, ya, tidak, gimana, kenapa, kapan, di mana, berapa, siapa, tolong, bisa, mau, ingin, bagaimana, apakah, dong, sih, nih, loh, deh, emang, memang, banget";
    const promptEN =
      "SELA, UCIC, Universitas Catur Insan Cendekia, Cirebon, campus, student, academic, faculty, registration, scholarship, graduation, okay, yes, no, how, why, when, where, how much, who, please, can, want, would like, really, actually";

    console.log(`[transcribe] Calling Groq Whisper API with lang=${lang}...`);
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
      language: lang,
      response_format: "json",
      prompt: lang === "en" ? promptEN : promptID,
    });

    // ── Post-transcription validation ────────────────────────────────────
    const transcribedText = transcription.text || "";

    // Filter out typical background audio patterns
    const isBackgroundAudio = detectBackgroundAudio(transcribedText, lang);

    if (isBackgroundAudio) {
      console.log(
        `[transcribe] ⚠ FILTERED: Background audio detected: "${transcribedText.slice(0, 50)}..."`,
      );
      return res.json({
        text: "",
        reason: "Background audio detected - likely not a real question",
        originalTranscript: transcribedText,
      });
    }

    // Filter extremely short transcriptions that are likely noise
    if (transcribedText.trim().length < 5) {
      console.log(`[transcribe] ⚠ FILTERED: Too short: "${transcribedText}"`);
      return res.json({
        text: "",
        reason: "Transcription too short - likely noise",
      });
    }

    console.log(`[transcribe] Success: "${transcribedText.slice(0, 60)}..."`);
    res.json({ text: transcribedText });
  } catch (err) {
    console.error("[transcribe] Full error:", {
      message: err?.message,
      status: err?.status,
      code: err?.code,
      type: err?.type,
      stack: err?.stack,
    });
    console.error("Full error object:", err);
    res.status(500).json({
      error: "Gagal mengenali suara.",
      detail: err?.message,
      status: err?.status,
      hint: "Pastikan API key Groq valid dan aktif",
    });
  }
});

/**
 * Deteksi pola background audio yang umum
 * Cegah transcriptions yang seperti iklan, musik, atau broadcast
 */
function detectBackgroundAudio(text, lang) {
  if (!text) return false;

  const lower = text.toLowerCase().trim();

  // Common background audio patterns (ads, intros, outros, etc)
  const bgPatterns = [
    // Perkenalan/intro
    /^(terima kasih telah|thanks for|welcome to|selamat datang)/i,
    /^(subscribe|subscrib|subscribe now|like and share)/i,
    /^(don't forget to|jangan lupa)/i,
    // Penutupan/outro
    /(goodbye|goodbye|farewell|goodbye|see you|cepatnya|sampai jumpa)/i,
    // Music/ambient
    /^(♪|music|lagu|nyanyian|instrumental)/i,
    // Iklan panjang > 50 chars dari brand atau tawaran
    /^(promo|promosi|diskon|special offer|gratis)/i,
  ];

  for (const pattern of bgPatterns) {
    if (pattern.test(lower)) {
      console.log(`[transcribe] BG Pattern matched: ${pattern}`);
      return true;
    }
  }

  // Deteksi jika teks tidak terlihat seperti pertanyaan atau statement valid
  // Background audio biasanya sangat singkat atau sangat spesifik
  const words = lower.split(/\s+/);

  // Jika hanya 1-2 kata dan bukan common phrases → likely background
  if (words.length <= 2 && lower.length < 15) {
    // Tapi allow short valid questions
    const shortQuestionPatterns = [
      /^(apa|berapa|siapa|kapan|dimana|gimana|kenapa|bagaimana)/,
      /^(yes|no|ya|tidak)/,
    ];
    const isValidShortQuestion = shortQuestionPatterns.some((p) =>
      p.test(lower),
    );
    if (!isValidShortQuestion) {
      return true; // Likely noise
    }
  }

  return false;
}

// ── POST /api/chat ────────────────────────────────────────────────────────────
// Terima { messages }, panggil LLM secara langsung tanpa web search tambahan
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, userQuery = "", transcriptDebug = null } = req.body;

    console.log(`[SELA Chat] Menerima pertanyaan: "${userQuery.slice(0, 50)}"`);
    if (transcriptDebug) {
      console.log("[SELA Chat] Transcript debug:", {
        raw: transcriptDebug.rawUserQuery,
        cleaned: transcriptDebug.cleanedUserQuery,
        marker: transcriptDebug.transcriptMarker,
        removedSegments: transcriptDebug.removedSegments,
      });
    }

    // Panggil LLM dengan messages komplit (System Prompt + RAG + Chat History)
    const completion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.6,
      max_tokens: 280,
    });

    const responseText = completion.choices[0]?.message?.content || "";

    res.json({ text: responseText });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Gagal mendapat respons AI." });
  }
});

const PORT = process.env.SERVER_PORT || 3001;
app.listen(PORT, () => {
  console.log(`SELA backend running on http://localhost:${PORT}`);
});
