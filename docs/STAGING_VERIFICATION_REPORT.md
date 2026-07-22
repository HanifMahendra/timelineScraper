# Staging Verification Report

Date: 2026-07-22 (Asia/Jakarta)
Root revision: `e92e2c397621` (`main`, dirty working tree preserved)
Backend revision: `0b284e5905a4` (`main`, dirty working tree preserved)
Gate: `NOT_READY`

## 1. Executive summary

The repository is locally prepared for a fail-closed staging rollout, but no
isolated staging infrastructure is provisioned or authorized. Read-only CLI
control-plane inventory found no staging Firebase project/Hosting target and
no staging Hugging Face Space. Therefore no Rules, indexes, backend, dashboard,
remote data, authentication, login, or scrape were deployed or exercised.
Production identifiers were visible in that inventory, but no production data
plane, application endpoint, configuration, or deployment was accessed or
changed.

## 2. Staging topology

| Boundary | Required | Observed |
| --- | --- | --- |
| Firebase/Firestore/Auth | Dedicated staging project | Missing |
| Hosting | Staging-only site and target | Missing |
| Backend | Staging-only Hugging Face Space | Missing |
| Credentials | Staging service account and encryption key | Missing |
| Test identities | At least two isolated staging users | Missing |
| Local configuration | Ignored `.env.staging` files | Missing by design until resources exist |

The committed `.firebaserc`, dashboard local environment, and backend remote
refer only to production. They were inspected but not mutated or invoked.

## 3. Resources provisioned

None. External resource creation would require owner-selected globally unique
IDs plus IAM/billing decisions. No plausible target was invented and no secret
was generated, copied, printed, or committed.

## 4. Rules/index deployment

Blocked before deployment because no staging project exists. `firestore.rules`
and `firestore.indexes.json` remain local candidates only. Local demo-emulator
verification is part of preflight; no production Rules/index command ran.

## 5. Backend deployment

Blocked because only the production Space `hanifmhndra/timeline-scele-auth` was
discoverable. No upload, push, restart, variable update, or secret update ran.
The staging template requires identity agreement between Firebase project,
service-account `project_id`, staging project ID, Space ID/API URL, and Hosting
origin.

## 6. Dashboard deployment

Blocked because no staging Hosting site/config exists. The ordinary local
static build validates source but is not a staging artifact while `.env.local`
contains production public configuration. The new staging build wrapper was
unit-tested and correctly refused to run without a safe mapping. Nothing in
`dashboard/out` was edited as source or deployed.

## 7. Health/readiness

Remote staging `/health` and `/ready` are not testable without a staging URL.
The smoke tool now calls both anonymously and refuses known production/local
targets.

## 8. Authenticated smoke results

Not run: no staging API, Firebase Auth configuration, or staging ID token.
The non-SCELE smoke covers unauthenticated health/readiness, 401 rejection,
gradebook/category/component/result, subject/topic, and plan draft without
calling `/auth/login` or `/scrape`.

## 9. Cleanup results

No remote test resources were created, so there is nothing to clean. Residual
test IDs: none. Tooling cleanup failure is now fatal and reports only resource
type/ID for manual cleanup.

## 10. User isolation results

Remote cross-user verification is blocked because two isolated staging users
do not exist. Local Rules/emulator ownership tests remain the available
evidence and do not substitute for staging verification.

## 11. Timeline verification

Remote synthetic timeline read, invalid-URL, diff/history, and partial-result
checks are blocked. No SCELE-derived or production timeline was read or changed.

## 12. Grade verification

Remote grade matrix is blocked. Deterministic unit/integration coverage remains
local evidence only; it is not reported as a staging pass.

## 13. Import verification

Remote CSV/XLSX preview, invalid-row, commit, replay, cancel, and cleanup checks
are blocked. No synthetic upload reached an external service.

## 14. Study-plan verification

Remote subject/topic/catalog/draft/apply/progress/resource checks are blocked.
No staging study data exists.

## 15. UI/manual verification

Blocked because there is no safe staging URL. Browser visual checks were not
redirected to production. Timeline/Nilai/Belajar, responsive layouts, themes,
auth-expiry, and request-ID UI still require manual staging verification.

## 16. CORS/security/rate-limit verification

