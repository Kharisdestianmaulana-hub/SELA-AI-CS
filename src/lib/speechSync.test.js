import test from "node:test";
import assert from "node:assert/strict";

import { buildSpeechTimeline, getSpeechFrame } from "./speechSync.js";

test("buildSpeechTimeline maps Indonesian words to vowel visemes", () => {
  const timeline = buildSpeechTimeline("cara daftar biaya UCIC", "id");
  const visemesByWord = new Map();

  timeline.events
    .filter((event) => event.viseme !== "visemeSil")
    .forEach((event) => {
      const list = visemesByWord.get(event.word.toLowerCase()) || [];
      list.push(event.viseme);
      visemesByWord.set(event.word.toLowerCase(), list);
    });

  assert.deepEqual(visemesByWord.get("cara"), ["visemeAa", "visemeAa"]);
  assert.deepEqual(visemesByWord.get("daftar"), [
    "visemeAa",
    "visemeAa",
  ]);
  assert.deepEqual(visemesByWord.get("biaya"), [
    "visemeIh",
    "visemeAa",
    "visemeAa",
  ]);
  assert.deepEqual(visemesByWord.get("ucic"), ["visemeU", "visemeIh"]);
  assert.ok(timeline.durationMs > 0);
});

test("getSpeechFrame returns active viseme and completes at timeline end", () => {
  const timeline = buildSpeechTimeline("cara", "id");
  const first = getSpeechFrame(timeline, 1);
  const done = getSpeechFrame(timeline, timeline.durationMs + 1);

  assert.equal(first.viseme, "visemeAa");
  assert.equal(first.complete, false);
  assert.equal(done.viseme, "visemeSil");
  assert.equal(done.complete, true);
  assert.equal(done.charIndex, "cara".length);
});
