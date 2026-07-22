import type { CatalogSubject, CuratedResource, Difficulty, FallbackResource, StudyDraft, StudyPlan, StudyPreferences, StudySession, StudySubject, StudyTopic, SubjectMatch } from './types';
import { getApiBaseUrl, networkApiError, safeErrorBody, SafeApiError } from '@/lib/apiErrors';

const BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;
export class StudyApiError extends SafeApiError { constructor(body: ReturnType<typeof safeErrorBody>, status?: number) { super(body, 'Permintaan rencana belajar gagal.', status); this.name = 'StudyApiError'; } }
async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl(BASE_URL); let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } }); }
  catch (error) { throw networkApiError('Permintaan rencana belajar gagal.', error); }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new StudyApiError(safeErrorBody(body), response.status);
  return body as T;
}
const encoded = (value: string) => encodeURIComponent(value);

export const listSubjects = (token: string) => request<{ subjects: StudySubject[] }>(token, '/subjects');
export const createSubject = (token: string, input: { displayName: string; source: 'manual' }) => request<{ subject: StudySubject }>(token, '/subjects', { method: 'POST', body: JSON.stringify(input) });
export const syncSubjects = (token: string) => request<{ created: StudySubject[] }>(token, '/subjects/sync-from-courses', { method: 'POST', body: '{}' });
export const getSubject = (token: string, id: string) => request<{ subject: StudySubject; topics: StudyTopic[]; progress: StudySubject['progress'] }>(token, `/subjects/${encoded(id)}`);
export const getCatalog = (token: string) => request<{ subjects: CatalogSubject[] }>(token, '/subjects/catalog');
export const matchSubject = (token: string, id: string) => request<{ match: SubjectMatch }>(token, `/subjects/${encoded(id)}/match-catalog`, { method: 'POST', body: '{}' });
export const applyCatalog = (token: string, id: string, catalogSubjectKey: string) => request<{ subject: StudySubject; createdTopics: StudyTopic[] }>(token, `/subjects/${encoded(id)}/apply-catalog`, { method: 'POST', body: JSON.stringify({ catalogSubjectKey }) });
export const createTopic = (token: string, subjectId: string, input: { title: string; estimatedMinutes: number; difficulty: Difficulty }) => request<{ topic: StudyTopic }>(token, `/subjects/${encoded(subjectId)}/topics`, { method: 'POST', body: JSON.stringify(input) });
export const updateTopic = (token: string, subjectId: string, topicId: string, input: Partial<StudyTopic>) => request<{ topic: StudyTopic }>(token, `/subjects/${encoded(subjectId)}/topics/${encoded(topicId)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const getPreferences = (token: string) => request<{ preferences: StudyPreferences }>(token, '/study/preferences');
export const updatePreferences = (token: string, input: StudyPreferences) => request<{ preferences: StudyPreferences }>(token, '/study/preferences', { method: 'PATCH', body: JSON.stringify(input) });
export const listPlans = (token: string) => request<{ plans: StudyPlan[] }>(token, '/study/plans');
export const getPlan = (token: string, id: string) => request<{ plan: StudyPlan; sessions: StudySession[] }>(token, `/study/plans/${encoded(id)}`);
export const generatePlan = (token: string, input: { name: string; subjectIds: string[]; startDate: string; endDate: string; dailyMinutes: number; existingPlanId?: string }) => request<{ draft: StudyDraft; sessions: StudySession[]; preservedSessions: StudySession[] }>(token, '/study/plans/generate', { method: 'POST', body: JSON.stringify(input) });
export const applyDraft = (token: string, draft: StudyDraft) => request<{ planId: string; alreadyApplied: boolean }>(token, `/study/plan-drafts/${encoded(draft.id)}/apply`, { method: 'POST', body: JSON.stringify({ expectedVersion: draft.version, applyToken: draft.applyToken }) });
export const updateSession = (token: string, planId: string, sessionId: string, input: Partial<Pick<StudySession, 'status' | 'actualMinutes' | 'scheduledDate' | 'startTime'>>) => request<{ session: StudySession }>(token, `/study/plans/${encoded(planId)}/sessions/${encoded(sessionId)}`, { method: 'PATCH', body: JSON.stringify(input) });
export const recommendResources = (token: string, subjectId: string, topicId?: string) => request<{ curated: CuratedResource[]; fallback: FallbackResource[] }>(token, `/study/resources/recommendations?subjectId=${encoded(subjectId)}${topicId ? `&topicId=${encoded(topicId)}` : ''}`);
