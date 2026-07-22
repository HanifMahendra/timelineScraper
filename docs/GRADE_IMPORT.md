# Structured Grade Import

Phase 4 adds a staged CSV/XLSX import to the manual grade tracker. Imported
content is never authoritative at parse time:

```text
authenticated upload
→ secure parser adapter
→ temporary draft metadata + candidate rows
→ sheet selection and column mapping
→ review, edit, category resolution, revalidation
→ explicit versioned commit
→ existing gradebook validation/service
→ categories/components
```

This feature does not scrape grades from SCELE and does not change timeline,
activity, scenario, or calculation semantics.

## Scope

Supported:

- UTF-8 CSV with comma, semicolon, or tab delimiters;
- `.xlsx` Open XML workbooks;
- deterministic header detection and primitive normalization;
- visible/hidden sheet metadata and explicit sheet selection;
- paginated candidate review and server-side row editing;
- create/skip component action and explicit category resolution;
- idempotent, bounded commit.

Not supported:

- `.xls`, `.xlsm`, `.xlam`, PDF, DOCX, image, screenshot, or arbitrary ZIP;
- password-protected/encrypted workbooks;
- macro, script, formula, embedded object, or external-link execution;
- OCR, AI extraction, fuzzy automatic merge, or automatic update of an
  existing component;
- pasted-table input. It is deferred to avoid a second upload surface while
  preserving a single reviewed pipeline.

## Adapter and storage design

Parser adapters are pure with respect to Firestore and grade data:

```javascript
async function parse(buffer, limits) {
  return {
    sourceType: "csv" | "xlsx",
    sheets: [
      {
        name,
        visibility: "visible" | "hidden" | "very_hidden",
        rowCount,
        columnCount,
        headers: [{ value, formula, formulaHasCachedValue }],
        rows: [
          {
            sourceRowNumber,
            cells: [{ value, formula, formulaHasCachedValue }]
          }
        ]
      }
    ],
    selectedSheet: string | null
  };
}
```

The parser receives only a bounded memory `Buffer` and limits. It does not know
UIDs, gradebooks, Firestore, or the commit service. No temp file is used.

Draft metadata is stored at:

```text
users/{uid}/gradebooks/{gradebookId}/importDrafts/{draftId}
```

Candidate rows are stored separately at:

```text
users/{uid}/gradebooks/{gradebookId}/importDrafts/{draftId}/rows/{rowId}
```

The draft contains source type, safe display filenames, status, parser
version, selected/available sheet metadata, header/source-column metadata,
mapping, category resolutions, counts, structured warnings/errors, a SHA-256
content fingerprint, random commit token, monotonic version, expiry, and
eventual committed IDs. Candidate rows contain bounded source values needed
for remapping plus normalized, non-authoritative candidate fields. Binary
workbooks and raw buffers are never stored.

Header display/normalization metadata is capped at 120 characters per column.
Together with 20-sheet/50-column ceilings and separate row documents, this
keeps the metadata document safely below Firestore's 1 MiB document limit.

The complete field list and access policy are documented in
`FIRESTORE_SCHEMA.md`.

## Default limits

| Variable | Default | Hard ceiling |
| --- | ---: | ---: |
| `MAX_IMPORT_FILE_BYTES` | 5,242,880 | 20,971,520 |
| `MAX_IMPORT_ROWS` | 2,000 | 5,000 |
| `MAX_IMPORT_COLUMNS` | 50 | 100 |
| `MAX_IMPORT_SHEETS` | 20 | 50 |
| `MAX_IMPORT_CELL_LENGTH` | 2,000 | 10,000 |
| `MAX_IMPORT_TOTAL_CELLS` | 100,000 | 250,000 |
| `MAX_IMPORT_XLSX_UNCOMPRESSED_BYTES` | 52,428,800 | 104,857,600 |
| `MAX_IMPORT_ZIP_ENTRIES` | 5,000 | 10,000 |
| `MAX_IMPORT_DRAFTS_PER_GRADEBOOK` | 20 | 50 |
| `IMPORT_DRAFT_RETENTION_COUNT` | 20 | 50 |
| `IMPORT_DRAFT_TTL_HOURS` | 24 | 168 |
| `MAX_IMPORT_COMMIT_ENTITIES` | 300 | 400 |

