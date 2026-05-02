'use client';

import TaskCard from './TaskCard';
import type { Task } from '@/types/task';

interface Props {
  title: string;
  icon: string;
  tasks: Task[];
  emptyMessage: string;
  completedIds?: Set<string>;
  onToggleDone?: (taskId: string) => void;
}

export default function TimelineSection({
  title,
  icon,
  tasks,
  emptyMessage,
  completedIds,
  onToggleDone,
}: Props) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <h2 className="font-semibold text-slate-700 text-base">{title}</h2>
        <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
