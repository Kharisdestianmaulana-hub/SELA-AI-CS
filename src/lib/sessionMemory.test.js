import test from "node:test";
import assert from "node:assert/strict";

import {
  appendSessionTurn,
  buildDirectRecallResponse,
  buildSessionMemoryPrompt,
  createSessionMemory,
  detectMemoryRecallIntent,
  finalizeSessionMemory,
  resolveSessionMemoryQuery,
  selectRelevantSessionMemory,
  shouldEndSession,
} from "./sessionMemory.js";

test("createSessionMemory stores auto greeting as first SELA turn", () => {
  const memory = createSessionMemory({
    greetingText: "Halo, saya SELA. Selamat siang, ada yang bisa dibantu?",
    startedAt: "2026-06-05T07:00:00.000Z",
  });

  assert.equal(memory.turns.length, 1);
  assert.equal(memory.turns[0].turn, 1);
  assert.equal(memory.turns[0].role, "sela");
  assert.equal(memory.turns[0].type, "auto_greeting");
});

test("appendSessionTurn keeps turn order and working memory", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Saya suka coding",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    text: "Kalau suka coding, SELA sarankan Teknik Informatika.",
    spokenText: "Kalau suka coding, SELA sarankan Teknik Informatika.",
    intent: "jurusan",
  });

  assert.equal(memory.turns[1].turn, 2);
  assert.equal(memory.turns[2].turn, 3);
  assert.equal(memory.workingMemory.lastUserQuestion, "Saya suka coding");
  assert.equal(memory.workingMemory.lastIntent, "jurusan");
  assert.deepEqual(memory.workingMemory.userInterests, ["coding"]);
});

test("detectMemoryRecallIntent catches repeat and previous references", () => {
  assert.equal(
    detectMemoryRecallIntent("Ulangin tadi dong saya nggak dengar"),
    "repeat_last_answer",
  );
  assert.equal(
    detectMemoryRecallIntent("Yang sebelumnya gimana?"),
    "previous_context",
  );
  assert.equal(detectMemoryRecallIntent("QR tadi mana?"), "last_link");
  assert.equal(
    detectMemoryRecallIntent("Yang tadi kamu saranin apa?"),
    "previous_recommendation",
  );
});

test("buildDirectRecallResponse repeats last assistant answer", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "sela",
    text: "Teknik Informatika cocok untuk minat coding.",
    spokenText: "Teknik Informatika cocok untuk minat coding.",
    intent: "jurusan",
  });

  const response = buildDirectRecallResponse(memory, "Saya nggak dengar, ulangi tadi");

  assert.match(response.text, /SELA ulangi/i);
  assert.match(response.spokenText, /Teknik Informatika/);
  assert.equal(response.debug.chatProvider, "session_memory");
});

test("buildSessionMemoryPrompt includes turn history and working memory", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Saya bingung pilih jurusan",
  });

  const prompt = buildSessionMemoryPrompt(memory, "yang tadi gimana");

  assert.match(prompt, /Jumlah turn sejauh ini: 2/);
  assert.match(prompt, /Maksud referensial terdeteksi: previous_context/);
  assert.match(prompt, /Riwayat turn sesi aktif/);
});

test("session memory tracks recommendation programs and recalls them directly", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Coding sama pro gaming lah",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    text: "Jika kamu minat coding dan pro gaming, jurusan Teknik Informatika di UCIC bisa jadi pilihan yang tepat.",
    spokenText:
      "Jika kamu minat coding dan pro gaming, Teknik Informatika bisa jadi pilihan yang tepat.",
    intent: "jurusan",
  });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Selain itu apa sarannya?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    text: "Selain Teknik Informatika, kamu juga bisa mempertimbangkan Sistem Informasi.",
    intent: "jurusan",
  });

  assert.deepEqual(
    memory.workingMemory.recommendations.programs.map((item) => [
      item.name,
      item.priority,
    ]),
    [
      ["S1 Teknik Informatika", "primary"],
      ["S1 Sistem Informasi", "alternative"],
    ],
  );

  const response = buildDirectRecallResponse(
    memory,
    "Yang tadi kamu saranin apa?",
  );

  assert.match(response.text, /S1 Teknik Informatika/);
  assert.match(response.text, /S1 Sistem Informasi/);
  assert.doesNotMatch(response.text, /Desain Komunikasi Visual/);
});

