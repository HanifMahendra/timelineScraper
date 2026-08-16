# Controlled Production Verification Report

Date: 2026-07-22
Production continuation gate: `DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE`
Deployment status: `DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE`
SCELE status: `NOT AUTHORIZED`

## 1. Executive summary

The production Firestore Rules, empty-index, Hugging Face revision, and Firebase
Hosting release baselines were preserved before change. The controlled rollout
then deployed and verified Firestore Rules, one composite index, the Hugging
Face backend, and Firebase Hosting sequentially. No rollback was required.

The active Rules source exactly matches the repository, the new index is
`READY`, the backend is `RUNNING` and ready, and the live Hosting HTML exactly
matches the locally built static export. An authenticated synthetic smoke was
not run because no dedicated production smoke account/token was available. No
SCELE login/scrape or real-user data access was attempted.

The managed backup cannot be created in the current project state. Read-only
official APIs confirm that the operator has the necessary bucket-create and
Firestore-export permissions, the Firestore service agent is bound, and no
bucket exists, but Cloud Billing is disabled. On 2026-07-22 the owner explicitly
waived the managed-backup gate and accepted that production has no point-in-time
recovery or managed Firestore export. No bucket or export operation was created,
and no backup is claimed.

Backend dependency status is `ACCEPTED_TEMPORARILY_FOR_PRODUCTION`: on
2026-07-22 the owner explicitly accepted eight moderate findings, zero
high/critical, through 2026-08-22 under a stop-on-regression/high/critical/
runtime-reachability condition. No safe patch/minor-only remediation clears the
finding; npm proposes Firebase Admin 14.2.0, a major upgrade.

## 2. Production target verification

| Resource | Expected target | Detected target | Match |
| --- | --- | --- | --- |
| Firebase project | `timeline-automated-scraper` | `timeline-automated-scraper` | Yes |
| Dashboard | `https://timeline-automated-scraper.web.app` | `https://timeline-automated-scraper.web.app` | Yes |
| Backend | `https://hanifmhndra-timeline-scele-auth.hf.space` | `https://hanifmhndra-timeline-scele-auth.hf.space` | Yes |
| Firestore database | `(default)`, Native/Standard | `(default)`, Native/Standard | Yes |
| Firestore location | Official metadata | `asia-southeast2` | Yes |

Control-plane commands used the explicit project ID. No token, cookie, private
key, encryption key, service-account JSON, or session was printed or stored.

## 3. Rules baseline

Status: `CAPTURED`

| Field | Value |
| --- | --- |
| Project | `timeline-automated-scraper` |
| Captured at | `2026-07-22T07:31:12.2724448Z` |
| Ruleset | `projects/timeline-automated-scraper/rulesets/c45fa16a-7594-474e-81d5-fe4f3bedf2c5` |
| Ruleset create time | `2026-05-02T23:10:50.432239Z` |
| Deployed source SHA-256 | `C40997A4E1910F148E430A7CE9E137402B320F77F933C88504EEE7E3D809BDD3` |
| Repository Rules SHA-256 | `EE47A3FD6C8573318C9CB3F9F4819611DA3D0B5E4181BA8F18F19D28F60A6B5A` |
| Baseline source | `ops/baselines/firestore.rules.production.baseline` |
| Metadata | `ops/baselines/firestore-production-baseline.json` |

The source was read through the official Rules API used by Firebase CLI
15.1.0. It is a usable source baseline for a reviewed Rules rollback; it is not
itself a deployment command. No Rules change had been sent when this baseline
snapshot was captured; the later rollout result is recorded in section 19.

## 4. Rules comparison

Classification: `BEHAVIOR_CHANGE_REQUIRES_REVIEW`

