---
name: donor-usage
description: List everyone who donated through Stripe or PayPal, subscribed to submit, holds a prod submit account, or submitted anything, as one union with a flag per set, with each person's donations, account date and submissions (VAT returns since 2026-02-21, every other submission kind since the activity lake's first day), into a private file at the workspace root. Read-only apart from one salt read the operator accepts. Invoke when the operator asks which donors use submit, whether donors file, who the users and donors are, or for the donor-to-usage cross reference.
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
| Shape | The union, never the intersection: one row per person who is a donor, a subscriber, a non-test prod account holder, or a submitter, with a flag per set. A submitter seen only as a lake hash with no account match is an "unknown account" row keyed by the hash's first 8 characters. |
| Detail per row | Name, email, donation dates and totals, account creation date, submission kinds with counts and first and last dates. |
| Merge rule | Email or name: rows from different sources merge on a case-insensitive exact email match, or a normalised full-name match (lower case, whitespace collapsed, titles dropped). Say which rule merged every row. |

## Sources

Everything is read-only except the salt read above. Never run a DynamoDB `Scan` on a prod
customer table.

| What | Where | How |
|---|---|---|
| Stripe donations | Stripe live account | the live key the way `scripts/finance/stripe-stage.js` reads it (`infra/stripe/stripe.toml` `[keys.prod].live`, Secrets Manager in `eu-west-2`, `AWS_PROFILE=submit-prod`); list every succeeded charge since the window start (`autoPagingToArray` takes `limit` up to 10000); a donation is a charge whose checkout session (`checkout.sessions.list({ payment_intent })`) has a `payment_link` that is a donation link: resolve each `plink_…` id with `paymentLinks.list` (active and inactive) and match its URL to a `[[payment_link]]` in `stripe.toml`, or its `payment_intent_data.metadata.bundleId` starting `donation-`; `metadata.bundleId` on the charge itself is unreliable (4 of 105 at the first full run); a charge with no payment link is a submit subscription; name and email from `billing_details`, falling back to the customer object; a part refund shows net |
| PayPal donations | PayPal API | the transaction search `scripts/finance/paypal-stage.js` wraps (`app/services/paypalTransactionSearch.js`), every event code since the window start; a donation is `T0013` with status `S` (each carries the donation button's item text); `T0002` (an accounts-product payment), `T0011` (check the payer: the operator's own transfer is not a donation) and funding, transfer, cashback, conversion and payment-out codes are not; name and email from `payer_info` |
| Subscribers | Stripe live account, and DynamoDB `prod-env-bundles` | `subscriptions.list({ status: "all" })` with the customer expanded, every subscription created or active since the window start: customer email and name, product and price (resolve the bundle through `stripe.toml`), status, start, cancel or end date, charges paid and total (the subscription charges set aside from the donation rule); then, per account hash and salt version, `Query` `prod-env-bundles` (key `hashedSub` + `bundleId`) for the paid bundles the account holds now and their expiry; PayPal `T0002` accounts-product payments are purchases, listed with the subscriber columns and marked as such |
| Accounts | Cognito `prod-env-user-pool` | `aws cognito-idp list-users` (it paginates itself; no `--max-items` with `--no-paginate`): `sub`, `email`, `name`, `given_name`, `family_name`, `UserCreateDate`; drop every `@test.diyaccounting.co.uk` user |
| Hash | `app/services/subHasher.js` | load the salt registry once with `USER_SUB_HASH_SALT` set from the secret in the glue process's environment, never echoed or written; hash every non-test account's `sub` with `hashSub` (and `hashSubWithVersion` for every version in the registry, since older rows carry older versions); then hash every account and count how many of the lake's distinct `hashed_sub` values match, per version, as a standing check (22 of 48 under v2 at the first full run) |
| VAT returns, from 2026-02-21 | DynamoDB `prod-env-receipts` | `Query` on `hashedSub` per account and per salt version (key schema `hashedSub` + `receiptId`; each item carries `saltVersion` and `createdAt`, the submission time); count, first and last `createdAt` |
| Other submissions, from 2026-08-29 | Athena `prod_env_analytics.activity_events` (workgroup `prod-env-analytics`, partition `dt`) | one query grouped by `hashed_sub, actor, event` over every row with `hashed_sub IS NOT NULL` and `dt >= DATE '<lake start>'` (`dt` is a DATE; a string literal fails with TYPE_MISMATCH); submission events: `vat-return-submitted` and the `itsa-*` and `companies-house-*` events ending `-created`, `-amended`, `-filed` or `-submitted` (`grep -rhoE '"(itsa|companies-house)-[a-z-]+-(created|amended|filed|submitted)"' app/functions`); count `actor = 'test-user'` events on a real account's hash apart from `customer` and `system` (probes and captures sign in as test users); usage events (sign-in, pass redeemed, obligations viewed) mark "used, did not submit"; a submitting hash with no account is an unknown-account row; state bytes scanned |

## Reconcile before matching

Each payment source is checked against the operator's mail and statements, and the counts go in
the file's Coverage section. Nothing unclassified is dropped; it is listed for the operator.

- **Stripe:** parse the original "Payment of £… for DIY Accounting Limited" notifications in
  `../mail/antony@diyaccounting.co.uk/2026/*/*/*.eml` (month and day directories are not
  zero-padded) for their `pi_…` ids; the bodies carry the amount and id only, no name or email.
  Report API charges, mail notices, matched one to one, mail only, API only, donations,
  subscriptions, unclassified.
- **PayPal:** the original notices from `service@paypal.co.uk` in both mailboxes (antony@ and
  support@; transaction ids in the body; replies add nothing), and the statement PDFs in
  `../drive/DIY Accounting Limited/finance/<year> accounts/paypal/` (`pdftotext -layout`; 2025-2026
  for February and March, 2026-2027 from March). Report API transactions by event code, mail
  notices matched, statement lines matched, and months with no statement yet.

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

<one line per set and per overlap: people, donors, subscribers, accounts, submitters; every non-empty combination of the four, and unknown-account submitters>

| Name | Emails | Donor (source, payments, total, first / last) | Subscriber (bundle, status, start / end, paid) | Account since (bundles held now) | VAT returns (since 2026-02-21) | Other submissions (since <lake start>) | Used, no submission | Merged by |

## Possible matches not merged
<pairs where only part of the name matches, or the same name appears twice>

## Coverage
<window per source; the Stripe and PayPal reconciliation counts; subscriptions by status and bundle; the statement check; the lake hash check; Athena bytes scanned; test-actor submissions on real accounts; what the lake and the receipts table cannot see>
```

Rows merge by email, then by normalised full name (lower case, whitespace collapsed, titles
dropped, two or more tokens). `chmod 600` the file. Then delete the scratchpad glue and any staged
personal data it wrote.

## After the run

1. Close the `[ALARM] prod-env-salt-secret-unexpected-read` issue the salt read opened (it
   appears about a minute after the read), naming this run. If none opens within ten minutes,
   say so.
2. Reply with the file path and the one-line counts only. No names or emails in the reply.
