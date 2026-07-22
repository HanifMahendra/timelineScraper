import type {
  CategoryAggregation,
  ComponentType,
  ComponentWeightMode,
  ScoreStatus,
} from '../types';

export type ImportSourceType = 'csv' | 'xlsx';
export type ImportDraftStatus =
  | 'parsing'
  | 'needs_mapping'
  | 'ready_for_review'
  | 'validation_failed'
  | 'committing'
  | 'committed'
  | 'commit_failed'
  | 'cancelled'
  | 'expired';
export type ImportValidationStatus = 'valid' | 'warning' | 'invalid';
export type ImportCandidateKind = 'category' | 'component' | 'unknown';
export type ImportCandidateAction = 'create' | 'skip';
export type ImportTargetField =
  | 'categoryName'
  | 'componentName'
  | 'componentType'
  | 'weight'
  | 'maxScore'
  | 'earnedScore'
  | 'scoreStatus'
  | 'isBonus'
  | 'isOptional'
  | 'dueDate'
  | 'aggregation'
  | 'dropLowestCount';

export interface ImportWarning {
  code: string;
  row?: number;
  column?: string;
  value?: string;
  total?: number;
  componentId?: string;
  validationCode?: string;
  message?: string;
}

export interface ImportSheetInfo {
  name: string;
  visibility: 'visible' | 'hidden' | 'very_hidden';
  rowCount: number;
  columnCount: number;
}

export interface ImportSourceColumn {
  id: string;
  index: number;
  header: string;
  normalizedHeader: string;
}

export interface ImportSheetCatalog {
  name: string;
  prefix: string;
  visibility: ImportSheetInfo['visibility'];
  detectedHeaders: string[];
  sourceColumns: ImportSourceColumn[];
  detectedMapping: Partial<Record<ImportTargetField, string>>;
  confidenceByField: Partial<
    Record<ImportTargetField, 'high' | 'medium' | 'low'>
  >;
  mappingWarnings: ImportWarning[];
  mappingComplete: boolean;
  mappingAmbiguous: boolean;
}

export interface ImportCategoryResolution {
  importedCategoryName: string;
  action: 'create' | 'use_existing' | 'unresolved';
  existingCategoryId?: string;
  conflictType?: 'exact_name' | 'normalized_name';
  createData?: {
    name: string;
    weightMode: 'fixed' | 'derived' | 'unknown';
    weight?: number | null;
    aggregation: CategoryAggregation;
    dropLowestCount: number;
    optional: boolean;
    order: number;
  };
}

export interface ImportConflictSuggestion {
  candidateRowId: string;
  conflictType:
    | 'exact_name'
    | 'normalized_name'
    | 'same_category_and_name'
    | 'same_linked_activity'
    | 'none';
  existingCategoryId?: string;
  existingComponentId?: string;
  suggestedAction: 'create' | 'skip' | 'map_existing';
  confidence: 'high' | 'medium' | 'low';
}

export interface GradeImportCandidate {
  rowId: string;
  sourceRowNumber: number;
  sheetName: string;
  candidateKind: ImportCandidateKind;
  categoryName?: string;
  componentName?: string;
  componentType?: ComponentType;
  weightMode?: ComponentWeightMode;
  weight?: number | null;
  maxScore?: number | null;
  earnedScore?: number | null;
  scoreStatus?: ScoreStatus;
  aggregation?: CategoryAggregation;
  dropLowestCount?: number;
  isBonus?: boolean;
  isOptional?: boolean;
  dueDate?: string | null;
  action: ImportCandidateAction;
  confidence: 'high' | 'medium' | 'low';
  warnings: ImportWarning[];
  validationStatus: ImportValidationStatus;
  conflictSuggestion?: ImportConflictSuggestion;
  normalizedPreview: Record<string, unknown>;
  sourceValues: Record<string, string | number | boolean | null>;
  formulaColumns?: string[];
  externalFormulaColumns?: string[];
}

export interface ImportDraftSummary {
  rowCount: number;
  valid: number;
  warning: number;
  invalid: number;
  skipped: number;
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  totalImportedWeight: number;
  componentCreateCount: number;
  categoryCandidateCount: number;
  commitEntityCount: number;
  commitTooLarge: boolean;
}

export interface GradeImportDraft {
  id: string;
  gradebookId: string;
  sourceType: ImportSourceType;
  originalFilename?: string;
  sanitizedFilename?: string;
  status: ImportDraftStatus;
  parserVersion: string;
  selectedSheet?: string | null;
  availableSheets: ImportSheetInfo[];
  sheetCatalog: ImportSheetCatalog[];
  detectedHeaders: string[];
  sourceColumns: ImportSourceColumn[];
  columnMapping: Partial<Record<ImportTargetField, string>>;
  categoryResolutions: ImportCategoryResolution[];
  warnings: ImportWarning[];
  errors: ImportWarning[];
  rowCount: number;
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  summary: ImportDraftSummary;
  contentFingerprint: string;
  version: number;
  commitToken: string;
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
  committedAt?: string;
  committedCategoryIds?: string[];
  committedComponentIds?: string[];
}

export interface ImportDetailResponse {
  draft: GradeImportDraft;
  rows: GradeImportCandidate[];
  pagination: {
    limit: number;
    nextCursor: string | null;
  };
  reused?: boolean;
}

export interface ImportCommitResult {
  status: 'committed' | 'already_committed';
  committedCategoryIds: string[];
  committedComponentIds: string[];
  createdCategoryCount: number;
  createdComponentCount: number;
  skipped: number;
}

export interface ImportRowPatch {
  categoryName?: string;
  componentName?: string;
  componentType?: ComponentType;
  weightMode?: ComponentWeightMode;
  weight?: number | null;
  maxScore?: number | null;
  earnedScore?: number | null;
  scoreStatus?: ScoreStatus;
  aggregation?: CategoryAggregation;
  dropLowestCount?: number;
  isBonus?: boolean;
  isOptional?: boolean;
  dueDate?: string | null;
  action?: ImportCandidateAction;
}