Local automated coverage verifies exact-origin CORS, security headers,
request IDs, safe errors, timeouts/rate limits, and staging guards. Remote
origin/header/rate-limit behavior is blocked until backend deployment.

## 17. Observability findings

Local structured logging/redaction and low-cardinality metrics have automated
coverage. Remote log correlation, readiness failures, 401/403/429/5xx signals,
and sensitive-data review are blocked. No external logs were produced by this
phase.

## 18. Backup and rollback rehearsal

Procedures were reviewed in `docs/BACKUP_RECOVERY.md`; no export could be
rehearsed because the staging project/bucket and `gcloud` are absent. Rollback
inputs are the prior Git revisions/artifacts plus reviewed prior Rules/index
files. Backend revision rollback, correct-environment static rebuild, and
restore into a separate project still need a staging rehearsal.

## 19. Dependency risk decision

The new high-severity `sharp <0.35.0` advisory was resolved locally by pinning
patched 0.35.3, and the new `fast-uri <=3.1.3` advisory was resolved with
3.1.4. Dashboard production audit returned zero; its complete audit retains
only three moderate development-tooling findings. Backend retains eight
moderate findings in Firebase Admin 12's Google Cloud/`uuid` chain; no forced
major upgrade was applied. This is accepted for staging preparation only, not
production. Owner review is required before production and by 2026-08-22.

## 20. Files changed for Phase 7

- Staging examples/readiness/build: `.gitignore`, dashboard `.gitignore`, both
  `.env.staging.example` files, `scripts/staging-readiness.mjs`,
  `scripts/build-dashboard-staging.mjs`, root `package.json`.
- Guards/tests/smoke: backend `.gitignore`, `src/config.js`, hardening tests,
  `scripts/smoke-staging.mjs`, `scripts/preflight.mjs`, operations tests.
- Dependency patch: dashboard `package.json` and lockfile.
- Documentation: deployment, staging, release, dependency, schema, changelog,
  and this report.

No `cloud-run-auth`, generated output, or production configuration was changed.

## 21. Test results

`npm run preflight` passed: safe config/catalog, backend/root tests, dashboard
lint/TypeScript/static build, demo Firestore emulator/Rules tests, secret scan,
61-file backend syntax check, and production audits. Audit totals: root 0;
dashboard production 0, full 3 moderate development-only; backend production/
full 8 moderate. Explicit suites passed root 235/235 and backend 225/225;
Phase 7 operations tests passed 8/8. `npm run preflight:staging` repeated every
environment-independent local check, intentionally skipped the staging build,
and returned `STAGING_BLOCKED` with `MISSING_BACKEND_ENV` and
`MISSING_DASHBOARD_ENV`; it made no remote call.

## 22. Remaining blockers

Blockers: dedicated Firebase project/Firestore/Auth; Hosting site/target;
staging Space; staging-only service account/key; exact origins/public config;
two test users and short-lived token; index deployment/readiness; remote smoke,
isolation/domain/UI/observability; backup/rollback rehearsal. Backend moderate
dependency acceptance remains required for production. There are no known
residual resources from this attempt.

## 23. SCELE smoke status

`NOT AUTHORIZED`

The exact separate authorization phrase was not supplied. No SCELE credentials,
login, session, or scrape were used.

## 24. Production readiness gate

`NOT_READY`

Production deployment is prohibited. The missing isolated staging topology and
all dependent remote evidence are release blockers.

## 25. Context for Phase 8

- Staging deployment: not started; resources missing.
- Verified external staging URLs/resources: none.
- Rules/index: local only, not deployed.
- Smoke/isolation: not run remotely; no residual IDs.
- Rollback/backup: documentation reviewed, rehearsal blocked.
- Dependency: `sharp` resolved; backend moderates accepted for staging
  preparation only.
- SCELE smoke: `NOT AUTHORIZED`.
- Recommended next phase: provision the isolated staging topology, rerun
  `npm run preflight:staging`, and complete Phase 7. Only then consider an
  separately authorized SCELE staging smoke. Controlled production rollout,
  scheduler/notification design, and PDF/DOCX threat-model/parser work should
  wait.

CONTEXT FOR PHASE 8 PROMPT
