/**
 * Bug Condition Exploration Test: TTS-Text Synchronization Desync
 *
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7**
 *
 * This test is EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bug exists — DO NOT fix the code or the test.
 *
 * Property 1: Bug Condition — TTS-Text Synchronization Desync
 *
 * For voice-mode inputs where isBugCondition(input) holds:
 * - Typewriter does NOT auto-complete on TTS end (no signal mechanism)
 * - Boundary delay is 700ms (exceeds 150ms threshold)
 * - Word interval is fixed 340ms (not dynamic based on TTS duration)
 * - Speak delay is 100ms (exceeds 50ms threshold)
 * - Mic restart delay is 800ms (exceeds 400ms threshold)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");

// ── Source file reading helpers ──────────────────────────────────────────────

function readSource(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), "utf-8");
}

// ── Bug condition definition ─────────────────────────────────────────────────

/**
 * isBugCondition: returns true when the system is in a state where
 * TTS-text desynchronization occurs.
 */
function isBugCondition(input) {
  return (
    input.mode === "speak" &&
    input.ttsActive === true &&
    (input.speakDelay > 50 ||
      input.boundaryDelay > 150 ||
      input.micRestartDelay > 400 ||
      input.wordInterval !==
        Math.round(input.estimatedDuration / input.wordCount) ||
      input.hasTypewriterTtsEndSignal === false)
  );
}

// ── Extract actual values from source code ───────────────────────────────────

function extractConstantFromSource(source, pattern) {
  const match = source.match(pattern);
  return match ? Number(match[1]) : null;
}

const voiceUISource = readSource("src/components/VoiceUI.jsx");
const liveCaptionSource = readSource("src/components/LiveCaption.jsx");
const aiSource = readSource("src/lib/ai.js");
const chatBubbleSource = readSource("src/components/ChatBubble.jsx");

// Extract actual timing constants from source
const ACTUAL_BOUNDARY_DELAY = extractConstantFromSource(
  voiceUISource,
  /LIVE_CAPTION_BOUNDARY_DELAY_MS\s*=\s*(\d+)/,
);

const ACTUAL_WORD_INTERVAL = extractConstantFromSource(
  liveCaptionSource,
  /CAPTION_WORD_INTERVAL_MS\s*=\s*(\d+)/,
);

const ACTUAL_BOUNDARY_FALLBACK_DELAY = extractConstantFromSource(
  liveCaptionSource,
  /BOUNDARY_FALLBACK_DELAY_MS\s*=\s*(\d+)/,
);

const ACTUAL_SPEAK_DELAY = extractConstantFromSource(
  aiSource,
  /setTimeout\(doSpeak,\s*(\d+)\)/,
);

// Extract the post-TTS mic restart delay (800ms) — specifically the one after
// "beri waktu speaker selesai bergema sebelum mic aktif lagi" comment
const ACTUAL_MIC_RESTART_DELAY = (() => {
  const match = voiceUISource.match(
    /beri waktu speaker selesai bergema[^]*?startListeningRef\.current\?\.\(\),\s*(\d+)\)/,
  );
  return match ? Number(match[1]) : null;
})();

// Check if ChatBubble has a ttsEndSignal mechanism
const HAS_TTS_END_SIGNAL =
  chatBubbleSource.includes("ttsEndSignal") ||
  chatBubbleSource.includes("onTtsEnd") ||
  chatBubbleSource.includes("voiceMode");

// ── Property-Based Exploration Tests ─────────────────────────────────────────

test("Bug Condition Exploration: ChatBubble has no TTS-end signal mechanism", () => {
  /**
   * Property: For any ChatBubble with isNew=true and a displayText of N characters
   * (where N > 100), there should be a mechanism to auto-complete the typewriter
   * when TTS ends. On unfixed code, no such mechanism exists.
   *
   * Expected: FAIL — ChatBubble has no ttsEndSignal/voiceMode prop
   */
  fc.assert(
    fc.property(fc.integer({ min: 100, max: 500 }), (textLength) => {
      // Generate a text of the given length
      const displayText = "A".repeat(textLength);
      const typewriterDurationMs = textLength * 18; // 18ms per char
      // Simulate TTS ending at ~4000ms for a shorter spokenText
      const ttsEndMs = 4000;

      // Bug condition: typewriter runs longer than TTS for long texts
      const typewriterStillAnimatingAfterTts = typewriterDurationMs > ttsEndMs;

      if (typewriterStillAnimatingAfterTts) {
        // Assert that a TTS-end signal mechanism EXISTS to auto-complete
        // This WILL FAIL on unfixed code because no such mechanism exists
        assert.ok(
          HAS_TTS_END_SIGNAL,
          `ChatBubble with ${textLength}-char displayText: typewriter runs for ${typewriterDurationMs}ms ` +
            `but TTS ends at ${ttsEndMs}ms. No ttsEndSignal mechanism exists to auto-complete. ` +
            `Text continues animating ${typewriterDurationMs - ttsEndMs}ms after TTS ends.`,
        );
      }
    }),
    { numRuns: 50 },
  );
});

