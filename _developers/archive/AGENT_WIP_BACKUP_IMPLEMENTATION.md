<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# AGENT WIP: Backup Strategy Implementation

## Task Summary
Implement the backup infrastructure from BACKUP_STRATEGY_PLAN.md.

## Current Status: IN PROGRESS
Core infrastructure implemented, ready for deployment testing.

## Completed Items

### Infrastructure Code
1. **DataStack.java** - Added PITR to critical tables
   - `receiptsTable`: PITR enabled (35-day window)
   - `bundlesTable`: PITR enabled
   - `hmrcApiRequestsTable`: PITR enabled
   - Conditional removal policy (RETAIN for prod, DESTROY for non-prod)
   - Fixed deprecation: using `pointInTimeRecoverySpecification`

2. **BackupStack.java** - Created new stack with:
   - Local backup vault (no cross-region - handled by backup account)
   - KMS key for encryption
   - S3 bucket for exports with lifecycle rules (IA -> Glacier)
   - Daily/Weekly/Monthly backup plans
   - 7-year compliance retention for HMRC
   - Optional alert topic (for application-level notifications)

3. **SubmitSharedNames.java** - Added `backupStackId`

4. **SubmitEnvironment.java** - Added BackupStack instantiation

### GitHub Actions Workflows
1. **setup-backup-account.yml** - Manual workflow to initialize backup account
   - Dry-run mode for safety
   - Validates inputs
   - Runs `scripts/setup-backup-account.sh`

2. **verify-backups.yml** - Scheduled (daily) and manual workflow
   - Checks PITR status on critical tables
   - Checks backup vault status
   - Lists recent backup jobs
   - Generates health summary

## Files Modified/Created
- `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java` (MODIFIED)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/BackupStack.java` (CREATED)
- `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` (MODIFIED)
- `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java` (MODIFIED)
- `.github/workflows/setup-backup-account.yml` (CREATED)
- `.github/workflows/verify-backups.yml` (CREATED)

## Pending Items
- [ ] Add backup failure alarms to OpsStack.java (optional, can be done later)
- [ ] Deploy to CI environment and verify
- [ ] Deploy to PROD environment
- [ ] Create dedicated backup AWS account
- [ ] Run setup-backup-account.yml workflow

## Verification
- All tests pass: `./mvnw clean verify`
- No deprecation warnings for PITR

## Directories/Files Under Change
- `infra/main/java/co/uk/diyaccounting/submit/stacks/` - Stack files
- `infra/main/java/co/uk/diyaccounting/submit/` - Environment/shared names
- `.github/workflows/` - GitHub Actions workflows
- `scripts/` - DR scripts (already completed in previous branch)

## Deployment Instructions

### To deploy the backup infrastructure:

1. **Merge this branch** to trigger CI deployment

2. **Verify CI deployment**:
   ```bash
   # Check that BackupStack was created
   aws cloudformation describe-stacks \
     --stack-name ci-env-BackupStack \
     --region eu-west-2
   ```

3. **Run verify-backups workflow**:
   - Go to Actions -> verify backups
   - Select environment: ci
   - Run workflow

4. **Deploy to PROD** (after CI verification):
   - Merge to main
   - Monitor deployment

### To set up the backup account (one-time):

1. Create a new AWS account for backups

2. Configure OIDC trust in backup account:
   ```bash
   # See AWS documentation for GitHub Actions OIDC setup
   ```

3. Create IAM role `backup-github-actions-role` with permissions

4. Run setup-backup-account.yml workflow:
   - Input backup account ID
   - Select dry-run first to verify
   - Run again without dry-run to execute

## Reference Documents
- `BACKUP_STRATEGY_PLAN.md` - Full architecture documentation
- `scripts/setup-backup-account.sh` - Backup account setup script
- `scripts/dr-restore-from-backup-account.sh` - DR restore script
