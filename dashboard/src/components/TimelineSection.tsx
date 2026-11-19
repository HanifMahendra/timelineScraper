'use client';

import { ChevronDown } from 'lucide-react';
import TaskCard from './TaskCard';
import { isTaskCompleted, taskId as getTaskId } from '@/lib/timelineFilters';
import type { Task } from '@/types/task';

interface Props {
  title: string;
  tone?: 'today' | 'upcoming' | 'nodeadline' | 'overdue' | 'completed' | 'search';
  tasks: Task[];
  emptyMessage: string;
  completedIds?: Set<string>;
  onToggleDone?: (task: Task) => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
  onResetFilter?: () => void;
}

export default function TimelineSection({
  title,
  tone = 'upcoming',
  tasks,
  emptyMessage,
  completedIds,
  onToggleDone,
  collapsible = false,
  defaultOpen = true,
  onResetFilter,
}: Props) {
  const body =
    tasks.length === 0 ? (
      <div className="empty-panel">
        <p>{emptyMessage}</p>
        {onResetFilter && (
          <button type="button" className="ghost-action empty-panel-reset" onClick={onResetFilter}>
            Reset filter
          </button>
        )}
      </div>
    ) : (
      <div className="task-grid">
        {tasks.map((task, i) => (
          <TaskCard
            key={`${getTaskId(task)}-${i}`}
            task={task}
            completed={completedIds ? isTaskCompleted(task, completedIds) : false}
            onToggleDone={onToggleDone}
          />
        ))}
      </div>
    );

  if (collapsible) {
    return (
      <section className={`timeline-section timeline-section-${tone}`}>
        <details className="timeline-details" open={defaultOpen}>
          <summary className="timeline-section-header timeline-section-summary">
            <span className="timeline-section-dot" />
            <h2>{title}</h2>
            <span className="timeline-count">{tasks.length}</span>
            <div className="timeline-rule" />
            <ChevronDown size={16} className="timeline-chevron" aria-hidden="true" />
          </summary>
          {body}
        </details>
      </section>
    );
  }

  return (
    <section className={`timeline-section timeline-section-${tone}`}>
      <div className="timeline-section-header">
        <span className="timeline-section-dot" />
        <h2>{title}</h2>
        <span className="timeline-count">{tasks.length}</span>
        <div className="timeline-rule" />
      </div>
      {body}
    </section>
  );
}
