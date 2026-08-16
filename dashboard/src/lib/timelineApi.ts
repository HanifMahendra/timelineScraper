import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import type { TimelineData } from '@/types/task';
import { getApiBaseUrl, networkApiError, safeErrorBody, SafeApiError } from './apiErrors';

const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;

export type ScrapeResponse =
  | {
      status: 'success';
      runId: string;
      timelineWritten: true;
      taskCount: number;
      activityDiff?: {
        new: number;
        unchanged: number;
        changed: number;
        missing: number;
        reappeared: number;
      };
      isBootstrapRun?: boolean;
    }
  | {
      status: 'partial';
      runId: string;
      timelineWritten: false;
      successfulCourseCount: number;
      failedCourseCount: number;
      message?: string;
    }
  | {
      status: 'failed';
      runId: string;
      timelineWritten: false;
      error: string;
      message?: string;
    };

interface ScrapeErrorBody {
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
  requestId?: string;
}

export class ScrapeApiError extends SafeApiError {
  constructor(message: string, body: ScrapeErrorBody = {}, status?: number) {
    super({ ...body, message }, 'Scrape SCELE gagal.', status);
    this.name = 'ScrapeApiError';
  }
}

export async function triggerScrape(idToken: string): Promise<ScrapeResponse> {
  const baseUrl = getApiBaseUrl(AUTH_API_BASE_URL); let response: Response;
  try { response = await fetch(`${baseUrl}/scrape`, { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } }); }
  catch (error) { throw networkApiError('Scrape SCELE gagal.', error); }
  const data = (await response.json().catch(() => ({}))) as ScrapeErrorBody &
    Partial<ScrapeResponse>;

  if (!response.ok) {
    throw new ScrapeApiError(data.message || 'Scrape SCELE gagal.', safeErrorBody(data), response.status);
  }

  return data as ScrapeResponse;
}

export async function fetchUserTimeline(uid: string): Promise<TimelineData | null> {
  const db = getFirebaseFirestore();
  const snap = await getDoc(doc(db, 'userTimelines', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    today: data.today ?? [],
    upcoming: data.upcoming ?? [],
    overdue: data.overdue ?? [],
  };
}
