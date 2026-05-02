const fs = require('fs');
const path = require('path');

const SOURCE_TIMELINE = path.resolve(__dirname, '../data/timeline.json');
const DASHBOARD_DATA_DIR = path.resolve(__dirname, '../dashboard/src/data');
const DASHBOARD_TIMELINE = path.join(DASHBOARD_DATA_DIR, 'timeline.json');

function syncDashboardData() {
  if (!fs.existsSync(SOURCE_TIMELINE)) {
    throw new Error('data/timeline.json tidak ditemukan. Jalankan timeline builder dulu.');
  }

  fs.mkdirSync(DASHBOARD_DATA_DIR, { recursive: true });
  fs.copyFileSync(SOURCE_TIMELINE, DASHBOARD_TIMELINE);
  return DASHBOARD_TIMELINE;
}

module.exports = { syncDashboardData };

if (require.main === module) {
  const output = syncDashboardData();
  console.log(`Snapshot dashboard disimpan ke ${output}`);
}
