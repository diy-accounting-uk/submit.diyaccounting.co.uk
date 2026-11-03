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

> Drop both so resident-pro as the same tokens and resident-vat and does not add support for a
> practice, and create a new product resident-tax-agent which has practice plus all of
> resident-pro plus unlimuted tokens at 199.99/yr and 19.99/mo.

> Keep both (Income Tax and diya-gl storage in resident-pro)

> Move to new Resident Pro (the current holders of resident)

The go covers the live Stripe writes: the resident-ltd product and prices, and the £61.35
confirmation statement fee price (OCS11b, done: price_1UXgLQCD0Ld2ukzIxWk80VH7 on branch claude/yahtzee-stripe-fee).

## Target catalogue

| Bundle | Holds | Prices | Tokens | Prod |
|---|---|---|---|---|
| resident-vat | VAT, passes | £9.99/year (new), £0.99/month | 100, monthly | listed |
| resident-ltd (new) | three Companies House filings | £9.99/year, £0.99/month | 100, monthly | listed |
| resident-pro | resident-vat + resident-ltd, Income Tax, diya-gl storage | £39.99/year, £3.99/month | 100, monthly | listed |
| resident-tax-agent (new) | resident-pro + the practice licence | £199.99/year, £19.99/month | unlimited | not listed until UH1 |
| resident-pro-comp | resident-tax-agent, free by pass | — | unlimited | pass only |
| resident | folded into resident-pro | — | — | — |

Resident Pro's strap line: "Submit VAT returns to HMRC and Accounts to Companies House. £39.99/yr /
£3.99/mo, cancel anytime."

## Tasks

