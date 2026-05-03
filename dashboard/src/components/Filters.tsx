'use client';

import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
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
    <div className="filters-panel">
      <div className="filters-controls">
        <div className="relative">
          <Search className="filter-search-icon" size={16} aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari tugas atau mata kuliah..."
            className="themed-input pl-9"
          />
        </div>

        <select
          value={selectedCourse}
          onChange={(e) => onCourseChange(e.target.value)}
          className="themed-select"
        >
          <option value="all">Semua kelas</option>
          {courses.map((course) => (
            <option key={course} value={course}>
              {course}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-pills">
        {FILTER_LABELS.map(({ key, label }) => {
          const count = counts[key];
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              className="filter-pill"
              aria-pressed={isActive}
            >
              {label}
              <span>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
