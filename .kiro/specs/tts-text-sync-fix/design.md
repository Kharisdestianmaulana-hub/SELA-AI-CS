# TTS-Text Sync Fix Bugfix Design

## Overview

This bugfix addresses the synchronization gap between TTS (Text-to-Speech) audio output and visual text display in the SELA AI assistant. Three core issues create a "laggy" conversational experience: (1) ChatBubble's typewriter effect runs independently of TTS duration, causing audio-visual disconnect, (2) LiveCaption's boundary delay (700ms) and fallback timer (340ms/word) are too slow to track speech in real-time, and (3) excessive delays in `speakText` initialization (100ms) and post-TTS mic restart (800ms) add unnecessary latency. The fix introduces an event-driven completion signal from TTS to ChatBubble, reduces timing constants, calculates dynamic word intervals, and optimizes delay values.

## Glossary

- **Bug_Condition (C)**: The condition where TTS audio and text display are out of sync — typewriter still animating after TTS ends, captions lagging behind speech, or excessive delays between speech segments
- **Property (P)**: The desired behavior — text display completes when TTS ends, captions track speech within 150ms, and delays are minimized for responsive conversation
- **Preservation**: Existing text-mode typewriter behavior (18ms/char), error handling callbacks, farewell flow, and non-voice-mode functionality must remain unchanged
- **speakText**: The function in `src/lib/ai.js` that wraps the Web Speech API SpeechSynthesisUtterance with onStart/onEnd/onBoundary callbacks
- **speakWithAvatar**: The function in `src/components/VoiceUI.jsx` that orchestrates TTS with avatar state and LiveCaption updates
- **processAudioRef**: The ref-stored async function in VoiceUI.jsx that handles the transcribe → AI → TTS pipeline
- **ChatBubble typewriter**: The 18ms interval animation in `src/components/ChatBubble.jsx` that reveals text character-by-character for new messages
- **LiveCaption**: The subtitle-style component in `src/components/LiveCaption.jsx` that displays spoken text word-by-word synchronized with TTS
- **LIVE_CAPTION_BOUNDARY_DELAY_MS**: Current value 700ms — delay before updating caption on boundary event
- **CAPTION_WORD_INTERVAL_MS**: Current value 340ms — fallback timer interval per word when boundary events unavailable
- **BOUNDARY_FALLBACK_DELAY_MS**: Current value 900ms — timeout before switching to timer fallback
- **spokenText**: The TTS-optimized shorter version of displayText (from `buildSpokenText`)
- **displayText**: The full response text shown in ChatBubble (may be longer than spokenText)

## Bug Details

### Bug Condition

The bug manifests when the system is in voice mode and TTS is active. The `speakWithAvatar` function triggers TTS via `speakText` while ChatBubble independently animates text at 18ms/char, and LiveCaption updates with a 700ms boundary delay. These independent timers create visible desynchronization between what the user hears and what they see.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type { mode, ttsActive, spokenText, displayText, boundaryDelay, wordInterval, speakDelay, micRestartDelay }
  OUTPUT: boolean

  RETURN (input.mode == "speak" AND input.ttsActive == true)
         AND (
           (input.spokenText.length < input.displayText.length AND typewriterStillAnimating(input.displayText))
           OR input.boundaryDelay > 150
           OR input.wordInterval != estimatedTTSDuration / wordCount
           OR input.speakDelay > 50
           OR input.micRestartDelay > 400
         )
