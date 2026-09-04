---
name: stripe-catalogue-sync
description: Sync the Stripe products and prices from the bundle catalogue, in test then live, and land the price ids. Invoke when a bundle's price changes or a new on-subscription bundle needs a Stripe product.
---

# stripe-catalogue-sync — sync Stripe products and prices from the catalogue

`web/public/submit.catalogue.toml` is the source of truth for what each on-subscription
bundle costs. `scripts/stripe-setup.js` reads it and creates or finds the matching Stripe
product and price for every bundle carrying `stripePriceAmount`, `stripeCurrency` and
`stripeInterval`. This skill runs that script safely: dry run first, test mode on a "go",
live mode on its own separate "go", then land the printed price ids in the env files.

## Prerequisites

```bash
aws sso login --sso-session diyaccounting
npm ci
```

## Step 1 — dry run in test mode

Fetch the test secret key into the environment of a single command, so it never lands in
a shell history file or a log:

```bash
STRIPE_SECRET_KEY="$(aws --profile submit-ci secretsmanager get-secret-value --secret-id ci/submit/stripe/test_secret_key --query SecretString --output text)" node scripts/stripe-setup.js --dry-run --products-only
```

Reading the secret is a read-only AWS call. The dry run only searches and lists in Stripe
— it writes nothing. Show the operator this output before doing anything else: which
products and prices already exist, and which ones the script would create.

## Step 2 — test mode, for real

Test mode may run on a "go" from the operator once they have seen the dry-run plan. Drop
`--dry-run`:

```bash
STRIPE_SECRET_KEY="$(aws --profile submit-ci secretsmanager get-secret-value --secret-id ci/submit/stripe/test_secret_key --query SecretString --output text)" node scripts/stripe-setup.js --products-only
```

Capture the printed `STRIPE_TEST_PRICE_ID_<BUNDLE>=price_…` lines. Never print or commit
the key itself — only the price ids the script reports.

## Step 3 — dry run, then live

Live mode needs its own separate explicit "go" from the operator, per this repo's confirm
rule (`CLAUDE.md`) — the test-mode "go" does not cover it. Dry run first:

```bash
STRIPE_SECRET_KEY="$(aws --profile submit-prod secretsmanager get-secret-value --secret-id prod/submit/stripe/secret_key --query SecretString --output text)" node scripts/stripe-setup.js --dry-run --products-only
```

Show the plan, wait for the live "go", then run it without `--dry-run`. Capture the
printed `STRIPE_PRICE_ID_<BUNDLE>=price_…` lines.

## Step 4 — land the price ids

Write the price ids into `.env.ci` and `.env.prod`, matching how `STRIPE_PRICE_ID_RESIDENT_VAT`
and `STRIPE_TEST_PRICE_ID_RESIDENT_VAT` are already recorded there: `.env.ci` gets both the
`STRIPE_TEST_PRICE_ID_*` line (from step 2) and a `STRIPE_PRICE_ID_*` line — ci only ever
runs in Stripe test mode, so both lines carry the same test price id, matching the
existing rows. `.env.prod` gets the `STRIPE_PRICE_ID_*` line from step 3's live run and the
`STRIPE_TEST_PRICE_ID_*` line from step 2's test run, again matching the existing rows.

Open a `claude/*` branch PR carrying only the `.env.ci` / `.env.prod` changes. Never commit
a key — only price ids, which are not secret.

## A bundle whose price already exists but differs

`scripts/stripe-setup.js` finds a product by `metadata.bundleId` and then looks for an
active recurring price on it matching the exact amount, currency and interval the
catalogue asks for. If the catalogue's numbers changed, no existing price matches, so the
script creates a new price and leaves the old one active. Existing subscriptions keep
billing at the old price until they are moved to the new one; only new checkouts pick up
the new price id. Tell the operator this happened and let them decide whether to migrate
existing subscribers.

## Useful flags

- `--dry-run` — search and list only, no writes.
- `--products-only` — skip the webhook endpoints, sync products and prices only.
- `--bundle <id>` — limit the run to one bundle, useful when only one price changed.
