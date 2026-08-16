import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateStagingReadiness } from './staging-readiness.mjs';

export const REQUIRED_DOCS = [
  'AGENTS.md', 'AI.md', 'DEPLOYMENT.md', 'CHANGELOG.md', 'firestore.rules', 'firestore.indexes.json',
  'docs/FIRESTORE_SCHEMA.md', 'docs/GRADE_CALCULATION.md', 'docs/GRADE_IMPORT.md', 'docs/STUDY_PLAN.md',
  'docs/LEARNING_RESOURCES.md', 'docs/DEPENDENCY_SECURITY.md', 'docs/STAGING.md', 'docs/BACKUP_RECOVERY.md',
  'docs/DATA_RETENTION.md', 'docs/RELEASE_CHECKLIST.md', 'docs/OBSERVABILITY.md',
  'docs/STAGING_VERIFICATION_REPORT.md',
  'timeline-scele-auth/.env.example', 'timeline-scele-auth/.env.staging.example',
  'dashboard/.env.example', 'dashboard/.env.staging.example',
];

const BACKEND_ENV = [
  'APP_ENV', 'PORT', 'APP_VERSION', 'BUILD_SHA', 'BUILD_TIMESTAMP', 'FIREBASE_PROJECT_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON', 'SESSION_ENCRYPTION_KEY', 'ALLOWED_ORIGINS',
  'PRODUCTION_FIREBASE_PROJECT_IDS', 'PRODUCTION_API_BASE_URLS', 'STAGING_API_BASE_URL',
  'STAGING_FIREBASE_PROJECT_ID', 'PRODUCTION_DASHBOARD_ORIGINS',
  'ALLOW_PRODUCTION_TARGETS', 'REQUIRE_FIRESTORE_EMULATOR', 'TRUST_PROXY_HOPS',
  'REQUEST_TIMEOUT_MS', 'IMPORT_REQUEST_TIMEOUT_MS', 'SCRAPE_REQUEST_TIMEOUT_MS', 'SHUTDOWN_GRACE_MS',
  'RATE_LIMIT_WINDOW_MS', 'AUTH_LOGIN_RATE_LIMIT', 'IMPORT_UPLOAD_RATE_LIMIT', 'STUDY_PLAN_RATE_LIMIT',
  'SCRAPE_COOLDOWN_SECONDS', 'SCRAPE_LOCK_TTL_SECONDS', 'SCRAPE_RUN_RETENTION_COUNT', 'ACTIVITY_HISTORY_RETENTION_COUNT',
  'MAX_GRADEBOOKS_PER_USER', 'MAX_CATEGORIES_PER_GRADEBOOK', 'MAX_COMPONENTS_PER_GRADEBOOK', 'MAX_SCENARIOS_PER_GRADEBOOK',
  'MAX_IMPORT_FILE_BYTES', 'MAX_IMPORT_ROWS', 'MAX_IMPORT_COLUMNS', 'MAX_IMPORT_SHEETS', 'MAX_IMPORT_CELL_LENGTH',
  'MAX_IMPORT_TOTAL_CELLS', 'MAX_IMPORT_DRAFTS_PER_GRADEBOOK', 'IMPORT_DRAFT_TTL_HOURS',
  'IMPORT_DRAFT_RETENTION_COUNT', 'MAX_IMPORT_COMMIT_ENTITIES', 'MAX_IMPORT_XLSX_UNCOMPRESSED_BYTES',
  'MAX_IMPORT_ZIP_ENTRIES', 'MAX_SUBJECTS_PER_USER',
  'MAX_TOPICS_PER_SUBJECT', 'MAX_STUDY_PLANS_PER_USER', 'MAX_SESSIONS_PER_PLAN', 'MAX_PLAN_HORIZON_DAYS',
  'MAX_DAILY_STUDY_MINUTES', 'MAX_RESOURCES_PER_TOPIC', 'MAX_PLAN_DRAFTS_PER_USER', 'STUDY_PLAN_DRAFT_TTL_HOURS',
];
const DASHBOARD_ENV = ['NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID', 'NEXT_PUBLIC_AUTH_API_BASE_URL'];

export function validateStaticRequirements(root) {
  const failures = [];
  for (const file of REQUIRED_DOCS) if (!fs.existsSync(path.join(root, file))) failures.push(`missing:${file}`);
  try { JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8')); }
  catch { failures.push('invalid:firestore.indexes.json'); }
  for (const [file, names] of [['timeline-scele-auth/.env.example', BACKEND_ENV], ['dashboard/.env.example', DASHBOARD_ENV]]) {
    const content = fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
    for (const name of names) if (!new RegExp(`^${name}=`, 'm').test(content)) failures.push(`missing-env:${file}:${name}`);
  }
  return failures;
}

export function summarizeAudit(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed.metadata?.vulnerabilities || { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  } catch {
    return null;
  }
}

export function auditWithinPolicy(summary) {
  return Boolean(summary) && summary.high === 0 && summary.critical === 0;
}

const NPM_CLI = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
function npmInvocation(args) { return { command: process.execPath, args: [NPM_CLI, ...args] }; }

function tail(value, lines = 8) {
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(-lines).join('\n');
}

export function runCommand({ label, command, args, cwd, allowFailure = false, quiet = false }, output = console) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: process.env, shell: false, timeout: 300_000 });
  const ok = result.status === 0;
  output.log(`${ok ? 'PASS' : allowFailure ? 'WARN' : 'FAIL'} ${label}`);
  if (!quiet && !ok) {
    const detail = [tail(result.stdout, 12), tail(result.stderr, 12), tail(result.error?.message, 4)]
      .filter(Boolean)
      .join('\n');
    if (detail) output.error(detail);
  }
  return { ok, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', error: result.error };
}

