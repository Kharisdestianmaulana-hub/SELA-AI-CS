import test from "node:test";
import assert from "node:assert/strict";

import dataset from "../data/ucic_dataset.json" with { type: "json" };
import {
  buildDatasetAliasIndex,
  matchDatasetReferences,
  rewriteQueryWithDatasetReferences,
} from "./datasetAliasIndex.js";

const aliasIndex = buildDatasetAliasIndex(dataset);

function matchedIds(query) {
  return matchDatasetReferences(query, aliasIndex, { limit: 10 }).map(
    (match) => match.id,
  );
}

test("buildDatasetAliasIndex creates aliases for every UCIC dataset item", () => {
  assert.equal(aliasIndex.length, dataset.length);
  assert.equal(
    aliasIndex.filter((entry) => entry.aliases.length > 0).length,
    dataset.length,
  );
});

test("dataset aliases cover PMB upload and registration terms", () => {
  const ids = matchedIds("upload KTP KK ijazah untuk daftar PMB");

  assert.ok(ids.includes("pmb_upload_berkas"));
  assert.ok(ids.includes("pmb_syarat"));
});

test("dataset aliases cover academic service terms", () => {
  const ids = matchedIds("cara isi KRS di SIAKAD setelah heregistrasi");

  assert.ok(ids.includes("baak_krs_heregistrasi"));
});

test("dataset aliases cover facility and library terms", () => {
  const ids = matchedIds("jam layanan perpustakaan dan keanggotaan");

  assert.ok(
    ids.includes("pedoman_perpustakaan_jam_keanggotaan") ||
      ids.includes("faq_perpustakaan_jam_kontak"),
  );
});

test("dataset aliases cover cost terms per program", () => {
  const ids = matchedIds("biaya kelas sore teknik informatika cicilan");

  assert.ok(
    ids.includes("biaya_teknik_informatika_2026") ||
      ids.includes("pmb_rincian_biaya_detail"),
  );
});

test("rewriteQueryWithDatasetReferences appends matched dataset identity", () => {
  const refs = matchDatasetReferences(
    "repository perpustakaan UCIC",
    aliasIndex,
    { limit: 3 },
  );
  const rewritten = rewriteQueryWithDatasetReferences(
    "repository perpustakaan UCIC",
    refs,
  );

  assert.match(rewritten, /repository perpustakaan ucic/i);
  assert.match(rewritten, /faq perpustakaan akses repository/i);
});
