import { useState, useRef, useEffect, useCallback } from "react";
import ChatBubble from "./ChatBubble";
import LiveCaption from "./LiveCaption";
import AvatarPlaceholder from "./AvatarPlaceholder";
import SuggestionButtons from "./SuggestionButtons";
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

// ── SVG Icons ────────────────────────────────────────────────────
const IconMic = ({ size = "md" }) => {
  const cls = size === "lg" ? "w-12 h-12" : "w-5 h-5";
  return (
    <svg
      className={`${cls} text-white`}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm-1 18v3h2v-3a8.03 8.03 0 005.65-2.35l-1.41-1.41A6 6 0 0112 19a6 6 0 01-4.24-1.76L6.35 18.65A8.03 8.03 0 0011 21z" />
    </svg>
  );
};

const IconKeyboard = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    viewBox="0 0 24 24"
  >
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path
      strokeLinecap="round"
      d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"
    />
  </svg>
);

const IconMicToggle = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm-1 18v3h2v-3a8.03 8.03 0 005.65-2.35l-1.41-1.41A6 6 0 0112 19a6 6 0 01-4.24-1.76L6.35 18.65A8.03 8.03 0 0011 21z" />
  </svg>
);

const IconSend = () => (
  <svg
    className="w-4 h-4 text-white"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M22 2L11 13M22 2L15 22l-4-9-9-4 19-7z"
    />
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

// Quick reply button definitions
const quickReplies = {
  id: [
    {
      label: "📝 Cara Daftar?",
      text: "Bagaimana cara mendaftar sebagai mahasiswa baru di UCIC?",
    },
    // { label: '🎓 Info Beasiswa', text: 'Apa saja program beasiswa yang tersedia di UCIC?' }, // DISABLED - Awaiting complete scholarship data
    // { label: '📞 Kontak BAA', text: 'Bagaimana cara menghubungi Biro Administrasi Akademik?' }, // DISABLED - Awaiting complete contact data
  ],
  en: [
    {
      label: "📝 How to Register?",
      text: "How do I register as a new student at UCIC?",
    },
    // { label: '🎓 Scholarship Info', text: 'What scholarship programs are available at UCIC?' }, // DISABLED - Awaiting complete scholarship data
    // { label: '📞 Contact BAA', text: 'How can I contact the Academic Administration Bureau?' }, // DISABLED - Awaiting complete contact data
  ],
};

// ─────────────────────────────────────────────────────────────────
const SILENCE_DURATION = 850; // ms diam setelah ada suara → auto-stop lebih cepat
const MIN_SPEECH_MS = 500; // ms minimum bicara — tetap tahan noise tapi lebih ramah pertanyaan pendek
const MIN_BLOB_SIZE = 30000; // bytes minimum audio — audio terlalu kecil = pasti noise
const MAX_RECORD_MS = 20000; // 20 detik maksimal recording sebagai failsafe
const THRESHOLD_MULTIPLIER = 2.8; // Increased from 2.0 → lebih strict untuk noise filtering
const BASELINE_SAMPLE_MS = 500; // ms untuk sample baseline noise
const EARLY_SPEECH_THRESHOLD_MULTIPLIER = 1.6; // Increased from 1.35 → lebih strict saat baseline
const MIN_TRANSCRIPT_CHARS = 6;
const QUICK_COMMIT_SILENCE_MS = 550; // commit cepat setelah speech valid
const QUICK_COMMIT_MIN_SPEECH_MS = 500;
const MIN_RMS_FOR_VALID_SPEECH = 8; // Minimum RMS level untuk dianggap speech, bukan noise
const IDLE_SESSION_MS = 90 * 1000; // 90 detik tanpa interaksi -> reset sesi
const FACE_LOST_END_MS = 12 * 1000; // 12 detik wajah hilang saat sesi aktif -> reset
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

export default function VoiceUI({
  currentChat,
  onSend,
  onReceive,
  onNewChat,
  onReset,
  lang = "id",
  setLang,
  theme = "light",
}) {
  const [mode, setMode] = useState("speak");
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [avatarState, setAvatarState] = useState("idle");
  const [micDenied, setMicDenied] = useState(false);
  const [activated, setActivated] = useState(false); // user harus tap dulu untuk unlock audio
  const [faceDetected, setFaceDetected] = useState(false);
  const [isWaitingAI, setIsWaitingAI] = useState(false); // loading bubble saat menunggu AI
  const [latestSelaId, setLatestSelaId] = useState(null); // id pesan SELA terbaru → typewriter
  const [langSelected, setLangSelected] = useState(false);
  const [awaitingLangSelect, setAwaitingLangSelect] = useState(false);
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
  const [isDebugOpen, setIsDebugOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("debug");
  });
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
  const speechStartRef = useRef(null);
  const firstSpeechDetectedAtRef = useRef(null);
  const baselineStartedAtRef = useRef(null);
  const modeRef = useRef(mode);
  const dynamicThresholdRef = useRef(10); // fallback fallback jika baseline gagal
  const suppressRecorderOnStopRef = useRef(false);
  const lastInteractionTimeRef = useRef(Date.now());
  const sessionEndingRef = useRef(false);
  const currentChatRef = useRef(currentChat);
  const langRef = useRef(lang);

  // Face detection refs
  const audioUnlockedRef = useRef(false); // true setelah tap pertama, tidak pernah reset
  const activatedRef = useRef(false); // sync dengan activated state
  const videoRef = useRef(null);
  const videoStreamRef = useRef(null);
  const faceDetectorRef = useRef(null);
  const faceFrameRef = useRef(null);
  const lastFaceTimeRef = useRef(0);
  const lastDetectRef = useRef(0); // throttle detection ke ~500ms
  const properFaceTimeRef = useRef(null); // timestamp ketika wajah mulai menghadap dengan benar
  const PROPER_FACE_CONFIRMATION_MS = 1000; // 1 detik sebelum auto-activate
  const MIN_FACE_SIZE_RATIO = 0.2; // minimum 20% dari video width (~1m distance untuk kiosk)

  // Sinkronkan refs dengan state
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    activatedRef.current = activated;
  }, [activated]);
  useEffect(() => {
    currentChatRef.current = currentChat;
  }, [currentChat]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    if (mode !== "speak" || !activated) {
      setIsPortraitChatOpen(false);
    }
  }, [mode, activated]);

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

  // Re-attach camera stream ke video element setiap kali overlay muncul
  // (video element di-unmount saat activated=true, jadi stream hilang)
  useEffect(() => {
    if (!activated && videoRef.current && videoStreamRef.current) {
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
      setLangSelected(false);
    setAwaitingLangSelect(false);
    setFaceDetected(false);
    properFaceTimeRef.current = null;
    lastFaceTimeRef.current = 0;
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
    setLangSelected(false);
    setAwaitingLangSelect(false);

    // Sapa dalam Bahasa Indonesia dulu
    const greetID = "Halo! Selamat datang di UCIC. Saya SELA.";
    const askID = "Mau bicara dalam Bahasa Indonesia atau Bahasa Inggris?";
    const greetEN = "Hello! Welcome to UCIC. I'm SELA.";
    const askEN = "Would you like to speak in Indonesian or English?";

    speakSequenceWithAvatar(
      [
        { text: greetID, lang: "id" },
        { text: greetEN, lang: "en" },
        { text: askID, lang: "id" },
        { text: askEN, lang: "en" },
      ],
      () => {
        isProcessingRef.current = false;
        setAvatarState("idle");
        setAwaitingLangSelect(true);
      },
    );
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
        const { FaceDetector, FilesetResolver } =
          await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
        );
        if (destroyed) return;
        faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
        startDetectionLoop();
      } catch (e) {
        console.warn("[SELA Cam] Face detector gagal load:", e.message);
      }
    };

    const startDetectionLoop = () => {
      const loop = () => {
        faceFrameRef.current = requestAnimationFrame(loop);
        if (
          !faceDetectorRef.current ||
          !videoRef.current ||
          videoRef.current.readyState < 2
        )
          return;

        // Throttle: jalankan detection setiap ~500ms
        const now = Date.now();
        if (now - lastDetectRef.current < 500) return;
        lastDetectRef.current = now;

        try {
          const result = faceDetectorRef.current.detectForVideo(
            videoRef.current,
            now,
          );
          const hasFace = result.detections.length > 0;

          // Cek apakah wajah menghadap kamera (bukan miring/membelakangi)
          // PENTING: keypoints pakai koordinat normalized (0-1),
          //          box.width/height pakai piksel → harus dinormalisasi dulu
          const vidW = videoRef.current.videoWidth || 640;
          const vidH = videoRef.current.videoHeight || 480;
          const facingCamera = result.detections.some((det) => {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    speechStartRef.current = null;
    firstSpeechDetectedAtRef.current = null;
    baselineStartedAtRef.current = null;
  };

  // ── Start auto-listen ─────────────────────────────────────────
  // Pakai fungsi biasa (bukan useCallback) yang disimpan di ref,
  // supaya pemanggil di dalam closure selalu dapat versi terbaru.
  const startListeningRef = useRef(null);
  startListeningRef.current = async () => {
    // Cek via ref — tidak pernah stale
    if (isListeningRef.current || isProcessingRef.current) return;
    if (modeRef.current !== "speak") return;

    try {
      // ── Aggressive audio constraints untuk noisy environments ──
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 }, // Mono untuk lebih fokus
          sampleRate: { ideal: 16000 }, // Optimal untuk speech recognition
          sampleSize: { ideal: 16 },
          latency: { ideal: 0.01 },
        },
      });
      streamRef.current = stream;
      setMicDenied(false);
      isListeningRef.current = true;

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
        const audioBlob =
          pcmChunks.length > 0
            ? encodeWavBlob(pcmChunks, audioCtx.sampleRate)
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
        );
        stopListening();

        if (
          !hadSpeech ||
          speechDuration < MIN_SPEECH_MS ||
          audioBlob.size < MIN_BLOB_SIZE
        ) {
          console.log("[SELA] Skip — noise/pendek/kecil:", {
            hadSpeech,
            speechDuration,
            blobSize: audioBlob.size,
          });
          setAvatarState("idle");
          setTimeout(() => startListeningRef.current?.(), 300);
          return;
        }

        // Ada suara valid → proses
        console.log("[SELA] Ada suara valid, mulai processing...");
        processAudioRef.current(audioBlob);
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
        const rms = Math.sqrt(
          data.reduce((s, v) => s + (v - 128) * (v - 128), 0) / data.length,
        );
        baselineRmsValues.push(rms);
        const avgSoFar =
          baselineRmsValues.reduce((a, b) => a + b, 0) /
          baselineRmsValues.length;
        const provisionalThreshold = Math.max(
          MIN_RMS_FOR_VALID_SPEECH,
          avgSoFar * EARLY_SPEECH_THRESHOLD_MULTIPLIER,
        );

        if (rms > provisionalThreshold && !hasSpeechRef.current) {
          hasSpeechRef.current = true;
          speechStartRef.current = Date.now();
          firstSpeechDetectedAtRef.current = speechStartRef.current;
          dynamicThresholdRef.current = Math.max(
            MIN_RMS_FOR_VALID_SPEECH,
            avgSoFar * THRESHOLD_MULTIPLIER,
          );
          console.log("[SELA VAD] Early speech detected during baseline", {
            rms: Number(rms.toFixed(2)),
            provisionalThreshold: Number(provisionalThreshold.toFixed(2)),
            threshold: Number(dynamicThresholdRef.current.toFixed(2)),
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
          // Nilai time-domain: 128 = silence, deviation dari 128 = ada suara
          const rms = Math.sqrt(
            data.reduce((s, v) => s + (v - 128) * (v - 128), 0) / data.length,
          );

          // Log RMS setiap ~500ms supaya bisa debug threshold
          logThrottle++;
          if (logThrottle % 30 === 0)
            console.log(
              "[SELA VAD] RMS:",
              rms.toFixed(2),
              "| threshold:",
              dynamicThresholdRef.current.toFixed(2),
              "| hasSpeech:",
              hasSpeechRef.current,
            );

          if (rms > dynamicThresholdRef.current) {
            if (!hasSpeechRef.current) {
              hasSpeechRef.current = true;
              speechStartRef.current = Date.now();
              firstSpeechDetectedAtRef.current = speechStartRef.current;
              console.log("[SELA VAD] Speech detected! RMS:", rms.toFixed(2));
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
  processAudioRef.current = async (audioBlob) => {
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
      const rawText = await transcribeAudio(audioBlob, lang);
      turnMetrics.sttMs = Date.now() - sttStartedAt;
      updateLastTurnDebug({
        ...turnMetrics,
        stage: "transcribed",
        rawTranscript: rawText,
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
        setTimeout(() => startListeningRef.current?.(), 300);
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
        setTimeout(() => startListeningRef.current?.(), 300);
        return;
      }

      markSessionInteraction();
      if (isFarewell(text)) {
        handleFarewell(text);
        return;
      }

      onSend(text);
      setIsWaitingAI(true);
      const requestId = ++aiRequestSeqRef.current;

      const history = (currentChat?.messages || []).map((m) => ({
        role: m.role,
        content: m.text,
      }));
      history.push({ role: "user", content: text });
      const aiStartedAt = Date.now();
      setAvatarState("processing");
      const response = await getChatCompletion(history, lang);
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
          startListeningRef.current?.();
        }, 500);
        return;
      }

      if (onReceive) onReceive(response);
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
          setTimeout(() => startListeningRef.current?.(), 350);
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
          // Delay 350ms — beri waktu speaker selesai bergema sebelum mic aktif lagi
          setTimeout(() => startListeningRef.current?.(), 350);
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
      setTimeout(() => startListeningRef.current?.(), 1500);
    }
  };

  // ── Auto-start saat mode speak DAN sudah diaktivasi ──────────
  useEffect(() => {
    if (mode !== "speak" || !activated) {
      stopListening();
      setAvatarState("idle");
      isProcessingRef.current = false;
      return;
    }
    const timer = setTimeout(() => startListeningRef.current?.(), 200);
    return () => {
      clearTimeout(timer);
      stopListening();
    };
  }, [mode, activated]);

  useEffect(() => {
    if (mode === "speak" && activated) return;
    cancelActiveSpeech();
    window.speechSynthesis?.cancel();
    setSpeechTimeline(null);
    setSpeechCharIndex(null);
  }, [mode, activated, cancelActiveSpeech]);

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
      setLangSelected(false);
      setAwaitingLangSelect(false);
      if (onReset) onReset();
    });
  };

  // ── Type mode ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    let textToSubmit = value;

    // Handle both form event and direct string call (from quick replies/suggestions)
    if (typeof e === "string") {
      // Direct call with text
      textToSubmit = e;
      setValue("");
      e = { preventDefault: () => {} };
    } else {
      e.preventDefault();
    }

    if (!textToSubmit.trim()) return;
    const userText = textToSubmit.trim();
    markSessionInteraction();
    setValue("");
    setIsAtBottom(true);
    if (isFarewell(userText)) {
      handleFarewell(userText);
      return;
    }
    onSend(userText);

    // Pesan pertama & bahasa belum dipilih → tampilkan bilingual greeting
    if (!langSelected && (currentChat?.messages ?? []).length === 0) {
      const greetID = "Hai, apa yang bisa SELA bantu hari ini, nih?";
      const greetEN = "Hello! How can I help you today?";
      const askID = "Mau bicara dalam Bahasa Indonesia atau Bahasa Inggris?";
      const askEN = "Would you like to speak in Indonesian or English?";
      const combined = `${greetID}\n\n${greetEN}\n\n${askID}\n\n${askEN}`;
      if (onReceive) onReceive(combined);
      setAwaitingLangSelect(false);
      speakSequenceWithAvatar(
        [
          { text: greetID, lang: "id" },
          { text: greetEN, lang: "en" },
          { text: askID, lang: "id" },
          { text: askEN, lang: "en" },
        ],
        () => {
          setAvatarState("idle");
          setAwaitingLangSelect(true);
        },
      );
      return;
    }

    setAvatarState("thinking");
    setIsWaitingAI(true);
    const requestId = ++aiRequestSeqRef.current;
    try {
      const history = (currentChat?.messages || []).map((m) => ({
        role: m.role,
        content: m.text,
      }));
      history.push({ role: "user", content: userText });
      const response = await getChatCompletion(history, lang);
      if (requestId !== aiRequestSeqRef.current) return;
      setIsWaitingAI(false);
      if (onReceive) onReceive(response);
      markSessionInteraction();
      speakResponseWithAvatar(
        response.spokenText || response.text,
        response.detectedLang || lang,
        () => setAvatarState("idle"),
      );
    } catch {
      if (requestId !== aiRequestSeqRef.current) return;
      setIsWaitingAI(false);
      if (onReceive) onReceive(t[lang].error_network);
      setAvatarState("idle");
    }
  };

  // ── Pilih bahasa saat greeting ────────────────────────────────
  const handleLangSelect = (chosen) => {
    markSessionInteraction();
    if (setLang) setLang(chosen);
    setLangSelected(true);
    setAwaitingLangSelect(false);
    window.speechSynthesis?.cancel();
    isProcessingRef.current = true;
    const langLabel = chosen === "id" ? "🇮🇩 Bahasa Indonesia" : "🇬🇧 English";

    // Use time-based greeting instead of static message
    const timeBasedGreeting = getTimeBasedGreeting(chosen);
    const confirm = timeBasedGreeting;

    if (mode === "type") {
      onSend(langLabel);
      if (onReceive) onReceive(confirm);
    }
    speakWithAvatar(confirm, chosen, () => {
      isProcessingRef.current = false;
      startListeningRef.current?.();
    });
  };

  // ── Mode Toggle ───────────────────────────────────────────────
  const ModeToggle = () => (
    <div className="flex justify-center">
      <div className="inline-flex items-center bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm border border-gray-100/80 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden transition-colors">
        <button
          id="mode-type-btn"
          onClick={() => setMode("type")}
          className={`flex flex-col items-center gap-1 px-8 py-2.5 transition-all duration-200
            ${mode === "type" ? "text-blue-600 dark:text-blue-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
        >
          <IconKeyboard />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {t[lang].type_mode}
          </span>
        </button>
        <div className="w-px h-8 bg-gray-200 dark:bg-white/10" />
        <button
          id="mode-speak-btn"
          onClick={() => setMode("speak")}
          className={`flex flex-col items-center gap-1 px-8 py-2.5 transition-all duration-200
            ${mode === "speak" ? "text-blue-600 dark:text-blue-400" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
        >
          <IconMicToggle />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {t[lang].speak_mode}
          </span>
        </button>
      </div>
    </div>
  );

  const DebugPanel = () => {
    if (!lastTurnDebug) return null;

    const rows = [
      ["stage", lastTurnDebug.stage],
      ["provider", lastTurnDebug.chatProvider || "-"],
      ["mode", lastTurnDebug.counselorMode || "-"],
      ["STT", lastTurnDebug.sttMs ? `${lastTurnDebug.sttMs}ms` : "-"],
      ["AI", lastTurnDebug.aiMs ? `${lastTurnDebug.aiMs}ms` : "-"],
      ["chunks", lastTurnDebug.ttsChunks || "-"],
      ["chars", lastTurnDebug.spokenChars || "-"],
      ["screen", lastTurnDebug.screenMode || "-"],
    ];

    return (
      <div className="absolute left-4 top-20 z-30 w-64 rounded-2xl border border-slate-200/70 bg-white/90 p-3 text-[11px] text-slate-600 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-slate-950/85 dark:text-slate-300">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-bold uppercase tracking-widest text-slate-400">
            Debug Turn
          </span>
          <button
            type="button"
            onClick={() => setIsDebugOpen(false)}
            className="rounded-full px-2 py-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            tutup
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <span className="uppercase tracking-wider text-slate-400">
                {label}
              </span>
              <span className="truncate font-medium">{String(value)}</span>
            </div>
          ))}
        </div>
        {lastTurnDebug.finalTranscript && (
          <p className="mt-2 line-clamp-2 border-t border-slate-200/70 pt-2 dark:border-white/10">
            {lastTurnDebug.finalTranscript}
          </p>
        )}
        {lastTurnDebug.error && (
          <p className="mt-2 line-clamp-2 text-red-500">
            {lastTurnDebug.error}
          </p>
        )}
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
        return lang === "id" ? "Siap mendengarkan" : "Ready to listen";
    }
  };

  const messages = currentChat?.messages ?? [];

  // ── SPEAK MODE ────────────────────────────────────────────────
  if (mode === "speak") {
    const latestMsg = messages[messages.length - 1];

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
            <ModeToggle />
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
        {isDebugOpen && <DebugPanel />}

        {/* Chat bubbles — landscape/wide mode only */}
        <div className="absolute top-0 right-0 bottom-28 w-[340px] hidden md:flex [@media(orientation:portrait)]:hidden flex-col justify-end pr-8 pb-6 pt-4 pointer-events-auto z-10 transition-colors overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 pb-4 opacity-50">
              <IconSparkle />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic tracking-widest">
                SELA AI
              </p>
            </div>
          ) : (
            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              className="flex flex-col gap-1 overflow-y-auto hide-scrollbar"
            >
              {messages.map((msg) => (
                <div key={msg.id}>
                  <ChatBubble
                    role={msg.role}
                    text={msg.text}
                    speechText={msg.spokenText || msg.text}
                    lang={lang}
                    isNew={msg.role === "assistant" && msg.id === latestSelaId}
                    ttsEndSignal={ttsEndSignal}
                    voiceMode={mode === "speak"}
                    speechCharIndex={
                      msg.role === "assistant" && msg.id === latestSelaId
                        ? speechCharIndex
                        : null
                    }
                  />
                  {msg.role === "assistant" &&
                    msg.media &&
                    msg.media.length > 0 && <MediaCarousel media={msg.media} />}
                </div>
              ))}
              {isWaitingAI && (
                <ChatBubble
                  role="assistant"
                  text=""
                  lang={lang}
                  isLoading
                  ttsEndSignal={ttsEndSignal}
                  voiceMode={mode === "speak"}
                />
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        {/* Tombol scroll ke bawah — voice mode, di atas panel chat */}
        {!isAtBottom && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-40 right-[155px] z-30 w-8 h-8 rounded-full hidden md:flex [@media(orientation:portrait)]:hidden
              bg-white/90 dark:bg-slate-800/90 border border-gray-200/70 dark:border-white/10
              shadow-lg items-center justify-center text-gray-500 dark:text-gray-300
              hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all duration-150 animate-fade-in"
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
                          voiceMode={mode === "speak"}
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
                        voiceMode={mode === "speak"}
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

          <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-tighter text-center">
            {statusLabel()}
          </p>

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

          {/* Tombol pilihan bahasa — muncul setelah greeting bilingual selesai */}
          {activated &&
            awaitingLangSelect &&
            !langSelected &&
            avatarState === "idle" && (
              <div className="flex gap-3 animate-fade-in">
                <button
                  onClick={() => handleLangSelect("id")}
                  className="px-5 py-2 rounded-2xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 active:scale-95 text-white shadow-md transition-all duration-150"
                >
                  🇮🇩 Indonesia
                </button>
                <button
                  onClick={() => handleLangSelect("en")}
                  className="px-5 py-2 rounded-2xl text-sm font-semibold bg-white hover:bg-gray-50 active:scale-95 text-gray-700 border border-gray-200 shadow-md dark:bg-slate-700 dark:text-gray-100 dark:border-slate-600 transition-all duration-150"
                >
                  🇬🇧 English
                </button>
              </div>
            )}

          <ModeToggle />
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

        {lastTurnDebug && !isDebugOpen && (
          <button
            type="button"
            onClick={() => setIsDebugOpen(true)}
            className="absolute bottom-24 left-5 z-30 rounded-full border border-white/60 bg-white/85 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 shadow-lg backdrop-blur-md transition-all duration-150 hover:bg-white active:scale-95 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-300"
            aria-label="Buka debug turn"
          >
            Debug
          </button>
        )}
      </main>
    );
  }

  // ── TYPE MODE ─────────────────────────────────────────────────
  return (
    <main className="flex-1 relative flex flex-col overflow-hidden px-4 pt-4 pb-8 transition-colors">
      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 pb-8">
            <IconSparkle />
            <div>
              <h2 className="text-4xl font-light text-gray-600 dark:text-gray-200 tracking-tighter italic">
                SELA
              </h2>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 font-medium">
                {t[lang].type_message}
              </p>
            </div>

            {/* Quick reply buttons */}
            <div className="w-full px-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 font-semibold uppercase tracking-widest">
                {lang === "id" ? "Pertanyaan Populer" : "Popular Questions"}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {quickReplies[lang]?.map((qr, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSubmit(qr.text)}
                    className="px-4 py-2.5 rounded-full bg-gradient-to-r from-blue-500 to-blue-600
                               hover:from-blue-600 hover:to-blue-700
                               dark:from-blue-600 dark:to-blue-700
                               dark:hover:from-blue-700 dark:hover:to-blue-800
                               text-white text-xs font-semibold
                               active:scale-95 shadow-md
                               transition-all duration-150"
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 hide-scrollbar"
          >
            {messages.map((msg, idx) => (
              <div key={msg.id}>
                <ChatBubble
                  role={msg.role}
                  text={msg.text}
                  lang={lang}
                  isNew={msg.role === "assistant" && msg.id === latestSelaId}
                />
                {msg.role === "assistant" &&
                  msg.suggestions &&
                  msg.suggestions.length > 0 && (
                    <SuggestionButtons
                      suggestions={msg.suggestions}
                      onClick={(suggestion) => handleSubmit(suggestion)}
                      isVisible
                    />
                  )}
                {msg.role === "assistant" &&
                  msg.media &&
                  msg.media.length > 0 && <MediaCarousel media={msg.media} />}
              </div>
            ))}
            {isWaitingAI && (
              <ChatBubble role="assistant" text="" lang={lang} isLoading />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="w-full max-w-xl mx-auto mt-4">
        {/* Tombol scroll ke bawah — di atas input bar */}
        {!isAtBottom && messages.length > 0 && (
          <div className="flex justify-center mb-3 animate-fade-in">
            <button
              onClick={scrollToBottom}
              className="w-9 h-9 rounded-full bg-white/90 dark:bg-slate-800/90 border border-gray-200/70 dark:border-white/10
                shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-300
                hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all duration-150"
            >
              <IconChevronDown />
            </button>
          </div>
        )}
        {/* Tombol pilihan bahasa — muncul setelah greeting bilingual di type mode */}
        {awaitingLangSelect && !langSelected && (
          <div className="flex gap-3 justify-center mb-4 animate-fade-in">
            <button
              onClick={() => handleLangSelect("id")}
              className="px-5 py-2 rounded-2xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 active:scale-95 text-white shadow-md transition-all duration-150"
            >
              🇮🇩 Indonesia
            </button>
            <button
              onClick={() => handleLangSelect("en")}
              className="px-5 py-2 rounded-2xl text-sm font-semibold bg-white hover:bg-gray-50 active:scale-95 text-gray-700 border border-gray-200 shadow-md dark:bg-slate-700 dark:text-gray-100 dark:border-slate-600 transition-all duration-150"
            >
              🇬🇧 English
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative mb-3">
          <input
            id="main-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t[lang].type_message}
            className={`w-full bg-white/85 dark:bg-slate-900/90 backdrop-blur-sm border rounded-full pl-5 pr-14 py-4
                        text-gray-700 dark:text-gray-100 text-sm placeholder-gray-400 outline-none shadow-md
                        transition-all duration-300
                        ${
                          focused
                            ? "border-blue-300 dark:border-blue-500 ring-4 ring-blue-100/60 dark:ring-blue-900/40 shadow-blue-100/60"
                            : "border-gray-200/70 dark:border-white/10"
                        }`}
          />
          <button
            id="send-btn"
            type="submit"
            aria-label="Send"
            className="absolute right-2 top-1/2 -translate-y-1/2
                       w-10 h-10 rounded-full flex items-center justify-center
                       bg-gradient-to-br from-blue-500 to-blue-600
                       shadow-lg shadow-blue-400/40 hover:from-blue-600 hover:to-blue-700
                       active:scale-95 transition-all duration-150"
          >
            {value.trim() ? <IconSend /> : <IconMic />}
          </button>
        </form>
        <ModeToggle />
      </div>
    </main>
  );
}
