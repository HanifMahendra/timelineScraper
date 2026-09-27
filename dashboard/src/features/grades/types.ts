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

/** hundred: final grade 0-100. four: decimal courses, categories and final 0.0-4.0. */
export type FinalScale = 'hundred' | 'four';

/** Minimum score for A and for C (in the gradebook's scale); letters between are spaced evenly. */
export interface LetterBounds {
  aMin: number;
  cMin: number;
  dMin?: number;
}

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
  credits?: number | null;
  finalScale?: FinalScale;
  letterBounds?: LetterBounds | null;
  createdAt?: string;
  updatedAt?: string;
}

export type LetterGrade = 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'D' | 'E';

export interface LetterTarget {
  letter: LetterGrade;
  points: number;
  min: number;
  status: Exclude<TargetStatus, 'not_set'>;
  /** Average needed on the remaining known weight, 0-100. */
  requiredAverage: number | null;
  /** Same requirement in the gradebook's scale (0-4 for decimal courses). */
  requiredAverageInScale: number | null;
}

export interface LetterSummary {
  finalScale: FinalScale;
  scaleMax: number;
  thresholds: Array<{ letter: LetterGrade; points: number; min: number }>;
  currentScore: number | null;
  currentLetter: LetterGrade | null;
  guaranteedLetter: LetterGrade | null;
  bestPossibleLetter: LetterGrade | null;
  hasUnknownWeight: boolean;
  targets: LetterTarget[];
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
    letters?: Omit<LetterSummary, 'thresholds' | 'scaleMax'>;
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
  /** Present when the component mirrors a SCELE grade item. */
  sceleSource?: {
    itemId: string;
    grade: number | null;
    rangeMax: number | null;
    syncedAt?: string;
  };
  /** "manual" once the user typed a score; SCELE sync then leaves it alone. */
  scoreOrigin?: 'scele' | 'manual';
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
  letters?: LetterSummary;
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
  | 'credits'
  | 'finalScale'
  | 'letterBounds'
>;

export type CategoryInput = Omit<
  GradeCategory,
  'id' | 'gradebookId' | 'status'
>;

export type ComponentInput = Omit<
  GradeComponent,
  'id' | 'gradebookId' | 'status' | 'sceleSource' | 'scoreOrigin'
>;

export type ScenarioInput = Pick<
  GradeScenario,
  'name' | 'targetScore' | 'assumptions'
>;

export interface AcademicProfile {
  previousGpa: number | null;
  previousCredits: number | null;
  targetGpa: number | null;
  targetSemesterGpa: number | null;
}

export interface SemesterPlanCourse {
  gradebookId: string;
  courseName: string;
  credits: number;
  finalScale: FinalScale;
  guaranteedLetter: LetterGrade | null;
  bestPossibleLetter: LetterGrade | null;
  letter: LetterGrade;
  points: number;
  requiredAverage: number;
  requiredAverageInScale: number | null;
  /** Weights are incomplete, so the requirement assumes the whole course is still open. */
  estimated: boolean;
}

export interface SemesterPlan {
  status: 'no_courses' | 'no_target' | 'impossible' | 'already_guaranteed' | 'achievable';
  semester: string;
  semesterCredits: number;
  requiredIp: number | null;
  basis: 'target_ip' | 'target_ipk' | 'not_set';
  guaranteedIp: number | null;
  maxIp: number | null;
  resultingIp?: number;
  resultingGpa?: number | null;
  courses: SemesterPlanCourse[];
  excluded: Array<{ gradebookId: string; courseName: string; reason: 'NO_CREDITS' | 'OTHER_SEMESTER' }>;
}
