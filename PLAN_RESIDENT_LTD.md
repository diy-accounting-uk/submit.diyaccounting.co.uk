<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Resident Ltd, and Resident Pro as an aggregation of bundles

## Operator assertions (verbatim, 2026-11-03)

> add resident-ltd as a product with just the three Companies House activities for now (and later
> we'll add the HMRC CT600 in there too but that's not ready for prod yet) [...] and you have a go
> to launch resident-ltd unhidden when implemented.

> £0.99/mo and add a £9.99/yr for resident-ltd and resident-vat and colapse resident and
> resident-pro into 1 resident-pro for which we'll extend the catalogue approach to include
> agregations of bundles so resident-pro can be defined interms of the superset of resident-ltd and
> resident-vat and labelled with a strap line "Submit VAT returns to HMRC and Accounts to Companies
> House. £39.99/yr / £3.99/mo, cancel anytime." (also note pricing)

The go covers the live Stripe writes: the bundle products and prices, and the £61.35
confirmation statement fee price (OCS11b, a separate board row because it does not wait on RL2).

## Target catalogue

| Bundle | Activities | Prices | Prod |
|---|---|---|---|
| resident-vat | VAT (as today) | £0.99/month (as today), £9.99/year (new) | listed |
| resident-ltd (new) | `file-micro-entity-accounts`, `file-small-company-accounts`, `file-confirmation-statement`; the CT600 joins when UH7 lands | £0.99/month, £9.99/year | listed |
| resident-pro | the superset of resident-ltd and resident-vat, by aggregation | £39.99/year, £3.99/month | listed when its parts are |
| resident | folded into resident-pro | — | — |

Resident Pro's strap line: "Submit VAT returns to HMRC and Accounts to Companies House. £39.99/yr /
£3.99/mo, cancel anytime."

## Tasks

| Id | What | Model | Blocked by |
|---|---|---|---|
| RL1 | Design: bundle aggregation in the catalogue (`includes = [...]` or equivalent), the resolution of an aggregate's activities, entitlements and token grants, the fold of `resident` into `resident-pro` across every reference (activities' `bundles`, passes, `resident-guest`, `resident-pro-comp`, practice licence, MCP, FAQ, videos, tests), the Stripe products and prices, and the open questions | Opus | — |
| RL2 | Build RL1's design with resident-ltd listed on prod and the three Companies House activities unhidden (UH4) | Sonnet | RL1 |
| RL3 | Stripe: test then live for resident-ltd's two prices, resident-vat's year price, resident-pro's and resident-tax-agent's prices, with `stripe-catalogue-sync`; the price ids landed | Haiku | RL2 |
