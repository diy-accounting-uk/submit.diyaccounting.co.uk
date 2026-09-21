<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: one Resident price, annual by default, a practice licence, a 35-day sandbox

> Started 2026-09-21 from the spreadsheets session's review of the DIYA-GL business model
> (`../spreadsheets.diyaccounting.co.uk/PLAN_DIYA_GL_LAUNCH.md` §3 and §5,
> `../spreadsheets.diyaccounting.co.uk/_developers/archive/PLAN_DIYA_GL_HOME.md` §(c) and §(d), `web/public/submit.catalogue.toml`).

## User assertions (verbatim)

1. (2026-09-21) "I would like to keep resident VAT at 0.99 we have 4 actual subscribers at this
   price. Later we may close resident-VAT to new business but there's no rush."
2. (2026-09-21) Yes to: "One Resident price, annual, filing included. Collapse the four 99p SKUs
   into one: books + VAT + ITSA + Ltd filing as each is recognised, £39/year (or £3.99/month). Same
   200–500 subscribers gives £7.8k–£19.5k a year; fee share on £39 is about 2.3%; annual billing
   removes monthly churn. Sole traders think in tax years, so the price shape matches the buyer."
3. (2026-09-21) "we'll include diy's s3 in the One Resident bundle" alongside Google Drive storage
   (the storage half lives in `PLAN_DIYA_GL_LAUNCH.md` LP-24).
4. (2026-09-21) "add a task for this with the 25 day expiry": the sandbox retention matched to the
   saving cadence, with `sandbox_expired_seen` per sign-in as the loss metric with its own
   threshold. Then (2026-09-21): "Change it to 35 days and with submit too."
5. (2026-09-21) "Annual as the default button."
6. (2026-09-21) "Practice licence on resident-pro."

## Why

The catalogue sells four Resident bundles at 99p a month each (`resident-vat`, `resident-itsa`,
`resident-ltd`, `resident-diya-gl`), three of them listed on ci only. A trader who keeps books
in DIYA-GL and files ITSA needs two checkouts for £1.98; a 99p monthly charge keeps 77.5p (fee
share 21.7%, `PLAN_DIYA_GL_LAUNCH.md` §3); small-business SaaS loses 3–5% of a monthly base every
month. The one thing every rung sells is duration, and a 24-hour sandbox clock converts a daily
bookkeeper where this audience saves once a quarter (VAT, ITSA) or once a year (the spreadsheets'
download habit).

The market's paid floor is £10–£16 a month (§2). £39 a year sits at a quarter of that and reads as
"filed and kept": one price for the books stored, and every filing this company is recognised for
as it lands.

## The offer after this plan

| Bundle | Price | What it carries | Change |
| --- | --- | --- | --- |
| `default`, `day-guest` | £0 | as today | none |
| `resident-vat` | 99p/month | VAT filing, as today | **kept at 99p** for its four subscribers; may close to new business later, no date |
| `resident` (new) | **£39/year** default, £3.99/month alternative | DIYA-GL book storage (Submit's S3, versions, any device) and the Google Drive save (LP-24); VAT, ITSA and Companies House filing as each is recognised; 100 tokens/month | replaces `resident-diya-gl`, `resident-itsa`, `resident-ltd` |
| `resident-pro` | £19.99/month or £199/year (proposed) | the practice licence: a client list, one book set per client, batch recalc and reports, the MCP server, every filing; higher token grant | unhidden, `on-subscription`, multi-client |
| `resident-guest`, `resident-pro-comp`, `invited-guest`, `operator` | £0 | as today | none |

**Numbers.** Stripe UK standard 1.5% + 20p. £39 yearly: fee 78.5p, kept £38.21, share 2.0%.
£3.99 monthly: fee 26p, kept £3.73, share 6.5%. £199 yearly: fee £3.19, share 1.6%. At the launch
plan's 200–500 subscribers, £39 a year is £7.6k–£19.1k net; the same base at 99p monthly was
£1.9k–£4.7k. Not VAT registered (launch plan decision 7); every price is the charged amount.

**The sandbox.** Retention becomes 35 days from the last save (was 24 hours). The clock still
runs from the last save, so a quarterly saver never sees it, a yearly saver sees it once and is
told, and the sign-in still turns a paywall into a try. The loss metric is
`sandbox_expired_seen` per `cloud_sign_in`: above 10% over 500 sign-ins, the clock is too short
for the audience and the next test is 60 days; the launch plan's two triggers (subscribe-started
under 2%, checkout completion under half) stay as written.

