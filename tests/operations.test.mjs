import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagingEnvironment } from '../scripts/staging-guard.mjs';
import { runStagingSmoke } from '../scripts/smoke-staging.mjs';
import { scanWorkspace } from '../scripts/secret-scan.mjs';
import { runCommand, summarizeAudit, validateStaticRequirements } from '../scripts/preflight.mjs';
import { isExpectedDemoEmulator } from '../scripts/run-emulator-tests.mjs';
import { validateStagingReadiness } from '../scripts/staging-readiness.mjs';
import { verifyStagingBuildOutput } from '../scripts/build-dashboard-staging.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const safeEnv = {
  ALLOW_STAGING_SMOKE: 'true', STAGING_API_BASE_URL: 'https://academic-staging.example',
  STAGING_FIREBASE_PROJECT_ID: 'academic-staging-2026', STAGING_TEST_ID_TOKEN: 'test-token-placeholder',
};

test('staging smoke guard refuses missing opt-in, production URL, production project, and missing token', () => {
  assert.throws(() => validateStagingEnvironment({}), /ALLOW_STAGING_SMOKE/);
  assert.throws(() => validateStagingEnvironment({ ...safeEnv, STAGING_API_BASE_URL: 'https://hanifmhndra-timeline-scele-auth.hf.space' }), /production/);
  assert.throws(() => validateStagingEnvironment({ ...safeEnv, STAGING_FIREBASE_PROJECT_ID: 'timeline-automated-scraper' }), /production/);
  const { STAGING_TEST_ID_TOKEN: _ignored, ...withoutToken } = safeEnv;
  assert.throws(() => validateStagingEnvironment(withoutToken), /STAGING_TEST_ID_TOKEN/);
});

test('authenticated staging smoke never calls login/scrape and cleans every temporary resource', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url); const method = init.method || 'GET'; const authenticated = Boolean(init.headers?.Authorization);
    calls.push({ path: parsed.pathname, method, authenticated });
    if (parsed.pathname === '/health' || parsed.pathname === '/ready') return Response.json({}, { status: 200 });
    if (parsed.pathname === '/gradebooks' && method === 'GET') return Response.json(authenticated ? { gradebooks: [] } : { error: 'AUTH_TOKEN_MISSING' }, { status: authenticated ? 200 : 401 });
    if (parsed.pathname === '/gradebooks' && method === 'POST') return Response.json({ gradebook: { id: 'grade-smoke' } }, { status: 201 });
    if (parsed.pathname === '/gradebooks/grade-smoke/categories' && method === 'POST') return Response.json({ category: { id: 'category-smoke' } }, { status: 201 });
    if (parsed.pathname === '/gradebooks/grade-smoke/components' && method === 'POST') return Response.json({ component: { id: 'component-smoke' } }, { status: 201 });
    if (parsed.pathname === '/gradebooks/grade-smoke' && method === 'GET') return Response.json({ gradebook: { id: 'grade-smoke' } });
    if (parsed.pathname === '/gradebooks/grade-smoke/result' && method === 'GET') return Response.json({ result: {} });
    if (parsed.pathname === '/subjects' && method === 'POST') return Response.json({ subject: { id: 'subject-smoke' } }, { status: 201 });
    if (parsed.pathname === '/subjects/subject-smoke/topics' && method === 'POST') return Response.json({ topic: { id: 'topic-smoke' } }, { status: 201 });
    if (parsed.pathname === '/study/plans/generate' && method === 'POST') return Response.json({ draft: { id: 'draft-smoke' } }, { status: 201 });
    return Response.json({ ok: true }, { status: 200 });
  };
  const result = await runStagingSmoke({ env: safeEnv, fetchImpl, output: { info() {}, error() {} } });
  assert.equal(result.ok, true);
  assert.equal(calls.some((call) => ['/scrape', '/auth/login'].includes(call.path)), false);
  assert.equal(calls.filter((call) => ['/health', '/ready'].includes(call.path)).every((call) => !call.authenticated), true);
  for (const pathValue of ['/study/plan-drafts/draft-smoke/cancel', '/subjects/subject-smoke/topics/topic-smoke', '/subjects/subject-smoke', '/gradebooks/grade-smoke/components/component-smoke', '/gradebooks/grade-smoke/categories/category-smoke', '/gradebooks/grade-smoke']) {
    assert.equal(calls.some((call) => call.path === pathValue && ['POST', 'DELETE'].includes(call.method)), true);
  }
});

test('staging smoke reports cleanup resource ID without exposing the token', async () => {
  const errors = [];
  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url); const method = init.method || 'GET'; const authenticated = Boolean(init.headers?.Authorization);
    if (pathname === '/health' || pathname === '/ready') return Response.json({});
    if (pathname === '/gradebooks' && method === 'GET') return Response.json(authenticated ? { gradebooks: [] } : {}, { status: authenticated ? 200 : 401 });
    if (pathname === '/gradebooks' && method === 'POST') return Response.json({ gradebook: { id: 'g' } }, { status: 201 });
    if (pathname === '/gradebooks/g/categories' && method === 'POST') return Response.json({ category: { id: 'k' } }, { status: 201 });
    if (pathname === '/gradebooks/g/components' && method === 'POST') return Response.json({ component: { id: 'c' } }, { status: 201 });
    if (pathname === '/subjects' && method === 'POST') return Response.json({ subject: { id: 's' } }, { status: 201 });
    if (pathname === '/subjects/s/topics' && method === 'POST') return Response.json({ topic: { id: 't' } }, { status: 201 });
    if (pathname === '/study/plans/generate') return Response.json({ draft: { id: 'd' } }, { status: 201 });
    if (pathname === '/subjects/s' && method === 'DELETE') return Response.json({ error: 'failed' }, { status: 500 });
    return Response.json({ ok: true });
  };
  await assert.rejects(runStagingSmoke({ env: safeEnv, fetchImpl, output: { info() {}, error: (value) => errors.push(value) } }), /cleanup manual wajib/);
  assert.match(errors.join(' '), /"id":"s"/); assert.equal(errors.join(' ').includes(safeEnv.STAGING_TEST_ID_TOKEN), false);
});

