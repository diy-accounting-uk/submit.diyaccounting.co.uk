# Fraud prevention header email check

Backlog row 22: HMRC's Transaction Monitoring team emails a monthly fraud-prevention-header
report to `antony@diyaccounting.co.uk`. Today a person reads it or forgets to. The parser
(`app/lib/fraudPreventionHeaderReport.js`) is built and unit tested. This plan covers the two
parts not yet built: how the email text reaches the parser, and how a result that needs action
reaches the ops chat.

## What the real emails look like

Confirmed from four months in the mailbox mirror (April to July 2026, read via corpus-loom).
Each month gets exactly one email, always from `noreply@tax.service.gov.uk`, reporting on the
previous calendar month:

- **Correct**: subject "Fraud prevention headers for DIY Accounting Submit"; body states the
  headers "are correct" and the application "meets the fraud prevention specification".
- **Advisories**: subject "Improve fraud prevention headers for DIY Accounting Submit"; body
  states the headers "have advisories" that "you need to review".
- **Zero traffic**: subject "Check fraud prevention headers for DIY Accounting Submit"; body
  states the application "has not sent any requests" that month.

HMRC's own developer guide additionally lists "Missing", "Invalid" and "Errors" as header
statuses shown on the Developer Hub dashboard next to "Advisories". No email carrying one of
those has been seen yet, so the parser's `errors` field is exercised by the same sentence
pattern as advisories but has no fixture backing it — only `advisories` and the zero-traffic
case are proven against a real email today.

## Getting the email text to the parser

Three ways to feed `parseFraudPreventionHeaderReport` an email's text. All three end at the
same alert, so the choice is about where the operator's setup effort goes.

**Option A: gyb mail mirror plus a scheduled local script.** The mailbox is already mirrored
locally by `gyb` (see the workspace's `mail-sync` skill). A monthly local script (`launchd` or
cron) reads the newest email from `noreply@tax.service.gov.uk` with the fraud-prevention
subject, parses it, and calls the same alert path used elsewhere. Operator steps: none beyond
what already runs the mirror. Cost: the mirror runs on the operator's machine, so the check
only fires when that machine is on and the mirror has synced that day; a missed sync is a
missed check with no visibility into the miss.

**Option B: SES inbound to a Lambda.** Add an MX record and an SES receipt rule so HMRC's email
lands directly in a Lambda that parses it and calls the alert path, entirely in AWS. Operator
steps: change the domain's MX record (a DNS change with a real risk of breaking existing mail
delivery for that address, needs care and a rollback plan), request SES production access if
still in the SES sandbox, and register the receipt rule. Cost: highest of the three — a DNS
change to a live mailbox address most other things also depend on, done once, plus new
infrastructure to maintain (SES rule set, S3 bucket for raw mail, the Lambda itself).

**Option C: Gmail API pull inside a scheduled workflow.** A GitHub Actions workflow (or an
existing scheduled Lambda) uses a Gmail API service account or OAuth token scoped read-only to
search `antony@diyaccounting.co.uk` for the monthly email, parses it, and calls the alert path.
Operator steps: create a Google Cloud OAuth client (or domain-wide delegation for a service
account) scoped to Gmail read-only, consent once, store the resulting token as a GitHub secret,
and rotate it if it expires. Cost: a one-time OAuth setup plus a credential to keep alive
against Google's own expiry and revocation policy.

**Recommendation: Option A.** The mirror already exists and needs no new credential, DNS
change, or AWS resource. The failure mode (a missed sync on a day the machine is off) is
survivable, because a missed monthly check is not a missed submission or a missed HMRC
deadline. Option B fits an operation that must never miss and can justify touching the domain's
mail routing; this one doesn't need that. Option C trades DNS risk for OAuth token upkeep
without removing the same-machine dependency Option A already has, since the workflow would
still need to run somewhere and be told when a new month's email exists.

## Alert path

When `parseFraudPreventionHeaderReport` returns `needsAction: true`, the ingestion point (the
script from Option A, or its equivalent) calls `publishActivityEvent` from
`app/lib/activityAlert.js`:

```js
await publishActivityEvent({
  event: "fraud-prevention-header-report",
  flow: "operational",
  summary: `Fraud prevention headers for ${month}: ${advisories.length} advisories, ${errors.length} errors, traffic ${trafficCount ?? "reported"}`,
  detail: { month, trafficCount, advisories, errors },
});
```

This is the same shape `app/functions/ops/bedrockBudgetAlertForward.js` uses for AWS Budgets
notifications: an `ActivityEvent` with `flow: "operational"`, published to the shared activity
bus. Every live deployment's `ActivityTelegramRule` (in its `OpsStack`) already forwards
`operational` events to the ops Telegram chat, so no new infrastructure or Telegram wiring is
needed — only the call itself, made from wherever the email text is parsed.

A "correct" month (`needsAction: false`) publishes nothing, which is the point: the monthly
email stops needing a person to open it, and the ops chat only hears about the months that
need one.
