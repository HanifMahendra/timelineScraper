import { getApiBaseUrl, networkApiError, safeErrorBody, SafeApiError } from './apiErrors';

const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;

export interface DiscordStatus {
  configured: boolean;
  inviteUrl?: string | null;
  linked: boolean;
  discordUserId?: string;
  linkedAt?: string | null;
  deliveryTarget?: 'dm' | 'channel';
  reminderHourWib?: number;
  reminderEnabled?: boolean;
}

export interface DiscordLinkCode {
  code: string;
  expiresAt: string;
}

async function discordRequest<T>(path: string, idToken: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl(AUTH_API_BASE_URL);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/bot/discord${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch (error) {
    throw networkApiError('Gagal menghubungi layanan Bot Discord.', error);
  }
  const raw: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SafeApiError(safeErrorBody(raw), 'Gagal memproses permintaan Bot Discord.', response.status);
  }
  return raw as T;
}

export function fetchDiscordStatus(idToken: string): Promise<DiscordStatus> {
  return discordRequest<DiscordStatus>('/status', idToken);
}

export function createDiscordLinkCode(idToken: string): Promise<DiscordLinkCode> {
  return discordRequest<DiscordLinkCode>('/link-code', idToken, { method: 'POST' });
}

export function unlinkDiscord(idToken: string): Promise<{ linked: false }> {
  return discordRequest<{ linked: false }>('/link', idToken, { method: 'DELETE' });
}

export function updateDiscordPreferences(
  idToken: string,
  prefs: { reminderHourWib?: number; reminderEnabled?: boolean }
): Promise<{ linked: true; reminderHourWib: number; reminderEnabled: boolean }> {
  return discordRequest('/preferences', idToken, {
    method: 'PATCH',
    body: JSON.stringify(prefs),
  });
}
