#!/bin/bash
# ─────────────────────────────────────────────────────────────
# SELA Kiosk Launcher — jalankan semua sekaligus
# ─────────────────────────────────────────────────────────────

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
URL="http://localhost:5173?kiosk=1"

# 1. Matikan proses lama supaya pakai kode terbaru
echo "[SELA] Menghentikan proses lama..."
pkill -f "node.*server"    2>/dev/null
pkill -f "vite"            2>/dev/null
fuser -k 3001/tcp          2>/dev/null
fuser -k 5173/tcp          2>/dev/null
# Bersihkan profile kiosk lama agar Chrome selalu fresh (tidak join existing session)
rm -rf /tmp/sela-kiosk-profile
sleep 1

# 2. Jalankan backend
echo "[SELA] Menjalankan backend..."
node "$DIR/server/index.js" &
BACKEND_PID=$!

# 3. Jalankan frontend
echo "[SELA] Menjalankan frontend..."
npm --prefix "$DIR" run dev &
FRONTEND_PID=$!

# 4. Tunggu frontend siap
echo "[SELA] Menunggu frontend siap..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "[SELA] Frontend siap!"
    break
  fi
  sleep 1
done

# 5. Buka browser (Chrome kiosk jika tersedia, atau fallback ke default browser)
echo "[SELA] Membuka browser..."
if command -v google-chrome &> /dev/null; then
  # Linux: gunakan google-chrome dengan flags kiosk
  google-chrome \
    --kiosk \
    --user-data-dir=/tmp/sela-kiosk-profile \
    --autoplay-policy=no-user-gesture-required \
    --use-fake-ui-for-media-stream \
    --disable-infobars \
    --no-first-run \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --disable-translate \
    --start-fullscreen \
    "$URL"
elif command -v open &> /dev/null; then
  # macOS: gunakan open dengan Google Chrome jika ada
  if [ -d "/Applications/Google Chrome.app" ]; then
    open -a "Google Chrome" "$URL"
  else
    # Fallback ke default browser
    open "$URL"
  fi
else
  # Fallback ke xdg-open (Linux)
  xdg-open "$URL"
fi

# 6. Saat Chrome ditutup, matikan backend & frontend
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