| Area | Deployed production Rules | Repository Rules | Assessment |
| --- | --- | --- | --- |
| `userTimelines/{uid}` | Own-user read; client write denied | Same | Unchanged |
| `sceleSessions/{uid}` | Own-user read and write | All client access denied | Security tightening; moves session access to backend only |
| `users/{uid}/activities/*` | Unmatched, therefore denied | Own-user read; writes denied | Intentional read expansion required by dashboard activity options |
| Activity history | Unmatched, therefore denied | Own-user read; writes denied | Intentional read expansion, UID-scoped |
| Grade/import domains | Unmatched, therefore denied | Explicitly denied | API-only, no expansion |
| Subject/study domains | Unmatched, therefore denied | Explicitly denied | API-only, no expansion |
| Scrape runs/locks/controls | Unmatched, therefore denied | Explicitly denied | Protected, no expansion |
| Unknown paths | Implicit unmatched denial | Explicit recursive deny | Deny-by-default made explicit |

There are no direct-client writes in the repository Rules. The only access
loosening is own-user, read-only activity/history access. Its use is verified
in the documented dashboard activity-option flow and backed by UID-isolation
Rules tests, but it is still a deployment behavior change requiring review.

## 5. Index baseline

Status: `VERIFIED_EMPTY`

| Field | Value |
| --- | --- |
| Production composite indexes | 0 |
| Production field overrides | 0 |
| Capture time | `2026-07-22T07:31:12.2724448Z` |
| Baseline SHA-256 | `51B7BE56A01633AC30EE35987EF4169A84B5E9A973DDC233F4D127C8166CCE4D` |
| Repository index SHA-256 | `6294FB0862B8222586F9425C1EDEE5330109F7655603382533B3DFBBDB758B07` |
| Baseline file | `ops/baselines/firestore.indexes.production.baseline.json` |

Repository `firestore.indexes.json` adds one composite collection index for
`scrapeRuns` with `uid ASC` and `startedAt DESC`. It was additive relative to
the captured production baseline and was deployed successfully during the
later controlled rollout; see section 19.

## 6. Backup tooling

| Capability | Result |
| --- | --- |
| Firebase CLI | `15.1.0`, authenticated and usable |
| Google Cloud CLI | Not installed |
| `gsutil` | Not installed |
| Official REST APIs | Usable through the authenticated Firebase CLI account |
| Cloud Billing | Disabled |
| Existing project buckets | 0 |
| Operator `storage.buckets.create/list` | Granted |
| Operator `datastore.databases.export` | Granted |
| Operator `datastore.operations.get` | Granted |
| Firestore service agent | `service-187093600537@gcp-sa-firestore.iam.gserviceaccount.com` |
| Service-agent role | Unconditional `roles/firestore.serviceAgent` at project scope |

The tooling was sufficient to verify target, billing, buckets, IAM, Rules, and
indexes without exposing credentials. Billing is the actual backup blocker.

## 7. Backup bucket

Status: `NOT CREATED — OWNER WAIVER RECORDED`

No bucket was created because billing remains disabled and the owner accepted
the resulting recovery risk. The preferred candidate name, if that decision is
reversed, is
`timeline-automated-scraper-firestore-backups`, subject to global availability.
The reference specification is same-project `asia-southeast2`, Standard class,
uniform bucket-level access, public access prevention enforced, Google-managed
encryption, no Requester Pays/Rapid, proposed non-locked seven-day retention,
seven-day soft delete, and proposed deletion at age 90 days.

Cost is usage-based: one Firestore read per exported document plus Cloud
Storage capacity/operations and applicable retention/egress. Exact cost cannot
be calculated until document count and export size are known.

## 8. Firestore export result

| Field | Result |
| --- | --- |
| Project/database | `timeline-automated-scraper` / `(default)` |
| Bucket/prefix | Not created |
| Operation ID | Not created |
| Started/completed | Not started / not completed |
| Status | `BLOCKED_BILLING_DISABLED` |

The export endpoint was not called. No completion claim is made.

## 9. Export verification

No export exists to poll or inspect, so output metadata and document counts
cannot be verified. `docs/PRODUCTION_BACKUP_RECORD.md` records the blocker,
checked IAM, planned bucket controls, content classification, and required
owner action. Restore status remains `NOT EXECUTED`.

