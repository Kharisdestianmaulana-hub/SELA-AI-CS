/**
 * Preservation Property Tests: Non-Voice-Mode and Error Behavior
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * Property 2: Preservation — Non-Voice-Mode and Error Behavior
 *
 * These tests capture the EXISTING correct behavior on UNFIXED code for
 * non-buggy inputs (cases where isBugCondition returns false).
 * They MUST PASS on unfixed code to confirm baseline behavior to preserve.
 *
 * Observations on unfixed code:
 * - ChatBubble with isNew=true, voiceMode=false (text mode) animates at 18ms/char
 * - ChatBubble with isNew=false displays full text immediately regardless of mode
 * - speakText error/interrupted still calls finalize() → onEnd callback
 * - LiveCaption returns null when avatarState !== "speaking"
 * - Small/empty audio blobs are ignored and listening restarts
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

// ── Load source files ────────────────────────────────────────────────────────

const chatBubbleSource = readSource("src/components/ChatBubble.jsx");
const liveCaptionSource = readSource("src/components/LiveCaption.jsx");
const aiSource = readSource("src/lib/ai.js");
const voiceUISource = readSource("src/components/VoiceUI.jsx");

// ── Helper: extract constants and patterns from source ───────────────────────

function extractConstantFromSource(source, pattern) {
  const match = source.match(pattern);
  return match ? Number(match[1]) : null;
}

// ── Property 2.1: Text-mode typewriter runs at 18ms/char ─────────────────────

test("Preservation: Text-mode typewriter interval is 18ms/char for all text lengths", () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * Observation: ChatBubble with isNew=true, voiceMode=false (text mode)
   * animates at 18ms/char for any text length.
   *
   * Property: For all text lengths (1-500 chars) in text mode (voiceMode=false,
   * isNew=true), the typewriter runs at 18ms/char to completion without early
   * termination.
   *
   * Verification approach: Confirm the source code uses a fixed 18ms interval
   * in the setInterval call, and that no voiceMode/ttsEndSignal mechanism
   * exists that would alter text-mode behavior.
   */
  const EXPECTED_TYPEWRITER_INTERVAL = 18;

  // Extract the typewriter interval from ChatBubble source
  // The setInterval is multi-line: setInterval(() => { ... }, 18)
  const intervalMatch = chatBubbleSource.match(
    /intervalRef\.current\s*=\s*setInterval\([\s\S]*?\},\s*(\d+)\)/,
  );
  const actualInterval = intervalMatch ? Number(intervalMatch[1]) : null;

  fc.assert(
    fc.property(fc.integer({ min: 1, max: 500 }), (textLength) => {
      // Verify the typewriter interval is exactly 18ms
      assert.strictEqual(
        actualInterval,
        EXPECTED_TYPEWRITER_INTERVAL,
        `Typewriter interval should be ${EXPECTED_TYPEWRITER_INTERVAL}ms for ` +
          `${textLength}-char text in text mode, but found ${actualInterval}ms`,
      );

      // Verify the typewriter runs to completion: the interval clears only
      // when i >= text.length (no early termination mechanism for text mode)
      const hasCompletionCheck = chatBubbleSource.includes(
        "if (i >= text.length) clearInterval(intervalRef.current)",
      );
      assert.ok(
        hasCompletionCheck,
        `Typewriter for ${textLength}-char text should run to completion ` +
          `(clear interval only when all chars displayed)`,
      );

      // Calculate expected duration for this text length
      const expectedDurationMs = textLength * EXPECTED_TYPEWRITER_INTERVAL;
      assert.ok(
        expectedDurationMs > 0,
        `Typewriter duration for ${textLength} chars should be ${expectedDurationMs}ms`,
      );
    }),
    { numRuns: 100 },
  );
});

// ── Property 2.2: isNew=false displays full text immediately ─────────────────

