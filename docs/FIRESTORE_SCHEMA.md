# Firestore Schema

This document describes the production Firestore data written by
`timeline-scele-auth/`. Firebase Admin is the only writer. The browser can read
its own timeline and activity/history documents, but cannot write them.

```text
SCELE scrape
→ activity snapshots/history
→ userTimelines projection
→ dashboard

Manual grade input
→ gradebooks/categories/components/scenarios
→ deterministic calculation API
→ grade dashboard

CSV/XLSX upload
→ importDrafts/rows
→ explicit reviewed commit through grade service
→ categories/components
```

`cloud-run-auth/` is legacy and is not the production backend.

## Ownership and access

| Path | Owner | Client read | Client write | Backend |
| --- | --- | --- | --- | --- |
| `sceleSessions/{uid}` | UID | Denied | Denied | Firebase Admin |
| `userTimelines/{uid}` | UID | Own document | Denied | Firebase Admin |
| `users/{uid}/activities/{activityId}` | UID | Own documents | Denied | Firebase Admin |
| `.../history/{historyId}` | UID | Own documents | Denied | Firebase Admin |
| `users/{uid}/gradebooks/{gradebookId}` | UID | Denied | Denied | Firebase Admin |
| `.../categories/{categoryId}` | UID | Denied | Denied | Firebase Admin |
| `.../components/{componentId}` | UID | Denied | Denied | Firebase Admin |
| `.../scenarios/{scenarioId}` | UID | Denied | Denied | Firebase Admin |
| `.../importDrafts/{draftId}` | UID | Denied | Denied | Firebase Admin |
| `.../importDrafts/{draftId}/rows/{rowId}` | UID | Denied | Denied | Firebase Admin |
| `scrapeRuns/{runId}` | `uid` field | Denied | Denied | Firebase Admin |
| `scrapeLocks/{uid}` | UID | Denied | Denied | Firebase Admin |
| `scrapeControls/{uid}` | UID | Denied | Denied | Firebase Admin |

Firebase Admin bypasses Firestore Security Rules. `firestore.rules` denies
unknown collections by default.

Grade data is intentionally API-only. Unlike timeline/activity reads, the
browser does not read grade documents directly. Every grade endpoint verifies
a Firebase ID token, derives UID from that token, validates input server-side,
and scopes repository paths below `users/{uid}`.

## `sceleSessions/{uid}`

```text
username: string
storageState:
  iv: string
  tag: string
  data: string
updatedAt: Timestamp
```

`storageState` is AES-GCM encrypted. Passwords are never stored. Session
documents should be deleted on logout and should gain explicit expiry/key
version fields in a later hardening phase.

## `users/{uid}/activities/{activityId}`

The activity document ID is the stable `activityId`; it is never a Firestore
auto-ID. The per-user path provides ownership isolation.

```text
activityId: string
uid: string
courseId: string
courseName: string
moduleType: string
type: string
title: string
normalizedTitle: string
deadlineText: string | null
deadlineISO: string | null
url: string
urlValid: boolean
identitySource: "moodle" | "fallback"
contentHash: string
lifecycleState: "active" | "missing"
changeState: "new" | "unchanged" | "changed" | "reappeared"
firstSeenAt: Timestamp
lastSeenAt: Timestamp
lastChangedAt?: Timestamp
missingSince?: Timestamp
reappearedAt?: Timestamp
firstSeenRunId: string
lastSeenRunId: string
lastChangedRunId?: string
version: number
```

Snapshots intentionally omit `rawText`, raw HTML, cookies, session state,
credentials, tokens, and internal error data. URLs pass the Phase 1 exact-host
validator before persistence.

### Lifecycle and change state

- `active`: present in the latest authoritative full-success scrape.
- `missing`: previously active and absent from a successfully scraped course.
- `new`: first observed after bootstrap.
- `unchanged`: same stable ID and `contentHash`.
- `changed`: same stable ID but a different `contentHash`.
- `reappeared`: a missing snapshot became visible again.

`version` starts at 1 and increments for meaningful content changes. Marking an
activity missing does not increment its version. Reappearance increments the
version only if content changed while it was missing.

## `users/{uid}/activities/{activityId}/history/{historyId}`

History is append-only for meaningful events. `historyId` is a deterministic
SHA-256-derived ID from run ID, activity ID, and event type. Retrying the same
run/event overwrites the same entry rather than creating a duplicate.

