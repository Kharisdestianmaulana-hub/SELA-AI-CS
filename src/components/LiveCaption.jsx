import { useState, useEffect, useRef } from "react";
import { t } from "../lib/translations";

export default function LiveCaption({
  role,
  text,
  lang = "id",
  isLoading = false,
  avatarState = "idle",
}) {
  const [displayedWords, setDisplayedWords] = useState([]);
  const wordIndexRef = useRef(0);
  const intervalRef = useRef(null);

  // Reset saat text berubah
  useEffect(() => {
    wordIndexRef.current = 0;
    setDisplayedWords([]);

    if (!text || isLoading) return;

    // Split text jadi kata-kata
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return;

    // Tampilkan kata per kata dengan interval 150ms
    intervalRef.current = setInterval(() => {
      wordIndexRef.current++;
      if (wordIndexRef.current > words.length) {
        clearInterval(intervalRef.current);
        return;
      }
      setDisplayedWords(words.slice(0, wordIndexRef.current));
    }, 150);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, isLoading]);

  // Hide saat bukan speaking mode
  if (avatarState !== "speaking") {
    return null;
  }

  const captionText = displayedWords.join(" ");

  return (
    <div className="w-full max-sm flex justify-center px-4 py-3 animate-fade-in">
      <div className="max-w-sm">
        {isLoading ? (
          // Loading indicator — 3 animated dots
          <div className="flex gap-1.5 items-center justify-center h-6 px-1">
            <span className="w-2 h-2 rounded-full bg-white/70 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 rounded-full bg-white/70 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 rounded-full bg-white/70 animate-bounce" />
          </div>
        ) : (
          // Live caption — YouTube-style subtitle
          <div className="text-center">
            <p
              className="text-white text-sm font-medium leading-tight 
              bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg
              max-h-[3.5rem] overflow-hidden line-clamp-2"
            >
              {captionText}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
