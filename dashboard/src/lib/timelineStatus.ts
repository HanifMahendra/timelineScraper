import type { Task, TimelineData } from '@/types/task';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// A snapshot older than this is flagged so users know to sync again.
export const STALE_SYNC_MS = DAY_MS;

function wibDate(ms: number): string {
  return new Date(ms + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

// Same rules as the backend's buildTimeline, but evaluated against the
// viewer's clock: the stored flags describe the moment of the last scrape,
// so a task due yesterday would otherwise still look "upcoming".
export function withLiveStatus(task: Task, nowMs: number): Task {
  if (!task.deadlineISO) return { ...task, isOverdue: false, isDueToday: false, isDueSoon: false };
  const deadlineMs = new Date(task.deadlineISO).getTime();
  if (!Number.isFinite(deadlineMs)) return task;
  const todayStr = wibDate(nowMs);
  const dueSoonCutoff = new Date(`${todayStr}T00:00:00+07:00`).getTime() + 3 * DAY_MS;
  const isOverdue = deadlineMs < nowMs;
  const isDueToday = !isOverdue && wibDate(deadlineMs) === todayStr;
  const isDueSoon = !isOverdue && !isDueToday && deadlineMs < dueSoonCutoff;
  return { ...task, isOverdue, isDueToday, isDueSoon };
}

export function rebucketTimeline(timeline: TimelineData, nowMs: number): TimelineData {
  const tasks = [...timeline.today, ...timeline.upcoming, ...timeline.overdue].map((task) => withLiveStatus(task, nowMs));
  return {
    today: tasks.filter((task) => task.isDueToday),
    upcoming: tasks.filter((task) => !task.isOverdue && !task.isDueToday),
    overdue: tasks.filter((task) => task.isOverdue),
    syncedAt: timeline.syncedAt ?? null,
  };
}

export function formatSyncAge(syncedAt: string | null | undefined, nowMs: number): string | null {
  if (!syncedAt) return null;
  const syncedMs = new Date(syncedAt).getTime();
  if (!Number.isFinite(syncedMs)) return null;
  const minutes = Math.max(0, Math.floor((nowMs - syncedMs) / 60_000));
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export function isSyncStale(syncedAt: string | null | undefined, nowMs: number): boolean {
  if (!syncedAt) return false;
  const syncedMs = new Date(syncedAt).getTime();
  return Number.isFinite(syncedMs) && nowMs - syncedMs > STALE_SYNC_MS;
}
