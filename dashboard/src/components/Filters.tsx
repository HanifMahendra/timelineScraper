'use client';

import { Input } from '@/components/ui/input';
import type { FilterType } from '@/types/task';

interface Props {
  active: FilterType;
  search: string;
  selectedCourse: string;
  courses: string[];
  onFilterChange: (f: FilterType) => void;
  onSearchChange: (s: string) => void;
  onCourseChange: (course: string) => void;
  counts: Record<FilterType, number>;
}

const FILTER_LABELS: { key: FilterType; label: string }[] = [
  { key: 'all',        label: 'Semua' },
  { key: 'today',      label: 'Hari ini' },
  { key: 'overdue',    label: 'Overdue' },
  { key: 'assignment', label: 'Tugas' },
  { key: 'quiz',       label: 'Quiz' },
  { key: 'lab',        label: 'Lab' },
];

export default function Filters({
  active,
  search,
  selectedCourse,
  courses,
  onFilterChange,
  onSearchChange,
  onCourseChange,
  counts,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_240px]">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari tugas atau mata kuliah..."
            className="pl-9 bg-white border-slate-200 text-sm"
          />
        </div>

        <select
          value={selectedCourse}
          onChange={(e) => onCourseChange(e.target.value)}
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-slate-400"
        >
          <option value="all">Semua kelas</option>
          {courses.map((course) => (
            <option key={course} value={course}>
              {course}
            </option>
          ))}
        </select>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_LABELS.map(({ key, label }) => {
          const count = counts[key];
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
