/**
 * Buka setiap course di config/courses.json menggunakan session yang tersimpan,
 * lalu simpan HTML dan plain text ke data/html/ dan data/text/.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const {
  filterCoursesForActiveAcademicYear,
  resolveAcademicYear,
} = require('./academicYear');

const AUTH_FILE = path.resolve(__dirname, '../auth.json');
const COURSES_FILE = path.resolve(__dirname, '../config/courses.json');
const HTML_DIR = path.resolve(__dirname, '../data/html');
const TEXT_DIR = path.resolve(__dirname, '../data/text');

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
}

async function scrapeCourses({ now = new Date() } = {}) {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error('auth.json tidak ditemukan. Jalankan dulu: node src/login.js');
    process.exit(1);
  }

  const configuredCourses = JSON.parse(fs.readFileSync(COURSES_FILE, 'utf-8'));
  const activeAcademicYear = resolveAcademicYear(now);
  const courses = filterCoursesForActiveAcademicYear(configuredCourses, { now });
  if (!courses.length) {
    throw new Error(
      `Tidak ada course tahun akademik ${activeAcademicYear.label} di config/courses.json.`
    );
  }

  fs.mkdirSync(HTML_DIR, { recursive: true });
  fs.mkdirSync(TEXT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_FILE });

  const results = [];

  for (const course of courses) {
    console.log(`Scraping: ${course.name} — ${course.url}`);
    const page = await context.newPage();

    try {
      await page.goto(course.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const isLoggedIn = await page.$('#page-header');
      if (!isLoggedIn) {
        console.warn(`  PERINGATAN: Mungkin belum login atau URL salah untuk ${course.name}`);
      }

      const html = await page.content();
      const text = await page.evaluate(() => document.body.innerText);

      const slug = sanitizeFilename(course.name);
      const htmlPath = path.join(HTML_DIR, `${slug}.html`);
      const textPath = path.join(TEXT_DIR, `${slug}.txt`);

      fs.writeFileSync(htmlPath, html, 'utf-8');
      fs.writeFileSync(textPath, text, 'utf-8');

      console.log(`  Disimpan: ${htmlPath}`);
      results.push({ course: course.name, url: course.url, htmlPath, textPath, success: true });
    } catch (err) {
      console.error(`  Error scraping ${course.name}: ${err.message}`);
      results.push({ course: course.name, url: course.url, success: false, error: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  return results;
}

module.exports = { scrapeCourses };

if (require.main === module) {
  scrapeCourses()
    .then((results) => {
      const ok = results.filter((r) => r.success).length;
      console.log(`\nSelesai: ${ok}/${results.length} course berhasil di-scrape.`);
    })
    .catch((err) => {
      console.error('Scrape gagal:', err.message);
      process.exit(1);
    });
}
