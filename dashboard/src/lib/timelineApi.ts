import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import type { TimelineData } from '@/types/task';

const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;

export async function triggerScrape(idToken: string): Promise<void> {
  if (!AUTH_API_BASE_URL) throw new Error('NEXT_PUBLIC_AUTH_API_BASE_URL belum di-set.');

  const response = await fetch(`${AUTH_API_BASE_URL}/scrape`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Scrape SCELE gagal.');
  }
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
