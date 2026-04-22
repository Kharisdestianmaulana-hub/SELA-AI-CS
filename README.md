# SELA

SELA adalah nama AI receptionist sekaligus customer service kampus berbasis suara untuk Universitas Catur Insan Cendekia (UCIC). Project ini dirancang untuk membantu pengunjung, calon mahasiswa, orang tua, dan mahasiswa mendapatkan informasi kampus secara cepat, singkat, dan terarah.

SELA berfokus pada informasi UCIC seperti PMB, biaya, jurusan, fasilitas, kontak kampus, dan FAQ layanan umum. Jawaban diambil dari knowledge base lokal `ucic_dataset.json` agar lebih terkontrol dan sesuai dengan kebutuhan kampus.

## Tujuan Project

- Menjadi front desk digital untuk layanan informasi kampus UCIC
- Membantu menjawab pertanyaan umum yang sering berulang
- Memberikan pengalaman interaksi berbasis suara yang lebih natural
- Menjaga jawaban tetap fokus pada scope customer service kampus

## Fitur Utama

- Voice-first interaction dengan Web Speech API
- Face detection untuk aktivasi interaksi saat pengguna mendekat
- Dukungan Bahasa Indonesia dan English
- Local RAG berbasis `ucic_dataset.json`
- Jawaban singkat bergaya customer service kampus
- Follow-up question suggestions
- Filter scope agar SELA tetap fokus pada informasi UCIC

## Scope SELA

### In Scope

- PMB dan pendaftaran mahasiswa baru
- Biaya kuliah dan opsi pembayaran
- Jurusan, fakultas, dan program studi
- Fasilitas kampus
- Lokasi dan kontak kampus
- Beasiswa umum
- FAQ informasi kampus

### Out of Scope

- Politik, hiburan umum, dan topik non-UCIC
- Jawaban umum di luar konteks kampus
- Data pribadi mahasiswa
- Keputusan administratif resmi yang harus ditangani unit kampus

Jika informasi tidak tersedia di dataset, SELA diarahkan untuk menjawab secara jujur tanpa mengarang.

## Arsitektur Singkat

### Frontend

- React 18
- Vite
- Tailwind CSS
- Web Speech API
- MediaPipe Face Detection

### Backend

- Node.js
- Express
- Groq SDK

### Knowledge Base

- `src/data/ucic_dataset.json` sebagai sumber data utama
- `Fuse.js` untuk retrieval lokal
- Dataset difokuskan ke kebutuhan customer service kampus

## Struktur Project

```text
selaui/
├── src/
│   ├── components/
│   │   ├── VoiceUI.jsx
│   │   ├── ChatBubble.jsx
│   │   ├── SuggestionButtons.jsx
│   │   └── ...
│   ├── data/
│   │   └── ucic_dataset.json
│   ├── lib/
│   │   ├── ai.js
│   │   └── translations.js
│   └── App.jsx
├── server/
│   └── index.js
├── launch.sh
├── package.json
└── README.md
```

## Cara Menjalankan

### Prasyarat

- Node.js 18+
- npm
- `GROQ_API_KEY`

### Setup

```bash
npm install
```

Buat file `.env.local`:

```bash
echo "GROQ_API_KEY=your_key_here" > .env.local
```

Jalankan frontend dan backend:

```bash
npm run dev
npm run server
```

Build production:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Voice Interaction Flow

```text
1. User mendekat ke kiosk
2. Wajah terdeteksi
3. SELA aktif dan menawarkan pilihan bahasa
4. User berbicara atau mengetik
5. Query dicocokkan ke ucic_dataset.json
6. AI menyusun jawaban singkat berbasis konteks dataset
7. Jawaban dibacakan kembali dengan TTS
```

## Knowledge Base Saat Ini

`ucic_dataset.json` saat ini terutama berisi:

- Profil kampus
- PMB
- Biaya
- Jurusan dan fakultas
- Fasilitas
- Beasiswa
- Kontak dan lokasi
- FAQ umum kampus

Sebagian data yang kurang relevan untuk customer service, seperti berita, artikel, data campuran, dan beberapa data akademik yang terlalu panjang, mulai dibersihkan atau dibatasi dari proses retrieval.

## Progress Saat Ini

- Persona SELA sudah diarahkan menjadi AI receptionist / customer service kampus
- RAG lokal sudah aktif menggunakan dataset kampus
- Scope jawaban sudah dibatasi agar tetap fokus pada UCIC
- Dataset sedang dirapikan agar lebih sesuai untuk kebutuhan layanan customer service

## Pengembangan Berikutnya

- FAQ layanan BAA, BAK, Kemahasiswaan, dan Perpustakaan
- Kalender akademik resmi
- Alur KRS, cuti, wisuda, dan surat aktif kuliah
- Kontak per unit kampus
- Dataset customer service yang lebih lengkap dan lebih rapi

## Author

- Kharis

## License

Proprietary - Universitas Catur Insan Cendekia
