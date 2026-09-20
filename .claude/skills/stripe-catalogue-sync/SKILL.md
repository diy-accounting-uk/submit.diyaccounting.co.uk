---
name: stripe-catalogue-sync
description: Sync the Stripe products and prices from the bundle catalogue, in test then live, and land the price ids. Invoke when a bundle's price changes or a new on-subscription bundle needs a Stripe product.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# stripe-catalogue-sync — sync Stripe products and prices from the catalogue

`web/public/submit.catalogue.toml` is the source of truth for what each on-subscription
bundle costs. `infra/stripe/stripe-sync.js` reads it and creates or finds the matching
Stripe product and price for every bundle carrying `stripePriceAmount`, `stripeCurrency`
and `stripeInterval`. It plans by default; `--apply` makes the change. This skill runs it
safely: plan first, test mode on a "go", live mode on its own separate "go".

## Prerequisites

```bash
aws sso login --sso-session diyaccounting
npm ci
```

## Step 1 — plan in test mode

```bash
node infra/stripe/stripe-sync.js --environment ci --mode test --products-only
```

The account API key comes from Secrets Manager (`ci/submit/stripe/test_secret_key`), read
by the script itself — no key ever passes through this shell. Planning only searches and
lists in Stripe: it writes nothing. Show the operator this output before doing anything
else: which products and prices already exist, and which ones the script would create.

## Step 2 — test mode, for real

Test mode may run on a "go" from the operator once they have seen the plan:

```bash
node infra/stripe/stripe-sync.js --environment ci --mode test --apply --products-only
```

A new price's id is written straight into `.env.ci` and `.env.prod` by the script -
nothing to copy by hand. Confirm with `git diff .env.ci .env.prod`.

## Step 3 — plan, then live

Live mode needs its own separate explicit "go" from the operator, per this repo's confirm
rule (`CLAUDE.md`) — the test-mode "go" does not cover it. Plan first:

```bash
node infra/stripe/stripe-sync.js --environment prod --mode live --products-only
```

Show the plan, wait for the live "go", then apply:

```bash
node infra/stripe/stripe-sync.js --environment prod --mode live --apply --products-only
```

A new live price's id is written into `.env.prod`, again by the script.

## Landing the change

Open a `claude/*` branch PR carrying only the `.env.ci` / `.env.prod` changes `git diff`
shows. Never commit a key — only price ids, which are not secret.

## A bundle whose price already exists but differs

`stripe-sync.js` finds a product by `metadata.bundleId` and then looks for an active
recurring price on it matching the exact amount, currency and interval the catalogue asks
for. If the catalogue's numbers changed, no existing price matches, so the script creates a
new price and leaves the old one active. Existing subscriptions keep billing at the old
price until they are moved to the new one; only new checkouts pick up the new price id.
Tell the operator this happened and let them decide whether to migrate existing
subscribers.

## Useful flags

- `--mode <test|live>` — required; which Stripe account API key to read from Secrets Manager.
- `--apply` — make the change; without it, the run only plans.
- `--products-only` — skip the webhook endpoints, sync products and prices only.
- `--bundle <id>` — limit the run to one bundle, useful when only one price changed.
