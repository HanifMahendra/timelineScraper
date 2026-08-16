# Observability

The backend writes structured JSON logs in staging/production. Every request
gets an accepted bounded `X-Request-ID` or a generated `req_<random>` ID; the
same value is returned to the caller and included in completion/error logs.
Request IDs are correlation data only and are never authorization keys or
Firestore document IDs.

Allowed log fields include timestamp, level, event, requestId, runId, draftId,
planId, route template, method, statusCode, durationMs, bounded counts,
errorCode, environment, and serviceVersion. UID correlation uses a short
one-way SHA-256 reference where an existing domain log needs it.

The recursive redactor is depth/entry bounded and removes password,
authorization, cookie, token, storage state, service account, private key,
session, buffer, raw HTML, and file-content keys. It handles arrays, errors,
circular objects, mixed casing, and bearer/private-key text. This does not make
raw bodies safe to log: request bodies, workbook rows, grades, study notes,
HTML, credentials, cookies, and tokens must never be logged.

## Metrics

Metrics are in-process counters/timers emitted as structured `metric` events:

- `http_requests_total`, `http_request_duration_ms`;
- `scrape_runs_total`, `scrape_duration_ms`, `scrape_failures_total`;
- `grade_imports_total`, `grade_import_failures_total`;
- `study_plan_generations_total`, `study_plan_generation_failures_total`;
- `firestore_operation_failures_total`.

Labels are allowlisted to route template, status group, error code, and
environment. UID, filenames, course names, document IDs, and arbitrary input
are rejected, preventing high-cardinality growth. Counters reset with the
process; Hugging Face logs are the current collection surface. A future
collector may parse metric events without changing domain code.

## Health

`GET /health` (and compatibility alias `/healthz`) is liveness-only and never
touches Firebase or SCELE. `GET /ready` checks validated configuration,
Firebase Admin/Firestore client initialization, and loaded catalogs without a
query, write, login, or external request. Failure is HTTP 503 with sanitized
check names.

Recommended alerts: sustained readiness failure, auth failure spike, API 5xx
increase, Firestore permission/failure events, repeated timeline write failure,
scrape failure growth, and import/study failure growth. Alerts must use bounded
aggregates, never academic/user data.
