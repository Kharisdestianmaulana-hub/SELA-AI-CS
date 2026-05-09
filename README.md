# SELA

> AI Receptionist and Campus Customer Service — Universitas Catur Insan Cendekia (UCIC)

---

SELA adalah AI receptionist berbasis suara yang dirancang untuk melayani pengunjung, calon mahasiswa, orang tua, dan mahasiswa dalam mendapatkan informasi kampus secara cepat, singkat, dan terarah. Jawaban diambil dari knowledge base lokal agar tetap terkontrol dan sesuai dengan kebutuhan layanan kampus.

SELA is a voice-based AI receptionist designed to help visitors, prospective students, parents, and current students get campus information quickly and accurately. Responses are drawn from a local knowledge base to keep answers controlled and relevant to campus service needs.

---

## Tujuan / Objectives

- Menjadi front desk digital untuk layanan informasi kampus UCIC
- Menjawab pertanyaan umum yang sering berulang secara otomatis
- Memberikan pengalaman interaksi berbasis suara yang natural
- Menjaga jawaban tetap fokus pada scope customer service kampus

---

- Serve as a digital front desk for UCIC campus information
- Automatically handle frequently asked questions
- Deliver a natural, voice-first interaction experience
- Keep responses focused within the campus customer service scope

---

## Fitur Utama / Key Features

- Voice-first interaction via Web Speech API
- Face detection untuk aktivasi saat pengguna mendekat
- Dukungan Bahasa Indonesia dan English
- Local RAG berbasis `ucic_dataset.json`
- Jawaban singkat bergaya customer service kampus
- Follow-up question suggestions
- Filter scope agar SELA tetap fokus pada informasi UCIC

---

- Voice-first interaction via Web Speech API
- Face detection for proximity-based activation
- Indonesian and English language support
- Local RAG powered by `ucic_dataset.json`
- Short, campus customer service-style responses
- Follow-up question suggestions
- Scope filter to keep SELA focused on UCIC information

---

## Scope

### In Scope

- Penerimaan Mahasiswa Baru (PMB) dan pendaftaran
- Biaya kuliah dan opsi pembayaran
- Jurusan, fakultas, dan program studi
- Fasilitas kampus
- Lokasi dan kontak kampus
- Beasiswa umum
- FAQ informasi kampus

---

- Admissions (PMB) and registration
- Tuition fees and payment options
- Departments, faculties, and study programs
- Campus facilities
- Campus location and contact information
- General scholarships
- Campus information FAQ

### Out of Scope

- Politik, hiburan umum, dan topik non-UCIC
- Jawaban umum di luar konteks kampus
- Data pribadi mahasiswa
- Keputusan administratif resmi yang harus ditangani unit kampus

---

- Politics, general entertainment, and non-UCIC topics
- General knowledge outside campus context
- Personal student data
- Official administrative decisions that must be handled by campus units

Jika informasi tidak tersedia di dataset, SELA akan menjawab jujur tanpa mengarang.

If information is not available in the dataset, SELA will respond honestly without fabricating an answer.

---

## Arsitektur / Architecture

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

- `src/data/ucic_dataset.json` sebagai sumber data utama / as the primary data source
- `Fuse.js` untuk retrieval lokal / for local retrieval

---

## Struktur Project / Project Structure

```
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

---

## Cara Menjalankan / Getting Started

### Prasyarat / Prerequisites

- Node.js 18+
- npm
- `GROQ_API_KEY` untuk transcribe suara (Whisper)
- `GEMINI_API_KEY` untuk jawaban chat SELA

### Setup

```bash
npm install
```

Buat file `.env.local` / Create `.env.local`:

```bash
GROQ_API_KEY=your_groq_key_here
GEMINI_API_KEY=your_gemini_key_here
GEMINI_MODEL=gemini-2.0-flash
```

Jalankan / Run:

```bash
bash launch.sh
```

Build produksi / Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

---

## Alur Interaksi Suara / Voice Interaction Flow

```
1. User mendekat ke kiosk / User approaches the kiosk
2. Wajah terdeteksi / Face is detected
3. SELA aktif dan menawarkan pilihan bahasa / SELA activates and offers language selection
4. User berbicara atau mengetik / User speaks or types
5. Query dicocokkan ke ucic_dataset.json / Query is matched against ucic_dataset.json
6. AI menyusun jawaban berbasis konteks dataset / AI composes a response based on dataset context
7. Jawaban dibacakan dengan TTS / Response is read aloud via TTS
```

---

## Knowledge Base

`ucic_dataset.json` saat ini mencakup / currently covers:

- Profil kampus / Campus profile
- PMB dan pendaftaran / Admissions and registration
- Biaya kuliah / Tuition fees
- Jurusan dan fakultas / Departments and faculties
- Fasilitas / Facilities
- Beasiswa / Scholarships
- Kontak dan lokasi / Contact and location
- FAQ umum kampus / General campus FAQ

Data yang kurang relevan untuk customer service, seperti berita, artikel, dan data akademik yang terlalu panjang, sedang dibersihkan dari proses retrieval.

Data not relevant to customer service, such as news, articles, and overly long academic records, is being cleaned from the retrieval pipeline.

---

## Progress

- Persona SELA sudah diarahkan menjadi AI receptionist kampus / SELA's persona is defined as a campus AI receptionist
- RAG lokal sudah aktif menggunakan dataset kampus / Local RAG is active using the campus dataset
- Scope jawaban sudah dibatasi agar fokus pada UCIC / Response scope is restricted to UCIC context
- Dataset sedang dirapikan untuk kebutuhan customer service / Dataset is being refined for customer service use

---

## Pengembangan Berikutnya / Roadmap

- FAQ layanan BAA, BAK, Kemahasiswaan, dan Perpustakaan
- Kalender akademik resmi
- Alur KRS, cuti, wisuda, dan surat aktif kuliah
- Kontak per unit kampus
- Dataset customer service yang lebih lengkap

---

- Service FAQ for BAA, BAK, Student Affairs, and Library
- Official academic calendar
- Course registration, leave, graduation, and enrollment letter workflows
- Per-unit campus contact directory
- Expanded and refined customer service dataset

---

## Author

Kharis

## License

Proprietary — Universitas Catur Insan Cendekia
