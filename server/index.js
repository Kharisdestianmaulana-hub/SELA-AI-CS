import express from "express";
import cors from "cors";
import multer from "multer";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });
config({ path: join(__dirname, "..", ".env.local"), override: true });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS || 20000);
const CHAT_PROVIDER_COOLDOWN_MS = Number(
  process.env.CHAT_PROVIDER_COOLDOWN_MS || 60000,
);
export const SELA_COMPLETION_MARKER = "<END_SELA>";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
const CHAT_FALLBACK_PROVIDERS = [
  ...new Set(
    [
      "gemini",
      ...(process.env.CHAT_FALLBACK_PROVIDERS || "groq,openrouter")
        .split(",")
        .map((provider) => provider.trim().toLowerCase())
        .filter(Boolean),
    ].filter(Boolean),
  ),
];
const chatProviderCooldowns = new Map();
const GEMINI_TRANSCRIBE_MODEL =
  process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-flash-latest";
const GROQ_TRANSCRIBE_MODEL =
  process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo";
const TRANSCRIBE_PROVIDERS = [
  ...new Set(
    (process.env.TRANSCRIBE_PROVIDERS || "groq,gemini")
      .split(",")
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean),
  ),
];
const GEMINI_TRANSCRIBE_FALLBACK_MODELS = [
  ...new Set(
    [
      GEMINI_TRANSCRIBE_MODEL,
      ...(process.env.GEMINI_TRANSCRIBE_FALLBACK_MODELS || "")
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
      "gemini-flash-latest",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-flash-lite-latest",
      GEMINI_MODEL,
    ].filter(Boolean),
  ),
];
const GEMINI_TRANSCRIBE_TIMEOUT_MS = Number(
  process.env.GEMINI_TRANSCRIBE_TIMEOUT_MS || 8000,
);
const GEMINI_TRANSCRIBE_MODEL_COOLDOWN_MS = Number(
  process.env.GEMINI_TRANSCRIBE_MODEL_COOLDOWN_MS || 60000,
);
const geminiTranscribeModelCooldowns = new Map();

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function analyzeWavAudioQuality(buffer, mimeType = "audio/wav") {
  const result = {
    supported: false,
    durationMs: 0,
    sampleRate: 0,
    channels: 0,
    normalizedRms: 0,
    maxAmplitude: 0,
    speechRatio: 0,
    silenceRatio: 1,
    clippingRatio: 0,
    avgZcr: 0,
    reason: null,
  };

  if (!buffer?.length) {
    return { ...result, reason: "empty_audio" };
  }
  if (!String(mimeType || "").includes("wav")) {
    return { ...result, reason: "unsupported_audio_quality_check" };
  }
  if (buffer.length < 48 || buffer.toString("ascii", 0, 4) !== "RIFF") {
    return { ...result, reason: "invalid_wav" };
  }

  let offset = 12;
  let fmt = null;
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === "data") {
      dataStart = chunkStart;
      dataSize = Math.min(chunkSize, buffer.length - chunkStart);
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataStart < 0 || dataSize <= 0) {
    return { ...result, reason: "wav_missing_data" };
  }
  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    return { ...result, reason: "unsupported_wav_format" };
  }

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(dataSize / bytesPerSample);
  const sampleCount = Math.max(1, frameCount);
  let squareSum = 0;
  let maxAmplitude = 0;
  let clipped = 0;
  let crossings = 0;
  let previous = 0;
  const frameSamples = Math.max(160, Math.floor(fmt.sampleRate * 0.02));
  const frameEnergies = [];
  let currentFrameSquare = 0;
  let currentFrameCount = 0;

  for (let index = 0; index < sampleCount; index++) {
    const sample = buffer.readInt16LE(dataStart + index * bytesPerSample);
    const normalized = sample / 32768;
    const abs = Math.abs(normalized);
    squareSum += normalized * normalized;
    currentFrameSquare += normalized * normalized;
    currentFrameCount += 1;
    maxAmplitude = Math.max(maxAmplitude, abs);
    if (abs > 0.97) clipped += 1;
    if (index > 0 && normalized * previous < 0) crossings += 1;
    previous = normalized;

    if (currentFrameCount >= frameSamples) {
      frameEnergies.push(Math.sqrt(currentFrameSquare / currentFrameCount));
      currentFrameSquare = 0;
      currentFrameCount = 0;
    }
  }

  if (currentFrameCount > 0) {
    frameEnergies.push(Math.sqrt(currentFrameSquare / currentFrameCount));
  }

  const normalizedRms = Math.sqrt(squareSum / sampleCount);
  const sortedEnergies = [...frameEnergies].sort((a, b) => a - b);
  const noiseFloor =
    sortedEnergies[Math.floor(sortedEnergies.length * 0.2)] || normalizedRms;
  const speechThreshold = Math.max(0.01, noiseFloor * 2.4);
  const speechFrames = frameEnergies.filter(
    (energy) => energy >= speechThreshold,
  ).length;
  const speechRatio =
    frameEnergies.length > 0 ? speechFrames / frameEnergies.length : 0;
  const durationMs =
    fmt.sampleRate > 0
      ? Math.round((sampleCount / fmt.channels / fmt.sampleRate) * 1000)
      : 0;

  return {
    supported: true,
    durationMs,
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    normalizedRms: Number(normalizedRms.toFixed(5)),
    maxAmplitude: Number(maxAmplitude.toFixed(4)),
    speechRatio: Number(clamp(speechRatio, 0, 1).toFixed(3)),
    silenceRatio: Number(clamp(1 - speechRatio, 0, 1).toFixed(3)),
    clippingRatio: Number((clipped / sampleCount).toFixed(5)),
    avgZcr: Number((crossings / Math.max(1, sampleCount - 1)).toFixed(4)),
    reason: null,
  };
}

