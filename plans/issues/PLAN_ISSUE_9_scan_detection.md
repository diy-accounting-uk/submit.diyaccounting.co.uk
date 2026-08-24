# PLAN: Issue #9 (pre-migration #720) — Scan detection

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/9
> Original body: (empty)
> Existing plans: **`_developers/backlog/PLAN_SECURITY_DETECTION_UPLIFT.md`** (619 lines — covers scan and data-theft detection together).

## Elaboration

"Scan detection" is the first of two security observability uplifts requested (the sibling is #10 "Data theft detection"). The existing `PLAN_SECURITY_DETECTION_UPLIFT.md` is the authoritative design; this issue tracks the operational rollout. The goal: detect automated scanning/probing of the submit estate (WAF miss + 404 spikes + predictable-path guessing + unusual user-agent patterns) quickly enough to respond (block IP at WAF, rate-limit, or escalate).

Detection signals we already have or need:

| Signal | Source | Have? |
|---|---|---|
| WAF managed rule matches | AWS WAF CloudWatch metrics (EdgeStack) | Yes |
| WAF rate-limit triggers | AWS WAF | Yes |
| CloudFront 404 spike per source IP | CloudFront access logs → S3 → Athena/CloudWatch | Needs an aggregator |
| Predictable-path probing (e.g. `/.env`, `/wp-admin`, `/.git/config`) | CloudFront access logs | Needs a rule |
| Lambda-level auth failures per IP | Lambda logs (existing `customAuthorizer.js`) | Needs aggregation |
| Canary honeypot endpoints | New | Missing |

## Likely source files to change

- `infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java` — audit WAF rules; add a custom rule for common scan paths (`/.env`, `/wp-*`, `/phpmyadmin`, `.git/*`).
- New `infra/main/java/.../stacks/SecurityDetectionStack.java` — contains:
  - A CloudWatch Logs Insights query run on a schedule via Lambda.
  - Metric filters for the detection signals above.
  - CloudWatch alarms wired to the existing alerting fan-out (`PLAN_WHATSAPP_ALERTING.md`, Telegram).
- `app/functions/ops/securityScan*.js` — new Lambdas to aggregate per-IP 404 counts and raise anomaly events.
- `web/public/*.html` — add a few canary honeypot paths that always return 410 Gone (and whose hits are logged as "intentional 410 triggered → scanner"). Examples: `/wp-login.php`, `/.env`, `/.git/config`.
- `_developers/backlog/PLAN_SECURITY_DETECTION_UPLIFT.md` — mark this issue as the tracking ticket; no new plan needed — use the existing one verbatim.

## Likely tests to change/add

- System test: simulate 50 404s from one IP within 60 s; assert a detection event is raised.
- System test: hit `/.env`; assert a scan event is raised immediately (not on threshold).
- CDK assertion test (`SubmitEnvironmentCdkResourceTest.java`): confirm the new SecurityDetectionStack's resource count.
- Do NOT add real-traffic probes that could be misclassified as attacks — all tests run in CI against CI infrastructure.

## Likely docs to change

- `_developers/backlog/PLAN_SECURITY_DETECTION_UPLIFT.md` — keep as source of truth; add a changelog pointer to this issue.
- `REPORT_SECURITY_REVIEW.md` or `REPORT_ACCESSIBILITY_PENETRATION.md` — update to reference the detection posture.
- `RUNBOOK_INFORMATION_SECURITY.md` at project root — add the scan-detection runbook: what fires, what humans do.

## Acceptance criteria

1. A scan hitting `/.env` triggers a detection event within 30 s.
2. A 404 rate >20/min from a single IP triggers a rate-limit/detection event.
3. Detection events appear in the existing Telegram channel (or equivalent).
4. WAF managed rule updates do not regress false-positive rate on synthetic tests.
5. Existing synthetic test runs continue to be **excluded** from detection (their IPs/UAs are allow-listed, or the detection runs only on CloudFront access logs which the synthetic runs against production actually do land in — so whitelisting is by deployment-name dimension not IP).
6. Runbook documents the response: (a) check if it's synthetic, (b) if not, add IP to WAF block list via `WAF-Manual-Block` IPSet.
7. 7-day clean run against CI with no false positives.

## Implementation approach

**Recommended — stand up the `PLAN_SECURITY_DETECTION_UPLIFT.md` design as-is, track delivery here.**

The existing plan has been through review. Phase it:
- **Phase 1**: WAF rule audit + honeypot paths (quick, low risk).
- **Phase 2**: CloudFront logs → CloudWatch Logs Insights + metric filters + alarms.
- **Phase 3**: Anomaly aggregator Lambda (per-IP 404 counting).
- **Phase 4**: Automated WAF IPSet updates (careful — can lock out legit users if misconfigured).

### Alternative A — commercial WAF / CDN (Cloudflare)
Move detection to Cloudflare. Loses AWS integration, adds a vendor. Rejected unless cost/complexity justify.

### Alternative B — AWS GuardDuty for Route53 + WAF
Turn on GuardDuty with the WAF add-on. Expensive at our volume, returns findings with high latency. Nice-to-have supplement, not the primary.

## Questions (for QUESTIONS.md)

- Q9.1: Which channel should detection events go to — Telegram, Slack (per #18), or both?
- Q9.2: Do we block IPs automatically on threshold, or alert-only (human-in-the-loop)? (Recommendation: alert-only initially.)
- Q9.3: Is there a budget envelope for CloudWatch Logs Insights queries / additional Lambdas? Phase 3 adds a scheduled Lambda running every ~1 min.

## Good fit for Copilot?

Mixed. The WAF rule additions and honeypot pages are great for Copilot. The Lambda aggregator + runbook need a human security-aware pass.
