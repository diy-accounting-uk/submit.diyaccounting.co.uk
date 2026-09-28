<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: open banking bank feeds for diya-gl

## Operator assertion (verbatim, 2026-09-28)

> I want to exclude a fixed cost until we have revenue substanially above their costs. At this point
> I think 200 GBP / month to too high for speculative channel. I would go for anything usage based
> but even Finexer is to high without a paid subscription at £0.20–£0.30 per transaction. I think
> this means openbanking integration is not a sensible option until we have enough profit to
> justify the fixed cost model. Please pull the openbanking integration and anything that depends
> upon it out of NEXT.md and BACKLOG.md and in to a separate PLAN_OPEN_BANKING.md

## When this plan starts

No work runs from this plan until diya-gl and Submit make enough profit to carry an aggregator's
cost well above that cost: a fixed monthly fee (the aggregators' quotes and estimates run from
about £150 to £500 a month, Plaid's UK plan about $500 a month on an annual commitment) or a
usage fee (about £0.20 to £0.30 per transaction). The profit figure comes from the dashboard's
cost and revenue panels and `PLAN_MARKETING_STRATEGY.md`'s spend pool. Until then diya-gl reads the
CSV each bank already exports (`PLAN_MARKETING_STRATEGY.md` §3.7 rank 5, task MK-33), which needs
no permission and costs nothing.

When it starts, the first task is OB-1.

## Tasks

| Id | Change | Kind | Files | Model |
| --- | --- | --- | --- | --- |
| OB-1 | Send the enquiry below to the two aggregators whose price then fits (re-check the table first: prices, coverage and the agent model change); record the terms, price and agent model here; a regulatory adviser only if the terms leave diya-gl carrying the regulated activity | human-driven | 0 | none |
| OB-2 | On OB-1's terms, a "connect your bank" opt-in on the DIYA-GL page for Tide, Starling and Revolut Business (the aggregator's consent flow, or the customer's own Starling token or Revolut certificate where the terms allow), transactions into diya-gl bank lines through MCP-10's line builder; then the Starling Marketplace, Tide and Revolut integration listings (SS-27, MCP-10) | machine-ask | ~10 | Opus |

## Integration and listing candidates (from the marketing plan's §3.7)

| Rank | Partner | What the integration takes | Listing and link |
| --- | --- | --- | --- |
| 1 | Starling Marketplace | An integration on Starling's partner API, vetted by Starling; a live account connection, so the regulatory line applies; the customer-token route is the first cut | Public partner page on starlingbank.com |
| 2 | Tide accounting integrations, Revolut Business integrations hub, then Wise Business App Marketplace and Monzo | Bank feeds through the bank's API or the aggregator OB-1 chooses; curated lists; the regulatory line applies | Public integration pages on each bank's domain |
| 3 | Open banking aggregators: TrueLayer, Yapily, Plaid, Moneyhub, Finexer | Supplier contracts, sales-led; a listing only as a customer case study | A backlink only with a case study |

Starling and Revolut Business are the bank-customer audiences that fit `resident` best; they carry
the regulatory cost below.

## The research (read 2026-09-28)

The regulatory line. Pulling a customer's bank transactions through open banking is an account
information service. The usual pattern for a small UK accounting app is to work through an
FCA-authorised aggregator as its agent or under its permissions, so the aggregator carries the
regulated activity: August runs as an agent of Plaid Financial Ltd, and Emma runs live on Yapily's
own AIS and PIS permissions. Larger products register as an AISP themselves, as FreeAgent did. Our
own registration costs an FCA application fee in the hundreds of pounds and six months to a year;
agent registration is quicker and the FCA application itself is free with both Plaid and Yapily,
but neither publishes a production price. Plaid confines EU/UK customers to a custom-quoted plan
gated behind its paid Scale tier and an annual minimum spend, so "no upfront cost" covers only the
FCA paperwork, not the platform access under it; Yapily's pricing is sales-led throughout. One
unverified third-party estimate puts a realistic production floor near £150 to £500 a month for
either, in line with this plan's earlier reading. GoCardless Bank Account Data, once the free
route, closed to new accounts in July 2025 — Firefly III and Actual Budget's own bank-sync docs
now point self-hosters at Enable Banking instead, but Enable Banking's free "restricted
production" covers only accounts the developer links to their own name, not customer accounts at
volume, and no agent or partner model surfaced for it. Finexer publishes a self-serve sandbox and
a discounted pre-revenue startup rate, but one of Finexer's own blog posts says its coverage
excludes Starling, Tide and Monzo Business while its own bank-coverage page lists all three — a
contradiction this research could not resolve, so Finexer stays the fallback, not a first ask. So
the first step is to ask two aggregators for their agent and partner terms and
price (OB-1); a regulatory adviser is engaged only if those terms leave diya-gl carrying the
regulated activity. Against a £100 a month cost base, a live bank feed waits for profit to cover
it. Reading the CSV a bank already exports needs no permission and is what the free rung does
today.

Comparison, from the published pages and the first-hand or reported experience found (read
2026-09-28).

| Aggregator | UK coverage of Tide / Starling / Revolut Business | Agent model and regulated party | Price at our volume | Minimum and onboarding | Reported experience |
| --- | --- | --- | --- | --- | --- |
| Plaid | All three listed among its UK/EU institutions; no separate confirmation that the Business tiers specifically are production-tested | Agent of Plaid's own FCA AIS permission; Plaid carries the regulated activity; FCA review about two months, "much faster" in some cases | EU/UK: custom quote only, no self-serve tier; one blog's unverified estimate is $0.30–$1 per connected account a month | FCA agent application is free; access still requires Plaid's paid Scale plan with an annual minimum spend; Sandbox is free and unlimited | Capterra 4.3/5 (69 reviews); syncs reported to break on smaller banks; August is a live, accounting-adjacent firm running as a Plaid agent |
| Yapily | All three named among ~2,000 covered institutions; markets itself as the only vendor to have tested and fixed business-account connectivity | Agent under Yapily's own AIS and PIS permission as principal; UK-first | No published figures; one blog's unverified estimate is £200–£500 a month at entry production | Sales-led from first contact; no published minimum term or self-serve production tier | G2 4.2/5 (3 reviews, thin sample); Emma (11M+ UK open-banking users) reports 267% month-on-month transaction growth after integrating, though as a personal finance app, not a bookkeeping product |
| Finexer | Lists all three on its coverage page, but a separate Finexer blog post says coverage excludes Starling, Tide and Monzo Business — unresolved by this research | Finexer is FCA-authorised itself and advertises "agent licensing"; no detail found on how the regulated activity splits with an agent | Usage-based, tiered Startup/Standard/Enterprise; discounted pre-revenue startup rate; no published £ figures | No minimum stated; free sandbox, the only one of the four with self-serve production sign-up | No independent reviews found; nearly all available content is Finexer's own comparison blog, which was this plan's main prior source |
| TrueLayer | Reported strong UK/IE coverage; Stripe's UK Pay-by-Bank partner | TrueLayer is FCA-authorised (FRN 901096) and carries the regulated activity; partner programme is "talk to us" | No rate card; one blog's unverified historic estimate is £150–£300 a month at a starter tier | Sales-gated from the first contact; free Development/sandbox tier | No first-hand small-firm account found; repeatedly described as built for funded or larger teams |
| Enable Banking | Not independently confirmed for this research (coverage and pricing pages returned errors); described by indie-developer blogs as the default post-GoCardless option | No agent or partner model found; production access for customer accounts needs Enable Banking's own paid licence | Per connected account per month, quote-based; no published figures | Free tier is "Restricted Production" for accounts the developer links to their own name only, not customer accounts at volume | Praised in indie-developer blogs as GoCardless Bank Account Data's free-tier replacement, but only at that self-linked scale |

The institutions the operator named, and the two payment platforms diya-gl already reads.

| Institution | Aggregators for account information today | Direct route without an aggregator | Lists integrations and links back | diya-gl today, and the gap |
| --- | --- | --- | --- | --- |
| Starling (personal and business) | The UK aggregators list it: TrueLayer, Yapily, Plaid, Finexer, Moneyhub; GoCardless Bank Account Data for accounts opened before July 2025 | Yes. Starling's developer portal issues a customer a personal access token for their own account (`account:read`, `transaction:read`), scanned from the Starling app. Used by the customer on their own data it is the customer's own access; if we hold the token and pull on their behalf it becomes account information and the regulatory line applies. Partner integrations on Starling's partner API are vetted and need the same answer | Yes: the Business Marketplace, a public partner page per integration on starlingbank.com | CSV import (MK-33). Gap: the token route as an opt-in "connect your Starling account" on the DIYA-GL page, after Q9's terms |
| Tide (business only) | The same aggregators; Tide's own open banking API is for FCA-authorised TPPs, with a public sandbox any developer can use | No customer-token route; production API access needs FCA authorisation or an aggregator. Tide's accounting integrations (Xero, QuickBooks, Sage, FreeAgent, KashFlow, Crunch, ClearBooks) are bank-feed connections Tide built | Yes: Tide's accounting integrations pages name each product and link to it | CSV import (MK-33). Gap: a feed only through an aggregator |
| Revolut Business (and personal Revolut) | The same aggregators; Revolut's open banking API for TPPs | Yes for Business: the Business API on Grow, Scale and Enterprise plans, authorised by the customer's own certificate and access token, reads accounts and transactions. The customer's own access when they run it; account information if we hold the credentials | Yes: the Business Integrations hub lists apps with links; custom integrations through the Business API | CSV import (MK-33). Gap: a "connect Revolut Business" opt-in on the customer's own API certificate, after Q9's terms |
| PayPal | Not open banking; no aggregator needed | Yes: the Transaction Search API with the merchant's own app credentials; the customer's own access | Partner Directory needs Gold partner status | Read today for the company's own account (DATA-48). Gap: the same pull for a customer's PayPal account, with their credentials, from the DIYA-GL page |
| Stripe | Not open banking; no aggregator needed | Yes: the Stripe API with the account holder's own restricted key, or a Stripe App the customer installs; the customer's own access | Yes: App Marketplace and Partner Directory pages link out | Read today for the company's own account (DATA-49, DATA-51). Gap: the Stripe App (MK-35) that does it for any Stripe account |

The two aggregators to ask first stay Plaid and Yapily, on sharper grounds than before. Yapily:
UK-first, names Tide, Starling and Revolut among its covered institutions, onboards partners as
agents under its own AIS and PIS permissions as principal, and is the only one of the four to
claim it has tested and fixed business-account connectivity specifically — the exact gap for Tide,
Starling and Revolut Business. Its only production-scale reference found is Emma, a personal
finance app rather than a bookkeeping product, and its pricing is sales-led with no published
figure. Plaid: agent registration is free and the FCA review runs about two months against six
months to a year for direct authorisation, and August is a live, accounting-adjacent comparable
running as a Plaid agent — but EU/UK customers get no self-serve production tier, and the agent
route sits behind Plaid's paid Scale plan and an annual minimum spend, so the zero-cost claim
covers only the FCA paperwork. Finexer stays the fallback if both price too high: it is the
only one of the four with a published self-serve sandbox and a discounted pre-revenue startup
rate, but its own blog contradicts its own coverage page on whether Starling, Tide and Monzo
Business are supported, so a Finexer quote needs that resolved in writing before it counts as a
real option. TrueLayer stays out of the first ask, sales-led and built for funded or larger teams,
with no first-hand small-firm account found. Enable Banking, checked new for this pass, does not
fit: its free tier covers only accounts the developer links to their own name, and no agent or
partner model surfaced for serving customer accounts at diya-gl's scale. GoCardless Bank Account
Data, once free for up to 50 connected banks a month, closed to new accounts in July 2025 and is
not an option.

Enquiry text, from the operator's address (OB-1), one message to each:

> DIY Accounting Limited runs diya-gl (diya-gl.co.uk), a free bookkeeping engine for UK sole
> traders, landlords and small companies, with a paid cloud store at £39 a year. We want to let a
> signed-in customer connect their Tide, Starling or Revolut Business account so that their own
> transactions appear in their own book. We expect tens of connected accounts in the first year
> and a few hundred in the second. Please send: your partner or agent terms for a firm of our size,
> including whether we would act as your agent under your FCA permissions or you would carry the
> account information service; your price at that volume (per connected account, per data pull, or
> monthly minimum), and any paid platform tier or minimum spend required to hold agent or partner
> status, separate from any FCA application fee; confirmation that Tide, Starling and Revolut
> Business are production-tested for business accounts specifically, not just personal accounts,
> and their transaction history depth; how a customer's 90-day open banking re-consent works in
> your flow and what, if anything, breaks an unattended sync; and any minimum term.

Sources: `PLAN_MARKETING_STRATEGY.md` §3.7's source list (aggregator pricing, coverage, agent
models, the 90-day re-consent rule, reviews).