/**
 * Downsample WAV buffer dari sample rate tinggi (44100/48000 Hz) ke target rate (16000 Hz).
 * STT models (Whisper, Gemini) optimal di 16 kHz. Audio 44.1 kHz sering menyebabkan
 * halusinasi pada Whisper karena ada frekuensi tinggi yang tidak relevan untuk speech.
 * Return buffer asli jika bukan WAV atau sudah di target rate.
 */
function downsampleWavBuffer(buffer, targetRate = 16000) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return buffer;

  // Validasi header WAV
  const riff = buffer.toString("ascii", 0, 4);
  const wave = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") return buffer; // bukan WAV

  const audioFormat = buffer.readUInt16LE(20);
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  // Hanya proses PCM 16-bit
  if (audioFormat !== 1 || bitsPerSample !== 16) return buffer;
  // Sudah di target rate atau lebih rendah
  if (sampleRate <= targetRate) return buffer;

  console.log(`[transcribe] Downsampling WAV: ${sampleRate} Hz → ${targetRate} Hz`);

  // Cari data chunk
  let dataOffset = 12;
  let dataSize = 0;
  while (dataOffset + 8 < buffer.length) {
    const chunkId = buffer.toString("ascii", dataOffset, dataOffset + 4);
    const chunkSize = buffer.readUInt32LE(dataOffset + 4);
    if (chunkId === "data") {
      dataOffset += 8;
      dataSize = Math.min(chunkSize, buffer.length - dataOffset);
      break;
    }
    dataOffset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataSize <= 0) return buffer;

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor(dataSize / (bytesPerSample * channels));
  const ratio = sampleRate / targetRate;
  const newTotalSamples = Math.floor(totalSamples / ratio);

  // Buat buffer baru dengan header WAV yang benar
  const newDataSize = newTotalSamples * bytesPerSample; // mono output
  const newBuffer = Buffer.alloc(44 + newDataSize);

  // Write WAV header
  newBuffer.write("RIFF", 0, "ascii");
  newBuffer.writeUInt32LE(36 + newDataSize, 4);
  newBuffer.write("WAVE", 8, "ascii");
  newBuffer.write("fmt ", 12, "ascii");
  newBuffer.writeUInt32LE(16, 16); // fmt chunk size
  newBuffer.writeUInt16LE(1, 20);  // PCM
  newBuffer.writeUInt16LE(1, 22);  // mono
  newBuffer.writeUInt32LE(targetRate, 24);
  newBuffer.writeUInt32LE(targetRate * bytesPerSample, 28); // byte rate
  newBuffer.writeUInt16LE(bytesPerSample, 32); // block align
  newBuffer.writeUInt16LE(bitsPerSample, 34);
  newBuffer.write("data", 36, "ascii");
  newBuffer.writeUInt32LE(newDataSize, 40);

  // Resample dengan linear interpolation
  for (let i = 0; i < newTotalSamples; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    const bytePos1 = dataOffset + srcIdx * bytesPerSample * channels;
    const bytePos2 = dataOffset + Math.min(srcIdx + 1, totalSamples - 1) * bytesPerSample * channels;

    if (bytePos1 + 1 >= buffer.length || bytePos2 + 1 >= buffer.length) break;

    const sample1 = buffer.readInt16LE(bytePos1);
    const sample2 = buffer.readInt16LE(bytePos2);
    const interpolated = Math.round(sample1 + (sample2 - sample1) * frac);
    const clamped = Math.max(-32768, Math.min(32767, interpolated));

    newBuffer.writeInt16LE(clamped, 44 + i * bytesPerSample);
  }

  console.log(`[transcribe] Downsampled: ${buffer.length} bytes → ${newBuffer.length} bytes`);
  return newBuffer;
}

