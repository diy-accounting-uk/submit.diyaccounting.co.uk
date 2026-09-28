<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->
# PLAN: diya-gl launch — the free face, the tech community, the paid tier

> The work this plan describes is in `../spreadsheets.diyaccounting.co.uk/`; bare paths are relative to that repository's root. Its rows are on this repository's `NEXT.md`.

The BST DIYA-GL page shipped on 2026-09-03 (PR #57) and proved the thing this plan sells: a
full year of a sole trader's accounts fits in a 15 KB zip, recalculates in a browser or on a
command line without Excel or a server, and produces the same bytes on every surface. Self
Employed, Taxi and Limited Company followed by 2026-09-06 (PRs #60 to #68): four products on
the page, in the CLI and in the MCP server, each reconciled in CI, their plans archived under
`../developers/spreadsheets/archive/`. This document turns that into a product line with a revenue stream,
checks the operator's sketch against the market and the arithmetic, and lays out a launch
sequence with gates. State lines are as of 2026-09-06.

## User assertions (verbatim)

> I was thinking of launching a product here. Take the above into this conversation and help me propose a sound revenue stream for the DIY spreadsheets site. First publicity, the spreadsheets website has the local running version packages for non technical desktop users available on a donation basis like the spreadsheets and the distro they get includes the versioning and provenance you suggest above and just the extraction and templates for the chosen product and this can also generate the .xlsx version (packaging TBD) so that is the commercila public face, and it's also going to be possible to `npm run from a public package...` which can be launched to a tech community along with the diya-gl schema as a work to represent a useful and declared subset of accounting standards (even better if we could certify this compliance). Perhaps rust ports (against the same provence tests) and docker and brew coverage etc... Then.... the commerciual offering is a 99p/month spreadsheets subscription which is storage of their diya-gl zip, a profile and a cognito user (social federated auth via google) using the same cognito client as the submit account but through the additional spreadsheets domain. Then... the paid tier is a small conversion of free/donation users wanting cloud storage and online (desktop and mobile) as well as an audience from the npm package users wanting to send users to a white labelled online accounting service that integrates with MTD. Start writing a doc for this, think, do web searches, debunk, extend, plan.

> No, 99p / month is my ONLY actual customer success on submit, keep it: [...] no tiers, it's
> free offline or 99p / month cloud, no founder stuff, it's buildable in a day we could be live
> tonight if I felt like it.

## Thesis

Sell ownership, then convenience, then filing. The free face gives every UK sole trader a
set of accounts they own outright: a 15 KB file, a page that reads it, a tool that
recalculates it, and the spreadsheet they already trust generated from it. The tech
community gets the same engine as a package and a published format, which is the cheapest
credibility this company can buy. The paid tier stores that file, keeps its versions, and
syncs it between devices, priced so low that the question is not "is it worth it" but "why
not". Making Tax Digital for Income Tax is the reason a sole trader will need software at
all from April 2026, and Submit is already HMRC-recognised for VAT, so the filing tier is a
path this company can walk rather than a claim it has to make. The certification the operator wants does not
exist as such; the credible substitutes are HMRC recognition and published, reproducible
proof. The 99p headline is billed monthly, as decided; section 3 carries the fee that costs.

## 1. The market

**Size.** The UK had 5.7 million private sector businesses at the start of 2025, of which
about 3.2 million (57%) were sole proprietorships; at the start of 2024, 52% of the 5.5
million businesses were unregistered for VAT or PAYE, about 3 million businesses trading
below the registration thresholds ([money.co.uk, citing the Department for Business and
Trade's Business Population Estimates](https://www.money.co.uk/business/business-statistics),
read 2026-09-03). That unregistered half is the spreadsheets site's audience today and the
DIYA-GL page's audience tomorrow.

**The forcing event.** Making Tax Digital for Income Tax becomes mandatory for sole traders
and landlords with qualifying income over £50,000 from 6 April 2026, over £30,000 from April
2027, and over £20,000 from April 2028 ([GOV.UK: Find out if and when you need to use
Making Tax Digital for Income
Tax](https://www.gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax),
read 2026-09-03). Those in scope must keep digital records, send quarterly updates, and
file the final return through recognised software. A spreadsheet on its own stops being
enough for anyone above the threshold.

**What HMRC promises about free software.** The guidance says: "free products are available
for those with simple tax affairs but there may be limits on how the product can be used,
for example they could have a limited number of transactions" ([GOV.UK: Choose the right
software](https://www.gov.uk/guidance/choose-the-right-software-for-making-tax-digital-for-income-tax),
read 2026-09-03). HMRC's list carries more than 30 products with a free version, including
Sage Individual, Clear Books Free, QuickFile (free up to 1,000 ledger entries) and My Tax
Digital's bridging mode ([mtd.digital list](https://mtd.digital/mtd-income-tax/free-mtd-software/),
read 2026-09-03). Free is the floor of this market, so the free face has to be better than
free software, which is what "you own the file" is for.

**What "HMRC recognised" means and how to get it.** Recognition is HMRC's production
approval for its APIs: register a production application on the Developer Hub, test in the
sandbox, return the Production Approvals Checklist, meet the minimum functionality standards
(for Income Tax that includes submitting quarterly updates for each mandated income source),
and pass HMRC's review of the testing and fraud-prevention headers ([HMRC service guide: how
to
integrate](https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/how-to-integrate.html),
read 2026-09-03). HMRC does not recommend products; listing means the process was passed.
Submit already holds recognition for VAT (its README says so, with the required "not
endorsed, approved or certified" wording). One hard fact governs the timeline: the service
guide as updated on 7 August 2026 states that HMRC "is no longer accepting production
credential access requests for new 2026–27 quarterly update products, as the market window
for these products has now closed" ([HMRC end-to-end service
guide](https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/),
read 2026-09-03 via search excerpt; confirm on the page before planning against it). The
earliest Income Tax listing this company can aim for is the 2027–28 product cycle, which is
also when the £30,000 threshold brings the bulk of this site's audience into scope.

**Can the schema be certified?** No body certifies an accounting data schema. The credible
claims are narrower and stronger:

- The line and book field names are drawn from the XBRL Global Ledger Taxonomy Framework
  2015, the XBRL Standards Board's recommendation of 25 March 2015 ([XBRL
  International](https://specifications.xbrl.org/work-product-index-xbrl-gl-xbrl-gl-2015.html),
  read 2026-09-03). That is a lineage, not a conformance mark; XBRL GL has no certification
  programme and thin adoption, and the schema's own description already says "adapted from".
- FRS 105 is the micro-entities financial reporting standard, applicable from 1 January
  2016 ([FRC](https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/uk-accounting-standards/frs-105/),
  read 2026-09-03). It governs company accounts, so it bears on the Limited Company product,
  and alignment is something to demonstrate with a mapping and a test, never to certify.
- HMRC recognition is the only third-party mark customers recognise, and it attaches to a
  filing product, which is Submit.

So "a useful and declared subset of accounting standards" should be worded as exactly that:
a declared subset, published with the mapping from every field to its XBRL GL element, from
every computed figure to its SA103S box, and with the reconciliation evidence that the
figures match the spreadsheets HMRC's own customers have filed from for twenty years. That
is a stronger claim than a badge nobody issues.

## 2. Competitors and price anchors

