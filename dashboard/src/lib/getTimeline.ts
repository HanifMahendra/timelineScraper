import fs from 'fs';
import path from 'path';
import type { Task, TimelineData } from '@/types/task';
import dashboardTimeline from '@/data/timeline.json';
import { activeOverdue } from '@/lib/timelineFilters';

const TIMELINE_PATH = path.resolve(process.cwd(), '../data/timeline.json');
const ASSIGNMENTS_PATH = path.resolve(process.cwd(), '../data/assignments.json');
const SNAPSHOT_TIMELINE = dashboardTimeline as TimelineData;

function addFlags(tasks: Omit<Task, 'isOverdue' | 'isDueToday' | 'isDueSoon'>[]): Task[] {
  const now = Date.now();
  const wibNow = new Date(now + 7 * 60 * 60 * 1000);
  const todayStr = wibNow.toISOString().slice(0, 10);
  const dueSoonCutoff = new Date(`${todayStr}T00:00:00+07:00`).getTime() + 3 * 24 * 60 * 60 * 1000;

  return tasks.map((t) => {
    if (!t.deadlineISO) return { ...t, isOverdue: false, isDueToday: false, isDueSoon: false };
    const dl = new Date(t.deadlineISO).getTime();
    const isOverdue = dl < now;
    const isDueToday = !isOverdue && t.deadlineISO.slice(0, 10) === todayStr;
    const isDueSoon = !isOverdue && !isDueToday && dl < dueSoonCutoff;
    return { ...t, isOverdue, isDueToday, isDueSoon };
  });
}

export function getTimeline(): TimelineData {
  // Local development: prefer data terbaru dari scraper root.
  if (fs.existsSync(TIMELINE_PATH)) {
    const raw = JSON.parse(fs.readFileSync(TIMELINE_PATH, 'utf-8')) as TimelineData;
    if (raw.today || raw.upcoming || raw.overdue) return raw;
  }

  // Fallback: build dari assignments.json
  if (fs.existsSync(ASSIGNMENTS_PATH)) {
    const all = JSON.parse(fs.readFileSync(ASSIGNMENTS_PATH, 'utf-8')) as Task[];
    const withFlags = addFlags(all);
    withFlags.sort((a, b) => {
      if (a.deadlineISO && b.deadlineISO) return a.deadlineISO.localeCompare(b.deadlineISO);
      if (a.deadlineISO) return -1;
      if (b.deadlineISO) return 1;
      return 0;
    });
    return {
      today: withFlags.filter((t) => t.isDueToday),
      upcoming: withFlags.filter((t) => !t.isOverdue && !t.isDueToday),
      overdue: withFlags.filter((t) => t.isOverdue),
    };
  }

  // Deployment fallback: snapshot ini ikut ter-bundle di folder dashboard.
  return SNAPSHOT_TIMELINE;
}

export function getWeeklySummary(timeline: TimelineData): string {
  const { today, upcoming, overdue } = timeline;
  const currentOverdue = activeOverdue(overdue);
  const parts: string[] = [];

  if (currentOverdue.length > 0) {
    parts.push(`Ada ${currentOverdue.length} tugas yang udah lewat deadline.`);
  }
  if (today.length > 0) {
    parts.push(`${today.length} tugas harus dikumpulkan hari ini.`);
  }
  const endOfWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const thisWeek = upcoming.filter(
    (t) => t.deadlineISO && new Date(t.deadlineISO).getTime() <= endOfWeek
  );
  if (thisWeek.length > 0) {
    parts.push(`${thisWeek.length} tugas lagi dalam 7 hari ke depan.`);
  }
  if (parts.length === 0) return 'Tidak ada tugas dalam waktu dekat. Santai dulu! ✌️';
  return parts.join(' ');
}
