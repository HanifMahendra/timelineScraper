'use client';

import { Card, CardContent } from '@/components/ui/card';
import { calendarDayDiffWIB, taskId } from '@/lib/timelineFilters';
import type { Task } from '@/types/task';

interface Props {
  task: Task;
  completed?: boolean;
  onToggleDone?: (taskId: string) => void;
}

const TYPE_CONFIG = {
  assignment: { label: 'Tugas', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  quiz:       { label: 'Quiz',  color: 'bg-purple-100 text-purple-700 border-purple-200' },
  lab:        { label: 'Lab',   color: 'bg-green-100 text-green-700 border-green-200' },
  other:      { label: 'Lain',  color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const URGENCY_CONFIG = {
  overdue:   { label: 'Overdue',  color: 'bg-orange-100 text-orange-700 border-orange-200' },
  today:     { label: 'Hari ini', color: 'bg-red-100 text-red-700 border-red-200' },
  soon:      { label: 'Segera',   color: 'bg-amber-100 text-amber-700 border-amber-200' },
  normal:    { label: null,       color: '' },
  completed: { label: 'Selesai', color: 'bg-slate-100 text-slate-500 border-slate-200' },
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

const LEFT_BORDER: Record<UrgencyKey, string> = {
  overdue:   'border-l-4 border-l-orange-400',
  today:     'border-l-4 border-l-red-400',
  soon:      'border-l-4 border-l-amber-400',
  normal:    'border-l-4 border-l-slate-200',
  completed: 'border-l-4 border-l-green-400',
};

export default function TaskCard({ task, completed = false, onToggleDone }: Props) {
  const urgency = getUrgency(task, completed);
  const typeConf = TYPE_CONFIG[task.type] ?? TYPE_CONFIG.other;
  const urgencyConf = URGENCY_CONFIG[urgency];
  const deadlineLabel = formatDeadlineID(task);
  const relativeTime = getRelativeTime(task, completed);

  const id = taskId(task);

  return (
    <Card
      className={`shadow-none border border-slate-200 ${LEFT_BORDER[urgency]} hover:shadow-sm transition-shadow ${completed ? 'opacity-60' : ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Kiri: judul + course */}
          <div className="min-w-0 flex-1">
            <p
              className={`font-semibold text-slate-800 leading-snug line-clamp-2 ${completed ? 'line-through text-slate-400' : ''}`}
            >
              {task.title}
            </p>
            <p className="text-sm text-slate-500 mt-0.5 truncate">{task.course}</p>
          </div>

          {/* Kanan: badges */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeConf.color}`}>
              {typeConf.label}
            </span>
            {urgencyConf.label && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${urgencyConf.color}`}>
                {urgencyConf.label}
              </span>
            )}
          </div>
        </div>

        {/* Deadline */}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{deadlineLabel}</span>
          {relativeTime && (
            <span className={`ml-1 font-medium ${task.isOverdue ? 'text-orange-500' : task.isDueToday ? 'text-red-500' : 'text-slate-400'}`}>
              · {relativeTime}
            </span>
          )}
        </div>

        {/* Tombol aksi */}
        <div className="mt-3 flex items-center gap-2">
          {task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Buka di SCELE
            </a>
          )}
          {onToggleDone && (
            <button
              onClick={() => onToggleDone(id)}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                completed
                  ? 'text-slate-500 bg-slate-50 hover:bg-slate-100 border-slate-200'
                  : 'text-green-600 bg-green-50 hover:bg-green-100 border-green-200'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {completed ? 'Batalkan' : 'Mark as Done'}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