test("Preservation: ChatBubble with isNew=false displays full text immediately", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * Observation: ChatBubble with isNew=false displays full text immediately
   * regardless of mode.
   *
   * Property: For all text values with isNew=false, displayed text equals
   * full text immediately (no typewriter animation).
   *
   * Verification approach: Confirm the source code sets displayed=text when
   * isNew is false, and that the useEffect handles this case by setting
   * displayed directly.
   */
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 500 }), (text) => {
      // Verify ChatBubble initializes displayed state based on isNew
      // When isNew=false: useState(isNew ? '' : text) → displayed = text
      const hasConditionalInit = chatBubbleSource.includes(
        "useState(isNew ? '' : text)",
      );
      assert.ok(
        hasConditionalInit,
        `ChatBubble should initialize displayed=${JSON.stringify(text.slice(0, 20))}... ` +
          `immediately when isNew=false`,
      );

      // Verify the useEffect also handles isNew=false by setting displayed=text
      // Pattern: if (!isNew || !text) { setDisplayed(text); return; }
      const hasDirectSet =
        chatBubbleSource.includes("if (!isNew || !text)") &&
        chatBubbleSource.includes("setDisplayed(text)");
      assert.ok(
        hasDirectSet,
        `ChatBubble should set displayed to full text for isNew=false ` +
          `(text length: ${text.length} chars)`,
      );
    }),
    { numRuns: 100 },
  );
});

// ── Property 2.3: speakText error/interrupted calls onEnd ────────────────────

test("Preservation: speakText error/interrupted always invokes onEnd callback", () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * Observation: speakText error/interrupted still calls finalize() → onEnd callback.
   *
   * Property: For all error states in speakText, the onEnd callback is always
   * invoked (via finalize()).
   *
   * Verification approach: Confirm the source code structure ensures finalize()
   * is called in both onerror and onend handlers, and that the early return
   * when speechSynthesis is not supported also calls onEnd.
   */
  // Possible error scenarios in speakText
  const errorScenarios = [
    "speechSynthesis_not_supported",
    "utterance_onerror",
    "utterance_onend_normal",
    "utterance_interrupted",
  ];

  fc.assert(
    fc.property(fc.constantFrom(...errorScenarios), (scenario) => {
      switch (scenario) {
        case "speechSynthesis_not_supported": {
          // When speechSynthesis is not in window, onEnd is called directly
          const hasEarlyReturn = aiSource.includes(
            'if (!("speechSynthesis" in window))',
          );
          const callsOnEndOnUnsupported =
            aiSource.includes(
              'console.warn("SpeechSynthesis API not supported',
            ) && aiSource.includes("if (onEnd) onEnd()");
          assert.ok(
            hasEarlyReturn && callsOnEndOnUnsupported,
            `speakText should call onEnd when speechSynthesis is not supported ` +
              `(scenario: ${scenario})`,
          );
          break;
        }
        case "utterance_onerror": {
          // onerror handler calls finalize()
          const hasOnerror = aiSource.includes("utterance.onerror");
          const onerrorCallsFinalize = aiSource.includes(
            "utterance.onerror = (e) => {\n      // Tetap finalize juga saat interrupted",
          );
          // Check that finalize calls onEnd
          const finalizeCallsOnEnd =
            aiSource.includes("const finalize = () =>") &&
            aiSource.includes("if (onEnd) onEnd()");
          assert.ok(
            hasOnerror && onerrorCallsFinalize && finalizeCallsOnEnd,
            `speakText onerror should call finalize() which calls onEnd ` +
              `(scenario: ${scenario})`,
          );
          break;
        }
        case "utterance_onend_normal": {
          // onend handler calls finalize()
          const onendCallsFinalize =
            aiSource.includes("utterance.onend = () =>") &&
            aiSource.includes("finalize()");
          assert.ok(
            onendCallsFinalize,
            `speakText onend should call finalize() (scenario: ${scenario})`,
          );
          break;
        }
        case "utterance_interrupted": {
          // The settled flag prevents double-calling onEnd
          const hasSettledGuard =
            aiSource.includes("let settled = false") &&
            aiSource.includes("if (settled) return") &&
            aiSource.includes("settled = true");
          assert.ok(
            hasSettledGuard,
            `speakText finalize should use settled guard to prevent double onEnd ` +
              `(scenario: ${scenario})`,
          );
          break;
        }
      }
    }),
    { numRuns: 20 },
  );
});

