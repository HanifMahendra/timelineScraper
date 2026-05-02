import { activeOverdue, taskId } from '@/lib/timelineFilters';
import type { Task, TimelineData } from '@/types/task';

export function getWeeklySummary(timeline: TimelineData, completedIds = new Set<string>()): string {
  const { today, upcoming, overdue } = timeline;
  const isCompleted = (task: Task) => completedIds.has(taskId(task));
  const activeToday = today.filter((task) => !isCompleted(task));
  const activeUpcoming = upcoming.filter((task) => !isCompleted(task));
  const currentOverdue = activeOverdue(overdue).filter((task) => !isCompleted(task));
  const parts: string[] = [];

  if (currentOverdue.length > 0) {
    parts.push(`Ada ${currentOverdue.length} tugas yang udah lewat deadline.`);
  }
  if (activeToday.length > 0) {
    parts.push(`${activeToday.length} tugas harus dikumpulkan hari ini.`);
  }

  const endOfWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const thisWeek = activeUpcoming.filter(
    (task) => task.deadlineISO && new Date(task.deadlineISO).getTime() <= endOfWeek
  );
  if (thisWeek.length > 0) {
    parts.push(`${thisWeek.length} tugas lagi dalam 7 hari ke depan.`);
  }

  if (parts.length === 0) return 'Tidak ada tugas dalam waktu dekat. Santai dulu! ✌️';
  return parts.join(' ');
}
