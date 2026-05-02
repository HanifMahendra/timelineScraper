'use client';

import { useState, useMemo, useEffect } from 'react';
import StatsCards from '@/components/StatsCards';
import Filters from '@/components/Filters';
import TimelineSection from '@/components/TimelineSection';
import { getWeeklySummary } from '@/lib/summary';
import { isAncientOverdue, taskId } from '@/lib/timelineFilters';
import type { FilterType, Task, TimelineData } from '@/types/task';

interface Props {
  timeline: TimelineData;
}

const LS_KEY = 'scele-completed-tasks';

function matchesFilter(task: Task, filter: FilterType): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return task.isOverdue;
  if (filter === 'today') return task.isDueToday;
  return task.type === filter;
}

function matchesSearch(task: Task, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return task.title.toLowerCase().includes(q) || task.course.toLowerCase().includes(q);
}

function sortByDeadline(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.deadlineISO && b.deadlineISO) return a.deadlineISO.localeCompare(b.deadlineISO);
    if (a.deadlineISO) return -1;
    if (b.deadlineISO) return 1;
    return 0;
  });
}

export default function DashboardClient({ timeline }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setCompletedIds(new Set(JSON.parse(stored) as string[]));
    } catch {
      // localStorage tidak tersedia atau data korup — abaikan
    }
  }, []);

  function toggleDone(taskId: string) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Gabung semua tugas, hapus yang overdue >2 minggu
  const allTasks = useMemo(
    () =>
      sortByDeadline(
        [...timeline.today, ...timeline.upcoming, ...timeline.overdue].filter(
          (t) => !isAncientOverdue(t)
        )
      ),
    [timeline]
  );

  const counts = useMemo<Record<FilterType, number>>(() => {
    const count = (f: FilterType) =>
      allTasks.filter((t) => {
        const completed = completedIds.has(taskId(t));
        if ((f === 'overdue' || f === 'today') && completed) return false;
        return matchesFilter(t, f) && matchesSearch(t, search);
      }).length;
    return {
      all:        count('all'),
      today:      count('today'),
      overdue:    count('overdue'),
      assignment: count('assignment'),
      quiz:       count('quiz'),
      lab:        count('lab'),
      other:      count('other'),
    };
  }, [allTasks, completedIds, search]);

  const filtered = useMemo(
    () => allTasks.filter((t) => matchesFilter(t, filter) && matchesSearch(t, search)),
    [allTasks, filter, search]
  );

  const useFlat = filter !== 'all' || search.length > 0;

  // Untuk mode 'all', pisahkan per bucket; completed tidak masuk urgent
  const todayFiltered = filtered.filter((t) => {
    return t.isDueToday && !completedIds.has(taskId(t));
  });
  const upcomingFiltered = filtered.filter((t) => !t.isOverdue && !t.isDueToday);
  const overdueFiltered = filtered.filter((t) => {
    return t.isOverdue && !completedIds.has(taskId(t));
  });
  const completedFiltered = filtered.filter((t) => {
    return completedIds.has(taskId(t));
  });
  const summary = useMemo(
    () => getWeeklySummary(timeline, completedIds),
    [timeline, completedIds]
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
        <p className="text-sm text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">Ringkasan: </span>
          {summary}
        </p>
      </div>

      <StatsCards
        timeline={timeline}
        completedIds={completedIds}
        completedCount={completedFiltered.length}
      />

      <Filters
        active={filter}
        search={search}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
        counts={counts}
      />

      {useFlat ? (
        <TimelineSection
          title={search ? `Hasil pencarian "${search}"` : `Filter: ${filter}`}
          icon="🔍"
          tasks={filtered}
          emptyMessage="Tidak ada tugas yang cocok dengan filter ini."
          completedIds={completedIds}
          onToggleDone={toggleDone}
        />
      ) : (
        <>
          <TimelineSection
            title="Hari Ini"
            icon="🔴"
            tasks={todayFiltered}
            emptyMessage="Tidak ada tugas yang jatuh tempo hari ini. Nikmati harimu! 🎉"
            completedIds={completedIds}
            onToggleDone={toggleDone}
          />
          <TimelineSection
            title="Upcoming"
            icon="📅"
            tasks={upcomingFiltered}
            emptyMessage="Tidak ada tugas mendatang. Santai dulu! ✌️"
            completedIds={completedIds}
            onToggleDone={toggleDone}
          />
          <TimelineSection
            title="Overdue"
            icon="⚠️"
            tasks={overdueFiltered}
            emptyMessage="Tidak ada tugas yang terlambat. Keren! 🏆"
            completedIds={completedIds}
            onToggleDone={toggleDone}
          />
          {completedFiltered.length > 0 && (
            <TimelineSection
              title="Selesai"
              icon="✅"
              tasks={completedFiltered}
              emptyMessage=""
              completedIds={completedIds}
              onToggleDone={toggleDone}
            />
          )}
        </>
      )}
    </div>
  );
}
