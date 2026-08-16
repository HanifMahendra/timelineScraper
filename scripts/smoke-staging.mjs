import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateStagingEnvironment } from './staging-guard.mjs';

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function runStagingSmoke({ env = process.env, fetchImpl = fetch, output = console } = {}) {
  const { baseUrl } = validateStagingEnvironment(env);
  const token = env.STAGING_TEST_ID_TOKEN;
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const prefix = `smoke-test-${suffix}`;
  const created = { gradebookId: null, categoryId: null, componentId: null, subjectId: null, topicId: null, draftId: null };
  const cleanupFailures = [];
  let result;
  let primaryError;

  async function request(path, { method = 'GET', body, authenticated = true, expected = [200] } = {}) {
    const { response, body: result } = await parseResponse(await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    if (!expected.includes(response.status)) {
      throw new Error(`Smoke request gagal: ${method} ${path} (${response.status}, requestId=${result.requestId || 'none'}).`);
    }
    return result;
  }

  async function cleanup(label, path, options) {
    try { await request(path, options); }
    catch { cleanupFailures.push({ label, id: created[`${label}Id`] || 'unknown' }); }
  }

  try {
    await request('/health', { authenticated: false });
    await request('/ready', { authenticated: false });
    await request('/gradebooks');
    const unauthorized = await fetchImpl(`${baseUrl}/gradebooks`);
    if (unauthorized.status !== 401) throw new Error('Unauthorized request tidak ditolak dengan HTTP 401.');

    const gradebookResult = await request('/gradebooks', { method: 'POST', body: { courseName: prefix, gradingScale: 'percentage' }, expected: [201] });
    created.gradebookId = gradebookResult.gradebook?.id;
    if (!created.gradebookId) throw new Error('Smoke gradebook ID tidak tersedia.');
    const categoryResult = await request(`/gradebooks/${created.gradebookId}/categories`, { method: 'POST', body: { name: `${prefix}-category`, weight: 100 }, expected: [201] });
    created.categoryId = categoryResult.category?.id;
    if (!created.categoryId) throw new Error('Smoke category ID tidak tersedia.');
    const componentResult = await request(`/gradebooks/${created.gradebookId}/components`, { method: 'POST', body: { name: `${prefix}-component`, componentType: 'assignment', weightMode: 'unknown', scoreStatus: 'pending' }, expected: [201] });
    created.componentId = componentResult.component?.id;
    await request(`/gradebooks/${created.gradebookId}`);
    await request(`/gradebooks/${created.gradebookId}/result`);

    const subjectResult = await request('/subjects', { method: 'POST', body: { displayName: prefix, source: 'manual' }, expected: [201] });
    created.subjectId = subjectResult.subject?.id;
    if (!created.subjectId) throw new Error('Smoke subject ID tidak tersedia.');
    const topicResult = await request(`/subjects/${created.subjectId}/topics`, { method: 'POST', body: { title: `${prefix}-topic`, estimatedMinutes: 30, prerequisiteTopicIds: [] }, expected: [201] });
    created.topicId = topicResult.topic?.id;
    const today = new Date().toISOString().slice(0, 10);
    const draftResult = await request('/study/plans/generate', { method: 'POST', body: { name: prefix, subjectIds: [created.subjectId], startDate: today, endDate: today, dailyMinutes: 30 }, expected: [201] });
    created.draftId = draftResult.draft?.id;
    if (!created.draftId) throw new Error('Smoke study draft ID tidak tersedia.');
    output.info?.(`Staging smoke berhasil untuk resource prefix ${prefix}.`);
    result = { ok: true, prefix, created };
  } catch (error) {
    primaryError = error;
  } finally {
    if (created.draftId) await cleanup('draft', `/study/plan-drafts/${created.draftId}/cancel`, { method: 'POST', body: {} });
    if (created.topicId && created.subjectId) await cleanup('topic', `/subjects/${created.subjectId}/topics/${created.topicId}`, { method: 'DELETE' });
    if (created.subjectId) await cleanup('subject', `/subjects/${created.subjectId}`, { method: 'DELETE' });
    if (created.componentId && created.gradebookId) await cleanup('component', `/gradebooks/${created.gradebookId}/components/${created.componentId}`, { method: 'DELETE' });
    if (created.categoryId && created.gradebookId) await cleanup('category', `/gradebooks/${created.gradebookId}/categories/${created.categoryId}`, { method: 'DELETE' });
    if (created.gradebookId) await cleanup('gradebook', `/gradebooks/${created.gradebookId}`, { method: 'DELETE' });
    if (cleanupFailures.length) {
      output.error?.(`Cleanup staging gagal: ${JSON.stringify(cleanupFailures)}.`);
    }
  }
  if (cleanupFailures.length) {
    const resources = cleanupFailures.map(({ label, id }) => `${label}:${id}`).join(', ');
    throw new Error(`Smoke staging tidak bersih; cleanup manual wajib untuk ${resources}.`);
  }
  if (primaryError) throw primaryError;
  return result;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) runStagingSmoke().catch((error) => { console.error(error.message); process.exitCode = 1; });
