import { getApiBaseUrl, networkApiError, safeErrorBody, SafeApiError } from './apiErrors';

const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;

async function taskStateRequest(idToken: string, init: RequestInit = {}): Promise<string[]> {
  const baseUrl = getApiBaseUrl(AUTH_API_BASE_URL);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/task-state/completed`, {
      ...init,
      headers: { Authorization: `Bearer ${idToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (error) {
    throw networkApiError('Status tugas gagal disinkronkan.', error);
  }
  const raw: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new SafeApiError(safeErrorBody(raw), 'Status tugas gagal disinkronkan.', response.status);
  const ids = (raw as { ids?: unknown }).ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

export function fetchCompletedTasks(idToken: string): Promise<string[]> {
  return taskStateRequest(idToken);
}

export function updateCompletedTasks(idToken: string, changes: { add?: string[]; remove?: string[] }): Promise<string[]> {
  return taskStateRequest(idToken, { method: 'PATCH', body: JSON.stringify(changes) });
}
