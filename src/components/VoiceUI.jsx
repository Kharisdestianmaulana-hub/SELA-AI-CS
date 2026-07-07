import { useState, useRef, useEffect, useCallback } from "react";
import ChatBubble from "./ChatBubble";
import LiveCaption from "./LiveCaption";
import AvatarPlaceholder from "./AvatarPlaceholder";
import MediaCarousel from "./MediaCarousel";
import AnswerCard from "./AnswerCard";
import {
  transcribeAudio,
  getChatCompletion,
  speakText,
  getTimeBasedGreeting,
  archiveConversationSession,
  prepareTranscriptForRag,
  looksLikeShortValidQuery,
} from "../lib/ai";
import {
  buildSpeechTimeline,
  getDefaultViseme,
  getSpeechFrame,
} from "../lib/speechSync";
import {
  appendSessionTurn,
  buildDirectRecallResponse,
  clearSessionMemory,
  createSessionMemory,
  finalizeSessionMemory,
  loadSessionMemory,
  saveSessionMemory,
} from "../lib/sessionMemory";

// ── SVG Icons ────────────────────────────────────────────────────
const IconMicToggle = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm-1 18v3h2v-3a8.03 8.03 0 005.65-2.35l-1.41-1.41A6 6 0 0112 19a6 6 0 01-4.24-1.76L6.35 18.65A8.03 8.03 0 0011 21z" />
  </svg>
);

const IconSparkle = () => (
  <svg
    className="w-10 h-10 text-blue-200"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.2}
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
);

const IconChevronDown = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const IconChat = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 10h8M8 14h5m7-2a8 8 0 11-14.32-4.9A8 8 0 0120 12z"
    />
  </svg>
);

const IconClose = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 6l12 12M18 6L6 18"
    />
  </svg>
);
// ─────────────────────────────────────────────────────────────────

import { t } from "../lib/translations";

const RECORDER_MIME_CANDIDATES = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
];

function getSupportedRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    RECORDER_MIME_CANDIDATES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) || ""
  );
}

