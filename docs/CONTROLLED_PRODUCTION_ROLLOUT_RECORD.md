# Controlled Production Rollout Record

Date: 2026-07-22
Project: `timeline-automated-scraper`
Dashboard: `https://timeline-automated-scraper.web.app`
Backend: `https://hanifmhndra-timeline-scele-auth.hf.space`
Status: `DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE`

## Owner decisions

- Backup: `WAIVED_BY_OWNER_NO_MANAGED_BACKUP`.
- Dependency: `ACCEPTED_TEMPORARILY_FOR_PRODUCTION` through review no later
  than 2026-08-22.
- SCELE: `NOT AUTHORIZED`; no login or scrape.
- No migration, recursive delete, mass cleanup, or real-user access.
- Deploy one surface at a time and stop/rollback at the first risky failure.
- Authenticated smoke is permitted only with a dedicated account and synthetic
  identifiers prefixed `smoke-test-`.

## Preserved rollback baselines

| Surface | Baseline |
| --- | --- |
| Firestore Rules | `projects/timeline-automated-scraper/rulesets/c45fa16a-7594-474e-81d5-fe4f3bedf2c5`; SHA-256 `C40997A4E1910F148E430A7CE9E137402B320F77F933C88504EEE7E3D809BDD3` |
| Firestore indexes | 0 composite indexes, 0 field overrides; SHA-256 `51B7BE56A01633AC30EE35987EF4169A84B5E9A973DDC233F4D127C8166CCE4D` |
| Hugging Face | Remote `main` revision `0b284e5905a4dc9f5fb7bfd20c207b77174da4e1` |
| Firebase Hosting | Release `1779043808522000`; version `b1709518233b0a3d`; released `2026-05-17T18:50:08.522Z` |

## Stage ledger

| Stage | Deployment | Verification | Rollback needed | Status |
| --- | --- | --- | --- | --- |
| Preflight | None | `PREFLIGHT PASSED`; zero high/critical; secret scan clean; emulator/Rules/auth/transaction suites included | No | `PASSED` |
| Firestore Rules | Ruleset `c3268691-ffdb-4cec-bad4-1b4eb3941442` deployed | Active Rules source exactly matches repository SHA-256 `EE47A3FD6C8573318C9CB3F9F4819611DA3D0B5E4181BA8F18F19D28F60A6B5A` | No | `VERIFIED` |
| Firestore index | Index `CICAgOjXh4EK` created for `scrapeRuns` | Reached `READY`; fields `uid ASC`, `startedAt DESC` (`__name__ DESC` added by Firestore) | No | `VERIFIED` |
| Hugging Face backend | Space `main` advanced to `cdef0ef4038aa02249e6f9d6af34708788f608d4` by a direct Hub API folder commit; no local Git commit was created | Space reached `RUNNING`; `/health` and `/healthz` returned 200; `/ready` returned 200 with configuration, Firebase Admin, Firestore, and catalogs all `ok`; an unauthenticated protected request returned 401; production CORS origin was allowed and an unrelated origin was rejected with 403; security/no-store headers were present; deployed tree contains no `node_modules` or environment file | No | `VERIFIED` |
| Firebase Hosting | Live channel advanced to release `1784709360283000`, version `0a22587d569ba185` | Version is `FINALIZED`; live `index.html` SHA-256 `450B477B5D8D53CEBAA61DA0ED7364AF956C66B197A0D85BE90E8DAF5CE36033` exactly matched `dashboard/out/index.html`; all 12 referenced assets returned 200; production Firebase/backend identifiers and Timeline/Nilai/Belajar shell markers were present | No | `VERIFIED` |
| Final non-destructive verification | None | Active Rules exact-match retained; composite index remains `READY`; backend remote/API revision remains `cdef0ef4038aa02249e6f9d6af34708788f608d4` and runtime remains `RUNNING`/ready; Hosting live release remains the new finalized release; prior Rules, Hugging Face, and Hosting rollback baselines remain available; post-rollout `npm run preflight` passed with zero high/critical and a clean secret scan | No | `VERIFIED` |

No successful status may be recorded until the observed control-plane and
runtime verification for that stage is complete.

The Hugging Face CLI's preliminary create-repository request returned HTTP 402
under the current Docker Space policy before making any remote change. The
existing Space was therefore updated through the Hub commit API directly. The
resulting revision built and ran successfully on the already provisioned
`cpu-basic` runtime. No SCELE or authenticated user-data endpoint was invoked.

Authenticated smoke status is `NOT_EXECUTED_AUTH_REQUIRES_SCELE`. The
application has no Firebase dummy-login path, SCELE credentials were not
authorized, and no `smoke-test-` Firestore document was created. This is an
explicit verification limitation, not a failed smoke. The rollout used public
health/readiness, unauthenticated-denial, CORS preflight, artifact, and
control-plane verification only.

No local Git commit was created. Deploying the Hugging Face Space inherently
created the remote Space revision recorded above; the nested local checkout
remains at the preserved baseline revision.
