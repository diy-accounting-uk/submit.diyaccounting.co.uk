# ICO Data Protection Checklist

Worked through the ICO's small-business self-assessment headings: [assessment for small business
owners and sole traders](https://ico.org.uk/for-organisations/advice-for-small-organisations/getting-started-with-gdpr/assessment-for-small-business-owners-and-sole-traders/)
and the [controllers checklist](https://ico.org.uk/for-organisations/advice-for-small-organisations/getting-started-with-gdpr/data-protection-self-assessment-medium-businesses/controllers-checklist/)
(ico.org.uk, checked 2026-09-03). Each line: met or gap, with the file:line or URL that supports it.

## Registration — Met

Registration `ZB070902` was renewed by direct debit on 2026-05-20, expiring 2027-05-23. The registration renews automatically each May (renewal reminder arrives ~11 April, collection ~20 May). `web/public/privacy.html:624,826` publishes ZB070902 as current. `ICO Registration Certificate - ZB070902 - Diy Accounting Limited.pdf` (repo root) is dated 2024 and should be refreshed with the 2026 renewal certificate by download from the ICO register.

**Method**: Before declaring a registration lapsed, check the mailbox's renewal confirmation emails (ICO sends them to the registered contact each May; search `diyaccounting.co.uk` domain emails for "registration renewal" or "direct debit").

## Lawful basis

| Item | Status | Reason |
|---|---|---|
| Lawful basis stated per processing purpose | Met | `web/public/privacy.html:668-714` — a Purposes of Processing table names contract performance, legal obligation, consent, or legitimate interests for each of nine processing activities. |
| Legal-obligation basis for fraud prevention headers | Met | `web/public/privacy.html:239-251` cites the HMRC Fraud Prevention Specification. |
| Consent basis for analytics/RUM, denied by default | Met | `web/public/privacy.html:198-201` — GA4 loads with consent denied by default; no tracking before explicit opt-in. |

## Privacy notice

| Item | Status | Reason |
|---|---|---|
| Privacy notice published and linked | Met | `web/public/privacy.html`, linked from site footer. |
| Notice names the controller/processor split | Met | `web/public/privacy.html:539-586` — HMRC (controller for submission data), AWS (processor), Google (controller for auth, processor for analytics). |
| Notice lists all processors actually in use | Gap | Stripe (`app/functions/billing/*`) handles subscription billing and Telegram (`app/functions/ops/activityTelegramForwarder.js`) carries operational alerts; neither appears anywhere in `web/public/privacy.html`. |
| Notice states retention periods | Met, with one wrong figure | `web/public/privacy.html:377-419` and `:732-739` give a retention table — see Retention section below for the one figure that doesn't match the code. |

## Retention

| Item | Status | Reason |
|---|---|---|
| HMRC receipts retained 7 years, matching the stated policy | Gap | `app/data/dynamoDbReceiptRepository.js:46-49` computes a 7-year TTL value on every receipt item, but `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java:101-111` never calls `ensureTimeToLive` for the receipts table (every other table with a computed TTL does — see lines 121, 135, 151, 167, 183, 199, 216, 276). The `ttl` attribute is written but DynamoDB isn't told to expire on it, so receipts are retained indefinitely rather than auto-expiring at 7 years. |
| HMRC API audit trail retention matches the stated policy | Gap | Code and CDK agree on 28 days (`app/data/dynamoDbHmrcApiRequestRepository.js:75-78`, `DataStack.java:209,216-220`, `RUNBOOK_INFORMATION_SECURITY.md:632`), but `web/public/privacy.html:399-401` tells users this data is kept "30 days". |
| Closed-account cleanup | Met | `scripts/cleanup-deleted-accounts.js`, run per `_developers/archive/PRIVACY_DUTIES.md:143-145`. |

## Subject access and erasure

| Item | Status | Reason |
|---|---|---|
| Erasure request path exists and is audited | Met | Two GitHub Actions workflows: `.github/workflows/delete-user-data.yml` (deletes by hashed sub, with a dry-run mode when `confirm` is false) and `.github/workflows/delete-user-data-by-email.yml` (resolves an email to a hashed sub, then calls the same deletion path). Both run through CI with logged output. |
| Subject access (export) request path is equally auditable | Gap | `scripts/export-user-data.js` exists but has no GitHub Actions wrapper — it only runs locally with AWS credentials, with no dry-run and no CI audit trail, unlike the erasure path. |
| Erasure explains the 7-year receipt exception to the user | Met | `_developers/archive/PRIVACY_DUTIES.md:21-24` and `web/public/privacy.html:531` both state receipts are retained for HMRC's 7-year requirement even after account deletion. |

## Processors

| Processor | Role | Status |
|---|---|---|
| AWS | Hosting, storage, all processing | Met — documented in `web/public/privacy.html:557-577`. |
| Google | Auth provider (controller for auth data), GA4 (processor, consent-gated) | Met — documented in `web/public/privacy.html:578-608`. |
| HMRC | Data controller for submitted VAT/tax data | Met — documented in `web/public/privacy.html:539-556`. |
| Stripe | Processor for subscription billing and payment data | Gap — not named anywhere in `web/public/privacy.html`. |
| Telegram | Carries operational/security alert content (`app/functions/ops/activityTelegramForwarder.js`) | Gap — not named anywhere in `web/public/privacy.html`; worth confirming whether alert payloads carry personal data before deciding if this needs disclosure. |

## Breach process

| Item | Status | Reason |
|---|---|---|
| A breach process exists | Met | `RUNBOOK_INFORMATION_SECURITY.md` section 6.2 ("When a Breach Occurs") and `_developers/archive/PRIVACY_DUTIES.md` section 2. |
| The process names the 72-hour ICO deadline | Met | `RUNBOOK_INFORMATION_SECURITY.md:423`. |
| The process gives a ready-to-use notification template (what to record, who decides, the ICO form fields) | Now met | Added as `RUNBOOK_INFORMATION_SECURITY.md` section 6.7, this commit. Previously the runbook only listed the steps and the ICO's complaints URL, not a template. |
