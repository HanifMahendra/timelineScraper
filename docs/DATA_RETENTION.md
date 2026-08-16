# Data Retention

Implemented application cleanup is bounded and best-effort:

| Data | Current behavior |
| --- | --- |
| Scrape runs | Keep latest `SCRAPE_RUN_RETENTION_COUNT` per UID; never remove `running`. |
| Activity history | Keep latest `ACTIVITY_HISTORY_RETENTION_COUNT` per changed activity. |
| Import drafts/rows | Expire after `IMPORT_DRAFT_TTL_HOURS`; bounded retention count and row deletion; never delete `committing`. |
| Study plan drafts/sessions | Apply-token expiry after `STUDY_PLAN_DRAFT_TTL_HOURS`; active draft count bounded. Physical TTL cleanup is not implemented. |
| Scrape locks | Expiry controls replacement; release is owner-checked. No background deletion. |
| Cooldown controls | Persist latest cooldown; no automatic physical deletion. |
| SCELE sessions | Replaced on login and deleted on logout. No Firestore TTL is configured. |
| Archived gradebooks/subjects/plans | Soft archived and retained; no production purge. |

Recommended Firestore TTL policies may later cover expired import/study drafts,
stale locks/controls, and session documents after a reviewed field/key-version
migration. TTL must be deployed separately in staging first and is not a
correctness mechanism. Manual cleanup must target explicit IDs, use bounded
batches, preserve `running`/`committing`, produce counts, and have a backup.

Not yet implemented: production TTL policies, archived-data purge, automated
session expiry, and destructive cleanup jobs. None were enabled in Phase 6.