## Design

### (a) The `resident` bundle in the catalogue

`web/public/submit.catalogue.toml`: a new `[[bundles]]` `resident` with `levelName = "Resident"`,
`enable = "always"`, `allocation = "on-subscription"`, `tokensGranted = 100`,
`tokenRefreshInterval = "P1M"`, listed in every environment including prod once (c) has lifted the
DIYA-GL tier there. Every activity that lists `resident-vat`, `resident-itsa`, `resident-ltd` or
`resident-diya-gl` in its `bundles` gains `resident`. `resident-diya-gl`, `resident-itsa` and
`resident-ltd` go `hidden = true`, `enable = "never"` in the same commit, and are removed once
Stripe live shows no subscription on their prices (they are listed on ci only today, so the
expectation is none). `resident-vat` is untouched.

`app/services/diyaGlEntitlement.js` reads one bundle id (`DEFAULT_DIYA_GL_BUNDLE_ID`); it takes a
list, `resident` first and `resident-diya-gl` while that bundle still has rows. The entitlement
check for filing routes reads bundles through the activity lists, so they follow the catalogue.

### (b) Two prices per bundle, annual first

The catalogue carries one price per bundle (`stripePriceAmount`, `stripeCurrency`,
`stripeInterval`) and `infra/stripe/stripe-sync.js` creates one Stripe price per bundle by
amount, currency and interval (`findOrCreatePrice`, line 295). Two prices per bundle need a
second set of fields; the plan proposes a `[[bundles.prices]]` table with `interval`, `amount` and
`default = true` on one of them, and `stripe-sync` creating every listed price. `billingCheckoutPost.js`
takes the chosen interval and picks that price id; `bundles.html` shows the annual price as the
button and the monthly as a text link beneath it ("or £3.99 a month"). The DIYA-GL page's offer
(`cloud.js` Subscribe, `../spreadsheets.diyaccounting.co.uk/_developers/archive/PLAN_DIYA_GL_HOME.md` §(c)) shows the same two, annual first.

### (c) The DIYA-GL tier on prod

`../spreadsheets.diyaccounting.co.uk/_developers/archive/PLAN_DIYA_GL_HOME.md` §(c) lists the two edits that lift the tier to prod:
`DIYA_GL_RESIDENT_TIER` on and `prod` in the bundle's `listedInEnvironments`. They land here on the
`resident` bundle, after (a) and (b), in one PR whose ci deploy proves the loop with the Stripe
test card.

### (d) The practice licence on `resident-pro`

Today `resident-pro` is hidden, `on-pass-on-subscription`, £9.99 a month, "all authenticated
activities", with no notion of a client. A practice needs: a client list under one sign-in, one
book set per client in DIYA-GL storage (keyed by a client id in the sidecar), batch recalc and
reports through the MCP server and CLI, and the filings against each client's own HMRC
authorisation (the agent-services model). That is a design task first (the data model for clients
and the authorisation flow), then a build. Price proposed at £19.99 a month or £199 a year, above
the £10–£16 single-trader floor and below an accountant's own software.

### (e) The 35-day sandbox

`../spreadsheets.diyaccounting.co.uk/_developers/archive/PLAN_DIYA_GL_HOME.md` §(b) fixed 24 hours: the put route writes `expiresAt = updatedAt + 24h` for
sandbox books, the lifecycle rule expires `retention=sandbox` objects after 2 days. This plan
moves both: `expiresAt = updatedAt + 35 days`; the rule's `expiration` to 37 days and
`noncurrentVersionExpiration` to 1 day (S3 expires on day boundaries; the sidecar's `expiresAt`
stays the reader-facing truth, the rule is the backstop). The get route's `404 book-expired` and
the list route's filter follow the sidecar as they do now. The pages' labels move from "24h
sandbox" to "35-day sandbox" wherever they appear (the spreadsheets repository: the homepage tier
strip, the sign-in title, `renderBookRow`'s countdown in days, `download.html`, the behaviour and
browser specs, `CLAUDE.md` and the two plans). `diya-gl-events.js` gains `sandbox_expired_seen`,
sent once per session when a signed-in reader's list comes back shorter than their last one.

