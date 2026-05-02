import { chromium } from 'playwright';

const SCELE_LOGIN_URL = 'https://scele.cs.ui.ac.id/login/index.php';

export async function loginToScele(username, password) {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(SCELE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);

    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined),
      page.click('button[type="submit"], input[type="submit"], #loginbtn'),
    ]);

    const loginError = await page
      .locator('.loginerrors, .alert-danger, [role="alert"]')
      .first()
      .textContent({ timeout: 2000 })
      .catch(() => null);
    const stillOnLogin = page.url().includes('/login/');

    if (stillOnLogin || loginError) {
      throw new Error('Username/password SCELE tidak valid atau login ditolak.');
    }

    const pageHeader = await page.locator('#page-header').count().catch(() => 0);
    if (pageHeader === 0) {
      throw new Error('Login SCELE belum terkonfirmasi.');
    }

    return await context.storageState();
  } finally {
    await browser.close();
  }
}
