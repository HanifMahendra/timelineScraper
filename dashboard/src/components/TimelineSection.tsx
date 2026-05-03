'use client';

import TaskCard from './TaskCard';
import type { Task } from '@/types/task';

interface Props {
  title: string;
  tone?: 'today' | 'upcoming' | 'overdue' | 'completed' | 'search';
  tasks: Task[];
  emptyMessage: string;
  completedIds?: Set<string>;
  onToggleDone?: (taskId: string) => void;
}

export default function TimelineSection({
  title,
  tone = 'upcoming',
  tasks,
  emptyMessage,
  completedIds,
  onToggleDone,
}: Props) {
  return (
    <section className={`timeline-section timeline-section-${tone}`}>
      <div className="timeline-section-header">
        <span className="timeline-section-dot" />
        <h2>{title}</h2>
        <span className="timeline-count">
          {tasks.length}
        </span>
        <div className="timeline-rule" />
      </div>

      {tasks.length === 0 ? (
        <div className="empty-panel">
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="task-grid">
          {tasks.map((task, i) => {
            const taskId = task.url || task.title;
            return (
              <TaskCard
                key={`${task.url}-${i}`}
                task={task}
                completed={completedIds?.has(taskId) ?? false}
                onToggleDone={onToggleDone}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
