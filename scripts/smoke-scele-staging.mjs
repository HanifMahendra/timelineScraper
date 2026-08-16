import { pathToFileURL } from 'node:url';
import { validateStagingEnvironment } from './staging-guard.mjs';

export async function runSceleStagingSmoke({ env = process.env, fetchImpl = fetch, output = console } = {}) {
  const { baseUrl } = validateStagingEnvironment(env, { scele: true });
  const login = await fetchImpl(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.STAGING_SCELE_USERNAME, password: env.STAGING_SCELE_PASSWORD }),
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok || !loginBody.customToken) throw new Error(`SCELE staging login gagal (requestId=${loginBody.requestId || 'none'}).`);

  const exchange = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(env.STAGING_FIREBASE_WEB_API_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: loginBody.customToken, returnSecureToken: true }),
  });
  const exchangeBody = await exchange.json().catch(() => ({}));
  if (!exchange.ok || !exchangeBody.idToken) throw new Error('Firebase staging token exchange gagal.');
  const headers = { Authorization: `Bearer ${exchangeBody.idToken}` };
  try {
    const scrape = await fetchImpl(`${baseUrl}/scrape`, { method: 'POST', headers });
    const body = await scrape.json().catch(() => ({}));
    if (!scrape.ok) throw new Error(`Satu scrape staging gagal (status=${scrape.status}, requestId=${body.requestId || 'none'}).`);
    output.info?.(`SCELE staging smoke selesai satu kali; runId=${body.runId || 'unknown'}.`);
    return { ok: true, runId: body.runId || null };
  } finally {
    await fetchImpl(`${baseUrl}/auth/logout`, { method: 'POST', headers }).catch(() => undefined);
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) runSceleStagingSmoke().catch((error) => { console.error(error.message); process.exitCode = 1; });
