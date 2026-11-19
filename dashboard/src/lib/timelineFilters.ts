import type { Task } from '@/types/task';

export const ACTIVE_OVERDUE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isAncientOverdue(task: Task, nowMs = Date.now()): boolean {
  if (!task.isOverdue || !task.deadlineISO) return false;
  const deadlineMs = new Date(task.deadlineISO).getTime();
  return nowMs - deadlineMs > ACTIVE_OVERDUE_WINDOW_MS;
}

export function activeOverdue(tasks: Task[], nowMs = Date.now()): Task[] {
  return tasks.filter((task) => !isAncientOverdue(task, nowMs));
}

export function legacyTaskId(task: Task): string {
  return task.url || task.title;
}

export function taskId(task: Task): string {
  return task.activityId || legacyTaskId(task);
}

export function isTaskCompleted(task: Task, completedIds: ReadonlySet<string>): boolean {
  if (completedIds.has(taskId(task))) return true;
  const legacy = legacyTaskId(task);
  return Boolean(legacy) && completedIds.has(legacy);
}

export function taskCompletionKeys(task: Task): string[] {
  const primary = taskId(task);
  const legacy = legacyTaskId(task);
  return legacy && legacy !== primary ? [primary, legacy] : [primary];
}

export function calendarDayDiffWIB(deadlineISO: string, nowMs = Date.now()): number {
  const wibOffsetMs = 7 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const nowDate = new Date(nowMs + wibOffsetMs).toISOString().slice(0, 10);
  const deadlineDate = new Date(new Date(deadlineISO).getTime() + wibOffsetMs)
    .toISOString()
    .slice(0, 10);

  return Math.round(
    (new Date(`${deadlineDate}T00:00:00Z`).getTime() -
      new Date(`${nowDate}T00:00:00Z`).getTime()) /
      dayMs
  );
}