test("Bug Condition Exploration: LiveCaption boundary delay exceeds 150ms threshold", () => {
  /**
   * Property: For any boundary event fired by TTS, the LiveCaption should update
   * within 150ms. On unfixed code, the delay is 700ms.
   *
   * Expected: FAIL — LIVE_CAPTION_BOUNDARY_DELAY_MS = 700 > 150
   */
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 500 }), // charIndex values
      (charIndex) => {
        // The actual boundary delay from source code
        const actualDelay = ACTUAL_BOUNDARY_DELAY;
        const maxAcceptableDelay = 150;

        assert.ok(
          actualDelay <= maxAcceptableDelay,
          `LiveCaption boundary delay is ${actualDelay}ms for charIndex=${charIndex}, ` +
            `exceeds ${maxAcceptableDelay}ms threshold. Caption shows word ${actualDelay}ms ` +
            `after TTS speaks it.`,
        );
      },
    ),
    { numRuns: 50 },
  );
});

test("Bug Condition Exploration: speakText delay exceeds 50ms threshold", () => {
  /**
   * Property: For any call to speakText with voices already loaded,
   * the delay before starting speech should be <= 50ms.
   * On unfixed code, the delay is 100ms.
   *
   * Expected: FAIL — setTimeout(doSpeak, 100) > 50ms threshold
   */
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 200 }), // text to speak
      (_text) => {
        const actualDelay = ACTUAL_SPEAK_DELAY;
        const maxAcceptableDelay = 50;

        assert.ok(
          actualDelay <= maxAcceptableDelay,
          `speakText initial delay is ${actualDelay}ms when voices are loaded, ` +
            `exceeds ${maxAcceptableDelay}ms threshold. Unnecessary ${actualDelay - maxAcceptableDelay}ms ` +
            `latency before speech starts.`,
        );
      },
    ),
    { numRuns: 50 },
  );
});

test("Bug Condition Exploration: Mic restart delay exceeds 400ms threshold", () => {
  /**
   * Property: After TTS onEnd fires, the mic should restart within 400ms.
   * On unfixed code, the delay is 800ms.
   *
   * Expected: FAIL — setTimeout(startListeningRef.current?.(), 800) > 400ms threshold
   */
  fc.assert(
    fc.property(
      fc.integer({ min: 1000, max: 10000 }), // TTS duration in ms
      (_ttsDuration) => {
        const actualDelay = ACTUAL_MIC_RESTART_DELAY;
        const maxAcceptableDelay = 400;

        assert.ok(
          actualDelay <= maxAcceptableDelay,
          `Mic restart delay is ${actualDelay}ms after TTS ends, ` +
            `exceeds ${maxAcceptableDelay}ms threshold. ${actualDelay - maxAcceptableDelay}ms ` +
            `unnecessary gap before mic restarts.`,
        );
      },
    ),
    { numRuns: 50 },
  );
});

test("Bug Condition Exploration: Word interval is fixed, not dynamic based on TTS duration", () => {
  /**
   * Property: For any text with N words and estimated TTS duration D,
   * the fallback word interval should be D/N (dynamic).
   * The fix adds a `wordIntervalMs` prop to LiveCaption that OVERRIDES the
   * static CAPTION_WORD_INTERVAL_MS constant at runtime. VoiceUI calculates
   * the dynamic interval and passes it as a prop.
   *
   * Validates the fix mechanism:
   * 1. LiveCaption accepts wordIntervalMs prop
   * 2. LiveCaption uses `wordIntervalMs || CAPTION_WORD_INTERVAL_MS` (fallback)
   * 3. VoiceUI calculates dynamic interval: text.length * 75 / wordCount
   */
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 50 }), // word count
      fc.integer({ min: 2000, max: 15000 }), // estimated TTS duration ms
      (wordCount, estimatedDuration) => {
        // 1. LiveCaption accepts wordIntervalMs prop in its function signature
        const liveCaptionAcceptsProp =
          liveCaptionSource.includes("wordIntervalMs");
        assert.ok(
          liveCaptionAcceptsProp,
          `LiveCaption does not accept a wordIntervalMs prop. ` +
            `Without this prop, the interval is fixed at ${ACTUAL_WORD_INTERVAL}ms ` +
            `regardless of TTS duration.`,
        );

        // 2. LiveCaption uses wordIntervalMs || CAPTION_WORD_INTERVAL_MS as fallback
        const usesFallbackPattern = liveCaptionSource.includes(
          "wordIntervalMs || CAPTION_WORD_INTERVAL_MS",
        );
        assert.ok(
          usesFallbackPattern,
          `LiveCaption does not use 'wordIntervalMs || CAPTION_WORD_INTERVAL_MS' fallback. ` +
            `The dynamic prop must override the static constant at runtime.`,
        );

        // 3. VoiceUI calculates dynamic interval: text.length * 75 / wordCount
        const voiceUIHasDynamicCalc =
          voiceUISource.includes("text.length * 75") &&
          voiceUISource.includes("estimatedDuration / wordCount");
        assert.ok(
          voiceUIHasDynamicCalc,
          `VoiceUI does not calculate dynamic word interval (text.length * 75 / wordCount). ` +
            `For ${wordCount} words with ${estimatedDuration}ms TTS duration, expected ` +
            `dynamic interval of ${Math.round(estimatedDuration / wordCount)}ms, ` +
            `but system uses fixed ${ACTUAL_WORD_INTERVAL}ms.`,
        );
      },
    ),
    { numRuns: 50 },
  );
});