## 10. Restore runbook

`docs/FIRESTORE_RESTORE_RUNBOOK.md` now documents an isolated disposable
recovery project, explicit project/database checks, temporary cross-project
service-agent access, asynchronous import/polling, document-count and ownership
verification, deny-all recovery Rules, encrypted-session caveats, no automatic
overwrite, owner-approved incident procedure, and cleanup. It was not executed
because no verified export exists.

## 11. Dependency audit

Both backend audit modes produced eight moderate findings and no other
severity. The underlying advisory is `GHSA-w5hq-g745-h8pq`: `uuid <11.1.1`
can miss a buffer bounds check for v3/v5/v6 when a caller provides a buffer.

| Package | Direct/transitive | Runtime/feature | Fix reported by npm |
| --- | --- | --- | --- |
| `firebase-admin` 12.7.0 | Direct | Auth/custom tokens and Firestore are reachable | 14.2.0 major |
| `@google-cloud/firestore` 7.11.6 | Transitive | Firestore/transactions/Timestamps reachable | Through Firebase Admin major |
| `google-gax` 4.6.1 | Transitive | Firestore transport chain | Through Firebase Admin major |
| `@google-cloud/storage` 7.19.0 | Transitive/optional | No application Storage route/import | Partial tree updates do not clear advisory |
| `gaxios` 6.7.1 | Transitive | Storage/auth transport chain | Major required for patched family |
| `retry-request` 7.0.2 | Transitive | Google Cloud retry chain | Major required |
| `teeny-request` 9.0.0 | Transitive | Google Cloud request chain | Major required |
| `uuid` 8.3.2/9.0.1/10.0.0 | Transitive | Present; no direct application import | 11.1.1+ major crossings |

Installed affected Google/Firebase call sites observed in this audit use UUID
v4, not the advisory's v3/v5/v6-with-buffer pattern. The specific exploit path
is therefore not observed in current application flow, but Firebase Admin and
Firestore remain runtime-reachable and the vulnerable versions are shipped.
Current mitigations are strict authentication/ownership validation, bounded
inputs, no Cloud Storage route, emulator coverage, and zero high/critical
findings.

## 12. Dependency remediation

No dependency was changed in this phase. A global `uuid` override would force
several transitive packages across major versions and is not a safe patch/minor
remediation. Updating only `@google-cloud/storage` within major 7 does not clear
its vulnerable `gaxios`/`retry-request`/`teeny-request` ranges. No
`npm audit fix --force` was run.

Firebase Admin 14 must be evaluated separately with a compatibility matrix for
Node/Docker runtime, Admin initialization, custom-token auth, Firestore
Timestamp serialization, transactions/batches, emulator integration, Rules,
and rollback. It was not implemented blindly in a production-prerequisite
phase.

## 13. Dependency decision

Status: `ACCEPTED_TEMPORARILY_FOR_PRODUCTION`
Risk review deadline: 2026-08-22

The owner accepted the moderate risk temporarily and required the complete
test/security matrix to remain passing. Any regression, high/critical finding,
or runtime-relevant exploit path stops the rollout.

```text
Dependency Risk Decision

[x] Saya menerima risiko moderate backend sementara untuk rollout production.
[ ] Saya meminta Firebase Admin/Google Cloud dependency upgrade terlebih dahulu.
[ ] Saya membatalkan rollout production untuk saat ini.

Accepted by: Repository owner (explicit instruction in this rollout session)
Date: 2026-07-22
Review deadline: 2026-08-22
Notes: Valid only with zero high/critical findings and a passing full preflight;
stop on regression or a runtime-relevant exploit path. No forced fix or blind
major upgrade.
```

## 14. Files changed

Changes made specifically in this phase:

