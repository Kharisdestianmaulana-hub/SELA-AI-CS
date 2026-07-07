# Implementation Plan

## Overview

This implementation plan fixes the TTS-Text synchronization desync bug in the SELA AI assistant. The fix follows the exploratory bugfix workflow: first writing tests to confirm the bug exists, then writing preservation tests to protect existing behavior, then implementing the fix across four files (ai.js, VoiceUI.jsx, ChatBubble.jsx, LiveCaption.jsx), and finally validating that all tests pass.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - TTS-Text Synchronization Desync
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the TTS-text desynchronization bug
  - **Scoped PBT Approach**: Scope the property to concrete failing cases:
    - ChatBubble with `isNew=true` and 300-char displayText: fire a simulated TTS-end signal at 4000ms, assert displayed text equals full text within 50ms of signal (will fail — no signal mechanism exists)
    - LiveCaption with `LIVE_CAPTION_BOUNDARY_DELAY_MS = 700`: fire boundary event with charIndex, assert caption updates within 200ms (will fail — 700ms delay)
    - `speakText` with voices loaded: measure time to utterance start, assert < 60ms (will fail — 100ms setTimeout)
    - Mic restart after TTS onEnd: assert restart within 400ms (will fail — 800ms delay)
  - Test that for voice-mode inputs where `isBugCondition(input)` holds:
    - `input.mode == "speak" AND input.ttsActive == true`
    - Typewriter does NOT auto-complete on TTS end (no signal mechanism)
    - Boundary delay is 700ms (exceeds 150ms threshold)
    - Word interval is fixed 340ms (not dynamic based on TTS duration)
    - Speak delay is 100ms (exceeds 50ms threshold)
    - Mic restart delay is 800ms (exceeds 400ms threshold)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found:
    - ChatBubble continues animating 1-2 seconds after TTS ends because no completion signal exists
    - LiveCaption shows word 700ms after TTS speaks it
    - 100ms unnecessary delay before speech starts
    - 800ms gap before mic restarts after TTS
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Voice-Mode and Error Behavior
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (cases where `isBugCondition` returns false):
    - Observe: ChatBubble with `isNew=true`, `voiceMode=false` (text mode) animates at 18ms/char for any text length
    - Observe: ChatBubble with `isNew=false` displays full text immediately regardless of mode
    - Observe: `speakText` error/interrupted still calls `finalize()` → `onEnd` callback
    - Observe: LiveCaption returns `null` when `avatarState !== "speaking"`
    - Observe: Small/empty audio blobs are ignored and listening restarts
  - Write property-based tests capturing observed behavior:
    - For all text lengths (1-500 chars) in text mode (`voiceMode=false`, `isNew=true`): typewriter runs at 18ms/char to completion without early termination
    - For all text values with `isNew=false`: displayed text equals full text immediately
    - For all error states in `speakText`: `onEnd` callback is always invoked
    - For all `avatarState` values !== "speaking": LiveCaption renders null
  - Verify tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for TTS-Text synchronization desync
  - [x] 3.1 Reduce speakText initial delay in ai.js
    - Change `setTimeout(doSpeak, 100)` to `setTimeout(doSpeak, 40)` in both the voices-loaded path and the `onvoiceschanged` fallback path
    - File: `src/lib/ai.js`, speakText function (around line 3088)
    - The Chrome cancel-before-speak bug needs minimal gap, not 100ms
    - _Bug_Condition: isBugCondition(input) where input.speakDelay > 50_
    - _Expected_Behavior: speakDelay <= 50ms when voices are loaded_
    - _Preservation: Error/interrupted still calls finalize/onEnd_
    - _Requirements: 2.7, 3.2_

  - [x] 3.2 Add ttsEndSignal mechanism in VoiceUI.jsx
    - Create a `ttsEndSignalRef = useRef(0)` and a `ttsEndSignal` state
    - In `speakWithAvatar`'s onEnd callback, update `setTtsEndSignal(Date.now())` to signal TTS completion
    - Pass `ttsEndSignal` as prop to ChatBubble instances rendered in speak mode
    - Pass `voiceMode={mode === "speak"}` prop to ChatBubble instances in speak mode
    - _Bug_Condition: isBugCondition(input) where typewriterStillAnimating after TTS ends_
    - _Expected_Behavior: ChatBubble receives TTS-end signal and auto-completes typewriter_
    - _Preservation: Text-mode ChatBubble unaffected (voiceMode=false)_
    - _Requirements: 2.1, 3.1_

  - [x] 3.3 Modify ChatBubble.jsx to accept ttsEndSignal and voiceMode props
    - Add `ttsEndSignal` and `voiceMode` props to ChatBubble component signature
    - Add useEffect that watches `ttsEndSignal` changes: when signal fires AND `voiceMode=true` AND `isNew=true`, call `clearInterval(intervalRef.current)` and `setDisplayed(text)` to auto-complete typewriter
    - When `voiceMode=false` or `ttsEndSignal` is 0/null, typewriter runs normally at 18ms/char
    - _Bug_Condition: isBugCondition(input) where spokenText.length < displayText.length AND typewriterStillAnimating_
    - _Expected_Behavior: typewriter completes immediately when TTS onEnd fires_
    - _Preservation: Text-mode typewriter at 18ms/char unchanged_
    - _Requirements: 2.1, 2.2, 3.1, 3.3_

  - [x] 3.4 Reduce LIVE_CAPTION_BOUNDARY_DELAY_MS in VoiceUI.jsx
    - Change `const LIVE_CAPTION_BOUNDARY_DELAY_MS = 700` to `const LIVE_CAPTION_BOUNDARY_DELAY_MS = 150`
    - This reduces the delay between TTS boundary event and caption update from 700ms to 150ms
    - _Bug_Condition: isBugCondition(input) where input.boundaryDelay > 150_
    - _Expected_Behavior: caption updates within 150ms of boundary event_
    - _Preservation: LiveCaption still hidden when avatarState !== "speaking"_
    - _Requirements: 2.3, 3.4_

  - [x] 3.5 Add dynamic word interval calculation in VoiceUI.jsx and pass to LiveCaption
    - In `speakWithAvatar`, calculate `estimatedDuration = text.length * 75` (ms per char at rate 0.95)
    - Calculate `wordCount = text.split(/\s+/).filter(w => w.length > 0).length`
    - Calculate `wordIntervalMs = Math.round(estimatedDuration / wordCount)`
    - Pass `wordIntervalMs` as prop to LiveCaption component
    - Store in state: `const [liveCaptionWordInterval, setLiveCaptionWordInterval] = useState(null)`
    - _Bug_Condition: isBugCondition(input) where input.wordInterval != estimatedTTSDuration / wordCount_
    - _Expected_Behavior: fallback timer uses dynamic interval matching TTS duration_
    - _Preservation: When wordIntervalMs not provided, LiveCaption uses its own default_
    - _Requirements: 2.4_

  - [x] 3.6 Modify LiveCaption.jsx to accept wordIntervalMs prop and reduce BOUNDARY_FALLBACK_DELAY_MS
    - Add `wordIntervalMs` prop to LiveCaption component signature
    - Use `wordIntervalMs || CAPTION_WORD_INTERVAL_MS` as the interval for the fallback timer
    - Change `const BOUNDARY_FALLBACK_DELAY_MS = 900` to `const BOUNDARY_FALLBACK_DELAY_MS = 400`
    - This makes caption start sooner when boundary events are unavailable
    - _Bug_Condition: isBugCondition(input) where fallback timer uses fixed 340ms regardless of TTS speed_
    - _Expected_Behavior: fallback uses dynamic interval, switches within 400ms_
    - _Preservation: When no wordIntervalMs prop, falls back to 340ms default_
    - _Requirements: 2.4, 2.5_

  - [x] 3.7 Reduce mic restart delay in processAudioRef
    - Change `setTimeout(() => startListeningRef.current?.(), 800)` to `setTimeout(() => startListeningRef.current?.(), 350)` in both occurrences in processAudioRef
    - File: `src/components/VoiceUI.jsx`, processAudioRef (around lines 1000 and 1012)
    - _Bug_Condition: isBugCondition(input) where input.micRestartDelay > 400_
    - _Expected_Behavior: mic restarts within 400ms after TTS completes_
    - _Preservation: Small/empty audio blobs still ignored, Chrome TTS fallback timeout unchanged_
    - _Requirements: 2.6, 3.5, 3.6_

  - [x] 3.8 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - TTS-Text Synchronization Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied:
      - ChatBubble auto-completes typewriter on TTS-end signal
      - LiveCaption updates within 150ms of boundary events
      - speakText starts within 50ms when voices loaded
      - Mic restarts within 400ms after TTS ends
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.9 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Voice-Mode and Error Behavior
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix:
      - Text-mode typewriter at 18ms/char unchanged
      - Error callbacks still invoked
      - LiveCaption hidden when not speaking
      - Farewell flow unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite to verify no regressions
  - Verify bug condition test (Property 1) passes
  - Verify preservation tests (Property 2) pass
  - Ensure all timing constants are correct:
    - `speakText` delay: 40ms (was 100ms)
    - `LIVE_CAPTION_BOUNDARY_DELAY_MS`: 150ms (was 700ms)
    - `BOUNDARY_FALLBACK_DELAY_MS`: 400ms (was 900ms)
    - Mic restart delay: 350ms (was 800ms)
  - Ensure all tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Wave 1 - Exploration & Preservation Tests",
      "tasks": ["1", "2"],
      "description": "Write bug condition exploration test and preservation property tests before implementing the fix"
    },
    {
      "name": "Wave 2 - Core Implementation",
      "tasks": ["3.1", "3.2", "3.4", "3.5", "3.7"],
      "description": "Implement independent timing fixes and add ttsEndSignal mechanism"
    },
    {
      "name": "Wave 3 - Dependent Implementation",
      "tasks": ["3.3", "3.6"],
      "description": "Modify ChatBubble and LiveCaption to accept new props from Wave 2"
    },
    {
      "name": "Wave 4 - Verification",
      "tasks": ["3.8", "3.9"],
      "description": "Verify bug condition test passes and preservation tests still pass"
    },
    {
      "name": "Wave 5 - Checkpoint",
      "tasks": ["4"],
      "description": "Final checkpoint ensuring all tests pass"
    }
  ]
}
```

## Notes

- All timing constant changes are based on the design document's analysis of minimum viable delays for Chrome's Web Speech API
- The fix introduces a new communication channel (ttsEndSignal) between VoiceUI and ChatBubble that did not exist before
- Property-based tests use random text lengths and word counts to ensure broad coverage of the input space
- The 40ms speakText delay is the minimum needed for Chrome's cancel-before-speak bug workaround
- Dynamic word interval calculation assumes ~75ms per character at TTS rate 0.95