test('staging readiness accepts only a complete isolated mapping and rejects production mixing', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase7-staging-'));
  fs.mkdirSync(path.join(directory, 'timeline-scele-auth'));
  fs.mkdirSync(path.join(directory, 'dashboard'));
  const projectId = 'academic-staging-2026';
  fs.writeFileSync(path.join(directory, 'timeline-scele-auth', '.env.staging'), [
    'APP_ENV=staging', `FIREBASE_PROJECT_ID=${projectId}`, `STAGING_FIREBASE_PROJECT_ID=${projectId}`,
    `FIREBASE_SERVICE_ACCOUNT_JSON=${JSON.stringify({ project_id: projectId, client_email: 'service@academic-staging-2026.iam.gserviceaccount.com', private_key: 'test-only' })}`,
    `SESSION_ENCRYPTION_KEY=${Buffer.alloc(32, 7).toString('base64')}`,
    'ALLOWED_ORIGINS=https://academic-staging-2026.web.app',
    'STAGING_API_BASE_URL=https://hanifmhndra-timeline-scele-auth-staging.hf.space',
    'STAGING_HF_SPACE_ID=hanifmhndra/timeline-scele-auth-staging',
    'ALLOW_PRODUCTION_TARGETS=false',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, 'dashboard', '.env.staging'), [
    'NEXT_PUBLIC_FIREBASE_API_KEY=test-only-public-key',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=academic-staging-2026.firebaseapp.com',
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${projectId}`,
    'NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:test-only',
    'NEXT_PUBLIC_AUTH_API_BASE_URL=https://hanifmhndra-timeline-scele-auth-staging.hf.space',
    'STAGING_HOSTING_TARGET=staging',
    'STAGING_HOSTING_SITE_ID=academic-staging-2026',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, '.firebaserc'), JSON.stringify({
    projects: { staging: projectId },
    targets: { [projectId]: { hosting: { staging: ['academic-staging-2026'] } } },
  }));
  assert.deepEqual(validateStagingReadiness({ root: directory }).blockers, []);
  fs.appendFileSync(path.join(directory, 'dashboard', '.env.staging'), '\nNEXT_PUBLIC_FIREBASE_PROJECT_ID=timeline-automated-scraper\n');
  assert.equal(validateStagingReadiness({ root: directory }).ok, false);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('staging build verifier requires staging identity and rejects production identity', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase7-build-'));
  fs.writeFileSync(path.join(directory, 'artifact.js'), 'project=academic-staging-2026;api=https://staging-api.test');
  assert.deepEqual(verifyStagingBuildOutput({
    outDir: directory,
    requiredValues: [
      { label: 'Firebase project', value: 'academic-staging-2026' },
      { label: 'API origin', value: 'https://staging-api.test' },
    ],
  }), []);
  fs.appendFileSync(path.join(directory, 'artifact.js'), ';project=timeline-automated-scraper');
  assert.match(verifyStagingBuildOutput({
    outDir: directory,
    requiredValues: [{ label: 'Firebase project', value: 'academic-staging-2026' }],
  }).join(' '), /Identifier production/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('secret scan detects a private key by type and never returns its content', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-secret-scan-'));
  fs.writeFileSync(path.join(directory, 'leak.txt'), `${['-----BEGIN', 'PRIVATE KEY-----'].join(' ')}\nvery-secret-material`);
  const findings = scanWorkspace(directory);
  assert.deepEqual(findings, [{ file: 'leak.txt', type: 'private-key' }]);
  assert.equal(JSON.stringify(findings).includes('very-secret-material'), false);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('preflight helpers report failing commands, malformed audits, missing config, and current static success', () => {
  const messages = []; const output = { log: (value) => messages.push(value), error: (value) => messages.push(value) };
  assert.equal(runCommand({ label: 'failure-test', command: process.execPath, args: ['-e', 'process.exit(2)'], cwd: root }, output).ok, false);
  assert.equal(messages.some((message) => message.includes('FAIL failure-test')), true);
  assert.equal(summarizeAudit('not-json'), null);
  const missing = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-preflight-'));
  assert.equal(validateStaticRequirements(missing).length > 0, true);
  fs.rmSync(missing, { recursive: true, force: true });
  assert.deepEqual(validateStaticRequirements(root), []);
});

test('emulator cleanup guard only recognizes this repository demo process', () => {
  const rules = path.join(root, 'firestore.rules');
  const expected = { name: 'java.exe', commandLine: `java -jar cloud-firestore-emulator.jar --port 8181 --project_id demo-scele-timeline --rules "${rules}"` };
  assert.equal(isExpectedDemoEmulator(expected, root), true);
  assert.equal(isExpectedDemoEmulator({ ...expected, commandLine: expected.commandLine.replace('demo-scele-timeline', 'production-project') }, root), false);
  assert.equal(isExpectedDemoEmulator({ ...expected, commandLine: expected.commandLine.replace('8181', '8080') }, root), false);
  assert.equal(isExpectedDemoEmulator({ ...expected, name: 'node.exe' }, root), false);
});
