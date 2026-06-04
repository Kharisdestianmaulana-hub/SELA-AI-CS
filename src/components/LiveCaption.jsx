/* eslint-disable react/prop-types */
import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const TRAILING_PUNCTUATION = /[.,!?;:)\]]$/;
const QR_VISIBLE_MS = 20000;
const CAPTION_MAX_LINES = 3;
const CAPTION_WORD_INTERVAL_MS = 340;
const BOUNDARY_FALLBACK_DELAY_MS = 400;

function getCleanUrl(rawUrl) {
  let url = rawUrl;

  while (TRAILING_PUNCTUATION.test(url)) {
    url = url.slice(0, -1);
  }

  return url;
}

function extractLinks(text = "") {
  return Array.from(text.matchAll(URL_PATTERN))
    .map((match) => getCleanUrl(match[0]))
    .filter(Boolean);
}

function removeLinks(text = "") {
  return text.replace(URL_PATTERN, "").replace(/\s+/g, " ").trim();
}

function getLineHeightPx(element) {
  if (!element) return 18;
  const styles = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;

  const fontSize = Number.parseFloat(styles.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.25 : 18;
}

function getVerticalPaddingPx(element) {
  if (!element) return 0;
  const styles = window.getComputedStyle(element);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  return paddingTop + paddingBottom;
}

function buildPagedCaption(words = [], measureElement = null) {
  if (words.length === 0) return "";
  if (!measureElement) return words.join(" ");

  const maxHeight =
    getLineHeightPx(measureElement) * CAPTION_MAX_LINES +
    getVerticalPaddingPx(measureElement) +
    1;
  let currentPage = [];

  for (const word of words) {
    const candidatePage = [...currentPage, word];
    measureElement.textContent = candidatePage.join(" ");

    if (measureElement.scrollHeight <= maxHeight || currentPage.length === 0) {
      currentPage = candidatePage;
    } else {
      currentPage = [word];
      measureElement.textContent = word;
    }
  }

  measureElement.textContent = "";
  return currentPage.join(" ");
}

function expandToCurrentWord(text = "", charIndex = 0) {
  if (!text) return "";
  const safeIndex = Math.max(0, Math.min(charIndex, text.length - 1));
  const nextSpace = text.slice(safeIndex).search(/\s/);
  const endIndex =
    nextSpace === -1
      ? text.length
      : Math.min(text.length, safeIndex + nextSpace);

  return text.slice(0, endIndex).trim();
}

function TimedQrCard({ url }) {
  const [qrSrc, setQrSrc] = useState("");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(url, {
      width: 160,
      margin: 1,
      color: {
        dark: "#111827",
        light: "#ffffff",
      },
    })
      .then((src) => {
        if (active) setQrSrc(src);
      })
      .catch(() => {
        if (active) setQrSrc("");
      });

    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    setIsVisible(true);
    const timeout = setTimeout(() => setIsVisible(false), QR_VISIBLE_MS);

    return () => clearTimeout(timeout);
  }, [url]);

  if (!isVisible) return null;

  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-white/20 bg-white p-2 shadow-lg">
      {qrSrc ? (
        <img
          src={qrSrc}
          alt="QR code untuk link"
          className="h-32 w-32 rounded-md"
          loading="lazy"
        />
      ) : (
        <div className="flex h-32 w-32 items-center justify-center rounded-md bg-gray-100 text-[10px] font-semibold text-gray-400">
          QR
        </div>
      )}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        Scan QR
      </span>
    </div>
  );
}

