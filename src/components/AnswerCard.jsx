/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

const MODE_LABELS = {
  brief: "Info",
  list: "Ringkasan",
  steps: "Langkah",
  compare: "Perbandingan",
  recommend: "Rekomendasi",
  handoff: "Arahan",
};

function QrCard({ item }) {
  const url = typeof item === "string" ? item : item?.url;
  const label = typeof item === "string" ? "Link" : item?.label || "Link";
  const [qrSrc, setQrSrc] = useState("");

  useEffect(() => {
    if (!url) return undefined;
    let active = true;

    QRCode.toDataURL(url, {
      width: 144,
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

  if (!url) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/95 p-2 text-slate-900 shadow-lg">
      {qrSrc ? (
        <img
          src={qrSrc}
          alt={`QR code ${label}`}
          className="h-20 w-20 rounded-md"
          loading="lazy"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-md bg-slate-100 text-[10px] font-semibold text-slate-400">
          QR
        </div>
      )}
      <div className="min-w-0 text-left">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Scan QR
        </p>
        <p className="truncate text-xs font-semibold text-slate-900">
          {label}
        </p>
      </div>
    </div>
  );
}

export default function AnswerCard({ screen }) {
  const links = screen?.links || [];
  const items = screen?.items || [];

  if (!items.length && !links.length) return null;

  const label = MODE_LABELS[screen.mode] || "Ringkasan";

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-950/68 px-4 py-3 text-white shadow-2xl backdrop-blur-md animate-fade-in">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-200">
          {label}
        </p>
        {links.length > 0 && (
          <p className="text-[10px] font-medium text-white/60">
            QR aktif
          </p>
        )}
      </div>
      {screen.title && (
        <h3 className="mb-2 text-sm font-semibold leading-snug text-white">
          {screen.title}
        </h3>
      )}
      {links.length > 0 && (
        <div className="mb-3 grid gap-2">
          {links.slice(0, 2).map((item, index) => {
            const url = typeof item === "string" ? item : item?.url;
            return <QrCard key={`${url}-${index}`} item={item} />;
          })}
        </div>
      )}
      {items.length > 0 && (
        <ol className="space-y-1.5 text-left text-xs leading-snug text-white/88">
          {items.slice(0, 6).map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2">
              <span className="mt-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-400/90 text-[9px] font-bold text-slate-950">
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
