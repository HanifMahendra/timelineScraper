'use client';

import { useState, useMemo } from 'react';
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

function getStoredCompletedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = window.localStorage.getItem(LS_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export default function DashboardClient({ timeline }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [completedIds, setCompletedIds] = useState<Set<string>>(getStoredCompletedIds);

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

  const courses = useMemo(
    () => [...new Set(allTasks.map((task) => task.course))].sort((a, b) => a.localeCompare(b)),
    [allTasks]
  );

  const courseTasks = useMemo(
    () =>
      selectedCourse === 'all'
        ? allTasks
        : allTasks.filter((task) => task.course === selectedCourse),
    [allTasks, selectedCourse]
  );

  const courseTimeline = useMemo<TimelineData>(
    () => ({
      today: timeline.today.filter(
        (task) => selectedCourse === 'all' || task.course === selectedCourse
      ),
      upcoming: timeline.upcoming.filter(
        (task) => selectedCourse === 'all' || task.course === selectedCourse
      ),
      overdue: timeline.overdue.filter(
        (task) => selectedCourse === 'all' || task.course === selectedCourse
      ),
    }),
    [timeline, selectedCourse]
  );

  const counts = useMemo<Record<FilterType, number>>(() => {
    const count = (f: FilterType) =>
      courseTasks.filter((t) => {
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
  }, [courseTasks, completedIds, search]);

  const filtered = useMemo(
    () => courseTasks.filter((t) => matchesFilter(t, filter) && matchesSearch(t, search)),
    [courseTasks, filter, search]
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
    () => getWeeklySummary(courseTimeline, completedIds),
    [courseTimeline, completedIds]
  );

  return (
    <div className="dashboard-content">
      <div className="summary-card">
        <p>
          <span>Ringkasan: </span>
          {summary}
        </p>
      </div>

      <StatsCards
        timeline={courseTimeline}
        completedIds={completedIds}
        completedCount={completedFiltered.length}
      />

      <Filters
        active={filter}
        search={search}
        selectedCourse={selectedCourse}
        courses={courses}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
        onCourseChange={setSelectedCourse}
        counts={counts}
      />

      {useFlat ? (
        <TimelineSection
          title={search ? `Hasil pencarian "${search}"` : `Filter: ${filter}`}
          tone="search"
          tasks={filtered}
          emptyMessage="Tidak ada tugas yang cocok dengan filter ini."
          completedIds={completedIds}
          onToggleDone={toggleDone}
        />
      ) : (
        <>
          <TimelineSection
            title="Hari Ini"
            tone="today"
            tasks={todayFiltered}
            emptyMessage="Tidak ada tugas yang jatuh tempo hari ini."
            completedIds={completedIds}
            onToggleDone={toggleDone}
          />
          <TimelineSection
            title="Upcoming"
            tone="upcoming"
            tasks={upcomingFiltered}
            emptyMessage="Tidak ada tugas mendatang."
            completedIds={completedIds}
            onToggleDone={toggleDone}
          />
          <TimelineSection
            title="Overdue"
            tone="overdue"
            tasks={overdueFiltered}
            emptyMessage="Tidak ada tugas yang terlambat."
            completedIds={completedIds}
            onToggleDone={toggleDone}
          />
          {completedFiltered.length > 0 && (
            <TimelineSection
              title="Selesai"
              tone="completed"
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
