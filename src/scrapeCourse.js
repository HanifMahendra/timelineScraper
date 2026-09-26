/**
 * Temukan course SCELE yang aktif semester ini menggunakan session yang
 * tersimpan, lalu simpan HTML dan plain text ke data/html/ dan data/text/.
 * Daftar course hasil discovery ditulis ke data/html/courses.json untuk
 * extractAssignments.js. config/courses.json hanya dipakai bila discovery gagal.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const {
  filterCoursesForActiveAcademicYear,
  resolveAcademicYear,
} = require('./academicYear');
const { sanitizeFilename } = require('./extractAssignments');

const AUTH_FILE = path.resolve(__dirname, '../auth.json');
const COURSES_FILE = path.resolve(__dirname, '../config/courses.json');
const HTML_DIR = path.resolve(__dirname, '../data/html');
const TEXT_DIR = path.resolve(__dirname, '../data/text');
const MANIFEST_FILE = path.join(HTML_DIR, 'courses.json');
const SCELE_DASHBOARD_URL = 'https://scele.cs.ui.ac.id/my/';

function decodeCourseName(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0*39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// Sama dengan backend live: navigasi dashboard memotong nama course panjang
// (label tahun akademik ikut hilang), jadi pakai web service "My courses".
async function discoverCourses(context) {
  const page = await context.newPage();
  try {
    await page.goto(SCELE_DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (page.url().includes('/login/')) {
      throw new Error('Session SCELE di auth.json sudah expired. Jalankan: npm run login');
    }
    const courses = await page.evaluate(async () => {
      const sesskey = window.M?.cfg?.sesskey;
      if (!sesskey) return null;
      const methodname = 'core_course_get_enrolled_courses_by_timeline_classification';
      const response = await fetch(`/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=${methodname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ index: 0, methodname, args: { offset: 0, limit: 0, classification: 'all', sort: 'fullname' } }]),
      });
      const [result] = await response.json();
      if (result?.error || !Array.isArray(result?.data?.courses)) return null;
      return result.data.courses.map((course) => ({ url: course.viewurl, name: course.fullname }));
    }).catch(() => null);
    return Array.isArray(courses)
      ? courses.map((course) => ({ url: course.url, name: decodeCourseName(course.name) }))
      : null;
  } finally {
    await page.close();
  }
}

async function scrapeCourses({ now = new Date() } = {}) {
  if (!fs.existsSync(AUTH_FILE)) {
    console.error('auth.json tidak ditemukan. Jalankan dulu: node src/login.js');
    process.exit(1);
  }

  fs.mkdirSync(HTML_DIR, { recursive: true });
  fs.mkdirSync(TEXT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_FILE });

  try {
    const discovered = await discoverCourses(context);
    const candidates = discovered || JSON.parse(fs.readFileSync(COURSES_FILE, 'utf-8'));
    if (!discovered) console.warn('Discovery course SCELE gagal; memakai config/courses.json.');

    const activeAcademicYear = resolveAcademicYear(now);
    const courses = filterCoursesForActiveAcademicYear(candidates, { now })
      .map((course) => ({ ...course, slug: sanitizeFilename(course.name) }));
    if (!courses.length) {
      throw new Error(`Tidak ada course aktif untuk tahun akademik ${activeAcademicYear.label}.`);
    }
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(courses, null, 2), 'utf-8');

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

        const htmlPath = path.join(HTML_DIR, `${course.slug}.html`);
        const textPath = path.join(TEXT_DIR, `${course.slug}.txt`);

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

    return results;
  } finally {
    await browser.close();
  }
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