| Id | What | Model | Blocked by |
|---|---|---|---|
| RL2a | The aggregation resolver, its readers and its tests | Sonnet | — |
| RL2b | The catalogue fold, resident-tax-agent, every `resident`/`resident-pro` reference, migration 007 | Sonnet | RL2a |
| RL2c | The Stripe price wiring: env var names, CDK props, the stripe-sync product update | Sonnet | RL2b |
| RL2d | UH4: the three Companies House filings on prod, and the copy | Sonnet | RL2b |
| RL3 | Stripe test then live: resident-ltd, resident-vat's year price, resident-pro's new prices, resident-tax-agent | Haiku | RL2c |
| RL4 | Record again the videos that show the bundle card (RL2d's list), then `video-publish` | Sonnet | RL2d deployed to ci |

RL2a to RL2d land on one branch and one PR, in order. RL3 runs after that PR merges.

## Design (RL1)

### 1. Catalogue aggregation

**The field.** A bundle carries `includes = ["<bundle id>", ...]`. An aggregate holds every
activity of each bundle it includes, transitively, plus the activities that name it directly.

```toml
[[bundles]]
id = "resident-pro"
includes = ["resident-vat", "resident-ltd"]

[[bundles]]
id = "resident-tax-agent"
includes = ["resident-pro"]

[[bundles]]
id = "resident-pro-comp"
includes = ["resident-tax-agent"]
```

The in-browser parser (`web/public/lib/toml-parser.js`) reads a one-line array only, so each
`includes` stays on one line.

**The resolver.** One pure ES module, with no `window`, no DOM and no imports:
`web/public/lib/services/catalogue-aggregates.js`. It exports four functions.

| Function | Returns |
|---|---|
| `resolveAggregateBundles(catalog)` | A new catalogue. Each activity's `bundles` is its declared list, then every aggregate that includes a declared id (transitively), in catalogue order, with no duplicates. Bundles are copied unchanged. Idempotent. |
| `includedBundleIds(catalog, bundleId)` | The transitive parts of a bundle, without the bundle itself. |
| `bundleIdsIncluding(catalog, bundleId)` | `[bundleId, ...]` and every bundle whose transitive `includes` holds it. |
| `aggregateBundleErrors(catalog)` | A list of strings: an unknown id in `includes`, a bundle that includes itself, a cycle, an aggregate listed in an environment where a part is not listed. |

The resolver never throws. It ignores an unknown id and stops a cycle with a visited set. A unit
test asserts `aggregateBundleErrors(loadCatalogFromRoot())` is empty, so a bad catalogue fails CI.

**Where it runs.**

| Reader | Runs in | Change |
|---|---|---|
| `app/services/productCatalog.js` `parseCatalog` | Lambda, Express, scripts, behaviour steps | Returns `resolveAggregateBundles(TOML.parse(text))`. Every Node reader goes through `loadCatalogFromRoot` or `parseCatalog`: enforcement (`bundleManagement.js`), token enforcement, billing, passes, stripe-sync, behaviour steps. |
| `Dockerfile` | Lambda image | Add `COPY web/public/lib/services/catalogue-aggregates.js web/public/lib/services/catalogue-aggregates.js` in both stages, beside the catalogue copy (lines 18 and 41). The image copies no other file from `web/public/lib`. |
| `web/public/lib/services/catalog-service.js` | browser | Add `parseCatalogueText(text)` = `resolveAggregateBundles(window.TOML.parse(text))`; re-export the four functions. |
| `web/public/index.page.js` (line 262) | browser | Parse with `parseCatalogueText`. Home buttons and upsell read `activity.bundles`. |
| `web/public/widgets/entitlement-status.js` (line 35) | browser | Same, through the dynamic import it already uses. Page access reads `activity.bundles`. |
| `web/public/widgets/submission-cost.js` (line 30) | browser | Same. The token source reads `activity.bundles`. |
| `web/public/bundles.page.js` (line 33, `fetchAndParse`) | browser | Same for `.toml`. Pass offers read `activity.bundles` (line 1076). |
| `web/public/submit.js` | browser | No change; its helpers take the caller's parsed catalogue. |
| `catalogue-names.js`, `hmrc-scope-check.js`, `feature-status.js`, `page-chrome.js`, `content-listing.js`, `mtd-calendar.page.js`, `generate-*.page.js`, `scripts/publish-sitemap.mjs` | browser, build | No change. They read names, scopes, token cost or `environments`, never `bundles`. |
| `mcp/lib/hosted-tools.js` | Lambda | No change. Its prod tool list is a hand list, which MCP1 owns. |

**How each question resolves.**

- Entitlement: `enforceBundles` reads `requiredBundleIdsFromActivities` from the resolved
  activities, so a resident-pro holder passes `file-micro-entity-accounts`. `matchedBundleIds`
  (sent as `Gov-Vendor-License-IDs`) names the bundle the customer holds.
- The activity list of a bundle: `activitiesForBundle(resolved, "resident-pro")` gives the superset.
  The home page lists activities by the bundles held, so it shows the superset.
- Tokens: a bundle's `tokensGranted` and `tokenRefreshInterval` are its own fields. An aggregate
  never inherits or adds its parts' tokens. A holder has one bundle row with one grant.
  `findQualifyingBundle` in `tokenEnforcement.js` matches that row against the resolved list.
- `environments`: per activity, unchanged by aggregation. An aggregate shows an activity only
  where the activity is listed.
- `listedInEnvironments`: per bundle, explicit on each aggregate. `aggregateBundleErrors`
  rejects an aggregate listed where a part is not. An absent field means every environment.

### 2. The fold, and resident-tax-agent

**Bundle fields after RL2b.**

| Bundle | Fields |
|---|---|
| resident-vat | `tokensGranted = 100`, `tokenRefreshInterval = "P1M"`; prices: year 999 `default = true`, month 99 |
| resident-ltd | `name = "Resident Ltd"`, `levelName = "Resident"`, `enable = "always"`, `allocation = "on-subscription"`, 100 tokens monthly; prices: year 999 default, month 99 |
| resident-pro | `includes = ["resident-vat", "resident-ltd"]`, `levelName = "Pro"`, 100 tokens monthly, no `listedInEnvironments`; prices: year 3999 default, month 399 |
| resident-tax-agent | `name = "Resident Tax Agent"`, `includes = ["resident-pro"]`, `levelName = "Tax agent"`, `tokensGranted = "unlimited"`, `listedInEnvironments = ["local", "test", "simulator", "proxy", "ci"]`; prices: year 19999 default, month 1999 |
| resident-pro-comp | `name = "Resident Tax Agent (Complimentary)"`, `includes = ["resident-tax-agent"]`, `tokensGranted = "unlimited"`, no refresh |
| resident-guest | no change (VAT only, 3 tokens) |
| resident | deleted |

Descriptions (the bundles page prints them under the button):

- resident-vat: "Submit VAT returns to HMRC. £9.99/yr / £0.99/mo, cancel anytime."
- resident-ltd: "File accounts and confirmation statements to Companies House. £9.99/yr / £0.99/mo, cancel anytime."
- resident-pro: the strap line, verbatim.
- resident-tax-agent: "Manage a practice's clients and file for them, with everything in Resident Pro and no token limit. £199.99/yr / £19.99/mo, cancel anytime."

Catalogue order: resident-vat, resident-ltd, resident-pro, resident-tax-agent. The bundles page
renders cards in that order.

**resident-tax-agent on prod: not listed until UH1.** Its only addition over resident-pro is the
practice licence, and the `practice` activity is hidden on prod. On prod it would sell resident-pro
plus unlimited tokens at five times the price. UH1 adds `prod` to its listing with the practice.

**resident-pro-comp includes resident-tax-agent.** The comp pass gives beta testers and partners
the top product free, and today it already carries the practice licence (`practiceLicence.js`).
The aggregate keeps that and adds the Income Tax and Companies House filings it lacks today.
Unlimited tokens match the product it gifts. The pass is admin-issued to one email hash, which
limits who holds it. The id stays `resident-pro-comp`, because issued passes and the
`generate-pass.yml` choices name it.

**Activity `bundles` after RL2b** (the declared lists; the resolver adds the aggregates):

| Activities | `bundles` |
|---|---|
| `submit-vat`, `vat-assist-check`, `mcp-harness`, `vat-obligations`, `vat-liabilities`, `vat-payments`, `vat-penalties`, `view-vat-return` | `["day-guest", "week-guest", "invited-guest", "resident-vat", "resident-guest"]` |
| `generate-pass-digital`, `generate-pass-physical` | `["resident-vat"]` |
| `file-micro-entity-accounts`, `file-small-company-accounts`, `file-confirmation-statement` | `["resident-ltd"]` |
| `file-company-tax-return`, `file-psc-verification-statement` | `["resident-ltd"]`, still hidden on prod by `environments` (UH7; PSC after its sandbox proof) |
| the six `self-employed*` activities | `["resident-pro"]` |
| `diya-gl-storage` | `["resident-pro"]` |
| `practice` | `["default"]` (no change; the handlers check the licence) |

The CT600 and PSC rows follow the operator's "later we'll add the HMRC CT600 in there too": on prod
resident-ltd shows the three filings only, because `environments` hides the other two.

**Code references.** From `git grep -n -E '"resident"|resident-pro' -- ':!*.md' ':!target'`
(510 lines, 28 non-test files, 88 test files).

| File | Becomes |
|---|---|
| `web/public/submit.catalogue.toml` | As above; the header summary comment (lines 6 to 16) rewritten |
| `submit.passes.toml` | Add `resident-tax-agent-test-pass` and `resident-tax-agent-pass` (copies of the resident-pro pair); `resident-pro-*-pass` stay for resident-pro; summary comments |
| `app/services/practiceLicence.js` | `SUBSCRIBED_LICENCE_BUNDLE_ID = "resident-tax-agent"`; comp unchanged |
| `app/services/diyaGlEntitlement.js` | Personal tier: an active, unexpired bundle in `bundleIdsIncluding(catalog, "resident-pro")`. Client tier: `resident-tax-agent`. Rename `hasActiveResidentProBundle` to `hasActivePracticeSubscription`; delete `DEFAULT_DIYA_GL_BUNDLE_IDS` and the `DIYA_GL_BUNDLE_ID` override |
| `infra/main/java/.../stacks/DiyaGlStack.java` (lines 155, 265) | Drop `DIYA_GL_BUNDLE_ID`; `DiyaGlStackTest.java` follows |
| `app/functions/billing/billingWebhookPost.js` | `DIYA_GL_PERSONAL_BUNDLE_IDS` = `bundleIdsIncluding(catalog, "resident-pro")`; `DIYA_GL_PRACTICE_BUNDLE_ID = "resident-tax-agent"`. The checkout sets `tokenResetAt` to now plus the bundle's `tokenRefreshInterval` when it has one, else the period end, so a year subscriber's 100 tokens refresh monthly (bundleGet already refreshes lazily from that date) |
| `app/services/bundleManagement.js` | The client-scope message says "resident-tax-agent"; capability keywords |
| `app/services/tokenEnforcement.js`, `productCatalog.js`, `web/public/index.page.js` | Comments: the unlimited grant is resident-tax-agent |
| `app/functions/account/passAdminPost.js` | `SYNTHETIC_ISSUABLE_BUNDLE_IDS = ["day-guest", "invited-guest", "resident-vat", "resident-ltd", "resident-pro", "resident-tax-agent"]` |
| `app/functions/mcp/mcpHarness.js` | The practice checkout names `resident-tax-agent` |
| `mcp/scripts/accounts-test-service-proof.js` | No change: it files the company's own accounts under resident-pro, which still holds them |
| `app/bin/simulatorCommissionRoutes.js:90` | `resident-pro` |
| `scripts/itsa-sandbox-year.js`, `scripts/itsa-sandbox-spike.js` | `bundleIds: ["resident-pro"]` |
| `scripts/stripe-trigger-lifecycle.sh` | No change (seeds resident-pro, still a subscription) |
| `scripts/generate-pass.js`, `.github/workflows/generate-pass.yml` | Add the two resident-tax-agent pass choices and their comments |
| `infra/google/ads/ads-conversions-upload.js` | `SUBSCRIPTION_BUNDLE_IDS = ["resident-vat", "resident-ltd", "resident-pro", "resident-tax-agent"]` |
| `infra/main/resources/analytics/views/v_paid_subscribers_by_channel.sql` | The same four ids |
| `app/data/s3DiyaGlRepository.js`, `diyaGlPut.js`, `diyaGlVersionGet.js` | No change: `"resident"` there is the retention tier name, not the bundle |
| `infra/main/java/.../BillingWebhookStack.java` | Comments only |
| `app/functions/billing/billingCheckoutPost.js:138`, `mockBilling.js` | No change (default bundle id resident-pro) |

**Tests.** The 88 test files swap ids by context. Rule: a test about Income Tax, diya-gl personal
books, Companies House or token counts that names `"resident"` names `"resident-pro"`. A test about
the practice licence, client scope, client books or an unlimited grant that names `"resident-pro"`
names `"resident-tax-agent"`. A test about the catalogue shape asserts the new shape. Read each
hit; do not use sed across the set.

**Current holders: migration 007.** `scripts/migrations/007-resident-to-resident-pro.js`,
`phase = "post-deploy"`, honours `MIGRATION_DRY_RUN`. It queries the `bundleId-expiry-index` GSI
(KEYS_ONLY, sparse on `expiry`) for `bundleId = "resident"`, reads each row by key, writes it again
as `resident-pro` with `tokensGranted = 100`, `tokensConsumed = 0` and `tokenResetAt` one month on,
then deletes the `resident` row. When the account already holds `resident-pro`, it keeps the later
expiry and deletes the `resident` row. It then queries the GSI for `bundleId = "resident-pro"` and
sets `tokensGranted = 100` where the row says `"unlimited"`. No table scan. Unit test:
`app/unit-tests/migrations/007-resident-to-resident-pro.test.js`. Run:
`gh workflow run run-migrations.yml -f environment-name=prod -f phase=post-deploy -f dry-run=true`,
then with `dry-run=false`, after the deploy that carries RL2.

Counts, read from the Athena lakes on 2026-11-03 (latest row per account and bundle):

| Environment | Bundle | Current rows | Stripe subscriptions (latest snapshot) |
|---|---|---|---|
| prod | resident | 2 (actor test-user, expiry 2027-10 and 2027-11) | none |
| prod | resident-pro | 3 with an expiry (2 test-user); 120 with no expiry, granted 2026-02 and 2026-03, accounts holding no other bundle | 0 active, 2 canceled (the old £9.99 price) |
| prod | resident-vat | 166 | 8 active, 2 canceled |
| prod | resident-guest, resident-pro-comp | 0 | — |
| ci | resident | 0 unexpired | 226 active (test mode) |
| ci | resident-pro | 2 (test-user) | 393 active (test mode) |

So migration 007 moves 2 rows on prod and none on ci. The 120 prod rows with no expiry are not in
the sparse GSI; see the open questions. The test-mode subscriptions on ci keep billing in test
mode; a renewal for a retired id writes to a row that is gone, as the 117 `resident-diya-gl`
test subscriptions do today.

**Plan rows that change** (RL2b edits them):

- `PLAN_ITSA_APPROVAL.md` UH2 becomes "Income Tax and diya-gl storage in Resident Pro": `prod` on
  the `self-employed*` and `diya-gl-storage` activities. Preconditions: UH3 and the operator's
  approval. Resident Pro itself is on prod after RL2; Companies House is UH4 (RL2d); CT600 is UH7
  inside resident-ltd.
- `PLAN_ITSA_APPROVAL.md` UH1: "practice sold in a bundle on prod (Resident Tax Agent: `prod` in
  its `listedInEnvironments` and on the `practice` activity)".
