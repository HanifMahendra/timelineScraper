/**
 * Entry point: scrape semua course lalu extract assignments.
 * Jalankan: node index.js
 * (Pastikan sudah login dulu dengan: node src/login.js)
 */

const { scrapeCourses } = require('./src/scrapeCourse');
const { extractAssignments } = require('./src/extractAssignments');
const { buildTimeline } = require('./src/buildTimeline');
const { syncDashboardData } = require('./src/syncDashboardData');

async function main() {
  console.log('=== SCELE Timeline Scraper ===\n');

  console.log('--- Step 1: Scrape halaman course ---');
  const scrapeResults = await scrapeCourses();
  const ok = scrapeResults.filter((r) => r.success).length;
  console.log(`Scrape selesai: ${ok}/${scrapeResults.length} course.\n`);

  console.log('--- Step 2: Extract assignments ---');
  const assignments = extractAssignments();
  console.log(`${assignments.length} item tersimpan di data/assignments.json\n`);

  console.log('--- Step 3: Build timeline ---');
  buildTimeline();

  console.log('\n--- Step 4: Sync dashboard snapshot ---');
  const dashboardSnapshot = syncDashboardData();
  console.log(`Snapshot dashboard tersimpan di ${dashboardSnapshot}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
