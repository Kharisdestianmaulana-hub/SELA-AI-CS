const VISEME_SIL = "visemeSil";
const VOWEL_TO_VISEME = {
  a: "visemeAa",
  i: "visemeIh",
  u: "visemeU",
  e: "visemeE",
  o: "visemeO",
};

const DIGRAPH_VOWELS = [
  ["ai", "visemeAa"],
  ["au", "visemeAa"],
  ["oi", "visemeO"],
  ["ei", "visemeE"],
  ["ou", "visemeO"],
];

function normalizeTimelineText(text = "") {
  return String(text || "")
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSpeechRate(lang = "id") {
  return lang === "en"
    ? { msPerChar: 55, minWordMs: 180, pauseMs: 55 }
    : { msPerChar: 62, minWordMs: 190, pauseMs: 60 };
}

function extractVisemes(word = "") {
  const normalized = String(word || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const visemes = [];

  for (let index = 0; index < normalized.length; index++) {
    const pair = normalized.slice(index, index + 2);
    const digraph = DIGRAPH_VOWELS.find(([letters]) => letters === pair);
    if (digraph) {
      visemes.push(digraph[1]);
      index++;
      continue;
    }

    const viseme = VOWEL_TO_VISEME[normalized[index]];
    if (viseme) visemes.push(viseme);
  }

  return visemes.length > 0 ? visemes : [VISEME_SIL];
}

function findNthWordStart(sourceText = "", word = "", fromIndex = 0) {
  const lowerSource = sourceText.toLowerCase();
  const lowerWord = word.toLowerCase();
  const found = lowerSource.indexOf(lowerWord, fromIndex);
  return found >= 0 ? found : fromIndex;
}

export function buildSpeechTimeline(text = "", lang = "id", options = {}) {
  const sourceText = String(text || "");
  const normalized = normalizeTimelineText(sourceText);
  if (!normalized) {
    return {
      text: sourceText,
      durationMs: 0,
      events: [],
      words: [],
    };
  }

  const { msPerChar, minWordMs, pauseMs } = {
    ...getSpeechRate(lang),
    ...options,
  };
  const words = normalized.split(/\s+/).filter(Boolean);
  const events = [];
  let elapsed = 0;
  let searchFrom = 0;

  words.forEach((word, wordIndex) => {
    const charIndex = findNthWordStart(sourceText, word, searchFrom);
    searchFrom = Math.min(sourceText.length, charIndex + word.length);
    const wordDuration = Math.max(minWordMs, word.length * msPerChar);
    const visemes = extractVisemes(word);
    const sliceMs = Math.max(70, Math.round(wordDuration / visemes.length));

    visemes.forEach((viseme, visemeIndex) => {
      const startMs = elapsed + visemeIndex * sliceMs;
      const endMs =
        visemeIndex === visemes.length - 1
          ? elapsed + wordDuration
          : elapsed + (visemeIndex + 1) * sliceMs;

      events.push({
        startMs,
        endMs,
        wordIndex,
        charIndex,
        word,
        viseme,
      });
    });

    elapsed += wordDuration;

    events.push({
      startMs: elapsed,
      endMs: elapsed + pauseMs,
      wordIndex,
      charIndex: Math.min(sourceText.length, charIndex + word.length),
      word,
      viseme: VISEME_SIL,
    });

    elapsed += pauseMs;
  });

  return {
    text: sourceText,
    durationMs: Math.max(0, elapsed - pauseMs),
    events,
    words,
  };
}

export function getSpeechFrame(timeline, elapsedMs = 0) {
  const events = timeline?.events || [];
  if (events.length === 0) {
    return {
      charIndex: 0,
      wordIndex: 0,
      viseme: VISEME_SIL,
      complete: true,
    };
  }

  const durationMs = timeline.durationMs || events[events.length - 1].endMs;
  if (elapsedMs >= durationMs) {
    return {
      charIndex: String(timeline.text || "").length,
      wordIndex: timeline.words?.length || 0,
      viseme: VISEME_SIL,
      complete: true,
    };
  }

  const activeEvent =
    events.find(
      (event) => elapsedMs >= event.startMs && elapsedMs < event.endMs,
    ) || events[0];

  return {
    charIndex: activeEvent.charIndex,
    wordIndex: activeEvent.wordIndex,
    viseme: activeEvent.viseme,
    complete: false,
  };
}

export function getDefaultViseme() {
  return VISEME_SIL;
}