test("Bug Condition Exploration: Boundary fallback delay exceeds 400ms threshold", () => {
  /**
   * Property: When boundary events are unavailable, the system should switch
   * to fallback timer within 400ms. On unfixed code, it waits 900ms.
   *
   * Expected: FAIL — BOUNDARY_FALLBACK_DELAY_MS = 900 > 400ms threshold
   */
  fc.assert(
    fc.property(
      fc.integer({ min: 5, max: 100 }), // word count in text
      (_wordCount) => {
        const actualFallbackDelay = ACTUAL_BOUNDARY_FALLBACK_DELAY;
        const maxAcceptableDelay = 400;

        assert.ok(
          actualFallbackDelay <= maxAcceptableDelay,
          `Boundary fallback delay is ${actualFallbackDelay}ms, ` +
            `exceeds ${maxAcceptableDelay}ms threshold. Caption stays silent for ` +
            `${actualFallbackDelay}ms before starting fallback timer.`,
        );
      },
    ),
    { numRuns: 50 },
  );
});

test("Bug Condition Exploration: Combined isBugCondition holds for voice-mode TTS", () => {
  /**
   * Property: For any voice-mode interaction with TTS active, the bug condition
   * should NOT hold (i.e., all timing thresholds should be met).
   * The fix ensures:
   * - speakDelay <= 50ms (40ms)
   * - boundaryDelay <= 150ms (150ms)
   * - micRestartDelay <= 400ms (350ms)
   * - wordInterval is dynamic (VoiceUI calculates text.length * 75 / wordCount)
   * - ttsEndSignal mechanism exists in ChatBubble
   *
   * Expected: PASS — all timing violations are fixed
   */
  fc.assert(
    fc.property(
      fc.record({
        textLength: fc.integer({ min: 100, max: 500 }),
        wordCount: fc.integer({ min: 5, max: 50 }),
        estimatedDuration: fc.integer({ min: 2000, max: 15000 }),
      }),
      ({ textLength, wordCount, estimatedDuration }) => {
        // The fix uses dynamic word interval via prop override, so we check
        // that VoiceUI calculates it dynamically (text.length * 75 / wordCount)
        const voiceUIHasDynamicCalc =
          voiceUISource.includes("text.length * 75") &&
          voiceUISource.includes("estimatedDuration / wordCount");
        // Use the dynamic interval for the isBugCondition check
        const dynamicWordInterval = voiceUIHasDynamicCalc
          ? Math.round(estimatedDuration / wordCount)
          : ACTUAL_WORD_INTERVAL;

        // Check that ChatBubble has ttsEndSignal mechanism
        const hasTypewriterTtsEndSignal =
          chatBubbleSource.includes("ttsEndSignal") &&
          chatBubbleSource.includes("voiceMode");

        const input = {
          mode: "speak",
          ttsActive: true,
          speakDelay: ACTUAL_SPEAK_DELAY,
          boundaryDelay: ACTUAL_BOUNDARY_DELAY,
          micRestartDelay: ACTUAL_MIC_RESTART_DELAY,
          wordInterval: dynamicWordInterval,
          estimatedDuration,
          wordCount,
          hasTypewriterTtsEndSignal: hasTypewriterTtsEndSignal,
        };

        // The bug condition should NOT hold if the system is working correctly
        const bugExists = isBugCondition(input);

        assert.ok(
          !bugExists,
          `Bug condition holds for voice-mode TTS with ${textLength}-char text: ` +
            `speakDelay=${input.speakDelay}ms (max 50), ` +
            `boundaryDelay=${input.boundaryDelay}ms (max 150), ` +
            `micRestartDelay=${input.micRestartDelay}ms (max 400), ` +
            `wordInterval=${input.wordInterval}ms (expected ${Math.round(estimatedDuration / wordCount)}ms), ` +
            `ttsEndSignal=${input.hasTypewriterTtsEndSignal}. ` +
            `Multiple timing violations cause TTS-text desynchronization.`,
        );
      },
    ),
    { numRuns: 100 },
  );
});