| Product | Sole-trader price | Free tier | Note |
| --- | --- | --- | --- |
| FreeAgent | included free with a Mettle or NatWest/RBS business account, one transaction a month required; "saving up to £150 per year" | yes, via the bank | [FreeAgent](https://www.freeagent.com/mettle/), read 2026-09-03 |
| QuickBooks Sole Trader | £10/month after £1/month for six months | no | [Startups.co.uk](https://startups.co.uk/accounting/quickbooks-cost/), read 2026-09-03 |
| Xero Ignite | £16/month, £2.40/month for six months on offer | no | [Xero UK](https://www.xero.com/uk/pricing-plans/ignite/), read 2026-09-03 |
| Sage Individual | free, MTD Income Tax for sole traders with basic needs | yes | [mtd.digital](https://mtd.digital/mtd-income-tax/free-mtd-software/), read 2026-09-03 |
| Coconut | from about £8/month; Full about £13.33/month billed annually | no | [Coconut pricing](https://www.getcoconut.com/pricing), read 2026-09-03 |
| ANNA | £0 pay-as-you-go; Business £19.90 + VAT | yes | [ANNA pricing](https://anna.money/pricing/), read 2026-09-03 |
| Pandle | free forever; Pro £5 + VAT | yes | [Pandle pricing](https://www.pandle.com/pricing/), read 2026-09-03 |
| Bokio UK | closed 7 July 2026 | was free | [accountingstack.co.uk](https://accountingstack.co.uk/accounting-software/reviews/bokio/), read 2026-09-03 |
| QuickFile, Clear Books Free, My Tax Digital | free (QuickFile to 1,000 entries; My Tax Digital bridging) | yes | [mtd.digital](https://mtd.digital/mtd-income-tax/free-mtd-software/), read 2026-09-03 |
| GnuCash, hledger, beancount, ledger-cli | free, open source, plain-text or desktop | yes | the tech community's own tools; none files MTD |

Three readings of that table:

1. **Free is crowded and bank-subsidised.** FreeAgent free with a Mettle account is the
   strongest offer a sole trader can get today, and it files MTD. A paid tier that competes
   on features against it loses. A tier that competes on ownership, portability and price
   does not have to.
2. **£10 to £16 a month is the paid floor for real software**, with £1 to £2.40
   introductory offers as the acquisition tool. A 99p headline is a tenth of that floor and
   signals "storage and convenience", which is the honest description of the tier.
3. **Bokio's closure is the cautionary tale.** Free-forever bookkeeping with a premium
   upsell did not sustain a UK operation. The difference here is a product with a
   twenty-year donation history and near-zero marginal cost per user, which the cost table
   below shows.

For the tech community the anchors are plain-text accounting tools. None of them speaks UK
tax, none files MTD, and all of them prize a documented, diffable format and a command-line
recalculation. The diya-gl zip, `npx diya-gl recalc`, and a published schema land squarely
in that world.

## 3. The 99p question, with numbers

**Stripe on a 99p monthly charge.** Stripe's UK standard card rate is 1.5% + 20p ([Stripe
fees UK 2026](https://www.wearefounders.uk/stripe-fees-uk-2026/), read 2026-09-03), and the
minimum charge in GBP is £0.30 ([Stripe: supported currencies, minimum charge
amounts](https://docs.stripe.com/currencies), read 2026-09-03). The company's VAT position
is assumed to be unregistered: the registration threshold is taxable turnover over £90,000
in twelve months ([GOV.UK: when to register for
VAT](https://www.gov.uk/vat-registration/when-to-register), read 2026-09-03), and the
spreadsheets site is donation-funded. If that assumption is wrong, every figure below is
divided by 1.2 first.

| Billing | Charge | Stripe fee | Kept | Kept per month | Fee share |
| --- | --- | --- | --- | --- | --- |
| 99p monthly | £0.99 | £0.215 | £0.775 | £0.78 | 21.7% |
| 99p a month billed yearly | £11.88 | £0.378 | £11.50 | £0.96 | 3.2% |
| £9.99 yearly | £9.99 | £0.350 | £9.64 | £0.80 | 3.5% |
| £2.99 monthly | £2.99 | £0.245 | £2.745 | £2.75 | 8.2% |
| £24 yearly | £24.00 | £0.560 | £23.44 | £1.95 | 2.3% |

Monthly 99p clears the 30p minimum and keeps 78p of every pound. That is the price: it is
the one price Submit's customers have actually paid, and the fee share is the cost of a
price people already understand. Premium UK cards cost 1.9% + 20p and EEA cards 2.5% + 20p
(same source), which moves the fee share past 25% on those cards.

**Churn and conversion.** Small-business SaaS runs 3% to 5% monthly churn ([Churnkey
benchmarks](https://churnkey.co/blog/whats-a-normal-churn-rate-in-saas), read 2026-09-03), so
a monthly plan loses a third to half its base a year before acquisition. Freemium converts
at 2% to 5% of active free users ([Monetizely freemium
benchmarks](https://www.getmonetizely.com/articles/freemium-conversion-rate-the-key-metric-that-drives-saas-growth-3588c),
read 2026-09-03). Donation pages for non-profits convert at about 8% of visitors who reach
the page ([Funraise donation page
benchmarks](https://www.funraise.org/tools/donation-page-conversion-rate-calculator), read
2026-09-03); that is a different audience and a different ask, so the plan uses the freemium
range and treats the site's own donation history as the better prior. The operator should
put the site's actual downloads-to-donations ratio into this section; it is the one number
this document cannot find online.

**Revenue at the freemium range.** With 10,000 active free users of the DIYA-GL page or the
local runner, 2% to 5% paying 99p a month is 200 to 500 subscribers and £1,860 to £4,650 a
year after fees. That funds hosting and support for the tier many times over (section 4)
and buys nothing else. The tier is a foundation and a data point.

**The offer.** Two things and nothing between them.

| Offer | Price | What it is |
| --- | --- | --- |
| Offline | £0, donation prompts | the site, the browser page, the local runner, the npm package, the format; the twenty-year model, ownership is the promise |
| Cloud | 99p a month, Stripe subscription, monthly billing | the file stored with versions, a profile, sign-in with Google through the spreadsheets domain, the same book on desktop and mobile |

Filing (quarterly updates through Submit when Income Tax recognition lands) is priced with
Submit when it exists; it is not a tier of this site. No founder offer, no annual plan, no
second price.

## 4. Costs and break-even

**Authentication.** Cognito's Essentials tier is $0.015 per monthly active user above
10,000 free per month; Lite is $0.0055 down to $0.0025 per MAU above the same 10,000 free;
Plus is $0.02 per MAU with no free tier; federated SAML/OIDC users get 50 free ([AWS
Cognito pricing](https://aws.amazon.com/cognito/pricing/) via [Frontegg's
summary](https://frontegg.com/guides/aws-cognito-pricing), read 2026-09-03). Google sign-in
through Cognito's social identity providers counts as a social MAU, inside the 10,000 free.
Submit's pool runs on Plus with threat protection and costs about $4 a month today for
about 50 MAU (`AWS_COSTS.md` in the Submit repository). Sharing that pool means the first
ten thousand spreadsheets users cost nothing in Cognito if the pool sits on Essentials or
Lite, and about 1.5p a user a month on Plus.

**Storage.** A book is 15 KB. Twelve versions a year is 180 KB per user per year; S3
standard storage at roughly $0.023 per GB-month makes that under a hundredth of a penny a
month per user, and CloudFront egress for a file that size is noise. Ten thousand users with
ten years of history is 18 GB.

**Payments.** Stripe's fee is the table in section 3. Stripe Billing for subscriptions adds
a percentage on top of card fees on its paid tiers; the starter tier is included with
standard pricing, and the plan assumes Submit's checkout route and customer portal, which its own
bundles already use.

**Support.** The real cost. A storage tier's tickets are sign-in problems, lost files, and
"my figures changed", which the provenance stamps (section 6) answer by design. Budget one
hour of operator time per fifty subscribers per month until the first hundred, then
measure.

| Per subscriber per month | Cost |
| --- | --- |
| Cognito (Plus, as decided) | about 1.5p |
| S3 and CloudFront | under 0.1p |
| Stripe, at 99p billed monthly | 21.5p |
| Total infrastructure | about 23p against 99p, leaving about 76p |

Break-even on infrastructure is a handful of subscribers. Break-even on the operator's time
is the only number that matters, and it is set by the support rate the first hundred
subscribers produce.

## 5. The offer ladder

### 5a. The free public face

The live pages at `spreadsheets.diyaccounting.co.uk/books/{bst,se,taxi,ltd}.html`, titled
"DIYA-GL — <Product>", are already the free face: each loads a workbook, a package zip, a
diya-gl zip or JSON by content; recalculates; shows the ledger views, the P&L, the HMRC
look-alike forms (SA103S, SA103F, the VAT return, CT600) and the tax computation; runs the
engine and book checks with their helpers; edits lines in place, including adding to the
bank, cash and payroll journals; saves the diya-gl zip and JSON; nothing leaves the machine.
The page's own workbook and package downloads were removed on 2026-09-06 (operator): the
`.xlsx` and the package come from the CLI (`app/bin/export.js --package <product> --file`)
and the MCP server's `save_workbook`, and the DIYA-GL engine bundle still carries the writer. The
gaps between that and the operator's sketch:

**The local runner for non-technical desktop users.** Four packagings, weighed:

| Packaging | Size | Signing cost | Update path | Verdict |
| --- | --- | --- | --- | --- |
| Single-file HTML, opened by double-click | about 1.2 MB with the DIYA-GL engine (794 KB measured 2026-09-06, all four products), schemas and tax data inlined; about 4 MB if the 2.5 MB BST template is inlined for `.xlsx` export | none; browsers open local HTML without a signature | download the new file; the file carries its own version stamp | first, and the "distro" the operator describes |
| PWA (install from the live page) | the site's own assets, cached | none | automatic on next visit | second; gives an icon and offline use with no build |
| Tauri app | about 3 to 10 MB | Apple Developer Program $99 a year for notarisation; Windows OV certificate about $216 a year or Azure Artifact Signing $9.99 a month | an updater to build and maintain | later, if the file-association and menu-bar experience earns it |
| Electron app | 85 to 100+ MB | as Tauri | as Tauri | no; size without benefit |

Sizes and costs: Tauri "hello world" 3.2 MB against Electron 85 MB
([tech-insider.org](https://tech-insider.org/tauri-vs-electron-2026/), read 2026-09-03);
notarisation needs a paid Apple developer account at $99 a year ([Apple developer
forums](https://developer.apple.com/forums/thread/121113), read 2026-09-03); OV code signing
certificates at $215.99 a year, with lifetimes capped at one year from 15 February 2026
([SignMyCode](https://signmycode.com/ov-code-signing), read 2026-09-03); Azure Artifact
Signing, formerly Trusted Signing, $9.99 a month for up to 5,000 signatures
([Microsoft](https://azure.microsoft.com/en-us/products/artifact-signing), read 2026-09-03).

The single-file HTML runner needs one build step: inline the DIYA-GL engine bundle, the two
schemas, the tax-year TOMLs and, for the product chosen, its template, into one page, and
stamp it. "Just the extraction and templates for the chosen product" is the build's input
list. The page already generates the `.xlsx` client-side, so the runner does too. The
operator's "packaging TBD" resolves to: HTML file now, PWA with it, Tauri only on demand.

**Donation prompts.** The DIYA-GL pages show no ask (2026-09-06); the download page now leads
only to the donation page, whose "download without donating" link is the one skip. The right moments are after a successful
save and after a year's figures first appear, each once, each dismissable, each pointing at
the existing Stripe links, with the 99p cloud offer beside them once it exists.

### 5b. The tech-community launch

**The package.** `@diy-accounting-uk/diya-gl` with three entry points: `recalc` (zip or
JSON in, `report.json` and `bookchecks.json` out), `read-workbook` (the extractors, Node
only), `write-workbook` (the generator over the templates). `npx diya-gl recalc
my-books.zip` is the demo. Not published (2026-09-06): this repository's own package is
private, and the CLI is `app/bin/report.js` and `app/bin/export.js` with no `bin` entry.
Measured on 2026-09-03 the recalc path bundled at 468 KB minified, 145 KB gzipped;
precompiling the validators (done for the browser) and leaving the workbook reader out of
the recalc entry lands near 250 KB. The MCP server exists as `diya-gl`
(`app/bin/diya-gl-mcp.js`) with four tools over all four products: `extract_book`,
`report`, `edit_lines`, `save_workbook`; it ships in the same package. The DIYA Cloud plan's
assertion 2 asks this repository for exactly this library; this is its first cut.

**The format.** Publish the two v2 schemas (served at `/schema/diya-gl-book-v2.schema.json`
and `/schema/diya-gl-lines-v2.schema.json`), the JSON Lines
convention, the zip layout, and a spec page that states the declared subset: the field
mapping to XBRL GL 2015, the box mapping to SA103S, the check catalogue, and the
reconciliation evidence. Version the format (`diya-gl-books` version 1 is already in the
JSON envelope); put the same version in `book.toml`.

**Docker and Homebrew.** Neither exists yet. A Docker image is `node:alpine` plus the
package, a one-line Dockerfile, useful for CI users. A Homebrew formula needs a tap and a release artefact; it is
a morning's work once the npm package is stable. Both follow the package; neither leads.

**A Rust port, funded (operator, 2026-09-04).** The provenance tests are the asset here:
the CI reconciliations, the byte-for-byte `report.json` on three fixtures, the check
catalogue and the roundtrip budgets give a port a complete oracle. What a port buys: a
single static binary with no runtime, a few megabytes, embeddable in other tools, and a
conversation with the plain-text accounting community that the npm package alone will not
start. What it costs, estimated from this repository's own last seven days (1,045 commits,
191 merges, sixteen coordinated tasks landed in one day on 2026-09-03 under the coordinator
model with a Fable coordinator and Sonnet/Opus workers): the recalculation core is about
4,800 lines of JavaScript (loader, canonical form, calculator, the tax modules, the check
catalogue, the report serializer, book checks, headlines, interchange); the workbook layer is
another 5,000 (the xlsx exporter, generator, template map, sidecar). A port of the core is
two to three coordinator days: a design wave (the type model, the rounding contract, which
must reproduce JavaScript's float arithmetic and the serializer's half-up canonicalisation
byte-for-byte, and the oracle harness that runs the binary over the three books and diffs
`report.json` and `bookchecks.json` against the JS), then concurrent code waves (loader and
canonical; calculator and tax; checks and serializer; the zip and JSON interchange with a
CLI), then a closing ladder that adds the Rust parity job to CI beside the JS scorecard. The
workbook layer is a second step of the same size once the core is proven, with the
template surgery as its one real risk. Four to six coordinator days in all, kept in step
with each tax year by the same oracle. The earlier estimate that it would consume the
year's engineering budget was wrong; the measured throughput says days. Its plan of record
is `PLAN_DIYA_GL_RUST.md`, not yet drafted (LP-12).

**The launch itself.** A Show HN post and an AccountingWEB piece with the same three facts:
15 KB for a year of accounts, recalculates without Excel, byte-identical across CLI, MCP and
browser. The gate is in section 7.

### 5c. The paid tier

**Identity.** One Cognito user pool, Submit's, with Google federation. A user pool has one
hosted-UI domain; the spreadsheets site does not need a second domain, it needs an app
client on the same pool with a redirect back to `spreadsheets.diyaccounting.co.uk` and the
hosted sign-in page under Submit's domain. The user then has one identity for both products,
which is the whole point of sharing the pool. If the operator wants the sign-in page itself
under the spreadsheets domain, that is a second custom domain on the same pool, which
Cognito supports one of per pool, so it means moving Submit's, and this plan advises
against it.

**Storage and sync.** The DIYA Cloud plan already decided zip-in-S3 with Cognito, in the
submit-prod account, with a metadata sidecar for optimistic concurrency. This plan changes
two of its decisions: computation moves to the client (the browser engine exists and is
proven; Lambda is needed only for storage, listing and the metadata), and `.xlsx`
generation is client-side too (the page does it today), so no LibreOffice sits in any
Lambda. The API is small: list books, get a version, put a version, delete. Sync is
last-writer-wins with the version stamp, one writer per book, and a conflict shown rather
than merged; a merge story is a horizon.

**Google Drive, and the bundle that carries both stores (operator, 2026-09-21).** A second
place to keep the book, beside Submit's S3: the reader's own Google Drive, through the same
Google identity the sign-in federates. The page saves the diya-gl zip into a `DIYA-GL` folder
on the reader's Drive with the Drive API's `drive.file` scope (files the app created; no read of
the rest of the Drive), lists the books there, and opens one back into the page. Versions are
Drive's own revision history, so the S3 sidecar's version list does not need a twin. This is the
ownership promise in cloud form: the file sits in a store the reader already pays for and can
open without this site. Saving to Drive is free and browser-only: no Submit sign-in, no bundle
(`PLAN_BOOKS_TO_SUBMIT.md`, open question 8). S3 storage is what the Resident bundle carries, at
£39 a year (`../developers/submit/archive/PLAN_PRICE_UPDATE.md`), which replaces the 99p
`resident-diya-gl` tier §3 priced; the sandbox rung stays free. Task LP-24.

**Mobile.** The page already has four layouts including mobile portrait with in-card month
editing. "Online on mobile" is the same page signed in, with the book fetched from storage
instead of a file. No app store is needed, which keeps the App Store's rules and cut out of
a 99p product.

**The path to MTD Income Tax.** The stored diya-gl book has every figure a quarterly update
needs, keyed to SA103S boxes. Submit holds the HMRC production credentials for VAT and the
fraud-prevention header work. The Income Tax path is: recognition for the 2027–28 cycle
(section 1), the quarterly update and final declaration endpoints in Submit, and a "send
this quarter" action on the DIYA-GL page for signed-in users. That is the Filing rung, priced
with Submit, and it is where the money is.

### 5d. White-label and referral

**Bank referral revenue on the free rung (operator, 2026-09-21).** FreeAgent is free because
Mettle pays for it. The free face can take the same subsidy from the other side: one disclosed
referral to a business current account, shown where a reader with no account is looking at the
sandbox and the runners, paid per funded account by the bank's partner programme. The fee levels
are unverified until the operator reads the current partner terms (Tide, Starling, Mettle,
Monzo Business are the candidates); the decision on which programme, and the sign-up, is the
operator's (LP-25a). The placement, its disclosure line, and a `referral_clicked` event are the
machine half (LP-25b). Zero support cost; the risk is independence, answered by the disclosure.

Two different ideas sit under this heading. A referral from npm users to an online MTD
service is cheap: the package's `--help` and the spec page link to the site, and the site
links to Submit. Do that at launch. A white-labelled service, where another company puts
its brand on the storage and filing tier, needs multi-tenant identity, branding, billing
and support for someone else's customers, and HMRC recognition per product. That is a
distraction until the Filing rung exists and has its own users. Phase two at the earliest,
and only if an accountant or a bank asks for it with a number attached.

## 6. Provenance and versioning as a feature

Every diya-gl zip is to carry, in `book.toml`'s document info and in `report.json`'s header
(2026-09-06: only the format version exists, as `diya-gl-books` version 1 in the JSON
envelope; the other four stamps are not written yet):

| Stamp | Value | What it answers |
| --- | --- | --- |
| format version | `diya-gl-books` 1 | can this tool read this file |
| engine version | the npm package version, and the commit | which code produced these figures |
| tax-data version | the `app/data` year files' hash | which rates were applied |
| template version | the BST template's hash and its reconciled scorecard | which workbook this reproduces |
| reconciled commit | the commit whose CI reconciliations passed | the proof this release rests on |

A public **reconciled releases** page lists every release with those five values and links
to the CI scorecard (the per-product reconciliation pages under `/reconciliation/` are the
scorecard today; the releases page over them does not exist yet): the LibreOffice recalculation agreement, the roundtrip budget at zero,
the check counts. Recalculating a 2026 file in 2030 either reproduces its `report.json`
byte-for-byte or names the stamp that differs.

What that buys: with accountants, a file they can verify without trusting the sender, and a
year-end pack that is the accounts themselves rather than a printout; with HMRC's
recognition process, evidence of digital-record integrity and of the figures' derivation,
which the Production Approvals Checklist asks about in its own words; with the tech
community, the thing they check first. It costs a build step and a page.

## 7. Launch sequence

| Phase | Builds | Prerequisite | Gate to the next phase | Effort |
| --- | --- | --- | --- | --- |
| 0. Provenance (LP-1 to LP-4) | the five stamps in the zip and `report.json`; the reconciled-releases page; the format version in `book.toml`; the npm package `@diy-accounting-uk/diya-gl` with `recalc`, published from a reconciled tag | PR #57 on main (done) | `npx diya-gl recalc` reproduces the page's `report.json` byte-for-byte on the three fixtures; the releases page shows one entry | two to three weeks |
| 1. The free face (LP-5 to LP-9) | the single-file HTML runner for BST built from the same bundle; the PWA manifest; two donation prompts on the page; the spec page for the format | phase 0 | 1,000 runner downloads or 2,000 page loads with a book loaded in the first month; a downloads-to-donations ratio measured; support tickets under one a day | two weeks |
| 2. Tech launch (LP-10 to LP-14, LP-22, H8) | Show HN and AccountingWEB; Docker image; the MCP server documented; Homebrew tap | phase 1 | 500 npm weekly downloads sustained for a month, or 300 GitHub stars; three external bug reports fixed | one week plus the follow-up |
| 3. Cloud, 99p a month (LP-15 to LP-18, LP-21, H9) | the app client on Submit's pool; S3 bucket and four Lambda routes in submit-prod (from the DIYA-GL Cloud plan, phase 2, cut down); sign-in and "save to my account" on the page; the `resident-diya-gl` bundle at 99p a month through Submit's checkout route; the customer portal | phase 1 (the pool tier is decided: Plus) | 100 paying subscribers within three months of launch; monthly churn under 5%; tickets under one per twenty subscribers a month | four to six weeks |
| 4. The other products | SE, Taxi and Ltd on the page and in the package | none: landed 2026-09-04 to 2026-09-06 (PRs #60 to #68), ahead of phase 3 | done: each product reconciles in CI and loads on the page; the plans are archived | three days for the three, under the coordinator model |
| 5. Filing (LP-19, LP-20) | Income Tax recognition on the 2027–28 cycle; quarterly updates from the stored book via Submit; the Filing rung's price | phase 3; the HMRC window for 2027–28 products | production credentials granted; the first ten customers' quarterly updates accepted | the recognition process runs months; start it during phase 3 |

Phases 0, 1, 2, 3 and 5 have not started (2026-09-06). What to leave: Tauri (until the HTML
runner's users ask for an app), white-label (until Filing exists), a merge story for
concurrent edits, and any second price.

## 8. Risks

- **HMRC's windows.** Recognition for a tax year closes months before the year starts; the
  2026–27 window has closed. Missing the 2027–28 window pushes Filing to 2028–29, when the
  £20,000 threshold lands and the free competitors have had two more years. Start the
  Developer Hub application during phase 3.
- **The bank-subsidised free competitor.** FreeAgent with Mettle files MTD for nothing. The
  answer is not features; it is that a Mettle customer who leaves Mettle loses FreeAgent,
  and a diya-gl user who leaves keeps a 15 KB file that everything else reads.
- **Support load on a 99p product.** One sign-in problem costs more than a year of one
  subscriber's fees. The gates in section 7 measure tickets per subscriber for that reason,
  and the tier ships with no email support promise, only the page's own help.
- **Trust in a self-hosted engine.** A wrong figure in someone's tax return is the worst
  outcome. Every release is cut from a reconciled commit with the scorecard published; the
  page says "check these against your return"; nothing files without Submit's recognised
  path.
- **The shared pool.** A change to Submit's Cognito configuration now affects spreadsheets
  users. Both products' behaviour tests sign in through the same pool in CI, so a break is
  caught before deploy.
- **Fixture and data drift.** This week's batch found three fixture defects and one
  writer-order defect by testing byte equality. The releases page makes every such drift
  visible; the discipline is to fix at source, never to allowlist.

## Decisions taken (operator, 2026-09-04)

1. **Cognito tier.** Keep Plus on the shared pool; about 1.5p per spreadsheets user per
   month, threat protection kept.
2. **Sign-in domain.** Submit's hosted sign-in page with a redirect to the spreadsheets
   site; nothing moves.
3. **Runner build.** From this repository's bundle, cut from a reconciled commit.
4. **Next product.** Self Employed; landed, with Taxi and Ltd after it, by 2026-09-06.
5. **HMRC application.** Start the Developer Hub application for Income Tax during phase 3
   for the 2027–28 window, and ask HMRC for special consideration for 2026–27 if the
   product is solid by then: a non-zero chance at a low cost to ask.
6. **The Rust port.** Funded, as the tech-community launch's headline; the estimate is in
   section 5b and the plan of record is `PLAN_DIYA_GL_RUST.md`. The operator is
   researching Rust porting references, skills and MCP servers for the builder, which is
   Fable 5.1 as coordinator.
7. **VAT position.** Not VAT registered; the price stands as written.

## Decisions taken (operator, 2026-09-21)

8. **The paid tier's price moves.** The 99p `resident-diya-gl` tier folds into one Resident bundle
   at £39 a year (£3.99 a month), filing included as each is recognised, annual as the default
   button; `resident-vat` stays at 99p for its four subscribers. The plan of record is
   `../developers/submit/archive/PLAN_PRICE_UPDATE.md`; §3's fee table stays as the record of why
   99p monthly was tried.
9. **Two stores in the bundle.** Submit's S3 and the reader's Google Drive (LP-24).
10. **Bank referral on the free rung** (LP-25a, LP-25b).
11. **The sandbox runs 35 days**, with `sandbox_expired_seen` per sign-in as the loss metric
    (`../developers/submit/archive/PLAN_PRICE_UPDATE.md` PU-4 and PU-8).

## Task list

Ids are shared with `NEXT.md`'s board: a row appears there while it is open, with the same id,
and its brief lives here. Phase numbers are section 7's. LP-12 to LP-14 and LP-19, LP-20 stay
here until their phase opens.

| # | Item | Phase | Precursors | Tier, agent | Files |
|---|---|---|---|---|---|
| LP-1 | The five provenance stamps in `book.toml` and `report.json` | 0 | — | Sonnet, the stamps agent | `app/lib/books-interchange.js`, `app/lib/report-serializer.js`, `scripts/build-books-bundle.mjs`, `app/test` |
| LP-2 | The reconciled-releases page over the reconciliation scorecards | 0 | LP-1 | Sonnet, the releases-page agent | `app/bin/build-reconciliation-pages.js`, `public/reconciliation/releases.html` |
| LP-3 | The npm package `@diy-accounting-uk/diya-gl` with `recalc`, `read-workbook`, `write-workbook` and the MCP server | 0 | LP-1 | Sonnet, the package agent | `diya-gl/package.json` (new), `app/bin/*.js`, `.github/workflows/publish-diya-gl.yml` (new) |
| LP-4 | The parity gate: the packed CLI reproduces the committed `report.json` and `bookchecks.json` byte for byte | 0 | LP-3 | Sonnet, the parity agent | `.github/workflows/test.yml` |
| LP-5 | The single-file HTML runner per product | 1 | LP-1 | Sonnet, the runner agent | `scripts/build-runner.mjs` (new), `.github/workflows/deploy.yml`, `public/download.html` |
| LP-6 | The PWA: manifest, service worker, offline DIYA-GL pages | 1 | — | Sonnet, the pwa agent | `public/books/manifest.webmanifest` (new), `public/books/sw.js` (new), the four DIYA-GL pages, the response-headers policy |
| LP-7 | Two donation prompts on the DIYA-GL pages | 1 | — | Sonnet, the prompts agent | `public/books/shell.js`, `public/books/books.css`, `web/browser-tests/books-donation.browser.test.js` (new) |
| LP-8 | The format spec page: the declared subset with its mappings and evidence | 1 | — | Opus, the spec-page agent | `public/diya-gl.html` (new), `app/bin/build-sitemaps.js` |
| LP-9 | Phase 1 measurement: GA4 events for a book loaded, a save, a runner download, a prompt shown and followed | 1 | G1 | Sonnet, the analytics agent | `public/lib/analytics.js`, `public/lib/ecommerce-events.js`, `public/books/shell.js`, `web/unit-tests` |
| LP-10 | The Show HN post and the AccountingWEB piece | 2 | LP-3, LP-8 | operator | — |
| LP-11 | The Docker image on GHCR and the Homebrew formula | 2 | LP-3, H8 | Haiku, the distribution agent | `Dockerfile` (new), `.github/workflows/publish-diya-gl.yml`, the tap's `Formula/diya-gl.rb` |
| LP-12 | Draft `PLAN_DIYA_GL_RUST.md`: the port's design wave | 2 | — | Fable, coordinating | `PLAN_DIYA_GL_RUST.md` (new) |
| LP-13 | The operator's research into Rust porting references, skills and MCP servers for the port's builder | 2 | — | operator | — |
| LP-14 | The Rust port: the core, then the workbook layer, with the CI parity job | 2 | LP-12 | per the Rust plan | per the Rust plan |
| LP-15 | Submit repo: a second app client on the shared Cognito pool with Google federation and the spreadsheets callback | 3 | — | Sonnet, the app-client agent | `../submit.diyaccounting.co.uk/infra/.../IdentityStack.java` |
| LP-16 | Submit repo: the storage API in submit-prod (bucket, four routes, authoriser, metadata sidecar) | 3 | — | Opus design, then Sonnet, the storage-api agent | `../submit.diyaccounting.co.uk/infra/.../ApiStack.java`, a new storage stack, its Lambdas |
| LP-17 | Sign-in and "save to my account" on the DIYA-GL pages | 3 | LP-15, LP-16, H9 | Opus design, then Sonnet, the cloud-page agent | `public/books/shell.js`, `public/books/cloud.js` (new), the CSP |
| LP-18 | Billing: the subscribe button, Submit's billing webhook, the entitlement check, the portal link | 3 | LP-16, LP-21 | Sonnet, the billing agent | `../submit.diyaccounting.co.uk/.../BillingWebhookStack.java`, LP-16's put route, the DIYA-GL pages |
| LP-19 | The HMRC Developer Hub application for Income Tax, 2027–28 window: a dependency on `../submit.diyaccounting.co.uk`, which holds the HMRC credentials and files; its plan carries the application | 5 | LP-17 | Submit repo | `../submit.diyaccounting.co.uk` |
| LP-20 | Quarterly updates from the stored book through Submit; the "send this quarter" action: a dependency on `../submit.diyaccounting.co.uk` | 5 | LP-19 | Submit repo | `../submit.diyaccounting.co.uk` |
| LP-21 | The `resident-diya-gl` bundle at 99p a month in Submit's catalogue, and its Stripe product and price through `stripe-catalogue-sync` (Submit's B54, done 2026-09-08 in test and live) | 3 | — | Sonnet, the bundle agent | `../submit.diyaccounting.co.uk/web/public/submit.catalogue.toml`, `.env.ci`, `.env.prod` |
| LP-22 | Publish `diya-gl` from every green prod deploy: the version not yet on npm publishes, the release is recorded, the patch version rolls | 2 | — | Sonnet | `.github/workflows/publish-diya-gl.yml`, `.github/workflows/deploy.yml` |
| LP-23 | The ci behaviour job mints its Cognito test user per run through Submit's cross-account role | 3 | Submit's role | Sonnet | `.github/workflows/deploy.yml` |
| LP-24 | Google Drive as a second store for the book: save, list and open through the `drive.file` scope on the federated Google identity; carried by the Resident bundle with S3 | 3 | LP-17, PU-1 | Opus design, then Sonnet, the drive agent | `web/diya-gl.co.uk/public/cloud.js`, `cloud-config.js`, `shell.js`, the Submit app client's Google scopes (`../submit.diyaccounting.co.uk` IdentityStack), the cloud browser spec (~6 files) |
| LP-25a | Bank referral: the operator picks the partner programme, signs up, and supplies the referral link and the disclosure wording | 1 | — | operator | — |
| LP-25b | Bank referral: the placement on the homepage strip and the sign-in panel, the disclosure line, the `referral_clicked` event | 1 | LP-25a | Haiku, the referral agent | `web/diya-gl.co.uk/public/index.html`, `cloud.js`, `diya-gl-events.js`, the cloud browser spec (~4 files) |
| H8 | Create the `diy-accounting-uk/homebrew-tap` repository | 2 | — | operator | GitHub |
| H9 | Merge the Submit repo PRs for LP-15, LP-16 and LP-18; its deploy workflow applies them | 3 | LP-15, LP-16 | operator | Submit repo |

### Briefs

- **LP-1**: `book.toml` is written by `app/lib/books-interchange.js` and `report.json` by
  `app/lib/report-serializer.js`; the format version is already `diya-gl-books` 1 in the JSON
  envelope. Add `engineVersion` (package version and commit, injected at build by
  `scripts/build-books-bundle.mjs` and read from `package.json` in Node), `taxDataHash` (a hash
  over `app/data/*.toml`), `templateHash` per product (over `app/templates/<product>/*.xlsx`, with
  the scorecard figure from `reports/`), and `reconciledCommit` (the commit whose CI
  reconciliations passed, from the generate workflow). Byte identity across CLI, MCP and browser
  must hold, so the stamps are part of the canonical form: prove in `app/test` and in
  `books-equivalence` that all three surfaces write the same stamps.
- **LP-2**: `app/bin/build-reconciliation-pages.js` writes `public/reconciliation/<product>.html`
  from `reports/*.md`; add a `releases.html` beside them listing each tagged release with its five
  stamps and links to the scorecards, built in the same step and covered by the SEO unit test.
- **LP-3**: this repo's `package.json` is private; the publishable package is a second
  `package.json` (a `diya-gl/` directory or an npm workspace) whose `bin` map wraps
  `app/bin/report.js` (`recalc`), the extractors (`read-workbook`), `app/bin/export.js`
  (`write-workbook`) and `app/bin/diya-gl-mcp.js`; `../developers/spreadsheets/PLAN_DIYA_CLOUD.md` section 3
  is the design for what it exposes. A `publish-diya-gl.yml` workflow publishes on a tag
  every green prod deploy from a push to main, with `NPM_TOKEN` and provenance attestation, rolling the patch version afterwards so the next deploy publishes the next one. Prove with `npm pack` and a
  smoke run of each bin in CI.
- **LP-4**: a `test.yml` job (or the publish workflow's gate) runs the packed CLI over
  `examples/<product>-latest` for all four products and diffs the output against the committed
  `report.json` and `bookchecks.json`; any byte difference fails.
- **LP-5**: a `scripts/build-runner.mjs` that inlines the DIYA-GL engine bundle, the two schemas under
  `public/schema/`, the tax TOMLs and the product's `app/templates/<product>/*.xlsx` (base64)
  into one `diya-gl-<product>.html`, stamped with LP-1's values, written to `target/runners/` and
  uploaded by `deploy.yml` beside the zips; `download.html` gains the link. Prove by opening the
  file from disk in Playwright and loading an example book.
- **LP-6**: `public/books/manifest.webmanifest`, `public/books/sw.js` caching the shell, engine,
  schemas, CSS and `examples.js`, the link and registration tags in the four DIYA-GL pages, and
  the response-headers policy (the CSP the BST plan's T2 centralised; find its source by grepping
  for `Content-Security-Policy` in `infra/` and `scripts/`) allowing the worker. Prove with a
  Playwright case that loads a page, goes offline and loads it again.
- **LP-7**: in `books/shell.js`, a prompt after the save toast and one when the year view first
  renders figures, each shown once per browser (`localStorage`), dismissable, linking the
  `buy.stripe.com` links `donate.html` already carries; styling in `books/books.css`; one browser
  spec `books-donation.browser.test.js`.
- **LP-8**: a `public/diya-gl.html` (the spec page) generated or hand-written: the field table
  from the two schemas' descriptions (both cite XBRL GL 2015), the SA103S box table from
  `app/data/hmrc/sa103-mtd-mapping.json`, the check catalogue from `app/lib/book-checks.js` and
  the DIYA-GL engine checks, the zip layout, the version, and links to the reconciliation pages; added to
  `app/bin/build-sitemaps.js` and the SEO test. Opus because the declared-subset wording is a
  judgment the launch plan's section 1 constrains.
- **LP-9**: `public/lib/analytics.js` and `ecommerce-events.js` carry the GA4 senders; add events
  from `books/shell.js` (book loaded with its product and source kind, save with its format,
  prompt shown and prompt followed) and from `download.html` for the runner; unit-test the event
  builders under `web/unit-tests/`. G1 fixes the purchase event's value first, so this row waits
  on it and shares its builder.
- **LP-11**, two halves that share no file.
  - The image (this repo, on top of LP-22's branch): `diya-gl/Dockerfile`, `FROM node:24-alpine`,
    installs the tarball `smoke.sh` packed (`target/diya-gl-smoke/<name>.tgz`, passed as a build
    context file) with `npm install -g`, `ENTRYPOINT ["diya-gl"]`, `CMD ["--help"]`, OCI labels
    for source, version and the Apache-2.0 licence. `publish-diya-gl.yml` builds it after the
    npm publish, runs `docker run --rm <image> recalc --help` as its smoke, logs in to
    `ghcr.io` with `GITHUB_TOKEN` (`packages: write`, on the called workflow and on `deploy.yml`'s
    caller job) and pushes `ghcr.io/diy-accounting-uk/diya-gl:<version>` and `:latest`. The
    README gets the `docker run` line.
  - The tap (`diy-accounting-uk/homebrew-tap`, its own clone, no cross-repo token):
    `Formula/diya-gl.rb` in Homebrew's node shape (`url` the registry tarball
    `https://registry.npmjs.org/@diy-accounting-uk/diya-gl/-/diya-gl-<v>.tgz`, `sha256`,
    `license "Apache-2.0"`, `depends_on "node"`, `std_npm_args`, `bin.install_symlink`, a
    `test` that runs `diya-gl` and expects the usage line); `scripts/update-formula.sh` reads the
    latest version from the registry, downloads the tarball, computes the sha256 and rewrites
    the formula, exiting 0 with a message while the package is not on npm yet;
    `.github/workflows/update-formula.yml` runs it hourly and on dispatch and commits with the
    tap's own `GITHUB_TOKEN` when the formula changed, then `brew install --build-from-source`
    and `brew test` on the runner as the gate. `brew install diy-accounting-uk/tap/diya-gl` in
    the README. The formula first lands on the tap's schedule after 1.0.0 publishes.
- **LP-15**: in the Submit repo's `IdentityStack.java`, a second `UserPoolClient` on the shared
  pool with the Google identity provider, callback `https://spreadsheets.diyaccounting.co.uk/books/`
  (and the ci host), sign-out URL the same, PKCE, no secret; the client id as a stack output and
  an SSM parameter the spreadsheets deploy can read; its Java test; lands by Submit PR (H9).
- **LP-16**: design wave first (Opus): the S3 key layout `users/<sub>/books/<bookId>/<version>.zip`
  with `metadata.json` per book (`../developers/spreadsheets/PLAN_DIYA_CLOUD.md` sections 2.3, 2.4 and 4), the
  four Lambda handlers, the API Gateway routes under the existing `ApiStack` with the pool's
  authoriser, the ETag-based optimistic concurrency, and the entitlement hook LP-18 fills. Then
  Sonnet builds it with unit tests per handler and a behaviour probe against submit-ci.
- **LP-17**: design wave (Opus) for the page's cloud state: hosted-UI redirect with PKCE, the
  token in `sessionStorage`, a "My books" panel listing versions, put on save and get on open,
  a conflict card when the ETag mismatches. Then Sonnet in `books/shell.js` and a new
  `books/cloud.js`, the CSP `connect-src` for the API host, a browser spec with the API stubbed
  through Playwright routes, and a behaviour case against ci once LP-16 is deployed.
- **LP-18**: two halves. Submit's (its `NEXT.md` B55): the checkout and portal routes accept a
  token from the DIYA-GL app client, and checkout takes the `resident-diya-gl` bundle, so the
  webhook records the subscription under the hashed sub the way it does for every other bundle
  and LP-16's put route sees it. This repo's: the subscribe button posts
  `{"bundleId":"resident-diya-gl","returnTo":"<the page URL>"}` to `POST /api/v1/billing/checkout`
  with `Authorization: Bearer <the DIYA-GL id token>` and follows the returned `url`; the portal
  link is `GET /api/v1/billing/portal?returnTo=<page URL>`. `returnTo` must be a DIYA-GL origin on
  the API's per-environment allow-list; Stripe returns the browser to
  `<returnTo>?checkout=success&session_id=…` or `?checkout=canceled`, and the panel re-reads
  entitlement from its next list call. Waits on Submit's B55 (their PR #151). The bundle is listed
  for purchase on ci only until the operator lifts it, so the prod button finds no bundle until
  then; the Stripe product and prices exist in test and live (Submit, 2026-09-08).
- **LP-23**: the ci behaviour job's test user. Submit's suites store no credentials: their deploy
  runs `scripts/ensure-cognito-test-user.js <env> <lane>` per run, which keeps one durable user per
  lane, rotates its password, re-enrols its authenticator and purges its data. This repo's
  `deploy.yml` does the same on ci: assume the cross-account role Submit provides (its ARN in a
  repository variable), fetch the script from Submit's main, run it for the `spreadsheetsBehaviour`
  lane, and pass `TEST_AUTH_USERNAME`, `TEST_AUTH_PASSWORD` and `TEST_AUTH_TOTP_SECRET` as masked
  values into the behaviour run. Sonnet, once the role exists.
- **LP-21**: in the Submit repo (its `NEXT.md` B54), a `[[bundles]]` entry `resident-diya-gl`, the id
  `BooksStack` already checks, shaped like `resident-itsa`
  (`allocation = "on-subscription"`, `stripePriceAmount = 99`, `gbp`, `month`) carrying the
  DIYA-GL storage activity, then the `stripe-catalogue-sync` skill: dry run, test on a "go",
  live on its own "go", the price ids onto `.env.ci` and `.env.prod`; one Submit PR.
- **LP-12**: the port's design wave first: the type model, the float and half-up rounding
  contract that reproduces the JS serializer byte for byte, the module map, the oracle harness
  that diffs `report.json` and `bookchecks.json` against the JS over the fixtures, and the CI
  parity job; then the code waves and the closing ladder, sized from section 5b's estimate.
  Fable coordinates; Sonnet and Opus workers. Does not wait on LP-13.

### LP-24 design: Google Drive as a second store

**The reader's journey.**

1. A subscribed reader opens the save menu and picks "Save to my Google Drive". The item shows
   only while the account list reports `entitlement.reason` as `active-subscription`.
2. This browser holds no Drive token, so the account panel opens on a "Connect Google Drive" card.
   The card names the one permission asked for: files this page creates, and nothing else in
   the Drive.
3. The reader clicks Connect. Google's consent window opens on that click, pointed at the address
   in the Cognito id token. They approve.
4. The window closes with an access token. The page finds or creates a `DIYA-GL` folder in their
   Drive and uploads the same diya-gl zip a download would write. The toast names the folder.
5. The panel lists that book with a Drive badge, in one list beside the books in the account.
6. Versions on a Drive row are Drive's own revisions. Open takes the latest, or any revision in
   the list, back into the page.
7. On a second device the reader signs in and clicks Connect once more. The folder and every book
   in it come back. The token belongs to this browser, the books to the Drive.
8. The zip also opens straight from drive.google.com, which is the point of keeping it there.

**The token.** Cognito's hosted UI returns the pool's own id, access and refresh tokens. Google's
access token stays inside the pool, so the page asks Google for one of its own. `drive.js` loads
`https://accounts.google.com/gsi/client` on the first Connect click, calls
`google.accounts.oauth2.initTokenClient({ client_id, scope: "https://www.googleapis.com/auth/drive.file", hint: <the email claim>, callback })`,
and fires `requestAccessToken()` inside that same click so the popup blocker lets the window
through. The callback's `access_token` and `expires_in` go to sessionStorage as
`diya-gl.cloud.driveToken` and `diya-gl.cloud.driveTokenExpiresAt`, which sign-out already clears
by prefix. Within 60 seconds of expiry the next Drive call re-requests with `prompt: ""`, silent
while the Google session is live, and the panel returns to the Connect card when that comes back
empty. `hasGrantedAllScopes` is checked on every response, because the consent window lets a
reader approve less than was asked. The alternative, adding `drive.file` to the IdP's scope list
in `IdentityStack.java`, is rejected because the grant then lands in the user pool and the hosted
UI's token endpoint hands the page pool tokens only.

**The Drive calls.** Every one carries `Authorization: Bearer <the Drive token>`. Reads and
metadata writes go to `https://www.googleapis.com/drive/v3`, uploads to
`https://www.googleapis.com/upload/drive/v3`.

- Find the folder: `GET /files?q=name='DIYA-GL' and mimeType='application/vnd.google-apps.folder'
  and trashed=false&fields=files(id,name)&spaces=drive`. Under `drive.file` a search sees only
  files this page created, so a hit is our own folder.
- Create it when the search is empty: `POST /files` with
  `{"name":"DIYA-GL","mimeType":"application/vnd.google-apps.folder","appProperties":{"diyaGl":"folder"}}`.
- Save a new book: `POST /upload/files?uploadType=multipart&fields=id,name,size,modifiedTime,appProperties,headRevisionId`,
  a `multipart/related` body of the metadata JSON then the zip bytes as `application/zip`. The
  metadata sets `name` to `<title> <periodEnd>.diya-gl.zip`, `parents` to the folder id, and
  `appProperties` to `bookId`, `product`, `periodStart`, `periodEnd` and `engineVersion`. A key
  and its value are capped at 124 bytes together, so the title stays in the file name.
- Save over a book: `PATCH /upload/files/{fileId}?uploadType=multipart&fields=id,size,modifiedTime,headRevisionId`.
  The previous bytes become a revision.
- Keep that revision: `PATCH /files/{fileId}/revisions/{revisionId}` with `{"keepForever":true}`
  straight after each upload. Drive prunes binary revisions past 30 days or 100 revisions
  otherwise, and holds 200 kept-forever revisions per file, so at 200 the oldest loses the flag
  first.
- List: `GET /files?q='{folderId}' in parents and
  trashed=false&fields=files(id,name,size,modifiedTime,appProperties,headRevisionId)&orderBy=modifiedTime desc&pageSize=100`.
- Open: `GET /files/{fileId}?alt=media`, or `GET /files/{fileId}/revisions/{revisionId}?alt=media`
  for an older one. The bytes become a `File` and go through `DiyaGlPage.loadFile`, the path
  `performOpen` already uses.
- Versions: `GET /files/{fileId}/revisions?fields=revisions(id,modifiedTime,size,keepForever)`.
- Delete: `PATCH /files/{fileId}` with `{"trashed":true}`, so the file lands in the reader's own
  Drive bin and the confirm card says so.

Per file the page keeps `fileId`, `headRevisionId`, `modifiedTime`, `size`, `name` and
`appProperties`. Per tab it keeps the folder id, re-resolved whenever a call answers 404, and
`driveLink = {fileId, headRevisionId}` for the loaded book, beside the existing S3 `link`.
Drive's `files.update` takes no precondition header, so a save over an existing file re-reads
`headRevisionId` first and shows the S3 path's conflict card when it has moved. The window
between that read and the write stays open; a Drive-side precondition would close it, and that
is the open problem to come back to.

**The account panel.** One list, sorted by save time as it is today. `renderBookRow` takes a
`store` field of `account` or `drive` and prints a badge in the meta line; a Drive row carries the
same Open, Versions and Delete. The head gains a link to the folder,
`https://drive.google.com/drive/folders/<id>`. The page decides what to offer from the list
route's `entitlement.reason`, so the catalogue's move from `resident-diya-gl` to the `resident`
bundle needs no change here.

| state | what the panel shows |
| --- | --- |
| `reason` is not `active-subscription` | no Drive rows, no Drive save item, no Connect action |
| subscribed, no Drive token | a "Connect Google Drive" row above the list; the Drive save item opens the panel on it |
| consent refused, or the window closed | the Connect row stays, with "Google Drive was not connected." |
| token expired | the silent re-request runs first; on failure the Connect row returns and the S3 rows stay listed |
| 401 or 403 from a Drive call | the token is dropped and the Connect row returns |
| 403 `storageQuotaExceeded` | "Your Drive is full. The download still works." |
| any other Drive failure | the reach-failure wording `messageForApiError` already ends on |

Listing and opening stay available whenever a token is held, subscribed or not, because those
files are the reader's own. Only the save is gated.

**The events.** Three more builders in `diya-gl-events.js`, sent through the guarded
`sendCloudEvent` the cloud events already use, exported on `window` with the rest, and each with
a case in `web/unit-tests/diya-gl-events.test.js`.

| builder | event | params |
| --- | --- | --- |
| `buildCloudDriveConnectEvent(step)` | `cloud_drive_connect` | `step`: `started`, `granted`, `refused`, `expired` |
| `buildCloudDriveSaveEvent(product, outcome)` | `cloud_drive_save` | `product`, `outcome`: `created`, `updated`, `failed` |
| `buildCloudDriveOpenEvent(source)` | `cloud_drive_open` | `source`: `latest`, `revision` |

`cloud_drive_save` sits apart from `cloud_save` so the S3 series stays readable across the change.

**The build.**

| file | change |
| --- | --- |
| `web/diya-gl.co.uk/public/drive.js` (new, ~400 lines) | the token client, the folder, the calls above, published as `window.DiyaGlDrive` with `isOffered`, `hasToken`, `connect`, `list`, `save`, `open`, `revisions`, `trash` |
| `web/diya-gl.co.uk/public/cloud.js` | the merged list and the store badge, the Connect row, the Drive save path, the entitlement gate, the Drive error states |
| `web/diya-gl.co.uk/public/cloud-config.js` | `googleClientId`, with a `DIYA_GL_DRIVE_TEST_CLIENT_ID` override matching the hook already there |
| `web/diya-gl.co.uk/public/shell.js` | the second save-menu item, shown when `DiyaGlDrive.isOffered()` |
| `bst.html`, `se.html`, `taxi.html`, `ltd.html`, `index.html` | the `drive.js` script tag after `cloud.js`; then `node scripts/build-diya-gl-bundle.mjs` and commit the regenerated `build-stamp.js` the precache list comes from |
| `infra/main/resources/diya-gl-security-headers.json` | `script-src` gains `https://accounts.google.com`; `connect-src` gains `https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com`; a `frame-src 'self' https://accounts.google.com`; `Cross-Origin-Opener-Policy` becomes `same-origin-allow-popups` so the consent window can reach its opener |
| `web/diya-gl.co.uk/public/diya-gl-events.js`, `web/unit-tests/diya-gl-events.test.js` | the three builders and their cases |
| `web/browser-tests/diya-gl-drive.browser.test.js` (new), `playwright.config.js` | the spec, and its name in the config's `testMatch` list |
| `behaviour-tests/spreadsheets.behaviour.test.js` | the ci case below |

The browser spec stubs `https://accounts.google.com/**` and `https://www.googleapis.com/**`
through `page.route`, and injects a fake `google.accounts.oauth2` with `addInitScript` so no
window opens. Cases:

1. Sandbox entitlement: no Drive save item, no Connect row, and no call to googleapis.
2. Subscribed, no token: the Connect row renders, and the Drive save item opens the panel on it.
3. Connect granted: the folder search returns empty, the create runs once, the upload's second
   part starts with the PK magic bytes, the toast names the folder, `cloud_drive_save` is
   `created`.
4. A second save of the same book: no repeat search, the `PATCH` carries the file id, the revision
   `PATCH` sets `keepForever`, the outcome is `updated`.
5. `headRevisionId` moved between the list and the save: the conflict card renders and no upload
   is sent.
6. Two account books and two Drive files render as four rows with the right badges, in save-time
   order.
7. Open a revision: the revisions call, then `alt=media` on that revision id, then the page holds
   the fixture's book and `cloud_drive_open` is `revision`.
8. Delete: the `PATCH` sets `trashed`, the row goes, and the confirm wording names the Drive bin.
9. The token expires: the silent re-request returns nothing, the Connect row comes back, and the
   account rows stay listed.

The ci behaviour case runs on `https://ci.diya-gl.co.uk` as the Cognito user the behaviour job mints per
run, who has no Google account. It proves the gate and the wiring: the Drive save item and the Connect row
appear for an `active-subscription` entitlement and are absent otherwise, the deployed CSP lets
`accounts.google.com/gsi/client` load, and nothing reaches googleapis before a token exists.
Consent, the upload, the revisions and the folder need a Google account that can sign in
headlessly, so until one exists the operator checks those on their own Drive after a prod deploy.

**Operator steps.** Decided by `PLAN_BOOKS_TO_SUBMIT.md` (decision 4, open question 8): Drive
needs no Submit sign-in, so it runs on its own web client, JavaScript origins only, never
Submit's Cognito sign-in client, which is untouched (`IdentityStack.java` keeps
`List.of("email", "openid", "profile")` on the Google IdP). That client, the Drive and Picker
APIs, the `drive.file` consent scope and a Picker API key are created as code beside Submit's
BS5 (`infra/google/gcp/oauth.toml`); its own operator steps carry the console actions the code
cannot reach. Two steps stay here, once that client exists:

1. Post the client id in the chat; it is a public identifier and goes into `cloud-config.js`'s
   `googleClientId` beside the Cognito client id.
2. After the prod deploy, save a book to Drive from your own account and check the folder, the
   file and a second revision at `https://drive.google.com/drive/my-drive`

## Donations: the sandbox and the events

Moved here from `PLAN_DONATION_DOWNLOAD_TESTING.md` on 2026-09-10, when that plan was archived.
Two of its six phases were worth keeping and both serve the launch: the site cannot be exercised
end to end while its donation links take real money, and the events are what tell us whether any of
the launch worked. The board carries them as `SB-1` and `SB-2`.

The other four phases went with the archive. Phase 3 was already built — `deploy.yml` builds and
syncs the zips and a behaviour case checks the PK magic bytes. Phase 2, PayPal's sandbox, needs a
second hosted button and account for a flow that plan itself said manual testing covers. Phase 4,
driving a Stripe hosted checkout in CI, means Playwright completing a payment on a page we do not
control, behind bot protection, whose markup changes without notice — the most brittle class of
test there is, for less than it costs. Phase 5 was convenience.

### SB-1: Stripe sandbox switching

**Problem**: `donate.html` hardcodes live `buy.stripe.com` Payment Links. CI deployments should use Stripe test mode.

**Approach options**:

### Option A: Environment-specific donate.html generation
- Build script generates `donate.html` with environment-appropriate Stripe links
- CI uses test mode Payment Links, prod uses live ones
- Requires: template HTML + build step in deploy workflow

### Option B: JavaScript-based switching
- `donate.html` includes a small script that checks the hostname
- If hostname starts with `ci-`, replace Payment Link URLs with test mode equivalents
- Simpler but test links visible in source

### Option C: Stripe checkout session (server-side)
- Not applicable — the site is fully static, no server-side code

**Recommended**: Option A, build-time generation, for clean separation.

**Tasks**:
1. Create test mode Stripe products and Payment Links using `scripts/stripe-spreadsheets-setup.js` with test API key
2. Create `donate-template.html` with placeholder URLs
3. Create `scripts/build-donate-page.cjs` that injects correct URLs based on environment
4. Update deploy workflow to run the build step with environment context
5. Update behaviour tests to verify the correct Stripe domain (test vs live)

### SB-2: GA4 e-commerce events

**Goal**: Verify analytics events fire correctly in test vs production.

**Current state**:
- `ecommerce-events.js` fires GA4 `purchase` and `begin_checkout` events
- `download-page.js` fires `file_download` events
- GA4 property 523400333, measurement ID on all pages

**Tasks**:
1. Verify GA4 events are blocked in behaviour tests (the `playwrightTestWithout.js` helper already blocks RUM/GA/GTM)
2. Consider adding a test that verifies GA4 script tags are present in HTML but blocked during tests
3. No changes needed for test vs production — GA4 filtering is done in GA4 admin (exclude CI traffic by hostname)

## The names and the notice

Two operator rows moved here from `../developers/spreadsheets/archive/PLAN_LICENSING_UPLIFT.md` on 2026-09-10, when that plan
narrowed to the licence change and its filings. They sit with the launch because that is what they
serve: the product needs its names held before it is talked about, and HMRC should hear the licence
changed from us rather than from the release.

| # | Task | Gates | Owner | Where |
| --- | --- | --- | --- | --- |
| H-LU-9 | Tell HMRC's SDS team the licence changed, one paragraph | LU-8a | operator | email |

The note says what changed and the one thing that has not: we still issue no licence keys, so the
`Gov-Vendor-License-IDs` header carries no data either way. The operator holds the draft.

## Where this changes the DIYA-GL Cloud plan

`../developers/spreadsheets/PLAN_DIYA_CLOUD.md` decided server-side computation in Lambda with LibreOffice
and a full general ledger. This plan keeps its storage, identity and account placement
decisions and changes three things on the strength of what shipped this week: computation
is client-side (the browser engine is the same code CI reconciles), `.xlsx` generation is
client-side (no LibreOffice anywhere in the service), and the front end is the existing
DIYA-GL page signed in, under the spreadsheets domain, rather than a new area of the Submit
site. Its phases 1 and 2 (the library and the storage API) are this plan's phases 0 and 3;
its phases 3 to 5 are absorbed by the page; its phase 6 is this plan's Filing rung.

## Sources

- GOV.UK, Find out if and when you need to use Making Tax Digital for Income Tax:
  https://www.gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax
  (read 2026-09-03)
- GOV.UK, Choose the right software for Making Tax Digital for Income Tax:
  https://www.gov.uk/guidance/choose-the-right-software-for-making-tax-digital-for-income-tax
  (read 2026-09-03)
- HMRC Developer Hub, Making Tax Digital for Income Tax end-to-end service guide:
  https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/
  and its "How to integrate" page (read 2026-09-03)
- GOV.UK, When to register for VAT: https://www.gov.uk/vat-registration/when-to-register
  (read 2026-09-03)
- money.co.uk, UK business statistics 2026 (citing DBT Business Population Estimates):
  https://www.money.co.uk/business/business-statistics (read 2026-09-03)
- Stripe, Supported currencies and minimum charge amounts: https://docs.stripe.com/currencies
  (read 2026-09-03)
- We Are Founders, Stripe fees UK 2026: https://www.wearefounders.uk/stripe-fees-uk-2026/
  (read 2026-09-03)
- AWS, Amazon Cognito pricing: https://aws.amazon.com/cognito/pricing/ and Frontegg's
  summary https://frontegg.com/guides/aws-cognito-pricing (read 2026-09-03)
- FreeAgent with Mettle: https://www.freeagent.com/mettle/ (read 2026-09-03)
- Startups.co.uk, QuickBooks cost: https://startups.co.uk/accounting/quickbooks-cost/ (read
  2026-09-03)
- Xero UK, Ignite plan: https://www.xero.com/uk/pricing-plans/ignite/ (read 2026-09-03)
- Coconut pricing: https://www.getcoconut.com/pricing (read 2026-09-03)
- ANNA pricing: https://anna.money/pricing/ (read 2026-09-03)
- Pandle pricing: https://www.pandle.com/pricing/ (read 2026-09-03)
- accountingstack.co.uk, Bokio review (closure):
  https://accountingstack.co.uk/accounting-software/reviews/bokio/ (read 2026-09-03)
- mtd.digital, free MTD software and HMRC's list:
  https://mtd.digital/mtd-income-tax/free-mtd-software/ (read 2026-09-03)
- Churnkey, normal churn rates in SaaS:
  https://churnkey.co/blog/whats-a-normal-churn-rate-in-saas (read 2026-09-03)
- Monetizely, freemium conversion rate benchmarks:
  https://www.getmonetizely.com/articles/freemium-conversion-rate-the-key-metric-that-drives-saas-growth-3588c
  (read 2026-09-03)
- Funraise, donation page conversion benchmarks:
  https://www.funraise.org/tools/donation-page-conversion-rate-calculator (read 2026-09-03)
- XBRL International, XBRL Global Ledger 2015:
  https://specifications.xbrl.org/work-product-index-xbrl-gl-xbrl-gl-2015.html (read
  2026-09-03)
- FRC, FRS 105:
  https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/uk-accounting-standards/frs-105/
  (read 2026-09-03)
- Apple developer forums, notarisation and the paid developer account:
  https://developer.apple.com/forums/thread/121113 (read 2026-09-03)
- SignMyCode, OV code signing certificates: https://signmycode.com/ov-code-signing (read
  2026-09-03)
- Microsoft, Azure Artifact Signing: https://azure.microsoft.com/en-us/products/artifact-signing
  (read 2026-09-03)
- tech-insider.org, Tauri vs Electron sizes: https://tech-insider.org/tauri-vs-electron-2026/
  (read 2026-09-03)
- This repository: the four product plans under `../developers/spreadsheets/archive/`
  (`PLAN_DIYA_GL_{BST,SE,TAXI,LTD}_CLI_MCP_WEB.md`), `../developers/spreadsheets/PLAN_DIYA_CLOUD.md`,
  `../developers/spreadsheets/SPEC-basic-sole-trader-import-export.md`, the v2 schemas; the Submit
  repository's `README.md` (HMRC recognition for VAT) and `AWS_COSTS.md` (Cognito cost).
