import { friendlyImportError } from './importFormatters';
import { getApiBaseUrl, networkApiError, safeErrorBody, SafeApiError } from '@/lib/apiErrors';
import type {
  GradeImportDraft,
  ImportCategoryResolution,
  ImportCommitResult,
  ImportDetailResponse,
  ImportRowPatch,
  ImportTargetField,
} from './importTypes';

const AUTH_API_BASE_URL = process.env.NEXT_PUBLIC_AUTH_API_BASE_URL;

export class ImportApiError extends SafeApiError {
  constructor(body: ReturnType<typeof safeErrorBody>, fallback: string, status?: number) {
    super({ ...body, message: friendlyImportError(body.error, body.message || fallback) }, fallback, status);
    this.name = 'ImportApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertImportDetail(value: unknown): ImportDetailResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.draft) ||
    typeof value.draft.id !== 'string' ||
    typeof value.draft.status !== 'string' ||
    !Array.isArray(value.rows) ||
    !isRecord(value.pagination)
  ) {
    throw new Error('Response import backend tidak valid.');
  }
  return value as unknown as ImportDetailResponse;
}

async function importRequest(
  idToken: string,
  path: string,
  init: RequestInit = {}
): Promise<unknown> {
  const baseUrl = getApiBaseUrl(AUTH_API_BASE_URL);
  const isFormData = init.body instanceof FormData;
  let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(!isFormData && init.body
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init.headers,
    },
  }); } catch (error) { throw networkApiError('Permintaan import nilai gagal.', error); }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ImportApiError(
      safeErrorBody(body),
      'Permintaan import nilai gagal.',
      response.status
    );
  }
  return body;
}

function importPath(gradebookId: string, suffix = '') {
  return `/gradebooks/${encodeURIComponent(gradebookId)}/imports${suffix}`;
}

export async function uploadGradeImport(
  idToken: string,
  gradebookId: string,
  file: File
) {
  const form = new FormData();
  form.append('file', file);
  return assertImportDetail(
    await importRequest(idToken, importPath(gradebookId), {
      method: 'POST',
      body: form,
    })
  );
}

export async function listGradeImports(
  idToken: string,
  gradebookId: string
) {
  const body = await importRequest(idToken, importPath(gradebookId));
  if (!isRecord(body) || !Array.isArray(body.drafts)) {
    throw new Error('Response daftar import tidak valid.');
  }
  return body as unknown as { drafts: GradeImportDraft[] };
}

export async function getGradeImport(
  idToken: string,
  gradebookId: string,
  draftId: string,
  options: { limit?: number; cursor?: string; sheet?: string } = {}
) {
  const query = new URLSearchParams();
  if (options.limit) query.set('limit', String(options.limit));
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.sheet) query.set('sheet', options.sheet);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return assertImportDetail(
    await importRequest(
      idToken,
      importPath(
        gradebookId,
        `/${encodeURIComponent(draftId)}${suffix}`
      )
    )
  );
}

export async function updateImportMapping(
  idToken: string,
  gradebookId: string,
  draftId: string,
  input: {
    selectedSheet?: string;
    columnMapping: Partial<Record<ImportTargetField, string>>;
    categoryResolutions?: ImportCategoryResolution[];
  }
) {
  return assertImportDetail(
    await importRequest(
      idToken,
      importPath(
        gradebookId,
        `/${encodeURIComponent(draftId)}/mapping`
      ),
      { method: 'PATCH', body: JSON.stringify(input) }
    )
  );
}

export async function updateImportRow(
  idToken: string,
  gradebookId: string,
  draftId: string,
  rowId: string,
  input: ImportRowPatch
) {
  const body = await importRequest(
    idToken,
    importPath(
      gradebookId,
      `/${encodeURIComponent(draftId)}/rows/${encodeURIComponent(rowId)}`
    ),
    { method: 'PATCH', body: JSON.stringify(input) }
  );
  if (!isRecord(body) || !isRecord(body.draft) || !isRecord(body.row)) {
    throw new Error('Response candidate import tidak valid.');
  }
  return body as unknown as {
    draft: GradeImportDraft;
    row: ImportDetailResponse['rows'][number];
  };
}

export async function revalidateGradeImport(
  idToken: string,
  gradebookId: string,
  draftId: string
) {
  const body = await importRequest(
    idToken,
    importPath(
      gradebookId,
      `/${encodeURIComponent(draftId)}/revalidate`
    ),
    { method: 'POST', body: '{}' }
  );
  if (!isRecord(body) || !isRecord(body.draft)) {
    throw new Error('Response revalidation tidak valid.');
  }
  return body as unknown as { draft: GradeImportDraft };
}

export async function commitGradeImport(
  idToken: string,
  gradebookId: string,
  draft: GradeImportDraft
) {
  const body = await importRequest(
    idToken,
    importPath(
      gradebookId,
      `/${encodeURIComponent(draft.id)}/commit`
    ),
    {
      method: 'POST',
      body: JSON.stringify({
        confirmation: true,
        expectedDraftVersion: draft.version,
        commitToken: draft.commitToken,
      }),
    }
  );
  if (!isRecord(body) || typeof body.status !== 'string') {
    throw new Error('Response commit import tidak valid.');
  }
  return body as unknown as ImportCommitResult;
}

export async function cancelGradeImport(
  idToken: string,
  gradebookId: string,
  draftId: string
) {
  return importRequest(
    idToken,
    importPath(
      gradebookId,
      `/${encodeURIComponent(draftId)}/cancel`
    ),
    { method: 'POST', body: '{}' }
  );
}