```text
uid: string
activityId: string
runId: string
eventType:
  "created"
  | "content_changed"
  | "deadline_changed"
  | "marked_missing"
  | "reappeared"
occurredAt: Timestamp
previous?:
  title: string
  deadlineISO: string | null
  contentHash: string
  url: string
current?:
  title: string
  deadlineISO: string | null
  contentHash: string
  url: string
changedFields?: string[]
```

Unchanged activity does not create history. A deadline addition, removal, or
change uses `deadline_changed`; previous and current deadline values are stored
directly rather than inferred from `rawText`. A reappeared event may include
`changedFields` and increment the version when content also changed.

The authenticated history endpoint returns a filtered view without UID or URL.

## `userTimelines/{uid}`

```text
today: Task[]
upcoming: Task[]
overdue: Task[]
updatedAt: string
scrapedAt: Timestamp
lastScrapeRunId: string
```

This remains the backward-compatible dashboard projection and is not replaced
by the activity collection in Phase 2. Existing task fields remain:

```text
title, type, course, deadlineText, deadlineISO, url, rawText,
isOverdue, isDueToday, isDueSoon,
activityId, courseId, moduleType, identitySource, contentHash, urlValid
```

Projection-only enrichment is optional for legacy compatibility:

```text
changeState?: "new" | "unchanged" | "changed" | "reappeared"
lifecycleState?: "active" | "missing"
previousDeadlineISO?: string
lastChangedAt?: string
version?: number
```

Missing activities do not enter this active projection. Legacy tasks without
Phase 2 fields continue to render normally.

## `scrapeRuns/{runId}`

```text
uid: string
startedAt: Timestamp
completedAt?: Timestamp
status: "running" | "success" | "partial" | "failed"
discoveredCourseCount: number
successfulCourseCount: number
failedCourseCount: number
courseResults: sanitized result[]
taskCount?: number
timelineWritten: boolean
previousTimelinePreserved: boolean
activityDiff?:
  new: number
  unchanged: number
  changed: number
  missing: number
  reappeared: number
isBootstrapRun?: boolean
errorCode?: string
errorMessage?: string
```

The backend keeps the latest `SCRAPE_RUN_RETENTION_COUNT` runs per user
(default 50). Cleanup queries and deletes are bounded, never delete a document
whose status is `running`, and are best-effort so cleanup failure does not
change a successful scrape result. A production Firestore TTL policy may be
added later as a second retention layer.

## `scrapeLocks/{uid}`

```text
uid: string
ownerId: string
acquiredAt: Timestamp
expiresAt: Timestamp
runId?: string
```

The lock is acquired in a Firestore transaction. It can be replaced after
expiry and can only be released when `ownerId` matches. The default TTL is
`SCRAPE_LOCK_TTL_SECONDS=900`. The in-memory gate remains a fast local guard;
this document is authoritative across backend instances.

## `scrapeControls/{uid}`

```text
uid: string
lastStartedAt: Timestamp
lastCompletedAt?: Timestamp
cooldownUntil: Timestamp
```

The same transaction that acquires the distributed lock checks and advances
the per-user cooldown. Requests before `cooldownUntil` receive HTTP 429 and a
deterministic `Retry-After`. Different UIDs are independent.

## `users/{uid}/gradebooks/{gradebookId}`

Grade tracker data is a separate domain from the SCELE timeline. A gradebook
may optionally store a Moodle `courseId`, but it remains fully functional
without SCELE.

```text
id: string
uid: string
courseId?: string
courseName: string
courseCode?: string
semester?: string
gradingScale: "percentage" | "points"
targetScore?: number | null
capFinalScoreAt100: boolean
status: "active" | "archived"
createdAt: Timestamp
updatedAt: Timestamp
archivedAt?: Timestamp
```

`capFinalScoreAt100` defaults to `false`. This prevents bonus contribution from
being silently hidden. `DELETE /gradebooks/{id}` is a soft archive; recursive
unbounded deletion is not used.

Calculated totals are not persisted as authoritative fields. User inputs are
the source of truth and results are recalculated by pure deterministic
functions on every detail/result request.

### `categories/{categoryId}`

```text
id: string
gradebookId: string
name: string
description?: string
weightMode: "fixed" | "derived" | "unknown"
weight?: number | null
aggregation: "weighted_mean" | "simple_mean" | "sum_points"
dropLowestCount: number
optional: boolean
order: number
status: "active" | "archived"
createdAt: Timestamp
updatedAt: Timestamp
archivedAt?: Timestamp
```

