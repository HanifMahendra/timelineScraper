# Staging Environment

Staging must be physically separated from production: a distinct Firebase
project, Firestore database, Firebase Authentication tenant/configuration,
service account, encryption key, Hugging Face Space, Hosting target, origins,
and test users. Collection prefixes inside the production project are not an
acceptable boundary. Never copy production sessions, service credentials, or
Firestore data into staging.

Suggested names are `timeline-scele-staging` (Firebase project/Hosting target)
and `timeline-scele-auth-staging` (private Hugging Face Space). Set backend
`APP_ENV=staging`, its staging project ID/service account, a new 32-byte key,
the exact staging Hosting origin, and bounded variables from `.env.example`.
Set the staging dashboard Firebase public variables and the staging API origin
before its static build.

The repository now includes non-secret templates at
`timeline-scele-auth/.env.staging.example` and
`dashboard/.env.staging.example`. Copy them to their ignored `.env.staging`
counterparts only after the isolated resources exist. Then add a Firebase
`staging` project alias and a staging-only Hosting target. Validate the complete
mapping before any deploy:

```powershell
npm run preflight:staging
```

`READY_FOR_STAGING` is the only deployable result. `STAGING_BLOCKED` means stop;
the validator rejects known production projects, URLs, dashboard origins,
service-account project mismatches, API/Space mismatches, and Hosting target
mixing without printing secret values.

Do not use a plain `npm run build` as the staging artifact step because Next.js
does not have a native staging environment mode and may load `.env.local`.
After readiness passes, use:

```powershell
npm run dashboard:build:staging
```

The wrapper injects the reviewed `NEXT_PUBLIC_*` staging values and scans the
static artifact for the expected project/API identity and known production
identifiers.

## Setup order

1. Create the staging Firebase project and enable custom-token authentication.
2. Create a least-privilege staging-only service account and encryption key.
3. Create the staging Space and configure variables/secrets; do not clone
   production secret values.
4. Configure a Firebase Hosting staging target and build the dashboard with
   staging public variables.
5. Deploy rules and indexes to staging only, then run demo-project emulator
   tests locally.
6. Create an isolated test account/UID and obtain a short-lived staging ID
   token without placing it in shell history or logs.
7. Run `scripts/smoke-staging.mjs` only with `ALLOW_STAGING_SMOKE=true`.
8. Review logs and perform the matrix below. Remove/archive smoke resources and
rotate temporary tokens after use.

Required variables are `STAGING_API_BASE_URL`,
`STAGING_FIREBASE_PROJECT_ID`, `STAGING_TEST_ID_TOKEN`, and
`ALLOW_STAGING_SMOKE=true`. The tool checks health/readiness, unauthorized
rejection, grade CRUD, a manual subject/topic, and a small plan draft; it never
calls login or scrape and cleans only resources it created with a
`smoke-test-*` name. Run manually from the repo root:

```powershell
node scripts/smoke-staging.mjs
```

## Credential policy

The normal authenticated smoke tool never calls `/auth/login` or `/scrape`.
Testing SCELE may require a real SCELE account and therefore needs explicit
owner consent for each run. The separate `smoke-scele-staging.mjs` permits one
login and one bounded scrape, respects backend cooldown, logs only run ID, then
requests logout. It rejects production and does not retry. Do not run it during
Phase 6.

That separate tool additionally requires `ALLOW_SCELE_STAGING_SMOKE=true`,
`STAGING_SCELE_USERNAME`, `STAGING_SCELE_PASSWORD`, and
`STAGING_FIREBASE_WEB_API_KEY`. Execute only after the owner approves the
specific account and run.

## Manual verification matrix

| Area/check | Automated | Emulator | Staging manual | Production manual |
| --- | --- | --- | --- | --- |
| Valid/invalid login, logout, token expiry, remember-login | Partial | No | Required | Read-only/owner-approved |
| Existing timeline read, invalid URL, change/history | Yes | Yes | Required | Read-only |
| Successful scrape and partial preservation | Yes | Yes | Explicit SCELE consent | Never without approval |
| Gradebook, zero/pending, target, scenario, archive | Yes | Yes | Required | Minimal read-only |
| CSV/XLSX, mapping, invalid row, commit replay | Yes | Yes | Required with synthetic files | Not required |
| Subject sync/manual, catalog, topic, draft/apply, resources | Yes | Yes | Required | Minimal read-only |
| User A cannot access user B | Yes | Yes/rules | Required with test users | Not tested destructively |

Cleanup uses only resources named `smoke-test-*`. API soft-archive semantics
remain authoritative; cleanup failure reports the test resource ID for manual
staging cleanup and makes the smoke command exit unsuccessfully.

## Phase 7 resource status (2026-07-22)

Read-only discovery found no authorized staging Firebase project, Hosting site,
Hugging Face Space, staging service account/key, or isolated test users. The
only configured Firebase alias and backend/dashboard targets are production.
Consequently no deployment or remote smoke was attempted. Provisioning requires
owner-selected resource IDs and any required billing/IAM approval; after that,
populate the ignored staging environment files and rerun the staging preflight.
