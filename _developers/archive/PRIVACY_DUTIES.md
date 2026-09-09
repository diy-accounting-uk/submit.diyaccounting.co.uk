<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Privacy Duties for Operating DIY Accounting Submit

This document outlines the specific privacy and data protection duties required when operating this system, as mandated by UK GDPR and HMRC MTD requirements.

## Administrator: admin@diyaccounting.co.uk

---

## 1. Data Subject Rights Requests (30-day response time)

### Right of Access
- **Request**: User asks for copy of their personal data
- **Action**: Run `scripts/export-user-data.js <userId>` to generate JSON export
- **Deliver**: Email JSON file or provide secure download link
- **Timeline**: Within 30 days

### Right to Erasure ("Right to be Forgotten")
- **Request**: User asks for account and data deletion
- **Action**:
  1. Run `scripts/delete-user-data.js <userId>` to delete bundles and auth data
  2. HMRC receipts will be retained for 7 years (legal requirement) but anonymized
  3. Verify deletion in DynamoDB and Cognito
- **Timeline**: Complete within 30 days
- **Note**: Inform user that HMRC receipts retained for legal compliance

### Right to Rectification
- **Request**: User reports incorrect data
- **Action**: Update data via DynamoDB console or admin scripts
- **Timeline**: Within 30 days

### Right to Data Portability
- **Request**: User wants data in machine-readable format for transfer
- **Action**: Same as Right of Access - export to JSON or CSV
- **Timeline**: Within 30 days

---

## 2. Security Incident Response (72-hour notification)

### When a Breach Occurs
1. **Assess impact**: Determine what data was affected and how many users
2. **Contain**: Immediately mitigate the breach (revoke credentials, block access, etc.)
3. **Notify within 72 hours**:
   - **ICO**: Report via https://ico.org.uk/make-a-complaint/data-protection-complaints/
   - **HMRC**: Email SDSTeam@hmrc.gov.uk if OAuth tokens or HMRC data affected
   - **Affected users**: Email all impacted users with:
     - What happened
     - What data was affected
     - What actions you've taken
     - What users should do (e.g., revoke HMRC authorization, change passwords)
4. **Document**: Keep records of the incident, response, and remediation

### Types of Breaches Requiring Notification
- Unauthorized access to DynamoDB (bundles, receipts)
- Exposed OAuth tokens or HMRC credentials
- AWS credential compromise
- Data exfiltration or ransomware
- Accidental public exposure of user data

---

## 3. Current Security Detections (What We Can Detect Now)

### 3.1 Detections That Alert Automatically

These trigger CloudWatch Alarms and send notifications to the configured SNS topic:

| Detection | What It Catches | Where to Check | Response |
|-----------|-----------------|----------------|----------|
| **Lambda Error Alarm** | Unhandled exceptions, code failures | CloudWatch Alarms > `{env}-submit-*-errors` | Check Lambda logs for stack trace |
| **Lambda Log Error Alarm** | ERROR/Exception/FATAL in logs | CloudWatch Alarms > `{env}-submit-*-log-errors` | Search logs for error pattern |
| **API Gateway 5xx Alarm** | Backend failures | CloudWatch Alarms > `{env}-submit-api-5xx` | Check API Gateway + Lambda logs |
| **Lambda Throttle Alarm** | Request volume exceeding capacity | CloudWatch Alarms > `{env}-submit-*-throttles` | Potential abuse - check source |
| **Health Check Canary** | Site down / unresponsive | CloudWatch Alarms > `{env}-ops-health-check` | Check CloudFront, API Gateway, Lambda |
| **API Check Canary** | API endpoints unresponsive | CloudWatch Alarms > `{env}-ops-api-check` | Check API Gateway, authorizer |

### 3.2 Detections Logged But Not Alerting

These require manual log analysis to discover:

| Detection | Where to Find | Search Pattern | What It Indicates |
|-----------|---------------|----------------|-------------------|
| **Auth Failures** | CloudWatch Logs > `/aws/lambda/{env}-submit-custom-authorizer` | `level = "WARN" OR level = "ERROR"` | Brute force, invalid tokens |
| **WAF Blocks** | CloudWatch Metrics > `AWS/WAFV2` | Metrics: `BlockedRequests` by rule | Active attacks (SQLi, XSS, rate limit) |
| **Unusual AWS API Calls** | CloudTrail > Event History | Filter by `errorCode` or unusual `sourceIPAddress` | Credential compromise |
| **HMRC API Failures** | CloudWatch Logs > `/aws/lambda/{env}-submit-hmrc-*` | `httpResponse.statusCode = 401` or `403` | Token theft, unauthorized access |

