interface LoginResponse {
  customToken: string;
}

const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;

export async function loginWithScele(username: string, password: string): Promise<string> {
  if (!AUTH_API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_AUTH_API_BASE_URL belum di-set.');
  }

  const response = await fetch(`${AUTH_API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Login SCELE gagal.');
  }

  return (data as LoginResponse).customToken;
}

export async function logoutScele(idToken: string): Promise<void> {
  if (!AUTH_API_BASE_URL) return;

  await fetch(`${AUTH_API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}
