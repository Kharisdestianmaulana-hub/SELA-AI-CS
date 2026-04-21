# SELA - AI Voice

SELA (Smart Electronic Receptionist Assistant) adalah sebuah sistem kiosk AI berbasis suara yang dirancang khusus untuk Universitas Catur Insan Cendekia (UCIC). Sistem ini menyediakan layanan informasi otomatis dengan kemampuan pengenalan wajah, pemrosesan bahasa alami, dan respons audio.

## 🎯 Fitur Utama

- **Voice-First Interface**: Interaksi berbasis suara menggunakan Web Speech API
- **Face Detection**: Salam otomatis ketika pengguna mendekat (MediaPipe)
- **Multilingual Support**: Dukungan bahasa Indonesia dan Inggris dengan deteksi otomatis
- **RAG System**: Retrieval Augmented Generation menggunakan Fuse.js untuk pencarian informasi kampus
- **AI-Powered Responses**: Menggunakan Groq SDK dengan model llama-3.3-70b-versatile
- **Smart Intent Detection**: Klasifikasi pertanyaan ke kategori (small_talk, campus, general, unclear)

## 🏗️ Tech Stack

### Frontend

- **React 18** + Vite
- **Tailwind CSS** untuk styling
- **MediaPipe** untuk face detection
- **Web Speech API** untuk voice I/O
- **Fuse.js** untuk RAG/search

### Backend

- **Node.js** + Express
- **Groq SDK** untuk AI inference
- **Environment Variables** (.env.local)

### Data & Tools
- **Local RAG Dataset** (ucic_dataset.json)

## 📋 Struktur Project

```
selaui/
├── src/
│   ├── components/
│   │   ├── VoiceUI.jsx              # Main voice interface
│   │   ├── ChatMessage.jsx          # Chat display component
│   │   └── ...
│   ├── lib/
│   │   ├── ai.js                    # AI system prompts & inference
│   │   ├── intent.js                # Intent detection
│   │   └── ...
│   ├── data/
│   │   └── ucic_dataset.json        # Campus information RAG dataset
│   └── App.jsx
├── server/
│   └── index.js                     # Express backend
├── scraper/
│   ├── scrape.js                    # Web scraper untuk cic.ac.id
│   ├── convert.js                   # CSV to JSON converter
│   ├── merge.js                     # Dataset merger
│   └── ucic_raw.csv                 # Raw scraped data
├── .env.local                       # API keys (not committed)
└── ...
```

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- npm atau yarn
- API Keys: GROQ_API_KEY, SERPER_API_KEY

### Setup

```bash
# Install dependencies
npm install

# Setup environment variables
echo "GROQ_API_KEY=your_key_here" > .env.local
echo "SERPER_API_KEY=your_key_here" >> .env.local

# Development
npm run dev          # Frontend Vite dev server
npm run server       # Backend Express server (in separate terminal)

# Production build
npm run build

# Linting
npm run lint
```

**Filter Rules:**

- ❌ Excludes: Student achievements, announcements/news dari 2024-2025
- ✅ Includes: Program studi, visi/misi, sejarah, informasi terkini

## 🎤 Voice Interaction Flow

```
1. User approaches → Face detected → Auto-greeting
2. User speaks → Speech recorded → Intent detected
3. Question classified: small_talk | campus | general | unclear
4. RAG search on ucic_dataset.json
5. Generate response using Groq AI
6. Text-to-Speech output
```

## 🔒 System Boundaries

SELA dirancang dengan batasan topik ketat:

- **Fokus**: Informasi kampus, program studi, akademik, kegiatan
- **Out of Scope**: Politik, SARA, konten dewasa, entertainment umum
- **Escalation**: Pertanyaan di luar scope → rujukan ke staff (BAA/BAK/PMB)

## 📝 API Configuration

### Groq API

```javascript
// src/lib/ai.js
const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
```

### Fallback Search

- Wikipedia API (knowledge base general)
- Serper API (web search sebagai fallback)

## 🎨 UI/UX Features

- Auto-scroll ke pesan terbaru
- Message history display
- Real-time speech recognition visual feedback
- Responsive kiosk-friendly layout
- Dark/Light theme support

## 📦 Dependencies Utama

| Package                 | Versi        | Fungsi         |
| ----------------------- | ------------ | -------------- |
| react                   | ^18.2.0      | UI framework   |
| groq-sdk                | ^1.1.2       | AI inference   |
| fuse.js                 | ^7.3.0       | RAG search     |
| @mediapipe/tasks-vision | ^0.10.34     | Face detection |
| express                 | ^5.2.1       | Backend API    |
| cheerio                 | ^1.0.0-rc.12 | Web scraping   |

## 🔄 Recent Updates (v0.0.1)

- ✨ System prompt constraints untuk topic boundaries
- ✨ Auto-scroll chat ke bottom
- 📊 93 entries dalam RAG dataset

## 🤝 Contributing

Untuk contributed improvements:

1. Buat branch baru: `git checkout -b feature/nama-feature`
2. Commit changes: `git commit -am 'Add feature description'`
3. Push ke branch: `git push origin feature/nama-feature`
4. Buat Pull Request

## 📄 License

Proprietary - Universitas Catur Insan Cendekia

## 👥 Authors

- **Kharis** - Development Lead

## 📧 Support

Untuk pertanyaan atau issue: [GitHub Issues](https://github.com/Kharisdestianmaulana-hub/selaui/issues)
