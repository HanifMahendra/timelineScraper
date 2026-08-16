export interface SafeApiErrorBody {
  error?: string;
  message?: string;
  requestId?: string;
  retryAfterSeconds?: number;
  issues?: Array<{ field?: string; message?: string }>;
}

export const AUTH_EXPIRED_EVENT = 'my-timeline-auth-expired';

const KNOWN_MESSAGES: Record<string, string> = {
  AUTH_TOKEN_MISSING: 'Sesi login tidak tersedia. Silakan masuk kembali.',
  AUTH_TOKEN_INVALID: 'Sesi login sudah berakhir. Silakan masuk kembali.',
  RATE_LIMITED: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
  REQUEST_TIMEOUT: 'Permintaan memerlukan waktu terlalu lama. Coba lagi nanti.',
  CORS_ORIGIN_DENIED: 'Dashboard ini tidak diizinkan mengakses layanan.',
};

export class SafeApiError extends Error {
  code?: string;
  requestId?: string;
  retryAfterSeconds?: number;
  issues?: SafeApiErrorBody['issues'];
  status?: number;
  isNetworkError: boolean;

  constructor(body: SafeApiErrorBody, fallback: string, status?: number, isNetworkError = false) {
    const code = typeof body.error === 'string' ? body.error.slice(0, 80) : undefined;
    const message = isNetworkError
      ? 'Tidak dapat terhubung ke layanan. Periksa koneksi internet lalu coba lagi.'
      : status === 401
        ? KNOWN_MESSAGES[code || ''] || 'Sesi login sudah berakhir. Silakan masuk kembali.'
        : status !== undefined && status >= 500
          ? 'Layanan sedang mengalami gangguan. Coba lagi nanti.'
          : KNOWN_MESSAGES[code || ''] || body.message || fallback;
    super(message);
    this.name = 'SafeApiError';
    this.code = code;
    this.requestId = typeof body.requestId === 'string' ? body.requestId.slice(0, 64) : undefined;
    this.retryAfterSeconds = Number.isFinite(body.retryAfterSeconds) ? body.retryAfterSeconds : undefined;
    this.issues = Array.isArray(body.issues) ? body.issues.slice(0, 20) : undefined;
    this.status = status;
    this.isNetworkError = isNetworkError;
    if (status === 401 && code?.startsWith('AUTH_TOKEN_') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
  }
}

export function safeErrorBody(value: unknown): SafeApiErrorBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const body = value as Record<string, unknown>;
  return {
    ...(typeof body.error === 'string' ? { error: body.error } : {}),
    ...(typeof body.message === 'string' ? { message: body.message } : {}),
    ...(typeof body.requestId === 'string' ? { requestId: body.requestId } : {}),
    ...(typeof body.retryAfterSeconds === 'number' ? { retryAfterSeconds: body.retryAfterSeconds } : {}),
    ...(Array.isArray(body.issues) ? { issues: body.issues as SafeApiErrorBody['issues'] } : {}),
  };
}

export function networkApiError(fallback: string, cause: unknown) {
  if (cause instanceof SafeApiError) return cause;
  return new SafeApiError({}, fallback, undefined, true);
}

export function displayApiError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const apiError = error instanceof SafeApiError ? error : null;
  const issues = apiError?.issues?.map((issue) => issue.message).filter(Boolean).join(' ');
  const request = apiError?.requestId ? ` ID permintaan: ${apiError.requestId} (dapat disalin).` : '';
  return `${error.message}${issues ? ` ${issues}` : ''}${request}`;
}

export function getApiBaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error('NEXT_PUBLIC_AUTH_API_BASE_URL belum di-set.');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('NEXT_PUBLIC_AUTH_API_BASE_URL tidak valid.'); }
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if ((!isLocal && url.protocol !== 'https:') || (isLocal && !['http:', 'https:'].includes(url.protocol)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_AUTH_API_BASE_URL tidak aman.');
  }
  return url.origin;
}