export function shouldRejectAudioBeforeStt(quality = {}, clientMeta = {}) {
  const vad = clientMeta?.vad || {};
  const isManualStop = !!clientMeta?.manualStop;
  if (quality.supported) {
    if (quality.durationMs > 0 && quality.durationMs < 450) {
      return { reject: true, reason: "audio_too_short" };
    }
    if (quality.normalizedRms > 0 && quality.normalizedRms < 0.0045) {
      return { reject: true, reason: "audio_too_quiet" };
    }
    if (quality.speechRatio < 0.025 && quality.durationMs > 700) {
      return { reject: true, reason: "low_speech_ratio" };
    }
    if (quality.clippingRatio > 0.12) {
      return { reject: true, reason: "audio_clipping_noise" };
    }
  }

  // Bypass client VAD checks jika user sengaja menekan tombol mic untuk stop
  if (isManualStop) {
    return { reject: false, reason: null };
  }

  if (vad.frames > 0) {
    if (Number(vad.speechLikeRatio || 0) < 0.05) {
      return { reject: true, reason: "client_low_speechlike_ratio" };
    }
    if (Number(vad.gatedSpeechFrames || 0) < 2) {
      return { reject: true, reason: "client_no_gated_speech" };
    }
    if (vad.mouthTrackingAvailable && !vad.mouthActiveDuringSpeech) {
      return { reject: true, reason: "client_no_mouth_activity" };
    }
  }

  return { reject: false, reason: null };
}

function buildGeminiPayload(messages = [], userQuery = "") {
  const systemText = messages
    .filter((message) => message?.role === "system" && message?.content)
    .map((message) => message.content)
    .join("\n\n");

  const conversationContents = messages
    .filter((message) => message?.role !== "system" && message?.content)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const contents =
    conversationContents.length > 0
      ? conversationContents
      : [
          {
            role: "user",
            parts: [{ text: userQuery || "" }],
          },
        ];

  return {
    systemInstruction: systemText
      ? {
          parts: [{ text: systemText }],
        }
      : undefined,
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 420,
    },
  };
}

function extractGeminiText(data) {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim() || ""
  );
}

export function looksLikeIncompleteChatAnswer(text = "") {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return true;
  if (!clean.includes(SELA_COMPLETION_MARKER)) return true;

  const answerOnly = stripCompletionMarker(clean);
  if (!answerOnly) return true;
  if (answerOnly.length < 70) return true;

  const lower = answerOnly.toLowerCase();
  const lastWord = lower
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .pop();
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
    "dengan",
    "pada",
    "ke",
    "di",
    "dari",
    "lalu",
    "kemudian",
    "teknik",
    "s1",
    "d3",
  ]);

  if (lastWord && danglingWords.has(lastWord)) return true;
  if (/[,:;]$/.test(answerOnly)) return true;
  if (!/[.!?)]$/.test(answerOnly)) {
    if (
      answerOnly.length >= 90 &&
      /\b(rekomendasi|jurusan|paling sesuai|minat|lebih tertarik|coding|desain|bisnis|keuangan|olahraga)\b/i.test(
        answerOnly,
      )
    ) {
      return false;
    }
    return answerOnly.length < 220;
  }

  return false;
}

export function stripCompletionMarker(text = "") {
  return String(text || "")
    .replaceAll(SELA_COMPLETION_MARKER, "")
    .trim();
}

function assertCompleteChatAnswer(text = "", provider = "provider") {
  if (!looksLikeIncompleteChatAnswer(text)) return;
  const error = new Error(`${provider} mengembalikan jawaban tidak lengkap`);
  error.status = 502;
  error.provider = provider;
  error.text = stripCompletionMarker(text);
  throw error;
}

