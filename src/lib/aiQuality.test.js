import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCounselorQualityFallback,
  buildScreenResponse,
  needsCounselorQualityFallback,
  needsDetailedFallback,
} from "./answerContract.js";
import { buildResponsePlan } from "./responsePlan.js";

test("needsDetailedFallback rejects short procedural answers", () => {
  const plan = buildResponsePlan("cara daftar ke UCIC gimana", {
    intent: "pendaftaran",
  });

  assert.equal(
    needsDetailedFallback(
      "Pendaftaran bisa online atau offline.",
      plan,
      "pendaftaran",
    ),
    true,
  );

  assert.equal(
    needsDetailedFallback(
      [
        "1. Daftar online melalui website PMB UCIC.",
        "2. Isi data diri dan pilih program studi.",
        "3. Siapkan berkas utama seperti ijazah atau SKL, KTP, KK, akta kelahiran, dan pas foto.",
        "4. Bayar registrasi sesuai tagihan lalu tunggu verifikasi dari tim PMB.",
      ].join("\n"),
      plan,
      "pendaftaran",
    ),
    false,
  );
});

test("buildScreenResponse creates screen card contract for steps", () => {
  const plan = buildResponsePlan("cara daftar ke UCIC gimana", {
    intent: "pendaftaran",
  });
  const screen = buildScreenResponse(
    [
      "Berikut alur daftar ke UCIC:",
      "1. Daftar online di https://pmb.cic.ac.id/register.",
      "2. Isi registrasi lengkap dan pilih program studi.",
      "3. Tunggu verifikasi dari tim PMB.",
    ].join("\n"),
    plan,
    "pendaftaran",
    "id",
  );

  assert.equal(screen.mode, "steps");
  assert.equal(screen.title, "Cara Daftar UCIC");
  assert.equal(screen.items.length, 3);
  assert.equal(screen.links[0].url, "https://pmb.cic.ac.id/register");
  assert.doesNotMatch(screen.items.join(" "), /https:\/\//);
});

test("buildScreenResponse excludes intro narration from step cards", () => {
  const plan = buildResponsePlan("cara daftar ke UCIC gimana", {
    intent: "pendaftaran",
  });
  const screen = buildScreenResponse(
    [
      "Baik, SELA bantu jelaskan alur daftar UCIC.",
      "Berikut langkah-langkahnya:",
      "1. Pilih program studi yang diminati.",
      "2. Isi formulir pendaftaran PMB.",
      "3. Siapkan berkas utama.",
      "4. Bayar registrasi dan tunggu verifikasi.",
    ].join("\n"),
    plan,
    "pendaftaran",
    "id",
  );

  assert.equal(screen.mode, "steps");
  assert.deepEqual(screen.items, [
    "Pilih program studi yang diminati.",
    "Isi formulir pendaftaran PMB.",
    "Siapkan berkas utama.",
    "Bayar registrasi dan tunggu verifikasi.",
  ]);
});

test("buildScreenResponse shows interest choices for discovery mode", () => {
  const plan = buildResponsePlan("saya bingung pilih jurusan", {
    intent: "jurusan",
  });
  const screen = buildScreenResponse(
    "Bisa, SELA bantu arahkan. Kamu lebih tertarik ke komputer, desain, bisnis, keuangan, atau olahraga?",
    plan,
    "jurusan",
    "id",
  );

  assert.equal(screen.mode, "interest");
  assert.equal(screen.title, "Pilih Minat");
  assert.deepEqual(screen.items, [
    "Komputer / Coding",
    "Desain / Konten",
    "Bisnis",
    "Keuangan",
    "Olahraga",
  ]);
});

test("buildScreenResponse creates list card for facilities", () => {
  const plan = buildResponsePlan("fasilitas di UCIC apa aja", {
    intent: "fasilitas",
  });
  const screen = buildScreenResponse(
    [
      "Fasilitas UCIC meliputi:",
      "1. Laboratorium komputer.",
      "2. Perpustakaan.",
      "3. Ruang kelas.",
      "4. WiFi kampus.",
    ].join("\n"),
    plan,
    "fasilitas",
    "id",
  );

  assert.equal(screen.mode, "list");
  assert.equal(screen.title, "Fasilitas UCIC");
  assert.deepEqual(screen.items.slice(0, 2), [
    "Laboratorium komputer.",
    "Perpustakaan.",
  ]);
});

test("buildScreenResponse creates recommend card for counselor guidance", () => {
  const plan = buildResponsePlan("saya suka coding cocoknya jurusan apa", {
    intent: "jurusan",
  });
  const screen = buildScreenResponse(
    [
      "Kalau kamu suka coding, rekomendasi paling cocok di UCIC:",
      "1. Teknik Informatika: cocok untuk pemrograman dan pengembangan aplikasi.",
      "2. Sistem Informasi: cocok untuk teknologi yang dipakai dalam proses bisnis.",
    ].join("\n"),
    plan,
    "jurusan",
    "id",
  );

  assert.equal(screen.mode, "recommend");
  assert.equal(screen.title, "Rekomendasi SELA");
  assert.match(screen.items.join(" "), /Teknik Informatika/);
});

test("counselor quality fallback repairs dangling interest discovery answers", () => {
  const plan = buildResponsePlan(
    "saya bingung pilih jurusan rekomendasikan dong",
    { intent: "jurusan" },
  );

  assert.equal(plan.counselorMode, "interest_discovery");
  assert.equal(needsCounselorQualityFallback("Baik, SELA bantu arahkan. Agar", plan), true);
  assert.match(
    buildCounselorQualityFallback(plan, "id"),
    /komputer atau coding, desain dan konten, bisnis, keuangan, atau olahraga\?/,
  );
});

test("counselor quality fallback keeps valid jurusan recommendation answers", () => {
  const plan = buildResponsePlan(
    "saya bingung pilih jurusan rekomendasikan dong",
    { intent: "jurusan" },
  );

  assert.equal(
    needsCounselorQualityFallback(
      "Untuk minat di pro gaming, rekomendasi jurusan yang paling cocok di UCIC adalah S1 Teknik Informatika karena jurusan ini membekali mahasiswa dengan dasar pengembangan game dan teknologi informasi.",
      plan,
    ),
    false,
  );
});
