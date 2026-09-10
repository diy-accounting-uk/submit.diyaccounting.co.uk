# Restore drill

`.github/workflows/restore-drill.yml` restores prod's DynamoDB tables from the
cross-account backup vault into ci, to prove the backups outside the account are
actually usable, not just present.

## What it covers

- All five critical tables: receipts, bundles, hmrc-api-requests, passes, subscriptions.
- Restores from `submit-cross-account-vault` in the backup account (914216784828), not
  from ci's or prod's own local vault. That is the point: prove the copy that lives
  outside both deployment accounts can rebuild working data.
- Restores each table's newest recovery point into `ci-restore-<table>`, scans the
  restored table, and compares the item count against the recovery point.
- For `bundles`, also checks that the salt item (`system#config` / `salt-v2`) came back,
  since the app cannot hash user subs without it.
- Times each table's restore and reports it, so a real recovery has a duration to plan
  against.
- Deletes every table it created, whether the run passed or failed.

## What it does not cover

- The books S3 bucket. It is in the backup selection and does land in the
  cross-account vault (confirmed by a real recovery point), but it holds no objects in
  prod today, so there is nothing yet to prove a content-level restore of. Add an S3
  leg once the bucket holds real files worth checking.
- Pointing a live ci deployment at the restored tables and running behaviour tests
  against them. This proves the data comes back; it does not prove the app runs on it.
- A single scan's item count is not a full content diff. It catches an empty restore
  of a non-empty backup; it would not catch a restore that came back with the right
  count but corrupted values.

## Why it has never passed

The workflow authenticates as ci's deployment role
(`submit-ci-deployment-role`, via `SUBMIT_DEPLOY_ROLE_ARN`). AWS Backup vault access
policies grant permissions to one named IAM principal, and that principal has to be
the one actually calling the API. The cross-account vault's policy names
`ci-env-backup-role` for restore, but `ci-env-backup-role` can only be assumed by the
`backup.amazonaws.com` service — nothing can authenticate as it from a CLI or GitHub
Actions job. So the first AWS Backup call in the drill (listing recovery points in
the vault) has no working grant to run under, regardless of which permissions the
policy lists.

Separately, that policy statement itself is not live yet. The code for it
(`CrossAccountBackupVaultStack.java`, commit `2b3d36b6`) is on `main`, but the backup
account's CDK stack was last deployed on 2026-08-29, before that commit. Deploying it
(dispatching `setup-backup-account.yml` with `dry-run: false`) is necessary but not
sufficient — see above.

Until the vault's access policy names a principal the workflow can actually call as
(`submit-ci-deployment-role`, or the ci account itself), this drill cannot get past
its first step.

## What already proves restorability

`.github/workflows/restore-test.yml` runs monthly and has passed on its last three
runs. Its second leg authenticates directly into the backup account (a same-account
restore relative to the vault, which sidesteps the principal problem above) and
restores `prod-env-receipts` there. The 2026-09-01 run restored 4826 items against a
live source of 4832 — real prod data, genuinely restorable from the cross-account
vault. It only covers one table and restores inside the backup account, not ci.

## How to run it

`workflow_dispatch` on `restore-drill.yml`, or wait for its monthly schedule. Running
it performs AWS writes (creates and deletes real DynamoDB tables in ci) and needs the
same approval any AWS write does.

## How to read the result

The job summary lists one row per table: result, items restored, salt/notes, recovery
point size, and duration. `pass` on every row means the restore worked and the data
checked out. Any other result names the table and the step that failed; the raw AWS
error is printed above it in the log.
