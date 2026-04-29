/* eslint-disable react/prop-types */
import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { t } from '../lib/translations'

const URL_PATTERN = /(https?:\/\/[^\s]+)/g
const TRAILING_PUNCTUATION = /[.,!?;:)\]]$/
const SELA_ALIASES = new Set(['cela', 'sela', 'zela', 'selah', 'sella'])

function isSelaAlias(word) {
  return SELA_ALIASES.has(word.toLowerCase())
}

function normalizeSelaAliases(text = '') {
  return text.replace(/[A-Za-z]+/g, word => (
    isSelaAlias(word) ? 'Sela' : word
  ))
}

function splitTextByLinks(text = '') {
  const parts = []
  let lastIndex = 0

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0]
    const start = match.index
    let url = rawUrl
    let trailing = ''

    while (TRAILING_PUNCTUATION.test(url)) {
      trailing = url.slice(-1) + trailing
      url = url.slice(0, -1)
    }

    if (start > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, start) })
    }

    if (url) {
      parts.push({ type: 'qr', value: url })
    }

    if (trailing) {
      parts.push({ type: 'text', value: trailing })
    }

    lastIndex = start + rawUrl.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return parts
}

function QrLinkCard({ url }) {
  const [qrSrc, setQrSrc] = useState('')

  useEffect(() => {
    let active = true

    QRCode.toDataURL(url, {
      width: 132,
      margin: 1,
      color: {
        dark: '#111827',
        light: '#ffffff'
      }
    }).then(src => {
      if (active) setQrSrc(src)
    }).catch(() => {
      if (active) setQrSrc('')
    })

    return () => {
      active = false
    }
  }, [url])

  return (
    <span className="my-2 flex w-fit max-w-full flex-col items-center gap-1 rounded-xl border border-gray-200/80 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
      {qrSrc ? (
        <img
          src={qrSrc}
          alt="QR code untuk link"
          className="h-28 w-28 rounded-md"
          loading="lazy"
        />
      ) : (
        <span className="flex h-28 w-28 items-center justify-center rounded-md bg-gray-100 text-[10px] font-medium text-gray-400 dark:bg-slate-800 dark:text-gray-500">
          QR
        </span>
      )}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Scan QR
      </span>
    </span>
  )
}

function ChatContent({ text }) {
  const parts = splitTextByLinks(text)

  if (!parts.some(part => part.type === 'qr')) return normalizeSelaAliases(text)

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, index) => (
        part.type === 'qr' ? (
          <QrLinkCard key={`${part.value}-${index}`} url={part.value} />
        ) : (
          <span key={`${part.value}-${index}`}>{normalizeSelaAliases(part.value)}</span>
        )
      ))}
    </span>
  )
}

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
          <ChatContent text={displayed} />
        )}
      </div>
    </div>
  )
}
