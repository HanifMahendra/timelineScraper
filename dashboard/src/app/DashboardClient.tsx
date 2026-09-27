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
  selectedCourse: string;
  completedIds: Set<string>;
  onToggleDone: (taskId: string) => void;
}

type SortType = 'deadline' | 'course' | 'type';

const FILTER_TITLES: Record<FilterType, string> = {
  all: 'Semua',
  today: 'Hari ini',
  overdue: 'Terlambat',
  assignment: 'Tugas',
  quiz: 'Quiz',
  lab: 'Lab',
  forum: 'Forum',
  other: 'Lainnya',
};

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

function sortTasks(tasks: Task[], sort: SortType): Task[] {
  if (sort === 'course') {
    return [...tasks].sort((a, b) => a.course.localeCompare(b.course) || a.title.localeCompare(b.title));
  }
  if (sort === 'type') {
    return [...tasks].sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
  }
  return sortByDeadline(tasks);
}

function getNearestDeadline(tasks: Task[], completedIds: Set<string>): Task | null {
  const now = Date.now();
  return sortByDeadline(
    tasks.filter((task) => task.deadlineISO && !completedIds.has(taskId(task)) && new Date(task.deadlineISO).getTime() >= now)
  )[0] ?? null;
}

function getRelativeDeadline(task: Task): string {
  if (!task.deadlineISO) return 'tanpa deadline';
  const diffMs = new Date(task.deadlineISO).getTime() - Date.now();
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours <= 1) return 'kurang dari 1 jam lagi';
  if (diffHours < 24) return `${diffHours} jam lagi`;
  const diffDays = Math.ceil(diffHours / 24);
  if (diffDays === 1) return 'besok';
  return `${diffDays} hari lagi`;
}

export default function DashboardClient({ timeline, selectedCourse, completedIds, onToggleDone }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortType>('deadline');

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
      forum:      count('forum'),
      other:      count('other'),
    };
  }, [courseTasks, completedIds, search]);

  const filtered = useMemo(
    () => sortTasks(
      courseTasks.filter((t) => matchesFilter(t, filter) && matchesSearch(t, search)),
      sort
    ),
    [courseTasks, filter, search, sort]
  );

  const useFlat = filter !== 'all' || search.length > 0;

  // Untuk mode 'all', pisahkan per bucket; tugas selesai hanya muncul di "Selesai".
  const pending = filtered.filter((t) => !completedIds.has(taskId(t)));
  const todayFiltered = pending.filter((t) => t.isDueToday);
  const upcomingFiltered = pending.filter((t) => t.deadlineISO && !t.isOverdue && !t.isDueToday);
  const noDeadlineFiltered = pending.filter((t) => !t.deadlineISO);
  const overdueFiltered = pending.filter((t) => t.isOverdue);
  const completedFiltered = filtered.filter((t) => completedIds.has(taskId(t)));
  const summary = useMemo(
    () => getWeeklySummary(courseTimeline, completedIds),
    [courseTimeline, completedIds]
  );
  const nearestDeadline = useMemo(
    () => getNearestDeadline(courseTasks, completedIds),
    [courseTasks, completedIds]
  );

  return (
    <div className="dashboard-content">
      <div className="summary-card">
        <div>
          <span className="summary-label">Deadline terdekat</span>
          <p>
            {nearestDeadline
              ? `${nearestDeadline.title} - ${getRelativeDeadline(nearestDeadline)}`
              : 'Belum ada deadline aktif.'}
          </p>
        </div>
        <div className="summary-divider" aria-hidden="true" />
        <div>
          <span className="summary-label">Ringkasan</span>
          <p>{summary}</p>
        </div>
      </div>

      <StatsCards
        timeline={courseTimeline}
        completedIds={completedIds}
        completedCount={completedFiltered.length}
      />

      <Filters
        active={filter}
        search={search}
        sort={sort}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
        onSortChange={setSort}
        counts={counts}
      />

      {useFlat ? (
        <TimelineSection
          title={search ? `Hasil pencarian "${search}"` : `Filter: ${FILTER_TITLES[filter]}`}
          tone="search"
          tasks={filtered}
          emptyMessage="Tidak ada tugas yang cocok dengan filter ini."
          completedIds={completedIds}
          onToggleDone={onToggleDone}
        />
      ) : (
        <>
          <TimelineSection
            title="Hari Ini"
            tone="today"
            tasks={todayFiltered}
            emptyMessage="Aman untuk hari ini. Cek bagian mendatang untuk deadline berikutnya."
            completedIds={completedIds}
            onToggleDone={onToggleDone}
          />
          <TimelineSection
            title="Mendatang"
            tone="upcoming"
            tasks={upcomingFiltered}
            emptyMessage="Tidak ada tugas mendatang."
            completedIds={completedIds}
            onToggleDone={onToggleDone}
          />
          {noDeadlineFiltered.length > 0 && (
            <TimelineSection
              title="Tanpa Deadline"
              tone="nodeadline"
              tasks={noDeadlineFiltered}
              emptyMessage=""
              completedIds={completedIds}
              onToggleDone={onToggleDone}
            />
          )}
          <TimelineSection
            title="Terlambat"
            tone="overdue"
            tasks={overdueFiltered}
            emptyMessage="Tidak ada tugas yang terlambat."
            completedIds={completedIds}
            onToggleDone={onToggleDone}
          />
          {completedFiltered.length > 0 && (
            <TimelineSection
              title="Selesai"
              tone="completed"
              tasks={completedFiltered}
              emptyMessage=""
              completedIds={completedIds}
              onToggleDone={onToggleDone}
            />
          )}
        </>
      )}
    </div>
  );
}
