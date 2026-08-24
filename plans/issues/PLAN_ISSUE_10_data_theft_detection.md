# PLAN: Issue #10 (pre-migration #719) — Data theft detection

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/10
> Original body: (empty)
> Existing plans: **`_developers/backlog/PLAN_SECURITY_DETECTION_UPLIFT.md`** (shared with #9 scan detection), plus `REPORT_SECURITY_REVIEW.md` and `PII_AND_SENSITIVE_DATA.md` in the archive.

## Elaboration

Sibling to #9 but higher-stakes: detection for signs of unauthorised bulk access to customer data (VAT submissions, HMRC receipts, bundle/pass records, Cognito user attributes, subscription metadata). Threat model:

1. **Insider threat** — an AWS IAM principal (human or compromised OIDC role) performs mass reads on `prod-env-receipts`, `prod-env-bundles`, or the salt secret.
2. **Credential leak** — a compromised JWT/Cognito session is used from unusual locations to hit `/api/v1/bundle`, `/api/v1/hmrc/receipt`, etc., at abnormal volume.
3. **Misconfiguration** — public read access accidentally granted to an S3 bucket holding CSV exports or DynamoDB backup JSONL.

Signals we can tap:

| Signal | Source |
|---|---|
| DynamoDB `Scan` by a Lambda role that normally never Scans | CloudTrail data events |
| High rate of `GetItem`/`Query` by a single role in a short window | CloudTrail + metric filter |
| S3 GetObject on backup buckets from unexpected principals | CloudTrail |
| Cognito `AdminGetUser` / `AdminListGroupsForUser` burst | CloudTrail |
| Secret access to the user-sub-hash-salt outside the Lambda runtime role | Secrets Manager audit log |
| Unexpected geolocation on session tokens (IP country change mid-session) | API Gateway custom authorizer logs |

## Likely source files to change

- `infra/main/java/.../stacks/ObservabilityStack.java` — add a CloudTrail data-event trail for the customer-data DynamoDB tables and the salt secret.
- `infra/main/java/.../stacks/SecurityDetectionStack.java` (new, shared with #9) — CloudWatch Insights + metric filters + alarms.
- `app/functions/ops/securityAnomalyDetect*.js` — new Lambda(s) running on EventBridge schedule (every 5 min) that run Insights queries on the trail logs and emit detection events.
- `app/functions/auth/customAuthorizer.js` — extend to log geolocation (from CloudFront `cloudfront-viewer-country`) and flag country changes within a session.
- `app/data/dynamoDbBundleRepository.js` and `dynamoDbReceiptsRepository.js` — structured logging of every read with `{ operation, tableName, countItems, userId }` (we may partly have this) so metric filters can count.
- `_developers/archive/PII_AND_SENSITIVE_DATA.md` — update with the detection surface.

## Likely tests to change/add

- System test: simulate 100 `Query` calls by a test role on the bundles table; assert a detection event raises.
- CDK assertion: CloudTrail data events are enabled for the receipts, bundles, passes, subscriptions tables.
- CDK assertion: the user-sub-hash-salt secret has a resource policy restricting `secretsmanager:GetSecretValue` to the expected Lambda roles only.
- Playwright test: a mid-session country change (simulated via request header spoofing in CI) triggers a re-auth prompt.

## Likely docs to change

- `RUNBOOK_INFORMATION_SECURITY.md` — add data-theft detection response (who to call, how to revoke tokens en masse, how to rotate the salt).
- `REPORT_SECURITY_REVIEW.md` — update detection posture section.
- `accessibility.html` / `privacy.html` — note that we perform anomaly detection (GDPR transparency).

## Acceptance criteria

1. CloudTrail data events enabled on `{env}-env-{receipts,bundles,passes,subscriptions,hmrc-api-requests}` tables and on the salt secret.
2. Any IAM principal performing `dynamodb:Scan` on customer tables without a matching allow-list (e.g. backup role) raises a detection event within 5 min.
3. Any single API consumer exceeding 500 `GET /api/v1/bundle` calls in 60 s raises an alert.
4. Mid-session IP country change requires re-auth (session-token invalidated).
5. Runbook documents cross-account hold (if we suspect compromise: rotate salt, force logout all users by invalidating Cognito refresh tokens).
6. Existing synthetic tests excluded from the aggregator (by deployment name or principal).

## Implementation approach

**Recommended — phased with CloudTrail first.**

1. **Phase 1**: enable CloudTrail data events (cost-aware: ~$0.10 per 100k events).
2. **Phase 2**: metric filters + alarms for the big-hammer signals (Scan on customer tables, mass salt access).
3. **Phase 3**: session-level anomaly (geo, rate) in customAuthorizer.
4. **Phase 4**: automated response options (revoke session, block IP).

### Alternative A — AWS GuardDuty S3/RDS Protection
Turn on GuardDuty for "malicious IAM activity" findings. Supplements our detection but doesn't remove the need for Phase 1–3 because GuardDuty doesn't know our normal access patterns.

### Alternative B — SIEM (Datadog / Splunk)
Ship CloudTrail to an external SIEM. Higher cost; more capable. Deferred until in-AWS detection is proven insufficient.

## Questions (for QUESTIONS.md)

- Q10.1: Priority relative to #9? (Recommendation: work them together — same stack.)
- Q10.2: CloudTrail data events cost at our volume — acceptable? (Estimate requires CloudTrail Pricing Calculator inputs: ~1–5M data events/month → ~$1–5/month. Small.)
- Q10.3: Mid-session country-change — force re-auth (friction) or just alert? Paying subscribers travelling abroad may otherwise be locked out.

## Good fit for Copilot?

Partial. The CloudTrail config and metric filters are mechanical. The policy decisions (what's "anomalous", what's automatic response) need human judgment.
