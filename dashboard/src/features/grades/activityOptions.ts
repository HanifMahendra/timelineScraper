import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';
import type { ActivityOption } from './types';

const ACTIVITY_OPTION_LIMIT = 500;

export async function fetchGradeActivityOptions(
  uid: string
): Promise<ActivityOption[]> {
  const db = getFirebaseFirestore();
  const snapshot = await getDocs(
    query(
      collection(db, 'users', uid, 'activities'),
      orderBy(documentId()),
      limit(ACTIVITY_OPTION_LIMIT)
    )
  );
  return snapshot.docs.flatMap((document) => {
    const data = document.data();
    const title =
      typeof data.title === 'string' ? data.title.trim().slice(0, 120) : '';
    const course =
      typeof data.courseName === 'string'
        ? data.courseName.trim().slice(0, 120)
        : '';
    if (!title || !course) return [];
    return [
      {
        activityId: document.id,
        title,
        course,
        ...(typeof data.deadlineISO === 'string'
          ? { deadlineISO: data.deadlineISO }
          : {}),
        ...(data.lifecycleState === 'missing'
          ? { lifecycleState: 'missing' as const }
          : { lifecycleState: 'active' as const }),
      },
    ];
  });
}