Candidate detail pages default to 50 rows and cap at 100. Row/draft writes use
batches of at most 400 operations. A draft remains `parsing` while multi-batch
candidate writes are in progress. Only after every row batch succeeds is its
review status published; a failed creation is cancelled when possible and is
never committable. Mapping/edit revalidation uses the same non-committable
staging status before replacing rows and publishing one new draft version.
At most 500 distinct review categories may be represented in one draft to
bound metadata size. The 300-entity authoritative limit is calculated during
review; an oversized plan stays `validation_failed` until enough rows are
skipped or the file is split.

## Upload and filename security

Every route requires a verified Firebase ID token. UID is taken only from the
token, and the gradebook service establishes ownership before draft access.
Multipart parsing accepts one field named `file`, uses memory storage, and
limits file size, field count, part count, header pairs, field length, and
field nesting.

Validation considers extension, MIME, size, and content structure. CSV is
decoded with fatal UTF-8 validation. XLSX must have a ZIP signature, a valid
central directory, `[Content_Types].xml`, and `xl/workbook.xml`. ZIP64,
traversal-like entry names, excessive entry count, excessive expanded size,
and extreme compression ratio are rejected before ExcelJS loads the workbook.
OLE/encrypted signatures and parser encryption errors receive a sanitized
encrypted-workbook error.

`originalFilename` is display-only, basename-normalized, stripped of control
characters, Unicode-normalized, and length-bounded. `sanitizedFilename` further
restricts characters. Neither is used as a path, document ID, or ownership
signal.

The backend logs only safe metadata: draft ID, truncated gradebook reference,
source type, sanitized filename, file size, counts, duration, and error code.
It does not log buffers, row/cell values, scores, UID, tokens, cookies, stack
traces to clients, or unsanitized paths.

## CSV behavior

The CSV adapter uses `csv-parse` in synchronous parser-only mode. It:

- supports comma, semicolon, and tab using deterministic preview detection;
- supports quoted cells, CRLF/LF, UTF-8, and an optional BOM;
- requires consistent column counts and rejects malformed quotes;
- enforces row, column, cell, record, and total-cell limits;
- preserves blank and zero as different values;
- treats leading `=`, `+`, `-`, and `@` as text and records formula-marker
  metadata/warnings;
- performs no evaluation, code execution, filesystem write, or network
  request.

CSV formula markers matter for a possible future export. This import does not
silently modify their text; a future export must neutralize spreadsheet
formula injection separately.

## XLSX behavior

The XLSX adapter uses ExcelJS only on the backend. It:

- accepts only `.xlsx`;
- preflights the ZIP structure and resource bounds before workbook parsing;
- reports all sheet names, visibility, row counts, and column counts;
- auto-selects only when exactly one sheet is visible;
- never auto-selects hidden or very-hidden sheets;
- reads numeric, text, boolean, and date cell values without formula
  evaluation;
- uses a formula's cached result only when present, and always marks the cell
  as formula-derived;
- treats a formula without a cached result as blank plus a formula warning;
- suppresses cached values from formulas that contain an external workbook,
  URL, file, or UNC reference and records `EXTERNAL_FORMULA_REFERENCE`;
- performs no external reference fetch and does not run macros or scripts.

Multiple visible sheets require an explicit user choice. The aggregate rows
and cells across all parsed sheets are bounded because source rows for manual
sheet selection must remain available in the draft.

## Mapping and confidence

`columnMapping.js` owns a testable alias dictionary for category/component
name, type, weight, maximum/earned score, score status, bonus, optional,
due date, aggregation, and drop-lowest count. It includes English and
Indonesian aliases.