END FUNCTION
```

### Examples

- **TTS ends, typewriter still running**: spokenText = "UCIC punya 5 fakultas. Daftar lengkapnya di layar." (50 chars, ~4s TTS), displayText = full 300-char list with details. TTS finishes at 4s but typewriter runs for 300×18ms = 5.4s. User sees silence with text still appearing.
- **Caption lags behind speech**: TTS says word at t=1.0s, boundary event fires at t=1.0s, but caption updates at t=1.7s (700ms delay). User hears word 700ms before seeing it.
- **Fallback timer mismatch**: TTS speaks 20 words in 6s (300ms/word actual), but fallback timer uses 340ms/word. Caption finishes 800ms after TTS ends.
- **Initial delay accumulation**: Voices already loaded but speakText waits 100ms. After TTS ends, mic waits 800ms. Total unnecessary gap: 900ms between conversation turns.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Text-mode (non-voice) ChatBubble typewriter effect must continue at 18ms/char for new messages
- TTS error/interrupted must continue to call finalize/onEnd callback for avatar/UI state sync
- When spokenText equals displayText (ttsMode = "full"), text display must work as before
- LiveCaption must continue to hide when avatarState is not "speaking"
- Small/empty audio blobs must continue to be ignored with listening restart
- Chrome TTS onEnd fallback timeout must continue to force restart listening
- Farewell flow (archive session, reset state) must remain unchanged

**Scope:**
All inputs that do NOT involve voice-mode TTS synchronization should be completely unaffected by this fix. This includes:

- Text-mode chat interactions (typing and receiving messages)
- Mouse/touch interactions with UI elements
- Face detection and auto-activation flow
- Language selection flow
- Session timeout and idle handling

## Hypothesized Root Cause

Based on the bug description, the most likely issues are:

1. **Independent Timer Architecture**: ChatBubble's typewriter uses a fixed 18ms interval that has no awareness of TTS state. There is no callback or event mechanism to signal "TTS has ended, complete the text immediately." The `isNew` prop triggers typewriter but nothing stops it early.

2. **Excessive Boundary Delay**: `LIVE_CAPTION_BOUNDARY_DELAY_MS = 700` was set conservatively to prevent caption from jumping ahead of audio, but modern TTS boundary events are accurate enough for 100-200ms delay. The 700ms creates perceptible lag.

3. **Static Fallback Timer**: `CAPTION_WORD_INTERVAL_MS = 340` is a fixed value that doesn't account for actual TTS speaking rate (which varies by language, text length, and utterance.rate setting of 0.95). A dynamic calculation based on estimated TTS duration would be more accurate.

4. **Conservative Delay Values**: The 100ms `setTimeout(doSpeak, 100)` in `speakText` was added for a Chrome bug where `cancel()` needs a gap before `speak()`, but 100ms is more than needed when voices are already loaded. The 800ms post-TTS mic restart delay was set to avoid echo but is excessive for most environments.

5. **No TTS-to-ChatBubble Communication Channel**: VoiceUI.jsx calls `speakText` and separately renders ChatBubble with `isNew=true`, but there's no mechanism to pass a "TTS ended" signal to ChatBubble to auto-complete its typewriter animation.

## Correctness Properties

Property 1: Bug Condition - TTS-Text Synchronization

_For any_ voice-mode interaction where TTS is active and spokenText differs from displayText, the fixed system SHALL complete the ChatBubble typewriter effect immediately when TTS ends (onEnd fires), update LiveCaption within 150ms of boundary events, use dynamic word intervals matching estimated TTS duration for fallback mode, start speech within 50ms when voices are loaded, and restart mic within 400ms after TTS completes.

**Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.6, 2.7**

Property 2: Preservation - Non-Voice-Mode and Error Behavior

_For any_ input where the system is NOT in voice-mode TTS synchronization (text-mode chat, error states, non-speaking avatar states), the fixed code SHALL produce exactly the same behavior as the original code, preserving text-mode typewriter at 18ms/char, error callback invocation, farewell flow, and all non-TTS UI interactions.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/components/ChatBubble.jsx`

**Function**: `ChatBubble` component

**Specific Changes**:

1. **Add `onTtsEnd` prop**: Accept an optional callback/ref that signals TTS has ended. When this signal fires, immediately set `displayed` to the full `text`, clearing the interval.
2. **Add `voiceMode` prop**: When `voiceMode=true` and `isNew=true`, use a faster typewriter speed or skip typewriter entirely if spokenText is much shorter than displayText.
3. **Auto-complete on TTS end**: Register an effect that listens for the TTS-end signal. When received, call `clearInterval(intervalRef.current)` and `setDisplayed(text)`.

**Implementation approach**: VoiceUI will pass a ref (`ttsEndSignalRef`) to ChatBubble. When TTS onEnd fires, VoiceUI sets `ttsEndSignalRef.current = Date.now()`. ChatBubble watches this ref value change and auto-completes.

---

**File**: `src/components/LiveCaption.jsx`

**Function**: LiveCaption component constants and timer logic

**Specific Changes**:

1. **Reduce boundary delay**: Change `LIVE_CAPTION_BOUNDARY_DELAY_MS` from 700 to a new constant or remove the delay timer in `speakWithAvatar`'s onBoundary callback, replacing with ~150ms.
2. **Dynamic word interval**: Replace fixed `CAPTION_WORD_INTERVAL_MS = 340` with a prop-driven dynamic interval. VoiceUI will calculate `estimatedDuration / wordCount` and pass it as a prop.
3. **Reduce fallback timeout**: Change `BOUNDARY_FALLBACK_DELAY_MS` from 900 to 400ms so caption starts sooner when boundary events are unavailable.
4. **Accept `wordIntervalMs` prop**: Allow VoiceUI to pass a calculated interval based on TTS duration estimate.

---

**File**: `src/components/VoiceUI.jsx`

**Function**: `speakWithAvatar`, `processAudioRef`

**Specific Changes**:

