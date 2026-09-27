# Dashboard Scheduler

Tampilan web Scheduler: tempat pengguna login dengan akun SCELE, melihat
timeline tugas, memantau nilai, dan menyusun rencana belajar.

Dashboard ini adalah situs statis (Next.js static export) yang di-host di
Firebase Hosting. Semua data diambil dari backend dan Firestore memakai akun
Firebase pengguna yang sedang login, sehingga setiap pengguna hanya melihat
datanya sendiri.

Halaman utama:

- **Timeline Tugas**: deadline dari SCELE, dikelompokkan berdasarkan waktu.
- **Nilai Akademik**: buku nilai per mata kuliah, target huruf mutu, dan
  perencana IP/IPK.
- **Rencana Belajar**: jadwal belajar dan rekomendasi sumber belajar.

Gambaran lengkap proyek ada di [README utama](../README.md); cara
menjalankan dan men-deploy ada di [DEPLOYMENT.md](../DEPLOYMENT.md).