- `PLAN_COMPANIES_HOUSE_APPROVAL.md`: the finance column says resident-ltd, listed on prod.

### 3. resident-ltd and UH4

UH4 undoes the two commits that hid the forms again after B34c and CS-11b: `0b2488a60` and
`4e78019d6`. B34c's prod gateway values (package 4326) and CS-11b's shareholder change are on main.
Start RL2d with `git revert --no-commit 4e78019d6 0b2488a60` on top of RL2b, then resolve the
catalogue hunks by hand, because RL2b changed the `bundles` lines beside them. The two commits
touch:

- `web/public/submit.catalogue.toml`: `prod` in the three `environments`; ", sandbox" out of the three names.
- `web/public/companies-house/fileMicroEntityAccounts.html`, `fileSmallCompanyAccounts.html`, `fileConfirmationStatement.html`: the `data-feature-status="sandbox"` banner (line 32 or 33).
- `scripts/build-mtd-calendar.mjs` `AVAILABILITY`: the Web form cell of the accounts row and the confirmation statement row becomes `["production"]`. The MCP cells stay `sandbox` (MCP1). Then `npm run build:mtd-calendar` writes `web/public/mtd-calendar.html`.
- `videos/file-micro-entity-accounts.json`, `file-small-company-accounts.json`, `file-confirmation-statement.json`, `file-psc-verification-statement.json` (it opens through the confirmation statement button), `videos/publish.json`, then `node scripts/copy-videos-manifest.js` for `web/public/videos/publish.json`.
- `behaviour-tests/steps/behaviour-companies-house-accounts-steps.js` (two `activityButtonText`) and `behaviour-companies-house-confirmation-steps.js` (one).
- Tests: `app/unit-tests/services/prodSurface.test.js` (the three ids move to "stays listed in prod"), `productCatalog.test.js` (the "ci only" case at line 228), `bundleManagement.test.js` (the restricted-environment case uses `ENVIRONMENT_NAME = "preview"` again), `billingActivityCheckoutPost.test.js` (the restricted case uses `file-company-tax-return`).