async function createGeminiChatCompletion(messages = [], userQuery = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum diatur di .env.local");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify(buildGeminiPayload(messages, userQuery)),
  }).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data?.error?.message || `Gemini API gagal dengan status ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.provider = "gemini";
    throw error;
  }

  const text = extractGeminiText(data);
  if (!text) throw new Error("Gemini API mengembalikan respons kosong");
  assertCompleteChatAnswer(text, "gemini");
  return stripCompletionMarker(text);
}

export function buildOpenAIChatPayload(messages = []) {
  return {
    model: "",
    messages: messages
      .filter((message) => message?.role && message?.content)
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : message.role,
        content: message.content,
      })),
    temperature: 0.6,
    max_tokens: 420,
  };
}

function extractOpenAIChatText(data) {
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function createOpenAICompatibleChatCompletion({
  provider,
  endpoint,
  apiKey,
  model,
  messages = [],
  extraHeaders = {},
} = {}) {
  if (!apiKey) throw new Error(`${provider} API key belum diatur`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  const payload = {
    ...buildOpenAIChatPayload(messages),
    model,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    signal: controller.signal,
    body: JSON.stringify(payload),
  }).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data?.error?.message ||
      data?.message ||
      `${provider} API gagal dengan status ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.provider = provider;
    throw error;
  }

  const text = extractOpenAIChatText(data);
  if (!text) throw new Error(`${provider} mengembalikan respons kosong`);
  assertCompleteChatAnswer(text, provider);
  return stripCompletionMarker(text);
}

async function createGroqChatCompletion(messages = []) {
  return createOpenAICompatibleChatCompletion({
    provider: "groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: process.env.GROQ_API_KEY,
    model: GROQ_MODEL,
    messages,
  });
}

async function createOpenRouterChatCompletion(messages = []) {
  return createOpenAICompatibleChatCompletion({
    provider: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: process.env.OPENROUTER_API_KEY,
    model: OPENROUTER_MODEL,
    messages,
    extraHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:5173",
      "X-Title": process.env.OPENROUTER_APP_NAME || "SELA AI CS",
    },
  });
}

function shouldTryNextChatProvider(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    error?.status === 401 ||
    error?.status === 402 ||
    error?.status === 403 ||
    error?.status === 404 ||
    error?.status === 408 ||
    error?.status === 409 ||
    error?.status === 429 ||
    error?.status === 500 ||
    error?.status === 502 ||
    error?.status === 503 ||
    error?.status === 504 ||
    message.includes("api key") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("timeout") ||
    message.includes("operation was aborted") ||
    message.includes("internal error") ||
    message.includes("jawaban tidak lengkap") ||
    message.includes("incomplete") ||
    message.includes("temporarily unavailable")
  );
}

function getAvailableChatProviders() {
  const now = Date.now();
  const availableProviders = CHAT_FALLBACK_PROVIDERS.filter((provider) => {
    const cooldownUntil = chatProviderCooldowns.get(provider) || 0;
    return cooldownUntil <= now;
  });

  return availableProviders.length > 0
    ? availableProviders
    : CHAT_FALLBACK_PROVIDERS;
}

function coolDownChatProvider(provider, error) {
  if (!provider || !shouldTryNextChatProvider(error)) return;
  chatProviderCooldowns.set(provider, Date.now() + CHAT_PROVIDER_COOLDOWN_MS);
}

async function createChatCompletionWithFallback(messages = [], userQuery = "") {
  let lastError = null;
  let lastIncompleteResult = null;
  const providers = getAvailableChatProviders();

  for (const provider of providers) {
    try {
      console.log("[SELA Chat] Trying provider:", provider);
      if (provider === "gemini") {
        return {
          provider,
          text: await createGeminiChatCompletion(messages, userQuery),
        };
      }
      if (provider === "groq") {
        return {
          provider,
          text: await createGroqChatCompletion(messages),
        };
      }
      if (provider === "openrouter") {
        return {
          provider,
          text: await createOpenRouterChatCompletion(messages),
        };
      }
      console.warn("[SELA Chat] Provider tidak dikenal, skip:", provider);
    } catch (error) {
      lastError = error;
      if (
        error?.status === 502 &&
        String(error?.message || "").includes("jawaban tidak lengkap") &&
        error?.text
      ) {
        lastIncompleteResult = {
          provider,
          text: error.text,
          incomplete: true,
        };
      }
      console.warn("[SELA Chat] Provider failed", {
        provider,
        status: error?.status,
        message: error?.message,
      });
      coolDownChatProvider(provider, error);
      if (!shouldTryNextChatProvider(error)) break;
    }
  }

  if (lastIncompleteResult) {
    console.warn("[SELA Chat] Returning incomplete answer for frontend repair", {
      provider: lastIncompleteResult.provider,
      chars: lastIncompleteResult.text.length,
      preview: lastIncompleteResult.text.slice(0, 300),
    });
    return lastIncompleteResult;
  }

  throw lastError || new Error("Semua provider chat gagal");
}

