<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: a campaign for the watch list and the due list

Five audiences learn what the watch list and the due list show and what filing costs. Each one lands on a page that answers its question, and each one has a next step to a paid bundle. The channels cost nothing; a paid channel is the operator's decision. Each step from a visit to a paid bundle is counted by `utm_source`, and each channel has a stop rule. Facts checked 2026-11-22.

**Status**: reviewed in three rounds; decisions answered by the operator on 2026-11-22. The open tasks (MA1, WDM3 to WDM13 and WDM15 to WDM17) are tracked in section 8.3, not on `NEXT.md`. WDM18 (paid search) starts when the free channels show a sign-up rate (decision D1). Briefs are section 8.

## Operator assertions (verbatim)

From board row WDM1, operator, 2026-11-22:

> Write `PLAN_WATCH_DUE_CAMPAIGN.md` at this root, then `/plan-review-loop` on it and `/refine` boards its tasks. The audiences, each with what it needs and the upsell it leads to: directors of sole-director micro companies (what is due, filed cheaply: Resident Ltd and Resident VAT); owners of dormant companies and property companies (one set of dormant accounts and a confirmation statement a year); contractor companies (accounts and the CT600 once its form is on prod); bookkeepers and small practices (every client's deadlines in one view: the practice bundle once UH1 lands); and people who check a company (CR1's reports, free, as an entry point). For each audience: the message (factual, stating what the watch list and the due list show and what filing costs), the page it lands on (WL1's watch list, DUE1's due list, CL1's company addresses, a landing page made by the generated-page pattern of `PLAN_ORGANIC_SEARCH.md` section 8.4), the channels that cost nothing (search, the listing register `web/marketing/marketing.toml`, newsletters and forums through the `campaign` skill's review queue, the spreadsheets site and its download and donor emails, CP1 campaign passes with a `utm_source` each), and any paid channel as a decision for the operator with its cost in pounds (Google and Microsoft Ads are off today). Measurement: the GA4 events and the operator dashboard figures that show a visit, a watch list add, a due list view, a sign-up and a paid bundle, by `utm_source`; and a stop rule for each channel. Each task names its brief, model and size, and waits on the feature it markets (WL1, DUE1's build tasks, CL1, CR1).

## Goals

1. Each of the five audiences has a factual message, a page it lands on, and a next step to a paid bundle.
2. Every channel that costs nothing carries the campaign, each with its own `utm_source`.
3. A paid channel runs only on the operator's decision, with its cost in pounds stated first.
4. The operator dashboard shows, by `utm_source`, the visits, the watch list adds, the due list views, the sign-ups and the paid bundles.
5. Each channel has a stop rule that a campaign session applies from those figures.

## Rules of this plan

- **A message states only what prod offers.** Status comes from the `environments` of each activity in `web/public/submit.catalogue.toml` and from `AVAILABILITY` in `scripts/build-mtd-calendar.mjs`. A task that markets a feature waits until that feature is on prod. Wording follows `../private.diyaccounting.co.uk/strategy/MARKETING_GUIDANCE.md`.
- **A message states facts and prices.** It says what the list shows, where the dates come from, and what each filing costs. It uses no rating word ("best", "easiest", "never miss").
- **The session posts nothing, sends nothing and spends nothing.** A person posts each draft from the `campaign` skill's review queue, sends each email, and makes each pass. Every such task is human-driven or machine-ask.
- **Every link we place carries `utm_source`, `utm_medium` and `utm_campaign=watch-due`.** `utm_source` names the place (a forum, a listing, `spreadsheets`, `donors`, a partner).
- **No email goes to a person who has not opted in to marketing.** There is no marketing consent today (`MARKETING_GUIDANCE.md`, "Customer Consent for Marketing"). The due list's reminder emails are service emails and carry no campaign content.
- **A count under 3 shows as "fewer than 3"**, as in the `campaign` skill.

## 1. Where it stands

### 1.1 The features

| Feature | State | Bundle | Evidence |
| --- | --- | --- | --- |
| Company lookup | on prod, signed-in | `default` | `submit.catalogue.toml:521-528` |
| Public deadline lookup, no sign-in | on prod | none | `web/public/company-filing-deadlines.html`, `scripts/filing-pages.toml:256-283` |
| Drill-down addresses `/companies-house/company/<CRN>` | open row CL1, wave set zeppelin W2 | `default` | `NEXT.md` CL1 |
| Watch list | open row WL1, zeppelin W3; up to 50 companies an account | `default` | `NEXT.md` WL1 |
| Due list | plan `PLAN_DUE_LIST.md`; launch is DUE14 | the `default` bundle (decision D2 of that plan) | `PLAN_DUE_LIST.md` sections 8, 9 |
| Company reports | plan `PLAN_COMPANY_REPORTS.md`; launch is CR14 | the `default` bundle (decision D1 of that plan) | `PLAN_COMPANY_REPORTS.md` sections 5, 8 |
| Campaign passes | open row CP1, zeppelin W4 | operator page | `NEXT.md` CP1 |
| Marketing assets (videos, screenshots, listing packs) | open task MA1, blocked on the due list | none | MA1 (section 8.3) |
| Practice bundle (Resident Tax Agent) | listed on ci only; prod waits on UH1 | `resident-tax-agent` | `submit.catalogue.toml:241`; `PLAN_ITSA_APPROVAL.md` UH1 |
| CT600 | preview, not on prod | `resident-ltd` | `submit.catalogue.toml:575-583` |

### 1.2 Prices on prod

| Bundle or filing | Price | Evidence |
| --- | --- | --- |
| Resident VAT: VAT returns | £9.99 a year or 99p a month | `submit.catalogue.toml:140-169` |
| Resident Ltd: micro-entity, small and dormant accounts, the confirmation statement | £9.99 a year or 99p a month | `submit.catalogue.toml:176-197` |
| Confirmation statement, each filing | £61.35, which includes the £50 Companies House fee | `submit.catalogue.toml:610-623` |
| Resident Pro: Resident VAT and Resident Ltd | £39.99 a year or £3.99 a month | `submit.catalogue.toml:202-227` |
| Resident Tax Agent: the practice licence (not on prod) | £199.99 a year or £19.99 a month | `submit.catalogue.toml:231-260` |

Dormant accounts are filed through the micro-entity form (`scripts/filing-pages.toml:68-88`). Resident VAT and Resident Ltd together cost £19.98 a year, less than Resident Pro, whose extra activities (Income Tax, diya-gl storage) are not on prod.

### 1.3 The channels we own

- **Search pages.** `scripts/build-filing-pages.mjs` writes the landing pages from `scripts/filing-pages.toml` (capability SITE-32). Five filing pages (`[[page]]`) and the public deadline lookup (an `[[article]]`) exist. An article reads no catalogue and has no video (`renderArticlePage(article, sources)`); its sections take text, lists, a widget and a filing `status` from `AVAILABILITY`. A new public page needs the five things of `PLAN_ORGANIC_SEARCH.md` section 8.4. Search Console reads pages by family; a new page falls in family `other` (`infra/main/resources/analytics/views/v_search_console_pages_daily.sql:31-48`).
- **The listing register.** `web/marketing/marketing.toml` holds 28 listings: 8 live, 5 submitted, 15 planned. Each listing has a `utmSource` (for example line 1734). `[[listingProduct]]` packs hold the copy; MA1 adds one pack for each new feature.
- **The `campaign` skill.** It drafts five forum answers a session into the review queue (https://claude.ai/artifact/FdKLWPhouk8swyX6z6Lt2G), and a person posts them. Its question shapes are VAT ones today (`.claude/skills/campaign/SKILL.md`, step 2). `scripts/campaign-threads.mjs` filters by date only, so the question shapes live in the skill's text.
- **The spreadsheets site.** Its download page links Submit with `utm_source=spreadsheets` (`web/spreadsheets.diyaccounting.co.uk/public/download.html:101`, `:113`, in the sibling repository). The donor email is the operator's own reply, with a template that has an `[UPDATE]` slot (`NEXT.md` DON1).
- **Partners.** The FSB proposal (`NEXT.md` OOS44) offers a CP1 pass with `utm_source=fsb`. The letters to other bodies are `../private.diyaccounting.co.uk/strategy/marketing/EDITOR_LETTERS.md`.
- **Paid search.** Both platforms are paused: Google "Search: MTD VAT" at £2.00 a day (`infra/google/ads/ads.toml:121-127`), Microsoft at £1.00 a day (`infra/microsoft/ads/ads.toml:75-82`). No spend since 2026-11-08. The last measured Google cost was £1.11 a click (VAT queries, 18 to 29 October 2026, `MARKETING_GUIDANCE.md`, "Bid and budget rules").

### 1.4 The measurement that exists

| Step | What records it | Gate | Evidence |
| --- | --- | --- | --- |
| Visit, by landing page, `utm_source`, `utm_campaign` | CloudFront access log; column `utm_landings` | none (no consent needed) | `infra/main/resources/analytics/views/v_paid_landings_daily.sql:62` |
| Session, by `utm_source` | session beacon `new-session` event, view `v_campaign_channels_daily` (DATA-68) | consent | `web/public/lib/session-beacon.js:26-36`; `web/public/lib/analytics.js:122-131` |
| GA4 session, by channel group | `ga4_traffic`, no `utm_source` dimension | consent | `v_traffic_sources_daily.sql:6-10` |
| Watch list add | nothing | | WL1 adds the button |
| Due list view | nothing | | DUE6 adds the page |
| Activity button and page view | `activity-started` and `activity-completed` events with the hashed sub | signed in | `web/public/submit.js:447-480`; `app/functions/account/activityStartedPost.js:37`, `:65-71` |
| Sign-in | GA4 `login` event (method only) | consent | `web/public/auth/loginWithCognitoCallback.page.js:244` |
| Sign-up | "New accounts" = first bundle grant | none | `app/lib/operatorSnapshot/conversionToSubmissionObjective.js:11-21`; `v_signup_to_first_submission.sql:6-9` |
| Source of an account | `acquisition` on a bundle request, a checkout or a pass redemption | consent (read from `localStorage`) | `web/public/bundles.page.js:236`, `:549`; `web/public/pass.page.js:357` |
| Paid bundle, by source | GA4 `purchase`; view `v_paid_subscribers_by_channel` on the dashboard | `purchase` needs consent; the view does not | `web/public/bundles.page.js:1768`; `app/functions/analytics/operatorSnapshotPublish.js:3075` |
| GA4 key events | `purchase`, `submit_vat_return`, `donate`, `runner_download` | | `infra/google/ga4/analytics.toml:30` |

Two gaps follow. An account that uses only the watch list or the due list holds only `default`, so it makes no bundle request: it has no source and does not count as a new account (not confirmed: whether `default` writes a bundle record; WDM2 checks). And nothing records a watch list add or a due list view.

## 2. The audiences

Each audience has its own `utm_content` value, so one link can name both the place and the audience.

### 2.1 Directors of sole-director micro companies (`utm_content=director`)

- **Needs.** What the company must file next and when, and a cheap way to file it.
- **Message.** "Type your company number and see when your accounts, confirmation statement and Corporation Tax are due, from the Companies House register. Sign in to keep the list and add your VAT returns. Submit files micro-entity and small company accounts for £9.99 a year (Resident Ltd); the confirmation statement is £61.35 a filing, which includes the £50 Companies House fee. VAT returns are £9.99 a year (Resident VAT)."
- **Lands on.** The due list landing page (WDM6). Until the due list is on prod: the public deadline lookup, `company-filing-deadlines.html`, with the watch list link that WDM5 adds.
- **Upsell.** Resident Ltd, then Resident VAT for a VAT-registered company.

### 2.2 Owners of dormant companies and property companies (`utm_content=dormant`)

- **Needs.** Each year: one set of accounts (dormant or micro-entity) and one confirmation statement, with a reminder before each.
- **Message.** "Watch your companies and see both dates for each in one list. Submit files dormant and micro-entity accounts for £9.99 a year (Resident Ltd). The confirmation statement is £61.35 a filing, which includes the £50 Companies House fee."
- **Lands on.** `dormant-company-accounts.html` (exists), with the watch list and due list links that WDM5 and WDM6 add.
- **Upsell.** Resident Ltd.

### 2.3 Contractor companies (`utm_content=contractor`)

- **Needs.** Accounts, the confirmation statement, the CT600 and its payment date, and VAT returns if registered.
- **Message.** "The due list shows your accounts, confirmation statement, Company Tax Return and Corporation Tax payment dates, and your VAT returns once you sign in to HMRC. Submit files the accounts and the confirmation statement today (Resident Ltd, £9.99 a year) and VAT returns (Resident VAT, £9.99 a year)." The CT600 line comes from `AVAILABILITY` and says "preview" until `file-company-tax-return` lists prod; then it says the CT600 is in Resident Ltd.
- **Lands on.** The due list landing page, section `#contractors` (WDM6).
- **Upsell.** Resident Ltd and Resident VAT; the CT600 inside Resident Ltd when it is on prod.

### 2.4 Bookkeepers and small practices (`utm_content=practice`)

- **Needs.** Every client's filing dates in one view.
- **Message, before UH1.** "Watch up to 50 client companies and see each one's accounts and confirmation statement dates in one list, from the Companies House register. Free with a sign-in."
- **Message, after UH1.** Adds: "Resident Tax Agent files for your clients: £199.99 a year." The landing page shows this line only when `resident-tax-agent` lists prod in `listedInEnvironments`.
- **Lands on.** The watch list landing page, section `#bookkeepers` (WDM5).
- **Upsell.** Resident Tax Agent after UH1. Before UH1: Resident Ltd for the practice's own company.

### 2.5 People who check a company (`utm_content=check`)

- **Needs.** A plain view of a company's filing record, people, capital, charges, history and figures.
- **Message.** "Six plain reports from a company's own Companies House filings: filing record, people, share capital, charges, name and address history, and accounts figures year on year. Each figure names its filing. Free with a sign-in." Before CR14, the message is the public deadline lookup and the watch list.
- **Lands on.** The company check landing page (WDM7), which opens CL1's address `/companies-house/company/<CRN>/reports`.
- **Upsell.** "Add to watch list", then the reader's own company on the due list, then Resident Ltd.

## 3. The channels that cost nothing

| Channel | `utm_source` | `utm_medium` | What carries the campaign | Task |
| --- | --- | --- | --- | --- |
| Search | none (organic) | none | Three landing pages and links from the existing filing pages | WDM5, WDM6, WDM7 |
| Listing register | the listing's `utmSource` | `listing` | The new features in each live listing's copy | WDM11, WDM12 (after MA1) |
| Forums and newsletters | the place, for example `ukbf`, `reddit` | `forum` or `newsletter` | `campaign` skill drafts posted by a person | WDM8, WDM9 |
| Spreadsheets site | `spreadsheets` | `download` | A link on the download page and the company product page | WDM10 |
| Donor emails | `donors` | `email` | The `[UPDATE]` paragraph of the donor thank-you reply | WDM13 |
| Partner bodies | the body, for example `icb` | `partner` | A proposal, then a CP1 pass per body that agrees | WDM15, WDM16, WDM17 |

The partner bodies are the Institute of Certified Bookkeepers, AAT and the International Association of Bookkeepers (practices), IPSE (contractors) and Enterprise Nation (small companies). The contact route of each is not confirmed; WDM15 finds it.

## 4. Paid channels

There is no paid search until the free channels show a sign-up rate from the landing pages (decision D1, section 7); WDM18 then prepares it. The bid and budget rules of `MARKETING_GUIDANCE.md` apply to any paid change.

## 5. Measurement

### 5.1 The funnel, by `utm_source`

| Step | Figure | Source | Exists |
| --- | --- | --- | --- |
| Visit | landings whose `utm_campaign` is `watch-due` | `v_paid_landings_daily.utm_landings` | yes |
| Sign-up | accounts whose first `login` event and earliest `account-acquisition` event are both that day, by that event's source | `login` (`app/functions/auth/signInActivityPublish.js`) and the `account-acquisition` activity event | WDM2 adds the second |
| Watch list add | accounts that added a company | `activity-started` for `company-watch-list` | WDM3 adds |
| Due list view | accounts that opened the due list | `activity-completed` for `due-list` | WDM3 adds |
| Paid bundle | accounts with a first paid charge | `v_paid_subscribers_by_channel` | yes |

The four account rows count only accounts whose earliest `account-acquisition` event has `utmCampaign` `watch-due`, as the visit row counts only `watch-due` landings. So a DON1 or FSB pass with the same `utm_source` and another campaign does not count. WDM4 joins these in one view, by day and `utm_source`, and puts a 30-day table on the operator dashboard. GA4 gets `sign_up`, `watch_list_add` and `due_list_view` events (WDM2, WDM3) for the consenting visitors.

The visit row counts every visit. The four account rows count only visitors who accept the cookie banner, because the page stores the landing only after consent (`web/public/lib/analytics.js:116-118`) and WDM2 reads it from there. About 13% of visits accept (the `campaign` skill, "Monthly organic read"), so the account rows are floors. A stop rule in section 6 reads the visit row or the pass redemptions against a fixed count, and an account row only against a limit set from its own first reading.

### 5.2 Search

WDM4 adds the three landing pages to a family `campaign page` in `v_search_console_pages_daily`, so the `campaign` skill's monthly organic read reports them.

## 6. Stop rules

A campaign session (WDM9) reads the figures of section 5 and applies these. Each rule names the period it reads.

| Channel | Rule |
| --- | --- |
| Search pages | 8 weeks after a page is indexed, fewer than 50 impressions a month: rewrite its title and description once. 8 weeks later, still fewer than 50: write no further page for that audience. The page stays. |
| Listing register | A live listing with no landing in 90 days gets no further copy update. |
| Forums and newsletters | Fewer than 10 landings from a place in six weeks of posted drafts: change the place. |
| Spreadsheets site | Fewer than 20 landings a month after two months: move the link higher on the download page once, then leave it. |
| Donor emails | Fewer than 10 landings with `utm_source=donors` in three months: rewrite the `[UPDATE]` paragraph. The pass itself follows DON1's rule. |
| Partner passes | Fewer than 10 redemptions of a pass in six weeks after the partner shares it: make no further pass for that partner. |
| Paid search | The rules of `MARKETING_GUIDANCE.md` ("Bid and budget rules"), with a WDM4 sign-up in place of the day-pass grant: read cost per click until 50 clicks; then stop when the cost per sign-up is above the limit and the sign-ups do not rise against the period before. The limit is set from the first reading of WDM4 sign-ups, as that section sets the £22 limit from the first reading of day-pass grants. |

## 7. Decisions

Operator, 2026-11-22.

| # | Decision | Design |
| --- | --- | --- |
| D1 | Paid search for company deadline queries | None until the free channels show a sign-up rate from the landing pages. WDM18 then prepares a Google Search campaign (£2 a day, about £61 a month, about 55 clicks a month at £1.11 a click, not confirmed for these queries), judged by the stop rule. |
| D2 | What a partner pass gives | A CP1 pass per partner that grants Resident Ltd for a year (`P1Y`), up to 500 redemptions, for partner bodies only, as OOS44 does for VAT. It costs at most £9.99 a year of revenue per redeemer who would have paid, and needs a hidden `resident-ltd-comp` bundle (WDM14). |

Both the due list and the reports are in the `default` bundle (decision D2 of `PLAN_DUE_LIST.md`, D1 of `PLAN_COMPANY_REPORTS.md`), so this plan's messages state them as free with a sign-in.

## 8. Tasks

### 8.1 The task table

| Label | Task | Waits on | Class | Model | Size |
| --- | --- | --- | --- | --- | --- |
| WDM2 | Record the source of an account at its first sign-in | nothing | machine-only | Sonnet | ~7 files |
| WDM3 | Count a watch list add and a due list view | DUE6 (`PLAN_DUE_LIST.md`) | machine-only | Sonnet | ~7 files |
| WDM4 | The campaign funnel view and dashboard table | WDM3 | machine-only | Sonnet | ~12 files |
| WDM5 | The watch list landing page and its links | nothing | machine-only | Sonnet | ~14 files |
| WDM6 | The due list landing page and its links | DUE14 (`PLAN_DUE_LIST.md`), WDM5 | machine-only | Sonnet | ~12 files |
| WDM7 | The company check landing page | CR14, WDM6 | machine-only | Sonnet | ~7 files |
| WDM8 | The `campaign` skill learns the company deadline questions | WDM5, WDM4 | machine-only | Sonnet | 1 file |
| WDM9 | Campaign sessions and posting | WDM8, WDM4 | human-driven | | 0 files |
| WDM10 | Links from the spreadsheets site | WDM5 | machine-only | Sonnet | ~3 files |
| WDM11 | The listing copy sitting file | MA1 (section 8.3), DUE14 | machine-only | Sonnet | 1 file |
| WDM12 | Update the live listings | WDM11 | human-driven | | 0 files |
| WDM13 | The donor email update paragraph | DUE14 | machine-only | Opus | 1 file |
| WDM14 | The `resident-ltd-comp` bundle | CP1 | machine-only | Sonnet | ~5 files |
| WDM15 | Draft the partner proposals | DUE14 | machine-only | Opus | 1 file |
| WDM16 | Send the partner proposals | WDM15 | human-driven | | 0 files |
| WDM17 | Make each partner's pass | a partner's yes | human-driven | | 0 files |

WDM18 is briefed below and is boarded when the free channels show a sign-up rate. WDM5, WDM6 and WDM7 edit `scripts/filing-pages.toml`, `web/public/sitemap.xml`, `lighthouse.config.json` and `i18n/cy.toml`, so they land in that order.

### 8.2 Briefs

Each brief stands alone. Line numbers drift, so each names its anchor text. Every machine task in this repository has these gates: `npm run bundle` first in a worktree; `npx eslint` and `npx prettier --check` on each changed file; Welsh strings in `i18n/cy.toml` beside the English, then `npm run build:welsh`; a new module carries an `@capability` header and `npm run capabilities:generate`; `./mvnw clean verify` when a route or stack changes, with the stack's resource total against CloudFormation's 500 named in the pull request.

#### WDM2. Record the source of an account at its first sign-in

- **Goal.** Every account that signs in after landing from a tagged link has one recorded source, whether or not it ever requests a bundle.
- **Check first.** Whether an account that holds only `default` writes a bundle record. Write the answer in the pull request.
- **Route.** `app/functions/account/accountAcquisitionPost.js`, `POST /api/v1/account/acquisition`, authenticated as `activityStartedPost.js` is. It takes the landing fields, cleans them with `buildAcquisitionMap` (`app/lib/acquisition.js`), and publishes one activity event `account-acquisition` with `publishActivityEvent`, whose `detail` holds `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `ref` and `landedAt`, the field names of the session beacon. Click ids (`gclid`, `msclkid`) are left out. Express route in `app/bin/server.js`; API Gateway route beside the activity route.
- **Page.** In `web/public/auth/loginWithCognitoCallback.page.js`, after a sign-in, when `localStorage` holds `attribution.landing`, post it once with `keepalive`, never awaited, so the sign-in is never delayed. Fire the GA4 event `sign_up` with `method` when `gtag` exists. The view takes the earliest event per account, so a repeat post does no harm.
- **Tests.** Unit tests of the route: an unknown field dropped, a click id dropped, a 401 without a token, the event's detail. A browser test of the callback: the post is made with the stored landing and not made without it.
- **Waits on**: nothing. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~7 files.

#### WDM3. Count a watch list add and a due list view

- **Goal.** A watch list add and a due list view each write an activity event with the hashed sub, and a GA4 event.
- **Watch list.** On each "Add to watch list" control (WL1's `watchList.html` and the profile of `companySearch.html`), add `data-activity-start="company-watch-list"`. Fire the GA4 event `watch_list_add` when `gtag` exists.
- **Due list.** On `web/public/due.html`, mark the page with `data-activity-view="due-list"` and the completion that `web/public/submit.js` reads (anchor: "carrying data-activity-view"). Add `"due-list"` to `VIEW_ACTIVITY_IDS` in `app/functions/account/activityStartedPost.js`. Fire `due_list_view` when `gtag` exists.
- **Not key events.** `infra/google/ga4/analytics.toml` keeps its four key events.
- **Tests.** The unit test of `activityStartedPost.js` accepts `due-list` completed; browser tests assert the beacon request on an add and on the due list load.
- **Waits on**: DUE6 (`PLAN_DUE_LIST.md`). **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~7 files.

#### WDM4. The campaign funnel view and dashboard table

- **Goal.** The operator dashboard shows the funnel of section 5.1 for the last 30 days, one row per `utm_source`.
- **View.** `infra/main/resources/analytics/views/v_watch_due_funnel_daily.sql`, registered in `BusinessViews.java`. One row per day and `utm_source`: `landings` (the sum of `utm_landings` from `v_paid_landings_daily` where `utm_campaign = 'watch-due'`, on any page, so the pass, listing and donor links count too); `sign_ups` (accounts whose earliest `login` event and earliest `account-acquisition` event both fall on the day; an existing account has an earlier `login` and does not count); `watch_list_adders` and `due_list_viewers` (distinct hashed subs with the WDM3 events); `paid` (accounts with a first live paid charge on the day, linked to the hashed sub through the subscriptions as `v_paid_subscribers_by_channel` does). Each account column takes the `utmSource` of the account's earliest `account-acquisition` event (`detail_json` in `activity_events_all`) and counts the account only when that event's `utmCampaign` is `watch-due`. Customer accounts only (`actorClassOf` in `app/lib/operatorSnapshot/dataSection.js`). Raise the `AWS::Athena::NamedQuery` counts and `VIEW_COUNT` in the three tests that `NEXT.md`'s dashboard shared facts name. Run the view on ci as `SELECT * FROM (<view sql>) LIMIT 0`.
- **Search family.** In `v_search_console_pages_daily.sql`, add the paths of the three landing pages as family `campaign page`.
- **Dashboard.** A table "Watch list and due list campaign, last 30 days" with the five columns, counts under 3 shown as "fewer than 3": a `buildWatchDueFunnel` beside `buildPaidSubscribers` in `app/functions/analytics/operatorSnapshotPublish.js` puts the rows in the snapshot, and `web/public/operator/dashboard.page.js` draws them. Update `web/browser-tests/operatorDashboardFixtures.js`, and `scripts/dashboard-review-checks.mjs` if it lists tables by name.
- **Gates.** The dashboard gates in `NEXT.md`'s shared facts; `visual-review` on the new table.
- **Waits on**: WDM3. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~12 files.

#### WDM5. The watch list landing page and its links

- **Goal.** A public page `watch-a-company.html` that answers "how do I keep track of a company's Companies House deadlines", and links to the watch list from the pages that already rank.
- **Page.** An `[[article]]` in `scripts/filing-pages.toml`, built by `npm run build:filing-pages`. Sections: what the watch list shows (name, number, status, next accounts and confirmation statement dates, read from the Companies House register, up to 50 companies); where the dates come from (the source line of `company-filing-deadlines.html`); `#bookkeepers` (section 2.4's message, with the Resident Tax Agent line through `prices`); what filing costs (Resident Ltd and the confirmation statement through `prices`). Action: sign in and open `/companies-house/watchList.html`. The `tools_card` field puts it on `tools.html`.
- **Prices in an article.** `renderArticlePage` reads no catalogue today. Give it the catalogue and an optional section field `prices`: a list of bundle and activity ids, each rendered with its default price from `web/public/submit.catalogue.toml`. An id that prod does not list renders nothing: a bundle by the rule of `isListedInEnvironment` in `web/public/lib/bundle-listing.js` (a bundle with no `listedInEnvironments`, such as `resident-vat`, is listed everywhere), an activity by its `environments`. So no price is typed, and the Resident Tax Agent line shows only after UH1. Unit tests in `web/unit-tests/filingPages.test.js`: a listed bundle renders its price; a bundle with no `listedInEnvironments` renders its price; an unlisted one renders nothing.
- **Links.** A "Watch this company" link on each result of the public deadline lookup (`web/public/lib/company/deadline-lookup.js`) to CL1's address `/companies-house/company/<CRN>`, whose profile carries WL1's "Add to watch list". A line "Keep track of this company's next filing dates" linking `watch-a-company.html` on `dormant-company-accounts.html`, `micro-entity-accounts.html`, `small-company-accounts.html` and `confirmation-statement.html`: an optional `related` list on `[[page]]` entries, rendered by `otherPagesHtml` in `scripts/build-filing-pages.mjs` beside `lookup_in`.
- **New public page.** The five things of `PLAN_ORGANIC_SEARCH.md` section 8.4.
- **Tests.** `npx vitest run web/unit-tests/filingPages.test.js web/unit-tests/seo-validation.test.js app/unit-tests/scripts/lighthouseMulti.test.js web/unit-tests/welsh-pages.test.js`; a browser test of the lookup's new link. `visual-review` on the new page.
- **Waits on**: nothing. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~14 files.

#### WDM6. The due list landing page and its links

- **Goal.** A public page `company-filing-and-payment-dates.html` that answers "what does my company have to file and pay, and when".
- **Page.** An `[[article]]` in `scripts/filing-pages.toml`. Sections: what the due list shows (filings and payments from Companies House, HMRC and the dates the user enters, soonest first, each with its source and when it was last read); `#directors` (section 2.1); `#contractors` (section 2.3; the CT600 line from the section field `status` with activity `file-company-tax-return`, which reads `AVAILABILITY`); `#dormant` (section 2.2, linking `dormant-company-accounts.html`); reminders and the calendar feed; what filing costs, through WDM5's `prices`. Action: sign in and open `/due.html`. A `tools_card`.
- **Links.** A line linking the new page from `dormant-company-accounts.html` and `confirmation-statement.html` through WDM5's `related` list, and a link in the text of a section of `watch-a-company.html`.
- **New public page.** The five things of section 8.4.
- **Tests.** As WDM5. `visual-review` on the new page.
- **Waits on**: DUE14 (`PLAN_DUE_LIST.md`; the due list on prod), WDM5 (shared files). **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~12 files.

#### WDM7. The company check landing page

- **Goal.** A public page `check-a-company.html` that answers "how do I check a UK company", with section 2.5's message.
- **Page.** An `[[article]]` with a company search that opens `/companies-house/company/<CRN>/reports` (the lookup widget of `company-filing-deadlines.html`, with its target changed by a field). Sections: the six reports, one line each; where the figures come from, with the source line of `PLAN_COMPANY_REPORTS.md` section 3.5 in the wording of its decision D5; "Add to watch list". A `tools_card`.
- **New public page.** The five things of section 8.4. Tests as WDM5; `visual-review` on the new page.
- **Waits on**: CR14 (the reports on prod), WDM6 (shared files). **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~7 files.

#### WDM8. The `campaign` skill learns the company deadline questions

- **Goal.** A campaign session for this campaign finds and answers company filing questions.
- **Edit.** In `.claude/skills/campaign/SKILL.md`: step 2 gains the question shapes "when are my company accounts due", "confirmation statement due date", "file dormant accounts myself", "keep track of client deadlines", "check a company before I trade with it", with the threads to skip (advice an accountant gives; a CT600 question while the CT600 is not on prod). Step 3 gains the price lines of section 1.2 for a company question, and the link rule: a draft links the page of the asker's audience, written into the skill (directors and contractors `company-filing-and-payment-dates.html`, dormant and property companies `dormant-company-accounts.html`, practices `watch-a-company.html`, company checks `check-a-company.html`; `company-filing-deadlines.html` while a page is not live), with `utm_source=<place>&utm_medium=forum&utm_campaign=watch-due&utm_content=<audience>`, or the help item when the place forbids links. Step 1 gains the funnel table of WDM4 as the figures for the goal "watch list adds and due list sign-ups".
- **Waits on**: WDM5, WDM4. **Class**: machine-only. **Repository**: submit (a `.claude/**` change goes straight to `main`). **Model**: Sonnet. **Size**: 1 file.

#### WDM9. Campaign sessions and posting

- **Goal.** At least one campaign session a month with the goal "watch list adds and due list sign-ups", until the stop rules of section 6 end a place.
- **Steps.** 1. The operator runs `/campaign watch list adds and due list sign-ups`. 2. The operator or Matthew opens the review queue (https://claude.ai/artifact/FdKLWPhouk8swyX6z6Lt2G), reads each draft, posts it from their own account, and ticks Posted.
- **Waits on**: WDM8, WDM4. **Class**: human-driven. **Owner**: operator. **Size**: 0 files.

#### WDM10. Links from the spreadsheets site

- **Goal.** A visitor who downloads a spreadsheet package sees a link to the company filing dates.
- **Approved.** The operator approved the links on 2026-11-22; the session builds them when WDM5 is live (`orient-spreadsheets`).
- **Change.** In the sibling repository, after `orient-spreadsheets`: on `web/spreadsheets.diyaccounting.co.uk/public/download.html`, in the thanks and download steps (anchor "File this return with HMRC"), add "See when your company's accounts and confirmation statement are due", linking `https://submit.diyaccounting.co.uk/company-filing-deadlines.html?utm_source=spreadsheets&utm_medium=download&utm_campaign=watch-due`; the same line on the limited company product page that `app/lib/product-pages.js` writes. That repository's `npm test` router and `npx prettier --check`.
- **Waits on**: WDM5. **Class**: machine-only (approved 2026-11-22). **Repository**: spreadsheets. **Model**: Sonnet. **Size**: ~3 files.

#### WDM11. The listing copy sitting file

- **Goal.** One file that the operator works through to add the watch list and the due list to each live listing.
- **Output.** `../private.diyaccounting.co.uk/strategy/marketing/WATCH_DUE_LISTINGS_SITTING.md`: for each `[[listing]]` of `web/marketing/marketing.toml` with `state = "live"`, the profile URL, the field to change (features, description) and the exact text from MA1's packs. Every link carries `utm_source=<the listing's utmSource>&utm_medium=listing&utm_campaign=watch-due`, so WDM4 counts its landings. Read each profile in Chrome, read-only, to name its fields.
- **Waits on**: MA1 (section 8.3), DUE14 (`PLAN_DUE_LIST.md`). **Class**: machine-only. **Repository**: private. **Model**: Sonnet. **Size**: 1 file.

#### WDM12. Update the live listings

- **Goal.** Each live listing names the watch list and the due list.
- **Steps.** The operator opens WDM11's file and makes each change on each profile.
- **Waits on**: WDM11. **Class**: human-driven. **Owner**: operator. **Size**: 0 files.

#### WDM13. The donor email update paragraph

- **Goal.** The `[UPDATE]` text of the donor thank-you reply names the watch list and the due list, in the operator's voice.
- **Output.** Through the `email-draft` skill, one paragraph of three or four sentences in `../private.diyaccounting.co.uk/strategy/marketing/DONOR_THANK_YOU_TEMPLATE.md`, beside the `[UPDATE]` slot: what each list shows, that both are free with a sign-in, and the link `https://submit.diyaccounting.co.uk/company-filing-and-payment-dates.html?utm_source=donors&utm_medium=email&utm_campaign=watch-due`. The operator pastes it under DON1.
- **Waits on**: DUE14 (`PLAN_DUE_LIST.md`). **Class**: machine-only. **Repository**: private. **Model**: Opus. **Size**: 1 file.

#### WDM14. The `resident-ltd-comp` bundle

- **Goal.** A CP1 pass can grant Resident Ltd for a year.
- **Change.** A hidden bundle `resident-ltd-comp` in `web/public/submit.catalogue.toml` that `includes = ["resident-ltd"]`, made as CP1 makes `resident-vat-comp`; the four catalogue tests of `NEXT.md`'s shared facts. State in the pull request whether the confirmation statement's per-filing price (£61.35) applies through the comp bundle.
- **Waits on**: CP1. **Class**: machine-only. **Repository**: submit. **Model**: Sonnet. **Size**: ~5 files.

#### WDM15. Draft the partner proposals

- **Goal.** One short proposal for each body of section 3, through the `email-draft` skill.
- **Content.** What the watch list and the due list show for that body's members (section 2.4 for the bookkeeping bodies, 2.3 for IPSE, 2.1 for Enterprise Nation); the prices; the offer of a year of Resident Ltd through a link that members can use for six months; "There is no cost to <body>." Each link in a proposal carries `utm_source=<body>&utm_medium=partner&utm_campaign=watch-due`. Find each body's partnerships contact route and write it with its source URL.
- **Output.** `../private.diyaccounting.co.uk/strategy/marketing/WATCH_DUE_PARTNER_PROPOSALS.md`.
- **Waits on**: DUE14 (`PLAN_DUE_LIST.md`). **Class**: machine-only. **Repository**: private. **Model**: Opus. **Size**: 1 file.

#### WDM16. Send the partner proposals

- **Goal.** Each proposal reaches its body.
- **Steps.** The operator reads each draft in WDM15's file and sends it from his own address, or posts it to the body's form.
- **Waits on**: WDM15. **Class**: human-driven. **Owner**: operator. **Size**: 0 files.

#### WDM17. Make each partner's pass

- **Goal.** A body that agrees gets its own link.
- **Steps.** On CP1's operator page, the operator makes one pass per body: grant `resident-ltd-comp` for `P1Y` with the bundle's own tokens; redemption window 6 months; total redemptions 500; one redemption per account; link with `utm_source=<body>&utm_medium=partner&utm_campaign=watch-due`. He sends the link to the body.
- **Waits on**: a body's yes. **Class**: human-driven. **Owner**: operator. **Size**: 0 files.

#### WDM18. Paid search for company deadline queries

- **Goal.** The paid campaign of D1, ready to start on the operator's word.
- **Change.** In `infra/google/ads/ads.toml`, a Search campaign with `status = "PAUSED"`, the budget D1 names, UK by presence, the keywords "company accounts due date", "confirmation statement due date", "when are my accounts due" and their relatives, the negative list of the existing campaign, and `final_url_suffix = "utm_source=google&utm_medium=cpc&utm_campaign=watch-due&utm_term={keyword}"` landing on `company-filing-deadlines.html`. Run the forecast (`ads-advisor` skill) and write the clicks and cost per click it gives in the pull request.
- **Ask.** The campaign spends only when the operator says "start" and its status changes to enabled; the reading date goes in `MARKETING_GUIDANCE.md`'s decision log with the change.
- **Waits on**: a sign-up rate from the landing pages in WDM4's view, then the operator's word on the budget (D1), WDM4, WDM5. **Class**: machine-ask. **Repository**: submit. **Model**: Sonnet. **Size**: ~2 files.

### 8.3 State of the open tasks

Source of each task: the operator, 2026-11-22. Owner is Claude Code, except WDM9, WDM12, WDM16 and WDM17 (Operator). Model, size and repository are in the table of section 8.1. "Waits on" lists the tasks not yet on `main`; the briefs' "Waits on" lines list every dependency.

| Label | Class | State | Waits on | Unblocks | Repository |
| --- | --- | --- | --- | --- | --- |
| WDM3 | machine-only | blocked | DUE6 (`PLAN_DUE_LIST.md`) | WDM4 | submit |
| WDM4 | machine-only | blocked | WDM3 | WDM8, WDM9, WDM18 | submit |
| WDM5 | machine-only | ready | nothing | WDM6, WDM8, WDM10, WDM18 | submit |
| WDM6 | machine-only | blocked | DUE14 (`PLAN_DUE_LIST.md`), WDM5 | WDM7 | submit |
| WDM7 | machine-only | blocked | CR14 (`PLAN_COMPANY_REPORTS.md`), WDM6 | nothing | submit |
| WDM8 | machine-only | blocked | WDM5, WDM4 | WDM9 | submit |
| WDM9 | human-driven | blocked | WDM8, WDM4 | nothing | none |
| WDM10 | machine-only | blocked | WDM5 | nothing | spreadsheets |
| MA1 | machine-only | blocked | DUE14 (`PLAN_DUE_LIST.md`) | WDM11 | submit |
| WDM11 | machine-only | blocked | MA1, DUE14 (`PLAN_DUE_LIST.md`) | WDM12 | private |
| WDM12 | human-driven | blocked | WDM11 | nothing | none |
| WDM13 | machine-only | blocked | DUE14 (`PLAN_DUE_LIST.md`) | nothing | private |
| WDM15 | machine-only | blocked | DUE14 (`PLAN_DUE_LIST.md`) | WDM16 | private |
| WDM16 | human-driven | blocked | WDM15 | WDM17 (through a body's yes) | none |
| WDM17 | human-driven | blocked | a body's yes | nothing | none |

- WDM10: the operator approved the links on 2026-11-22. The session builds them when WDM5 is live.
- WDM6, WDM11, WDM13 and WDM15 start when DUE14 is on prod.
- WDM5, WDM6 and WDM7 land in that order (shared files).

#### MA1. Marketing assets for the company drill-down, the watch list and the due list (moved from `NEXT.md`)

When the due list's launch (DUE14, `PLAN_DUE_LIST.md`) is on prod: write a scene script for each (`videos/<name>.json`, the `site-video-capture` skill) and record it on the simulator lane; upload each unlisted with the `video-publish` skill, which stops there until the operator has watched it; take the guide screenshots (`npm run video:walkthrough`) and the site screenshots of the new pages; add a `[[listingProduct]]` pack for each feature to `web/marketing/marketing.toml` (name, tagline, the short and long descriptions within `[[packFields]]`, keywords, features, screenshots and videos) and run `npm run marketing:build` (the three lists in `web/unit-tests/marketing-site.test.js` change only when an entry goes live); and link each pack and video from `PLAN_WATCH_DUE_CAMPAIGN.md`. Run `visual-review` on the screenshots and the `ui-ux-pro-max` skill on the guide's pages. Blocked on DUE14. **Source**: operator, 2026-11-22. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~10 files. **Repository**: submit. **Class**: machine-only. **State**: blocked. **Blocked by**: DUE14 (`PLAN_DUE_LIST.md`). **Unblocks**: WDM11.

#### Facts for the spreadsheets task WDM10 (moved from `NEXT.md`'s shared facts)

WDM10 shares these facts; so do AA20 and AA35 of `PLAN_AMENDED_ACCOUNTS.md` and the GLS rows of `PLAN_DIYA_GL_STANDARDS.md` whose repository is spreadsheets, which carry them in their plans. `orient-spreadsheets` comes first, and a worktree comes from that repository's `scripts/worktree-add.sh`. An agent runs only the tests that its change reaches, with `VITEST_MAX_WORKERS=2`, and `npx prettier --check` on its files. The pre-push hook (`.githooks/pre-push`) runs the scoped suite, so a task branch is pushed with `SKIP_PUSH_TESTS=1`, and its browser and LibreOffice proof is `test.yml` on the pull request. `deploy.yml` there runs on a push to any branch that touches `web/spreadsheets.diyaccounting.co.uk/**`, `web/diya-gl.co.uk/**`, `app/lib/**`, `app/data/**`, `app/products/**`, `app/templates/**` or `examples/**`, and it deploys the one spreadsheets ci environment. The engine bundle and the package templates are on the DIYA-GL site (`web/diya-gl.co.uk/public/`), and SY2's build copies the engine and the Ltd package templates to the spreadsheets site (`web/spreadsheets.diyaccounting.co.uk/public/`). The `connect-src` of both sites names `https://submit.diyaccounting.co.uk` (`infra/main/resources/security-headers.json`, `infra/main/resources/diya-gl-security-headers.json`), so a page there calls prod's Submit from prod and from ci.

## 9. Not confirmed

- Whether an account that holds only `default` writes a bundle record (WDM2 checks).
- The cost per click of company deadline queries; £1.11 is the VAT queries' figure of October 2026.
- Search volumes for company deadline queries; none were obtained.
- The partnerships contact route of each body in section 3.
- Whether the confirmation statement's per-filing price applies to an account that holds Resident Ltd through a comp bundle (WDM14 checks).