## Task list

Ids are shared with `NEXT.md`'s board here, and the spreadsheets rows with theirs.

| # | Task | Repo | Precursors | Model | Files |
| --- | --- | --- | --- | --- | --- |
| PU-1 | The `resident` bundle: catalogue entry, activity lists, the three folded bundles hidden, the entitlement service's bundle list | Submit | — | Sonnet | `web/public/submit.catalogue.toml`, `app/services/diyaGlEntitlement.js`, its tests, `PASSES.md` (~5 files) |
| PU-2 | Two prices per bundle: catalogue `prices` table, `stripe-sync` per price, checkout by interval, `bundles.html` annual-first | Submit | PU-1 | Sonnet | `submit.catalogue.toml`, `infra/stripe/stripe-sync.js`, `app/functions/billing/billingCheckoutPost.js`, `web/public/bundles.html`, `app/lib/productCatalog.js`, tests (~8 files) |
| PU-3 | Stripe test then live: the `resident` product with both prices through `stripe-catalogue-sync`; the price ids into `.env.ci` and `.env.prod` | Submit | PU-2 | Haiku, machine-ask (the live key is the operator's) | `.env.ci`, `.env.prod` (~2 files) |
| PU-4 | The 35-day sandbox: put route expiry, lifecycle rule, the `sandbox_expired_seen` event contract | Submit | — | Sonnet | `app/functions/diyaGl/diyaGlPut.js`, `infra/.../DataStack.java`, `diyaGlPut.test.js`, `DataStackTest.java` (~4 files) |
| PU-5 | The DIYA-GL tier on prod: `DIYA_GL_RESIDENT_TIER`, `prod` in `resident`'s environments | Submit | PU-3, PU-4 | Haiku | `SubmitApplication.java`, `submit.catalogue.toml` (~2 files) |
| PU-6 | Practice licence design: clients under one sign-in, per-client book sets, agent authorisation, batch through MCP and CLI | Submit | — | Opus | `PLAN_PRICE_UPDATE.md` §(d) expanded, then a build task list |
| PU-7 | Practice licence build, per PU-6's design | Submit | PU-6 | per the design | per the design |
| PU-8 | The pages: "35-day sandbox" labels, the countdown in days, the DIYA-GL offer showing £39/year first, `sandbox_expired_seen` sent | spreadsheets | PU-4 for the event, PU-2 for the offer | Sonnet | `web/diya-gl.co.uk/public/cloud.js`, `shell.js`, `index.html`, `web/spreadsheets.diyaccounting.co.uk/public/download.html`, `diya-gl-events.js`, the cloud browser spec, the behaviour test, `CLAUDE.md`, `../spreadsheets.diyaccounting.co.uk/_developers/archive/PLAN_DIYA_GL_HOME.md` (~9 files) |
| PU-9 | Retire `resident-diya-gl`, `resident-itsa`, `resident-ltd` once Stripe live shows no subscription on their prices | Submit | PU-5 | Haiku | `submit.catalogue.toml`, `.env.ci`, `.env.prod` (~3 files) |

## Decisions taken (operator, 2026-09-21)

1. `resident-vat` stays at 99p a month for its four subscribers; closing it to new business is a
   later decision with no date.
2. One Resident price: £39 a year, £3.99 a month, filing included as each is recognised.
3. Annual is the default button.
4. `resident-pro` becomes the practice licence.
5. The sandbox runs 35 days (25 was the first instruction, corrected the same day).

## Open questions for the operator

- The practice price: £19.99 a month or £199 a year is proposed; the design (PU-6) will bring the
  cost of per-client agent authorisation, which may move it.
- Whether the `resident` bundle's monthly price is offered at all on the DIYA-GL page, or only on
  `bundles.html`; the plan shows both, annual first, everywhere.
