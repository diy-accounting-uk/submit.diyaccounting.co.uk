# Cross-account backups

> Wire cross-account copy jobs and the restore test.

Background, table inventory and recovery objectives live in
`_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md`. This file covers only what is being
wired now and how to tell it worked.

## Design

**Destination.** `submit-cross-account-vault` in the backup account (914216784828),
KMS-encrypted, defined by `CrossAccountBackupVaultStack`. Its access policy lets
`prod-env-backup-role` and `ci-env-backup-role` copy in and denies deletion to anything
outside the account.

**Source.** `BackupStack` in each deployment account copies to that vault from two of its
three rules:

| Rule | Local retention | Copy | Copy retention |
|---|---|---|---|
| DailyBackup 02:00 | 35 days | yes | 35 days |
| WeeklyBackup Sun 03:00 | 90 days | no | - |
| MonthlyCompliance 1st 04:00 | 7 years, cold after 90 days | yes | 7 years, warm |

Copies stay warm. AWS Backup will not copy a recovery point that has already moved to a
cold tier, so a cold transition on the copy buys nothing and risks the copy failing.

The destination ARN is `crossAccountBackupVaultArn` in `cdk-environment/cdk.json`, read by
`SubmitEnvironment` and passed as a `BackupStack` prop. `CROSS_ACCOUNT_BACKUP_VAULT_ARN`
overrides it. With neither set the plan keeps recovery points local and emits no copy
actions.

**Selection.** Five tables: receipts, bundles, hmrc-api-requests, passes, subscriptions.
`verify-backups.yml` checks PITR on the same five.

**Backup account access.** `BackupAccountAccessStack` creates the GitHub OIDC provider,
`backup-github-actions-role` (trust scoped to `repo:diy-accounting-uk/submit.diyaccounting.co.uk:*`),
`backup-deployment-role`, and `backup-restore-role` for AWS Backup to restore under. The
deployment role reaches AWS through the CDK bootstrap roles rather than holding
administrator rights directly.

**Restore test.** `restore-test.yml`, 05:00 UTC on the 1st plus manual dispatch. Two legs:
the prod account restores the newest recovery point of `prod-env-receipts` from
`prod-env-primary-vault`, the backup account restores the newest copy of the same table
from the cross-account vault. Each restores into `<table>-restoretest-<run id>`, waits for
the job, checks the table is ACTIVE, counts items, and deletes the table. It publishes
`DIYAccounting/Backups RestoreTestPassed` per vault and writes a table to the job summary.
An empty restore of a non-empty table fails the run.

## Operator steps

These three cannot come from a workflow.

1. **Enable cross-account backup for the organisation.** From the management account
   (887764105431), AWS Backup console, Settings, Cross-account backup, Enable. Without it
   every copy job fails no matter how the policies read.

2. **First deploy of the backup account stacks.** The workflow assumes
   `backup-github-actions-role`, which the stack creates, so the first deploy comes from a
   host terminal with the `submit-backup` SSO profile. The commands are in the header of
   `.github/workflows/setup-backup-account.yml`.

3. **Do not run `scripts/aws-accounts/bootstrap-account.sh` against the backup account.**
   The CDK app owns the OIDC provider and both roles there. If the script has already run,
   delete `backup-github-actions-role`, `backup-deployment-role` and the OIDC provider
   before the first CDK deploy.

## Verification

- `verify-backups.yml` reports PITR enabled on all five tables, the local vault present,
  and no failed copy jobs in the last 48 hours.
- A recovery point for each of the five tables appears in `submit-cross-account-vault`
  within a day of the copy actions reaching prod.
- `restore-test.yml` passes both legs on a manual dispatch before the first scheduled run.
- `DIYAccounting/Backups RestoreTestPassed` reads 1 for both vaults.

The restore test passing on both legs is the gate for the TypeScript CDK migration.
