'use client';

import { Card, CardContent } from '@/components/ui/card';
import { activeOverdue, taskId } from '@/lib/timelineFilters';
import type { TimelineData } from '@/types/task';

interface Props {
  timeline: TimelineData;
  completedIds?: Set<string>;
  completedCount?: number;
}

interface StatItem {
  label: string;
  value: number;
  colorClass: string;
  bgClass: string;
  icon: string;
}

export default function StatsCards({ timeline, completedIds = new Set(), completedCount = 0 }: Props) {
  const { today, upcoming, overdue } = timeline;
  const activeToday = today.filter((task) => !completedIds.has(taskId(task)));
  const activeUpcoming = upcoming.filter((task) => !completedIds.has(taskId(task)));
  const currentOverdue = activeOverdue(overdue).filter((task) => !completedIds.has(taskId(task)));
  const total = activeToday.length + activeUpcoming.length + currentOverdue.length + completedCount;

  const stats: StatItem[] = [
    {
      label: 'Total Tugas',
      value: total,
      colorClass: 'text-slate-700',
      bgClass: 'bg-slate-50 border-slate-200',
      icon: '📋',
    },
    {
      label: 'Upcoming',
      value: activeUpcoming.length,
      colorClass: activeUpcoming.length > 0 ? 'text-blue-600' : 'text-slate-500',
      bgClass: activeUpcoming.length > 0 ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200',
      icon: '📅',
    },
    {
      label: 'Overdue',
      value: currentOverdue.length,
      colorClass: currentOverdue.length > 0 ? 'text-orange-600' : 'text-slate-500',
      bgClass: currentOverdue.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200',
      icon: '⚠️',
    },
    {
      label: 'Selesai',
      value: completedCount,
      colorClass: completedCount > 0 ? 'text-green-600' : 'text-slate-500',
      bgClass: completedCount > 0 ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200',
      icon: '✅',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className={`border ${s.bgClass} shadow-none`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {s.label}
              </span>
              <span className="text-base">{s.icon}</span>
            </div>
            <p className={`text-3xl font-bold ${s.colorClass}`}>{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
