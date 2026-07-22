export type GradingScale = 'percentage' | 'points';
export type GradeStatus = 'active' | 'archived';
export type CategoryWeightMode = 'fixed' | 'derived' | 'unknown';
export type CategoryAggregation =
  | 'weighted_mean'
  | 'simple_mean'
  | 'sum_points';
export type ComponentWeightMode =
  | 'fixed'
  | 'equal_in_category'
  | 'unknown';
export type ScoreStatus =
  | 'pending'
  | 'known'
  | 'not_applicable'
  | 'excluded';
export type ComponentType =
  | 'assignment'
  | 'quiz'
  | 'exam'
  | 'project'
  | 'participation'
  | 'lab'
  | 'bonus'
  | 'other';
export type TargetStatus =
  | 'not_set'
  | 'already_achieved'
  | 'reachable'
  | 'requires_perfect_score'
  | 'impossible'
  | 'indeterminate';

export interface Gradebook {
  id: string;
  courseId?: string;
  courseName: string;
  courseCode?: string;
  semester?: string;
  gradingScale: GradingScale;
  targetScore?: number | null;
  capFinalScoreAt100: boolean;
  status: GradeStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface GradebookSummary extends Gradebook {
  summary: {
    currentWeightedScore: number;
    currentAverageOnGradedWeight: number | null;
    gradedWeight: number;
    remainingKnownWeight: number;
    unknownWeightItemCount: number;
    targetStatus: TargetStatus;
    warningCount: number;
  };
}

export interface GradeCategory {
  id: string;
  gradebookId: string;
  name: string;
  description?: string;
  weightMode: CategoryWeightMode;
  weight?: number | null;
  aggregation: CategoryAggregation;
  dropLowestCount: number;
  optional: boolean;
  order: number;
  status: GradeStatus;
}

export interface GradeComponent {
  id: string;
  gradebookId: string;
  categoryId?: string | null;
  name: string;
  description?: string;
  componentType: ComponentType;
  weightMode: ComponentWeightMode;
  weight?: number | null;
  maxScore?: number | null;
  earnedScore?: number | null;
  scoreStatus: ScoreStatus;
  isBonus: boolean;
  isOptional: boolean;
  isDropped: boolean;
  replacementForComponentId?: string | null;
  linkedActivityId?: string | null;
  dueDate?: string | null;
  order: number;
  status: GradeStatus;
}

export interface GradeScenario {
  id: string;
  gradebookId: string;
  name: string;
  targetScore?: number | null;
  assumptions: Array<{
    componentId: string;
    assumedScore: number;
  }>;
  status: GradeStatus;
}

export interface GradeWarning {
  code: string;
  componentId?: string;
  categoryId?: string;
  total?: number;
  weight?: number;
  requested?: number;
  available?: number;
}

export interface GradeBreakdownItem {
  componentId: string;
  categoryId?: string | null;
  name: string;
  included: boolean;
  reason?: string;
  source?: 'actual' | 'assumed' | 'pending' | 'invalid';
  normalizedScore?: number | null;
  effectiveWeight?: number | null;
  contribution: number | null;
  isBonus?: boolean;
}

export interface CategoryResult {
  categoryId: string;
  score: number | null;
  earnedPoints: number | null;
  maxPoints: number | null;
  gradedComponentCount: number;
  pendingComponentCount: number;
  isComplete: boolean;
  dropped: Array<{
    componentId: string;
    reason: 'manual' | 'automatic';
  }>;
  warnings: GradeWarning[];
}

export interface GradebookResult {
  earnedContribution: number;
  bonusContribution: number;
  scenarioContribution: number;
  knownWeight: number;
  gradedWeight: number;
  assumedWeight: number;
  unknownWeight: number;
  unknownWeightItemCount: number;
  remainingKnownWeight: number;
  currentWeightedScore: number;
  currentAverageOnGradedWeight: number | null;
  projectedFinalScore?: number;
  targetScore: number | null;
  targetStatus: TargetStatus;
  targetCalculation: {
    requiredContribution: number | null;
    requiredAverage: number | null;
    formula: string | null;
    conditional: boolean;
  };
  isComplete: boolean;
  capFinalScoreAt100: boolean;
  warnings: GradeWarning[];
  breakdown: GradeBreakdownItem[];
  categoryResults: CategoryResult[];
}

export interface GradebookDetail {
  gradebook: Gradebook;
  categories: GradeCategory[];
  components: GradeComponent[];
  scenarios: GradeScenario[];
  result: GradebookResult;
}

export interface ActivityOption {
  activityId: string;
  title: string;
  course: string;
  deadlineISO?: string;
  lifecycleState?: 'active' | 'missing';
}

export type GradebookInput = Pick<
  Gradebook,
  | 'courseName'
  | 'gradingScale'
  | 'capFinalScoreAt100'
  | 'courseId'
  | 'courseCode'
  | 'semester'
  | 'targetScore'
>;

export type CategoryInput = Omit<
  GradeCategory,
  'id' | 'gradebookId' | 'status'
>;

export type ComponentInput = Omit<
  GradeComponent,
  'id' | 'gradebookId' | 'status'
>;

export type ScenarioInput = Pick<
  GradeScenario,
  'name' | 'targetScore' | 'assumptions'
>;
