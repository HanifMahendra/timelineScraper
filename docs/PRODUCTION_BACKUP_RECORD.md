# Production Firestore Backup Record

Record date: 2026-07-22
Status: `WAIVED_BY_OWNER_NO_MANAGED_BACKUP`
Restore status: `NOT EXECUTED`

## Export record

| Field | Value |
| --- | --- |
| Project | `timeline-automated-scraper` |
| Database | `(default)` |
| Firestore location | `asia-southeast2` |
| Export operation ID | Not created |
| Export path | Not created |
| Started at | Not started |
| Completed at | Not completed |
| Export status | `BLOCKED_BILLING_DISABLED` |
| Tool version | Firebase CLI `15.1.0`; Google Cloud CLI and `gsutil` unavailable |
| Verified by | Read-only Google Cloud Billing, Cloud Storage, Resource Manager IAM, and Firebase APIs |

No managed export was submitted, so this file is not evidence of a usable
backup. On 2026-07-22 the owner explicitly waived the managed-backup gate and
accepted that production has no point-in-time recovery or managed Firestore
export because billing will remain disabled.

## Pre-export verification

- The explicit production target is `timeline-automated-scraper`.
- The `(default)` Firestore database is Native mode, Standard edition, in
  `asia-southeast2`.
- The active Firestore Rules baseline was captured before any backup action.
- Production has no Cloud Storage buckets discoverable by the authenticated
  account; therefore no Hosting or unrelated bucket was selected accidentally.
- Cloud Billing API returned `billingEnabled: false`.
- IAM permission testing granted `storage.buckets.create`,
  `storage.buckets.list`, `datastore.databases.export`, and
  `datastore.operations.get` to the authenticated operator.
- The Firestore service agent
  `service-187093600537@gcp-sa-firestore.iam.gserviceaccount.com` has the
  unconditional project role `roles/firestore.serviceAgent`. The legacy App
  Engine service account has no project role binding.
- Official Firestore documentation requires billing (Firebase Blaze) before
  managed import/export can be used. Enabling billing is a cost-bearing owner
  decision and was not performed in this phase.

Because billing is disabled, no bucket was created and the export API was not
called. This is now an accepted owner risk rather than an unresolved backup
prerequisite. The waiver does not claim that a backup exists.

## Reference bucket specification if the waiver is reversed

The actual globally unique name must be checked at creation time. The preferred
candidate is `timeline-automated-scraper-firestore-backups`.

| Setting | Required value |
| --- | --- |
| Owning project | `timeline-automated-scraper` |
| Location | `asia-southeast2` |
| Default storage class | `STANDARD` |
| Access | Uniform bucket-level access enabled |
| Public access | Public access prevention enforced |
| Requester Pays / Rapid | Disabled; unsupported for managed export |
| Encryption | Google-managed encryption unless the owner separately approves and provisions CMEK |
| Retention | Proposed non-locked 7-day retention; owner must approve before creation |
| Lifecycle | Proposed deletion at age 90 days; review against backup frequency so several completed exports remain |
| Soft delete | Proposed 7 days; include its storage cost in the owner decision |

The cost cannot be stated as a fixed amount before document count and export
size are known. Each export bills one Firestore document read per exported
document, plus Cloud Storage capacity/operations and any applicable network or
soft-delete retention costs. Budget alerts do not fire until a managed export
has completed, so the owner must review billing and budget controls first.

## Backup content classification

Critical user data:

- `users/{uid}/gradebooks` and nested categories/components/scenarios;
- `users/{uid}/subjects` and topics;
- `users/{uid}/studyPlans` and sessions;
- `users/{uid}/activities` and activity history.

Rebuildable data:

- `userTimelines`;
- calculated projections that are explicitly documented as derivable.

Ephemeral data:

- `scrapeLocks` and `scrapeControls`;
- `importDrafts`;
- `studyPlanDrafts` and transient study-plan sessions.

Sensitive operational data:

- `sceleSessions`.

Encrypted SCELE session documents are useful only while the matching
`SESSION_ENCRYPTION_KEY` remains securely available. Backup verification must
never decrypt these documents. If the key is unavailable or rotated, users
must log in again; ciphertext must not be represented as recoverable session
state.

## Owner waiver and rollout constraints

The owner authorized continuation without managed backup under these mandatory
constraints:

1. no data migration;
2. no recursive delete or mass cleanup;
3. preserve the Firestore Rules and index baselines;
4. preserve the previous backend revision and Firebase Hosting release;
5. deploy Rules, index, backend, and dashboard one at a time;
6. verify after every stage and stop/rollback immediately on failure;
7. use only a dedicated smoke account and synthetic IDs prefixed
   `smoke-test-`;
8. no SCELE login or scrape; and
9. no access to or mutation of real user data.

The dependency decision remained a separate gate. It was subsequently accepted
by the owner as `ACCEPTED_TEMPORARILY_FOR_PRODUCTION` through review no later
than 2026-08-22, subject to zero high/critical findings and a passing full
preflight. The backup waiver did not itself authorize that decision.

The restore procedure is documented in `docs/FIRESTORE_RESTORE_RUNBOOK.md`.
