import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeWavAudioQuality,
  buildGeminiTranscriptionPayload,
  detectBackgroundAudio,
  extractGeminiTranscriptionText,
  normalizeGeminiMediaMimeType,
  shouldRejectAudioBeforeStt,
  validateTranscriptCandidate,
} from "./index.js";

test("buildGeminiTranscriptionPayload sends inline audio data", () => {
  const payload = buildGeminiTranscriptionPayload({
    audioBase64: "YWJj",
    mimeType: "audio/ogg",
    lang: "id",
  });

  const parts = payload.contents[0].parts;

  assert.match(parts[0].text, /Transkripkan ucapan pengunjung/i);
  assert.equal(parts[1].inline_data.mime_type, "audio/ogg");
  assert.equal(parts[1].inline_data.data, "YWJj");
  assert.equal(payload.generationConfig.temperature, 0);
});

test("normalizeGeminiMediaMimeType strips codec parameters", () => {
  assert.equal(
    normalizeGeminiMediaMimeType("audio/webm;codecs=opus"),
    "audio/webm",
  );
  assert.equal(
    normalizeGeminiMediaMimeType("audio/ogg;codecs=opus"),
    "audio/ogg",
  );
});

test("extractGeminiTranscriptionText reads candidate parts", () => {
  const text = extractGeminiTranscriptionText({
    candidates: [
      {
        content: {
          parts: [{ text: "cara daftar ke UCIC gimana" }],
        },
      },
    ],
  });

  assert.equal(text, "cara daftar ke UCIC gimana");
});

test("extractGeminiTranscriptionText treats empty audio markers as empty", () => {
  assert.equal(
    extractGeminiTranscriptionText({
      candidates: [
        {
          content: {
            parts: [{ text: "unclear audio" }],
          },
        },
      ],
    }),
    "",
  );
});

test("detectBackgroundAudio allows short counselor intents", () => {
  assert.equal(detectBackgroundAudio("Saya bingung", "id"), false);
  assert.equal(detectBackgroundAudio("Mau daftar", "id"), false);
  assert.equal(detectBackgroundAudio("Biaya UCIC", "id"), false);
});

test("detectBackgroundAudio allows direct farewell phrases", () => {
  assert.equal(detectBackgroundAudio("Terima kasih.", "id"), false);
  assert.equal(detectBackgroundAudio("Makasih", "id"), false);
  assert.equal(detectBackgroundAudio("Thank you.", "en"), false);
});

test("detectBackgroundAudio still filters outro-like phrases", () => {
  assert.equal(detectBackgroundAudio("Terima kasih telah menonton", "id"), true);
  assert.equal(detectBackgroundAudio("Thanks for watching", "en"), true);
});

test("analyzeWavAudioQuality rejects quiet wav before STT", () => {
  const sampleRate = 16000;
  const samples = new Int16Array(sampleRate);
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  const quality = analyzeWavAudioQuality(buffer, "audio/wav");
  assert.equal(quality.supported, true);
  assert.equal(shouldRejectAudioBeforeStt(quality, {}).reject, true);
});

test("shouldRejectAudioBeforeStt uses client VAD and mouth gate metadata", () => {
  const quality = {
    supported: true,
    durationMs: 1500,
    normalizedRms: 0.02,
    speechRatio: 0.2,
    clippingRatio: 0,
  };

  assert.deepEqual(
    shouldRejectAudioBeforeStt(quality, {
      vad: {
        frames: 20,
        speechLikeRatio: 0.02,
        gatedSpeechFrames: 5,
      },
    }),
    { reject: true, reason: "client_low_speechlike_ratio" },
  );
  assert.deepEqual(
    shouldRejectAudioBeforeStt(quality, {
      vad: {
        frames: 20,
        speechLikeRatio: 0.2,
        gatedSpeechFrames: 5,
        mouthTrackingAvailable: true,
        mouthActiveDuringSpeech: false,
      },
    }),
    { reject: true, reason: "client_no_mouth_activity" },
  );
});

test("validateTranscriptCandidate filters SELA echo and ambiguous random text", () => {
  assert.equal(
    validateTranscriptCandidate("Halo saya SELA selamat siang ada yang bisa dibantu", {
      lastSelaSpeech: "Halo, saya SELA. Selamat siang, ada yang bisa dibantu?",
    }).valid,
    false,
  );
  assert.equal(
    validateTranscriptCandidate("Al Boo", {
      vad: { gatedSpeechFrames: 1 },
    }).valid,
    false,
  );
  assert.equal(
    validateTranscriptCandidate("Biaya pendaftaran UCIC berapa", {
      vad: { gatedSpeechFrames: 4 },
    }).valid,
    true,
  );
});
