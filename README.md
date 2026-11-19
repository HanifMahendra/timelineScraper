# Scheduler: Timeline Kuliah Otomatis dari SCELE

Scheduler adalah website pribadi untuk mahasiswa Fasilkom UI yang merangkum
semua tugas, kuis, dan forum dari SCELE ke dalam satu timeline, lalu
membantu memantau nilai dan merencanakan target IP.

Website: <https://timeline-automated-scraper.web.app>

## Tampilan

Screenshot website (halaman login dan dashboard)

*— Soon —*

## Latar belakang

Deadline di SCELE tersebar di halaman masing-masing mata kuliah. Untuk tahu
apa saja yang harus dikerjakan minggu ini, kita harus membuka satu per satu
course, membaca tanggalnya, dan mengingat mana yang sudah selesai. Scheduler
mengotomatiskan pekerjaan itu: cukup login sekali, lalu semua deadline
semester berjalan tampil dalam satu tempat.

## Fitur

**Timeline Tugas**
- Mengambil tugas, kuis, worksheet, dan forum diskusi dari semua mata kuliah
  semester aktif secara otomatis.
- Mendeteksi otomatis status pengumpulan tugas di SCELE (*Sudah dikumpulkan*,
  *Draft*, atau *Belum dikumpulkan*) sehingga tugas yang sudah disubmit
  otomatis dianggap selesai.
- Mengelompokkan tugas menjadi *hari ini*, *mendatang*, *terlambat*, dan
  *selesai* (collapsible), dengan kartu statistik interaktif serta status yang
  diperbarui sendiri seiring waktu berjalan.
- Tugas bisa ditandai selesai (dengan tombol *Urungkan*) dan tandanya ikut
  tersimpan di akun sehingga sama di semua perangkat.
- Aktivitas yang dibatasi untuk kelas lain tidak ikut ditampilkan.

**Bot Discord (Multi-User)**
- Setiap pengguna dapat menghubungkan akun Discord-nya langsung dari menu
  **Bot Discord** di navbar (pilih server via OAuth2 Discord lalu jalankan
  `/link code:XXXXXX`).
- Mendukung slash command interaktif: `/today`, `/upcoming`, `/overdue`, dan
  `/summary` (balasan *ephemeral* khusus pengguna).
- Pengingat harian otomatis di jam pilihan pengguna (WIB) ke DM pribadi atau
  channel server pilihan sendiri lewat `/setchannel`.

**Nilai Akademik**
- Satu buku nilai per mata kuliah. Nilai yang sudah dirilis di SCELE diambil
  otomatis; kategori dan bobot penilaian diisi sendiri sesuai silabus.
- Menghitung nilai akhir sementara dan nilai minimum yang dibutuhkan untuk
  mencapai A, A-, B+, dan seterusnya.
- Mendukung skala 0–100 maupun skala desimal 0.0–4.0, dengan batas huruf mutu
  yang bisa disesuaikan per dosen.
- Perencana IP/IPK: dari target IPK dan SKS semester ini, dihitung kombinasi
  nilai yang realistis untuk dicapai.

**Rencana Belajar**
- Menyusun jadwal belajar dari daftar mata kuliah dan topik, beserta
  rekomendasi sumber belajar.

## Cara kerja

```
Browser (dashboard)  ──►  Backend scraper  ──►  SCELE
        │                       │
        └──────►  Firebase (Auth + Firestore)  ◄──┘
```

1. Pengguna login dengan akun SCELE di dashboard.
2. Backend login ke SCELE memakai browser headless, lalu menyimpan sesi
   login dalam keadaan terenkripsi. **Password tidak pernah disimpan.**
3. Saat sinkronisasi, backend membuka halaman mata kuliah semester aktif
   (hanya membaca, tanpa mengklik atau mengirim apa pun), mengekstrak
   aktivitas beserta deadline-nya, dan mengambil nilai yang sudah dirilis.
4. Hasilnya disimpan per pengguna di Firestore dan ditampilkan di dashboard.

## Teknologi

| Bagian | Teknologi |
|---|---|
| Dashboard | Next.js (static export), React, TypeScript, Firebase Hosting |
| Backend | Node.js, Express, Playwright, di Hugging Face Spaces (Docker) |
| Data & autentikasi | Firebase Authentication, Cloud Firestore |
| Bot & pengingat harian | Discord Interactions API (Ed25519), GitHub Actions |

## Struktur repository

| Folder | Isi |
|---|---|
| `dashboard/` | Website yang dipakai pengguna |
| `timeline-scele-auth/` | Backend login dan scraper ([repo terpisah](https://github.com/HanifMahendra/timeline-scele-auth)) |
| `src/` | Versi lokal scraper untuk dijalankan dari laptop |
| `docs/` | Dokumentasi teknis: skema data, perhitungan nilai, runbook |
| `tests/`, `scripts/` | Test otomatis dan skrip pendukung |

Panduan menjalankan dan men-deploy ada di [DEPLOYMENT.md](DEPLOYMENT.md);
aturan perhitungan nilai ada di
[docs/GRADE_CALCULATION.md](docs/GRADE_CALCULATION.md).

## Catatan

Proyek ini dibuat untuk penggunaan pribadi dan tidak berafiliasi dengan
Fakultas Ilmu Komputer UI maupun pengelola SCELE.
