/**
 * AvatarPlaceholder.jsx
 *
 * Placeholder sementara untuk 3D model SELA.
 * Nanti ganti komponen ini dengan <Canvas> + React Three Fiber
 * ketika model GLB sudah siap.
 *
 * Props:
 *   state: 'idle' | 'listening' | 'thinking' | 'speaking'
 */

const STATE_CONFIG = {
  idle: {
    label: 'Idle',
    color: 'from-blue-400/20 to-indigo-400/20',
    ring: 'ring-blue-300/40',
    dot: 'bg-blue-400',
    pulse: false,
    icon: (
      <svg className="w-16 h-16 text-blue-300" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  listening: {
    label: 'Listening',
    color: 'from-blue-500/25 to-cyan-400/20',
    ring: 'ring-blue-400/60',
    dot: 'bg-blue-500',
    pulse: true,
    icon: (
      <svg className="w-16 h-16 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm-1 18v3h2v-3a8.03 8.03 0 005.65-2.35l-1.41-1.41A6 6 0 0112 19a6 6 0 01-4.24-1.76L6.35 18.65A8.03 8.03 0 0011 21z" />
      </svg>
    ),
  },
  thinking: {
    label: 'Thinking',
    color: 'from-indigo-500/20 to-purple-400/20',
    ring: 'ring-indigo-400/50',
    dot: 'bg-indigo-500',
    pulse: true,
    icon: (
      <svg className="w-16 h-16 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.4} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  speaking: {
    label: 'Speaking',
    color: 'from-emerald-400/20 to-blue-400/20',
    ring: 'ring-emerald-400/50',
    dot: 'bg-emerald-400',
    pulse: true,
    icon: (
      <svg className="w-16 h-16 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={1.4} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
}

// Animated waveform bars shown when speaking
const WAVE_HEIGHTS = [20, 36, 48, 30, 44, 26, 40, 32, 24]
const WAVE_COLORS  = ['bg-blue-300','bg-blue-400','bg-blue-500','bg-indigo-400','bg-blue-400','bg-blue-300','bg-indigo-500','bg-blue-400','bg-blue-300']
const WAVE_ANIMS   = ['animate-wave-1','animate-wave-3','animate-wave-2','animate-wave-4','animate-wave-1','animate-wave-5','animate-wave-2','animate-wave-3','animate-wave-1']

export default function AvatarPlaceholder({ state = 'idle' }) {
  const cfg = STATE_CONFIG[state] ?? STATE_CONFIG.idle
  const isSpeaking = state === 'speaking'

  return (
    <div className="flex flex-col items-center justify-center h-full select-none">

      {/* Outer glow ring */}
      <div className={`relative flex items-center justify-center
                       w-56 h-56 rounded-full
                       ring-4 ${cfg.ring}
                       bg-gradient-to-br ${cfg.color}
                       backdrop-blur-xl shadow-2xl
                       transition-all duration-700`}
      >
        {/* Subtle inner circle */}
        <div className="absolute inset-4 rounded-full bg-white/30 backdrop-blur-md" />

        {/* Pulse ring (for active states) */}
        {cfg.pulse && (
          <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-blue-400" />
        )}

        {/* Avatar icon */}
        <div className="relative z-10 flex flex-col items-center gap-2">
          {cfg.icon}
        </div>
      </div>

      {/* Waveform — visible only when speaking */}
      <div className={`flex items-end justify-center gap-1 mt-5 h-10 transition-all duration-500 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`}>
        {WAVE_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className={`w-[4px] rounded-full ${WAVE_COLORS[i]} ${isSpeaking ? WAVE_ANIMS[i] : ''}`}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>

      {/* State label */}
      <div className="mt-4 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
        <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{cfg.label}</span>
      </div>

      {/* Placeholder note */}
      <p className="mt-2 text-[10px] text-gray-300 tracking-wide">3D Avatar • Coming Soon</p>
    </div>
  )
}
