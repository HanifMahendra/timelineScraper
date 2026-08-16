import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../timeline-scele-auth/src/config.js';

const PRODUCTION_PROJECTS = new Set(['timeline-automated-scraper']);
const PRODUCTION_API_ORIGINS = new Set(['https://hanifmhndra-timeline-scele-auth.hf.space']);
const PRODUCTION_DASHBOARD_ORIGINS = new Set([
  'https://timeline-automated-scraper.web.app',
  'https://timeline-automated-scraper.firebaseapp.com',
]);

function placeholder(value) {
  return !value || /^<.*>$/.test(value) || /(?:replace[-_ ]?me|placeholder)/i.test(value);
}

export function parseEnvFile(file) {
  const result = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function origin(value, variable, blockers) {
  if (placeholder(value)) {
    blockers.push({ code: 'MISSING_VALUE', message: `${variable} belum memiliki nilai staging.` });
    return '';
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('unsafe');
    return parsed.origin;
  } catch {
    blockers.push({ code: 'INVALID_ORIGIN', message: `${variable} harus berupa origin HTTPS yang aman.` });
    return '';
  }
}

function required(values, variable, blockers) {
  const value = String(values[variable] || '').trim();
  if (placeholder(value)) blockers.push({ code: 'MISSING_VALUE', message: `${variable} belum memiliki nilai staging.` });
  return value;
}

function readJson(file, blockers, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { blockers.push({ code: 'INVALID_FILE', message: `${label} tidak tersedia atau bukan JSON valid.` }); return null; }
}

export function validateStagingReadiness({ root, env = process.env } = {}) {
  const blockers = [];
  const backendFile = path.resolve(root, env.STAGING_BACKEND_ENV_FILE || 'timeline-scele-auth/.env.staging');
  const dashboardFile = path.resolve(root, env.STAGING_DASHBOARD_ENV_FILE || 'dashboard/.env.staging');
  const firebaseRcFile = path.join(root, '.firebaserc');
  const backend = fs.existsSync(backendFile) ? parseEnvFile(backendFile) : null;
  const dashboard = fs.existsSync(dashboardFile) ? parseEnvFile(dashboardFile) : null;

  if (!backend) blockers.push({ code: 'MISSING_BACKEND_ENV', message: 'timeline-scele-auth/.env.staging belum tersedia.' });
  if (!dashboard) blockers.push({ code: 'MISSING_DASHBOARD_ENV', message: 'dashboard/.env.staging belum tersedia.' });

  let backendConfig = null;
  if (backend) {
    try { backendConfig = loadConfig(backend); }
    catch (error) { blockers.push({ code: error.code || 'BACKEND_CONFIG_INVALID', message: error.message || 'Konfigurasi backend staging tidak valid.' }); }
  }

  const projectId = backendConfig?.firebaseProjectId || backend?.FIREBASE_PROJECT_ID || dashboard?.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
  if (projectId && PRODUCTION_PROJECTS.has(projectId)) blockers.push({ code: 'PRODUCTION_PROJECT', message: 'Firebase project production terdeteksi.' });
  if (projectId && /^demo-/i.test(projectId)) blockers.push({ code: 'DEMO_PROJECT', message: 'Firebase demo project tidak dapat menjadi staging.' });

  let apiOrigin = '';
  let dashboardOrigin = '';
  if (backend && dashboard) {
    apiOrigin = origin(backend.STAGING_API_BASE_URL, 'STAGING_API_BASE_URL', blockers);
    const dashboardApiOrigin = origin(dashboard.NEXT_PUBLIC_AUTH_API_BASE_URL, 'NEXT_PUBLIC_AUTH_API_BASE_URL', blockers);
    if (apiOrigin && dashboardApiOrigin && apiOrigin !== dashboardApiOrigin) blockers.push({ code: 'MIXED_API_ENVIRONMENT', message: 'Backend dan dashboard memakai API staging yang berbeda.' });
    if (apiOrigin && PRODUCTION_API_ORIGINS.has(apiOrigin)) blockers.push({ code: 'PRODUCTION_API', message: 'Backend URL production terdeteksi.' });
    if (dashboard.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId) blockers.push({ code: 'MIXED_FIREBASE_ENVIRONMENT', message: 'Project Firebase dashboard tidak sama dengan backend staging.' });
    dashboardOrigin = origin(backend.ALLOWED_ORIGINS, 'ALLOWED_ORIGINS', blockers);
    if (dashboardOrigin && PRODUCTION_DASHBOARD_ORIGINS.has(dashboardOrigin)) blockers.push({ code: 'PRODUCTION_DASHBOARD', message: 'Origin dashboard production terdeteksi.' });
    for (const variable of ['NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_APP_ID']) required(dashboard, variable, blockers);
  }

  const spaceId = backend ? required(backend, 'STAGING_HF_SPACE_ID', blockers) : '';
  if (spaceId === 'hanifmhndra/timeline-scele-auth') blockers.push({ code: 'PRODUCTION_SPACE', message: 'Hugging Face Space production terdeteksi.' });
  if (spaceId && apiOrigin) {
    const expectedHost = `${spaceId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.hf.space`;
    if (new URL(apiOrigin).hostname !== expectedHost) blockers.push({ code: 'SPACE_URL_MISMATCH', message: 'STAGING_HF_SPACE_ID tidak cocok dengan STAGING_API_BASE_URL.' });
  }

  const hostingTarget = dashboard ? required(dashboard, 'STAGING_HOSTING_TARGET', blockers) : '';
  const hostingSiteId = dashboard ? required(dashboard, 'STAGING_HOSTING_SITE_ID', blockers) : '';
  if (dashboardOrigin && hostingSiteId) {
    const host = new URL(dashboardOrigin).hostname;
    if (![`${hostingSiteId}.web.app`, `${hostingSiteId}.firebaseapp.com`].includes(host)) blockers.push({ code: 'HOSTING_ORIGIN_MISMATCH', message: 'ALLOWED_ORIGINS tidak cocok dengan site Hosting staging.' });
  }

  const firebaseRc = readJson(firebaseRcFile, blockers, '.firebaserc');
  if (firebaseRc && projectId) {
    if (firebaseRc.projects?.staging !== projectId) blockers.push({ code: 'MISSING_FIREBASE_ALIAS', message: 'Alias Firebase staging belum menunjuk project staging.' });
    const sites = firebaseRc.targets?.[projectId]?.hosting?.[hostingTarget] || [];
    if (!hostingTarget || !hostingSiteId || !sites.includes(hostingSiteId)) blockers.push({ code: 'MISSING_HOSTING_TARGET', message: 'Hosting target staging belum terikat ke site staging.' });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    summary: {
      projectId: projectId || null,
      apiOrigin: apiOrigin || null,
      dashboardOrigin: dashboardOrigin || null,
      spaceId: spaceId || null,
      hostingTarget: hostingTarget || null,
      hostingSiteId: hostingSiteId || null,
    },
  };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = validateStagingReadiness({ root });
  for (const blocker of result.blockers) console.error(`BLOCKER ${blocker.code}: ${blocker.message}`);
  console.log(result.ok ? 'READY_FOR_STAGING' : 'STAGING_BLOCKED');
  if (!result.ok) process.exitCode = 1;
}