function buildTranscriptionInstruction(lang = "id") {
  if (lang === "en") {
    return [
      "Transcribe the visitor's speech into plain text only.",
      "Keep UCIC-related terms exactly when heard: SELA, UCIC, PMB, faculty, program, major, registration, tuition, admission.",
      "Do not add markdown, timestamps, speaker labels, explanations, or translations.",
      "If the audio is empty, noise, music, or unclear, return an empty string.",
    ].join(" ");
  }

  return [
    "Transkripkan ucapan pengunjung menjadi teks pertanyaan singkat dalam Bahasa Indonesia.",
    "Pertahankan istilah kampus jika terdengar: SELA, UCIC, Universitas Catur Insan Cendekia, PMB, prodi, jurusan, biaya, pendaftaran, fakultas.",
    "Jangan tambahkan markdown, timestamp, label pembicara, penjelasan, atau terjemahan.",
    "Jika audio kosong, noise, musik, atau tidak jelas, balas string kosong.",
  ].join(" ");
}

export function normalizeGeminiMediaMimeType(mimeType = "audio/webm") {
  const cleanMimeType = String(mimeType || "audio/webm")
    .split(";")[0]
    .trim()
    .toLowerCase();

  return cleanMimeType || "audio/webm";
}

export function buildGeminiTranscriptionPayload({
  audioBase64,
  mimeType = "audio/webm",
  lang = "id",
} = {}) {
  const geminiMimeType = normalizeGeminiMediaMimeType(mimeType);

  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildTranscriptionInstruction(lang) },
          {
            inline_data: {
              mime_type: geminiMimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 120,
    },
  };
}

export function extractGeminiTranscriptionText(data) {
  const text = extractGeminiText(data)
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim();

  if (/^(empty|string kosong|no speech|unclear audio)$/i.test(text)) {
    return "";
  }

  return text;
}