- `ops/baselines/firestore.rules.production.baseline`
- `ops/baselines/firestore.indexes.production.baseline.json`
- `ops/baselines/firestore-production-baseline.json`
- `docs/PRODUCTION_BACKUP_RECORD.md`
- `docs/FIRESTORE_RESTORE_RUNBOOK.md`
- `docs/DEPENDENCY_SECURITY.md`
- `docs/PRODUCTION_VERIFICATION_REPORT.md`

Existing Phase 1-7 working-tree changes were preserved. `cloud-run-auth/` was
not changed. No generated `dashboard/out` or `.next` file was edited as source,
and no commit was created.

## 15. Test results

| Check | Result |
| --- | --- |
| Root `npm test` | PASS, 235/235 |
| Dashboard lint | PASS |
| Dashboard TypeScript | PASS |
| Dashboard static build | PASS |
| Dashboard production audit | PASS, 0 findings |
| Backend `npm test` | PASS, 225/225 |
| Backend production audit | 8 moderate; 0 low/high/critical |
| Backend full audit | 8 moderate; 0 low/high/critical |
| Full `npm run preflight` | PASS, including config/catalog, 61-file syntax, emulator/Rules, secret scan, audits, lint/type/build, and tests |

The test suite in this table does not use production endpoints. Separate public
health/readiness, CORS, denial, and Hosting artifact checks performed during the
rollout are recorded in section 19; no authenticated user flow, SCELE login, or
scrape was used.

## 16. Remaining follow-up

1. Authenticated smoke remains `NOT_EXECUTED_AUTH_REQUIRES_SCELE`. The
   application has no Firebase dummy-login path, and no bypass will be added;
   any future authenticated verification requires separate owner permission to
   use valid SCELE credentials and only `smoke-test-` identifiers.
2. Re-audit the eight accepted backend moderate findings no later than
   2026-08-22, or sooner if runtime reachability or a high/critical finding
   emerges.
3. Managed Firestore backup/PITR remains unavailable under the explicit owner
   waiver while billing is disabled.

## 17. Production continuation gate

`DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE`

All four authorized deployment stages completed in order and passed their
control-plane/runtime verification. Rollback was not required. Status is
`DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE` because authentication
requires SCELE credentials that were not authorized; no smoke data was created.

## 18. SCELE status

`NOT AUTHORIZED`

No SCELE credentials, login, session, scrape, or source-of-truth mutation was
used. Separate exact authorization is still required for any future production
SCELE verification.

## 19. Controlled rollout outcome

| Surface | Deployed production state | Verification |
| --- | --- | --- |
| Firestore Rules | Ruleset `c3268691-ffdb-4cec-bad4-1b4eb3941442` | Active content exactly matches repository SHA-256 `EE47A3FD6C8573318C9CB3F9F4819611DA3D0B5E4181BA8F18F19D28F60A6B5A` |
| Firestore index | `scrapeRuns` index `CICAgOjXh4EK` | `READY`; `uid ASC`, `startedAt DESC`, and Firestore-added `__name__ DESC` |
| Hugging Face backend | Revision `cdef0ef4038aa02249e6f9d6af34708788f608d4` | Space `RUNNING`; health/readiness 200; configuration, Firebase Admin, Firestore, and catalogs `ok`; protected route denies missing token; production CORS preflight succeeds |
| Firebase Hosting | Release `1784709360283000`; version `0a22587d569ba185` | Version `FINALIZED`; live HTML exactly matches local SHA-256 `450B477B5D8D53CEBAA61DA0ED7364AF956C66B197A0D85BE90E8DAF5CE36033`; all referenced assets 200 |

The post-rollout full preflight passed again. Production/root audits remain at
zero findings, dashboard production audit remains at zero, dashboard full audit
has three moderate dev-only findings, and backend audit has the eight moderate
findings accepted by the owner; no high or critical finding is present.

The prior Rules ruleset, prior Hugging Face revision, and prior finalized
Hosting version were all re-confirmed as still available after the rollout.

