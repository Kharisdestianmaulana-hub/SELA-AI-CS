import { useState, useEffect, useRef } from 'react'
import { t } from '../lib/translations'

export default function ChatBubble({ role, text, lang = 'id', isLoading = false, isNew = false }) {
  const isUser = role === 'user'
  const [displayed, setDisplayed] = useState(isNew ? '' : text)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!isNew || !text) {
      setDisplayed(text)
      return
    }

    setDisplayed('')
    let i = 0
    intervalRef.current = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(intervalRef.current)
    }, 18) // ~55 karakter/detik — natural typing speed

    return () => clearInterval(intervalRef.current)
  }, [text, isNew])

  return (
    <div className={`animate-fade-in flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-3`}>
      <span className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${isUser ? 'text-blue-400' : 'text-gray-400'}`}>
        {isUser ? t[lang].you : t[lang].sela}
      </span>
      <div
        className={`max-w-[320px] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm transition-colors
          ${isUser
            ? 'bg-blue-50/90 dark:bg-blue-900/40 text-gray-700 dark:text-blue-100 rounded-tr-sm border border-blue-100/60 dark:border-blue-800/50'
            : 'bg-white/90 dark:bg-slate-800/90 text-gray-600 dark:text-gray-200 rounded-tl-sm border border-gray-100/80 dark:border-white/5'
          }`}
      >
        {isLoading ? (
          // Animasi 3 titik bergerak (thinking/loading indicator)
          <span className="flex gap-1.5 items-center h-4 px-1">
            <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" />
          </span>
        ) : (
          displayed
        )}
      </div>
    </div>
  )
}