### 3.3 How to Investigate Security Events

#### Check Authentication Failures
```bash
# CloudWatch Logs Insights query
fields @timestamp, @message
| filter @logStream like /custom-authorizer/
| filter level = "WARN" or level = "ERROR"
| sort @timestamp desc
| limit 100
```

#### Check WAF Activity
1. Go to AWS Console > WAF & Shield > Web ACLs
2. Select `{env}-submit-waf`
3. View "Sampled requests" tab for blocked requests
4. Check CloudWatch Metrics for `BlockedRequests` by rule name

#### Check CloudTrail for AWS API Activity
1. Go to AWS Console > CloudTrail > Event history
2. Filter by:
   - Time range of suspected incident
   - Event source (e.g., `dynamodb.amazonaws.com`)
   - Error codes (e.g., `AccessDenied`)
3. Look for unusual patterns:
   - API calls from unexpected IP addresses
   - Unusual IAM principals
   - Failed access attempts

#### Check HMRC API Audit Trail
```bash
# Query DynamoDB hmrc-api-requests table
aws dynamodb scan \
  --table-name {env}-submit-hmrc-api-requests \
  --filter-expression "contains(httpResponse.statusCode, :code)" \
  --expression-attribute-values '{":code":{"N":"401"}}'
```

### 3.4 Gaps in Current Detection (See SECURITY_DETECTION_UPLIFT_PLAN.md)

**Not Currently Alerting**:
- Authentication failure spikes (brute force detection)
- WAF block rate spikes (active attack detection)
- Unusual DynamoDB access patterns (data exfiltration)
- GuardDuty threat detection (not enabled)

**Planned Improvements**: See `SECURITY_DETECTION_UPLIFT_PLAN.md` for phased implementation plan.

---

## 4. Data Retention Management

### Regular Tasks

#### Every 30 Days
- Review and delete data for closed accounts older than 30 days
- Run: `scripts/cleanup-deleted-accounts.js`
- This removes: user bundles, Cognito profiles, OAuth refresh tokens

#### Every 7 Years
- HMRC receipts: After 7 years, eligible for deletion (UK tax record-keeping requirement)
- Consider: Archive to cold storage (S3 Glacier) after 2 years for cost savings

#### Every 90 Days
- Review CloudWatch log retention policies
- Ensure infrastructure logs not exceeding 90 days unless flagged for investigation

---

## 5. Monitoring and Auditing

### Weekly
- Check CloudWatch alarms for unusual access patterns
- Review GuardDuty findings (if enabled - see SECURITY_DETECTION_UPLIFT_PLAN.md)
- Review authentication failures in custom authorizer logs
- Check WAF sampled requests for attack patterns

### Monthly
- Review DynamoDB table sizes and growth
- Audit IAM access logs for admin actions
- Check for expired OAuth tokens in need of cleanup
- Review CloudTrail for unusual API activity

### Quarterly
- Review and update privacy policy if services/data processing changes
- Test data export and deletion scripts
- Verify encryption at rest for all DynamoDB tables
- Review and update this document

---

## 6. HMRC Compliance

### Ongoing
- **Fraud Prevention Headers**: Ensure all API calls include required Gov-Client-* headers
- **OAuth Token Security**: Never log or expose OAuth tokens; ensure they're encrypted at rest
- **Production Readiness**: Before HMRC approval, verify:
  - Privacy policy URL is live and accessible
  - Terms of use URL is live and accessible
  - Penetration testing completed
  - Fraud prevention headers tested via HMRC Test API

### Annual
- Review and test disaster recovery procedures
- Verify backups and restoration process
- Update security documentation

---

## 7. OAuth Secret Rotation

OAuth client secrets should be rotated regularly (at least annually) to minimize the impact of potential compromise.

### HMRC Client Secret Rotation

1. **Log into HMRC Developer Hub**: https://developer.service.hmrc.gov.uk/
2. **Navigate to your application** and regenerate the client secret
3. **Update AWS Secrets Manager**:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id arn:aws:secretsmanager:eu-west-2:ACCOUNT:secret:ENV/submit/hmrc/client_secret \
     --secret-string "NEW_SECRET_VALUE"
   ```
4. **Lambda picks up the new secret** on next cold start
   - Force a cold start by redeploying, or wait for natural instance rotation
   - Verify by checking a test OAuth flow

### Google OAuth Secret Rotation

1. **Log into Google Cloud Console**: https://console.cloud.google.com/
2. **Navigate to**: APIs & Services > Credentials > OAuth 2.0 Client IDs
3. **Create a new client secret** (you can have multiple active)
4. **Update AWS Secrets Manager**:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id arn:aws:secretsmanager:eu-west-2:ACCOUNT:secret:ENV/submit/google/client_secret \
     --secret-string "NEW_SECRET_VALUE"
   ```