function syntaxCheck(root, output) {
  const source = path.join(root, 'timeline-scele-auth', 'src');
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute); else if (entry.name.endsWith('.js')) files.push(absolute);
    }
  };
  walk(source);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 20_000 });
    if (result.status !== 0) { output.error(`FAIL backend syntax: ${path.relative(root, file)}`); return false; }
  }
  output.log(`PASS backend syntax (${files.length} files)`); return true;
}

function gitStatus(root) {
  const result = spawnSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
  return result.stdout || '';
}

function staleClaudeReferences(root) {
  const result = spawnSync('rg', ['-n', 'CLAUDE\\.md', '-g', '!scripts/preflight.mjs', '-g', '!**/node_modules/**', '-g', '!dashboard/.next/**', '-g', '!dashboard/out/**'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function audit(root, label, cwd, args, output) {
  const npm = npmInvocation(['audit', '--json', ...args]);
  const result = runCommand({ label, ...npm, cwd, allowFailure: true, quiet: true }, output);
  const summary = summarizeAudit(result.stdout);
  if (!summary) { output.error(`FAIL ${label}: audit JSON tidak dapat dibaca.`); return false; }
  output.log(`  ${JSON.stringify(summary)}`);
  return auditWithinPolicy(summary);
}

export async function runPreflight({ root, output = console, requireStaging = false } = {}) {
  let criticalFailure = false;
  let staging = null;
  const status = gitStatus(root);
  if (status.trim()) output.warn(`WARN worktree memiliki perubahan yang belum di-commit (${status.trim().split(/\r?\n/).length} entries).`);
  else output.log('PASS worktree clean.');

  const staticFailures = validateStaticRequirements(root);
  if (staticFailures.length) { criticalFailure = true; staticFailures.forEach((failure) => output.error(`FAIL ${failure}`)); }
  else output.log('PASS docs, environment examples, and index JSON.');
  const stale = staleClaudeReferences(root);
  if (stale) { criticalFailure = true; output.error(`FAIL stale CLAUDE.md references:\n${stale}`); }
  else output.log('PASS no stale CLAUDE.md references.');
  if (/dashboard\/(?:out|\.next)\//.test(status.replaceAll('\\', '/'))) { criticalFailure = true; output.error('FAIL generated dashboard output appears in worktree changes.'); }
  else output.log('PASS no generated dashboard source edits.');

  if (requireStaging) {
    staging = validateStagingReadiness({ root });
    if (!staging.ok) {
      criticalFailure = true;
      for (const blocker of staging.blockers) output.error(`BLOCKER ${blocker.code}: ${blocker.message}`);
    }
  }

  const backend = path.join(root, 'timeline-scele-auth'); const dashboard = path.join(root, 'dashboard');
  const npmConfig = npmInvocation(['run', 'check:config']);
  const npmCatalog = npmInvocation(['run', 'check:catalog']);
  const npmBackendTest = npmInvocation(['test']);
  const npmRootTest = npmInvocation(['test']);
  const npmLint = npmInvocation(['run', 'lint']);
  const npmBuild = npmInvocation(['run', 'build']);
  const npmEmulator = npmInvocation(['run', 'test:emulator']);
  const commands = [
    ['safe config validation', npmConfig.command, npmConfig.args, backend],
    ['curated catalog validation', npmCatalog.command, npmCatalog.args, backend],
    ['backend tests', npmBackendTest.command, npmBackendTest.args, backend],
    ['root tests', npmRootTest.command, npmRootTest.args, root],
    ['dashboard lint', npmLint.command, npmLint.args, dashboard],
    ['dashboard TypeScript', process.execPath, [path.join(dashboard, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], dashboard],
    ...(requireStaging
      ? staging?.ok
        ? [['dashboard staging static build', process.execPath, [path.join(root, 'scripts', 'build-dashboard-staging.mjs')], root]]
        : []
      : [['dashboard static build', npmBuild.command, npmBuild.args, dashboard]]),
    ['Firestore emulator integration and rules', npmEmulator.command, npmEmulator.args, root],
    ['secret scan', process.execPath, ['scripts/secret-scan.mjs'], root],
  ];
  for (const [label, command, args, cwd] of commands) {
    if (!runCommand({ label, command, args, cwd }, output).ok) criticalFailure = true;
  }
  if (!syntaxCheck(root, output)) criticalFailure = true;
  if (!audit(root, 'root production audit', root, ['--omit=dev'], output)) criticalFailure = true;
  if (!audit(root, 'root full audit', root, [], output)) criticalFailure = true;
  if (!audit(root, 'dashboard production audit', dashboard, ['--omit=dev'], output)) criticalFailure = true;
  if (!audit(root, 'dashboard full audit', dashboard, [], output)) criticalFailure = true;
  if (!audit(root, 'backend production audit', backend, ['--omit=dev'], output)) criticalFailure = true;
  if (!audit(root, 'backend full audit', backend, [], output)) criticalFailure = true;
  if (requireStaging && !staging?.ok) output.error('BLOCKER dashboard staging static build dilewati karena target staging belum aman.');
  if (requireStaging) output.log(criticalFailure ? 'STAGING_BLOCKED' : 'READY_FOR_STAGING');
  else output.log(criticalFailure ? 'PREFLIGHT FAILED' : 'PREFLIGHT PASSED');
  return { ok: !criticalFailure, staging };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const requireStaging = process.argv.includes('--staging');
  runPreflight({ root, requireStaging }).then((result) => { if (!result.ok) process.exitCode = 1; }).catch((error) => { console.error(`${requireStaging ? 'STAGING_BLOCKED' : 'PREFLIGHT FAILED'}: ${error.message}`); process.exitCode = 1; });
}
