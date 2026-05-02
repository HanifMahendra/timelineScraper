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
