import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeminiTranscriptionPayload,
  detectBackgroundAudio,
  extractGeminiTranscriptionText,
  normalizeGeminiMediaMimeType,
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