Tests that assert these forms hidden on prod, outside those commits:

- `web/browser-tests/hiddenContent.browser.test.js` lines 53, 90, 91, 105: the confirmation statement and accounts now show on prod (guide journey, Companies House videos page, videos index). The CT600 and Income Tax assertions stay.
- `web/browser-tests/prodSurface.browser.test.js` line 84 (drop `fileConfirmationStatement.html` from the not-available list) and line 109 (the home link; it shows only with the entitlement, so check the test's viewer).

The £61.35 fee: the catalogue row exists (`[[activities.prices]]` on `file-confirmation-statement`).
The live price id goes to `STRIPE_PRICE_ID_FILE_CONFIRMATION_STATEMENT` in `.env.prod` (line 163,
empty today). `BillingStack.java` (line 372) already passes it to the activity checkout. RL3 writes it.

### 4. resident-vat's default price

The year price (£9.99) carries `default = true` on all four priced bundles. The bundles page shows
the year price as the main button for any bundle with two prices (`bundles.page.js` line 298).
`billingCheckoutPost.js` takes "annual" when the caller names no interval (line 151). A month
default would contradict both. The 8 live month subscribers keep their month price.

### 5. Stripe

Env var names come from `computeEnvUpdates` in `infra/stripe/stripe-sync.js` and
`resolveStripePriceId` in `billingCheckoutPost.js`: `STRIPE_[TEST_]PRICE_ID_<ID>` for one price,
`..._<ID>_YEAR` and `..._<ID>_MONTH` for two. The ids land in `.env.ci` and `.env.prod`; the
catalogue holds amounts only.

| Product (`metadata.bundleId`) | Stripe action (RL3) | Env vars |
|---|---|---|
| resident-vat | new 999/year price on the existing product; the 99/month price stays | `STRIPE_PRICE_ID_RESIDENT_VAT` is renamed `..._RESIDENT_VAT_MONTH` (live `price_1TEgaVCD0Ld2ukzIKRcRQZBL`); add `..._RESIDENT_VAT_YEAR` |
| resident-ltd | the product from before 2026-09-22 exists in test and live; stripe-sync finds it by metadata; reuse an active 99/month price, create the 999/year price | `..._RESIDENT_LTD_YEAR`, `..._RESIDENT_LTD_MONTH` |
| resident-pro | new 3999/year and 399/month prices on the existing product; the 19900, 1999 and old 999 prices stay active with no live subscription | `..._RESIDENT_PRO_YEAR`, `_MONTH` take the new ids |
| resident-tax-agent | new product; 19999/year, 1999/month | `..._RESIDENT_TAX_AGENT_YEAR`, `_MONTH` |
| file-confirmation-statement | new live 6135 one-off price (the test price exists) | `STRIPE_PRICE_ID_FILE_CONFIRMATION_STATEMENT` in `.env.prod` |
| resident | no Stripe write; nothing references it after RL2. Archiving it needs its own go | `..._RESIDENT_YEAR`, `_MONTH` deleted |

RL2c, before any Stripe write:

- `infra/stripe/stripe-sync.js` `findOrCreateProduct`: when the found product's `name` or
  `description` differs from the catalogue, or the product is archived, the plan prints the change
  and `--apply` sends `stripe.products.update` with `active: true`. Without it, resident-pro keeps its
  practice text and the old resident-ltd product can be archived. Test in `app/unit-tests/scripts/stripeSync.test.js` as a pure plan function.
- `SubmitApplication.java` and `BillingStack.java`: props and `billingCheckoutPost` env for the
  new names (vat year and month, ltd year and month, tax-agent year and month, each with its
  `TEST_` twin); delete the `RESIDENT_YEAR`/`MONTH` props and the `RESIDENT_VAT` single-price prop.
  `SubmitApplicationBillingStackCdkTest.java` changes its `resident` case to the new names.
- `.env.ci`, `.env.prod`: the rename of the resident-vat lines; delete the four `RESIDENT_` lines;
  empty lines for the new names. `.env.test`, `.env.simulator`, `.env.proxy`: the same names.

RL3 (Haiku), with `.claude/skills/stripe-catalogue-sync/SKILL.md`, each step shown before it runs:

1. `node infra/stripe/stripe-sync.js --environment ci --mode test --products-only` (plan).
2. `node infra/stripe/stripe-sync.js --environment ci --mode test --apply --products-only`.
3. `node infra/stripe/stripe-sync.js --environment prod --mode live --products-only` (plan).
4. `node infra/stripe/stripe-sync.js --environment prod --mode live --apply --products-only`.
5. Commit the `.env.ci` and `.env.prod` diff on a `claude/*` branch.

Caution: the go of 2026-11-03 names the resident-ltd product and prices and the £61.35 price. The
live resident-vat year price, the resident-pro prices, the resident-pro product update and the
resident-tax-agent product are outside it. Ask before step 4 when the coordinator has no wider go.

### 6. Pages and copy

| Surface | Becomes |
|---|---|
| `bundles.html` | From the catalogue: four subscription cards in order, year button and month link, the descriptions above. No page code change |
| `web/public/faqs.toml` lines 570, 612, 627 | Income Tax and diya-gl: "Resident Pro or Resident Tax Agent" |
| `web/public/faqs.toml` line 597 | Companies House and CT600: "Resident Ltd, Resident Pro or Resident Tax Agent" |
| `web/public/faqs.toml` lines 640 to 642, keywords 646 | The four prices: Resident VAT and Resident Ltd £9.99 a year or £0.99 a month; Resident Pro £39.99 a year or £3.99 a month; Resident Tax Agent £199.99 a year or £19.99 a month |
| `web/public/terms.html` lines 289 to 347 | The table rows for the four bundles and the comp row ("The same as Resident Tax Agent, by invitation"); the tokens line: "Resident Tax Agent has no token limit"; the subscriptions list names the four |
| `web/public/guide.page.js` line 91 | "With Resident Pro, the book saves to your account from diya-gl." |
| `web/public/practice.js` lines 182, 186 | "Resident Tax Agent licence", "Get Resident Tax Agent" |
| `videos/*.json` | The Companies House and CT600 scripts (`file-micro-entity-accounts`, `file-small-company-accounts`, `file-confirmation-statement`, `file-psc-verification-statement`, `file-company-tax-return-book`, `file-company-tax-return-typed`): `"bundle": "Resident Ltd"`, chapter, caption, "take out Resident Ltd". The 14 Income Tax scripts: "Resident Pro". Their `videos/publish.json` descriptions the same, then `copy-videos-manifest.js` |
| behaviour tests | `ensureBundlePresent(page, "Resident", ...)`: "Resident Ltd" in `fileConfirmationStatement`, `fileMicroEntityAccounts`, `companyTaxReturn`; `passRedemption.behaviour.test.js` lines 492, 515 per its bundle |
| `web/public/mtd-calendar.html` | Rebuilt by `npm run build:mtd-calendar` (RL2d) |
| `bundles.page.js` line 285 | No change: no bundle uses `on-pass-on-subscription` |
| spreadsheets repository, `web/diya-gl.co.uk/public/index.html` lines 73 to 75 and `cloud.js` line 1721 | Outside this repository. The checkout names `resident-diya-gl`, retired on 2026-09-22, and the old prices. It becomes `resident-pro` at £39.99 a year. The coordinator sends that session the change |

### 7. Size, split and proof

RL2 touches about 150 files: 28 non-test files and 88 test files from the grep, plus the resolver,
the browser readers, the CDK wiring, the env files, the UH4 set and the copy. The four sub-tasks:

**RL2a: the resolver.** Files: `web/public/lib/services/catalogue-aggregates.js` (new),
`web/unit-tests/catalogue-aggregates.test.js` (new), `app/services/productCatalog.js`,
`web/public/lib/services/catalog-service.js`, `Dockerfile`, `index.page.js`,
`entitlement-status.js`, `submission-cost.js`, `bundles.page.js`,
`app/unit-tests/services/productCatalog.test.js`. About 10. The catalogue gets no `includes` yet,
so behaviour does not change. Proof:

- the new unit tests: transitive resolution, idempotence, catalogue order, unknown id, self include,
  cycle, listing subset error, `bundleIdsIncluding`;
- a `productCatalog.test.js` case that a fixture with `includes` resolves through `parseCatalog`;
- `npm run test:unit`; `npm run test:browser -- web/browser-tests/homeActivities.browser.test.js web/browser-tests/submissionCost.browser.test.js web/browser-tests/bundles.subscription.browser.test.js`;
- `docker build .` succeeds and the image holds the module.

**RL2b: the fold.** Files: the catalogue, `submit.passes.toml`, the code table in section 2,
migration 007 and its test, `DiyaGlStack.java` and its test, the three plan rows, and the 88 test
files. About 110, mostly one-line id swaps. Proof:

- `npm run test:unit` and `npm run test:system`, including `aggregateBundleErrors` empty on the real catalogue, `practiceLicence.test.js`, `diyaGlEntitlement.test.js`, `tokenEnforcement.test.js`, `billingWebhookPost.test.js` (the tokenResetAt case), `007-resident-to-resident-pro.test.js`;
- `./mvnw clean verify` (`DiyaGlStackTest`);
- `npm run test:browser`;
- one at a time under `lockf -k /tmp/submit-simulator.lock`: `test:bundleBehaviour-simulator`, `test:passRedemptionBehaviour-simulator`, `test:practiceLicenceBehaviour-simulator`, `test:diyaGlBehaviour-simulator`, `test:itsaBusinessDetailsBehaviour-simulator`, `test:fileMicroEntityAccountsBehaviour-simulator`, `test:fileConfirmationStatementBehaviour-simulator`, `test:companyTaxReturnBehaviour-simulator`, `test:generatePassActivityBehaviour-simulator`, `test:paymentBehaviour-simulator`.

**RL2c: the Stripe wiring.** Files: `stripe-sync.js`, `stripeSync.test.js`,
`billingCheckoutPost.test.js`, `SubmitApplication.java`, `BillingStack.java`,
`SubmitApplicationBillingStackCdkTest.java`, the five `.env.*` files. About 11. Proof:

- `npm run test:unit` (`stripeSync.test.js`, `billingCheckoutPost.test.js` for `RESIDENT_VAT_MONTH`, `RESIDENT_LTD_YEAR`, `RESIDENT_TAX_AGENT_YEAR`);
- `./mvnw clean verify` (`SubmitApplicationBillingStackCdkTest`);
- `node infra/stripe/stripe-sync.js --environment ci --mode test --products-only` prints the plan without writes.

**RL2d: UH4 and copy.** Files: the revert set in section 3, the two browser tests, the copy table
in section 6. About 40. Proof:

- `npm run test:unit` (`prodSurface.test.js`, `productCatalog.test.js`);
- `npm run test:browser` (`hiddenContent`, `prodSurface`, `fileConfirmationStatement`);
- `test:fileMicroEntityAccountsBehaviour-simulator`, `test:fileConfirmationStatementBehaviour-simulator`, `test:companiesHouseBehaviour-simulator`;
- the `visual-review` skill on the bundles page, a Companies House page and the calendar (definition of done, steps 2 and 4); RL4 records the videos again.

The PR's ci deploy then runs the ci behaviour suites; migration 007 runs on ci, then on prod after
the prod deploy.

## Open questions

| Id | Question | Options | Recommendation |
|---|---|---|---|
| RQ1 | The 120 prod `resident-pro` rows with no expiry (granted 2026-02 and 2026-03, no Stripe subscription, no other bundle on the account). After RL2 they hold VAT and Companies House on prod with no end date. The sparse GSI does not reach them | (a) leave them; (b) a migration 008 that deletes them by the keys from the lake query, run by `run-migrations.yml`; (c) a scan migration like 006 | (b): keys come from the lake, so no scan, and no paying customer holds them |
| RQ2 | CT600 and PSC verification in resident-ltd now, hidden on prod by `environments` | (a) in resident-ltd now; (b) in resident-pro only until UH7 | (a), as designed: prod shows the three filings, and UH7 is then one `environments` change |