- `fixed` requires an explicit `weight` from 0 through 100.
- `derived` uses explicit fixed component weights.
- `unknown` does not receive an inferred weight.
- Archiving a category also archives its currently active components in
  bounded batches of at most 400 writes.

### `components/{componentId}`

```text
id: string
gradebookId: string
categoryId?: string | null
name: string
description?: string
componentType:
  "assignment" | "quiz" | "exam" | "project" | "participation"
  | "lab" | "bonus" | "other"
weightMode: "fixed" | "equal_in_category" | "unknown"
weight?: number | null
maxScore?: number | null
earnedScore?: number | null
scoreStatus: "pending" | "known" | "not_applicable" | "excluded"
isBonus: boolean
isOptional: boolean
isDropped: boolean
replacementForComponentId?: string | null
linkedActivityId?: string | null
dueDate?: Timestamp
order: number
status: "active" | "archived"
createdAt: Timestamp
updatedAt: Timestamp
archivedAt?: Timestamp
```

`earnedScore: 0` with `scoreStatus: known` is a real zero. A pending score is
not treated as zero. In points mode, a known score requires `maxScore > 0`.
`normalizedScore` is deliberately not stored as source of truth.

`linkedActivityId` is optional. The backend verifies that the linked snapshot
exists below the authenticated user's `users/{uid}/activities` collection.
Linking never imports a grade, and a component survives when its SCELE activity
becomes missing. The dashboard's activity picker performs an own-user,
document-ID-ordered read bounded to 500 snapshots; the timeline projection is
used only as a fallback if that read is unavailable.

### `scenarios/{scenarioId}`

```text
id: string
gradebookId: string
name: string
targetScore?: number | null
assumptions:
  - componentId: string
    assumedScore: number
status: "active" | "archived"
createdAt: Timestamp
updatedAt: Timestamp
archivedAt?: Timestamp
```

Assumptions may reference only active pending components in the same
gradebook. Duplicate component assumptions are rejected. Scenario calculation
does not update `earnedScore` or `scoreStatus`.

### `importDrafts/{draftId}`

Import drafts are API-only, temporary, non-authoritative staging records for
CSV/XLSX review. The metadata document is kept below its gradebook:

```text
id: string
uid: string
gradebookId: string
sourceType: "csv" | "xlsx"
originalFilename: string
sanitizedFilename: string
status:
  "needs_mapping" | "ready_for_review" | "validation_failed"
  | "committing" | "committed" | "commit_failed"
  | "cancelled" | "expired"
parserVersion: string
version: number
selectedSheet?: string | null
selectedSheetPrefix?: string | null
availableSheets:
  - name: string
    visibility: "visible" | "hidden" | "very_hidden"
    rowCount: number
    columnCount: number
sheetCatalog: bounded mapping metadata[]
detectedHeaders: string[]
sourceColumns: bounded source-column metadata[]
columnMapping: map
categoryResolutions: bounded resolution[]
warnings: structured warning[]
errors: structured error[]
summary: bounded count/weight summary
rowCount: number
totalSourceRowCount: number
acceptedCandidateCount: number
rejectedCandidateCount: number
contentFingerprint: SHA-256 hex
commitToken: random base64url string
createdAt: Timestamp
updatedAt: Timestamp
expiresAt: Timestamp
commitStartedAt?: Timestamp
committedAt?: Timestamp
committedCategoryIds?: string[]
committedComponentIds?: string[]
commitFailure?: sanitized recovery metadata
```

The client receives `commitToken` only on an owned draft detail response; list
responses omit it. No binary workbook, raw upload buffer, credential, token,
cookie, stack trace, temp path, or service-account data is stored.

Candidate data uses a row subcollection to avoid the Firestore 1 MiB document
limit:

```text
importDrafts/{draftId}/rows/{rowId}

rowId: deterministic sheet-prefix + source-row identifier
draftId: string
gradebookId: string
sheetName: string
sheetPrefix: string
sourceRowNumber: number
sourceValues: bounded normalized cell map
formulaColumns: string[]
formulaCachedColumns: string[]
candidateKind: "category" | "component" | "unknown"
categoryName?: string
componentName?: string
componentType?: string
weightMode?: string
weight?: number | null
maxScore?: number | null
earnedScore?: number | null
scoreStatus?: string
aggregation?: string
dropLowestCount?: number
isBonus?: boolean
isOptional?: boolean
dueDate?: normalized ISO string | null
action: "create" | "skip"
confidence: "high" | "medium" | "low"
warnings: structured warning[]
validationStatus: "valid" | "warning" | "invalid"
normalizedPreview: bounded map
conflictSuggestion?: bounded map
createdAt: Timestamp
updatedAt: Timestamp
```

