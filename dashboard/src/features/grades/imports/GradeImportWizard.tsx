'use client';

import {
  type DragEvent,
  type FormEvent,
  useMemo,
  useState,
} from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  CategoryAggregation,
  ComponentType,
  Gradebook,
  GradeCategory,
  ScoreStatus,
} from '../types';
import {
  cancelGradeImport,
  commitGradeImport,
  getGradeImport,
  revalidateGradeImport,
  updateImportMapping,
  updateImportRow,
  uploadGradeImport,
} from './importApi';
import {
  importStatusLabel,
  validationStatusLabel,
  warningLabel,
} from './importFormatters';
import type {
  GradeImportCandidate,
  ImportCategoryResolution,
  ImportCommitResult,
  ImportDetailResponse,
  ImportRowPatch,
  ImportTargetField,
  ImportValidationStatus,
} from './importTypes';
import { displayApiError } from '@/lib/apiErrors';

type WizardStep =
  | 'upload'
  | 'sheet'
  | 'mapping'
  | 'review'
  | 'confirm'
  | 'result';

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'sheet', label: 'Sheet' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'review', label: 'Review' },
  { id: 'confirm', label: 'Konfirmasi' },
  { id: 'result', label: 'Hasil' },
];

const TARGET_FIELDS: Array<{
  value: ImportTargetField;
  label: string;
}> = [
  { value: 'categoryName', label: 'Category Name' },
  { value: 'componentName', label: 'Component Name' },
  { value: 'componentType', label: 'Component Type' },
  { value: 'weight', label: 'Weight' },
  { value: 'maxScore', label: 'Max Score' },
  { value: 'earnedScore', label: 'Earned Score' },
  { value: 'scoreStatus', label: 'Score Status' },
  { value: 'isBonus', label: 'Bonus' },
  { value: 'isOptional', label: 'Optional' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'aggregation', label: 'Aggregation' },
  { value: 'dropLowestCount', label: 'Drop Lowest Count' },
];

interface RowEditorState {
  rowId: string;
  candidateKind: GradeImportCandidate['candidateKind'];
  categoryName: string;
  componentName: string;
  componentType: ComponentType;
  weightMode: 'fixed' | 'equal_in_category' | 'unknown';
  weight: string;
  maxScore: string;
  earnedScore: string;
  scoreStatus: ScoreStatus;
  isBonus: boolean;
  isOptional: boolean;
  dueDate: string;
  aggregation: CategoryAggregation;
  dropLowestCount: string;
  action: 'create' | 'skip';
}

function errorMessage(error: unknown) {
  return displayApiError(error, 'Workflow import gagal memproses data.');
}

function optionalNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
}

function editorFor(row: GradeImportCandidate): RowEditorState {
  return {
    rowId: row.rowId,
    candidateKind: row.candidateKind,
    categoryName: row.categoryName ?? '',
    componentName: row.componentName ?? '',
    componentType: row.componentType ?? 'other',
    weightMode: row.weightMode ?? 'unknown',
    weight: row.weight === null || row.weight === undefined ? '' : String(row.weight),
    maxScore:
      row.maxScore === null || row.maxScore === undefined
        ? ''
        : String(row.maxScore),
    earnedScore:
      row.earnedScore === null || row.earnedScore === undefined
        ? ''
        : String(row.earnedScore),
    scoreStatus: row.scoreStatus ?? 'pending',
    isBonus: Boolean(row.isBonus),
    isOptional: Boolean(row.isOptional),
    dueDate: row.dueDate?.slice(0, 10) ?? '',
    aggregation: row.aggregation ?? 'simple_mean',
    dropLowestCount: String(row.dropLowestCount ?? 0),
    action: row.action,
  };
}

function statusClass(status: ImportValidationStatus) {
  return `import-status import-status-${status}`;
}

