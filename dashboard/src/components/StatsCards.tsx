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
  tone: string;
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
      tone: 'total',
    },
    {
      label: 'Upcoming',
      value: activeUpcoming.length,
      tone: 'upcoming',
    },
    {
      label: 'Overdue',
      value: currentOverdue.length,
      tone: 'overdue',
    },
    {
      label: 'Selesai',
      value: completedCount,
      tone: 'completed',
    },
  ];

  return (
    <div className="stats-grid">
      {stats.map((s) => (
        <Card key={s.label} className={`stat-card stat-card-${s.tone}`}>
          <CardContent className="stat-card-content">
            <div className="stat-card-top">
              <span>{s.label}</span>
              <i aria-hidden="true" />
            </div>
            <p>{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
