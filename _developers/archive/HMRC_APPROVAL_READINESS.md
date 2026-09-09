<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# HMRC Approval Readiness Assessment

**Date**: 9 January 2026
**Branch**: publish

---

## Executive Summary

This document provides a readiness assessment for HMRC MTD VAT production approval, including an analysis of open GitHub issues, quick wins, and critical omissions that must be addressed.

---

## 1. Plans Created

### Synthetic Monitoring Plan
**File**: `_developers/SYNTHETIC_MONITORING_PLAN.md`

- Complete CDK code for `SyntheticMonitoringStack.java`
- Two canaries: Health Check + API Endpoints
- CloudWatch Alarms with SNS notifications
- Implementation checklist
- Cost estimate: ~$2.80/month

### Backup Strategy Plan
**File**: `_developers/BACKUP_STRATEGY_PLAN.md`

- Enable Point-in-Time Recovery on critical DynamoDB tables
- AWS Backup with daily/weekly/monthly schedules
- Cross-region backup to eu-west-1 for DR
- Secrets Manager multi-region replication
- Recovery procedures documented
- Cost estimate: ~$5-10/month

---

## 2. Error Handling Audit: PASS

### HMRC Error Codes Handled

| Error Code | User Message | Action Advice |
|------------|--------------|---------------|
| `INVALID_VRN` | The VAT registration number (VRN) is not valid | Check VRN and try again |
| `VRN_NOT_FOUND` | The VRN was not found | Verify VRN is registered with HMRC |
| `INVALID_PERIODKEY` | The period key is not valid | Check period key format |
| `NOT_FOUND` | The requested resource was not found | Check VRN and period key |
| `DATE_RANGE_TOO_LARGE` | The date range is too large | Reduce to < 365 days |
| `INSOLVENT_TRADER` | VAT registration is for insolvent trader | Contact HMRC |
| `DUPLICATE_SUBMISSION` | Return already submitted | Cannot resubmit, contact HMRC |
| `INVALID_SUBMISSION` | Submission not valid | Check values and retry |
| `TAX_PERIOD_NOT_ENDED` | Tax period not ended | Wait for period to end |
| `INVALID_CREDENTIALS` | Credentials not valid | Sign in again |
| `CLIENT_OR_AGENT_NOT_AUTHORISED` | Not authorized | Check permissions |
| `SERVER_ERROR` | HMRC technical difficulties | Try later |
| `SERVICE_UNAVAILABLE` | HMRC temporarily unavailable | Try later |

### HTTP Status Code Handling

| Status | Handling | Retry Behavior |
|--------|----------|----------------|
| 200-299 | Success | N/A |
| 400 | Bad request - return error with user message | No retry |
| 401 | Unauthorized - prompt re-authentication | No retry |
| 403 | Forbidden - check permissions | No retry |
| 404 | Not found - return user-friendly message | No retry |
| 429 | Rate limited - retry with backoff | **Auto-retry via SQS** |
| 500 | Server error - log and return generic message | No retry |
| 503 | Service unavailable - retry | **Auto-retry via SQS** |
| 504 | Gateway timeout - retry | **Auto-retry via SQS** |

### Implementation Details

- **Location**: `app/lib/hmrcValidation.js` - Error message mapping
- **Location**: `app/services/hmrcApi.js` - HTTP response handling
- **Pattern**: Async worker lambdas (POST/GET) use SQS retry for transient errors (429, 503, 504)
- **Logging**: All errors logged with correlation IDs for tracing
- **Masking**: Sensitive data (IPs, device IDs) masked in logs

---

## 3. GitHub Issues Analysis

### Quick Wins (Low Risk, Can Do Now)

| Issue | Title | Effort | Notes |
|-------|-------|--------|-------|
| **#520** | Workflow param consistency | Low | Refactor workflow inputs |
| **#478** | Status bar feedback | Low | UX polish for bundle operations |

### Critical for HMRC Approval

| Issue | Title | Risk | Action Required |
|-------|-------|------|-----------------|
| **#445** | Synthetic monitoring | Medium | Implement plan (CDK work) |
| **#398** | Backup strategy | Medium | Implement plan (CDK work) |
| **#426** | Strengthen security/privacy | **HIGH** | Audit needed before submission |
| **#508** | Privacy monitoring/auditing | Medium | Operational procedures needed |

---

## 4. Critical Omissions HMRC Might Flag

### HIGH PRIORITY - Fix Before Submission

#### 1. #426 - Security Hardening
- OAuth state/nonce parameters (CSRF protection)
- CORS policy review
- Token logging audit
- *HMRC may ask about security measures*

#### 3. #508 - Privacy Monitoring
- No documented audit procedures
- *HMRC may ask how you monitor data access*

### MEDIUM PRIORITY

#### 4. DynamoDB PITR Not Enabled
- Currently no point-in-time recovery
- Receipts must be retained 7 years
- *Could be flagged in technical review*

#### 5. RemovalPolicy.DESTROY on Production Tables
- Accidental stack deletion would lose all data
- *Change to RETAIN for prod*

---

## 5. Recommended Next Steps

### Immediate (before HMRC submission)

2. Review #426 (security items)
3. Enable PITR on DynamoDB tables (from backup plan)

### This Week

1. Implement synthetic monitoring (#445)
2. Enable backup strategy (#398)
3. Document privacy audit procedures (#508)

---

## 8. Related Documents

- `HMRC_MTD_APPROVAL_PLAN.md` - Full approval process steps
- `_developers/SYNTHETIC_MONITORING_PLAN.md` - Implementation plan for #445
- `_developers/BACKUP_STRATEGY_PLAN.md` - Implementation plan for #398
- `_developers/SALTED_HASH_ROLLOUT.md` - Hash migration details
- `_developers/MTD_DIY_ACCOUNTING_SUBMIT.md` - Production approval checklist