export default function GradeImportWizard({
  user,
  gradebook,
  categories,
  onCommitted,
  onClose,
}: {
  user: User;
  gradebook: Gradebook;
  categories: GradeCategory[];
  onCommitted: () => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [detail, setDetail] = useState<ImportDetailResponse | null>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [columnMapping, setColumnMapping] = useState<
    Partial<Record<ImportTargetField, string>>
  >({});
  const [resolutions, setResolutions] = useState<
    ImportCategoryResolution[]
  >([]);
  const [mappingPreviewRows, setMappingPreviewRows] = useState<
    GradeImportCandidate[]
  >([]);
  const [filter, setFilter] = useState<
    'all' | ImportValidationStatus | 'skipped'
  >('all');
  const [editor, setEditor] = useState<RowEditorState | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [commitResult, setCommitResult] =
    useState<ImportCommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = detail?.draft ?? null;
  const selectedCatalog = useMemo(
    () =>
      draft?.sheetCatalog.find(
        (catalog) => catalog.name === selectedSheet
      ) ?? null,
    [draft?.sheetCatalog, selectedSheet]
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const filteredRows = useMemo(
    () =>
      (detail?.rows ?? []).filter((row) => {
        if (filter === 'all') return true;
        if (filter === 'skipped') return row.action === 'skip';
        return row.action !== 'skip' && row.validationStatus === filter;
      }),
    [detail?.rows, filter]
  );

  function acceptFile(candidate: File | null) {
    setError(null);
    if (!candidate) {
      setFile(null);
      return;
    }
    const name = candidate.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      setError('Hanya file .csv dan .xlsx yang dapat dipilih.');
      return;
    }
    if (candidate.size > 5_242_880) {
      setError('Ukuran file maksimal 5 MB.');
      return;
    }
    setFile(candidate);
  }

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await action();
    } catch (actionError) {
      setError(errorMessage(actionError));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Pilih file sebelum upload.');
      return;
    }
    const response = await run(async () => {
      const token = await user.getIdToken();
      return uploadGradeImport(token, gradebook.id, file);
    });
    if (!response) return;
    setDetail(response);
    setSelectedSheet(response.draft.selectedSheet ?? '');
    setColumnMapping(response.draft.columnMapping ?? {});
    setResolutions(response.draft.categoryResolutions ?? []);
    setMappingPreviewRows(response.rows.slice(0, 5));
    setStep(response.draft.selectedSheet ? 'mapping' : 'sheet');
  }

  async function chooseSheet(name: string) {
    const catalog = draft?.sheetCatalog.find((item) => item.name === name);
    setSelectedSheet(name);
    setColumnMapping(catalog?.detectedMapping ?? {});
    setMappingPreviewRows([]);
    setStep('mapping');
    if (!draft) return;
    const response = await run(async () => {
      const token = await user.getIdToken();
      return getGradeImport(token, gradebook.id, draft.id, {
        limit: 5,
        sheet: name,
      });
    });
    if (response) setMappingPreviewRows(response.rows);
  }

  function targetForSource(sourceColumnId: string) {
    return (
      Object.entries(columnMapping).find(
        ([, mappedSource]) => mappedSource === sourceColumnId
      )?.[0] ?? ''
    );
  }

  function mapSource(sourceColumnId: string, target: string) {
    setColumnMapping((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(
          ([field, source]) =>
            field !== target && source !== sourceColumnId
        )
      ) as Partial<Record<ImportTargetField, string>>;
      if (target) {
        next[target as ImportTargetField] = sourceColumnId;
      }
      return next;
    });
  }

  async function saveMapping() {
    if (!draft || !selectedSheet) return;
    if (!columnMapping.componentName) {
      setError('Mapping Component Name wajib dipilih.');
      return;
    }
    const response = await run(async () => {
      const token = await user.getIdToken();
      return updateImportMapping(token, gradebook.id, draft.id, {
        selectedSheet,
        columnMapping,
        categoryResolutions: resolutions.length ? resolutions : undefined,
      });
    });
    if (!response) return;
    setDetail(response);
    setSelectedSheet(response.draft.selectedSheet ?? selectedSheet);
    setColumnMapping(response.draft.columnMapping ?? columnMapping);
    setResolutions(response.draft.categoryResolutions ?? []);
    setStep('review');
  }

  function updateResolution(
    index: number,
    action: 'create' | 'use_existing'
  ) {
    setResolutions((current) =>
      current.map((resolution, itemIndex) => {
        if (itemIndex !== index) return resolution;
        if (action === 'use_existing') {
          return {
            importedCategoryName: resolution.importedCategoryName,
            action,
            existingCategoryId: resolution.existingCategoryId,
          };
        }
        return {
          importedCategoryName: resolution.importedCategoryName,
          action,
          createData: {
            name:
              resolution.action === 'unresolved'
                ? `${resolution.importedCategoryName} (Import)`
                : resolution.createData?.name ??
                  resolution.importedCategoryName,
            weightMode: 'unknown',
            weight: null,
            aggregation:
              resolution.createData?.aggregation ?? 'simple_mean',
            dropLowestCount:
              resolution.createData?.dropLowestCount ?? 0,
            optional: resolution.createData?.optional ?? false,
            order: resolution.createData?.order ?? 0,
          },
        };
      })
    );
  }

  function updateResolutionName(index: number, name: string) {
    setResolutions((current) =>
      current.map((resolution, itemIndex) =>
        itemIndex === index && resolution.action === 'create'
          ? {
              ...resolution,
              createData: {
                ...(resolution.createData ?? {
                  weightMode: 'unknown',
                  weight: null,
                  aggregation: 'simple_mean',
                  dropLowestCount: 0,
                  optional: false,
                  order: 0,
                }),
                name,
              },
            }
          : resolution
      )
    );
  }

  async function saveResolutions() {
    if (!draft || !selectedSheet) return;
    if (resolutions.some((resolution) => resolution.action === 'unresolved')) {
      setError('Pilih tindakan untuk setiap konflik kategori.');
      return;
    }
    const response = await run(async () => {
      const token = await user.getIdToken();
      return updateImportMapping(token, gradebook.id, draft.id, {
        selectedSheet,
        columnMapping,
        categoryResolutions: resolutions,
      });
    });
    if (response) {
      setDetail(response);
      setResolutions(response.draft.categoryResolutions ?? []);
    }
  }

  async function saveRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !editor) return;
    const patch: ImportRowPatch = {
      categoryName: editor.categoryName,
      componentName: editor.componentName,
      componentType: editor.isBonus ? 'bonus' : editor.componentType,
      weightMode: editor.weightMode,
      weight:
        editor.weightMode === 'fixed'
          ? optionalNumber(editor.weight)
          : null,
      maxScore: optionalNumber(editor.maxScore),
      earnedScore:
        editor.scoreStatus === 'known'
          ? optionalNumber(editor.earnedScore)
          : null,
      scoreStatus: editor.scoreStatus,
      isBonus: editor.isBonus,
      isOptional: editor.isOptional,
      dueDate: editor.dueDate || null,
      aggregation: editor.aggregation,
      dropLowestCount: Number(editor.dropLowestCount || '0'),
      action: editor.action,
    };
    const response = await run(async () => {
      const token = await user.getIdToken();
      return updateImportRow(
        token,
        gradebook.id,
        draft.id,
        editor.rowId,
        patch
      );
    });
    if (!response || !detail) return;
    setDetail({
      ...detail,
      draft: response.draft,
      rows: detail.rows.map((row) =>
        row.rowId === response.row.rowId ? response.row : row
      ),
    });
    setResolutions(response.draft.categoryResolutions ?? []);
    setEditor(null);
  }

  async function setRowAction(
    row: GradeImportCandidate,
    action: 'create' | 'skip'
  ) {
    if (!draft) return;
    const response = await run(async () => {
      const token = await user.getIdToken();
      return updateImportRow(token, gradebook.id, draft.id, row.rowId, {
        action,
      });
    });
    if (!response || !detail) return;
    setDetail({
      ...detail,
      draft: response.draft,
      rows: detail.rows.map((item) =>
        item.rowId === response.row.rowId ? response.row : item
      ),
    });
    setResolutions(response.draft.categoryResolutions ?? []);
  }

  async function revalidate() {
    if (!draft) return;
    const response = await run(async () => {
      const token = await user.getIdToken();
      await revalidateGradeImport(token, gradebook.id, draft.id);
      return getGradeImport(token, gradebook.id, draft.id);
    });
    if (response) {
      setDetail(response);
      setResolutions(response.draft.categoryResolutions ?? []);
    }
  }

  async function loadNextPage() {
    if (!draft || !detail?.pagination.nextCursor) return;
    const response = await run(async () => {
      const token = await user.getIdToken();
      return getGradeImport(token, gradebook.id, draft.id, {
        cursor: detail.pagination.nextCursor ?? undefined,
      });
    });
    if (!response) return;
    const existing = new Set(detail.rows.map((row) => row.rowId));
    setDetail({
      ...response,
      rows: [
        ...detail.rows,
        ...response.rows.filter((row) => !existing.has(row.rowId)),
      ],
    });
  }

  async function commit() {
    if (!draft || !confirmed) return;
    const response = await run(async () => {
      const token = await user.getIdToken();
      return commitGradeImport(token, gradebook.id, draft);
    });
    if (!response) return;
    setCommitResult(response);
    setStep('result');
    await onCommitted();
  }

  async function cancelAndClose() {
    if (commitResult || step === 'result') {
      onClose();
      return;
    }
    if (draft && !['committed', 'cancelled', 'expired'].includes(draft.status)) {
      const cancelled = await run(async () => {
        const token = await user.getIdToken();
        await cancelGradeImport(token, gradebook.id, draft.id);
        return true;
      });
      if (!cancelled) return;
    }
    onClose();
  }

  const currentStepIndex = STEPS.findIndex((item) => item.id === step);
  const hasBlockingRows =
    (draft?.summary.rejectedCandidateCount ?? 0) > 0 ||
    Boolean(draft?.summary.commitTooLarge);
  const hasUnresolvedCategories = resolutions.some(
    (resolution) => resolution.action === 'unresolved'
  );

  return (
    <section className="grade-panel import-wizard">
      <div className="import-wizard-header">
        <div>
          <span>Structured import</span>
          <h3>Import CSV / XLSX</h3>
          <p>
            File menjadi draft review. Tidak ada kategori atau komponen yang
            dibuat sebelum konfirmasi terakhir.
          </p>
        </div>
        <button
          type="button"
          className="ghost-action"
          onClick={() => void cancelAndClose()}
          disabled={busy}
        >
          <X size={14} aria-hidden="true" />
          Tutup
        </button>
      </div>

      <ol className="import-steps" aria-label="Tahapan import">
        {STEPS.map((item, index) => (
          <li
            key={item.id}
            className={
              index === currentStepIndex
                ? 'is-current'
                : index < currentStepIndex
                  ? 'is-complete'
                  : ''
            }
          >
            <span>{index < currentStepIndex ? <Check size={12} /> : index + 1}</span>
            {item.label}
          </li>
        ))}
      </ol>

      {error && <div className="grade-error">{error}</div>}

      {step === 'upload' && (
        <form className="import-step-panel" onSubmit={upload}>
          <div
            className={`import-dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setDragging(false);
              acceptFile(event.dataTransfer.files.item(0));
            }}
          >
            <UploadCloud size={30} aria-hidden="true" />
            <h4>Letakkan file nilai di sini</h4>
            <p>CSV atau XLSX, maksimum 5 MB. Formula dan macro tidak dijalankan.</p>
            <label className="ghost-action import-file-button">
              Pilih file
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {file && (
            <div className="import-selected-file">
              <FileSpreadsheet size={18} aria-hidden="true" />
              <div>
                <strong>{file.name}</strong>
                <span>{Math.ceil(file.size / 1024)} KB</span>
              </div>
              <button type="button" onClick={() => setFile(null)}>
                <X size={14} aria-label="Hapus pilihan file" />
              </button>
            </div>
          )}
          <div className="import-step-actions">
            <button
              className="primary-action"
              type="submit"
              disabled={!file || busy}
            >
              {busy ? <RefreshCw className="animate-spin" size={14} /> : <UploadCloud size={14} />}
              Upload dan buat draft
            </button>
          </div>
        </form>
      )}

      {step === 'sheet' && draft && (
        <div className="import-step-panel">
          <div className="import-step-copy">
            <span>Sheet workbook</span>
            <h4>Pilih sumber data</h4>
            <p>Hidden sheet tidak pernah dipilih otomatis.</p>
          </div>
          <div className="import-sheet-grid">
            {draft.availableSheets.map((sheet) => (
              <button
                type="button"
                key={sheet.name}
                className="import-sheet-card"
                onClick={() => void chooseSheet(sheet.name)}
              >
                <FileSpreadsheet size={20} aria-hidden="true" />
                <strong>{sheet.name}</strong>
                <span>
                  {sheet.rowCount} baris · {sheet.columnCount} kolom
                </span>
                <em>{sheet.visibility.replace('_', ' ')}</em>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'mapping' && draft && selectedCatalog && (
        <div className="import-step-panel">
          <div className="import-step-copy">
            <span>Column mapping</span>
            <h4>{selectedCatalog.name}</h4>
            <p>
              Setiap source column hanya dapat digunakan satu kali. Component
              Name wajib dipilih.
            </p>
          </div>
          {selectedCatalog.visibility !== 'visible' && (
            <div className="import-inline-warning">
              <AlertTriangle size={15} />
              Anda memilih sheet {selectedCatalog.visibility} secara eksplisit.
            </div>
          )}
          <div className="import-mapping-list">
            {selectedCatalog.sourceColumns.map((column) => (
              <label key={column.id}>
                <span>
                  <strong>{column.header || '(header kosong)'}</strong>
                  <small>{column.id}</small>
                </span>
                <select
                  value={targetForSource(column.id)}
                  onChange={(event) =>
                    mapSource(column.id, event.target.value)
                  }
                >
                  <option value="">Ignore</option>
                  {TARGET_FIELDS.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {selectedCatalog.mappingWarnings.length > 0 && (
            <div className="import-warning-list">
              {selectedCatalog.mappingWarnings.map((warning, index) => (
                <span key={`${warning.code}-${index}`}>
                  <AlertTriangle size={12} />
                  {warningLabel(warning)}
                </span>
              ))}
            </div>
          )}
          {mappingPreviewRows.length > 0 && (
            <div className="import-table-wrap" aria-label="Preview source rows">
              <table className="import-table import-mapping-preview">
                <thead>
                  <tr>
                    <th>Baris</th>
                    {selectedCatalog.sourceColumns.map((column) => (
                      <th key={column.id}>{column.header || column.id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappingPreviewRows.map((row) => (
                    <tr key={row.rowId}>
                      <td>{row.sourceRowNumber}</td>
                      {selectedCatalog.sourceColumns.map((column) => (
                        <td key={column.id}>
                          {String(row.sourceValues[column.id] ?? '') || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="import-step-actions">
            {draft.availableSheets.length > 1 && (
              <button
                type="button"
                className="ghost-action"
                onClick={() => setStep('sheet')}
              >
                <ArrowLeft size={14} />
                Ganti sheet
              </button>
            )}
            <button
              type="button"
              className="primary-action"
              onClick={() => void saveMapping()}
              disabled={!columnMapping.componentName || busy}
            >
              Terapkan mapping
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 'review' && draft && detail && (
        <div className="import-step-panel">
          <div className="import-review-heading">
            <div className="import-step-copy">
              <span>{importStatusLabel(draft.status)}</span>
              <h4>Review candidate</h4>
              <p>
                Nilai kosong tetap pending; angka nol tetap nilai known.
              </p>
            </div>
            <button
              type="button"
              className="ghost-action"
              onClick={() => void revalidate()}
              disabled={busy}
            >
              <RefreshCw size={13} className={busy ? 'animate-spin' : ''} />
              Validasi ulang
            </button>
          </div>

          <div className="import-summary-grid">
            <div><span>Valid</span><strong>{draft.summary.valid}</strong></div>
            <div><span>Warning</span><strong>{draft.summary.warning}</strong></div>
            <div><span>Invalid</span><strong>{draft.summary.invalid}</strong></div>
            <div><span>Dilewati</span><strong>{draft.summary.skipped}</strong></div>
            <div>
              <span>Total bobot</span>
              <strong>{draft.summary.totalImportedWeight}%</strong>
            </div>
          </div>

          {draft.warnings.length > 0 && (
            <div className="import-warning-list">
              {draft.warnings.map((warning, index) => (
                <span key={`${warning.code}-${warning.row ?? 'draft'}-${index}`}>
                  <AlertTriangle size={12} />
                  {warningLabel(warning)}
                  {warning.total !== undefined ? ` (${warning.total})` : ''}
                </span>
              ))}
            </div>
          )}

          {resolutions.length > 0 && (
            <div className="import-resolution-panel">
              <div>
                <h5>Resolusi kategori</h5>
                <p>Existing category tidak pernah dipilih atau ditimpa otomatis.</p>
              </div>
              {resolutions.map((resolution, index) => (
                <div className="import-resolution-row" key={resolution.importedCategoryName}>
                  <strong>{resolution.importedCategoryName}</strong>
                  <select
                    value={resolution.action}
                    onChange={(event) =>
                      updateResolution(
                        index,
                        event.target.value as 'create' | 'use_existing'
                      )
                    }
                  >
                    <option value="unresolved" disabled>
                      Pilih tindakan
                    </option>
                    <option value="create">Buat kategori baru</option>
                    {resolution.existingCategoryId && (
                      <option value="use_existing">
                        Gunakan {categoriesById.get(resolution.existingCategoryId)?.name ?? 'existing'}
                      </option>
                    )}
                  </select>
                  {resolution.action === 'create' && (
                    <input
                      value={resolution.createData?.name ?? ''}
                      onChange={(event) =>
                        updateResolutionName(index, event.target.value)
                      }
                      maxLength={100}
                      aria-label={`Nama kategori baru untuk ${resolution.importedCategoryName}`}
                    />
                  )}
                </div>
              ))}
              <button
                type="button"
                className="ghost-action"
                onClick={() => void saveResolutions()}
                disabled={busy || hasUnresolvedCategories}
              >
                Simpan resolusi
              </button>
            </div>
          )}

          <div className="import-filter-row">
            {(['all', 'valid', 'warning', 'invalid', 'skipped'] as const).map(
              (value) => (
                <button
                  type="button"
                  key={value}
                  className={filter === value ? 'is-active' : ''}
                  onClick={() => setFilter(value)}
                >
                  {value}
                </button>
              )
            )}
          </div>

          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th>Baris</th>
                  <th>Candidate</th>
                  <th>Bobot</th>
                  <th>Nilai</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.rowId} className={row.action === 'skip' ? 'is-skipped' : ''}>
                    <td>{row.sourceRowNumber}</td>
                    <td>
                      <strong>{row.componentName || row.categoryName || '(kosong)'}</strong>
                      <span>{row.categoryName || 'Tanpa kategori'}</span>
                      {row.warnings.slice(0, 3).map((warning, index) => (
                        <small key={`${warning.code}-${index}`}>
                          {warningLabel(warning)}
                        </small>
                      ))}
                    </td>
                    <td>
                      {row.weightMode === 'unknown'
                        ? 'Unknown'
                        : `${row.weight ?? 0}%`}
                    </td>
                    <td>
                      {row.scoreStatus === 'pending'
                        ? 'Pending'
                        : row.earnedScore ?? '—'}
                    </td>
                    <td>
                      <span className={statusClass(row.validationStatus)}>
                        {validationStatusLabel(row.validationStatus)}
                      </span>
                    </td>
                    <td>
                      <div className="grade-row-actions">
                        <button
                          type="button"
                          className="ghost-action"
                          onClick={() => setEditor(editorFor(row))}
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost-action"
                          onClick={() =>
                            void setRowAction(
                              row,
                              row.action === 'skip' ? 'create' : 'skip'
                            )
                          }
                        >
                          {row.action === 'skip' ? 'Create' : 'Skip'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail.pagination.nextCursor && (
            <button
              type="button"
              className="ghost-action import-load-more"
              onClick={() => void loadNextPage()}
              disabled={busy}
            >
              Muat 50 baris berikutnya
            </button>
          )}

          {editor && (
            <form className="import-row-editor" onSubmit={saveRow}>
              <div className="grade-panel-heading">
                <div>
                  <span>Baris candidate</span>
                  <h4>Edit baris</h4>
                </div>
                <button type="button" onClick={() => setEditor(null)}>
                  <X size={14} aria-label="Tutup editor" />
                </button>
              </div>
              <div className="grade-form-grid">
                <label className="grade-field">
                  <span>Nama kategori</span>
                  <input
                    value={editor.categoryName}
                    onChange={(event) =>
                      setEditor({ ...editor, categoryName: event.target.value })
                    }
                  />
                </label>
                <label className="grade-field grade-field-wide">
                  <span>Nama komponen</span>
                  <input
                    value={editor.componentName}
                    onChange={(event) =>
                      setEditor({ ...editor, componentName: event.target.value })
                    }
                    required={
                      editor.action === 'create' &&
                      editor.candidateKind !== 'category'
                    }
                  />
                </label>
                <label className="grade-field">
                  <span>Jenis</span>
                  <select
                    value={editor.componentType}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        componentType: event.target.value as ComponentType,
                      })
                    }
                  >
                    {['assignment', 'quiz', 'exam', 'project', 'participation', 'lab', 'bonus', 'other'].map(
                      (type) => <option value={type} key={type}>{type}</option>
                    )}
                  </select>
                </label>
                <label className="grade-field">
                  <span>Mode bobot</span>
                  <select
                    value={editor.weightMode}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        weightMode: event.target.value as RowEditorState['weightMode'],
                      })
                    }
                  >
                    <option value="fixed">Fixed</option>
                    <option value="equal_in_category">Equal in category</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                {editor.weightMode === 'fixed' && (
                  <label className="grade-field">
                    <span>Bobot</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={editor.weight}
                      onChange={(event) =>
                        setEditor({ ...editor, weight: event.target.value })
                      }
                      required
                    />
                  </label>
                )}
                <label className="grade-field">
                  <span>Status nilai</span>
                  <select
                    value={editor.scoreStatus}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        scoreStatus: event.target.value as ScoreStatus,
                      })
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="known">Known</option>
                    <option value="not_applicable">Not applicable</option>
                    <option value="excluded">Excluded</option>
                  </select>
                </label>
                <label className="grade-field">
                  <span>Max score</span>
                  <input
                    type="number"
                    min="0.000001"
                    step="0.01"
                    value={editor.maxScore}
                    onChange={(event) =>
                      setEditor({ ...editor, maxScore: event.target.value })
                    }
                  />
                </label>
                {editor.scoreStatus === 'known' && (
                  <label className="grade-field">
                    <span>Earned score</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editor.earnedScore}
                      onChange={(event) =>
                        setEditor({ ...editor, earnedScore: event.target.value })
                      }
                      required
                    />
                  </label>
                )}
                <label className="grade-field">
                  <span>Due date</span>
                  <input
                    type="date"
                    value={editor.dueDate}
                    onChange={(event) =>
                      setEditor({ ...editor, dueDate: event.target.value })
                    }
                  />
                </label>
                <label className="grade-field">
                  <span>Aggregation</span>
                  <select
                    value={editor.aggregation}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        aggregation: event.target.value as CategoryAggregation,
                      })
                    }
                  >
                    <option value="simple_mean">Simple mean</option>
                    <option value="weighted_mean">Weighted mean</option>
                    <option value="sum_points">Sum points</option>
                  </select>
                </label>
                <label className="grade-field">
                  <span>Drop lowest</span>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="1"
                    value={editor.dropLowestCount}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        dropLowestCount: event.target.value,
                      })
                    }
                    required
                  />
                </label>
                <label className="grade-field">
                  <span>Action</span>
                  <select
                    value={editor.action}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        action: event.target.value as 'create' | 'skip',
                      })
                    }
                  >
                    <option value="create">Create</option>
                    <option value="skip">Skip</option>
                  </select>
                </label>
              </div>
              <div className="grade-check-row">
                <label className="grade-check">
                  <input
                    type="checkbox"
                    checked={editor.isBonus}
                    onChange={(event) =>
                      setEditor({ ...editor, isBonus: event.target.checked })
                    }
                  />
                  Bonus
                </label>
                <label className="grade-check">
                  <input
                    type="checkbox"
                    checked={editor.isOptional}
                    onChange={(event) =>
                      setEditor({ ...editor, isOptional: event.target.checked })
                    }
                  />
                  Optional
                </label>
              </div>
              <div className="import-step-actions">
                <button type="button" className="ghost-action" onClick={() => setEditor(null)}>
                  Batal
                </button>
                <button type="submit" className="primary-action" disabled={busy}>
                  Simpan candidate
                </button>
              </div>
            </form>
          )}

          <div className="import-step-actions">
            <button type="button" className="ghost-action" onClick={() => setStep('mapping')}>
              <ArrowLeft size={14} />
              Mapping
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                setConfirmed(false);
                setStep('confirm');
              }}
              disabled={busy || hasBlockingRows || hasUnresolvedCategories}
            >
              Lanjut konfirmasi
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && draft && (
        <div className="import-step-panel import-confirm-panel">
          <CheckCircle2 size={32} aria-hidden="true" />
          <div className="import-step-copy">
            <span>Explicit commit</span>
            <h4>Periksa ringkasan terakhir</h4>
          </div>
          <ul>
            <li>
              {resolutions.filter((item) => item.action === 'create').length}{' '}
              kategori akan dibuat
            </li>
            <li>{draft.summary.componentCreateCount} komponen akan dibuat</li>
            <li>{draft.summary.skipped} baris dilewati</li>
            <li>{draft.summary.warning} candidate memiliki warning</li>
          </ul>
          <label className="grade-check import-confirm-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              Saya sudah memeriksa data dan memahami bahwa perubahan akan
              disimpan.
            </span>
          </label>
          <div className="import-step-actions">
            <button type="button" className="ghost-action" onClick={() => setStep('review')}>
              <ArrowLeft size={14} />
              Kembali review
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={() => void commit()}
              disabled={!confirmed || busy}
            >
              {busy ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
              Commit import
            </button>
          </div>
        </div>
      )}

      {step === 'result' && commitResult && (
        <div className="import-step-panel import-result-panel">
          <CheckCircle2 size={40} aria-hidden="true" />
          <span>Import selesai</span>
          <h4>Data sudah masuk ke gradebook</h4>
          <div className="import-summary-grid">
            <div>
              <span>Kategori dibuat</span>
              <strong>{commitResult.createdCategoryCount}</strong>
            </div>
            <div>
              <span>Komponen dibuat</span>
              <strong>{commitResult.createdComponentCount}</strong>
            </div>
            <div>
              <span>Dilewati</span>
              <strong>{commitResult.skipped}</strong>
            </div>
            <div>
              <span>Candidate warning</span>
              <strong>{draft?.summary.warning ?? 0}</strong>
            </div>
          </div>
          <button type="button" className="primary-action" onClick={onClose}>
            Kembali ke gradebook
          </button>
        </div>
      )}
    </section>
  );
}
