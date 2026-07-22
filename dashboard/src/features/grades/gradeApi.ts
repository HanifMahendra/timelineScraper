import type {
  CategoryInput,
  ComponentInput,
  Gradebook,
  GradebookDetail,
  GradebookInput,
  GradebookResult,
  GradebookSummary,
  GradeCategory,
  GradeComponent,
  GradeScenario,
  ScenarioInput,
} from './types';
import { getApiBaseUrl, networkApiError, safeErrorBody, SafeApiError } from '@/lib/apiErrors';

const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;

export class GradeApiError extends SafeApiError {
  constructor(body: ReturnType<typeof safeErrorBody>, fallback: string, status?: number) {
    super(body, fallback, status);
    this.name = 'GradeApiError';
  }
}

async function gradeRequest<T>(
  idToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl(AUTH_API_BASE_URL);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${idToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  } catch (error) { throw networkApiError('Permintaan grade tracker gagal.', error); }
  const raw: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GradeApiError(safeErrorBody(raw), 'Permintaan grade tracker gagal.', response.status);
  }
  return raw as T;
}

export async function listGradebooks(idToken: string) {
  return gradeRequest<{ gradebooks: GradebookSummary[] }>(
    idToken,
    '/gradebooks'
  );
}

export async function createGradebook(
  idToken: string,
  input: GradebookInput
) {
  return gradeRequest<{ gradebook: Gradebook }>(idToken, '/gradebooks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getGradebook(idToken: string, gradebookId: string) {
  return gradeRequest<GradebookDetail>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}`
  );
}

export async function updateGradebook(
  idToken: string,
  gradebookId: string,
  input: Partial<GradebookInput>
) {
  return gradeRequest<{ gradebook: Gradebook }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  );
}

export async function archiveGradebook(
  idToken: string,
  gradebookId: string
) {
  return gradeRequest<{ gradebook: Gradebook }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}`,
    { method: 'DELETE' }
  );
}

export async function createCategory(
  idToken: string,
  gradebookId: string,
  input: CategoryInput
) {
  return gradeRequest<{ category: GradeCategory }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/categories`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function updateCategory(
  idToken: string,
  gradebookId: string,
  categoryId: string,
  input: Partial<CategoryInput>
) {
  return gradeRequest<{ category: GradeCategory }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/categories/${encodeURIComponent(categoryId)}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  );
}

export async function archiveCategory(
  idToken: string,
  gradebookId: string,
  categoryId: string
) {
  return gradeRequest<{ category: GradeCategory }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/categories/${encodeURIComponent(categoryId)}`,
    { method: 'DELETE' }
  );
}

export async function createComponent(
  idToken: string,
  gradebookId: string,
  input: ComponentInput
) {
  return gradeRequest<{ component: GradeComponent }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/components`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function updateComponent(
  idToken: string,
  gradebookId: string,
  componentId: string,
  input: Partial<ComponentInput>
) {
  return gradeRequest<{ component: GradeComponent }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/components/${encodeURIComponent(componentId)}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  );
}

export async function archiveComponent(
  idToken: string,
  gradebookId: string,
  componentId: string
) {
  return gradeRequest<{ component: GradeComponent }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/components/${encodeURIComponent(componentId)}`,
    { method: 'DELETE' }
  );
}

export async function getGradebookResult(
  idToken: string,
  gradebookId: string
) {
  return gradeRequest<{ result: GradebookResult }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/result`
  );
}

export async function createScenario(
  idToken: string,
  gradebookId: string,
  input: ScenarioInput
) {
  return gradeRequest<{ scenario: GradeScenario }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/scenarios`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function updateScenario(
  idToken: string,
  gradebookId: string,
  scenarioId: string,
  input: Partial<ScenarioInput>
) {
  return gradeRequest<{ scenario: GradeScenario }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/scenarios/${encodeURIComponent(scenarioId)}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  );
}

export async function archiveScenario(
  idToken: string,
  gradebookId: string,
  scenarioId: string
) {
  return gradeRequest<{ scenario: GradeScenario }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/scenarios/${encodeURIComponent(scenarioId)}`,
    { method: 'DELETE' }
  );
}

export async function calculateScenario(
  idToken: string,
  gradebookId: string,
  scenarioId: string
) {
  return gradeRequest<{
    scenario: GradeScenario;
    result: GradebookResult;
  }>(
    idToken,
    `/gradebooks/${encodeURIComponent(gradebookId)}/scenarios/${encodeURIComponent(scenarioId)}/calculate`,
    { method: 'POST' }
  );
}
