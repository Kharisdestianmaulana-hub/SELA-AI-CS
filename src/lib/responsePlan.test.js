import test from "node:test";
import assert from "node:assert/strict";

import {
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

test("buildResponsePlan marks enumerate-all and summary-only voice modes", () => {
  const plan = buildResponsePlan("sebutkan semua jurusan di UCIC", {
    intent: "jurusan",
  });

  assert.equal(plan.mustEnumerateAll, true);
  assert.equal(plan.ttsMode, "summary_only");
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

  const spoken = buildSpokenText(
    "UCIC memiliki 3 fakultas dengan daftar lengkap jurusan yang ditampilkan di layar.",
    plan,
    "id",
    matches,
  );

  assert.match(spoken, /3 fakultas/i);
  assert.match(spoken, /10 program studi/i);
  assert.doesNotMatch(spoken, /Teknik Informatika, S1 Sistem Informasi/i);
});
