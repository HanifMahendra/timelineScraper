# Backup and Recovery

Use scheduled Firestore managed exports to a staging/production-appropriate
Cloud Storage bucket with restricted IAM and retention. Verify an export before
schema migrations and production backend/rules changes. Restoration should be
tested in a separate project first.

## Data classes

Critical user data: gradebooks/categories/components/scenarios;
subjects/topics; study plans/sessions; activity snapshots/history. Preserve
ownership paths and timestamps during restore.

Rebuildable data: `userTimelines` projection and some calculated summaries.
Rebuild only through an explicitly approved successful SCELE scrape; never
invent activities from grade/study data.

Ephemeral data: scrape locks/controls, import drafts/rows, study plan
drafts/sessions, and encrypted SCELE session documents depending on key policy.
Do not restore stale locks. Review draft expiry before restoring. Session
documents encrypted with an unavailable/rotated key are unusable and should
not be copied across environments.

Loss of `SESSION_ENCRYPTION_KEY` makes existing SCELE storage state
undecryptable; users must log in again. Never restore session ciphertext under
a different key and claim it is usable.

## Rollback

For a failed backend release, stop routing traffic to it or push the last known
good Space revision, confirm `/health` and `/ready`, then perform read-only API
checks. A frontend rollback redeploys the last known static artifact built with
the correct environment. Rules/index rollback must use reviewed previous files;
indexes may take time to build/delete, and permissive emergency rules are not
acceptable. Restore Firestore data only for confirmed data corruption, not for
ordinary code rollback.

Migrations must be additive, bounded, idempotent, versioned, tested against a
copy, and accompanied by an export and reverse/forward recovery procedure. No
production migration or export was run in Phase 6.
