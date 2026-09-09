<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# AGENT WIP: Backup Strategy Implementation

## Task Summary
Implement comprehensive backup strategy per BACKUP_STRATEGY_PLAN.md.

## Current Status: IN PROGRESS
Phase 1 plan documented, DR scripts created.

## Completed Items
1. **BACKUP_STRATEGY_PLAN.md** - Comprehensive plan documented with:
   - Phase 1: Same-region local backups (PITR, AWS Backup)
   - Phase 2: Multi-account backup strategy
   - Phase 3: Monitoring & alerting
   - Phase 4: Disaster recovery procedures
   - Implementation checklist, cost estimates, compliance mapping

2. **DR Scripts Created**:
   - `scripts/setup-backup-account.sh` - Initialize backup AWS account
   - `scripts/setup-s3-replication.sh` - Configure cross-account S3 replication
   - `scripts/dr-restore-from-backup-account.sh` - Restore from backup account after total loss
   - `scripts/restore-dynamodb-pitr.sh` - Restore from PITR for accidental deletion
   - `scripts/export-cognito-users.sh` - Export Cognito user metadata (passwords cannot be exported)

3. **Secrets Manager & Cognito Documentation Added**:
   - Explained why Cognito passwords cannot be backed up (AWS security design)
   - Documented Secrets Manager backup strategy (cross-region replica, encrypted export)
   - Added DR recovery process for Cognito (force password reset)

4. **DR Philosophy Documented**:
   - Account loss and region loss treated identically
   - No cross-region failover - accept downtime during extreme events
   - Deployment accounts backup locally (no cross-region vault)
   - Backup account handles multi-region redundancy
   - Fresh deployment from backup archives in DR scenario

## Pending Items
- Create `.github/workflows/verify-backups.yml`
- Create `.github/workflows/export-dynamodb.yml`
- Create `infra/main/java/co/uk/diyaccounting/submit/stacks/BackupStack.java`
- Update OpsStack with backup monitoring alarms
- Update ObservabilityStack dashboard with backup metrics

## Reference Documents
- Main plan: `BACKUP_STRATEGY_PLAN.md`
- CDK rules: `.claude/rules/cdk-infrastructure.md`
- Existing stacks: `infra/main/java/co/uk/diyaccounting/submit/stacks/`

## Directories/Files Under Change
- `scripts/` - DR and setup scripts
- `.github/workflows/` - Backup verification workflows
- `infra/main/java/co/uk/diyaccounting/submit/stacks/` - BackupStack, OpsStack changes
- `BACKUP_STRATEGY_PLAN.md` - Strategy document

## Next Steps
1. Extract DR scripts from plan to actual files
2. Implement BackupStack.java
3. Add backup monitoring to OpsStack
4. Add backup metrics to ObservabilityStack dashboard