Headers are Unicode-normalized, trimmed, lowercased, separators/punctuation
normalized, and whitespace collapsed. Original headers remain available for
display. A normalized collision creates `AMBIGUOUS_COLUMN_MAPPING`; it is not
silently resolved. One source column cannot map to multiple targets, and
`componentName` is required.

Confidence is deterministic mapping provenance, not an AI probability:

- `high`: canonical known header;
- `medium`: known alias;
- `low`: token-based heuristic or incomplete evidence.

Manual mapping re-normalizes and replaces candidate data within the draft.
It never writes grade categories/components.

## Candidate normalization

Pure normalizers handle text, number, percentage, boolean, date, score status,
component type, and aggregation. They use full-string numeric validation and
reject NaN, Infinity, and partial strings such as `20abc`.

- blank score stays pending; numeric `0` stays a real zero;
- blank weight stays unknown; numeric `0` is retained with a warning;
- `20%` becomes `20`;
- an unqualified `0.2` remains `0.2` with `AMBIGUOUS_PERCENTAGE`; it becomes
  `20` only under an explicit fraction context;
- decimal comma such as `20,5` is accepted when it is a clear single number;
- weights are never rescaled to total 100;
- supported booleans include true/false, yes/no, ya/tidak, and 1/0;
- date-only values become midnight `+07:00` (Asia/Jakarta);
- `YYYY-MM-DD`, unambiguous `DD/MM/YYYY` or `DD-MM-YYYY`, ISO datetime, and
  Excel serial dates are supported;
- ambiguous day/month such as `03/04/2026` is not guessed.

Warnings include:

```text
AMBIGUOUS_COLUMN_MAPPING
MISSING_COMPONENT_NAME
UNKNOWN_COMPONENT_TYPE
UNKNOWN_WEIGHT
ZERO_WEIGHT
AMBIGUOUS_PERCENTAGE
AMBIGUOUS_DATE
INVALID_NUMBER
INVALID_DATE
UNKNOWN_BOOLEAN
KNOWN_SCORE_MISSING
FORMULA_CELL
EXTERNAL_FORMULA_REFERENCE
DUPLICATE_COMPONENT_NAME
POSSIBLE_EXISTING_COMPONENT_MATCH
TOTAL_WEIGHT_BELOW_100
TOTAL_WEIGHT_ABOVE_100
```

Warnings remain reviewable and may be committed after explicit confirmation.
An action=`create` row with invalid status blocks commit.

## Conflicts and review

The service compares normalized candidate component names with existing
components. Exact or normalized matches create a warning and a skip
suggestion; they never overwrite or merge the existing record. Duplicate names
inside one draft are also warned.

Imported category names are deduplicated deterministically. If a same-name
category exists, the draft remains unresolved until the user chooses:

- use that owned existing category; or
- create a new category with a different name.

The dashboard wizard exposes upload, sheet selection, one-to-one column
mapping, summary, status filters, paginated rows, inline edit, create/skip,
category resolution, revalidation, confirmation, and final result. Row edits
are validated server-side and update only candidate/draft state.

## API

```text
POST   /gradebooks/:gradebookId/imports
GET    /gradebooks/:gradebookId/imports
GET    /gradebooks/:gradebookId/imports/:draftId
PATCH  /gradebooks/:gradebookId/imports/:draftId/mapping
PATCH  /gradebooks/:gradebookId/imports/:draftId/rows/:rowId
POST   /gradebooks/:gradebookId/imports/:draftId/revalidate
POST   /gradebooks/:gradebookId/imports/:draftId/commit
POST   /gradebooks/:gradebookId/imports/:draftId/cancel
DELETE /gradebooks/:gradebookId/imports/:draftId
```

