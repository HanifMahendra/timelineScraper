# Firestore Restore Runbook

This runbook is documentation only. No restore was executed. A production
restore is destructive incident work and requires explicit owner approval.

## Safety principles

- Never import directly into the production database as a first recovery test.
- Never treat an import as an automatic overwrite or full database rollback.
  Firestore import writes documents present in the export; it does not remove
  unrelated documents already in the target.
- Use an empty, disposable recovery project with a distinct project ID, billing
  account, Auth configuration, and Firestore database.
- Keep recovery application clients disabled until reviewed Rules are deployed.
- Do not restore stale locks/controls as active coordination state.
- Never decrypt `sceleSessions` during backup or restore validation.

## Prerequisites

1. An owner-approved, terminally successful managed export with a recorded
   operation ID and `gs://` prefix.
2. The export metadata object is present and readable; a partial or cancelled
   export is not importable.
3. Google Cloud CLI is installed and authenticated without placing credentials
   in shell history or repository files.
4. A separate recovery project with billing enabled and Firestore API/Cloud
   Storage API enabled.
5. A Firestore database in a compatible location, preferably
   `asia-southeast2`, and no production clients pointing to it.
6. Reviewed copies of the Rules and index baselines plus the repository Rules
   and indexes.
7. An incident record naming approver, operator, source export, target project,
   planned verification, rollback/stop conditions, and cleanup owner.

## Variables and target verification

Set explicit values; never rely on the active CLI project:

```bash
export SOURCE_PROJECT="timeline-automated-scraper"
export RECOVERY_PROJECT="<DISPOSABLE_RECOVERY_PROJECT_ID>"
export BACKUP_BUCKET="<VERIFIED_BACKUP_BUCKET>"
export EXPORT_PREFIX="firestore-exports/<UTC_TIMESTAMP>"
export RECOVERY_DATABASE="(default)"
```

Verify both projects and the recovery database before any IAM or import action:

```bash
gcloud projects describe "$SOURCE_PROJECT" --format='value(projectId,projectNumber)'
gcloud projects describe "$RECOVERY_PROJECT" --format='value(projectId,projectNumber)'
gcloud firestore databases describe \
  --project="$RECOVERY_PROJECT" \
  --database="$RECOVERY_DATABASE"
gcloud storage buckets describe "gs://$BACKUP_BUCKET" \
  --format='yaml(name,projectNumber,location,storageClass,iamConfiguration)'
```

Stop if the source/target IDs, bucket owner, export prefix, or locations do not
match the incident plan.

## Isolated recovery preparation

Do not add the recovery Firebase configuration to production builds. Keep the
recovery database closed to mobile/web clients while importing. Deploy a
reviewed deny-all Rules file to the recovery project before exposing any client
configuration:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Save that temporary file outside the repository or under the incident's
controlled workspace, then deploy it only to the recovery project with its
explicit ID. Do not deploy it to production.

## Cross-project bucket access

Get the recovery project number and form its Firestore service agent:

```bash
RECOVERY_PROJECT_NUMBER="$(gcloud projects describe "$RECOVERY_PROJECT" --format='value(projectNumber)')"
RECOVERY_FIRESTORE_AGENT="service-${RECOVERY_PROJECT_NUMBER}@gcp-sa-firestore.iam.gserviceaccount.com"
```

For a bucket owned by the source project, Google documents the Firestore
service-agent role as the supported cross-project grant. Add it temporarily at
the bucket scope, never at organization scope:

```bash
gcloud storage buckets add-iam-policy-binding "gs://$BACKUP_BUCKET" \
  --member="serviceAccount:$RECOVERY_FIRESTORE_AGENT" \
  --role="roles/firestore.serviceAgent"
```

Record the policy before and after the change. Remove the binding after the
recovery exercise. If organization policy rejects the grant, stop and request
an IAM-approved custom read-only role containing the exact import permissions;
do not grant Owner as a workaround.

## Import into the isolated database

Review the command with the incident approver, then start the import once:

```bash
gcloud firestore import "gs://$BACKUP_BUCKET/$EXPORT_PREFIX" \
  --project="$RECOVERY_PROJECT" \
  --database="$RECOVERY_DATABASE" \
  --async
```

Capture the returned operation name. Poll it without resubmitting the import:

```bash
gcloud firestore operations describe "<IMPORT_OPERATION_NAME>" \
  --project="$RECOVERY_PROJECT"
```

Continue only when the operation reports a successful terminal state and no
error. A cancelled or failed import may leave partial data and must not be used
for validation.

## Post-import verification

1. Compare the export operation's completed document count with the import
   operation's completed document count.
2. Run a reviewed read-only inventory tool against the recovery project and
   record counts per root collection and critical subcollection group. Do not
   print document contents, session ciphertext, credentials, or user PII.
3. Sample only approved synthetic or redacted records to verify:
   ownership stays under the original UID path; document IDs and timestamps are
   preserved; gradebook, subject, study-plan, and activity relationships remain
   valid; and timeline data remains separate from manual grade data.
4. Classify `userTimelines` as rebuildable, but do not rebuild it without a
   separately authorized SCELE login/scrape.
5. Treat `scrapeLocks`, `scrapeControls`, import drafts, and study-plan drafts
   as quarantined data. Do not re-enable them automatically.
6. Confirm that encrypted `sceleSessions` remain opaque. They are usable only
   with the exact original `SESSION_ENCRYPTION_KEY`; otherwise require users to
   log in again.
7. Validate repository Rules and indexes in the recovery environment before
   any application access. Rules do not travel with a Firestore export.
8. Record discrepancies and stop. Do not "fix" production from the recovery
   project without a separately approved plan.

## Production recovery decision

A production import requires a new owner-approved incident procedure. It must
define the affected document paths, conflict behavior, maintenance window,
fresh pre-restore export, user communication, exact command, observer, and
post-import verification. Prefer restoring selected verified documents through
a bounded, idempotent recovery tool over importing an entire database into a
non-empty production target.

The approval record must include:

```text
Incident:
Approved by:
Operator:
Source export operation:
Source export path:
Production paths in scope:
Fresh pre-restore backup operation:
Start/stop criteria:
Verification owner:
Cleanup owner:
```

No checkbox or approval may be completed on the owner's behalf.

## Cleanup after a recovery rehearsal

1. Preserve the operation metadata, count comparison, and redacted findings.
2. Remove the temporary cross-project bucket binding:

```bash
gcloud storage buckets remove-iam-policy-binding "gs://$BACKUP_BUCKET" \
  --member="serviceAccount:$RECOVERY_FIRESTORE_AGENT" \
  --role="roles/firestore.serviceAgent"
```

3. Verify the bucket is still non-public and its lifecycle/retention settings
   remain intact.
4. Delete the disposable recovery project only after incident-owner approval
   and evidence retention. Do not delete or alter the source export.
