# PLAN: Issue #11 (pre-migration #715) — Backups outside the account (Phase 3)

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/11
> Original body: detailed (Phase 3 of account separation).
> Existing plans:
> - `_developers/backlog/PLAN_BACKUP_STRATEGY.md` (1279 lines — authoritative design)
> - `_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md` (450 lines — implementation)
> - `_developers/archive/AGENT_WIP_BACKUP_IMPLEMENTATION.md`, `AGENT_WIP_BACKUP_STRATEGY.md` (historical)
> - `_developers/archive/PLAN_ACCOUNT_SEPARATION.md` (broader context)
> - `CLAUDE.md` (workspace) — section "AWS Account Structure" confirms `submit-backup = 914216784828` and "Backup OU".

## Elaboration

The issue body is effectively a specification: create the `submit-backup` account, set up cross-account DynamoDB backup copying, and prove restores work by restoring prod → CI periodically. The existing `PLAN_CROSS_ACCOUNT_BACKUPS.md` covers all of this in detail; this plan is the tracking view + delta for what to do next.

**Status summary** (inferred from workspace CLAUDE.md + archive):

- `submit-backup` account (914216784828) exists in the AWS organisation.
- `BackupStack.java` exists in this repo with local daily/weekly/monthly vaults and PITR on DynamoDB.
- Cross-account copy rules **not yet wired** in BackupStack.
- No automated restore-test workflow yet.

Risk of not completing this: if submit-prod (972912397388) is compromised — IAM takeover, accidental account deletion, ransomware via a mis-scoped role — local PITR/backups in the same account are compromised too. Cross-account (and ideally cross-region) copies are the last line of defence.

## Likely source files to change

- `infra/main/java/.../stacks/BackupStack.java` — add a cross-account `BackupPlan.CopyAction` rule on the daily plan. Target: `submit-backup` vault `submit-cross-account-vault`, KMS key owned by submit-backup.
- `infra/main/java/.../stacks/` (new) `BackupAccountBootstrapStack.java` — deployed to `submit-backup`: creates the receiving vault, its KMS key, the vault access policy, and the SSO permission set.
- GitHub Actions: `.github/workflows/deploy.yml` — add a path/step to deploy the backup-account bootstrap when changed (separate credentials profile for 914216784828).
- New `.github/workflows/restore-test.yml` — monthly scheduled workflow running the 3.3 restore test (restore prod daily backup → CI target, tag tables with `ci-env-{purpose}-restored`, run `submitVatBehaviour-ci` against restored data, then tear down).
- `scripts/bootstrap-submit-backup-account.sh` — one-shot script to create the account prerequisites that can't be CDK (SSO perms, CDK bootstrap).
- `app/bin/restore-from-backup.js` — helper to drive AWS Backup restore jobs programmatically for the automated restore test.

## Likely tests to change/add

- CDK assertion test: new backup-account stack resource count, cross-account copy rule present on daily plan.
- Manual acceptance: one-off restore test before scheduling (Step 3.3 in the issue).
- `restore-test.yml` workflow itself is the "test" for future months.
- Synthetic test `submitVatBehaviour-ci` re-pointed at restored tables temporarily — existing env var swap mechanism in `.env.ci` needs to tolerate `ci-env-bundles-restored`.

## Likely docs to change

- `_developers/backlog/PLAN_CROSS_ACCOUNT_BACKUPS.md` — flag the progress checkpoints.
- `RUNBOOK_INFORMATION_SECURITY.md` — add the restore runbook: what to do on "we need to restore prod data".
- `AWS_ARCHITECTURE.md` — add the backup account to the diagram.
- `CLAUDE.md` (workspace) — update the "Backup OU" note to link here.

## Acceptance criteria

1. `submit-backup` has a KMS key, a `submit-cross-account-vault`, and a vault access policy allowing `submit-prod` (972912397388) and `submit-ci` (367191799875) backup roles to copy into it.
2. Daily prod backup on the existing schedule completes and a cross-account copy lands in the backup vault within 24 h; visible via `aws backup list-recovery-points-by-backup-vault --profile submit-backup`.
3. Retention in the backup vault is 90 days for daily, 7 years for the HMRC receipts monthly backup (per workspace `CLAUDE.md`).
4. One manual end-to-end restore test passes: restore prod daily → `ci-env-*-restored` tables, swap `.env.ci`, run `submitVatBehaviour-ci`, pass, tear down.
5. `restore-test.yml` scheduled monthly produces a passing run.
6. Salt recovery is covered: encrypted salt backup exists in the backup account; `kms:Decrypt` granted to submit-ci for the restore test.
7. Compliance log updated in the ICO-registration audit trail.

## Implementation approach

**Recommended — follow `PLAN_CROSS_ACCOUNT_BACKUPS.md` without deviation.** The plan is detailed and reviewed; this issue is a delivery tracker.

Phasing:
- **P1**: Bootstrap submit-backup (vault, KMS, policy, SSO perms).
- **P2**: Update BackupStack in this repo to add the copy action; deploy to CI first, then prod.
- **P3**: Run one manual restore test (acceptance criterion 4).
- **P4**: Land `restore-test.yml` workflow; verify one scheduled run.

### Alternative A — outside-AWS backups (S3 bucket in another account, or offsite)
E.g. weekly JSONL exports to an S3 bucket owned by `submit-backup` with Object Lock compliance mode. Covers the "AWS-wide account compromise" risk. Slightly more plumbing but cheaper to restore ad-hoc than AWS Backup. Worth considering *in addition* to the AWS Backup cross-account copy.

### Alternative B — third-party backup vendor
E.g. Veeam, N2WS. More capable UI and reporting but adds vendor cost and surface area. Defer unless AWS Backup proves insufficient.

## Questions (for QUESTIONS.md)

- Q11.1: SSO admin policy for `submit-backup` — start with `AdministratorAccess`, downgrade to a restricted backup-ops policy once the bootstrap is stable? (Recommendation: yes.)
- ~~Q11.2~~ — **answered 2026-04-22: real prod data, masked in CI.** The restore-test workflow will run a masking Lambda (Step 3.3 of `PLAN_CROSS_ACCOUNT_BACKUPS.md`) between the AWS Backup restore and the test swap-in. Columns to mask on write: `email`, `givenName`, `familyName`, `phoneNumber`, HMRC `vrn` (if stored), any `shippingAddress`. `hashedSub` rehashed with a CI-only salt so joins still work within the test run but cannot be correlated back to prod.
- Q11.3: Cross-region copy (eu-west-2 → eu-west-1) as a follow-up? (Recommendation: yes, cheap.)
- Q11.4: Salt backup — confirm the salt secret backup is covered by AWS Backup for Secrets Manager, or needs a bespoke export?

## Good fit for Copilot?

Low. This is multi-account infrastructure with prod data — needs human oversight, manual credential handling for the backup account, and careful review of IAM policies. Copilot can draft the CDK constructs once the design is confirmed.
