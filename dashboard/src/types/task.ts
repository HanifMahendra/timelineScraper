export type TaskType = 'assignment' | 'quiz' | 'lab' | 'other';

export type UrgencyStatus = 'overdue' | 'today' | 'soon' | 'normal';

export interface Task {
  title: string;
  type: TaskType;
  course: string;
  deadlineText: string | null;
  deadlineISO: string | null;
  url: string;
  rawText: string;
  isOverdue: boolean;
  isDueToday: boolean;
  isDueSoon: boolean;
}

export interface TimelineData {
  today: Task[];
  upcoming: Task[];
  overdue: Task[];
}

export type FilterType = 'all' | TaskType | 'overdue' | 'today';
