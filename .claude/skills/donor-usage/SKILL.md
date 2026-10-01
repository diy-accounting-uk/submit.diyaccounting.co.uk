---
name: donor-usage
description: Match the people who donated through Stripe or PayPal to prod submit accounts, and say which of them used the service and which submitted anything (VAT returns since 2026-02-21, every other submission kind since the activity lake's first day), into a private file at the workspace root. Read-only apart from one salt read the operator accepts. Invoke when the operator asks which donors use submit, whether donors file, or for the donor-to-usage cross reference.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# donor-usage

Joins payment identity to usage, which is personal data. The result goes to one file at the
workspace root, `../DONOR_USAGE_<YYYY-MM-DD>.md` (the root is not a repository and only the
operator reads it), mode `600`. Nothing personal goes into this repository, a commit, a PR, an
issue, a log line in chat, or the scratchpad beyond the run's own glue. Glue code lives in the
session scratchpad and is deleted at the end of the run.

## Operator's settings

Set by the operator before the first run; re-ask only if they say they changed:

| Setting | Value |
|---|---|
| Salt read | One `GetSecretValue` of `prod/submit/user-sub-hash-salt` from the SSO admin session. It fires `env-salt-secret-unexpected-read` and opens an alarm issue; close it after the run with the run's date and "donor-usage run" as the evidence. |
| What counts as a donation | Donations only: Stripe charges from the spreadsheets site's donation Payment Links, and PayPal donation receipts. Submit subscriptions and pass purchases are excluded. |
| Detail per matched person | Name, email, donation dates and totals, account creation date, submission kinds with counts and first and last dates. |
| Match rule | Email or name: a case-insensitive exact email match, or a normalised full-name match (lower case, whitespace collapsed, titles dropped). Say which rule matched on every row. |

## Sources

Everything is read-only except the salt read above. Never run a DynamoDB `Scan` on a prod
customer table.

| What | Where | How |
|---|---|---|
| Stripe donations | Stripe live account | the live key the way `scripts/finance/stripe-stage.js` reads it (`infra/stripe/stripe.toml` `[keys.prod].live`, resolved in Secrets Manager with `AWS_PROFILE=submit-prod`); list charges since the window start; a donation is a charge from a Payment Link listed in `stripe.toml` or carrying a donation `metadata.bundleId` (the same rule as `app/functions/analytics/stripeReconcile.js`); name and email from `billing_details`, falling back to the customer object |
| PayPal donations | PayPal API | `scripts/finance/paypal-stage.js` for each month since the window start, or the transaction search it wraps (`app/services/paypalTransactionSearch.js`); a donation is a completed receipt that `app/services/paypalTransactions.js` classes as a sale, not a transfer or conversion; name and email from `payer_info` |
| Accounts | Cognito `prod-env-user-pool` | `aws cognito-idp list-users` (paginated): `sub`, `email`, `name`, `given_name`, `family_name`, `UserCreateDate`; drop `synthetic-*@test.diyaccounting.co.uk` and every other `@test.diyaccounting.co.uk` user |
| Hash | `app/services/subHasher.js` | load the salt registry once with `USER_SUB_HASH_SALT` set from the secret in the glue process's environment, never echoed or written; hash each matched `sub` with `hashSub` (and `hashSubWithVersion` for every version in the registry, since older rows carry older versions) |
| VAT returns, from 2026-02-21 | DynamoDB `prod-env-receipts` | `Query` on `hashedSub` per matched user (key schema `hashedSub` + `receiptId`); count, first and last date |
| Other submissions, from 2026-08-29 | Athena `prod_env_analytics.activity_events` (workgroup `prod-env-analytics`, partition `dt`) | one query over the matched hashes with a `dt` filter from the first partition; events: `vat-return-submitted`, every `itsa-*-created`, `-amended`, `-filed` and `-submitted` event, and the Companies House filing events (list them with `grep -rhoE '"[a-z-]+-(filed|submitted)"' app/functions` before the query); also the usage events (sign-in, pass redeemed, obligations viewed) as "used, did not submit"; state bytes scanned |

## Window

From 2026-02-21, when the current prod account, user pool and receipts table were created.
Donations before then are still listed, but they only match an account in this pool. The
activity lake starts on its first `dt` partition
(`aws s3 ls s3://prod-env-analytics-lake-972912397388/curated/activity-events/`), 2026-08-29 at
the first run; earlier use shows only through the receipts table, which carries VAT returns.

## The file

```markdown
<!-- private: donor-usage run <date>, not for any repository -->
# Donors and submit usage, <window start> to <date>

<one line: donors, donors with an account, donors who submitted, donors who used without submitting>

| Name | Email | Matched by | Donations | First / last donation | Account since | VAT returns (since 2026-02-21) | Other submissions (since <lake start>) | Used, no submission |

## Possible matches not counted
<pairs where only part of the name matches, or the same name appears twice>

## Coverage
<window per source, counts read per source, Athena bytes scanned, what the lake and the receipts table cannot see>
```

`chmod 600` the file. Then delete the scratchpad glue and any staged personal data it wrote.

## After the run

1. Close the `env-salt-secret-unexpected-read` alarm issue the salt read opened, naming this
   run. If no issue opened, say so.
2. Reply with the file path and the one-line counts only. No names or emails in the reply.
