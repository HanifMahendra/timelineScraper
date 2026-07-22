import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnvFile, validateStagingReadiness } from './staging-readiness.mjs';

const FORBIDDEN_BUILD_VALUES = [
  'timeline-automated-scraper',
  'hanifmhndra-timeline-scele-auth.hf.space',
];

function textFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (/\.(?:css|html|js|json|txt)$/i.test(entry.name)) files.push(absolute);
    }
  };
  if (fs.existsSync(directory)) walk(directory);
  return files;
}

export function verifyStagingBuildOutput({ outDir, requiredValues, forbiddenValues = FORBIDDEN_BUILD_VALUES }) {
  const contents = textFiles(outDir).map((file) => fs.readFileSync(file, 'utf8'));
  if (contents.length === 0) return ['dashboard/out tidak berisi static artifact yang dapat diverifikasi.'];
  const failures = [];
  for (const { label, value } of requiredValues) {
    if (!contents.some((content) => content.includes(value))) failures.push(`${label} staging tidak ditemukan dalam static artifact.`);
  }
  for (const value of forbiddenValues) {
    if (contents.some((content) => content.includes(value))) failures.push('Identifier production ditemukan dalam static artifact staging.');
  }
  return [...new Set(failures)];
}

export function runStagingDashboardBuild({ root, output = console } = {}) {
  const readiness = validateStagingReadiness({ root });
  if (!readiness.ok) {
    throw new Error(`Build staging ditolak: ${readiness.blockers.map(({ code }) => code).join(', ')}.`);
  }
  const dashboard = path.join(root, 'dashboard');
  const dashboardEnv = parseEnvFile(path.join(dashboard, '.env.staging'));
  const publicEnvironment = Object.fromEntries(
    Object.entries(dashboardEnv).filter(([key]) => key.startsWith('NEXT_PUBLIC_'))
  );
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const build = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
    cwd: dashboard,
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 300_000,
    env: { ...process.env, ...publicEnvironment, NODE_ENV: 'production' },
  });
  if (build.status !== 0) throw new Error('Build dashboard staging gagal.');
  const failures = verifyStagingBuildOutput({
    outDir: path.join(dashboard, 'out'),
    requiredValues: [
      { label: 'Firebase project', value: dashboardEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
      { label: 'API origin', value: dashboardEnv.NEXT_PUBLIC_AUTH_API_BASE_URL },
    ],
  });
  if (failures.length) throw new Error(`Artifact staging ditolak: ${failures.join(' ')}`);
  output.log('PASS dashboard staging artifact identity verified.');
  return { ok: true, summary: readiness.summary };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try { runStagingDashboardBuild({ root }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
