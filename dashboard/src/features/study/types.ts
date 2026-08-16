export type SubjectSource = 'scele' | 'manual';
export type TopicStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type MasteryLevel = 'unknown' | 'learning' | 'familiar' | 'confident';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface SubjectProgress { totalTopics: number; completedTopics: number; inProgressTopics: number; completionPercent: number; plannedMinutes: number; completedMinutes: number; }
export interface StudySubject {
  id: string; source: SubjectSource; sourceCourseId?: string; sourceGradebookId?: string;
  displayName: string; normalizedKey: string; courseCode?: string; semester?: string;
  catalogSubjectKey?: string; status: 'active' | 'archived'; progress: SubjectProgress;
  nearestDeadline?: string | null; gradeTargetGap?: number | null;
}
export interface StudyTopic {
  id: string; subjectId: string; catalogTopicKey?: string; title: string; description?: string;
  order: number; estimatedMinutes: number; prerequisiteTopicIds: string[]; difficulty: Difficulty;
  status: TopicStatus; masteryLevel: MasteryLevel; progressPercent: number;
  linkedActivityIds?: string[]; linkedGradeComponentIds?: string[];
}
export interface StudyPreferences {
  timezone: string; defaultDailyMinutes: number; availableDays: string[];
  preferredSessionMinutes: number; minimumSessionMinutes: number; maximumSessionMinutes: number;
  preferredTimeBlocks: Array<{ day: string; startTime: string; endTime: string }>;
  includeWeekends: boolean; planningHorizonDays: number;
  difficultyPreference: 'balanced' | 'easier_first' | 'harder_first';
}
export interface StudyWarning { code: string; topicId?: string; unscheduledMinutes?: number; }
export interface StudySession {
  id: string; planId?: string; subjectId: string; topicId?: string; title: string;
  scheduledDate: string; startTime?: string; plannedMinutes: number; actualMinutes?: number;
  status: 'planned' | 'in_progress' | 'completed' | 'skipped' | 'rescheduled'; priority: number;
  sourceReasons: string[]; linkedActivityIds?: string[]; linkedGradeComponentIds?: string[];
}
export interface StudyPlan {
  id: string; name: string; subjectIds: string[]; startDate: string; endDate: string;
  status: 'active' | 'completed' | 'archived'; generationMode: 'automatic' | 'manual';
  generationSummary: { totalTopics: number; totalEstimatedMinutes: number; totalScheduledMinutes: number; unscheduledMinutes: number; warnings: StudyWarning[] };
}
export interface StudyDraft {
  id: string; name: string; status: 'ready' | 'applied' | 'cancelled'; version: number; applyToken: string;
  expiresAt: string; generationSummary: StudyPlan['generationSummary'] & { totalAvailableMinutes?: number; unscheduledTopics?: Array<{ topicId: string; remainingMinutes: number; reason: string }> };
}
export interface CatalogSubject { key: string; names: string[]; aliases: string[]; domain: string; description?: string; topicKeys: string[]; }
export interface SubjectMatch { catalogSubjectKey?: string; matchType: 'exact' | 'alias' | 'token' | 'none'; confidence: 'high' | 'medium' | 'low'; candidates?: Array<{ catalogSubjectKey: string; score: number }>; }
export interface CuratedResource { id: string; title: string; provider: string; url: string; resourceType: string; difficulty: Difficulty | 'all'; language: string; isCurated: true; label: 'Terkurasi'; }
export interface FallbackResource { title: string; provider: string; url: string; isFallback: true; label: 'Pencarian terarah'; }