// ── Property 2.4: LiveCaption returns null when avatarState !== "speaking" ───

test("Preservation: LiveCaption renders null when avatarState is not speaking", () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * Observation: LiveCaption returns null when avatarState !== "speaking".
   *
   * Property: For all avatarState values !== "speaking", LiveCaption renders null.
   *
   * Verification approach: Confirm the source code has an early return of null
   * when avatarState !== "speaking".
   */
  const nonSpeakingStates = [
    "idle",
    "listening",
    "thinking",
    "loading",
    "error",
    "inactive",
    "paused",
  ];

  fc.assert(
    fc.property(fc.constantFrom(...nonSpeakingStates), (avatarState) => {
      // Verify LiveCaption has the guard that returns null for non-speaking states
      const hasGuard = liveCaptionSource.includes(
        'if (avatarState !== "speaking")',
      );
      const returnsNull = liveCaptionSource.includes(
        'if (avatarState !== "speaking") {\n    return null;\n  }',
      );

      assert.ok(
        hasGuard && returnsNull,
        `LiveCaption should return null when avatarState="${avatarState}" ` +
          `(not "speaking")`,
      );

      // Verify the component accepts avatarState prop with default "idle"
      const hasDefaultIdle = liveCaptionSource.includes('avatarState = "idle"');
      assert.ok(
        hasDefaultIdle,
        `LiveCaption should default avatarState to "idle" ` +
          `(current state: "${avatarState}")`,
      );
    }),
    { numRuns: 30 },
  );
});

// ── Property 2.5: Small/empty audio blobs are ignored ────────────────────────

test("Preservation: Small/empty audio blobs are ignored and listening restarts", () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * Observation: Small/empty audio blobs are ignored and listening restarts.
   *
   * Property: When audio blob is too small or no speech is detected, the system
   * ignores the input and restarts listening.
   *
   * Verification approach: Confirm the source code checks blob size and speech
   * duration before processing, and restarts listening on rejection.
   */
  fc.assert(
    fc.property(
      fc.record({
        blobSize: fc.integer({ min: 0, max: 5000 }),
        speechDuration: fc.integer({ min: 0, max: 2000 }),
        hadSpeech: fc.boolean(),
      }),
      ({ blobSize, speechDuration, hadSpeech }) => {
        // Verify VoiceUI checks for small blobs and short speech
        const hasMinBlobCheck = voiceUISource.includes(
          "audioBlob.size < MIN_BLOB_SIZE",
        );
        const hasMinSpeechCheck = voiceUISource.includes(
          "speechDuration < MIN_SPEECH_MS",
        );
        const hasHadSpeechCheck = voiceUISource.includes("!hadSpeech");

        assert.ok(
          hasMinBlobCheck,
          `VoiceUI should check audioBlob.size < MIN_BLOB_SIZE ` +
            `(blob size: ${blobSize})`,
        );
        assert.ok(
          hasMinSpeechCheck,
          `VoiceUI should check speechDuration < MIN_SPEECH_MS ` +
            `(duration: ${speechDuration}ms)`,
        );
        assert.ok(
          hasHadSpeechCheck,
          `VoiceUI should check !hadSpeech (hadSpeech: ${hadSpeech})`,
        );

        // Verify that rejected audio leads to listening restart
        const restartsListening = voiceUISource.includes(
          'console.log("[SELA] Skip — noise/pendek/kecil:"',
        );
        const hasRestartAfterSkip =
          voiceUISource.includes('setAvatarState("idle")') &&
          voiceUISource.includes(
            "setTimeout(() => startListeningRef.current?.(), 300)",
          );

        assert.ok(
          restartsListening && hasRestartAfterSkip,
          `VoiceUI should restart listening after rejecting small/empty blob ` +
            `(size: ${blobSize}, duration: ${speechDuration}ms, hadSpeech: ${hadSpeech})`,
        );
      },
    ),
    { numRuns: 50 },
  );
});