Rows are fetched by document-ID prefix for the selected sheet with a default
page size of 50 and maximum 100. Upload and mapping may batch draft-row writes
in chunks of 400, but they never write authoritative grade collections. The
draft stays in non-committable `parsing` status until every staged row batch is
written and the review status is published.
Application-level expiry defaults to 24 hours. Listing/import creation performs
bounded best-effort retention (default 20 drafts), never deletes a `committing`
draft, and deletes row documents with an explicit safety bound.

Commit first transaction-locks the draft using status, version, expiry, and a
timing-safe token comparison. The gradebook service validates a plan and
writes at most 300 new categories/components in one bounded authoritative
batch with deterministic IDs. After success the draft stores the committed
IDs. A committed replay returns the saved result. A post-write metadata
failure becomes `commit_failed` with sanitized recovery metadata; deterministic
IDs make a deliberate retry recoverable without duplicate grade entities.

### Grade lifecycle and limits

All grade collections use soft archive. Active queries are bounded by:

```text
MAX_GRADEBOOKS_PER_USER=50
MAX_CATEGORIES_PER_GRADEBOOK=50
MAX_COMPONENTS_PER_GRADEBOOK=500
MAX_SCENARIOS_PER_GRADEBOOK=20
```

Overrides are bounded by server-side safety ceilings. Firestore query limits
use configured limit plus one when detecting corrupt/overflow state. Category
cascade archive is chunked to 400 writes, below Firestore's 500-operation
limit. No recursive delete or unbounded collection scan is used.

The grade repository uses server timestamps. Cross-document calculation is
read-only, so there is no attempt to persist a result transaction. CRUD writes
are single-document operations except bounded category cascade archive.

Structured import follows the same grade validation and service layer as
manual creation. It does not infer unknown weights, automatically merge
existing entities, or change calculation semantics.

## Study subjects and topics

Study planning is a separate, API-only per-user domain. It reads activity and
gradebook data but never mutates either source.

```text
users/{uid}/subjects/{subjectId}
users/{uid}/subjects/{subjectId}/topics/{topicId}
```

A subject stores `source` (`scele` or `manual`), optional `sourceCourseId` and
`sourceGradebookId`, `displayName`, conservative `normalizedKey`, optional
`courseCode`, `semester`, and `catalogSubjectKey`, plus `status` and timestamps.
The subject ID—not `normalizedKey`—is the ownership key. SCELE sync uses course
plus semester for deterministic identity and never deletes a missing course.

A topic stores optional `catalogTopicKey`, title/description, order,
`estimatedMinutes`, same-subject `prerequisiteTopicIds`, difficulty, status,
mastery, progress 0–100, and timestamps. Server validation rejects missing,
self, cross-subject, and cyclic prerequisites. `completed` writes progress 100;
`skipped` is not counted as completed. Optional `linkedActivityIds` and
`linkedGradeComponentIds` are verified as same-user references; an activity on
a SCELE subject must also belong to that subject's course.

## Study preferences

```text
users/{uid}/studyPreferences/default
```

The singleton contains the IANA timezone, bounded daily capacity, available
days, minimum/preferred/maximum session duration, optional non-overlapping time
blocks, weekend choice, planning horizon, and difficulty preference. Defaults
are Asia/Jakarta, 60 minutes/day, 30-minute sessions, and 14 days.

## Study plans, drafts, and sessions

```text
users/{uid}/studyPlans/{planId}
users/{uid}/studyPlans/{planId}/sessions/{sessionId}
users/{uid}/studyPlanDrafts/{draftId}
users/{uid}/studyPlanDrafts/{draftId}/sessions/{sessionId}
```

An authoritative plan stores its subject IDs, date range, status, generation
mode, bounded planning inputs, generation summary, source draft, and timestamps.
Sessions store subject/topic IDs, local calendar date and optional time,
planned/actual minutes, status, deterministic priority/breakdown, reason codes,
and optional activity or grade-component links.

