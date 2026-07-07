# Bugfix Requirements Document

## Introduction

Bug sinkronisasi antara TTS (Text-to-Speech) voice output dengan text display (ChatBubble typewriter effect dan LiveCaption). Tiga masalah utama: (1) typewriter effect di ChatBubble berjalan independen dari durasi TTS sehingga text masih animasi padahal suara sudah selesai atau sebaliknya, (2) LiveCaption tidak sinkron dengan TTS boundary events karena fallback timer terlalu lambat, dan (3) response delay yang berlebihan akibat timeout values yang tidak optimal. Dampaknya: pengalaman percakapan AI terasa tidak natural dan "laggy".

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN TTS selesai membacakan spokenText (pendek) tetapi ChatBubble masih menampilkan displayText (panjang) dengan typewriter effect THEN the system menunjukkan suara sudah berhenti sementara text masih berjalan animasi, menciptakan disconnect antara audio dan visual

1.2 WHEN displayText pendek dan typewriter selesai lebih cepat dari TTS THEN the system menunjukkan text sudah selesai tampil sementara suara masih berbicara, menciptakan disconnect terbalik

1.3 WHEN TTS mengirim onboundary event dengan charIndex THEN the system menunda update LiveCaption sebesar 700ms (LIVE_CAPTION_BOUNDARY_DELAY_MS) sehingga caption tertinggal dari suara yang sedang diucapkan

1.4 WHEN browser tidak mengirim onboundary events (fallback mode) THEN the system menggunakan timer 340ms per kata (CAPTION_WORD_INTERVAL_MS) yang tidak sesuai dengan kecepatan bicara TTS aktual, menyebabkan caption dan suara tidak sinkron

1.5 WHEN onboundary event pertama tidak datang dalam 900ms (BOUNDARY_FALLBACK_DELAY_MS) THEN the system baru beralih ke timer fallback setelah hampir 1 detik, menyebabkan caption diam terlalu lama di awal

1.6 WHEN TTS selesai berbicara THEN the system menunggu 800ms sebelum mengaktifkan mic kembali, menambah delay yang terasa tidak responsif dalam percakapan

1.7 WHEN speakText dipanggil THEN the system menambahkan delay 100ms (setTimeout doSpeak) sebelum mulai berbicara, menambah latency yang tidak perlu saat voices sudah loaded

### Expected Behavior (Correct)

2.1 WHEN TTS selesai membacakan spokenText dan ChatBubble sedang menampilkan displayText dengan typewriter effect THEN the system SHALL langsung menyelesaikan typewriter (menampilkan seluruh text sekaligus) sehingga visual dan audio selesai bersamaan

2.2 WHEN typewriter ChatBubble selesai menampilkan seluruh displayText tetapi TTS masih berbicara THEN the system SHALL membiarkan TTS selesai secara natural tanpa memotong, dan text tetap tampil lengkap

2.3 WHEN TTS mengirim onboundary event dengan charIndex THEN the system SHALL mengupdate LiveCaption dengan delay maksimal 150ms agar caption mengikuti suara secara real-time

2.4 WHEN browser tidak mengirim onboundary events (fallback mode) THEN the system SHALL menghitung interval per kata berdasarkan estimasi durasi TTS aktual (total durasi / jumlah kata) sehingga caption selesai mendekati waktu TTS selesai

2.5 WHEN onboundary event pertama tidak datang dalam waktu yang wajar THEN the system SHALL beralih ke timer fallback dalam maksimal 400ms agar caption mulai berjalan lebih cepat

2.6 WHEN TTS selesai berbicara THEN the system SHALL mengaktifkan mic kembali dalam maksimal 400ms untuk percakapan yang lebih responsif

2.7 WHEN speakText dipanggil dan voices sudah tersedia THEN the system SHALL memulai speech dengan delay maksimal 50ms untuk mengurangi latency awal

### Unchanged Behavior (Regression Prevention)

3.1 WHEN user dalam text mode (bukan voice mode) THEN the system SHALL CONTINUE TO menampilkan typewriter effect dengan kecepatan 18ms per karakter untuk pesan baru

3.2 WHEN TTS mengalami error atau interrupted THEN the system SHALL CONTINUE TO memanggil finalize/onEnd callback agar state avatar dan UI tetap sinkron

3.3 WHEN spokenText sama dengan displayText (ttsMode = "full") THEN the system SHALL CONTINUE TO menampilkan text lengkap tanpa perbedaan antara yang dibaca dan yang ditampilkan

3.4 WHEN avatarState bukan "speaking" THEN the system SHALL CONTINUE TO menyembunyikan LiveCaption

3.5 WHEN audio blob terlalu kecil atau tidak ada speech terdeteksi THEN the system SHALL CONTINUE TO mengabaikan input dan restart listening

3.6 WHEN Chrome bug menyebabkan TTS onEnd tidak terpanggil THEN the system SHALL CONTINUE TO menggunakan fallback timeout untuk force restart listening

3.7 WHEN user mengucapkan farewell THEN the system SHALL CONTINUE TO memproses farewell flow dengan archive session dan reset state
