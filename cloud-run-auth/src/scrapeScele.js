import { chromium } from 'playwright';

const SCELE_DASHBOARD_URL = 'https://scele.cs.ui.ac.id/my/';

export async function scrapeUserCourses(storageState) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    await page.goto(SCELE_DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const isLoggedIn = await page.locator('#page-header').count().catch(() => 0);
    if (isLoggedIn === 0) {
      throw new Error('Sesi SCELE tidak valid atau sudah expired.');
    }

    // Ambil semua link course dari dashboard
    const courseLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a[href*="/course/view.php"]').forEach((a) => {
        const href = a.href;
        const name = a.textContent?.trim();
        if (href && name && name.length > 2) {
          links.push({ url: href, name });
        }
      });
      return links;
    });

    // Deduplikasi berdasarkan URL
    const seen = new Set();
    const courses = courseLinks.filter(({ url }) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });

    if (courses.length === 0) {
      throw new Error('Tidak ada course ditemukan di dashboard SCELE.');
    }

    // Scrape HTML tiap course
    const results = [];
    for (const course of courses) {
      try {
        const coursePage = await context.newPage();
        await coursePage.goto(course.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const html = await coursePage.content();
        await coursePage.close();
        results.push({ name: course.name, url: course.url, html, success: true });
      } catch (err) {
        results.push({ name: course.name, url: course.url, html: '', success: false, error: err.message });
      }
    }

    return results;
  } finally {
    await browser.close();
  }
}