1. **Signal ChatBubble on TTS end**: Create a `ttsEndSignalRef` that gets updated when TTS onEnd fires. Pass this to ChatBubble as a prop.
2. **Reduce boundary delay constant**: Change `LIVE_CAPTION_BOUNDARY_DELAY_MS` from 700 to 150.
3. **Calculate dynamic word interval**: In `speakWithAvatar`, compute `estimatedDuration = spokenText.length * 75` (ms per char at rate 0.95), then `wordInterval = estimatedDuration / wordCount`. Pass to LiveCaption.
4. **Reduce mic restart delay**: In `processAudioRef`'s TTS onEnd callback, change `setTimeout(() => startListeningRef.current?.(), 800)` to `setTimeout(() => startListeningRef.current?.(), 350)`.
5. **Pass voiceMode to ChatBubble**: Add `voiceMode={mode === "speak"}` prop to ChatBubble instances in speak mode.

---

**File**: `src/lib/ai.js`

**Function**: `speakText`

**Specific Changes**:

1. **Reduce initial delay**: Change `setTimeout(doSpeak, 100)` to `setTimeout(doSpeak, 40)` when voices are already loaded. The Chrome cancel-before-speak bug needs minimal gap, not 100ms.
2. **Keep voiceschanged path**: The `onvoiceschanged` fallback path can also use 40ms since it only fires after voices load.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that measure timing between TTS events and text display state. Simulate TTS onEnd firing while typewriter is still running, measure LiveCaption update latency after boundary events, and verify delay constants. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:

1. **Typewriter-TTS Desync Test**: Simulate a ChatBubble with 300-char text (isNew=true) and fire a TTS-end signal at 4000ms. Assert that displayed text equals full text within 50ms of signal. (will fail on unfixed code — no signal mechanism exists)
2. **LiveCaption Boundary Lag Test**: Fire a boundary event with charIndex=50 and measure time until LiveCaption updates. Assert update happens within 200ms. (will fail on unfixed code — 700ms delay)
3. **Fallback Timer Accuracy Test**: Set text with 20 words and estimated TTS duration of 6000ms. Assert fallback timer uses ~300ms/word interval. (will fail on unfixed code — fixed 340ms)
4. **Initial Delay Test**: Call speakText with voices already loaded and measure time to utterance.onstart. Assert < 60ms. (will fail on unfixed code — 100ms setTimeout)

**Expected Counterexamples**:

- ChatBubble continues animating 1-2 seconds after TTS ends because no completion signal exists
- LiveCaption shows word 700ms after TTS speaks it
- Possible causes: independent timer architecture, excessive delay constants, no inter-component communication

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**

```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT typewriterCompletesOnTtsEnd(result)
  ASSERT captionLag(result) <= 150ms
  ASSERT fallbackInterval(result) == estimatedDuration / wordCount
  ASSERT speakDelay(result) <= 50ms
  ASSERT micRestartDelay(result) <= 400ms
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (various text lengths, modes, avatar states)
- It catches edge cases that manual unit tests might miss (empty text, very short text, text with URLs)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for text-mode interactions, error handling, and non-speaking states, then write property-based tests capturing that behavior.

**Test Cases**:

1. **Text-Mode Typewriter Preservation**: Verify that ChatBubble in text mode (voiceMode=false, isNew=true) still animates at 18ms/char regardless of any TTS signal. Observe on unfixed code, then verify after fix.
2. **Error Callback Preservation**: Verify that speakText error/interrupted still calls onEnd/finalize. Observe on unfixed code, then verify after fix.
3. **Non-Speaking LiveCaption Hidden**: Verify LiveCaption returns null when avatarState !== "speaking". Observe on unfixed code, then verify after fix.
4. **Farewell Flow Preservation**: Verify farewell detection, archive, and reset still work identically. Observe on unfixed code, then verify after fix.

### Unit Tests

- Test ChatBubble auto-completes typewriter when ttsEndSignal changes (voice mode)
- Test ChatBubble ignores ttsEndSignal in text mode
- Test LiveCaption updates within 150ms of boundary event
- Test LiveCaption uses dynamic word interval when provided
- Test LiveCaption falls back to timer within 400ms when no boundary events arrive
- Test speakText calls doSpeak within 50ms when voices loaded
- Test mic restart happens within 400ms after TTS onEnd

### Property-Based Tests

- Generate random text lengths (1-500 chars) and verify typewriter auto-completes on TTS-end signal in voice mode
- Generate random text lengths and verify typewriter runs to completion at 18ms/char in text mode (preservation)
- Generate random word counts and TTS durations, verify dynamic interval calculation: `interval = duration / wordCount` is within ±10% of expected
- Generate random charIndex values and verify LiveCaption boundary update latency ≤ 150ms

### Integration Tests

- Test full voice flow: user speaks → AI responds → TTS plays → typewriter completes on TTS end → mic restarts within 400ms
- Test that switching from voice mode to text mode mid-conversation preserves typewriter behavior
- Test LiveCaption with real boundary events from SpeechSynthesis API (browser integration)
- Test that very short spokenText (summary) with long displayText (full list) results in typewriter completing when short TTS ends
