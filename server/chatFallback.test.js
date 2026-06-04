import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOpenAIChatPayload,
  looksLikeIncompleteChatAnswer,
  SELA_COMPLETION_MARKER,
  stripCompletionMarker,
} from "./index.js";

test("buildOpenAIChatPayload keeps chat messages for Groq/OpenRouter", () => {
  const payload = buildOpenAIChatPayload([
    { role: "system", content: "Kamu SELA." },
    { role: "user", content: "Cara daftar ke UCIC gimana?" },
    { role: "assistant", content: "Baik, saya bantu jelaskan." },
  ]);

  assert.equal(payload.temperature, 0.6);
  assert.equal(payload.max_tokens, 420);
  assert.deepEqual(payload.messages, [
    { role: "system", content: "Kamu SELA." },
    { role: "user", content: "Cara daftar ke UCIC gimana?" },
    { role: "assistant", content: "Baik, saya bantu jelaskan." },
  ]);
});

test("buildOpenAIChatPayload drops invalid messages", () => {
  const payload = buildOpenAIChatPayload([
    { role: "system", content: "" },
    { role: "user", content: "Fasilitas UCIC apa aja?" },
    { content: "tanpa role" },
  ]);

  assert.deepEqual(payload.messages, [
    { role: "user", content: "Fasilitas UCIC apa aja?" },
  ]);
});

test("looksLikeIncompleteChatAnswer catches dangling provider output", () => {
  assert.equal(
    looksLikeIncompleteChatAnswer(
      "Baik, SELA memahami Anda tertarik pada bidang coding, ya. Untuk minat tersebut, S1 Teknik",
    ),
    true,
  );
  assert.equal(
    looksLikeIncompleteChatAnswer(
      `Bisa, SELA bantu arahkan. Kamu lebih tertarik ke komputer atau coding, desain dan konten, bisnis, keuangan, atau olahraga? ${SELA_COMPLETION_MARKER}`,
    ),
    false,
  );
  assert.equal(
    looksLikeIncompleteChatAnswer(
      `Selamat siang. Untuk bisa memberikan rekomendasi jurusan yang paling sesuai, SELA ingin tahu lebih banyak tentang minat Anda ${SELA_COMPLETION_MARKER}`,
    ),
    false,
  );
});

test("stripCompletionMarker removes provider completion token", () => {
  assert.equal(
    stripCompletionMarker(`Jawaban lengkap. ${SELA_COMPLETION_MARKER}`),
    "Jawaban lengkap.",
  );
});