export async function createGeminiTranscription({
  buffer,
  mimeType = "audio/webm",
  lang = "id",
  model = GEMINI_TRANSCRIBE_MODEL,
} = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY belum diatur di .env.local");
  }
  if (!buffer?.length) return "";
  const geminiMimeType = normalizeGeminiMediaMimeType(mimeType);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GEMINI_TRANSCRIBE_TIMEOUT_MS,
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify(
      buildGeminiTranscriptionPayload({
        audioBase64: buffer.toString("base64"),
        mimeType: geminiMimeType,
        lang,
      }),
    ),
  }).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data?.error?.message ||
      `Gemini transcription gagal dengan status ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.model = model;
    throw error;
  }

  return extractGeminiTranscriptionText(data);
}

export async function createGroqTranscription({
  buffer,
  mimeType = "audio/wav",
  lang = "id",
  model = GROQ_TRANSCRIBE_MODEL,
} = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY belum diatur di .env.local");
  }
  if (!buffer?.length) return "";

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GEMINI_TRANSCRIBE_TIMEOUT_MS,
  );
  const extension = normalizeGeminiMediaMimeType(mimeType).includes("wav")
    ? "wav"
    : "webm";
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: mimeType }), `audio.${extension}`);
  formData.append("model", model);
  formData.append("temperature", "0");
  formData.append("response_format", "verbose_json");
  formData.append("language", lang === "en" ? "en" : "id");
  formData.append(
    "prompt",
    lang === "en"
      ? "UCIC campus admission question. Keep terms: UCIC, SELA, PMB, program, major, tuition, registration."
      : "Pertanyaan calon mahasiswa tentang UCIC. Pertahankan istilah: UCIC, SELA, PMB, prodi, jurusan, biaya, pendaftaran.",
  );

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: formData,
    },
  ).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      data?.error?.message ||
      data?.message ||
      `Groq transcription gagal dengan status ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.provider = "groq";
    throw error;
  }

  const text = String(data?.text || "").trim();
  const detectedLang = data?.language || null;
  const segments = Array.isArray(data?.segments) ? data.segments : [];
  if (segments.length > 0) {
    const avgNoSpeech =
      segments.reduce(
        (sum, segment) => sum + Number(segment.no_speech_prob || 0),
        0,
      ) / segments.length;
    const avgLogProb =
      segments.reduce(
        (sum, segment) => sum + Number(segment.avg_logprob || 0),
        0,
      ) / segments.length;

    console.log("[transcribe] Groq verbose_json details", {
      detectedLang,
      requestedLang: lang,
      avgNoSpeech: Number(avgNoSpeech.toFixed(3)),
      avgLogProb: Number(avgLogProb.toFixed(3)),
      segmentCount: segments.length,
      text: text.slice(0, 120),
    });

    if (avgNoSpeech >= 0.72 && text.length < 80) {
      console.log("[transcribe] Groq filtered high no_speech_prob", {
        avgNoSpeech: Number(avgNoSpeech.toFixed(3)),
        text,
      });
      return "";
    }
    if (avgLogProb < -1.25 && text.length < 60) {
      console.log("[transcribe] Groq filtered low avg_logprob", {
        avgLogProb: Number(avgLogProb.toFixed(3)),
        text,
      });
      return "";
    }
  }

  // Deteksi halusinasi bahasa — Whisper kadang output teks Islandia/Nordik
  // meskipun language param sudah benar. Cek karakter non-Indonesian di teks hasil.
  // Bahasa Indonesia hanya pakai huruf Latin dasar (a-z), tanpa aksen/diacritics.
  if (lang === "id" && text.length > 0) {
    const nonLatinBasic = text.replace(/[a-zA-Z0-9\s.,!?;:'"()\-\/\\@#%&*+=\[\]{}|~`^_<>]/g, "");
    const nonLatinRatio = nonLatinBasic.length / text.length;
    if (nonLatinRatio > 0.08) {
      console.log("[transcribe] Groq hallucination detected — non-Indonesian characters", {
        text: text.slice(0, 120),
        nonLatinChars: nonLatinBasic.slice(0, 40),
        nonLatinRatio: Number(nonLatinRatio.toFixed(3)),
        detectedLang,
      });
      const error = new Error(`Groq hallucinated non-Indonesian text (${(nonLatinRatio * 100).toFixed(0)}% non-Latin)`);
      error.status = 422;
      error.provider = "groq";
      throw error;
    }
  }

  return text;
}

function shouldTryNextGeminiModel(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.status === 404 ||
    error?.status === 429 ||
    error?.status === 500 ||
    error?.status === 503 ||
    message.includes("no longer available") ||
    message.includes("not found") ||
    message.includes("internal error") ||
    message.includes("high demand") ||
    message.includes("operation was aborted") ||
    message.includes("timeout") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable") ||
    error?.name === "AbortError"
  );
}

function getAvailableGeminiTranscriptionModels() {
  const now = Date.now();
  const availableModels = GEMINI_TRANSCRIBE_FALLBACK_MODELS.filter((model) => {
    const cooldownUntil = geminiTranscribeModelCooldowns.get(model) || 0;
    return cooldownUntil <= now;
  });

  return availableModels.length > 0
    ? availableModels
    : GEMINI_TRANSCRIBE_FALLBACK_MODELS;
}

function coolDownGeminiTranscriptionModel(model, error) {
  if (!model || !shouldTryNextGeminiModel(error)) return;
  geminiTranscribeModelCooldowns.set(
    model,
    Date.now() + GEMINI_TRANSCRIBE_MODEL_COOLDOWN_MS,
  );
}

async function createGeminiTranscriptionWithFallback({
  buffer,
  mimeType,
  lang,
} = {}) {
  let lastError = null;
  const models = getAvailableGeminiTranscriptionModels();

  for (const model of models) {
    try {
      console.log("[transcribe] Trying Gemini transcription model:", model);
      return await createGeminiTranscription({
        buffer,
        mimeType,
        lang,
        model,
      });
    } catch (error) {
      lastError = error;
      console.warn("[transcribe] Gemini transcription model failed", {
        model,
        status: error?.status,
        message: error?.message,
      });
      coolDownGeminiTranscriptionModel(model, error);
      if (!shouldTryNextGeminiModel(error)) break;
    }
  }

  throw lastError || new Error("Gemini transcription gagal");
}