test("resolveSessionMemoryQuery rewrites ambiguous cost follow-up to active program", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Saya suka coding",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    text: "SELA sarankan S1 Teknik Informatika.",
    intent: "jurusan",
  });

  const resolved = resolveSessionMemoryQuery(
    "Kalau yang itu biayanya berapa?",
    memory,
  );

  assert.equal(resolved.query, "biaya S1 Teknik Informatika UCIC");
  assert.equal(resolved.resolution.resolvedTo, "S1 Teknik Informatika");
});

test("session memory tracks non-program dataset categories", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Fasilitas perpustakaan UCIC gimana?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    text: "Perpustakaan UCIC menyediakan buku, jurnal, dan layanan literasi untuk mahasiswa.",
    intent: "fasilitas",
  });

  assert.equal(memory.workingMemory.activeCategory, "fasilitas");
  assert.match(
    memory.workingMemory.categoryMemory.fasilitas.lastSelaAnswer,
    /Perpustakaan UCIC/,
  );
  assert.ok(
    memory.workingMemory.entities.topics.includes("fasilitas:perpustakaan"),
  );

  const response = buildDirectRecallResponse(memory, "Yang tadi itu apa?");

  assert.match(response.text, /fasilitas/);
  assert.match(response.text, /Perpustakaan UCIC/);
  assert.equal(response.debug.intent, "fasilitas");
});

test("resolveSessionMemoryQuery rewrites ambiguous follow-up to active non-program category", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Gimana cara daftar online di PMB UCIC?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    text: "Daftar online bisa melalui PMB UCIC, lalu isi data, bayar registrasi, dan upload berkas.",
    intent: "pendaftaran",
    screen: {
      mode: "handoff",
      title: "Daftar PMB",
      items: ["Isi data", "Upload berkas"],
      links: [{ label: "PMB UCIC", url: "https://pmb.cic.ac.id/register" }],
    },
  });

  const resolved = resolveSessionMemoryQuery(
    "Kalau syarat yang tadi apa aja?",
    memory,
  );

  assert.equal(resolved.query, "syarat upload berkas UCIC");
  assert.equal(resolved.resolution.category, "pendaftaran");
});

test("session memory v3 stores active state attention stack and dataset references", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Saya mau daftar online, berkas KTP dan KK uploadnya gimana?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    type: "answer",
    text: "Untuk upload berkas PMB, siapkan KTP dan Kartu Keluarga dalam format PDF.",
    intent: "pendaftaran",
    screen: {
      mode: "steps",
      title: "Upload Berkas",
      items: ["Siapkan KTP", "Siapkan Kartu Keluarga"],
      links: [{ label: "PMB UCIC", url: "https://pmb.cic.ac.id/register" }],
    },
  });

  assert.equal(memory.workingMemory.activeState.category, "pendaftaran");
  assert.match(memory.workingMemory.activeState.userGoal, /pendaftaran/);
  assert.ok(memory.workingMemory.attentionStack.length > 0);
  assert.ok(memory.workingMemory.datasetReferences[0].category === "pendaftaran");
  assert.ok(memory.workingMemory.entityMemory.documents.includes("KTP"));
  assert.ok(memory.workingMemory.entityMemory.documents.includes("Kartu Keluarga"));
  assert.ok(memory.workingMemory.entityMemory.links.includes("https://pmb.cic.ac.id/register"));
  assert.ok(memory.workingMemory.episodicMemory.length >= 2);
});

