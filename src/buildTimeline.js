/**
 * Baca data/assignments.json, tambahkan flag status, lalu output ke data/timeline.json.
 * Semua perbandingan waktu menggunakan timezone WIB (+07:00) yang sudah ada di deadlineISO.
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.resolve(__dirname, '../data/assignments.json');
const OUTPUT_FILE = path.resolve(__dirname, '../data/timeline.json');

// Ambil tanggal hari ini sebagai YYYY-MM-DD di WIB (+07:00)
function todayWIB() {
  const now = new Date();
  // Geser ke WIB
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function buildTimeline(nowOverride) {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('data/assignments.json tidak ditemukan. Jalankan dulu: node index.js');
    process.exit(1);
  }

  const assignments = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));

  // Waktu referensi: bisa di-override untuk testing, default sekarang dalam ms UTC
  const nowMs = nowOverride ?? Date.now();

  // Tanggal hari ini di WIB sebagai string "YYYY-MM-DD"
  const wibNow = new Date(nowMs + 7 * 60 * 60 * 1000);
  const todayStr = wibNow.toISOString().slice(0, 10);

  // Batas "due soon": tengah malam akhir 2 hari ke depan (WIB)
  const dueSoonCutoff = new Date(`${todayStr}T00:00:00+07:00`).getTime() + 3 * 24 * 60 * 60 * 1000;

  const withFlags = assignments.map((item) => {
    if (!item.deadlineISO) {
      return { ...item, isOverdue: false, isDueToday: false, isDueSoon: false };
    }

    const deadlineMs = new Date(item.deadlineISO).getTime();
    const deadlineDateStr = item.deadlineISO.slice(0, 10); // "YYYY-MM-DD"

    const isOverdue = deadlineMs < nowMs;
    const isDueToday = !isOverdue && deadlineDateStr === todayStr;
    const isDueSoon = !isOverdue && !isDueToday && deadlineMs < dueSoonCutoff;

    return { ...item, isOverdue, isDueToday, isDueSoon };
  });

  // Sort ascending berdasarkan deadlineISO; item tanpa deadline paling akhir
  withFlags.sort((a, b) => {
    if (a.deadlineISO && b.deadlineISO) return a.deadlineISO.localeCompare(b.deadlineISO);
    if (a.deadlineISO) return -1;
    if (b.deadlineISO) return 1;
    return 0;
  });

  const timeline = {
    today: withFlags.filter((i) => i.isDueToday),
    upcoming: withFlags.filter((i) => !i.isOverdue && !i.isDueToday),
    overdue: withFlags.filter((i) => i.isOverdue),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(timeline, null, 2), 'utf-8');

  console.log(`Timeline disimpan ke ${OUTPUT_FILE}`);
  console.log(`  today:    ${timeline.today.length} item`);
  console.log(`  upcoming: ${timeline.upcoming.length} item (${withFlags.filter((i) => i.isDueSoon && !i.isDueToday).length} due soon)`);
  console.log(`  overdue:  ${timeline.overdue.length} item`);

  return timeline;
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
               'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function formatDeadlineRelative(deadlineISO, nowMs) {
  const deadlineMs = new Date(deadlineISO).getTime();
  const diffMs = deadlineMs - nowMs;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Jam dan menit dari deadlineISO
  const d = new Date(deadlineMs);
  const wib = new Date(deadlineMs + 7 * 60 * 60 * 1000);
  const jam = String(wib.getUTCHours()).padStart(2, '0');
  const menit = String(wib.getUTCMinutes()).padStart(2, '0');
  const waktu = `${jam}:${menit}`;

  if (diffHours <= 0) return null; // sudah lewat, jangan pakai ini
  if (diffHours < 1) return `kurang dari 1 jam lagi (${waktu})`;
  if (diffHours < 24) return `hari ini jam ${waktu}`;
  if (diffDays === 1) return `besok jam ${waktu}`;
  if (diffDays === 2) return `lusa jam ${waktu}`;

  const namaHari = HARI[wib.getUTCDay()];
  const tgl = wib.getUTCDate();
  const bln = BULAN[wib.getUTCMonth()];
  return `${namaHari}, ${tgl} ${bln} jam ${waktu}`;
}

function hitungTugasMingguIni(upcoming, nowMs) {
  const endOfWeekMs = nowMs + 7 * 24 * 60 * 60 * 1000;
  return upcoming.filter(
    (i) => i.deadlineISO && new Date(i.deadlineISO).getTime() <= endOfWeekMs
  );
}

/**
 * Hasilkan ringkasan mingguan dalam bahasa Indonesia santai.
 * @param {object} timeline - objek { today, upcoming, overdue } dari buildTimeline()
 * @param {number} [nowOverride] - timestamp ms untuk testing
 * @returns {string}
 */
function generateWeeklySummary(timeline, nowOverride) {
  const nowMs = nowOverride ?? Date.now();
  const { today, upcoming, overdue } = timeline;

  const parts = [];

  // --- Overdue ---
  if (overdue.length > 0) {
    const n = overdue.length;
    const label = n === 1 ? 'tugas' : 'tugas';
    parts.push(`⚠️  Ada ${n} ${label} yang udah lewat deadline dan belum kamu selesaikan.`);
  }

  // --- Hari ini ---
  if (today.length > 0) {
    const n = today.length;
    const judulList = today.map((i) => `"${i.title}"`).join(', ');
    parts.push(
      n === 1
        ? `🔴 Hari ini ada 1 tugas yang harus dikumpulkan: ${judulList}.`
        : `🔴 Hari ini ada ${n} tugas yang harus dikumpulkan: ${judulList}.`
    );
  }

  // --- Minggu ini ---
  const mingguIni = hitungTugasMingguIni(upcoming, nowMs);
  const totalAktif = today.length + mingguIni.length;

  if (totalAktif === 0 && overdue.length === 0) {
    parts.push('✅ Kamu aman! Tidak ada tugas dalam waktu dekat.');
    return parts.join('\n');
  }

  if (mingguIni.length > 0) {
    const n = mingguIni.length + today.length;
    parts.push(`📅 Minggu ini kamu punya ${n} tugas yang perlu diselesaikan.`);
  }

  // --- Yang paling urgent (upcoming, bukan today) ---
  const mostUrgent = upcoming.find((i) => i.deadlineISO);
  if (mostUrgent) {
    const relativeTime = formatDeadlineRelative(mostUrgent.deadlineISO, nowMs);
    if (relativeTime) {
      parts.push(`🚨 Yang paling urgent: "${mostUrgent.title}" (${mostUrgent.course}) — deadline ${relativeTime}.`);
    }
  }

  // --- Due soon selain yang paling urgent ---
  const dueSoon = upcoming.filter((i) => i.isDueSoon && i !== mostUrgent);
  if (dueSoon.length > 0) {
    const list = dueSoon
      .map((i) => {
        const rel = formatDeadlineRelative(i.deadlineISO, nowMs);
        return `"${i.title}" (${rel ?? i.deadlineText})`;
      })
      .join(', ');
    parts.push(`⏰ Selain itu, ${dueSoon.length > 1 ? 'ada beberapa' : 'ada 1'} yang due soon: ${list}.`);
  }

  return parts.join('\n');
}

module.exports = { buildTimeline, generateWeeklySummary };

if (require.main === module) {
  const timeline = buildTimeline();
  console.log('\n--- Ringkasan Mingguan ---');
  console.log(generateWeeklySummary(timeline));
}
