<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Restore drill

`.github/workflows/restore-drill.yml` copies prod's DynamoDB recovery points out of the
cross-account backup vault into ci, then restores them there, to prove the backups
outside the account are actually usable, not just present.

## What it covers

- All five critical tables: receipts, bundles, hmrc-api-requests, passes, subscriptions.
- Copies each table's newest recovery point from `submit-cross-account-vault` in the
  backup account (914216784828) into ci's own vault (`ci-env-primary-vault`), then
  restores that copy into `ci-restore-<table>`. That is the point: prove the copy that
  lives outside both deployment accounts can rebuild working data, by actually pulling
  it back out and using it, rather than restoring in place.
- Scans each restored table and compares the item count against the recovery point.
- For `bundles`, also checks that the salt item (`system#config` / `salt-v2`) came back,
  since the app cannot hash user subs without it.
- Times each table's copy and restore and reports it, so a real recovery has a duration
  to plan against.
- Deletes every table and every copied recovery point it created, whether the run passed
  or failed, so the drill does not accumulate cost.

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

## Why the copy runs from the backup account

A backup vault access policy can only ever grant `backup:CopyIntoBackupVault`
cross-account; AWS Backup rejects any other cross-account action on it, restore
included. So the cross-account vault cannot grant ci's deployment role permission to
read recovery points back out of it directly.

AWS Backup's own documented route around this is to copy the recovery point into the
account that needs it, then restore locally there. `StartCopyJob`'s source vault is
resolved against the calling account, so that copy has to start from the backup
account, under `backup-copy-role` (`BackupAccountAccessStack.java`) - not from ci.
`backup-deployment-role` calls `StartCopyJob` and passes `backup-copy-role`, which
holds the decrypt grant on the backup account's own key and the encrypt grant on ci's
key (added to `BackupStack.java`, ci only). Once the copy lands in `ci-env-primary-vault`,
the restore into `ci-restore-<table>` is an ordinary same-account restore under
`ci-env-backup-role`, the role ci's own nightly backups already use.

## What already proves restorability

`.github/workflows/restore-test.yml` runs monthly and restores `prod-env-receipts`
inside the backup account - a same-account restore relative to the vault, so it never
hit the cross-account restriction above. It only covers one table and restores inside
the backup account, not ci.

## How to run it

`workflow_dispatch` on `restore-drill.yml`, or wait for its monthly schedule. Running
it performs AWS writes in two accounts: a recovery point copied into and deleted from
`ci-env-primary-vault`, and real DynamoDB tables created and deleted, both in ci. It
needs the same approval any AWS write does.

## How to read the result

The job summary lists one row per table: result, items restored, salt/notes, recovery
point size, and duration. `pass` on every row means the restore worked and the data
checked out. Any other result names the table and the step that failed; the raw AWS
error is printed above it in the log.
