import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFallbackSuggestions,
  buildResponsePlan,
  buildSpokenText,
  prioritizeResponseMatches,
} from "./responsePlan.js";

test("buildResponsePlan classifies detail modes from representative queries", () => {
  assert.equal(
    buildResponsePlan("ucic ada jurusan apa aja", { intent: "jurusan" })
      .displayMode,
    "list_detail",
  );
  assert.equal(
    buildResponsePlan("syarat daftar kuliah apa aja", { intent: "syarat" })
      .displayMode,
    "step_detail",
  );
  assert.equal(
    buildResponsePlan("cara daftar di ucic gimana", { intent: "pendaftaran" })
      .displayMode,
    "step_detail",
  );
  assert.equal(
    buildResponsePlan("cara daftar ke UCIC gimana", { intent: "pendaftaran" })
      .displayMode,
    "step_detail",
  );
  assert.equal(
    buildResponsePlan("setelah daftar online lanjut apa", {
      intent: "pendaftaran",
    }).displayMode,
    "step_detail",
  );
  assert.equal(
    buildResponsePlan("bayarnya lewat apa", { intent: "biaya" }).displayMode,
    "step_detail",
  );
  assert.equal(
    buildResponsePlan("fasilitas di UCIC apa aja", { intent: "fasilitas" })
      .displayMode,
    "list_detail",
  );
  assert.equal(
    buildResponsePlan("siapa rektor ucic", { intent: "rektor" }).displayMode,
    "brief",
  );
  assert.equal(
    buildResponsePlan("alamat kampus dimana", { intent: "lokasi" }).displayMode,
    "brief",
  );
  assert.equal(
    buildResponsePlan("beda TI dan SI apa", { intent: "jurusan" }).displayMode,
    "compare_detail",
  );
});

test("buildResponsePlan keeps single factual questions brief", () => {
  assert.equal(
    buildResponsePlan("siapa rektor ucic", { intent: "rektor" }).displayMode,
    "brief",
  );
  assert.equal(
    buildResponsePlan("biaya pendaftaran berapa", { intent: "biaya" })
      .displayMode,
    "brief",
  );
});

test("buildResponsePlan assigns admission counselor modes", () => {
  const discovery = buildResponsePlan("saya bingung pilih jurusan", {
    intent: "jurusan",
  });
  assert.equal(discovery.counselorMode, "interest_discovery");
  assert.equal(discovery.nextAction, "ask_interest");

  const coding = buildResponsePlan("saya suka coding cocoknya jurusan apa", {
    intent: "jurusan",
  });
  assert.equal(coding.counselorMode, "program_recommendation");
  assert.equal(coding.nextAction, "recommend_program");
  assert.deepEqual(coding.leadSignals.recommendedPrograms, [
    "Teknik Informatika",
    "Sistem Informasi",
  ]);

  const technology = buildResponsePlan("teknologi sih lebih tepatnya", {
    intent: "jurusan",
  });
  assert.equal(technology.counselorMode, "program_recommendation");
  assert.deepEqual(technology.leadSignals.recommendedPrograms, [
    "Teknik Informatika",
    "Sistem Informasi",
  ]);

  const design = buildResponsePlan("saya suka desain", { intent: "jurusan" });
  assert.equal(design.counselorMode, "program_recommendation");
  assert.deepEqual(design.leadSignals.recommendedPrograms, [
    "Desain Komunikasi Visual",
  ]);

  const business = buildResponsePlan("saya suka bisnis online", {
    intent: "jurusan",
  });
  assert.equal(business.counselorMode, "program_recommendation");
  assert.deepEqual(business.leadSignals.recommendedPrograms, [
    "Bisnis Digital",
    "Manajemen",
  ]);

  const sport = buildResponsePlan("saya suka olahraga", { intent: "jurusan" });
  assert.equal(sport.counselorMode, "program_recommendation");
  assert.deepEqual(sport.leadSignals.recommendedPrograms, [
    "Pendidikan Kepelatihan Olahraga",
  ]);

  const apply = buildResponsePlan("cara daftar ke UCIC", {
    intent: "pendaftaran",
  });
  assert.equal(apply.counselorMode, "application_guidance");
  assert.equal(apply.nextAction, "explain_registration_steps");

  const rector = buildResponsePlan("siapa rektor UCIC", { intent: "rektor" });
  assert.equal(rector.displayMode, "brief");
  assert.equal(rector.counselorMode, "answer_only");
});

test("buildFallbackSuggestions follows counselor mode", () => {
  const recommendation = buildResponsePlan("saya suka coding cocoknya apa", {
    intent: "jurusan",
  });
  assert.deepEqual(buildFallbackSuggestions(recommendation, "id"), [
    "Apa bedanya Teknik Informatika dan Sistem Informasi?",
    "Berapa biaya jurusan itu?",
  ]);

  const registration = buildResponsePlan("cara daftar ke UCIC", {
    intent: "pendaftaran",
  });
  assert.deepEqual(buildFallbackSuggestions(registration, "id"), [
    "Apa saja berkas yang perlu disiapkan?",
    "Bisa daftar online lewat mana?",
  ]);
});

test("buildResponsePlan marks enumerate-all and summary-only voice modes", () => {
  const plan = buildResponsePlan("sebutkan semua jurusan di UCIC", {
    intent: "jurusan",
  });

  assert.equal(plan.mustEnumerateAll, true);
  assert.equal(plan.ttsMode, "adaptive");
  assert.equal(plan.maxContextItems, 6);
});

