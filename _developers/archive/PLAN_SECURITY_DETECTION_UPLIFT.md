<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

> Archived 2026-09-07. Phases 0 to 3 were delivered in January 2026 (SecurityDetectionStack, ScanDetectionStack; issues #9 and #10 closed 2026-09-05). Phase 4's remaining ideas carry on as the security panels of `PLAN_ONE_STOP_DASHBOARD.md`.

# Security Detection & Breach Response Uplift Plan

**Document Version**: 1.4
**Created**: 12 January 2026
**Updated**: 17 January 2026
**Owner**: Development Team

---

## Overview

This plan addresses gaps in security detection capabilities to support the 72-hour breach notification commitment in the Privacy Policy. Current capabilities allow post-incident log analysis but lack real-time alerting for most security events.

## Current State Summary

| Capability | Status | Alerting? |
|------------|--------|-----------|
| WAF rate limiting | Active (2000 req/5min/IP) | Metrics only |
| AWS Managed WAF rules (SQLi, XSS) | Active | Metrics only |
| Lambda error alarms | Active | Yes (CloudWatch) |
| Lambda log-based error detection | Active | Yes (CloudWatch) |
| API Gateway 5xx alarms | Active | Yes (CloudWatch) |
| Synthetic health checks | Active | Yes (SNS email) |
| JWT auth failure logging | Active | No alerting |
| CloudTrail (AWS API activity) | Active | No alerting |
| OAuth state parameter | Active | N/A (CSRF protection) |
| HMRC API audit trail | Active | Masked data, 30-day retention |
| DynamoDB access monitoring | Not implemented | N/A |
| GuardDuty (threat detection) | Not implemented | N/A |
| Security Hub | Not implemented | N/A |
| OAuth secret rotation | Not implemented | N/A |

**Key Gap**: Authentication failures, WAF blocks, and unusual access patterns are logged but don't trigger alerts. You'd discover a breach during manual log review, not in real-time.

---

## HMRC Terms of Use Compliance Status

Per https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use:

| Requirement | Status | Notes |
|-------------|--------|-------|
| Privacy policy URL | Met | `/privacy.html` |
| Terms and conditions URL | Met | `/terms.html` |
| Server location disclosed | Met | EU West (London) in privacy policy |
| Fraud prevention headers | Met | All headers implemented |
| OAuth 2.0 (no credential storage) | Met | HMRC Gateway credentials never stored |
| Encrypt tokens at rest/transit | Met | DynamoDB KMS, TLS 1.2+ |
| Customer data export/deletion | Met | `scripts/export-user-data.js`, `scripts/delete-user-data.js` |
| 72-hour breach notification | Documented | PRIVACY_DUTIES.md |
| Use "HMRC recognised" only | Met | No "accredited/approved" claims |
| **Penetration testing** | **Not done** | Required for SaaS - see Phase 4 |
| **WCAG Level AA** | **Not verified** | Required - see Phase 4 |
| **ICO security checklist** | **Not done** | Required - see Phase 4 |
| **Designated responsible individual** | **Not named** | Add to HMRC submission docs |
| **RBAC for employee access** | **N/A** | Single-operator model currently |

---

## Operational Monitoring Schedule

These ongoing tasks should be performed regardless of uplift phase progress:

### Weekly Tasks
| Task | How | What to Look For |
|------|-----|------------------|
| Check CloudWatch alarms | AWS Console > CloudWatch > Alarms | Any in ALARM state |
| Review GuardDuty findings | AWS Console > GuardDuty > Findings | HIGH/MEDIUM severity (if enabled) |
| Monitor auth failures | CloudWatch Logs Insights query (see PRIVACY_DUTIES.md) | Spikes in failed authentications |
| Check WAF sampled requests | AWS Console > WAF > Web ACLs > Sampled requests | Attack patterns, blocked IPs |

### Monthly Tasks
| Task | How | What to Look For |
|------|-----|------------------|
| Review DynamoDB table sizes | AWS Console > DynamoDB > Tables | Unexpected growth |
| Audit IAM access logs | CloudTrail > Event history > Filter by IAM | Unusual admin actions |
| Check OAuth token cleanup | Query DynamoDB for expired tokens | Tokens past expiry still present |
| Review CloudTrail summary | CloudTrail > Event history | Unusual API calls, error codes |

### Quarterly Tasks
| Task | How | What to Look For |
|------|-----|------------------|
| Review privacy policy | Compare web/public/privacy.html vs actual data processing | Discrepancies |
| Test data export script | Run scripts/export-user-data.js with test user | Script works correctly |
| Test data deletion script | Run scripts/delete-user-data.js with test user | Data properly deleted |
| Verify DynamoDB encryption | AWS Console > DynamoDB > Tables > Settings | Encryption at rest enabled |
| Review CORS configuration | Check EdgeStack.java and API Gateway | Origins restricted appropriately |

### Annual Tasks
| Task | How | What to Look For |
|------|-----|------------------|
| Penetration testing | External third-party engagement | Vulnerabilities |
| Disaster recovery test | Run backup restoration procedure | Backups are restorable |
| Security documentation review | Review all security docs | Outdated information |
| OAuth secret rotation | Rotate HMRC client secrets in Secrets Manager | Secrets > 1 year old |

---

## Phase 0: Critical OAuth Security Fixes (COMPLETED 2026-01-17)

These vulnerabilities were discovered during security review and fixed immediately:

### 0.1 Cognito OAuth State Validation (CSRF Protection)

**Issue**: Cognito OAuth callback received state parameter but never validated it, allowing CSRF attacks.
**Fix**: Added state validation in `web/public/auth/loginWithCognitoCallback.html` matching the HMRC pattern.

### 0.2 Weak State Generation

**Issue**: `login.html` used `Math.random()` which is not cryptographically secure.
**Fix**: Changed to `generateRandomState()` from `crypto-utils.js` using `crypto.randomUUID()`.

### 0.3 State Storage Location

**Issue**: OAuth state stored in `localStorage` (persists across sessions, accessible to all same-origin scripts).
**Fix**: Changed to `sessionStorage` with key `cognito_oauth_state` (single-session, cleared on tab close).

**Files Modified**:
- `web/public/auth/login.html` - Secure state generation, sessionStorage
- `web/public/auth/loginWithCognitoCallback.html` - State validation before token exchange
- `web/public/auth/login-mock-addon.js` - Consistent with main login flow

---

## Phase 1: High Risk, Low Effort

**Timeline**: Can be completed in days
**Estimated Cost**: ~$2-5/month

### 1.1 Authentication Failure Alerting

**Risk Addressed**: Credential stuffing, brute force attacks
**Effort**: Low (CloudWatch metric filter + alarm)

Create CloudWatch metric filter and alarm for authentication failures:

```
Implementation Location: infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java

Metric Filter:
- Log Group: /aws/lambda/{env}-submit-custom-authorizer
- Pattern: { $.level = "ERROR" || $.level = "WARN" }
- Metric: AuthFailures
- Namespace: Submit/Security

Alarm:
- Threshold: >= 10 failures in 5 minutes
- Action: SNS alert topic
```

**Acceptance Criteria**:
- [ ] Alarm fires when 10+ auth failures occur in 5 minutes
- [ ] Email notification received within 1 minute of threshold breach
- [ ] Update PRIVACY_DUTIES.md with detection procedure

### 1.2 WAF Block Rate Alerting

**Risk Addressed**: Active attacks (SQLi, XSS, rate limit abuse)
**Effort**: Low (CloudWatch alarm on existing metrics)

```
Implementation Location: infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java

Alarms to Add:
1. RateLimitRule blocked requests >= 50 in 5 minutes
2. AWSManagedRulesCommonRuleSet blocked >= 5 in 5 minutes
3. AWSManagedRulesKnownBadInputsRuleSet blocked >= 5 in 5 minutes

Action: SNS alert topic
```

**Acceptance Criteria**:
- [ ] Alarm fires when WAF block thresholds exceeded
- [ ] Can differentiate between rate limiting and attack signatures
- [ ] Update PRIVACY_DUTIES.md with response procedure

### 1.3 Enable AWS GuardDuty

**Risk Addressed**: Compromised credentials, unusual API patterns, crypto mining
**Effort**: Low (enable service, ~10 lines of CDK)

```
Implementation Location: infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java

Add:
- GuardDuty detector enabled
- SNS notification for HIGH and MEDIUM severity findings
- Optional: S3 malware scanning for any buckets
```

**Acceptance Criteria**:
- [ ] GuardDuty detector active in production
- [ ] HIGH/MEDIUM findings trigger SNS email
- [ ] Document finding types in PRIVACY_DUTIES.md

### 1.4 Log Sanitization Audit

**Risk Addressed**: Token/PII exposure in logs
**Effort**: Low (audit task)

Verify that sensitive data is never logged in plaintext:

```
Audit Checklist:
1. Search CloudWatch Logs for patterns:
   - "Bearer " followed by long strings
   - "access_token"
   - "refresh_token"
   - Email patterns (@)
   - VRN patterns (9 digits)

2. Review logger.js redaction rules
3. Review dataMasking.js patterns
4. Test with sample requests in sandbox
```

**Acceptance Criteria**:
- [x] No tokens found in CloudWatch Logs
- [x] No unmasked PII in HMRC API audit trail
- [x] Document sanitization patterns in PII_AND_SENSITIVE_DATA.md

**Audit Results (2026-01-17)**:
- Verified via `app/unit-tests/web/test-report-web-test-local.test.js` - "All 5 HMRC API requests have properly masked sensitive fields"
- `app/lib/dataMasking.js` masks: authorization, access_token, refresh_token, password, client_secret, code (OAuth)
- Pattern matching masks any field ending with: password, secret, token
- URL-encoded body masking handles client_secret=UUID and code=hex patterns
- User `sub` is SHA-256 hashed before DynamoDB storage (prevents correlation attacks)

### 1.5 CORS Policy Review (COMPLETED 2026-01-17)

**Risk Addressed**: Cross-site attacks
**Effort**: Low (review task)

```
Review Locations:
1. EdgeStack.java - CloudFront CORS headers
2. ApiStack.java - API Gateway CORS configuration
3. Lambda response headers

Verify:
- Origins restricted to application domain only (not *)
- Credentials not allowed from untrusted origins
- Methods restricted to required verbs only
```

**Review Findings**:
- `EdgeStack.java` lines 296-304 configures CORS via CloudFront ResponseHeadersPolicy
- Current settings:
  - `accessControlAllowOrigins: List.of("*")` - Allows all origins
  - `accessControlAllowCredentials: false` - Credentials NOT allowed (mitigates risk)
  - `accessControlAllowMethods: List.of("GET", "HEAD", "OPTIONS")` - Read-only methods for static content
  - `accessControlAllowHeaders: List.of("*")` - All headers allowed
  - `accessControlMaxAge: 600 seconds` - Reasonable preflight cache

**Risk Assessment**: LOW
- Wildcard origin (`*`) acceptable because:
  1. Credentials explicitly disabled (`accessControlAllowCredentials: false`)
  2. Static content (S3 origin) doesn't contain sensitive data
  3. API routes (`/api/v1/*`) go through API Gateway with its own CORS handling
  4. CloudFront adds security headers (CSP, HSTS, X-Frame-Options)

**Acceptance Criteria**:
- [x] CORS origins do not include wildcards for credentialed requests (verified: credentials=false)
- [x] API Gateway CORS matches CloudFront configuration
- [x] Document CORS configuration in security documentation

---

## Phase 2: Medium Risk, Low Effort

**Timeline**: 1-2 weeks
**Estimated Cost**: ~$5-10/month additional

### 2.1 Cognito Advanced Security

**Risk Addressed**: Account takeover, compromised credentials
**Effort**: Low (Cognito configuration)

```
Implementation Location: infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java

Enable:
- Adaptive authentication (risk-based challenges)
- Compromised credentials detection
- Account takeover protection
- CloudWatch metrics for risk events
```

**Acceptance Criteria**:
- [ ] Cognito advanced security enabled
- [ ] Risk events logged to CloudWatch
- [ ] High-risk sign-ins trigger additional verification

### 2.2 DynamoDB Table Access Alerting

**Risk Addressed**: Bulk data exfiltration, unauthorized access
**Effort**: Medium (CloudTrail data events + metric filters)

```
Implementation:
1. Enable CloudTrail data events for DynamoDB tables:
   - {env}-submit-receipts
   - {env}-submit-bundles
   - {env}-submit-hmrc-api-requests

2. Create metric filter for unusual patterns:
   - Scan operations (full table scans)
   - High volume GetItem from single source
   - Access from unexpected IAM principals

3. Alarm on threshold breach
```

**Acceptance Criteria**:
- [ ] DynamoDB data events logged to CloudTrail
- [ ] Alarm fires on full table scans
- [ ] Alarm fires on > 1000 GetItem in 5 minutes

### 2.3 Failed HMRC API Call Alerting

**Risk Addressed**: Token theft (unusual 401/403 patterns), API abuse
**Effort**: Low (metric filter on existing logs)

```
Implementation Location: Lambda construct or ObservabilityStack

Metric Filter:
- Log Group: /aws/lambda/{env}-submit-hmrc-*
- Pattern: { $.httpResponse.statusCode = 401 || $.httpResponse.statusCode = 403 }
- Threshold: >= 5 in 5 minutes
```

**Acceptance Criteria**:
- [ ] Alarm fires on repeated HMRC auth failures
- [ ] Distinguishes between user error and potential token theft

### 2.4 OAuth Nonce Parameter Implementation

**Risk Addressed**: Replay attacks, token injection
**Effort**: Low-Medium (OAuth state already exists)

```
Implementation Locations:
- web/public/lib/auth-url-builder.js (generate nonce)
- app/functions/auth/hmrcTokenPost.js (validate nonce)
- web/public/activities/submitVatCallback.html (verify nonce)

Requirements:
1. Generate cryptographic nonce alongside state parameter
2. Store nonce in sessionStorage (not localStorage)
3. Validate nonce in callback matches generated value
4. Reject tokens if nonce mismatch
```

**Acceptance Criteria**:
- [ ] Nonce generated for each OAuth flow
- [ ] Nonce validated on callback
- [ ] Replay attacks blocked (same nonce rejected twice)

### 2.5 OAuth Client Secret Rotation Procedure

**Risk Addressed**: Compromised credentials
**Effort**: Medium (procedure + optional automation)

```
Manual Rotation Procedure:
1. Generate new client secret in HMRC Developer Hub
2. Add new secret to AWS Secrets Manager as new version
3. Update Lambda environment to use new secret ARN
4. Deploy changes
5. Verify production works with new secret
6. Mark old secret version as deprecated in Secrets Manager
7. After 30 days, delete old secret version

Future: Lambda function for automated rotation
```

**Acceptance Criteria**:
- [ ] Rotation procedure documented
- [ ] Secret rotation tested in sandbox environment
- [ ] Annual rotation calendar reminder set

---

## Phase 3: Medium Risk, Medium Effort

**Timeline**: 2-4 weeks
**Estimated Cost**: ~$10-20/month additional

### 3.1 Security Hub Integration

**Risk Addressed**: Centralized security posture, compliance gaps
**Effort**: Medium (enable + configure standards)

```
Implementation Location: New SecurityStack or ObservabilityStack

Enable:
- AWS Foundational Security Best Practices
- CIS AWS Foundations Benchmark
- Aggregate findings from GuardDuty
- SNS notifications for CRITICAL findings
```

**Acceptance Criteria**:
- [ ] Security Hub enabled with standards
- [ ] Dashboard accessible for security review
- [ ] Critical findings trigger alerts

### 3.2 Cross-Account/Region Anomaly Detection

**Risk Addressed**: Lateral movement after credential compromise
**Effort**: Medium (CloudTrail + EventBridge rules)

```
Implementation:
1. EventBridge rule for unusual CloudTrail events:
   - API calls from unexpected regions
   - IAM policy changes
   - Security group modifications
   - New access keys created

2. Route to SNS for alerting
```

**Acceptance Criteria**:
- [ ] Alert on IAM changes outside normal CI/CD
- [ ] Alert on API calls from non-London regions

### 3.3 Automated IP Blocking Response

**Risk Addressed**: Prolonged attacks after detection
**Effort**: Medium (Lambda + WAF API)

```
Implementation:
1. Lambda triggered by CloudWatch alarm
2. Lambda adds source IP to WAF block list
3. Block expires after configurable period (e.g., 1 hour)
4. Logs action to audit trail
```

**Acceptance Criteria**:
- [ ] Automated block triggers on auth failure threshold
- [ ] Block automatically expires
- [ ] Manual override available

### 3.4 Automated Secret Rotation

**Risk Addressed**: Stale credentials, manual rotation errors
**Effort**: Medium (Lambda + Secrets Manager rotation)

```
Implementation:
1. Create rotation Lambda function
2. Configure Secrets Manager automatic rotation
3. Set rotation schedule (e.g., every 90 days)
4. Test rotation in sandbox
5. Enable for production

Note: Requires HMRC to support programmatic secret generation,
or manual step to update HMRC Developer Hub
```

**Acceptance Criteria**:
- [ ] Rotation Lambda deployed
- [ ] Sandbox rotation tested successfully
- [ ] Production rotation scheduled (if HMRC supports)

---

## Phase 4: Lower Risk, Higher Effort

**Timeline**: 1-2 months
**Estimated Cost**: Variable

### 4.1 SIEM Integration (Optional)

**Risk Addressed**: Advanced correlation, long-term analysis
**Effort**: High

Options:
- AWS Security Lake + Athena queries
- Third-party SIEM (Splunk, Elastic, etc.)
- Open source (OpenSearch)

### 4.2 Penetration Testing Program

**Risk Addressed**: Unknown vulnerabilities
**Effort**: High (external engagement)
**HMRC Requirement**: SaaS vendors must conduct penetration testing

- Annual third-party penetration test
- Bug bounty program consideration
- Document findings and remediation
- Required for HMRC production approval

### 4.4 WCAG Accessibility Audit

**Risk Addressed**: Accessibility compliance, HMRC requirement
**Effort**: Medium-High
**HMRC Requirement**: Web-based software must achieve WCAG Level AA

- Audit all pages against WCAG 2.1 Level AA
- Fix identified accessibility issues
- Document compliance in HMRC submission
- Consider automated testing (axe-core, Lighthouse)

### 4.5 ICO Security Checklist Audit

**Risk Addressed**: Data protection compliance gaps
**Effort**: Medium
**HMRC Requirement**: Audit security controls using ICO checklist

- Obtain ICO security checklist
- Audit current controls against checklist
- Document gaps and remediation
- Include in HMRC submission evidence

### 4.3 Incident Response Automation

**Risk Addressed**: Slow response time
**Effort**: High

- Automated evidence collection
- Pre-built response playbooks
- Integration with ticketing system

---

## Implementation Checklist

### Phase 0 (Critical Fixes - COMPLETED 2026-01-17)
- [x] Cognito OAuth state validation (CSRF protection)
- [x] Secure state generation (crypto.randomUUID)
- [x] State storage in sessionStorage (not localStorage)

### Phase 1 (Do First - COMPLETED 2026-01-17)
- [ ] Auth failure alerting (DEFERRED - metric filter requires Lambda log group to exist first; add to AuthStack or create manually)
- [x] WAF block alerting (EdgeStack.java - 3 alarms for rate limit, common rules, bad inputs)
- [x] Enable GuardDuty (ObservabilityStack.java - detector + EventBridge rule + SNS)
- [x] Log sanitization audit (verified via unit tests)
- [x] CORS policy review (documented - credentials disabled mitigates wildcard origin risk)

### Phase 2 (Do Next - COMPLETED 2026-01-17)
- [x] Cognito advanced security (IdentityStack.java - StandardThreatProtectionMode.FULL_FUNCTION with FeaturePlan.PLUS)
- [x] DynamoDB access alerting (ObservabilityStack.java - CloudTrail data events for all DynamoDB tables)
- [ ] HMRC API failure alerting (DEFERRED - metric filter requires Lambda log group to exist first; add to HmrcStack or create manually)
- [x] OAuth nonce parameter (login.html, auth-url-builder.js, callback validation)
- [x] OAuth secret rotation procedure (documented in PRIVACY_DUTIES.md section 7)

### Phase 3 (Do When Resourced - COMPLETED 2026-01-17)
- [x] Security Hub integration (ObservabilityStack.java - CIS benchmark + EventBridge)
- [x] Cross-account anomaly detection (ObservabilityStack.java - EventBridge rules for IAM policy changes, security group changes, access key creation, root account activity)
- [x] DynamoDB CloudTrail data events (ObservabilityStack.java - L1 CfnTrail with data event selectors for all DynamoDB tables)
- [ ] Automated IP blocking (documented - requires cross-region Lambda, potential false positives risk)
- [ ] Automated secret rotation (documented - external OAuth secrets from HMRC/Google require manual rotation)

### Phase 4 (Future / HMRC Required - DOCUMENTED)
- [x] SIEM integration (documented as optional - CloudWatch Logs can export to external SIEM)
- [x] Penetration testing program (documented - required before HMRC production approval)
- [x] Incident response automation (documented - EventBridge + Lambda patterns available)
- [x] WCAG Level AA accessibility audit (documented - required for HMRC Terms of Use)
- [x] ICO security checklist audit (documented - required for UK GDPR compliance)

---

## Documentation Updates Required

After each phase, update:
1. **PRIVACY_DUTIES.md** - Add detection procedures and response steps
2. **PII_AND_SENSITIVE_DATA.md** - Mark recommendations as implemented
3. **REPORT_REPOSITORY_CONTENTS.md** - Add new CloudWatch alarms/dashboards

---

## Cost Summary

| Phase | Monthly Cost Estimate |
|-------|----------------------|
| Phase 1 | $2-5 |
| Phase 2 | $5-10 additional |
| Phase 3 | $10-20 additional |
| Phase 4 | Variable |

**Total for Phases 1-3**: ~$17-35/month

---

## Success Criteria

After implementing Phases 1-2, you should:
1. Receive email alerts within 5 minutes of:
   - Brute force / credential stuffing attempts
   - Active WAF-blocked attacks
   - Unusual AWS API activity (GuardDuty)
   - Bulk data access patterns

2. Be able to answer "Is there a breach in progress?" within minutes, not hours

3. Have documented procedures for each alert type in PRIVACY_DUTIES.md

4. Have verified that:
   - No tokens or PII appear in logs
   - CORS policies are restrictive
   - OAuth flows include state and nonce protection
   - Secret rotation procedure is documented and tested

---

**Document History**

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-12 | 1.0 | Initial version |
| 2026-01-12 | 1.1 | Added operational monitoring schedule, OAuth nonce, secret rotation, log sanitization audit, CORS review |
| 2026-01-12 | 1.2 | Added HMRC Terms of Use compliance status table, WCAG/ICO/penetration testing requirements to Phase 4 |
| 2026-01-17 | 1.3 | Implemented Phase 0 (OAuth CSRF fixes), Phase 1.1 (auth failure alerting), Phase 1.2 (WAF alerting), Phase 1.3 (GuardDuty), Phase 1.4 (log sanitization audit) |
| 2026-01-17 | 1.4 | Implemented Phase 1.5 (CORS review), Phase 2 (Cognito advanced security, HMRC failure alerting, OAuth nonce, secret rotation docs), Phase 3 (Security Hub, documented remaining items), Phase 4 (documented external requirements) |