function shouldTryNextTranscriptionProvider(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.name === "AbortError" ||
    error?.status === 400 ||
    error?.status === 401 ||
    error?.status === 403 ||
    error?.status === 408 ||
    error?.status === 409 ||
    error?.status === 422 ||
    error?.status === 429 ||
    error?.status === 500 ||
    error?.status === 502 ||
    error?.status === 503 ||
    error?.status === 504 ||
    message.includes("timeout") ||
    message.includes("operation was aborted") ||
    message.includes("rate limit") ||
    message.includes("high demand") ||
    message.includes("overloaded") ||
    message.includes("internal error") ||
    message.includes("temporarily unavailable")
  );
}

async function createTranscriptionWithProviderFallback({
  buffer,
  mimeType,
  lang,
} = {}) {
  let lastError = null;

  for (const provider of TRANSCRIBE_PROVIDERS) {
    try {
      console.log("[transcribe] Trying transcription provider:", provider);
      if (provider === "groq") {
        return {
          provider,
          text: await createGroqTranscription({ buffer, mimeType, lang }),
        };
      }
      if (provider === "gemini") {
        return {
          provider,
          text: await createGeminiTranscriptionWithFallback({
            buffer,
            mimeType,
            lang,
          }),
        };
      }
      console.warn("[transcribe] Provider tidak dikenal, skip:", provider);
    } catch (error) {
      lastError = error;
      console.warn("[transcribe] Transcription provider failed", {
        provider,
        status: error?.status,
        message: error?.message,
      });
      if (!shouldTryNextTranscriptionProvider(error)) break;
    }
  }

  throw lastError || new Error("Semua provider transkripsi gagal");
}

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
    const rawBuffer = req.file.buffer;
    const mimeType = req.file.mimetype || "audio/webm";
    const metadata = parseJsonField(req.body.metadata, {});

    // Downsample WAV dari 44100/48000 Hz ke 16000 Hz untuk STT yang lebih akurat
    const buffer = downsampleWavBuffer(rawBuffer, 16000);

    const audioQuality = analyzeWavAudioQuality(buffer, mimeType);
    const preSttValidation = shouldRejectAudioBeforeStt(
      audioQuality,
      metadata,
    );

    console.log("[transcribe] Calling audio transcription...", {
      providers: TRANSCRIBE_PROVIDERS,
      geminiModels: GEMINI_TRANSCRIBE_FALLBACK_MODELS,
      groqModel: GROQ_TRANSCRIBE_MODEL,
      mimeType,
      geminiMimeType: normalizeGeminiMediaMimeType(mimeType),
      size: buffer.length,
      lang,
      audioQuality,
      clientVad: metadata?.vad || null,
    });

    if (preSttValidation.reject) {
      console.log("[transcribe] ⚠ FILTERED before STT", {
        reason: preSttValidation.reason,
        audioQuality,
        clientVad: metadata?.vad || null,
      });
      return res.json({
        text: "",
        reason: preSttValidation.reason,
        audioQuality,
      });
    }

    const transcribeStartedAt = Date.now();
    const transcription = await createTranscriptionWithProviderFallback({
      buffer,
      mimeType,
      lang,
    });
    const transcribedText = transcription.text;
    console.log("[transcribe] Transcription returned", {
      provider: transcription.provider,
      elapsed: Date.now() - transcribeStartedAt,
      chars: transcribedText.length,
      preview: transcribedText.slice(0, 60),
    });

    // ── Post-transcription validation ────────────────────────────────────

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

    const transcriptValidation = validateTranscriptCandidate(
      transcribedText,
      metadata,
    );
    if (!transcriptValidation.valid) {
      console.log("[transcribe] ⚠ FILTERED transcript validation", {
        reason: transcriptValidation.reason,
        transcript: transcribedText.slice(0, 80),
        validation: transcriptValidation,
      });
      return res.json({
        text: "",
        reason: transcriptValidation.reason,
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

    console.log(
      `[transcribe] Success via ${transcription.provider}: "${transcribedText.slice(0, 60)}..."`,
    );
    res.json({ text: transcribedText, provider: transcription.provider });
  } catch (err) {
    console.error("[transcribe] Full error:", {
      message: err?.message,
      name: err?.name,
      status: err?.status,
      code: err?.code,
      type: err?.type,
      stack: err?.stack,
    });
    res.status(500).json({
      error: "Gagal mengenali suara.",
      detail:
        err?.name === "AbortError"
          ? `Gemini transcription timeout setelah ${GEMINI_TRANSCRIBE_TIMEOUT_MS}ms`
          : err?.message,
      status: err?.status,
      hint: "Pastikan GEMINI_API_KEY valid dan format audio didukung Gemini",
    });
  }
});

