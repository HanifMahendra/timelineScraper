'use client';

import { Card, CardContent } from '@/components/ui/card';
import { activeOverdue, isTaskCompleted } from '@/lib/timelineFilters';
import type { FilterType, TimelineData } from '@/types/task';

interface Props {
  timeline: TimelineData;
  completedIds?: Set<string>;
  completedCount?: number;
  activeFilter?: FilterType;
  onSelectFilter?: (filter: FilterType) => void;
}

interface StatItem {
  label: string;
  value: number;
  tone: string;
  filter?: FilterType;
}

export default function StatsCards({
  timeline,
  completedIds = new Set(),
  completedCount = 0,
  activeFilter,
  onSelectFilter,
}: Props) {
  const { today, upcoming, overdue } = timeline;
  const activeToday = today.filter((task) => !isTaskCompleted(task, completedIds));
  const activeUpcoming = upcoming.filter((task) => !isTaskCompleted(task, completedIds));
  const currentOverdue = activeOverdue(overdue).filter((task) => !isTaskCompleted(task, completedIds));

  const stats: StatItem[] = [
    {
      label: 'Hari Ini',
      value: activeToday.length,
      tone: 'today',
      filter: 'today',
    },
    {
      label: 'Mendatang',
      value: activeUpcoming.length,
      tone: 'upcoming',
      filter: 'all',
    },
    {
      label: 'Terlambat',
      value: currentOverdue.length,
      tone: 'overdue',
      filter: 'overdue',
    },
    {
      label: 'Selesai',
      value: completedCount,
      tone: 'completed',
      filter: 'all',
    },
  ];

  return (
    <div className="stats-grid">
      {stats.map((s) => {
        const isActive = Boolean(s.filter && s.filter !== 'all' && activeFilter === s.filter);
        return (
          <Card
            key={s.label}
            className={`stat-card stat-card-${s.tone}${isActive ? ' stat-card-active' : ''}`}
          >
            {onSelectFilter && s.filter ? (
              <button
                type="button"
                className="stat-card-button"
                aria-pressed={isActive}
                onClick={() => onSelectFilter(isActive ? 'all' : s.filter!)}
              >
                <CardContent className="stat-card-content">
                  <div className="stat-card-top">
                    <span>{s.label}</span>
                  </div>
                  <p>{s.value}</p>
                </CardContent>
              </button>
            ) : (
              <CardContent className="stat-card-content">
                <div className="stat-card-top">
                  <span>{s.label}</span>
                </div>
                <p>{s.value}</p>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
