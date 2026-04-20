import { useState, useRef, useEffect } from 'react'
import ChatBubble from './ChatBubble'
import AvatarPlaceholder from './AvatarPlaceholder'
import { transcribeAudio, getChatCompletion, speakText } from '../lib/ai'

// ── SVG Icons ────────────────────────────────────────────────────
const IconMic = ({ size = 'md' }) => {
  const cls = size === 'lg' ? 'w-12 h-12' : 'w-5 h-5'
  return (
    <svg className={`${cls} text-white`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm-1 18v3h2v-3a8.03 8.03 0 005.65-2.35l-1.41-1.41A6 6 0 0112 19a6 6 0 01-4.24-1.76L6.35 18.65A8.03 8.03 0 0011 21z" />
    </svg>
  )
}

const IconKeyboard = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path strokeLinecap="round" d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" />
  </svg>
)

const IconMicToggle = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm-1 18v3h2v-3a8.03 8.03 0 005.65-2.35l-1.41-1.41A6 6 0 0112 19a6 6 0 01-4.24-1.76L6.35 18.65A8.03 8.03 0 0011 21z" />
  </svg>
)

const IconSend = () => (
  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2L15 22l-4-9-9-4 19-7z" />
  </svg>
)

const IconSparkle = () => (
  <svg className="w-10 h-10 text-blue-200" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
)

const IconChevronDown = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)
// ─────────────────────────────────────────────────────────────────

import { t } from '../lib/translations'

// VAD constants
const SILENCE_DURATION  = 1500 // ms diam setelah ada suara → auto-stop
const MIN_SPEECH_MS     = 800  // ms minimum bicara — cegah noise pendek masuk Whisper
const MIN_BLOB_SIZE     = 30000 // bytes minimum audio — audio terlalu kecil = pasti noise
const MAX_RECORD_MS     = 20000 // 20 detik maksimal recording sebagai failsafe
const THRESHOLD_MULTIPLIER = 1.5    // baseline * 1.5 = dynamic threshold
const BASELINE_SAMPLE_MS = 500      // ms untuk sample baseline noise

// Farewell detection
const FAREWELL_KEYWORDS = [
  'terima kasih', 'terimakasih', 'makasih', 'sampai jumpa',
  'sampai bertemu', 'selamat tinggal', 'dadah', 'bye', 'thanks', 'thank you'
]
const isFarewell = (text) =>
  FAREWELL_KEYWORDS.some(kw => text.toLowerCase().includes(kw))