/**
 * Deteksi pola background audio yang umum
 * Cegah transcriptions yang seperti iklan, musik, atau broadcast
 */
export function detectBackgroundAudio(text, lang) {
  if (!text) return false;

  const lower = text.toLowerCase().trim();

  const directFarewellPatterns = [
    /^(terima\s*kasih|makasih|thanks|thank you)\.?$/,
    /^(dadah|bye|sampai jumpa|sampai bertemu|selamat tinggal)\.?$/,
  ];

  if (directFarewellPatterns.some((pattern) => pattern.test(lower))) {
    return false;
  }

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
      /^(saya|aku|gua|gue|mau|ingin|bingung|butuh|tolong|daftar|biaya|jurusan|prodi|fasilitas)\b/,
      /\b(bingung|daftar|biaya|jurusan|prodi|ucic|pmb)\b/,
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

function normalizeTranscriptForValidation(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptSimilarity(a = "", b = "") {
  const tokensA = normalizeTranscriptForValidation(a)
    .split(" ")
    .filter((token) => token.length > 2);
  const tokensB = normalizeTranscriptForValidation(b)
    .split(" ")
    .filter((token) => token.length > 2);
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const overlap = [...setA].filter((token) => setB.has(token)).length;
  return overlap / Math.max(1, Math.min(setA.size, setB.size));
}

export function validateTranscriptCandidate(text = "", metadata = {}) {
  const normalized = normalizeTranscriptForValidation(text);
  if (!normalized) return { valid: false, reason: "empty_transcript" };

  const words = normalized.split(" ").filter(Boolean);
  const lastSelaSpeech = metadata?.lastSelaSpeech || "";
  const echoSimilarity = transcriptSimilarity(normalized, lastSelaSpeech);
  if (
    lastSelaSpeech &&
    echoSimilarity >= 0.78 &&
    normalized.length >= 12
  ) {
    return {
      valid: false,
      reason: "likely_sela_echo",
      echoSimilarity: Number(echoSimilarity.toFixed(3)),
    };
  }

  const shortButValidPatterns = [
    /^(apa|berapa|siapa|kapan|dimana|di mana|gimana|bagaimana|kenapa)\b/,
    /\b(ucic|pmb|daftar|pendaftaran|biaya|jurusan|prodi|fasilitas|beasiswa|krs|khs|dosen|kampus|kuliah|kelas|akreditasi|alamat|kontak|perpustakaan|skripsi|wisuda)\b/,
    /^(saya|aku|mau|ingin|bingung|butuh|tolong)\b/,
    /^(ya|iya|tidak|nggak|enggak|teknologi|coding|desain|bisnis|olahraga)\b/,
  ];
  const looksValidShort = shortButValidPatterns.some((pattern) =>
    pattern.test(normalized),
  );

  if (words.length <= 3 && normalized.length < 22 && !looksValidShort) {
    return { valid: false, reason: "ambiguous_short_transcript" };
  }

  const hasCampusOrQuestionSignal = shortButValidPatterns.some((pattern) =>
    pattern.test(normalized),
  );
  if (
    words.length <= 4 &&
    !hasCampusOrQuestionSignal &&
    Number(metadata?.vad?.gatedSpeechFrames || 0) < 4
  ) {
    return { valid: false, reason: "weak_context_random_transcript" };
  }

  return {
    valid: true,
    reason: null,
    echoSimilarity: Number(echoSimilarity.toFixed(3)),
  };
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

    // Gemini tetap primary. Groq/OpenRouter dipakai hanya saat provider sebelumnya gagal.
    const chatResult = await createChatCompletionWithFallback(messages, userQuery);

    console.log("[SELA Chat] Provider success:", {
      provider: chatResult.provider,
      chars: chatResult.text.length,
      preview: chatResult.text.slice(0, 500),
    });
    res.json({
      text: chatResult.text,
      provider: chatResult.provider,
      incomplete: Boolean(chatResult.incomplete),
    });
  } catch (err) {
    console.error("[SELA Chat] All providers failed:", {
      message: err?.message,
      stack: err?.stack,
    });
    res.status(500).json({ error: "Gagal mendapat respons AI." });
  }
});

const PORT = process.env.SERVER_PORT || 3001;
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(PORT, () => {
    console.log(`SELA backend running on http://localhost:${PORT}`);
  });
}

export { app };
