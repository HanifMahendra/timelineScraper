'use client';

import { Card, CardContent } from '@/components/ui/card';
import { CalendarClock, Check, ExternalLink, RotateCcw } from 'lucide-react';
import { calendarDayDiffWIB, taskId } from '@/lib/timelineFilters';
import type { Task } from '@/types/task';

interface Props {
  task: Task;
  completed?: boolean;
  onToggleDone?: (taskId: string) => void;
}

const TYPE_CONFIG = {
  assignment: { label: 'Tugas', tone: 'assignment' },
  quiz:       { label: 'Quiz',  tone: 'quiz' },
  lab:        { label: 'Lab',   tone: 'lab' },
  other:      { label: 'Lain',  tone: 'other' },
};

const URGENCY_CONFIG = {
  overdue:   { label: 'Overdue',  tone: 'overdue' },
  today:     { label: 'Hari ini', tone: 'today' },
  soon:      { label: 'Segera',   tone: 'soon' },
  normal:    { label: null,       tone: 'normal' },
  completed: { label: 'Selesai', tone: 'completed' },
};

type UrgencyKey = keyof typeof URGENCY_CONFIG;

function getUrgency(task: Task, completed: boolean): UrgencyKey {
  if (completed) return 'completed';
  if (task.isOverdue) return 'overdue';
  if (task.isDueToday) return 'today';
  if (task.isDueSoon) return 'soon';
  return 'normal';
}

const BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatDeadlineID(task: Task): string {
  if (!task.deadlineISO) return task.deadlineText ?? '–';

  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(now.getTime() + wibOffset);
  const todayStr = nowWIB.toISOString().slice(0, 10);
  const tomorrowWIB = new Date(nowWIB.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrowWIB.toISOString().slice(0, 10);

  const dl = new Date(task.deadlineISO);
  const dlWIB = new Date(dl.getTime() + wibOffset);
  const dlDateStr = dlWIB.toISOString().slice(0, 10);
  const timeStr = dlWIB.toISOString().slice(11, 16); // "HH:MM"

  if (dlDateStr === todayStr) return `Hari ini, ${timeStr}`;
  if (dlDateStr === tomorrowStr) return `Besok, ${timeStr}`;

  const day = dlWIB.getUTCDate();
  const month = BULAN[dlWIB.getUTCMonth()];
  const year = dlWIB.getUTCFullYear();
  return `${day} ${month} ${year}, ${timeStr}`;
}

function getRelativeTime(task: Task, completed: boolean): string | null {
  if (completed || !task.deadlineISO) return null;

  const now = Date.now();
  const dl = new Date(task.deadlineISO).getTime();
  const diffMs = dl - now;
  const diffCalendarDays = calendarDayDiffWIB(task.deadlineISO, now);
  const diffSec = Math.abs(diffMs) / 1000;
  const diffMin = diffSec / 60;
  const diffHour = diffMin / 60;

  if (diffMs > 0) {
    // Belum lewat
    if (diffCalendarDays === 0) {
      if (diffMin < 60) return `deadline ${Math.max(1, Math.round(diffMin))} menit lagi`;
      return `deadline ${Math.round(diffHour)} jam lagi`;
    }
    if (diffCalendarDays === 1) return 'deadline besok';
    return `deadline ${diffCalendarDays} hari lagi`;
  } else {
    // Sudah lewat
    if (diffCalendarDays === 0) {
      if (diffMin < 60) return `telat ${Math.max(1, Math.round(diffMin))} menit`;
      return `telat ${Math.round(diffHour)} jam`;
    }
    return `telat ${Math.abs(diffCalendarDays)} hari`;
  }
}

export default function TaskCard({ task, completed = false, onToggleDone }: Props) {
  const urgency = getUrgency(task, completed);
  const typeConf = TYPE_CONFIG[task.type] ?? TYPE_CONFIG.other;
  const urgencyConf = URGENCY_CONFIG[urgency];
  const deadlineLabel = formatDeadlineID(task);
  const relativeTime = getRelativeTime(task, completed);

  const id = taskId(task);

  return (
    <Card
      className={`task-card task-card-${urgency} ${completed ? 'task-card-completed' : ''}`}
    >
      <CardContent className="task-card-content">
        <div className="task-card-top">
          <div className="task-title-wrap">
            <p
              className={`task-title ${completed ? 'task-title-done' : ''}`}
            >
              {task.title}
            </p>
            <p className="task-course">{task.course}</p>
          </div>

          <div className="task-badges">
            <span className={`badge badge-type badge-${typeConf.tone}`}>
              {typeConf.label}
            </span>
            {urgencyConf.label && (
              <span className={`badge badge-urgency badge-${urgencyConf.tone}`}>
                {urgencyConf.label}
              </span>
            )}
          </div>
        </div>

        <div className="task-deadline">
          <CalendarClock size={15} aria-hidden="true" />
          <span>{deadlineLabel}</span>
          {relativeTime && (
            <span className="task-relative">
              {relativeTime}
            </span>
          )}
        </div>

        <div className="task-actions">
          {task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className="task-link"
            >
              <ExternalLink size={13} aria-hidden="true" />
              Buka di SCELE
            </a>
          )}
          {onToggleDone && (
            <button
              onClick={() => onToggleDone(id)}
              className={`done-button ${completed ? 'done-button-cancel' : ''}`}
            >
              {completed ? <RotateCcw size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
              {completed ? 'Batalkan' : 'Mark as Done'}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
