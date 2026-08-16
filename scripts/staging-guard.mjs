const PRODUCTION_URLS = new Set(['https://hanifmhndra-timeline-scele-auth.hf.space']);
const PRODUCTION_PROJECTS = new Set(['timeline-automated-scraper']);

function safeBaseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('STAGING_API_BASE_URL tidak valid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('STAGING_API_BASE_URL harus origin HTTPS tanpa credential/path.');
  }
  if (PRODUCTION_URLS.has(url.origin)) throw new Error('Target production ditolak.');
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') throw new Error('Smoke staging tidak menerima target lokal.');
  return url.origin;
}

export function validateStagingEnvironment(env, { scele = false } = {}) {
  const allowName = scele ? 'ALLOW_SCELE_STAGING_SMOKE' : 'ALLOW_STAGING_SMOKE';
  if (env[allowName] !== 'true') throw new Error(`${allowName}=true wajib disetel secara eksplisit.`);
  const baseUrl = safeBaseUrl(env.STAGING_API_BASE_URL || '');
  const projectId = String(env.STAGING_FIREBASE_PROJECT_ID || '').trim();
  if (!projectId) throw new Error('STAGING_FIREBASE_PROJECT_ID wajib disetel.');
  if (PRODUCTION_PROJECTS.has(projectId) || /^demo-/i.test(projectId)) throw new Error('Firebase project production/demo ditolak untuk staging smoke.');
  if (scele) {
    for (const name of ['STAGING_SCELE_USERNAME', 'STAGING_SCELE_PASSWORD', 'STAGING_FIREBASE_WEB_API_KEY']) {
      if (!env[name]) throw new Error(`${name} wajib disetel.`);
    }
  } else if (!env.STAGING_TEST_ID_TOKEN) {
    throw new Error('STAGING_TEST_ID_TOKEN wajib disetel.');
  }
  return { baseUrl, projectId };
}

export function isProductionTarget(url, projectId) {
  return PRODUCTION_URLS.has(url) || PRODUCTION_PROJECTS.has(projectId);
}