Draft/row IDs are allowlisted before repository use. Errors are structured and
sanitized. Typical codes include `IMPORT_FILE_REQUIRED`,
`IMPORT_FILE_TOO_LARGE`, `IMPORT_UNSUPPORTED_TYPE`, `IMPORT_INVALID_CSV`,
`IMPORT_INVALID_XLSX`, `IMPORT_ENCRYPTED_WORKBOOK`,
`IMPORT_MACRO_WORKBOOK_REJECTED`, `IMPORT_TOO_MANY_ROWS`,
`IMPORT_TOO_MANY_COLUMNS`, `IMPORT_TOO_MANY_SHEETS`,
`IMPORT_CELL_TOO_LARGE`, `IMPORT_MAPPING_REQUIRED`,
`IMPORT_DRAFT_NOT_FOUND`, `IMPORT_DRAFT_EXPIRED`,
`IMPORT_DRAFT_NOT_READY`, `IMPORT_DRAFT_VERSION_CONFLICT`,
`IMPORT_ALREADY_COMMITTING`, `IMPORT_VALIDATION_FAILED`,
`IMPORT_COMMIT_TOO_LARGE`, and `IMPORT_COMMIT_PARTIAL_FAILURE`.

## Explicit commit and idempotency

Commit requires:

```json
{
  "confirmation": true,
  "expectedDraftVersion": 4,
  "commitToken": "owned-draft-secret"
}
```

The repository transaction validates token, expiry, exact draft version, and
`ready_for_review`, then changes the state to `committing`. The service reloads
all selected rows, revalidates every create candidate, resolves/deduplicates
categories, and builds a bounded plan. `gradebookService.commitImportPlan`
passes the plan through existing grade validation/ownership/limit checks.
`gradebookRepository.commitImportedEntities` performs a single batch of at
most 400 writes.

Category and component IDs use SHA-256-derived deterministic IDs based on the
draft and candidate keys. Repeated identical operations therefore cannot
create duplicate entities. A committed draft returns the recorded IDs with
`already_committed`. A stale version, different token, expired draft, or
concurrent commit is rejected.

The authoritative grade batch and the subsequent draft status update cannot
be one Firestore atomic transaction because they are in separate service
operations. If the grade batch fails, the draft returns to a reviewable or
validation-failed state. If the grade batch succeeds but marking the draft
fails, the service attempts to record `commit_failed` with sanitized recovery
metadata and returns `IMPORT_COMMIT_PARTIAL_FAILURE`. It does not claim full
success or automatically retry. Deterministic IDs let an operator/user make a
controlled retry without duplicate grade entities.

## Expiry and cleanup

Drafts expire after 24 hours by default and cannot commit after expiry.
Application-level checks mark them expired on access. Listing or creating an
import runs bounded best-effort retention:

- keep at most the configured recent draft count;
- never delete `committing`;
- delete candidate rows with an explicit maximum before deleting metadata;
- do not let cleanup failure block another import.

Firestore TTL may be added later, but it is not required for correctness and
was not deployed in Phase 4.

## Manual verification

1. Start the backend locally with Firebase test/demo credentials and the
   dashboard with `npm run dev:webpack -- -p 3001`.
2. Open an owned gradebook and choose `Import CSV/XLSX`.
3. Upload a small CSV containing blank, zero, `20%`, and an ambiguous date.
4. Confirm blank remains pending, zero remains zero, and warnings are visible.
5. Upload a generated XLSX with two visible sheets and one hidden sheet.
6. Confirm no sheet is auto-selected and hidden metadata is shown.
7. Map `Component Name`, edit one row, skip one conflict, and revalidate.
8. Resolve each existing-category conflict explicitly.
9. Confirm commit is disabled until the exact review checkbox is selected.
10. Commit once, retry the identical request, and confirm no duplicate
    category/component is created.
11. Confirm timeline navigation and SCELE-derived deadlines are unchanged.

For automated validation, run root tests, all backend tests, dashboard
lint/type-check/static build, demo-project Firestore Rules compilation, npm
audit, and a diff secret scan. No production login, scrape, Firestore access,
deployment, or commit is part of Phase 4.