At the time of the original rollout, no local Git commit, migration, recursive
delete, mass cleanup, authenticated data-plane smoke, SCELE login, or SCELE
scrape was performed. The Hugging Face deployment inherently produced the
remote Space revision above while the local nested checkout stayed at its
preserved baseline revision. Later GitHub publication and the 2026-08-17
follow-up are recorded in section 20.

## 20. GitHub publication and 2026-08-17 follow-up

The separate repository topology is preserved:

- root: `https://github.com/HanifMahendra/timelineScraper`, branch
  `agent/release-timeline-grade-study`, draft PR
  `https://github.com/HanifMahendra/timelineScraper/pull/1`;
- backend: `https://github.com/HanifMahendra/timeline-scele-auth`, private
  `main`, with Hugging Face retained as the separate `origin` remote.

The academic-year follow-up filters SCELE course links before navigation. In
Asia/Jakarta, January-June selects the previous/current year pair and
July-December selects the current/next pair. Tests cover the 1 July boundary,
full/abbreviated labels, explicit local metadata, and fail-closed rejection of
old, future, or unlabelled courses. No SCELE login or scrape was used.

The initial 2026-08-16 audit found newly published high findings and stopped
the rollout. Explicit patch/same-major pins restored the required gate:
dashboard production/full audits have zero findings, and backend
production/full audits have eight moderate with zero high/critical. The owner
acceptance for those eight moderate findings remains subject to review no later
than 2026-08-22. No `npm audit fix`, forced fix, or major upgrade was used.

Final observed production state:

| Surface | Observed state |
| --- | --- |
| Backend | Revision `29cfda2ccbd6894862a69dd8fbc3b20ad686dc1d`, `RUNNING`; health/readiness 200 and all readiness checks `ok` |
| Hosting | Release `1786899858893000`; version `884ef983a8b09006`, `FINALIZED`; 51/51 live files exactly match the local static export |
| Rules | Unchanged ruleset `c3268691-ffdb-4cec-bad4-1b4eb3941442`; repository hash exact-match retained |
| Index | `CICAgOjXh4EK` remains `READY` |
| GitHub | Backend GitHub/Hugging Face/local refs match; root implementation through `3b97c5b` is pushed to draft PR #1; no GitHub checks are configured |

The previous backend and Hosting revisions remain rollback baselines. No data
migration, delete, cleanup, real-user access, authenticated smoke, SCELE login,
or SCELE scrape occurred. Production status remains
`DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE` and authenticated smoke
remains `NOT_EXECUTED_AUTH_REQUIRES_SCELE`.

## Context for controlled production rollout

- Rules baseline identifier:
  `projects/timeline-automated-scraper/rulesets/c45fa16a-7594-474e-81d5-fe4f3bedf2c5`.
- Rules baseline SHA-256:
  `C40997A4E1910F148E430A7CE9E137402B320F77F933C88504EEE7E3D809BDD3`.
- Rules comparison: `BEHAVIOR_CHANGE_REQUIRES_REVIEW`.
- Index baseline: verified 0 composite indexes, 0 field overrides; SHA-256
  `51B7BE56A01633AC30EE35987EF4169A84B5E9A973DDC233F4D127C8166CCE4D`.
- Backup bucket/export operation: none; billing disabled; owner waiver recorded.
- Export completion: not started/not completed.
- Restore readiness: runbook ready, restore `NOT EXECUTED`.
- Dependency decision: `ACCEPTED_TEMPORARILY_FOR_PRODUCTION`.
- Owner acceptance: recorded 2026-07-22; review no later than 2026-08-22.
- Full preflight: `PREFLIGHT PASSED`.
- Remaining primary follow-up: separately authorized SCELE-backed authenticated
  smoke, plus dependency review by 2026-08-22.
- Production continuation gate: `DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE`.
- Deployment status: `DEPLOYED_AND_VERIFIED_WITHOUT_AUTHENTICATED_SMOKE`.
- SCELE authorization status: `NOT AUTHORIZED`.

CONTEXT FOR CONTROLLED PRODUCTION ROLLOUT PROMPT