test("session summary and finalizeSessionMemory close temporary memory cleanly", () => {
  let memory = createSessionMemory({
    greetingText: "Halo, saya SELA.",
    startedAt: "2026-06-05T01:00:00.000Z",
  });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Fasilitas lab komputer UCIC ada apa aja?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    type: "answer",
    text: "UCIC memiliki fasilitas laboratorium komputer untuk mendukung perkuliahan.",
    intent: "fasilitas",
  });

  const finalMemory = finalizeSessionMemory(memory, {
    endedAt: "2026-06-05T01:05:00.000Z",
    endReason: "farewell",
  });

  assert.equal(finalMemory.endedAt, "2026-06-05T01:05:00.000Z");
  assert.equal(finalMemory.endReason, "farewell");
  assert.match(finalMemory.workingMemory.sessionSummary, /fasilitas/);
});

test("shouldEndSession detects polite closing phrases", () => {
  assert.equal(shouldEndSession("Makasih ya, sudah cukup"), true);
  assert.equal(shouldEndSession("Kalau biaya pendaftaran gimana?"), false);
});

test("buildSessionMemoryPrompt exposes v3 memory layers", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Kontak WhatsApp PMB UCIC mana?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    type: "answer",
    text: "Kontak WhatsApp PMB UCIC adalah 0812 1670 0519.",
    intent: "kontak",
  });

  const prompt = buildSessionMemoryPrompt(memory, "yang tadi ulangi");

  assert.match(prompt, /Active state:/);
  assert.match(prompt, /Entity memory:/);
  assert.match(prompt, /Dataset references relevan:/);
  assert.match(prompt, /Episodic memory relevan:/);
  assert.match(prompt, /attention stack/i);
});

test("selectRelevantSessionMemory prioritizes query category and trims unrelated memory", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Fasilitas perpustakaan UCIC gimana?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    type: "answer",
    text: "Perpustakaan UCIC menyediakan layanan literasi untuk mahasiswa.",
    intent: "fasilitas",
  });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Biaya pendaftaran UCIC berapa?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    type: "answer",
    text: "Biaya pendaftaran UCIC adalah Rp250.000.",
    intent: "biaya",
  });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Kontak WhatsApp PMB mana?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    type: "answer",
    text: "WhatsApp PMB UCIC adalah 0812 1670 0519.",
    intent: "kontak",
  });

  const selected = selectRelevantSessionMemory(
    memory,
    "Kalau biaya yang tadi detailnya apa?",
  );

  assert.equal(selected.activeCategory, "biaya");
  assert.ok(
    selected.relevantCategories.some((item) => item.category === "biaya"),
  );
  assert.ok(
    selected.relevantDatasetReferences.some((item) => item.category === "biaya"),
  );
  assert.ok(selected.selectedTurns.length <= 8);
});

test("buildSessionMemoryPrompt only injects relevant category memory for latest query", () => {
  let memory = createSessionMemory({ greetingText: "Halo, saya SELA." });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Fasilitas perpustakaan UCIC gimana?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    type: "answer",
    text: "Perpustakaan UCIC menyediakan layanan literasi untuk mahasiswa.",
    intent: "fasilitas",
  });
  memory = appendSessionTurn(memory, {
    role: "user",
    text: "Biaya pendaftaran UCIC berapa?",
  });
  memory = appendSessionTurn(memory, {
    role: "sela",
    type: "answer",
    text: "Biaya pendaftaran UCIC adalah Rp250.000.",
    intent: "biaya",
  });

  const prompt = buildSessionMemoryPrompt(
    memory,
    "Biaya yang tadi bisa dijelaskan lagi?",
  );

  assert.match(prompt, /Memory selection:/);
  assert.match(prompt, /queryCategory=biaya/);
  assert.match(prompt, /biaya/);
  const categorySection = prompt
    .split("Memori kategori dataset relevan:")[1]
    .split("Riwayat topik relevan:")[0];
  assert.doesNotMatch(categorySection, /fasilitas\/fasilitas_info/);
});