5. **Redeploy** the IdentityStack to pick up the new secret
6. **Delete the old secret** in Google Cloud Console after verifying new one works

### Rotation Schedule

| Secret | Location | Rotation Frequency | Last Rotated |
|--------|----------|-------------------|--------------|
| HMRC Client Secret | AWS Secrets Manager | Annually | Document here |
| Google Client Secret | AWS Secrets Manager | Annually | Document here |

### Automated Rotation (Future)

See `SECURITY_DETECTION_UPLIFT_PLAN.md` Phase 3.4 for planned AWS Secrets Manager automatic rotation implementation.

---

## 8. User Communications

### Privacy Policy Updates
- When changing data processing practices:
  1. Update privacy.html with new "Last updated" date
  2. Email all active users with summary of changes
  3. Add prominent banner on site for 30 days

### Terms of Use Updates
- Similar to privacy policy updates
- For material changes (e.g., new fees, service restrictions):
  - Email users at least 30 days before changes take effect
  - Allow users to close account if they disagree

---

## 9. Scripts and Tools

### Required Admin Scripts (to be created/maintained)

```bash
# Export user data (JSON format)
node scripts/export-user-data.js <userId>

# Delete user account and data
node scripts/delete-user-data.js <userId>

# Cleanup accounts closed >30 days ago
node scripts/cleanup-deleted-accounts.js

# Anonymize old HMRC receipts (after 7 years)
node scripts/anonymize-old-receipts.js --before-date YYYY-MM-DD

# Audit user access logs
node scripts/audit-user-access.js <userId> --days 90
```

### AWS Console Access
- **DynamoDB**: Direct access for data inspection and manual corrections
- **CloudWatch**: Log review and monitoring
- **CloudWatch Alarms**: Security alert configuration
- **Cognito**: User management and token revocation
- **Secrets Manager**: OAuth client secrets (never expose in logs)
- **CloudTrail**: AWS API audit trail
- **WAF**: Attack monitoring and IP blocking

---

## 9. Contact and Escalation

### Primary Contact
- **Email**: admin@diyaccounting.co.uk
- **Response SLA**: 30 days for data requests, 72 hours for security incidents

### Escalation
- **ICO**: For guidance on complex GDPR issues - https://ico.org.uk/
- **HMRC SDS Team**: SDSTeam@hmrc.gov.uk for MTD compliance questions
- **AWS Support**: For infrastructure security incidents

---

## 10. Documentation to Maintain

### Keep Updated
- This document (PRIVACY_DUTIES.md)
- web/public/privacy.html
- web/public/terms.html
- SECURITY_DETECTION_UPLIFT_PLAN.md
- _developers/REVIEW_TO_MTD.md (HMRC readiness checklist)

### Keep Accessible
- Data processing agreements with AWS
- Penetration test reports
- Security incident logs
- Data subject request logs (who requested what, when responded)

---

## Summary

**Most Important**:
1. Respond to data requests within **30 days**
2. Report breaches within **72 hours** to ICO and HMRC
3. Delete closed accounts within **30 days**
4. Retain HMRC receipts for **7 years**
5. Keep privacy/terms documentation current and accessible
6. Monitor security alerts and investigate promptly

**Tools Needed**:
- scripts/export-user-data.js
- scripts/delete-user-data.js
- scripts/cleanup-deleted-accounts.js
- scripts/anonymize-old-receipts.js

**Security Monitoring**:
- CloudWatch Alarms (Lambda errors, API 5xx, health checks)
- CloudWatch Logs (auth failures, HMRC API errors)
- WAF metrics and sampled requests
- CloudTrail (AWS API activity)

**Planned Improvements**:
- See SECURITY_DETECTION_UPLIFT_PLAN.md for detection enhancements

**Regular Reviews**:
- Weekly: Security monitoring, auth failures, WAF activity
- Monthly: Data growth, IAM audits, CloudTrail review
- Quarterly: Policy reviews, script testing, documentation updates
- Annual: Disaster recovery, penetration testing
