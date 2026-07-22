interface LoginResponse {
  customToken: string;
}
import { getApiBaseUrl, networkApiError, safeErrorBody, SafeApiError } from './apiErrors';

const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;

export async function loginWithScele(username: string, password: string): Promise<string> {
  const baseUrl = getApiBaseUrl(AUTH_API_BASE_URL);

  let response: Response;
  try { response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }); } catch (error) { throw networkApiError('Login SCELE gagal.', error); }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SafeApiError(safeErrorBody(data), 'Login SCELE gagal.', response.status);
  }

  return (data as LoginResponse).customToken;
}

export async function logoutScele(idToken: string): Promise<void> {
  if (!AUTH_API_BASE_URL) return;
  const baseUrl = getApiBaseUrl(AUTH_API_BASE_URL);

  await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}