A draft stores a version, expiry, explicit apply token, source-read timestamps,
planning inputs, warnings/unscheduled material, and regeneration comparison IDs.
Candidate sessions live only under the draft until explicit apply. Apply uses
deterministic authoritative IDs and one bounded transaction; retrying the same
applied draft returns the previously created plan.

Direct web-client access to all study paths is denied in `firestore.rules`.
The backend derives UID only from the verified Firebase token.

## Diff and partial-scrape policy

Activity snapshots are changed only for an authoritative full success:

```text
status == success
failedCourseCount == 0
successfulCourseCount == discoveredCourseCount
discoveredCourseCount > 0
at least one activity extracted
```

The implementation takes the conservative Phase 2 option:

- full success: run activity diff, mark eligible absence as missing, persist
  snapshots/history, then write the timeline;
- partial/failed/no-course/no-task: do not touch activity snapshots, do not
  calculate missing, and do not write the timeline.

An absent activity is marked missing only when its `courseId` belongs to the
successful course set. Missing snapshots are not deleted.

## Bootstrap and legacy migration

Migration is lazy and additive. Existing `userTimelines` data is not used to
backfill snapshots because legacy projections may not contain enough identity
data.

On the first successful scrape with no existing snapshots:

- snapshots are created at version 1;
- `created` history entries are written;
- `isBootstrapRun` is true;
- projection `changeState` is `unchanged`, preventing every card from showing
  a “Baru” badge.

Later unseen activities use `changeState: new`.

## Write ordering and batch limits

Successful scrape ordering is:

```text
1. load previous snapshots
2. calculate pure diff
3. persist snapshot/history batches
4. best-effort history retention
5. build and write userTimelines projection
6. finalize scrape run
7. best-effort scrape-run retention
8. release distributed lock in finally
```

Firestore permits 500 operations per batch. Phase 2 uses at most 400
operations per batch and paginates activity reads. Full atomicity is not
possible across multiple batches. If a later batch fails, the timeline is not
written and the run is failed, but earlier committed activity chunks may
remain. Deterministic history IDs and the next authoritative scrape make that
state reconcilable.

History retention keeps at most `ACTIVITY_HISTORY_RETENTION_COUNT` entries per
changed activity (default 50). Cleanup is bounded and best-effort; the primary
snapshot is never deleted.

## Size considerations

Firestore documents have a 1 MiB limit. `userTimelines/{uid}` still stores
arrays and `rawText`, so it remains the immediate size risk. Activity snapshots
are separate documents and intentionally omit `rawText`. Activity loading is
paginated with a defensive per-user safety ceiling.

## Required index

`firestore.indexes.json` defines:

```text
scrapeRuns: uid ASC, startedAt DESC
```

This supports bounded latest-N retention queries.

## Phase 6 query and index inventory

All repository queries were re-audited against source. Exactly one composite
index is required: collection `scrapeRuns`, equality on `uid`, ordered by
`startedAt DESC`. It supports bounded per-user run retention. The following
queries use automatic single-field/document-ID indexes and do not justify
speculative composites:

| Path/query | Fields | Purpose |
| --- | --- | --- |
| activity/history | `occurredAt DESC` | Bounded history and retention. |
| gradebooks/categories/components/scenarios | `status == active` | Bounded active entities. |
| import drafts | `createdAt DESC` | Bounded recent drafts. |
| import rows | document ID range/order | Selected-sheet pagination/cleanup. |
| subjects | `status == active` | Bounded active subjects. |
| activities | `courseId == value` | Same-user subject link validation. |
| study plans | `status in [active, completed]` | Bounded plans; application sorts returned bounded results. |
| topics, plan/draft sessions | bounded collection/document-ID reads | Deterministic application ordering. |

`firebase.json` points to both `firestore.rules` and
`firestore.indexes.json`. Emulator tests use `demo-scele-timeline` on local
port 8181, clear state between tests, verify Rules ownership/API-only paths,
and exercise Admin persistence for timeline, grade/import, and study data.
No Rules or index deployment is part of Phase 6.

## Validate locally

Use a demo project ID so no production project is contacted:

```powershell
npx firebase-tools emulators:start --only firestore --project demo-scele-timeline
```

Or:

```powershell
npx firebase-tools emulators:exec --only firestore --project demo-scele-timeline "node --version"
```

Do not run `firebase deploy` during local verification. If the emulator process
does not exit automatically, stop it and confirm ports 8181/9151 are clear.
