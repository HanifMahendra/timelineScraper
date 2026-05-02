/**
 * Login manual ke SCELE sekali, lalu simpan session ke auth.json.
 * Jalankan: node src/login.js
 * Browser akan terbuka — login manual, lalu tekan Enter di terminal.
 */

const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

const AUTH_FILE = path.resolve(__dirname, '../auth.json');
const SCELE_URL = 'https://scele.cs.ui.ac.id/login/index.php';

async function waitForEnter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('\n[SCELE Login] Sudah login? Tekan Enter untuk menyimpan session... ', () => {
      rl.close();
      resolve();
    });
  });
}

async function login() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(SCELE_URL);
  console.log('Browser terbuka. Silakan login ke SCELE secara manual.');
  console.log('Setelah berhasil login, kembali ke terminal dan tekan Enter.');

  await waitForEnter();

  await context.storageState({ path: AUTH_FILE });
  console.log(`Session disimpan ke: ${AUTH_FILE}`);

  await browser.close();
}

login().catch((err) => {
  console.error('Login gagal:', err.message);
  process.exit(1);
});
