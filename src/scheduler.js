/**
 * Scheduler otomatis: jalankan scrape → extract → timeline 2x sehari.
 * Jadwal default: 07:00 dan 20:00 WIB.
 *
 * Cara pakai:
 *   node src/scheduler.js            — pakai jadwal default
 *   node src/scheduler.js --now      — langsung jalankan sekali, lalu ikuti jadwal
 *   node src/scheduler.js --once     — jalankan sekali lalu keluar (untuk cron OS)
 */

const cron = require('node-cron');
const { scrapeCourses } = require('./scrapeCourse');
const { extractAssignments } = require('./extractAssignments');
const { buildTimeline, generateWeeklySummary } = require('./buildTimeline');
const { syncDashboardData } = require('./syncDashboardData');

// Jadwal WIB: node-cron mengikuti timezone server.
// Jika server di UTC, offset +7 jam: 07:00 WIB = 00:00 UTC, 20:00 WIB = 13:00 UTC.
const SCHEDULES = [
  { label: '07:00 WIB', cron: '0 0 * * *' },   // 00:00 UTC = 07:00 WIB
  { label: '20:00 WIB', cron: '0 13 * * *' },  // 13:00 UTC = 20:00 WIB
];

const LOG_FILE_PATH = require('path').resolve(__dirname, '../data/scheduler.log');
const fs = require('fs');

// --- Logger ---

function logLine(level, message) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] [${level}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE_PATH, line + '\n', 'utf-8');
}

const log = {
  info:  (msg) => logLine('INFO ', msg),
  ok:    (msg) => logLine('OK   ', msg),
  warn:  (msg) => logLine('WARN ', msg),
  error: (msg) => logLine('ERROR', msg),
};

// --- Pipeline utama ---

async function runPipeline() {
  log.info('=== Pipeline dimulai ===');

  // Step 1: Scrape
  log.info('Step 1/4 — Scraping semua course...');
  let scrapeResults;
  try {
    scrapeResults = await scrapeCourses();
    const ok = scrapeResults.filter((r) => r.success).length;
    const fail = scrapeResults.length - ok;
    log.ok(`Scrape selesai: ${ok}/${scrapeResults.length} course berhasil${fail > 0 ? `, ${fail} gagal` : ''}.`);
    scrapeResults.filter((r) => !r.success).forEach((r) => log.warn(`  Course gagal: ${r.course} — ${r.error}`));
  } catch (err) {
    log.error(`Scrape crash: ${err.message}`);
    return;
  }

  // Step 2: Extract
  log.info('Step 2/4 — Mengekstrak assignments...');
  let assignments;
  try {
    assignments = extractAssignments();
    log.ok(`Extract selesai: ${assignments.length} item tersimpan di data/assignments.json.`);
  } catch (err) {
    log.error(`Extract crash: ${err.message}`);
    return;
  }

  // Step 3: Build timeline
  log.info('Step 3/4 — Membangun timeline...');
  let timeline;
  try {
    timeline = buildTimeline();
    log.ok(
      `Timeline selesai: ${timeline.today.length} hari ini, ` +
      `${timeline.upcoming.length} upcoming, ` +
      `${timeline.overdue.length} overdue.`
    );

    const summary = generateWeeklySummary(timeline);
    log.info('Ringkasan mingguan:');
    summary.split('\n').forEach((line) => log.info('  ' + line));
  } catch (err) {
    log.error(`Timeline crash: ${err.message}`);
    return;
  }

  // Step 4: Sync dashboard snapshot
  log.info('Step 4/4 — Menyinkronkan snapshot dashboard...');
  try {
    const snapshotPath = syncDashboardData();
    log.ok(`Snapshot dashboard selesai: ${snapshotPath}`);
  } catch (err) {
    log.error(`Sync dashboard crash: ${err.message}`);
    return;
  }

  log.info('=== Pipeline selesai ===\n');
}

// --- Entry point ---

const args = process.argv.slice(2);
const RUN_NOW = args.includes('--now') || args.includes('--once');
const RUN_ONCE = args.includes('--once');

if (RUN_ONCE) {
  // Jalankan sekali lalu keluar — cocok untuk cron OS (Task Scheduler / crontab)
  runPipeline().then(() => process.exit(0)).catch((err) => {
    log.error(err.message);
    process.exit(1);
  });
} else {
  // Mode daemon: daftarkan jadwal dan tetap hidup
  if (RUN_NOW) {
    log.info('--now: menjalankan pipeline langsung sebelum jadwal...');
    runPipeline();
  }

  for (const { label, cron: expr } of SCHEDULES) {
    cron.schedule(expr, () => {
      log.info(`Jadwal ${label} dipicu.`);
      runPipeline();
    });
    log.info(`Jadwal terdaftar: ${label} (cron: "${expr}")`);
  }

  log.info('Scheduler berjalan. Tekan Ctrl+C untuk berhenti.\n');
}