test("prioritizeResponseMatches pins aggregate jurusan entries first", () => {
  const plan = buildResponsePlan("ucic ada jurusan apa aja", {
    intent: "jurusan",
  });
  const catalog = [
    { id: "jurusan_ucic", title: "Fakultas dan Program Studi UCIC" },
    { id: "jurusan_fti", title: "FTI" },
    { id: "jurusan_feb", title: "FEB" },
    { id: "jurusan_fps", title: "FPS" },
  ];
  const ranked = [
    { item: catalog[1], score: 17 },
    { item: catalog[2], score: 16 },
    { item: catalog[3], score: 15 },
  ];

  const prioritized = prioritizeResponseMatches(ranked, {
    responsePlan: plan,
    intent: "jurusan",
    catalog,
  });

  assert.deepEqual(
    prioritized.slice(0, 4).map((entry) => entry.item.id),
    ["jurusan_ucic", "jurusan_fti", "jurusan_feb", "jurusan_fps"],
  );
});

test("buildSpokenText shortens jurusan detail answers for TTS", () => {
  const plan = buildResponsePlan("ucic ada jurusan apa aja", {
    intent: "jurusan",
  });
  const matches = [
    {
      item: {
        id: "jurusan_ucic",
        title: "Fakultas dan Program Studi UCIC",
        content:
          "UCIC memiliki 3 fakultas:\n- Fakultas Teknologi Informasi (FTI): S1 Teknik Informatika, S1 Sistem Informasi, S1 Desain Komunikasi Visual, D3 Manajemen Informatika, D3 Komputerisasi Akuntansi.\n- Fakultas Ekonomi dan Bisnis (FEB): S1 Akuntansi, S1 Manajemen, S1 Bisnis Digital, D3 Manajemen Bisnis.\n- Fakultas Pendidikan dan Sains (FPS): S1 Pendidikan Kepelatihan Olahraga.",
      },
    },
  ];

  const longAnswer = `UCIC memiliki 3 fakultas dengan program studi yang cukup beragam untuk calon mahasiswa.

Fakultas Teknologi Informasi mencakup beberapa pilihan yang fokus pada komputer, sistem, dan desain.

Fakultas Ekonomi dan Bisnis mencakup pilihan yang berhubungan dengan bisnis, akuntansi, dan manajemen.

Fakultas Pendidikan dan Sains memiliki pilihan program studi di bidang olahraga.

Daftar lengkap setiap program studi saya tampilkan di layar agar lebih mudah dibaca.`;

  const spoken = buildSpokenText(longAnswer, plan, "id", matches);

  assert.match(spoken, /3 fakultas/i);
  assert.match(spoken, /10 program studi/i);
  assert.doesNotMatch(spoken, /Teknik Informatika, S1 Sistem Informasi/i);
});

test("buildSpokenText keeps short detailed answers full for TTS", () => {
  const plan = buildResponsePlan("kalau saya suka komputer masuk jurusan apa ya", {
    intent: "jurusan",
  });
  const shortAnswer = `Jika Anda suka komputer, maka jurusan yang cocok untuk Anda di UCIC adalah:

Teknik Informatika: jurusan ini fokus pada pemrograman dan pengembangan perangkat lunak.
Sistem Informasi: jurusan ini fokus pada pengelolaan sistem informasi dan aplikasi.`;

  const spoken = buildSpokenText(shortAnswer, plan, "id", []);

  assert.equal(spoken, shortAnswer);
});

test("buildSpokenText summarizes answers starting from three paragraphs", () => {
  const plan = buildResponsePlan("kalau saya suka komputer masuk jurusan apa ya", {
    intent: "jurusan",
  });
  const detailedAnswer = `Jika Anda suka komputer, maka jurusan yang paling cocok di UCIC adalah Teknik Informatika atau Sistem Informasi.

Teknik Informatika lebih cocok jika Anda suka pemrograman, software, dan pengembangan teknologi.

Sistem Informasi lebih cocok jika Anda suka kombinasi komputer, data, dan proses bisnis.`;

  const spoken = buildSpokenText(detailedAnswer, plan, "id", []);

  assert.notEqual(spoken, detailedAnswer);
  assert.match(spoken, /Intinya/i);
  assert.match(spoken, /Teknik Informatika atau Sistem Informasi/i);
});

test("buildSpokenText keeps practical registration steps for voice without spelling URLs", () => {
  const plan = buildResponsePlan("cara daftar ke UCIC gimana", {
    intent: "pendaftaran",
  });
  const detailedAnswer = `1. Daftar online melalui https://pmb.cic.ac.id/register.
2. Isi data diri dan pilih program studi.
3. Siapkan dokumen pendaftaran yang dibutuhkan.
4. Jika ingin offline, datang langsung ke kampus UCIC.
5. Ikuti arahan pembayaran atau konfirmasi dari admin PMB.`;

  const spoken = buildSpokenText(detailedAnswer, plan, "id", []);

  assert.notEqual(spoken, detailedAnswer);
  assert.match(spoken, /Daftar online/i);
  assert.match(spoken, /website PMB UCIC/i);
  assert.doesNotMatch(spoken, /https:\/\//i);
  assert.match(spoken, /Ikuti arahan pembayaran/i);
});