export default function VoiceUI({ currentChat, onSend, onReceive, onNewChat, onReset, lang = 'id', setLang, theme = 'light' }) {
  const [mode, setMode]               = useState('speak')
  const [value, setValue]             = useState('')
  const [focused, setFocused]         = useState(false)
  const [avatarState, setAvatarState] = useState('idle')
  const [micDenied, setMicDenied]     = useState(false)
  const [activated, setActivated]     = useState(false) // user harus tap dulu untuk unlock audio
  const [faceDetected, setFaceDetected] = useState(false)
  const [isWaitingAI, setIsWaitingAI] = useState(false)   // loading bubble saat menunggu AI
  const [latestSelaId, setLatestSelaId] = useState(null)  // id pesan SELA terbaru → typewriter
  const [langSelected, setLangSelected] = useState(false)
  const [awaitingLangSelect, setAwaitingLangSelect] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const messagesEndRef  = useRef(null)
  const chatScrollRef   = useRef(null)

  // Refs — tidak pernah stale di dalam callback/closure
  const isListeningRef  = useRef(false)  // mic sedang merekam
  const isProcessingRef = useRef(false)  // sedang transcribe / chat / TTS
  const streamRef       = useRef(null)
  const audioCtxRef     = useRef(null)
  const analyserRef     = useRef(null)
  const recorderRef     = useRef(null)
  const vadFrameRef     = useRef(null)
  const silenceStartRef = useRef(null)
  const hasSpeechRef    = useRef(false)
  const speechStartRef  = useRef(null)
  const modeRef         = useRef(mode)
  const dynamicThresholdRef = useRef(10)  // fallback fallback jika baseline gagal

  // Face detection refs
  const audioUnlockedRef = useRef(false)  // true setelah tap pertama, tidak pernah reset
  const activatedRef     = useRef(false)  // sync dengan activated state
  const videoRef         = useRef(null)
  const videoStreamRef   = useRef(null)
  const faceDetectorRef  = useRef(null)
  const faceFrameRef     = useRef(null)
  const lastFaceTimeRef  = useRef(0)
  const lastDetectRef    = useRef(0)      // throttle detection ke ~500ms

  // Sinkronkan refs dengan state
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { activatedRef.current = activated }, [activated])

  // Kiosk mode — jika URL mengandung ?kiosk=1, langsung unlock audio tanpa tap
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('kiosk') === '1') {
      audioUnlockedRef.current = true
      console.log('[SELA] Kiosk mode aktif — audio auto-unlocked, menunggu wajah...')
    }
  }, [])

  // Re-attach camera stream ke video element setiap kali overlay muncul
  // (video element di-unmount saat activated=true, jadi stream hilang)
  useEffect(() => {
    if (!activated && videoRef.current && videoStreamRef.current) {
      videoRef.current.srcObject = videoStreamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [activated])

  // Auto scroll — hanya kalau user sudah di bawah
  useEffect(() => {
    if (isAtBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentChat?.messages]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChatScroll = (e) => {
    const el = e.currentTarget
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
  }

  // Track ID pesan SELA terbaru → untuk typewriter effect
  useEffect(() => {
    const msgs = currentChat?.messages ?? []
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      setLatestSelaId(last.id)
    }
  }, [currentChat?.messages?.length])

  // ── autoActivate ref (untuk dibaca dari closure detection loop) ─
  const autoActivateRef = useRef(null)
  autoActivateRef.current = () => {
    if (activatedRef.current || isProcessingRef.current) return
    activatedRef.current = true
    isProcessingRef.current = true
    setActivated(true)
    setLangSelected(false)
    setAvatarState('speaking')

    // Sapa dalam Bahasa Indonesia dulu
    const greetID = 'Halo! Selamat datang di UCIC. Saya SELA.'
    const askID   = 'Mau bicara dalam Bahasa Indonesia atau Bahasa Inggris?'
    const greetEN = "Hello! Welcome to UCIC. I'm SELA."
    const askEN   = 'Would you like to speak in Indonesian or English?'

    speakText(greetID, null, () => {
      // Lalu sapa dalam Bahasa Inggris
      speakText(greetEN, null, () => {
        // Tanya dalam Bahasa Indonesia
        speakText(askID, null, () => {
          // Tanya lagi dalam Bahasa Inggris
          speakText(askEN, null, () => {
            isProcessingRef.current = false
            setAvatarState('idle')
            // Tampilkan tombol pilihan bahasa
          }, 'en')
        }, 'id')
      }, 'en')
    }, 'id')
  }

  // ── Face detection (kamera) ───────────────────────────────────
  useEffect(() => {
    let destroyed = false

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (destroyed) { stream.getTracks().forEach(t => t.stop()); return }
        videoStreamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
      } catch (e) {
        console.warn('[SELA Cam] Kamera tidak tersedia:', e.message)
      }
    }

    const initDetector = async () => {
      try {
        const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        )
        if (destroyed) return
        faceDetectorRef.current = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        })
        startDetectionLoop()
      } catch (e) {
        console.warn('[SELA Cam] Face detector gagal load:', e.message)
      }
    }

    const startDetectionLoop = () => {
      const loop = () => {
        faceFrameRef.current = requestAnimationFrame(loop)
        if (!faceDetectorRef.current || !videoRef.current || videoRef.current.readyState < 2) return

        // Throttle: jalankan detection setiap ~500ms
        const now = Date.now()
        if (now - lastDetectRef.current < 500) return
        lastDetectRef.current = now

        try {
          const result = faceDetectorRef.current.detectForVideo(videoRef.current, now)
          const hasFace = result.detections.length > 0

          // Cek apakah wajah menghadap kamera (bukan miring/membelakangi)
          // PENTING: keypoints pakai koordinat normalized (0-1),
          //          box.width/height pakai piksel → harus dinormalisasi dulu
          const vidW = videoRef.current.videoWidth  || 640
          const vidH = videoRef.current.videoHeight || 480
          const facingCamera = result.detections.some(det => {
            const kps = det.keypoints
            const box = det.boundingBox
            if (!kps || kps.length < 3 || !box) return false
            const eye0 = kps[0], eye1 = kps[1], nose = kps[2]
            const eyeDist      = Math.abs(eye0.x - eye1.x)           // normalized
            const boxWidthNorm = box.width / vidW                     // piksel → normalized
            // Jarak mata harus > 25% lebar wajah (kalau miring, mata lebih dekat)
            if (boxWidthNorm > 0 && eyeDist / boxWidthNorm < 0.25) return false
            // Hidung harus di tengah antara 2 mata (toleransi ±35%)
            const midEyeX  = (eye0.x + eye1.x) / 2
            if (eyeDist > 0 && Math.abs(nose.x - midEyeX) / eyeDist > 0.35) return false
            return true
          })

          if (hasFace && facingCamera) {
            lastFaceTimeRef.current = now
            setFaceDetected(prev => { if (!prev) console.log('[SELA Cam] Wajah menghadap kamera'); return true })
            if (audioUnlockedRef.current && !activatedRef.current && !isProcessingRef.current) {
              console.log('[SELA Cam] Auto-activate!')
              autoActivateRef.current()
            }
          } else {
            // Wajah ada tapi miring, atau tidak ada wajah
            if (!hasFace && now - lastFaceTimeRef.current > 3000) {
              setFaceDetected(prev => { if (prev) console.log('[SELA Cam] Wajah hilang'); return false })
            } else if (hasFace && !facingCamera) {
              // Wajah ada tapi tidak menghadap — reset timer supaya tidak auto-greet
              lastFaceTimeRef.current = 0
              setFaceDetected(prev => { if (prev) console.log('[SELA Cam] Wajah miring, skip'); return false })
            }
          }
        } catch (_) { /* frame skip */ }
      }
      faceFrameRef.current = requestAnimationFrame(loop)
    }

    startCamera()
    initDetector()

    return () => {
      destroyed = true
      cancelAnimationFrame(faceFrameRef.current)
      videoStreamRef.current?.getTracks().forEach(t => t.stop())
      videoStreamRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop & cleanup ────────────────────────────────────────────
  const stopListening = () => {
    isListeningRef.current = false
    cancelAnimationFrame(vadFrameRef.current)
    if (recorderRef.current?.state !== 'inactive') {
      recorderRef.current?.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    analyserRef.current = null
    silenceStartRef.current = null
    hasSpeechRef.current = false
    speechStartRef.current = null
  }

  // ── Start auto-listen ─────────────────────────────────────────
  // Pakai fungsi biasa (bukan useCallback) yang disimpan di ref,
  // supaya pemanggil di dalam closure selalu dapat versi terbaru.
  const startListeningRef = useRef(null)
  startListeningRef.current = async () => {
    // Cek via ref — tidak pernah stale
    if (isListeningRef.current || isProcessingRef.current) return
    if (modeRef.current !== 'speak') return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setMicDenied(false)
      isListeningRef.current = true

      // AudioContext + Analyser untuk VAD
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      analyserRef.current = analyser

      // MediaRecorder
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      let chunks = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.onstop = () => {
        const speechDuration = speechStartRef.current ? Date.now() - speechStartRef.current : 0
        const audioBlob = new Blob(chunks, { type: 'audio/webm' })
        const hadSpeech = hasSpeechRef.current
        console.log('[SELA] recorder.onstop | hadSpeech:', hadSpeech, '| speechDuration:', speechDuration, 'ms | blobSize:', audioBlob.size)
        stopListening()

        if (!hadSpeech || speechDuration < MIN_SPEECH_MS || audioBlob.size < MIN_BLOB_SIZE) {
          console.log('[SELA] Skip — noise/pendek/kecil:', { hadSpeech, speechDuration, blobSize: audioBlob.size })
          setAvatarState('idle')
          setTimeout(() => startListeningRef.current?.(), 300)
          return
        }

        // Ada suara valid → proses
        console.log('[SELA] Ada suara valid, mulai processing...')
        processAudioRef.current(audioBlob)
      }

      recorder.start(100)
      setAvatarState('listening')

      // Failsafe: force stop setelah MAX_RECORD_MS
      const maxTimer = setTimeout(() => {
        if (recorderRef.current?.state !== 'inactive') recorderRef.current.stop()
      }, MAX_RECORD_MS)

      // ── Baseline sampling phase (500ms) ────────────────────
      const data = new Uint8Array(analyser.fftSize)
      let baselineRmsValues = []
      let baselinePhaseComplete = false

      const baselineCheck = () => {
        if (!isListeningRef.current) return

        analyser.getByteTimeDomainData(data)
        const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) * (v - 128), 0) / data.length)
        baselineRmsValues.push(rms)

        if (baselineRmsValues.length < 30) {
          // Masih sampling (300ms = 30 frame @ ~100ms per frame)
          vadFrameRef.current = requestAnimationFrame(baselineCheck)
        } else {
          // Baseline complete
          baselinePhaseComplete = true
          const avgBaseline = baselineRmsValues.reduce((a, b) => a + b, 0) / baselineRmsValues.length
          dynamicThresholdRef.current = avgBaseline * THRESHOLD_MULTIPLIER
          console.log('[SELA VAD] Baseline:', avgBaseline.toFixed(2), '→ Dynamic Threshold:', dynamicThresholdRef.current.toFixed(2))
          startActualVAD()
        }
      }

      // Start baseline sampling
      vadFrameRef.current = requestAnimationFrame(baselineCheck)

      // ── Actual VAD loop ────────────────────────────────────
      const startActualVAD = () => {
        let logThrottle = 0
        const checkSilence = () => {
          if (!isListeningRef.current) { clearTimeout(maxTimer); return }
          analyser.getByteTimeDomainData(data)
          // Nilai time-domain: 128 = silence, deviation dari 128 = ada suara
          const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) * (v - 128), 0) / data.length)

          // Log RMS setiap ~500ms supaya bisa debug threshold
          logThrottle++
          if (logThrottle % 30 === 0) console.log('[SELA VAD] RMS:', rms.toFixed(2), '| threshold:', dynamicThresholdRef.current.toFixed(2), '| hasSpeech:', hasSpeechRef.current)

          if (rms > dynamicThresholdRef.current) {
            if (!hasSpeechRef.current) {
              hasSpeechRef.current = true
              speechStartRef.current = Date.now()
              console.log('[SELA VAD] Speech detected! RMS:', rms.toFixed(2))
            }
            silenceStartRef.current = null
          } else if (hasSpeechRef.current) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = Date.now()
            } else if (Date.now() - silenceStartRef.current > SILENCE_DURATION) {
              // Diam cukup lama → stop otomatis
              clearTimeout(maxTimer)
              if (recorderRef.current?.state !== 'inactive') {
                recorderRef.current.stop()
              }
              return
            }
          }
          vadFrameRef.current = requestAnimationFrame(checkSilence)
        }
        vadFrameRef.current = requestAnimationFrame(checkSilence)
      }

    } catch (err) {
      console.error('Mic error:', err)
      setMicDenied(true)
      setAvatarState('idle')
      isListeningRef.current = false
    }
  }

  // ── Process audio → transcribe → AI → TTS ────────────────────
  // Juga disimpan di ref supaya startListening bisa memanggilnya
  const processAudioRef = useRef(null)
  processAudioRef.current = async (audioBlob) => {
    isProcessingRef.current = true
    setAvatarState('thinking')
    try {
      const text = await transcribeAudio(audioBlob, lang)
      if (!text?.trim()) {
        isProcessingRef.current = false
        setAvatarState('idle')
        setTimeout(() => startListeningRef.current?.(), 300)
        return
      }

      if (isFarewell(text)) { handleFarewell(text); return }

      onSend(text)
      setIsWaitingAI(true)

      const history = (currentChat?.messages || []).map(m => ({ role: m.role, content: m.text }))
      history.push({ role: 'user', content: text })
      const { text: aiResponse, detectedLang } = await getChatCompletion(history, lang)
      setIsWaitingAI(false)
      if (onReceive) onReceive(aiResponse)

      setAvatarState('speaking')

      // Fallback: kalau TTS onEnd tidak pernah terpanggil (bug Chrome),
      // paksa restart listen setelah estimasi durasi + buffer
      const estDuration = Math.max(3000, aiResponse.length * 80)
      const ttsFallback = setTimeout(() => {
        if (isProcessingRef.current) {
          console.warn('[SELA] TTS onEnd timeout — force restart listen')
          window.speechSynthesis?.cancel()
          setAvatarState('idle')
          isProcessingRef.current = false
          setTimeout(() => startListeningRef.current?.(), 800)
        }
      }, estDuration + 2000)

      speakText(
        aiResponse,
        () => setAvatarState('speaking'),
        () => {
          clearTimeout(ttsFallback)
          setAvatarState('idle')
          isProcessingRef.current = false
          // Delay 800ms — beri waktu speaker selesai bergema sebelum mic aktif lagi
          setTimeout(() => startListeningRef.current?.(), 800)
        },
        detectedLang || lang
      )
    } catch (error) {
      console.error(error)
      setIsWaitingAI(false)
      if (onReceive) onReceive(t[lang].error_stt)
      setAvatarState('idle')
      isProcessingRef.current = false
      setTimeout(() => startListeningRef.current?.(), 1500)
    }
  }

  // ── Auto-start saat mode speak DAN sudah diaktivasi ──────────
  useEffect(() => {
    if (mode !== 'speak' || !activated) {
      stopListening()
      window.speechSynthesis?.cancel()
      setAvatarState('idle')
      isProcessingRef.current = false
      return
    }
    const timer = setTimeout(() => startListeningRef.current?.(), 200)
    return () => {
      clearTimeout(timer)
      stopListening()
      window.speechSynthesis?.cancel()
      isProcessingRef.current = false
    }
  }, [mode, activated])

  // ── Farewell handler ──────────────────────────────────────────
  const handleFarewell = (userText) => {
    onSend(userText)
    stopListening()
    window.speechSynthesis?.cancel()
    isProcessingRef.current = true
    setAvatarState('speaking')

    const msg = lang === 'id'
      ? 'Sama-sama! Senang bisa membantu. Selamat datang kembali kapan saja ya!'
      : "You're welcome! Happy to help. Feel free to come back anytime!"

    if (onReceive) onReceive(msg)

    // Fallback jika TTS onEnd tidak terpanggil (Chrome bug)
    const farewellFallback = setTimeout(() => {
      isProcessingRef.current = false
      activatedRef.current = false
      setAvatarState('idle')
      setActivated(false)
      if (onReset) onReset()
    }, 6000)

    speakText(msg, null, () => {
      clearTimeout(farewellFallback)
      isProcessingRef.current = false
      activatedRef.current = false
      setAvatarState('idle')
      setActivated(false)
      setLangSelected(false)
      setAwaitingLangSelect(false)
      if (onReset) onReset()
    }, lang)
  }

  // ── Type mode ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!value.trim()) return
    const userText = value.trim()
    setValue('')
    setIsAtBottom(true)
    if (isFarewell(userText)) { handleFarewell(userText); return }
    onSend(userText)

    // Pesan pertama & bahasa belum dipilih → tampilkan bilingual greeting
    if (!langSelected && (currentChat?.messages ?? []).length === 0) {
      const greetID = 'Hai, apa yang bisa SELA bantu hari ini, nih?'
      const greetEN = 'Hello! How can I help you today?'
      const askID   = 'Mau bicara dalam Bahasa Indonesia atau Bahasa Inggris?'
      const askEN   = 'Would you like to speak in Indonesian or English?'
      const combined = `${greetID}\n\n${greetEN}\n\n${askID}\n\n${askEN}`
      if (onReceive) onReceive(combined)
      setAvatarState('speaking')
      setAwaitingLangSelect(true)
      speakText(greetID, null, () =>
        speakText(greetEN, null, () =>
          speakText(askID, null, () =>
            speakText(askEN, null, () => setAvatarState('idle'), 'en')
          , 'id')
        , 'en')
      , 'id')
      return
    }

    setAvatarState('thinking')
    setIsWaitingAI(true)
    try {
      const history = (currentChat?.messages || []).map(m => ({ role: m.role, content: m.text }))
      history.push({ role: 'user', content: userText })
      const { text: aiResponse, detectedLang } = await getChatCompletion(history, lang)
      setIsWaitingAI(false)
      if (onReceive) onReceive(aiResponse)
      setAvatarState('speaking')
      speakText(aiResponse, null, () => setAvatarState('idle'), detectedLang || lang)
    } catch {
      setIsWaitingAI(false)
      if (onReceive) onReceive(t[lang].error_network)
      setAvatarState('idle')
    }
  }

  // ── Pilih bahasa saat greeting ────────────────────────────────
  const handleLangSelect = (chosen) => {
    if (setLang) setLang(chosen)
    setLangSelected(true)
    setAwaitingLangSelect(false)
    window.speechSynthesis?.cancel()
    isProcessingRef.current = false
    const langLabel = chosen === 'id' ? '🇮🇩 Bahasa Indonesia' : '🇬🇧 English'
    const confirm = chosen === 'id'
      ? 'Oke! Kita ngobrol dalam Bahasa Indonesia ya. Ada yang bisa SELA bantu?'
      : "Great! Let's chat in English. How can I help you?"
    if (mode === 'type') {
      onSend(langLabel)
      if (onReceive) onReceive(confirm)
    }
    setAvatarState('speaking')
    speakText(confirm, null, () => {
      setAvatarState('idle')
      startListeningRef.current?.()
    }, chosen)
  }

  // ── Mode Toggle ───────────────────────────────────────────────
  const ModeToggle = () => (
    <div className="flex justify-center">
      <div className="inline-flex items-center bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm border border-gray-100/80 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden transition-colors">
        <button
          id="mode-type-btn"
          onClick={() => setMode('type')}
          className={`flex flex-col items-center gap-1 px-8 py-2.5 transition-all duration-200
            ${mode === 'type' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
        >
          <IconKeyboard />
          <span className="text-[10px] font-bold uppercase tracking-widest">{t[lang].type_mode}</span>
        </button>
        <div className="w-px h-8 bg-gray-200 dark:bg-white/10" />
        <button
          id="mode-speak-btn"
          onClick={() => setMode('speak')}
          className={`flex flex-col items-center gap-1 px-8 py-2.5 transition-all duration-200
            ${mode === 'speak' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
        >
          <IconMicToggle />
          <span className="text-[10px] font-bold uppercase tracking-widest">{t[lang].speak_mode}</span>
        </button>
      </div>
    </div>
  )

  const statusLabel = () => {
    if (micDenied) return lang === 'id' ? 'Izin mikrofon ditolak' : 'Microphone permission denied'
    switch (avatarState) {
      case 'listening': return t[lang].listening
      case 'thinking':  return lang === 'id' ? 'Sedang berpikir...' : 'Thinking...'
      case 'speaking':  return lang === 'id' ? 'SELA sedang bicara...' : 'SELA is speaking...'
      default:          return lang === 'id' ? 'Siap mendengarkan' : 'Ready to listen'
    }
  }

  const messages = currentChat?.messages ?? []

  // ── Activation handler ───────────────────────────────────────
  const handleActivate = () => {
    // Unlock Chrome audio policy dengan silent utterance
    const unlock = new SpeechSynthesisUtterance('')
    unlock.volume = 0
    window.speechSynthesis.speak(unlock)
    audioUnlockedRef.current = true  // permanen selama halaman terbuka
    setActivated(true)
  }

  // ── SPEAK MODE ────────────────────────────────────────────────
  if (mode === 'speak') {
    const latestMsg = messages[messages.length - 1]

    // Overlay sebelum aktivasi — kamera preview + face detection status
    if (!activated) {
      return (
        <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">

          {/* Kamera preview — tampilkan sebagai lingkaran di belakang tombol */}
          <div className="relative flex flex-col items-center gap-6">

            {/* Preview kamera dengan border warna berdasarkan deteksi */}
            <div className={`relative w-44 h-44 rounded-full overflow-hidden border-4 transition-all duration-500 shadow-2xl
              ${faceDetected
                ? 'border-emerald-400 shadow-emerald-300/50'
                : 'border-blue-300/50 shadow-blue-200/30'
              }`}
            >
              <video
                ref={videoRef}
                className="w-full h-full object-cover scale-x-[-1]"
                muted
                playsInline
                autoPlay
              />
              {/* Overlay gelap + icon saat tidak ada wajah */}
              {!faceDetected && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <IconMic size="lg" />
                </div>
              )}
              {/* Pulse saat wajah terdeteksi */}
              {faceDetected && (
                <div className="absolute inset-0 rounded-full ring-4 ring-emerald-400 animate-ping opacity-30" />
              )}
            </div>

            {/* Tombol tap — hanya untuk unlock audio pertama kali */}
            <button
              onClick={handleActivate}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                  {faceDetected
                    ? (lang === 'id' ? 'Ketuk untuk aktifkan suara' : 'Tap to enable voice')
                    : (lang === 'id' ? 'Ketuk untuk memulai' : 'Tap to start')
                  }
                </p>
                <p className="text-sm mt-1 transition-colors duration-300
                  ${faceDetected ? 'text-emerald-500' : 'text-gray-400 dark:text-gray-500'}">
                  {faceDetected
                    ? (lang === 'id' ? '✓ Wajah terdeteksi — SELA siap menyapa!' : '✓ Face detected — SELA ready to greet!')
                    : (lang === 'id' ? 'SELA siap menyambut Anda' : 'SELA is ready to greet you')
                  }
                </p>
              </div>
            </button>
          </div>

          <div className="absolute bottom-8">
            <ModeToggle />
          </div>
        </main>
      )
    }

    return (
      <main className="flex-1 relative flex flex-col overflow-hidden">

        {/* Mobile caption overlay */}
        {latestMsg && (
          <div className="absolute top-4 left-4 right-4 z-20 flex md:hidden animate-fade-in pointer-events-none">
            <div className={`w-full px-5 py-4 rounded-3xl backdrop-blur-md border shadow-xl transition-colors
              ${latestMsg.role === 'user'
                ? 'bg-blue-50/60 dark:bg-blue-900/40 border-blue-200/50 dark:border-blue-800/50'
                : 'bg-white/60 dark:bg-slate-900/60 border-gray-100/50 dark:border-white/10'
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1 opacity-50 text-gray-500 dark:text-gray-400">
                {latestMsg.role === 'user' ? t[lang].you : t[lang].sela}
              </p>
              <p className="text-sm font-medium leading-relaxed text-gray-800 dark:text-gray-100">
                {latestMsg.text}
              </p>
            </div>
          </div>
        )}

        {/* Avatar centered */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pb-20 pointer-events-none">
          <div className="pointer-events-auto">
            <AvatarPlaceholder state={avatarState} />
          </div>
        </div>

        {/* Chat bubbles — desktop only */}
        <div className="absolute top-0 right-0 bottom-36 w-[340px] hidden md:flex flex-col justify-end pr-8 pb-6 pt-4 pointer-events-auto z-10 transition-colors overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 pb-4 opacity-50">
              <IconSparkle />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic tracking-widest">SELA AI</p>
            </div>
          ) : (
            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              className="flex flex-col gap-1 overflow-y-auto"
            >
              {messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  role={msg.role}
                  text={msg.text}
                  lang={lang}
                  isNew={msg.role === 'assistant' && msg.id === latestSelaId}
                />
              ))}
              {isWaitingAI && <ChatBubble role="assistant" text="" lang={lang} isLoading />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        {/* Tombol scroll ke bawah — voice mode, di atas panel chat */}
        {!isAtBottom && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-40 right-[155px] z-30 w-8 h-8 rounded-full hidden md:flex
              bg-white/90 dark:bg-slate-800/90 border border-gray-200/70 dark:border-white/10
              shadow-lg items-center justify-center text-gray-500 dark:text-gray-300
              hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all duration-150 animate-fade-in"
          >
            <IconChevronDown />
          </button>
        )}

        <div className="flex-1 pointer-events-none" />

        {/* Status indicator + mode toggle */}
        <div className="flex flex-col items-center gap-4 pb-8 pt-2 relative z-20 pointer-events-auto">

          {/* Visual indicator — warna berubah sesuai state, tidak perlu diklik */}
          <div className={`relative w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300
            ${avatarState === 'listening'
              ? 'bg-gradient-to-br from-red-400 to-red-500 shadow-red-300/50 dark:shadow-red-900/30'
              : avatarState === 'speaking'
              ? 'bg-gradient-to-br from-emerald-400 to-emerald-500 shadow-emerald-300/50'
              : avatarState === 'thinking'
              ? 'bg-gradient-to-br from-amber-400 to-amber-500 shadow-amber-300/50'
              : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-400/50 dark:shadow-blue-900/40'
            }`}
          >
            {avatarState === 'listening' && (
              <span className="absolute inset-0 rounded-full animate-ping opacity-30 bg-red-400" />
            )}
            {avatarState === 'speaking' && (
              <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-emerald-400" />
            )}
            <IconMic size="lg" />
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 font-bold uppercase tracking-tighter -mt-1">
            {statusLabel()}
          </p>

          {micDenied && (
            <button
              onClick={() => { setMicDenied(false); startListeningRef.current?.() }}
              className="text-xs text-blue-500 underline"
            >
              {lang === 'id' ? 'Coba lagi' : 'Retry'}
            </button>
          )}

          {/* Tombol pilihan bahasa — muncul setelah greeting bilingual selesai */}
          {activated && !langSelected && avatarState === 'idle' && (
            <div className="flex gap-3 animate-fade-in">
              <button
                onClick={() => handleLangSelect('id')}
                className="px-5 py-2 rounded-2xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 active:scale-95 text-white shadow-md transition-all duration-150"
              >
                🇮🇩 Indonesia
              </button>
              <button
                onClick={() => handleLangSelect('en')}
                className="px-5 py-2 rounded-2xl text-sm font-semibold bg-white hover:bg-gray-50 active:scale-95 text-gray-700 border border-gray-200 shadow-md dark:bg-slate-700 dark:text-gray-100 dark:border-slate-600 transition-all duration-150"
              >
                🇬🇧 English
              </button>
            </div>
          )}

          <ModeToggle />
        </div>

      </main>
    )
  }

  // ── TYPE MODE ─────────────────────────────────────────────────
  return (
    <main className="flex-1 relative flex flex-col overflow-hidden px-4 pt-4 pb-8 transition-colors">
      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 pb-8">
            <IconSparkle />
            <div>
              <h2 className="text-4xl font-light text-gray-600 dark:text-gray-200 tracking-tighter italic">SELA</h2>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 font-medium">{t[lang].type_message}</p>
            </div>
          </div>
        ) : (
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className="flex-1 overflow-y-auto py-4 flex flex-col gap-1"
          >
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                role={msg.role}
                text={msg.text}
                lang={lang}
                isNew={msg.role === 'assistant' && msg.id === latestSelaId}
              />
            ))}
            {isWaitingAI && <ChatBubble role="assistant" text="" lang={lang} isLoading />}
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
              onClick={() => handleLangSelect('id')}
              className="px-5 py-2 rounded-2xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 active:scale-95 text-white shadow-md transition-all duration-150"
            >
              🇮🇩 Indonesia
            </button>
            <button
              onClick={() => handleLangSelect('en')}
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
                        ${focused
                          ? 'border-blue-300 dark:border-blue-500 ring-4 ring-blue-100/60 dark:ring-blue-900/40 shadow-blue-100/60'
                          : 'border-gray-200/70 dark:border-white/10'
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
  )
}