export default function LiveCaption({
  text,
  isLoading = false,
  avatarState = "idle",
  spokenCharIndex = null,
  wordIntervalMs = null,
  speechTimeline = null,
  links: providedLinks = [],
}) {
  const [displayedWords, setDisplayedWords] = useState([]);
  const [captionText, setCaptionText] = useState("");
  const [useTimerFallback, setUseTimerFallback] = useState(false);
  const wordIndexRef = useRef(0);
  const intervalRef = useRef(null);
  const fallbackTimeoutRef = useRef(null);
  const captionMeasureRef = useRef(null);

  // Reset saat text berubah
  useEffect(() => {
    wordIndexRef.current = 0;
    setDisplayedWords([]);
    setCaptionText("");
    setUseTimerFallback(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);

    if (!text || isLoading) return;

    if (spokenCharIndex !== null) {
      fallbackTimeoutRef.current = setTimeout(() => {
        setUseTimerFallback(true);
      }, BOUNDARY_FALLBACK_DELAY_MS);
    }

    return () => {
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!text || isLoading) return undefined;
    if (spokenCharIndex !== null && !useTimerFallback) return undefined;

    const captionSource = removeLinks(text);
    if (!captionSource) return undefined;

    const words = captionSource.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return undefined;

    if (intervalRef.current) clearInterval(intervalRef.current);
    const timelineInterval =
      speechTimeline?.durationMs && words.length > 0
        ? Math.round(speechTimeline.durationMs / words.length)
        : null;
    const interval = wordIntervalMs || timelineInterval || CAPTION_WORD_INTERVAL_MS;
    intervalRef.current = setInterval(() => {
      wordIndexRef.current++;
      if (wordIndexRef.current > words.length) {
        clearInterval(intervalRef.current);
        return;
      }
      setDisplayedWords(words.slice(0, wordIndexRef.current));
    }, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, isLoading, spokenCharIndex, useTimerFallback, wordIntervalMs, speechTimeline]);

  useEffect(() => {
    if (!text || isLoading || spokenCharIndex !== 0 || useTimerFallback) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setUseTimerFallback(true);
    }, BOUNDARY_FALLBACK_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [text, isLoading, spokenCharIndex, useTimerFallback]);

  useEffect(() => {
    if (spokenCharIndex === null || useTimerFallback || isLoading) return;

    if (fallbackTimeoutRef.current && spokenCharIndex > 0) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

    const captionSource = removeLinks(text);
    const spokenText = expandToCurrentWord(captionSource, spokenCharIndex);
    setDisplayedWords(spokenText.split(/\s+/).filter((w) => w.length > 0));
  }, [text, spokenCharIndex, useTimerFallback, isLoading]);

  useEffect(() => {
    setCaptionText(
      buildPagedCaption(displayedWords, captionMeasureRef.current),
    );
  }, [displayedWords]);

  useEffect(() => {
    const handleResize = () => {
      setCaptionText(
        buildPagedCaption(displayedWords, captionMeasureRef.current),
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [displayedWords]);

  // Hide saat bukan speaking mode
  if (avatarState !== "speaking") {
    return null;
  }

  const links = providedLinks.length > 0 ? providedLinks : extractLinks(text);

  return (
    <div className="w-full flex justify-center px-4 py-3 animate-fade-in">
      <div className="w-full max-w-md flex flex-col items-center gap-3">
        {links.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {links.map((item, index) => {
              const url = typeof item === "string" ? item : item.url;
              if (!url) return null;
              return <TimedQrCard key={`${url}-${index}`} url={url} />;
            })}
          </div>
        )}

        {isLoading ? (
          // Loading indicator — 3 animated dots
          <div className="flex gap-1.5 items-center justify-center h-6 px-1">
            <span className="w-2 h-2 rounded-full bg-white/70 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 rounded-full bg-white/70 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 rounded-full bg-white/70 animate-bounce" />
          </div>
        ) : captionText ? (
          // Live caption — YouTube-style subtitle
          <div className="relative w-full text-center">
            <p
              ref={captionMeasureRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute left-0 top-0 w-full text-center text-white text-sm font-medium leading-tight px-4 py-2"
            />
            <p
              className="w-full text-center text-white text-sm font-medium leading-tight 
              bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg
              max-h-[4.4rem] overflow-hidden"
            >
              {captionText}
            </p>
          </div>
        ) : null}

      </div>
    </div>
  );
}
