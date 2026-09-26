export type TaskType = 'assignment' | 'quiz' | 'lab' | 'forum' | 'other';

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
  activityId?: string;
  courseId?: string;
  moduleType?: string;
  identitySource?: 'moodle' | 'fallback';
  contentHash?: string;
  urlValid?: boolean;
  changeState?: 'new' | 'unchanged' | 'changed' | 'reappeared';
  lifecycleState?: 'active' | 'missing';
  previousDeadlineISO?: string;
  lastChangedAt?: string;
  version?: number;
}

export interface TimelineData {
  today: Task[];
  upcoming: Task[];
  overdue: Task[];
  /** When SCELE was last scraped successfully (ISO), if known. */
  syncedAt?: string | null;
}

export type FilterType = 'all' | TaskType | 'overdue' | 'today';
