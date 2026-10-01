---
name: donor-usage
description: List everyone who donated through Stripe or PayPal, holds a prod submit account, or submitted anything, as one union with a flag per set, with each person's donations, account date and submissions (VAT returns since 2026-02-21, every other submission kind since the activity lake's first day), into a private file at the workspace root. Read-only apart from one salt read the operator accepts. Invoke when the operator asks which donors use submit, whether donors file, who the users and donors are, or for the donor-to-usage cross reference.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# donor-usage

Joins payment identity to usage, which is personal data. The result goes to one file at the
workspace root, `../DONOR_USAGE_<YYYY-MM-DD>.md` (the root is not a repository and only the
operator reads it), mode `600`. Nothing personal goes into this repository, a commit, a PR, an
issue, a log line in chat, or the scratchpad beyond the run's own glue. Glue code lives in the
session scratchpad and is deleted at the end of the run; symlink the repository's `node_modules`
into the glue directory (`ln -sfn`), or the glue cannot import `stripe` or the AWS SDK.

## Operator's settings

Set by the operator before the first run; re-ask only if they say they changed:

| Setting | Value |
|---|---|
| Salt read | One `GetSecretValue` of `prod/submit/user-sub-hash-salt` from the SSO admin session. It fires `env-salt-secret-unexpected-read` and opens an alarm issue; close it after the run with the run's date and "donor-usage run" as the evidence. |
| What counts as a donation | Donations only: Stripe charges from the spreadsheets site's donation Payment Links, and PayPal donation receipts. Submit subscriptions and pass purchases are excluded. |
| Shape | The union, never the intersection: one row per person who is a donor, a non-test prod account holder, or a submitter, with a flag per set. A submitter seen only as a lake hash with no account match is an "unknown account" row keyed by the hash's first 8 characters. |
| Detail per row | Name, email, donation dates and totals, account creation date, submission kinds with counts and first and last dates. |
| Merge rule | Email or name: rows from different sources merge on a case-insensitive exact email match, or a normalised full-name match (lower case, whitespace collapsed, titles dropped). Say which rule merged every row. |

## Sources

Everything is read-only except the salt read above. Never run a DynamoDB `Scan` on a prod
customer table.

| What | Where | How |
|---|---|---|
| Stripe donations | Stripe live account | the live key the way `scripts/finance/stripe-stage.js` reads it (`infra/stripe/stripe.toml` `[keys.prod].live`, resolved in Secrets Manager with `AWS_PROFILE=submit-prod`); list charges since the window start (`autoPagingToArray` takes `limit` up to 10000); a donation is a charge whose `metadata.bundleId` starts `donation-`, or, for older charges, whose checkout session's `payment_link` is a donation link in `stripe.toml` (the same rule as `app/functions/analytics/stripeReconcile.js`); name and email from `billing_details`, falling back to the customer object |
| PayPal donations | PayPal API | `scripts/finance/paypal-stage.js` for each month since the window start, or the transaction search it wraps (`app/services/paypalTransactionSearch.js`); a donation is a positive transaction with event code `T0013` and status `S`; `T0002` (an accounts-product payment) and `T0011` are not donations, and `T0003` and `T0006` are payments out; name and email from `payer_info` |
| Accounts | Cognito `prod-env-user-pool` | `aws cognito-idp list-users` (paginated): `sub`, `email`, `name`, `given_name`, `family_name`, `UserCreateDate`; drop `synthetic-*@test.diyaccounting.co.uk` and every other `@test.diyaccounting.co.uk` user |
| Hash | `app/services/subHasher.js` | load the salt registry once with `USER_SUB_HASH_SALT` set from the secret in the glue process's environment, never echoed or written; hash every non-test account's `sub` with `hashSub` (and `hashSubWithVersion` for every version in the registry, since older rows carry older versions) |
| VAT returns, from 2026-02-21 | DynamoDB `prod-env-receipts` | `Query` on `hashedSub` per account and per salt version (key schema `hashedSub` + `receiptId`; each item carries `saltVersion` and `createdAt`, the submission time); count, first and last `createdAt` |
| Other submissions, from 2026-08-29 | Athena `prod_env_analytics.activity_events` (workgroup `prod-env-analytics`, partition `dt`) | one query over every hash, grouped by `hashed_sub`, with `dt >= DATE '<lake start>'` (`dt` is a DATE; a string literal fails with TYPE_MISMATCH); submission events: `vat-return-submitted`, and the `itsa-*` and `companies-house-*` events ending `-created`, `-amended`, `-filed` or `-submitted` (list them with `grep -rhoE '"(itsa|companies-house)-[a-z-]+-(created|amended|filed|submitted)"' app/functions`; a wider grep also catches `checkout-session-created` and `dispute-created`); also the usage events (sign-in, pass redeemed, obligations viewed) as "used, did not submit"; state bytes scanned |

## Window

From 2026-02-21, when the current prod account, user pool and receipts table were created.
Donations before then are still listed, but they only match an account in this pool. The
activity lake starts on its first `dt` partition
(`aws s3 ls s3://prod-env-analytics-lake-972912397388/curated/activity-events/`), 2026-08-29 at
the first run; earlier use shows only through the receipts table, which carries VAT returns.

## The file

```markdown
<!-- private: donor-usage run <date>, not for any repository -->
# Donors, accounts and submitters, <window start> to <date>

<one line per set and per overlap: donors, accounts, submitters; donor only, account only, donor and account, account and submitted, all three, unknown-account submitters>

| Name | Email | Donor | Account | Submitter | Merged by | Donations | First / last donation | Account since | VAT returns (since 2026-02-21) | Other submissions (since <lake start>) | Used, no submission |

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