function encodeWavBlob(channelChunks = [], sampleRate = 48000) {
  const totalLength = channelChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(totalLength);
  let offset = 0;

  channelChunks.forEach((chunk) => {
    samples.set(chunk, offset);
    offset += chunk.length;
  });

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (byteOffset, value) => {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(byteOffset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let dataOffset = 44;
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      dataOffset,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
    dataOffset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function trimPcmChunksForSpeech(
  channelChunks = [],
  sampleRate = 48000,
  {
    recordingStartedAt = 0,
    speechStartedAt = 0,
    recordingEndedAt = 0,
    prePaddingMs = 450,
    postPaddingMs = 350,
  } = {},
) {
  if (!channelChunks.length || !recordingStartedAt || !speechStartedAt) {
    return channelChunks;
  }

  const totalLength = channelChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const startMs = Math.max(0, speechStartedAt - recordingStartedAt - prePaddingMs);
  const endMs = Math.max(
    startMs + 600,
    recordingEndedAt - recordingStartedAt + postPaddingMs,
  );
  const startSample = Math.max(0, Math.floor((startMs / 1000) * sampleRate));
  const endSample = Math.min(
    totalLength,
    Math.ceil((endMs / 1000) * sampleRate),
  );

  if (endSample <= startSample || endSample - startSample < sampleRate * 0.4) {
    return channelChunks;
  }

  const samples = new Float32Array(endSample - startSample);
  let sourceOffset = 0;
  let targetOffset = 0;

  for (const chunk of channelChunks) {
    const chunkStart = sourceOffset;
    const chunkEnd = sourceOffset + chunk.length;
    sourceOffset = chunkEnd;

    if (chunkEnd <= startSample || chunkStart >= endSample) continue;

    const copyStart = Math.max(0, startSample - chunkStart);
    const copyEnd = Math.min(chunk.length, endSample - chunkStart);
    samples.set(chunk.subarray(copyStart, copyEnd), targetOffset);
    targetOffset += copyEnd - copyStart;
  }

  return [samples.subarray(0, targetOffset)];
}

// ─────────────────────────────────────────────────────────────────
const SILENCE_DURATION = 1150; // ms diam setelah ada suara → tahan supaya kalimat tidak kepotong
const MIN_SPEECH_MS = 750; // ms minimum bicara — lebih aman untuk STT menangkap konteks
const MIN_BLOB_SIZE = 30000; // bytes minimum audio — audio terlalu kecil = pasti noise
const MAX_RECORD_MS = 20000; // 20 detik maksimal recording sebagai failsafe
const THRESHOLD_MULTIPLIER = 2.8; // Increased from 2.0 → lebih strict untuk noise filtering
const BASELINE_SAMPLE_MS = 500; // ms untuk sample baseline noise
const EARLY_SPEECH_THRESHOLD_MULTIPLIER = 1.6; // Increased from 1.35 → lebih strict saat baseline
const MIN_TRANSCRIPT_CHARS = 6;
const QUICK_COMMIT_SILENCE_MS = 850; // commit cepat tapi tidak terlalu agresif memotong akhir kata
const QUICK_COMMIT_MIN_SPEECH_MS = 900;
const MIN_RMS_FOR_VALID_SPEECH = 8; // Minimum RMS level untuk dianggap speech, bukan noise
const MIN_SPEECHLIKE_RATIO = 0.08; // minimal frame yang mirip speech sebelum dikirim STT
const MIN_GATED_SPEECH_FRAMES = 3; // harus ada beberapa frame audio yang lolos face/mouth gate
const MOUTH_ACTIVITY_WINDOW_MS = 900; // toleransi mulut bergerak dekat dengan audio naik
const FACE_GATE_WINDOW_MS = 1200; // toleransi wajah valid dekat dengan audio naik
const IDLE_SESSION_MS = 90 * 1000; // 90 detik tanpa interaksi -> reset sesi
const FACE_LOST_END_MS = 60 * 1000; // lebih longgar untuk PC landscape; reset utama tetap dari idle/farewell
const LIVE_CAPTION_BOUNDARY_DELAY_MS = 150; // tahan subtitle sedikit supaya sinkron dengan suara
const SCREEN_CARD_HOLD_MS = 9000;

// Farewell detection
const FAREWELL_KEYWORDS = [
  "terima kasih",
  "terimakasih",
  "makasih",
  "sampai jumpa",
  "sampai bertemu",
  "selamat tinggal",
  "dadah",
  "bye",
  "thanks",
  "thank you",
];
const isFarewell = (text) =>
  FAREWELL_KEYWORDS.some((kw) => text.toLowerCase().includes(kw));

function getFrameAudioFeatures(data) {
  if (!data?.length) return { rms: 0, zcr: 0, clippedRatio: 0 };
  let squareSum = 0;
  let crossings = 0;
  let clipped = 0;
  let previous = data[0] - 128;

  for (let index = 0; index < data.length; index++) {
    const centered = data[index] - 128;
    squareSum += centered * centered;
    if (index > 0 && centered * previous < 0) crossings++;
    if (Math.abs(centered) > 120) clipped++;
    previous = centered;
  }

  return {
    rms: Math.sqrt(squareSum / data.length),
    zcr: crossings / Math.max(1, data.length - 1),
    clippedRatio: clipped / data.length,
  };
}

function isSpeechLikeFrame({ rms, zcr, clippedRatio }, threshold) {
  return (
    rms > threshold &&
    zcr >= 0.012 &&
    zcr <= 0.32 &&
    clippedRatio < 0.08
  );
}

function createVadStats() {
  return {
    frames: 0,
    loudFrames: 0,
    speechLikeFrames: 0,
    gatedSpeechFrames: 0,
    blockedByFaceGateFrames: 0,
    blockedByMouthGateFrames: 0,
    rmsSum: 0,
    maxRms: 0,
    zcrSum: 0,
  };
}

function summarizeVadStats(stats) {
  const frames = Math.max(1, stats?.frames || 0);
  return {
    frames: stats?.frames || 0,
    loudFrames: stats?.loudFrames || 0,
    speechLikeFrames: stats?.speechLikeFrames || 0,
    gatedSpeechFrames: stats?.gatedSpeechFrames || 0,
    blockedByFaceGateFrames: stats?.blockedByFaceGateFrames || 0,
    blockedByMouthGateFrames: stats?.blockedByMouthGateFrames || 0,
    speechLikeRatio: Number(((stats?.speechLikeFrames || 0) / frames).toFixed(3)),
    gatedSpeechRatio: Number(((stats?.gatedSpeechFrames || 0) / frames).toFixed(3)),
    avgRms: Number(((stats?.rmsSum || 0) / frames).toFixed(2)),
    maxRms: Number((stats?.maxRms || 0).toFixed(2)),
    avgZcr: Number(((stats?.zcrSum || 0) / frames).toFixed(4)),
  };
}

export default function VoiceUI({
  currentChat,
  onSend,
  onReceive,
  onReset,
  lang = "id",
  setLang,
  theme = "light",
}) {
  const [avatarState, setAvatarState] = useState("idle");
  const [micDenied, setMicDenied] = useState(false);
  const [activated, setActivated] = useState(false); // user harus tap dulu untuk unlock audio
  const [, setFaceDetected] = useState(false);
  const [isWaitingAI, setIsWaitingAI] = useState(false); // loading bubble saat menunggu AI
  const [latestSelaId, setLatestSelaId] = useState(null); // id pesan SELA terbaru → typewriter
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isPortraitChatOpen, setIsPortraitChatOpen] = useState(false);
  const [liveCaptionCharIndex, setLiveCaptionCharIndex] = useState(null);
  const [liveCaptionText, setLiveCaptionText] = useState("");
  const [liveCaptionWordInterval, setLiveCaptionWordInterval] = useState(null);
  const [speechTimeline, setSpeechTimeline] = useState(null);
  const [speechCharIndex, setSpeechCharIndex] = useState(null);
  const [activeViseme, setActiveViseme] = useState(getDefaultViseme());
  const [activeScreen, setActiveScreen] = useState(null);
  const [ttsEndSignal, setTtsEndSignal] = useState(0);
  const [lastTurnDebug, setLastTurnDebug] = useState(null);

  const ttsEndSignalRef = useRef(0);

  const messagesEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const liveCaptionBoundaryTimersRef = useRef(new Set());
  const speechFrameRef = useRef(null);
  const speechStartedAtRef = useRef(null);
  const speechSessionIdRef = useRef(0);
  const screenHoldTimerRef = useRef(null);

  // Refs — tidak pernah stale di dalam callback/closure
  const isListeningRef = useRef(false); // mic sedang merekam
  const isProcessingRef = useRef(false); // sedang transcribe / chat / TTS
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const recorderRef = useRef(null);
  const aiRequestSeqRef = useRef(0);
  const vadFrameRef = useRef(null);
  const silenceStartRef = useRef(null);
  const hasSpeechRef = useRef(false);
  const manualStopRef = useRef(false);
  const recordingStartedAtRef = useRef(null);
  const speechStartRef = useRef(null);
  const firstSpeechDetectedAtRef = useRef(null);
  const baselineStartedAtRef = useRef(null);
  const vadStatsRef = useRef(createVadStats());
  const latestVadSummaryRef = useRef(null);
  const dynamicThresholdRef = useRef(10); // fallback fallback jika baseline gagal
  const suppressRecorderOnStopRef = useRef(false);
  const lastInteractionTimeRef = useRef(Date.now());
  const sessionEndingRef = useRef(false);
  const currentChatRef = useRef(currentChat);
  const langRef = useRef(lang);
  const sessionMemoryRef = useRef(loadSessionMemory());
  const lastSelaSpokenTextRef = useRef("");

  // Face detection refs
  const audioUnlockedRef = useRef(false); // true setelah tap pertama, tidak pernah reset
  const activatedRef = useRef(false); // sync dengan activated state
  const videoRef = useRef(null);
  const videoStreamRef = useRef(null);
  const faceDetectorRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const faceFrameRef = useRef(null);
  const lastFaceTimeRef = useRef(0);
  const lastDetectRef = useRef(0); // throttle detection ke ~500ms
  const properFaceTimeRef = useRef(null); // timestamp ketika wajah mulai menghadap dengan benar
  const mouthTrackingAvailableRef = useRef(false);
  const lastMouthOpenRatioRef = useRef(null);
  const lastMouthActivityTimeRef = useRef(0);
  const mouthActiveDuringSpeechRef = useRef(false);
  const PROPER_FACE_CONFIRMATION_MS = 1000; // 1 detik sebelum auto-activate
  const MIN_FACE_SIZE_RATIO = 0.2; // minimum 20% dari video width (~1m distance untuk kiosk)

  const persistMemory = (memory) => {
    sessionMemoryRef.current = memory;
    if (memory) saveSessionMemory(memory);
  };

  const startMemorySession = (greetingText) => {
    const memory = createSessionMemory({
      lang: "id",
      greetingText,
    });
    persistMemory(memory);
    updateLastTurnDebug({
      memorySessionId: memory.sessionId,
      memoryTurns: memory.turns.length,
    });
    return memory;
  };

  const rememberTurn = (turn) => {
    const existing =
      sessionMemoryRef.current ||
      createSessionMemory({
        lang: "id",
      });
    const nextMemory = appendSessionTurn(existing, turn);
    persistMemory(nextMemory);
    updateLastTurnDebug({
      memorySessionId: nextMemory.sessionId,
      memoryTurns: nextMemory.turns.length,
    });
    return nextMemory;
  };

  const clearMemorySession = (endReason = "session_end") => {
    if (sessionMemoryRef.current) {
      sessionMemoryRef.current = finalizeSessionMemory(sessionMemoryRef.current, {
        endReason,
      });
    }
    sessionMemoryRef.current = null;
    clearSessionMemory();
    updateLastTurnDebug({
      memorySessionId: null,
      memoryTurns: 0,
    });
  };

  // Sinkronkan refs dengan state
  useEffect(() => {
    activatedRef.current = activated;
  }, [activated]);
  useEffect(() => {
    if (lang !== "id" && setLang) setLang("id");
  }, [lang, setLang]);
  useEffect(() => {
    currentChatRef.current = currentChat;
  }, [currentChat]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    if (!activated) setIsPortraitChatOpen(false);
  }, [activated]);

  // Kiosk mode — jika URL mengandung ?kiosk=1, langsung unlock audio tanpa tap
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("kiosk") === "1") {
      audioUnlockedRef.current = true;
      console.log(
        "[SELA] Kiosk mode aktif — audio auto-unlocked, menunggu wajah...",
      );
    }
  }, []);

  // Unlock audio global saat user tap/klik pertama kali
  useEffect(() => {
    const unlockAudio = () => {
      if (!audioUnlockedRef.current) {
        audioUnlockedRef.current = true;
        // Pancing speechSynthesis agar browser memberikan izin di sesi ini
        if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance("");
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
        console.log("[SELA] Audio unlocked via user interaction");
      }
      // Hapus listener setelah unlock sukses
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };

    window.addEventListener("click", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);

    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  // Re-attach camera stream ke hidden video setiap kali elemennya remount.
  useEffect(() => {
    if (videoRef.current && videoStreamRef.current) {
      videoRef.current.srcObject = videoStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [activated]);

  // Auto scroll — hanya kalau user sudah di bawah
  useEffect(() => {
    if (isAtBottom)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentChat?.messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChatScroll = (e) => {
    const el = e.currentTarget;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  };

  const clearLiveCaptionBoundaryTimers = () => {
    liveCaptionBoundaryTimersRef.current.forEach((timer) =>
      clearTimeout(timer),
    );
    liveCaptionBoundaryTimersRef.current.clear();
  };

  const clearScreenHoldTimer = () => {
    if (screenHoldTimerRef.current) {
      clearTimeout(screenHoldTimerRef.current);
      screenHoldTimerRef.current = null;
    }
  };

  const stopSpeechTimeline = useCallback(() => {
    cancelAnimationFrame(speechFrameRef.current);
    speechFrameRef.current = null;
    speechStartedAtRef.current = null;
    setActiveViseme(getDefaultViseme());
  }, []);

  const cancelActiveSpeech = useCallback(() => {
    speechSessionIdRef.current++;
    clearLiveCaptionBoundaryTimers();
    clearScreenHoldTimer();
    setActiveScreen(null);
    stopSpeechTimeline();
  }, [stopSpeechTimeline]);

  useEffect(() => {
    return () => {
      clearLiveCaptionBoundaryTimers();
      clearScreenHoldTimer();
      stopSpeechTimeline();
    };
  }, [stopSpeechTimeline]);

  const speakWithAvatar = (text, speechLang = lang, onDone = null) => {
    const speechSessionId = ++speechSessionIdRef.current;
    if (String(text || "").trim()) {
      lastSelaSpokenTextRef.current = String(text || "").trim();
    }
    clearLiveCaptionBoundaryTimers();
    stopSpeechTimeline();
    const timeline = buildSpeechTimeline(text, speechLang);
    setLiveCaptionText(text);
    setLiveCaptionCharIndex(0);
    setSpeechCharIndex(0);
    setSpeechTimeline(timeline);

    const estimatedDuration = timeline.durationMs || text.length * 70;
    const wordCount = timeline.words?.length || 0;
    const wordIntervalMs =
      wordCount > 0 ? Math.round(estimatedDuration / wordCount) : null;
    setLiveCaptionWordInterval(wordIntervalMs);

    const startTimelineLoop = () => {
      speechStartedAtRef.current = Date.now();

      const tick = () => {
        if (!speechStartedAtRef.current) return;
        const elapsed = Date.now() - speechStartedAtRef.current;
        const frame = getSpeechFrame(timeline, elapsed);
        setLiveCaptionCharIndex(frame.charIndex);
        setSpeechCharIndex(frame.charIndex);
        setActiveViseme(frame.viseme);

        if (!frame.complete) {
          speechFrameRef.current = requestAnimationFrame(tick);
        }
      };

      speechFrameRef.current = requestAnimationFrame(tick);
    };

    const finishSpeech = () => {
      if (speechSessionId !== speechSessionIdRef.current) return;
      clearLiveCaptionBoundaryTimers();
      stopSpeechTimeline();
      setLiveCaptionCharIndex(null);
      setSpeechCharIndex(text.length);
      setLiveCaptionText("");
      setAvatarState("idle");
      // Signal TTS completion to ChatBubble for typewriter auto-complete
      const now = Date.now();
      ttsEndSignalRef.current = now;
      setTtsEndSignal(now);
      if (onDone) onDone();
    };

    speakText(
      text,
      () => {
        if (speechSessionId !== speechSessionIdRef.current) return;
        clearLiveCaptionBoundaryTimers();
        setLiveCaptionText(text);
        setLiveCaptionCharIndex(0);
        setSpeechCharIndex(0);
        setAvatarState("speaking");
        startTimelineLoop();
      },
      () => {
        if (speechSessionId !== speechSessionIdRef.current) return;
        const elapsed = speechStartedAtRef.current
          ? Date.now() - speechStartedAtRef.current
          : 0;
        const minSpeechMs = Math.max(900, estimatedDuration * 0.78);
        const remainingMs = Math.max(0, minSpeechMs - elapsed);

        if (remainingMs > 80) {
          console.warn("[SELA TTS] Early end guarded", {
            text: text.slice(0, 60),
            elapsed,
            minSpeechMs: Math.round(minSpeechMs),
            delayMs: Math.round(remainingMs),
          });
          setTimeout(finishSpeech, remainingMs);
          return;
        }

        finishSpeech();
      },
      speechLang,
      (charIndex) => {
        if (charIndex <= 0) {
          setLiveCaptionCharIndex(0);
          setSpeechCharIndex(0);
          return;
        }

        const timer = setTimeout(() => {
          liveCaptionBoundaryTimersRef.current.delete(timer);
          setLiveCaptionCharIndex(charIndex);
          setSpeechCharIndex(charIndex);
        }, LIVE_CAPTION_BOUNDARY_DELAY_MS);

        liveCaptionBoundaryTimersRef.current.add(timer);
      },
    );
  };

  const speakSequenceWithAvatar = (segments = [], onComplete = null) => {
    const queue = segments.filter((segment) => segment?.text);

    const playNext = (index) => {
      if (index >= queue.length) {
        if (onComplete) onComplete();
        return;
      }

      const segment = queue[index];
      speakWithAvatar(segment.text, segment.lang || lang, () => {
        playNext(index + 1);
      });
    };

    playNext(0);
  };

  const splitSpeechTextForTts = (text = "", speechLang = lang) => {
    const normalized = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return [];

    const maxChars = speechLang === "en" ? 170 : 150;
    const minChars = speechLang === "en" ? 24 : 20;
    const sentences = normalized
      .split(/(?<=[.!?])\s+|(?<=:)\s+|(?<=;)\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const chunks = [];

    for (const sentence of sentences.length ? sentences : [normalized]) {
      if (sentence.length <= maxChars) {
        chunks.push(sentence);
        continue;
      }

      let current = "";
      const parts = sentence
        .split(/(?<=,)\s+|\s+(?=\d+\.)/)
        .map((part) => part.trim())
        .filter(Boolean);

      for (const part of parts.length ? parts : [sentence]) {
        if (!current) {
          current = part;
          continue;
        }
        if (`${current} ${part}`.length <= maxChars) {
          current = `${current} ${part}`;
        } else {
          chunks.push(current);
          current = part;
        }
      }
      if (current) chunks.push(current);
    }

    const mergedChunks = [];
    for (const chunk of chunks.map((item) => item.trim()).filter(Boolean)) {
      const previous = mergedChunks[mergedChunks.length - 1];
      if (!previous) {
        mergedChunks.push(chunk);
        continue;
      }

      if (
        chunk.length < minChars ||
        previous.length < minChars ||
        /^[,;:)]/.test(chunk)
      ) {
        const combined = `${previous} ${chunk}`.trim();
        if (combined.length <= maxChars + 35) {
          mergedChunks[mergedChunks.length - 1] = combined;
          continue;
        }
      }

      mergedChunks.push(chunk);
    }

    return mergedChunks.map((chunk) => ({ text: chunk, lang: speechLang }));
  };

  const speakResponseWithAvatar = (text, speechLang = lang, onDone = null) => {
    const chunks = splitSpeechTextForTts(text, speechLang);
    console.log("[SELA TTS] response queue", {
      chunks: chunks.length,
      chars: String(text || "").length,
      texts: chunks.map((chunk) => chunk.text),
    });
    if (chunks.length <= 1) {
      speakWithAvatar(text, speechLang, onDone);
      return;
    }

    speakSequenceWithAvatar(chunks, onDone);
  };

  const updateLastTurnDebug = (patch) => {
    setLastTurnDebug((previous) => ({
      ...(previous || {}),
      ...patch,
      updatedAt: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    }));
  };

  const markSessionInteraction = () => {
    lastInteractionTimeRef.current = Date.now();
  };

  const endSessionRef = useRef(null);
  endSessionRef.current = (endReason = "session_end") => {
    if (sessionEndingRef.current) return;
    sessionEndingRef.current = true;
    suppressRecorderOnStopRef.current = true;
    stopListening();
    cancelActiveSpeech();
    window.speechSynthesis?.cancel();

    const chatSnapshot = currentChatRef.current;
    if (chatSnapshot?.messages?.length) {
      archiveConversationSession({
        currentChat: chatSnapshot,
        lang: langRef.current,
        endedByFarewell: false,
        endReason,
      });
    }

    isProcessingRef.current = false;
    activatedRef.current = false;
    setActivated(false);
    setAvatarState("idle");
    setSpeechTimeline(null);
    setSpeechCharIndex(null);
    setActiveScreen(null);
    setFaceDetected(false);
    properFaceTimeRef.current = null;
    lastFaceTimeRef.current = 0;
    clearMemorySession(endReason);
    if (onReset) onReset();

    setTimeout(() => {
      sessionEndingRef.current = false;
      suppressRecorderOnStopRef.current = false;
      setIsPortraitChatOpen(false);
      markSessionInteraction();
    }, 250);
  };

  // Track ID pesan SELA terbaru → untuk typewriter effect
  useEffect(() => {
    const msgs = currentChat?.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (last && last.role === "assistant") {
      setLatestSelaId(last.id);
    }
  }, [currentChat?.messages?.length]);

  // ── autoActivate ref (untuk dibaca dari closure detection loop) ─
  const autoActivateRef = useRef(null);
  autoActivateRef.current = () => {
    if (activatedRef.current || isProcessingRef.current) return;
    activatedRef.current = true;
    isProcessingRef.current = true;
    markSessionInteraction();
    setActivated(true);
    if (setLang) setLang("id");
    const greetingText = getTimeBasedGreeting("id");
    startMemorySession(greetingText);

    speakWithAvatar(greetingText, "id", () => {
      isProcessingRef.current = false;
      setAvatarState("idle");
    });
  };

  const updateMouthActivityFromLandmarks = (landmarks, now) => {
    if (!landmarks?.length) return;
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];
    if (!upperLip || !lowerLip || !leftMouth || !rightMouth) return;

    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
    const mouthWidth = Math.max(0.001, Math.abs(rightMouth.x - leftMouth.x));
    const openRatio = mouthHeight / mouthWidth;
    const previousRatio = lastMouthOpenRatioRef.current;
    const ratioDelta =
      previousRatio == null ? 0 : Math.abs(openRatio - previousRatio);

    if (openRatio > 0.08 || ratioDelta > 0.018) {
      lastMouthActivityTimeRef.current = now;
      if (isListeningRef.current) mouthActiveDuringSpeechRef.current = true;
    }

    lastMouthOpenRatioRef.current = openRatio;
  };

  const hasActiveUserSpeechGate = (now = Date.now()) => {
    const hasRecentFace = now - lastFaceTimeRef.current <= FACE_GATE_WINDOW_MS;
    const hasRecentMouth =
      !mouthTrackingAvailableRef.current ||
      now - lastMouthActivityTimeRef.current <= MOUTH_ACTIVITY_WINDOW_MS;

    return {
      allowed: hasRecentFace && hasRecentMouth,
      hasRecentFace,
      hasRecentMouth,
      mouthTrackingAvailable: mouthTrackingAvailableRef.current,
      mouthOpenRatio: lastMouthOpenRatioRef.current,
    };
  };

  // ── Face detection (kamera) ───────────────────────────────────
  useEffect(() => {
    let destroyed = false;

    const startCamera = async () => {
      try {
        console.log("[SELA Cam] Requesting camera access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (destroyed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoStreamRef.current = stream;
        console.log("[SELA Cam] Camera stream acquired successfully");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        console.error("[SELA Cam] Camera error:", e.name, e.message);
        if (e.name === "NotAllowedError") {
          console.error(
            "[SELA Cam] ❌ Permission denied — user blocked camera access",
          );
          console.error(
            "[SELA Cam] Fix: Go to System Preferences > Security & Privacy > Camera > Enable Google Chrome",
          );
        } else if (e.name === "NotFoundError") {
          console.error("[SELA Cam] ❌ No camera device found");
        } else {
          console.error("[SELA Cam] ❌ Unknown camera error");
        }
        // Retry after 3s
        setTimeout(() => startCamera(), 3000);
      }
    };

    const initDetector = async () => {
      try {
        const { FaceDetector, FaceLandmarker, FilesetResolver } =
          await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
        );
        if (destroyed) return;
        try {
          faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
                delegate: "GPU",
              },
              runningMode: "VIDEO",
              numFaces: 1,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            },
          );
          mouthTrackingAvailableRef.current = true;
          console.log("[SELA Cam] FaceLandmarker aktif — mouth gate enabled");
        } catch (landmarkerError) {
          mouthTrackingAvailableRef.current = false;
          console.warn(
            "[SELA Cam] FaceLandmarker gagal, fallback ke FaceDetector:",
            landmarkerError?.message,
          );
          faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
          });
        }
        startDetectionLoop();
      } catch (e) {
        console.warn("[SELA Cam] Face detector gagal load:", e.message);
      }
    };

    const startDetectionLoop = () => {
      const loop = () => {
        faceFrameRef.current = requestAnimationFrame(loop);
        if (
          (!faceDetectorRef.current && !faceLandmarkerRef.current) ||
          !videoRef.current ||
          videoRef.current.readyState < 2
        )
          return;

        // Throttle lebih cepat saat listening agar mouth gate tidak telat.
        const now = Date.now();
        const detectInterval = isListeningRef.current ? 120 : 500;
        if (now - lastDetectRef.current < detectInterval) return;
        lastDetectRef.current = now;

        try {
          const vidW = videoRef.current.videoWidth || 640;
          let detections = [];
          let hasFace = false;
          let facingCamera = false;

          if (faceLandmarkerRef.current) {
            const result = faceLandmarkerRef.current.detectForVideo(
              videoRef.current,
              now,
            );
            const faceLandmarks = result.faceLandmarks?.[0] || null;
            hasFace = Boolean(faceLandmarks?.length);

            if (faceLandmarks) {
              const xs = faceLandmarks.map((point) => point.x);
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs);
              const faceWidthRatio = maxX - minX;
              const eyeLeft = faceLandmarks[33];
              const eyeRight = faceLandmarks[263];
              const nose = faceLandmarks[1];
              const eyeDist = Math.abs((eyeRight?.x || 0) - (eyeLeft?.x || 0));
              const midEyeX = ((eyeLeft?.x || 0) + (eyeRight?.x || 0)) / 2;
              const eyeHeightDiff = Math.abs(
                (eyeLeft?.y || 0) - (eyeRight?.y || 0),
              );
              const centeredNose =
                eyeDist > 0 &&
                Math.abs((nose?.x || 0) - midEyeX) / eyeDist <= 0.35;
              facingCamera =
                faceWidthRatio >= MIN_FACE_SIZE_RATIO &&
                centeredNose &&
                eyeHeightDiff <= eyeDist * 0.22;
              updateMouthActivityFromLandmarks(faceLandmarks, now);
            }
          } else {
            const result = faceDetectorRef.current.detectForVideo(
              videoRef.current,
              now,
            );
            detections = result.detections || [];
            hasFace = detections.length > 0;
          }

          // Cek apakah wajah menghadap kamera (bukan miring/membelakangi)
          // PENTING: keypoints pakai koordinat normalized (0-1),
          //          box.width/height pakai piksel → harus dinormalisasi dulu
          if (!faceLandmarkerRef.current) {
            facingCamera = detections.some((det) => {
            const kps = det.keypoints;
            const box = det.boundingBox;
            if (!kps || kps.length < 3 || !box) return false;
            const eye0 = kps[0],
              eye1 = kps[1],
              nose = kps[2];
            const eyeDist = Math.abs(eye0.x - eye1.x); // normalized
            const boxWidthNorm = box.width / vidW; // piksel → normalized

            // ✅ DISTANCE CHECK: Wajah harus cukup besar (user harus cukup dekat)
            // 20% = sekitar 1 meter dari kiosk (ideal interaction distance)
            if (boxWidthNorm < MIN_FACE_SIZE_RATIO) {
              console.log(
                `[SELA Cam] Wajah terlalu jauh (${(boxWidthNorm * 100).toFixed(1)}% - min ${(MIN_FACE_SIZE_RATIO * 100).toFixed(1)}%)`,
              );
              return false;
            }

            // ✅ STRICTER CHECKS:
            // Jarak mata harus > 30% lebar wajah (lebih ketat dari 25%)
            if (boxWidthNorm > 0 && eyeDist / boxWidthNorm < 0.3) return false;

            // Hidung harus di tengah antara 2 mata (toleransi ±25%, lebih ketat dari 35%)
            const midEyeX = (eye0.x + eye1.x) / 2;
            if (eyeDist > 0 && Math.abs(nose.x - midEyeX) / eyeDist > 0.25)
              return false;

            // Tambahan: cek eye vertical alignment (mata seharusnya pada height yang sama)
            const eyeHeightDiff = Math.abs(eye0.y - eye1.y);
            if (eyeHeightDiff > eyeDist * 0.2) return false; // mata beda tinggi > 20% eye distance = tilt

            return true;
          });
          }

          if (hasFace && facingCamera) {
            lastFaceTimeRef.current = now;

            // Start/continue confirmation timer
            if (properFaceTimeRef.current === null) {
              properFaceTimeRef.current = now;
              console.log(
                "[SELA Cam] ✓ Wajah menghadap kamera — tunggu 2 detik...",
              );
              setFaceDetected(true);
            } else {
              const confirmedDuration = now - properFaceTimeRef.current;

              // Trigger auto-activate hanya setelah 2 detik
              if (
                confirmedDuration >= PROPER_FACE_CONFIRMATION_MS &&
                audioUnlockedRef.current &&
                !activatedRef.current &&
                !isProcessingRef.current &&
                !sessionEndingRef.current
              ) {
                console.log(
                  "[SELA Cam] ✅ Auto-activate! (face confirmed for",
                  confirmedDuration,
                  "ms)",
                );
                properFaceTimeRef.current = null; // reset
                autoActivateRef.current();
              }
            }
          } else {
            // Wajah ada tapi miring, atau tidak ada wajah
            properFaceTimeRef.current = null; // reset confirmation timer

            if (
              activatedRef.current &&
              !sessionEndingRef.current &&
              !isProcessingRef.current &&
              !isListeningRef.current &&
              lastFaceTimeRef.current > 0 &&
              !hasFace &&
              now - lastFaceTimeRef.current > FACE_LOST_END_MS
            ) {
              console.log(
                "[SELA Cam] Sesi diakhiri karena wajah hilang terlalu lama",
              );
              endSessionRef.current?.("face_lost");
            } else if (!hasFace && now - lastFaceTimeRef.current > 3000) {
              setFaceDetected((prev) => {
                if (prev) console.log("[SELA Cam] Wajah hilang");
                return false;
              });
            } else if (hasFace && !facingCamera) {
              // Wajah ada tapi tidak menghadap — reset timer supaya tidak auto-greet
              lastFaceTimeRef.current = 0;
              setFaceDetected((prev) => {
                if (prev) console.log("[SELA Cam] Wajah miring, skip");
                return false;
              });
            }
          }
        } catch (_) {
          /* frame skip */
        }
      };
      faceFrameRef.current = requestAnimationFrame(loop);
    };

    startCamera();
    initDetector();

    return () => {
      destroyed = true;
      cancelAnimationFrame(faceFrameRef.current);
      videoStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
    };
  }, []);

  // ── Stop & cleanup ────────────────────────────────────────────
  const stopListening = () => {
    isListeningRef.current = false;
    cancelAnimationFrame(vadFrameRef.current);
    if (recorderRef.current?.state !== "inactive") {
      recorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    silenceStartRef.current = null;
    hasSpeechRef.current = false;
    manualStopRef.current = false;
    recordingStartedAtRef.current = null;
    speechStartRef.current = null;
    firstSpeechDetectedAtRef.current = null;
    baselineStartedAtRef.current = null;
    vadStatsRef.current = createVadStats();
    mouthActiveDuringSpeechRef.current = false;
  };

  // ── Start auto-listen ─────────────────────────────────────────
  // Pakai fungsi biasa (bukan useCallback) yang disimpan di ref,
  // supaya pemanggil di dalam closure selalu dapat versi terbaru.
  const startListeningRef = useRef(null);
  startListeningRef.current = async () => {
    // Cek via ref — tidak pernah stale
    if (isListeningRef.current || isProcessingRef.current) return;

    try {
      // ── Aggressive audio constraints untuk noisy environments ──
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: false },
          channelCount: { ideal: 1 }, // Mono untuk lebih fokus
          sampleRate: { ideal: 16000 }, // Optimal untuk speech recognition
          sampleSize: { ideal: 16 },
          latency: { ideal: 0.05 },
        },
      });
      streamRef.current = stream;
      setMicDenied(false);
      isListeningRef.current = true;
      recordingStartedAtRef.current = Date.now();
      vadStatsRef.current = createVadStats();
      latestVadSummaryRef.current = null;
      mouthActiveDuringSpeechRef.current = false;

      // AudioContext + Analyser untuk VAD
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      const pcmChunks = [];
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (!isListeningRef.current) return;
        pcmChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      // MediaRecorder
      const recorderMimeType = getSupportedRecorderMimeType();
      const recorder = recorderMimeType
        ? new MediaRecorder(stream, { mimeType: recorderMimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      let chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const recordingEndedAt = Date.now();
        const recordingStartedAt = recordingStartedAtRef.current;
        const detectedSpeechStartedAt = speechStartRef.current;
        processor.disconnect();
        silentGain.disconnect();
        if (suppressRecorderOnStopRef.current) {
          chunks = [];
          stopListening();
          suppressRecorderOnStopRef.current = false;
          return;
        }
        const speechDuration = speechStartRef.current
          ? Date.now() - speechStartRef.current
          : 0;
        const mouthActiveDuringSpeech = mouthActiveDuringSpeechRef.current;
        const vadSummary = {
          ...summarizeVadStats(vadStatsRef.current),
          mouthTrackingAvailable: mouthTrackingAvailableRef.current,
          mouthActiveDuringSpeech,
        };
        latestVadSummaryRef.current = vadSummary;
        const trimmedPcmChunks =
          pcmChunks.length > 0
            ? trimPcmChunksForSpeech(pcmChunks, audioCtx.sampleRate, {
                recordingStartedAt,
                speechStartedAt: detectedSpeechStartedAt,
                recordingEndedAt,
              })
            : [];
        const originalPcmSamples = pcmChunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        const encodedPcmSamples = trimmedPcmChunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        const audioBlob =
          pcmChunks.length > 0
            ? encodeWavBlob(trimmedPcmChunks, audioCtx.sampleRate)
            : new Blob(chunks, {
                type: recorder.mimeType || recorderMimeType || "audio/webm",
              });
        const hadSpeech = hasSpeechRef.current;
        console.log(
          "[SELA] recorder.onstop | hadSpeech:",
          hadSpeech,
          "| speechDuration:",
          speechDuration,
          "ms | firstSpeechDelay:",
          firstSpeechDetectedAtRef.current && baselineStartedAtRef.current
            ? firstSpeechDetectedAtRef.current - baselineStartedAtRef.current
            : null,
          "ms | blobSize:",
          audioBlob.size,
          "| audio:",
          {
            sampleRate: audioCtx.sampleRate,
            originalSamples: originalPcmSamples,
            encodedSamples: encodedPcmSamples,
            trimmed:
              encodedPcmSamples > 0 && encodedPcmSamples < originalPcmSamples,
            recordingMs:
              recordingStartedAt && recordingEndedAt
                ? recordingEndedAt - recordingStartedAt
                : null,
          },
          "| vad:",
          vadSummary,
        );
        const isManualStop = manualStopRef.current;
        stopListening();

        // Apakah VAD audio sudah mengonfirmasi ada ucapan nyata?
        const vadConfirmedSpeech = hadSpeech && speechDuration >= MIN_SPEECH_MS;

        if (
          (!isManualStop && !hadSpeech) ||
          (!isManualStop && speechDuration < MIN_SPEECH_MS) ||
          audioBlob.size < MIN_BLOB_SIZE || // Ukuran file tetap dicek agar tidak memproses data kosong
          (!isManualStop && !vadConfirmedSpeech && vadSummary.speechLikeRatio < MIN_SPEECHLIKE_RATIO) ||
          (!isManualStop && !vadConfirmedSpeech && vadSummary.gatedSpeechFrames < MIN_GATED_SPEECH_FRAMES) ||
          (!isManualStop && !vadConfirmedSpeech && vadSummary.mouthTrackingAvailable && !mouthActiveDuringSpeech)
        ) {
          console.log("[SELA] Skip — noise/pendek/kecil:", {
            hadSpeech,
            speechDuration,
            blobSize: audioBlob.size,
            vadSummary,
            mouthActiveDuringSpeech,
          });
          setAvatarState("idle");
          return;
        }

        // Ada suara valid → proses
        console.log("[SELA] Ada suara valid, mulai processing...", { isManualStop });
        processAudioRef.current(audioBlob, isManualStop);
      };

      recorder.start(100);
      setAvatarState("listening");
      baselineStartedAtRef.current = Date.now();

      // Failsafe: force stop setelah MAX_RECORD_MS
      const maxTimer = setTimeout(() => {
        if (recorderRef.current?.state !== "inactive")
          recorderRef.current.stop();
      }, MAX_RECORD_MS);

      // ── Baseline sampling phase (500ms) ────────────────────
      const data = new Uint8Array(analyser.fftSize);
      let baselineRmsValues = [];

      const baselineCheck = () => {
        if (!isListeningRef.current) return;

        analyser.getByteTimeDomainData(data);
        const features = getFrameAudioFeatures(data);
        const rms = features.rms;
        baselineRmsValues.push(rms);
        const avgSoFar =
          baselineRmsValues.reduce((a, b) => a + b, 0) /
          baselineRmsValues.length;
        const provisionalThreshold = Math.max(
          MIN_RMS_FOR_VALID_SPEECH,
          avgSoFar * EARLY_SPEECH_THRESHOLD_MULTIPLIER,
        );

        const gate = hasActiveUserSpeechGate();
        const speechLike = isSpeechLikeFrame(features, provisionalThreshold);

        if (speechLike && gate.allowed && !hasSpeechRef.current) {
          hasSpeechRef.current = true;
          speechStartRef.current = Date.now();
          firstSpeechDetectedAtRef.current = speechStartRef.current;
          dynamicThresholdRef.current = Math.max(
            MIN_RMS_FOR_VALID_SPEECH,
            avgSoFar * THRESHOLD_MULTIPLIER,
          );
          console.log("[SELA VAD] Early speech detected during baseline", {
            rms: Number(rms.toFixed(2)),
            zcr: Number(features.zcr.toFixed(4)),
            provisionalThreshold: Number(provisionalThreshold.toFixed(2)),
            threshold: Number(dynamicThresholdRef.current.toFixed(2)),
            gate,
          });
          startActualVAD();
          return;
        }

        if (Date.now() - baselineStartedAtRef.current < BASELINE_SAMPLE_MS) {
          vadFrameRef.current = requestAnimationFrame(baselineCheck);
        } else {
          const avgBaseline =
            baselineRmsValues.reduce((a, b) => a + b, 0) /
            baselineRmsValues.length;

          // Calculate baseline variance — stable/low variance = noise floor
          const variance =
            baselineRmsValues.reduce(
              (sq, x) => sq + (x - avgBaseline) * (x - avgBaseline),
              0,
            ) / baselineRmsValues.length;

          dynamicThresholdRef.current = Math.max(
            MIN_RMS_FOR_VALID_SPEECH,
            avgBaseline * THRESHOLD_MULTIPLIER,
          );
          console.log(
            "[SELA VAD] Baseline:",
            avgBaseline.toFixed(2),
            "| Variance:",
            variance.toFixed(2),
            "→ Dynamic Threshold:",
            dynamicThresholdRef.current.toFixed(2),
          );
          startActualVAD();
        }
      };

      // Start baseline sampling
      vadFrameRef.current = requestAnimationFrame(baselineCheck);

      // ── Actual VAD loop ────────────────────────────────────
      const startActualVAD = () => {
        let logThrottle = 0;
        const checkSilence = () => {
          if (!isListeningRef.current) {
            clearTimeout(maxTimer);
            return;
          }
          analyser.getByteTimeDomainData(data);
          const features = getFrameAudioFeatures(data);
          const rms = features.rms;
          const gate = hasActiveUserSpeechGate();
          const speechLike = isSpeechLikeFrame(
            features,
            dynamicThresholdRef.current,
          );
          const stats = vadStatsRef.current;
          stats.frames += 1;
          stats.rmsSum += rms;
          stats.zcrSum += features.zcr;
          stats.maxRms = Math.max(stats.maxRms, rms);
          if (rms > dynamicThresholdRef.current) stats.loudFrames += 1;
          if (speechLike) stats.speechLikeFrames += 1;
          if (speechLike && gate.allowed) stats.gatedSpeechFrames += 1;
          if (speechLike && !gate.hasRecentFace)
            stats.blockedByFaceGateFrames += 1;
          if (speechLike && gate.hasRecentFace && !gate.hasRecentMouth)
            stats.blockedByMouthGateFrames += 1;

          // Log RMS setiap ~500ms supaya bisa debug threshold
          logThrottle++;
          if (logThrottle % 30 === 0)
            console.log(
              "[SELA VAD] RMS:",
              rms.toFixed(2),
              "| zcr:",
              features.zcr.toFixed(4),
              "| threshold:",
              dynamicThresholdRef.current.toFixed(2),
              "| gate:",
              gate.allowed ? "ok" : "blocked",
              "| hasSpeech:",
              hasSpeechRef.current,
            );

          if (speechLike && gate.allowed) {
            if (!hasSpeechRef.current) {
              hasSpeechRef.current = true;
              speechStartRef.current = Date.now();
              firstSpeechDetectedAtRef.current = speechStartRef.current;
              console.log("[SELA VAD] Speech detected!", {
                rms: Number(rms.toFixed(2)),
                zcr: Number(features.zcr.toFixed(4)),
                gate,
              });
            }
            silenceStartRef.current = null;
          } else if (hasSpeechRef.current) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = Date.now();
              console.log("[SELA VAD] Silence window started");
            } else if (
              Date.now() - silenceStartRef.current >
              (speechStartRef.current &&
              Date.now() - speechStartRef.current >= QUICK_COMMIT_MIN_SPEECH_MS
                ? QUICK_COMMIT_SILENCE_MS
                : SILENCE_DURATION)
            ) {
              // Diam cukup lama → stop otomatis
              console.log("[SELA VAD] Auto-stop commit", {
                speechMs: speechStartRef.current
                  ? Date.now() - speechStartRef.current
                  : 0,
                silenceMs: Date.now() - silenceStartRef.current,
              });
              clearTimeout(maxTimer);
              if (recorderRef.current?.state !== "inactive") {
                recorderRef.current.stop();
              }
              return;
            }
          }
          vadFrameRef.current = requestAnimationFrame(checkSilence);
        };
        vadFrameRef.current = requestAnimationFrame(checkSilence);
      };
    } catch (err) {
      console.error("Mic error:", err);
      setMicDenied(true);
      setAvatarState("idle");
      isListeningRef.current = false;
    }
  };

  // ── Process audio → transcribe → AI → TTS ────────────────────
  // Juga disimpan di ref supaya startListening bisa memanggilnya
  const processAudioRef = useRef(null);
  processAudioRef.current = async (audioBlob, isManualStop = false) => {
    const turnStartedAt = Date.now();
    const turnId = `turn_${turnStartedAt.toString(36)}`;
    const turnMetrics = {
      turnId,
      audioBytes: audioBlob?.size || 0,
      lang,
      sttMs: null,
      aiMs: null,
      ttsChunks: 0,
      spokenChars: 0,
    };
    updateLastTurnDebug({
      ...turnMetrics,
      stage: "recorded",
      avatarState: "thinking",
    });
    isProcessingRef.current = true;
    setAvatarState("thinking");
    try {
      const sttStartedAt = Date.now();
      const vadSummary = latestVadSummaryRef.current || {};
      const rawText = await transcribeAudio(audioBlob, lang, {
        vad: vadSummary,
        manualStop: isManualStop,
        lastSelaSpeech: lastSelaSpokenTextRef.current,
        faceGate: {
          lastFaceMsAgo: lastFaceTimeRef.current
            ? Date.now() - lastFaceTimeRef.current
            : null,
          mouthTrackingAvailable: mouthTrackingAvailableRef.current,
          lastMouthActivityMsAgo: lastMouthActivityTimeRef.current
            ? Date.now() - lastMouthActivityTimeRef.current
            : null,
          mouthOpenRatio: lastMouthOpenRatioRef.current,
        },
      });
      turnMetrics.sttMs = Date.now() - sttStartedAt;
      updateLastTurnDebug({
        ...turnMetrics,
        stage: "transcribed",
        rawTranscript: rawText,
        vad: vadSummary,
      });

      // Check if server filtered out background audio
      if (!rawText || rawText.trim().length === 0) {
        console.log("[SELA Turn] filtered transcription", {
          ...turnMetrics,
          totalMs: Date.now() - turnStartedAt,
          reason: "empty_or_server_filtered",
        });
        updateLastTurnDebug({
          ...turnMetrics,
          stage: "filtered",
          filterReason: "empty_or_server_filtered",
          totalMs: Date.now() - turnStartedAt,
        });
        isProcessingRef.current = false;
        setAvatarState("idle");
        return;
      }

      const preparedTranscript = prepareTranscriptForRag(rawText);
      const text = preparedTranscript.cleanedText;
      console.log("[SELA Voice] Transcript pipeline:", {
        rawText: preparedTranscript.rawText,
        cleanedText: preparedTranscript.cleanedText,
        marker: preparedTranscript.marker,
        removedSegments: preparedTranscript.removedSegments,
      });

      // 1. Filter Client-Side: Buang ucapan terlalu pendek/obrolan acak
      const words = text?.trim().split(/\s+/) || [];
      const isNoise =
        !text?.trim() ||
        text.trim().length < MIN_TRANSCRIPT_CHARS ||
        (words.length <= 2 &&
          text.length < 18 &&
          !looksLikeShortValidQuery(text));

      if (isNoise) {
        console.log("[SELA Turn] client filtered transcript", {
          ...turnMetrics,
          totalMs: Date.now() - turnStartedAt,
          transcript: text,
          reason: "short_or_noise",
        });
        updateLastTurnDebug({
          ...turnMetrics,
          stage: "filtered",
          filterReason: "short_or_noise",
          finalTranscript: text,
          totalMs: Date.now() - turnStartedAt,
        });
        isProcessingRef.current = false;
        setAvatarState("idle");
        return;
      }

      markSessionInteraction();
      if (isFarewell(text)) {
        handleFarewell(text);
        return;
      }

      const memoryAfterUser = rememberTurn({
        role: "user",
        type: "voice_question",
        text,
      });
      const directRecallResponse = buildDirectRecallResponse(
        memoryAfterUser,
        text,
      );
      onSend(text);
      if (directRecallResponse) {
        if (onReceive) onReceive(directRecallResponse);
        const memoryAfterRecall = rememberTurn({
          role: "sela",
          type: "memory_recall",
          text: directRecallResponse.text,
          spokenText:
            directRecallResponse.spokenText || directRecallResponse.text,
          screen: directRecallResponse.screen,
          intent: directRecallResponse.debug?.intent,
          counselorMode: directRecallResponse.debug?.counselorMode,
        });
        setActiveScreen(directRecallResponse.screen || null);
        updateLastTurnDebug({
          ...turnMetrics,
          stage: "memory_recall",
          finalTranscript: text,
          chatProvider: "session_memory",
          memorySessionId: memoryAfterRecall.sessionId,
          memoryTurns: memoryAfterRecall.turns.length,
        });
        const recallSpokenText =
          directRecallResponse.spokenText || directRecallResponse.text;
        speakResponseWithAvatar(recallSpokenText, "id", () => {
          isProcessingRef.current = false;
          setAvatarState("idle");
        });
        return;
      }

      setIsWaitingAI(true);
      const requestId = ++aiRequestSeqRef.current;

      const history = (currentChat?.messages || []).map((m) => ({
        role: m.role,
        content: m.text,
      }));
      history.push({ role: "user", content: text });
      const aiStartedAt = Date.now();
      setAvatarState("processing");
      const response = await getChatCompletion(
        history,
        lang,
        sessionMemoryRef.current,
      );
      turnMetrics.aiMs = Date.now() - aiStartedAt;
      if (requestId !== aiRequestSeqRef.current) return;
      setIsWaitingAI(false);
      console.log("[SELA Voice] Query final ke RAG:", {
        original: rawText,
        final: text,
        transcriptMarker: preparedTranscript.marker,
      });
      console.log("[SELA Voice] AI response payload", {
        displayChars: response.text?.length || 0,
        spokenChars: (response.spokenText || response.text || "").length,
        displayText: response.text,
        spokenText: response.spokenText || response.text,
        screen: response.screen,
        suggestions: response.suggestions,
      });
      updateLastTurnDebug({
        ...turnMetrics,
        stage: "answered",
        finalTranscript: text,
        displayChars: response.text?.length || 0,
        spokenChars: (response.spokenText || response.text || "").length,
        screenMode: response.screen?.mode || null,
        chatProvider: response.debug?.chatProvider || null,
        counselorMode: response.debug?.counselorMode || null,
        nextAction: response.debug?.nextAction || null,
        incompleteProviderAnswer:
          response.debug?.incompleteProviderAnswer || false,
      });

      // 2. Filter LLM-Side: SELA mendeteksi obrolan orang lewat
      if (response.text?.includes("[IGNORE_NOISE]")) {
        console.log(
          "[SELA] AI mendeteksi noise/obrolan acak, mengabaikan input.",
        );
        setAvatarState("confused");
        isProcessingRef.current = false;
        setTimeout(() => {
          setAvatarState("idle");
        }, 500);
        return;
      }

      if (onReceive) onReceive(response);
      rememberTurn({
        role: "sela",
        type: "answer",
        text: response.text,
        spokenText: response.spokenText || response.text,
        screen: response.screen,
        intent: response.debug?.intent,
        counselorMode: response.debug?.counselorMode,
      });
      setActiveScreen(response.screen || null);
      clearScreenHoldTimer();
      markSessionInteraction();

      // Fallback: kalau TTS onEnd tidak pernah terpanggil (bug Chrome),
      // paksa restart listen setelah estimasi durasi + buffer
      const spokenText = response.spokenText || response.text;
      const ttsChunks = splitSpeechTextForTts(
        spokenText,
        response.detectedLang || lang,
      );
      turnMetrics.ttsChunks = Math.max(1, ttsChunks.length);
      turnMetrics.spokenChars = spokenText.length;
      console.log("[SELA Turn] ready to speak", {
        ...turnMetrics,
        totalBeforeTtsMs: Date.now() - turnStartedAt,
        transcript: text,
        screenMode: response.screen?.mode || null,
      });
      updateLastTurnDebug({
        ...turnMetrics,
        stage: "speaking",
        finalTranscript: text,
        totalBeforeTtsMs: Date.now() - turnStartedAt,
        screenMode: response.screen?.mode || null,
        chatProvider: response.debug?.chatProvider || null,
        counselorMode: response.debug?.counselorMode || null,
      });
      const speechTimelineEstimate = buildSpeechTimeline(
        spokenText,
        response.detectedLang || lang,
      );
      const estDuration = Math.max(
        3000,
        speechTimelineEstimate.durationMs || spokenText.length * 75,
      );
      const ttsFallback = setTimeout(() => {
        if (isProcessingRef.current) {
          if (window.speechSynthesis?.speaking) {
            console.warn(
              "[SELA] TTS fallback reached while speech is still playing — extending watchdog",
            );
            return;
          }
          console.warn("[SELA] TTS onEnd timeout — force restart listen");
          window.speechSynthesis?.cancel();
          stopSpeechTimeline();
          setAvatarState("idle");
          isProcessingRef.current = false;
        }
      }, Math.max(estDuration + 9000, 45000));

      speakResponseWithAvatar(
        spokenText,
        response.detectedLang || lang,
        () => {
          console.log("[SELA Turn] completed", {
            ...turnMetrics,
            totalMs: Date.now() - turnStartedAt,
          });
          updateLastTurnDebug({
            ...turnMetrics,
            stage: "completed",
            totalMs: Date.now() - turnStartedAt,
            screenMode: response.screen?.mode || null,
            chatProvider: response.debug?.chatProvider || null,
            counselorMode: response.debug?.counselorMode || null,
          });
          clearTimeout(ttsFallback);
          isProcessingRef.current = false;
          if (response.screen) {
            clearScreenHoldTimer();
            screenHoldTimerRef.current = setTimeout(() => {
              setActiveScreen(null);
              screenHoldTimerRef.current = null;
            }, SCREEN_CARD_HOLD_MS);
          }
          setAvatarState("idle");
        },
      );
    } catch (error) {
      console.error(error);
      console.log("[SELA Turn] failed", {
        ...turnMetrics,
        totalMs: Date.now() - turnStartedAt,
        error: error?.message,
      });
      updateLastTurnDebug({
        ...turnMetrics,
        stage: "failed",
        totalMs: Date.now() - turnStartedAt,
        error: error?.message,
      });
      setIsWaitingAI(false);
      if (onReceive) onReceive(t[lang].error_stt);
      setAvatarState("idle");
      isProcessingRef.current = false;
    }
  };

  // ── Voice-only: mic hanya menyala saat user menekan tombol bicara ──────────
  useEffect(() => {
    if (!activated) {
      stopListening();
      setAvatarState("idle");
      isProcessingRef.current = false;
    }
    return () => stopListening();
  }, [activated]);

  useEffect(() => {
    if (activated) return;
    cancelActiveSpeech();
    window.speechSynthesis?.cancel();
    setSpeechTimeline(null);
    setSpeechCharIndex(null);
  }, [activated, cancelActiveSpeech]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!activatedRef.current || sessionEndingRef.current) return;
      if (isListeningRef.current || isProcessingRef.current) return;
      if (Date.now() - lastInteractionTimeRef.current > IDLE_SESSION_MS) {
        console.log("[SELA Session] Sesi diakhiri karena idle timeout");
        endSessionRef.current?.("idle_timeout");
      }
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  // ── Farewell handler ──────────────────────────────────────────
  const handleFarewell = (userText) => {
    aiRequestSeqRef.current++;
    setIsWaitingAI(false);
    markSessionInteraction();
    rememberTurn({
      role: "user",
      type: "farewell",
      text: userText,
    });
    onSend(userText);
    stopListening();
    window.speechSynthesis?.cancel();
    isProcessingRef.current = true;

    const farewellChat = currentChat
      ? {
          ...currentChat,
          messages: [
            ...(currentChat.messages || []),
            { role: "user", text: userText, ts: new Date() },
          ],
        }
      : null;

    const msg =
      lang === "id"
        ? "Sama-sama! Senang bisa membantu. Selamat datang kembali kapan saja ya!"
        : "You're welcome! Happy to help. Feel free to come back anytime!";

    if (onReceive) onReceive(msg);
    rememberTurn({
      role: "sela",
      type: "farewell_response",
      text: msg,
      spokenText: msg,
    });

    // Fallback jika TTS onEnd tidak terpanggil (Chrome bug)
    const farewellFallback = setTimeout(() => {
      archiveConversationSession({
        currentChat: farewellChat,
        lang,
        endedByFarewell: true,
        endReason: "farewell",
      });
      isProcessingRef.current = false;
      activatedRef.current = false;
      setIsPortraitChatOpen(false);
      setAvatarState("idle");
      setActivated(false);
      clearMemorySession("farewell");
      if (onReset) onReset();
    }, 6000);

    speakWithAvatar(msg, lang, () => {
      clearTimeout(farewellFallback);
      archiveConversationSession({
        currentChat: farewellChat,
        lang,
        endedByFarewell: true,
        endReason: "farewell",
      });
      isProcessingRef.current = false;
      activatedRef.current = false;
      setIsPortraitChatOpen(false);
      setAvatarState("idle");
      setActivated(false);
      clearMemorySession("farewell");
      if (onReset) onReset();
    });
  };

  const handleVoiceButtonClick = () => {
    if (!activatedRef.current || isProcessingRef.current) return;
    if (isListeningRef.current) {
      if (recorderRef.current?.state !== "inactive") {
        manualStopRef.current = true;
        recorderRef.current.stop();
      }
      return;
    }
    startListeningRef.current?.();
  };

  const VoiceActionButton = () => {
    const disabled = isProcessingRef.current || avatarState === "speaking";
    const isListening = avatarState === "listening";
    const label = isListening
      ? "Selesai bicara"
      : lang === "id"
        ? "Tekan untuk bicara"
        : "Press to speak";

    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300">
          {label}
        </p>
        <button
          id="voice-action-btn"
          type="button"
          onClick={handleVoiceButtonClick}
          disabled={disabled}
          className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-2xl transition-all duration-200 active:scale-95
            ${
              isListening
                ? "bg-red-500 shadow-red-300/40 hover:bg-red-600"
                : "bg-blue-600 shadow-blue-400/35 hover:bg-blue-700"
            }
            ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          aria-label={label}
        >
          <span className="scale-125">
            <IconMicToggle />
          </span>
        </button>
      </div>
    );
  };

  const statusLabel = () => {
    if (micDenied)
      return lang === "id"
        ? "Izin mikrofon ditolak"
        : "Microphone permission denied";
    switch (avatarState) {
      case "listening":
        return t[lang].listening;
      case "thinking":
        return lang === "id" ? "Sedang berpikir..." : "Thinking...";
      case "processing":
        return lang === "id" ? "Menyiapkan jawaban..." : "Preparing answer...";
      case "confused":
        return lang === "id" ? "Perlu diulang sebentar" : "Please repeat that";
      case "happy":
        return lang === "id" ? "Selesai membantu" : "Done helping";
      case "speaking":
        return lang === "id" ? "SELA sedang bicara..." : "SELA is speaking...";
      default:
        return lang === "id" ? "Tekan mic untuk bertanya" : "Press mic to ask";
    }
  };

  const messages = currentChat?.messages ?? [];

  // ── VOICE-ONLY KIOSK MODE ─────────────────────────────────────
  const latestMsg = messages[messages.length - 1];
  const screenForDisplay = activeScreen || latestMsg?.screen || null;

  // Overlay sebelum aktivasi — kamera preview + face detection status
  if (!activated) {
    return (
      <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        {/* Avatar 3D Background - FULL SCREEN */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="pointer-events-auto w-full h-full">
            <AvatarPlaceholder
              state="idle"
              theme={theme}
              activeViseme={activeViseme}
            />
          </div>
        </div>

        {/* Hidden Camera for Face Detection */}
        <div className="absolute opacity-0 pointer-events-none overflow-hidden w-1 h-1">
          <video ref={videoRef} muted playsInline autoPlay />
        </div>

        <div className="absolute bottom-8 z-20">
          <p className="rounded-full border border-white/70 bg-white/85 px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-slate-500 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-300">
            Menunggu wajah pengunjung
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 relative flex flex-col overflow-hidden">
        {/* Avatar full screen */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="pointer-events-auto w-full h-full">
            <AvatarPlaceholder
              state={avatarState}
              theme={theme}
              activeViseme={activeViseme}
            />
          </div>
        </div>
        <div className="absolute opacity-0 pointer-events-none overflow-hidden w-1 h-1">
          <video ref={videoRef} muted playsInline autoPlay />
        </div>

        {/* Landscape info panel — AnswerCard/QR first, chat history secondary */}
        <aside className="absolute top-20 right-0 bottom-28 w-[390px] hidden md:flex [@media(orientation:portrait)]:hidden flex-col gap-3 pr-8 pb-6 pt-2 pointer-events-auto z-10 transition-colors overflow-hidden">
          <div className="shrink-0">
            {screenForDisplay ? (
              <AnswerCard screen={screenForDisplay} />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-800 shadow-xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                  Informasi
                </p>
                <h3 className="mt-1 text-sm font-bold text-slate-950">
                  Siap membantu
                </h3>
                <p className="mt-1 text-xs font-medium leading-snug text-slate-600">
                  Ringkasan jawaban, langkah, dan QR akan muncul di sini.
                </p>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 px-3 py-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Riwayat Singkat
              </p>
              {messages.length > 0 && (
                <p className="text-[10px] font-semibold text-slate-400">
                  {messages.length} pesan
                </p>
              )}
            </div>
            {messages.length === 0 && !isWaitingAI ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
                <IconSparkle />
                <p className="text-xs font-semibold uppercase tracking-widest">
                  Belum ada chat
                </p>
              </div>
            ) : (
              <div
                ref={chatScrollRef}
                onScroll={handleChatScroll}
                className="flex h-full flex-col gap-1 overflow-y-auto hide-scrollbar"
              >
                {messages.map((msg) => (
                  <div key={msg.id}>
                    <ChatBubble
                      role={msg.role}
                      text={msg.text}
                      speechText={msg.spokenText || msg.text}
                      lang={lang}
                      isNew={false}
                      ttsEndSignal={ttsEndSignal}
                      voiceMode={false}
                      speechCharIndex={null}
                    />
                    {msg.role === "assistant" &&
                      msg.media &&
                      msg.media.length > 0 && (
                        <MediaCarousel media={msg.media} />
                      )}
                  </div>
                ))}
                {isWaitingAI && (
                  <ChatBubble
                    role="assistant"
                    text=""
                    lang={lang}
                    isLoading
                    ttsEndSignal={ttsEndSignal}
                    voiceMode
                  />
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </aside>

        {/* Tombol scroll ke bawah — landscape panel */}
        {!isAtBottom && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-40 right-[190px] z-30 w-8 h-8 rounded-full hidden md:flex [@media(orientation:portrait)]:hidden
              bg-white/95 border border-slate-200
              shadow-lg items-center justify-center text-slate-500
              hover:bg-white active:scale-95 transition-all duration-150 animate-fade-in"
          >
            <IconChevronDown />
          </button>
        )}

        {isPortraitChatOpen && (
          <div className="absolute inset-0 z-40 flex flex-col bg-white/95 text-gray-700 backdrop-blur-xl dark:bg-slate-950/95 dark:text-gray-100 md:hidden [@media(orientation:landscape)]:hidden animate-fade-in">
            <div className="flex items-center justify-between border-b border-gray-200/80 px-4 py-3 dark:border-white/10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  SELA
                </p>
                <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                  Riwayat Chat
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsPortraitChatOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-150 hover:bg-gray-50 active:scale-95 dark:border-white/10 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800"
                aria-label="Tutup riwayat chat"
              >
                <IconClose />
              </button>
            </div>

            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              className="flex-1 overflow-y-auto px-4 py-4 hide-scrollbar"
            >
              <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-end gap-1">
                {messages.length === 0 && !isWaitingAI ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-gray-400 dark:text-gray-500">
                    <IconSparkle />
                    <p className="text-xs font-semibold uppercase tracking-widest">
                      Belum ada chat
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div key={msg.id}>
                        <ChatBubble
                          role={msg.role}
                          text={msg.text}
                          speechText={msg.spokenText || msg.text}
                          lang={lang}
                          qrVisibleMs={20000}
                          isNew={
                            msg.role === "assistant" && msg.id === latestSelaId
                          }
                          ttsEndSignal={ttsEndSignal}
                          voiceMode
                          speechCharIndex={
                            msg.role === "assistant" && msg.id === latestSelaId
                              ? speechCharIndex
                              : null
                          }
                        />
                        {msg.role === "assistant" &&
                          msg.media &&
                          msg.media.length > 0 && (
                            <MediaCarousel media={msg.media} />
                          )}
                      </div>
                    ))}
                    {isWaitingAI && (
                      <ChatBubble
                        role="assistant"
                        text=""
                        lang={lang}
                        isLoading
                        ttsEndSignal={ttsEndSignal}
                        voiceMode
                      />
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 pointer-events-none" />

        {/* Bottom content for speak mode */}
        <div className="flex flex-col items-center gap-3 pb-8 pt-2 px-4 relative z-20 pointer-events-auto">
          <div className="w-full max-w-sm md:hidden [@media(orientation:portrait)]:block">
            <div className="flex flex-col items-center gap-2">
              <AnswerCard screen={activeScreen} />
              {avatarState === "speaking" &&
                latestMsg?.role === "assistant" && (
                  <LiveCaption
                    text={liveCaptionText || latestMsg.text}
                    isLoading={false}
                    avatarState={avatarState}
                    spokenCharIndex={liveCaptionCharIndex}
                    wordIntervalMs={liveCaptionWordInterval}
                    speechTimeline={speechTimeline}
                    links={activeScreen ? [] : latestMsg.screen?.links || []}
                  />
                )}
            </div>
          </div>

          {(avatarState !== "idle" || micDenied) && (
            <p className="text-xs text-gray-500 dark:text-gray-300 font-bold uppercase tracking-tighter text-center">
              {statusLabel()}
            </p>
          )}

          {micDenied && (
            <button
              onClick={() => {
                setMicDenied(false);
                startListeningRef.current?.();
              }}
              className="text-xs text-blue-500 underline"
            >
              {lang === "id" ? "Coba lagi" : "Retry"}
            </button>
          )}

          <VoiceActionButton />
        </div>

        {(messages.length > 0 || isWaitingAI) && !isPortraitChatOpen && (
          <button
            type="button"
            onClick={() => setIsPortraitChatOpen(true)}
            className="absolute bottom-24 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/90 text-blue-500 shadow-lg backdrop-blur-md transition-all duration-150 hover:bg-white active:scale-95 dark:border-white/10 dark:bg-slate-900/90 dark:text-blue-300 md:hidden [@media(orientation:landscape)]:hidden"
            aria-label="Buka riwayat chat"
          >
            <IconChat />
          </button>
        )}
      </main>
  );
}
