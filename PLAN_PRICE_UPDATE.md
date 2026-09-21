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

Paid traffic has a ceiling. At the measured 0.28% of sessions that buy, and £127 of lifetime
contribution per annual subscriber at 30% churn, a session is worth £0.36. A £2 click costs £714
per subscriber. Ads work starts from the £0.36 figure (`REPORT_PRICE_UPDATE_REVIEW.md` §4,
`PLAN_ONE_STOP_DASHBOARD.md` D17).

## The offer after this plan

| Bundle | Price | What it carries | Change |
| --- | --- | --- | --- |
| `default`, `day-guest` | £0 | as today | none |
| `resident-vat` | 99p/month | VAT filing, as today | **kept at 99p** for its four subscribers; may close to new business later, no date |
| `resident` (new) | **£39/year** default, £3.99/month alternative | DIYA-GL book storage (Submit's S3, versions, any device) and the Google Drive save (LP-24); VAT, ITSA and Companies House filing as each is recognised; 100 tokens/month | replaces `resident-diya-gl`, `resident-itsa`, `resident-ltd` |
| `resident-pro` | £19.99/month or £199/year (proposed) | the practice licence: a client list, one book set per client, batch recalc and reports, the MCP server, every filing; higher token grant | unhidden, `on-subscription`, multi-client |
| `resident-guest`, `resident-pro-comp`, `invited-guest`, `operator` | £0 | as today | none |

**Numbers.** Stripe UK standard 1.5% + 20p. £39 yearly: fee 78.5p, kept £38.21, share 2.0%
(0.785/39; assertion 2's "about 2.3%" is the launch plan's £24 row).
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

Today `resident-pro` is `enable = "on-pass"`, `hidden = true`,
`allocation = "on-pass-on-subscription"`, `stripePriceAmount = 999`, 100 tokens a month, with no
`listedInEnvironments` line (catalogue lines 241 to 256). It grants the union of `resident-vat`,
`resident-itsa` and `resident-ltd`, and it carries no notion of a client. Price proposed at £19.99
a month or £199 a year, above the £10–£16 single-trader floor and below an accountant's own
software. What follows is the design; the rows at the end of it are PU-7's build.

**The practice is the Cognito user.** One sign-in holds the subscription, the client list and the
HMRC agent authorisation. Everything below hangs off the hashed sub that already keys books,
receipts and bundles (`subHasher.hashSub`).

#### The data model

A new DynamoDB table `{env}-env-practice-clients`, partition key `hashedSub` (the practice), sort
key `clientId` (a ULID this service issues, never chosen by the caller). The row holds the client's
display name, the identifiers a filing needs (VRN, NINO, UTR, company number), the authorisation
state per HMRC service, `createdAt` and `archivedAt`. No index reads `clientId` on its own, so a
client is reachable only through the practice that owns it. PITR is on, as on every customer table.

Book storage today is `users/{hashedSub}/books/{bookId}/` (`s3DiyaGlRepository.bookPrefix`). A
client's book set is `users/{hashedSub}/clients/{clientId}/books/{bookId}/`. `resolveOwnerPrefix`
takes the client id and returns the longer prefix; `metadataKey`, `versionKey`, `listBooks` and the
sidecar stay as they are, because each already takes a prefix. A practice's own books stay where
they are, which is the case with no client id.

Receipts keep their table and their `hashedSub` key and gain a `clientId` attribute. The receipts
route filters on it, so a practice can show one client every filing made for them.

#### The entitlement change

`resident-pro` becomes `enable = "always"`, `hidden = false`, `allocation = "on-subscription"`,
with PU-2's two prices, listed on ci first and then prod. The comp bundle keeps its pass, since
`resident-pro-comp` is a separate id.

`diyaGlEntitlement.entitlementFor(sub)` returns one retention for the signed-in user. It takes an
optional client id and answers `resident` for every client book set while the practice's bundle is
active. A lapsed practice puts every client's books into the 30-day grace a sole trader gets
(`lapsedResidentExpiresAt`), and the lapse sweep walks prefixes, so it follows.

The token grant is one flat monthly number today. A practice's grant becomes a base plus a
per-client amount, recomputed from the live client count at each monthly refresh. The two numbers
and any cap on the client count are open questions below.

#### The authorisation flow

HMRC issues no token per client. A practice enrols for an agent services account (ASA), which
carries one agent reference number (ARN). The practice signs in to this software with the ASA's
Government Gateway credentials and grants the same scopes a sole trader grants today (`read:vat`,
`write:vat`, and the ITSA scopes when recognition lands). The access token carries the ASA
enrolment, and HMRC resolves the delegated relationship from the VRN or NINO sent on the call. So
today's flow keeps its shape: the browser gets a code, `hmrcTokenPost` exchanges it, the access
token comes back to the caller, and the caller passes it on each submission. What changes is that
the submission carries a client id, and the route resolves the identifier from the client row
instead of taking a VRN from the caller.

Per-client authority is a relationship held at HMRC. A practice gets one of three ways:

- **An invitation through the Agent Authorisation API.** `POST /agents/{arn}/invitations` names the
  service (`MTD-VAT`, `MTD-IT`), the client's identifier and the known fact HMRC checks (the VAT
  registration date, or the client's postcode). The response's `Location` header carries the
  invitation id. `GET /agents/{arn}/invitations/{invitationId}` reads `pending`, `accepted`,
  `rejected` or `expired`, and `DELETE` on that path cancels a pending one. The client accepts
  online with their own Government Gateway sign-in.
- **A relationship already in place**, because the client came across when the practice linked its
  old Government Gateway to the ASA. `GET /agents/{arn}/relationships` answers whether one exists
  for a service and client id.
- **A paper 64-8** for the services the invitation API does not cover.

We store the ARN on the practice, and per client the service, the invitation id, the last status
and when we read it. No client credential is stored. The stored status is a cache: HMRC is the
authority, and a submission answered `CLIENT_OR_AGENT_NOT_AUTHORISED` puts the client back to
unauthorised and offers the invitation again.

#### The batch interface

Each existing MCP tool takes an optional `clientId`. `open_book`, `save_book`, `derive_vat_return`
and `derive_micro_entity_accounts` resolve the book set from it; `submit_vat_return` and
`submit_micro_entity_accounts` resolve the identifier from the client row. Four tools are new:
`list_clients`, `add_client`, `invite_client` and `client_authorisation_status`.

`run_for_clients` takes a tool name, its arguments and a client filter, runs the tool once per
client, and answers one result per client with the client id, the outcome and any error. It refuses
the `submit_*` tools, so `PLAN_SUBMISSION_MCP.md` decision 6 holds: a batch derives the figures for
every client, the practice reads them, and each filing is its own call with the figures already
seen.

The CLI mirrors the tools: `diya-submit clients list`, `clients add`, `clients invite`,
`books list --client <id>`, `derive vat --client <id>`, `derive vat --all-clients` and
`submit vat --client <id> --from <file>`. An `--all-clients` run prints one line per client and
exits non-zero when any client failed.

#### Security boundaries

- Every client-scoped route reads the client row with the caller's own hashed sub as the partition
  key. A client id from another practice reads as not found.
- The S3 prefix puts the practice's hashed sub above the client segment, so a key built from a
  stolen client id still lands under the caller's own prefix.
- `enforceBundles` gains the practice check: a request carrying a client id needs an active
  `resident-pro`, and the client row must exist and not be archived.
- `publishActivityEvent` carries the client id on every client-scoped event, beside the hashed sub
  that stays the actor. New events: `client-added`, `client-invited`,
  `client-authorisation-accepted`, `client-archived`. `vat-return-submitted`, `bundle-granted` and
  the HMRC request records gain the same field, so a client's audit trail is one query.
- Token charges belong to the practice, and each charge records the client it was spent on.

#### Migration from sole trader to practice

A sole trader who subscribes to `resident-pro` keeps every book where it is. The first client added
gets a new client id and an empty book set. `move_book_to_client` copies a book and its versions
under the client prefix and deletes the old keys, so an existing book becomes a client's. Receipts
already filed stay keyed to the user with no client id, and the receipts page shows them under the
practice's own name. When the subscription lapses, the client rows are kept, the book sets enter
the 30-day grace, and a resubscribe finds the list as it was. Cancelling an HMRC invitation stays
the practice's own act.

#### PU-7's build steps

| # | Task | Repo | Precursors | Model | Files |
| --- | --- | --- | --- | --- | --- |
| PU-7a | The client table and its repository: CDK table with PITR, create, read, list, archive | Submit | PU-6 | Sonnet | `infra/.../DataStack.java`, `app/data/dynamoDbPracticeClientRepository.js`, its tests, `DataStackTest.java` (~4 files) |
| PU-7b | The client routes under `/api/v1/practice/clients`: list, create, read, archive | Submit | PU-7a | Sonnet | four handlers in `app/functions/practice/`, their tests, `app/server.js` (~7 files) |
| PU-7c | Per-client book prefixes: `resolveOwnerPrefix` takes a client id, the five DIYA-GL routes pass it | Submit | PU-7a | Sonnet | `app/data/s3DiyaGlRepository.js`, the five `app/functions/diyaGl/` handlers, their tests (~9 files) |
| PU-7d | The `resident-pro` catalogue values and the entitlement by client | Submit | PU-2, PU-7c | Sonnet | `web/public/submit.catalogue.toml`, `app/services/diyaGlEntitlement.js`, their tests (~4 files) |
| PU-7e | The token grant that scales with the client count at each monthly refresh | Submit | PU-7d, and the grant numbers below | Sonnet | `app/services/tokenEnforcement.js`, `app/services/bundleManagement.js`, their tests (~4 files) |
| PU-7f | Agent authorisation: the ARN on the practice, the Agent Authorisation API client, the invite, status and relationship routes | Submit | PU-7b | Sonnet | `app/lib/hmrcAgentAuthorisation.js`, three handlers, their tests (~7 files) |
| PU-7g | The submission routes take a client id and resolve the identifier from the client row; `enforceBundles` gains the practice check | Submit | PU-7f | Sonnet | `hmrcVatReturnPost.js`, `hmrcVatObligationGet.js`, `companiesHouseAccountsPost.js`, `app/services/bundleManagement.js`, their tests (~10 files) |
| PU-7h | Audit and receipts by client: the event field, the receipt attribute, the receipts filter, the Athena view | Submit | PU-7g | Sonnet | `app/lib/activityAlert.js`, `app/data/dynamoDbReceiptRepository.js`, `app/functions/hmrc/hmrcReceiptGet.js`, one view, their tests (~7 files) |
| PU-7i | The MCP client tools: `list_clients`, `add_client`, `invite_client`, `client_authorisation_status`, and the client id on the book and derive tools | Submit | PU-7c, PU-7g, `PLAN_SUBMISSION_MCP.md` M2 and M3 | Sonnet | `mcp/lib/client-tools.js`, `mcp/lib/server.js`, `mcp/lib/book-tools.js`, their tests (~6 files) |
| PU-7j | `run_for_clients` and the CLI's `--all-clients`: one result row per client, non-zero exit on any failure | Submit | PU-7i | Sonnet | `mcp/lib/batch-tools.js`, `mcp/bin/diya-submit-mcp.js`, the CLI, their tests (~5 files) |
| PU-7k | The practice page: the client list, each client's authorisation state, add and invite | Submit | PU-7b, PU-7f | Sonnet | `web/public/practice.html`, `web/public/practice.js`, the browser spec (~5 files) |
| PU-7l | `move_book_to_client`: copy a book and its versions under the client prefix, delete the old keys | Submit | PU-7c | Sonnet | `app/data/s3DiyaGlRepository.js`, one route, the MCP tool, their tests (~5 files) |
| PU-7m | The behaviour test: two clients, derive and submit for both against the HMRC sandbox | Submit | PU-7j | Sonnet | `behaviour-tests/practiceLicence.behaviour.test.js`, `package.json` (~2 files) |

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
| PU-5 | The DIYA-GL tier on prod: `DIYA_GL_RESIDENT_TIER`, `prod` in `resident`'s environments | Submit | PU-3 | Haiku | `SubmitApplication.java`, `submit.catalogue.toml` (~2 files) |
| PU-6 | Practice licence design: clients under one sign-in, per-client book sets, agent authorisation, batch through MCP and CLI | Submit | — | Opus | `PLAN_PRICE_UPDATE.md` §(d) expanded, then a build task list |
| PU-7 | Practice licence build: the thirteen rows PU-7a to PU-7m in §(d) | Submit | PU-6 | Sonnet | §(d)'s build steps (~75 files across 13 rows) |
| PU-8 | The DIYA-GL offer on the spreadsheets pages: £39 a year shown first, £3.99 a month beneath it. The sandbox labels are DG-2b and the `sandbox_expired_seen` event is DG-6 in `../spreadsheets.diyaccounting.co.uk/_developers/archive/PLAN_DIYA_GL_HOME.md`; both carry the 35-day change and are tracked there | spreadsheets | PU-2 | Sonnet | `web/diya-gl.co.uk/public/cloud.js`, the cloud browser spec (~2 files) |
| PU-9 | Retire `resident-diya-gl`, `resident-itsa`, `resident-ltd` once Stripe live shows no subscription on their prices | Submit | PU-5 | Haiku | `submit.catalogue.toml`, `.env.ci`, `.env.prod` (~3 files) |

## Decisions taken (operator, 2026-09-21)

1. `resident-vat` stays at 99p a month for its four subscribers; closing it to new business is a
   later decision with no date.
2. One Resident price: £39 a year, £3.99 a month, filing included as each is recognised.
3. Annual is the default button.
4. `resident-pro` becomes the practice licence.
5. The sandbox runs 35 days (25 was the first instruction, corrected the same day).

## Open questions for the operator

- The practice price: £19.99 a month or £199 a year is proposed. The design (§(d)) found no
  per-client fee at HMRC, since the invitation API costs nothing, so the price rests on what a
  practice will pay rather than on a cost to recover.
- The client count a practice licence carries: an open list, or a cap with a higher tier above it.
  PU-7e cannot set the token grant until this is decided.
- The token grant for a practice: the base each month and the amount per client. 100 a month is
  today's flat grant for one trader.
- What a client row may hold: the display name and every identifier a filing needs, or identifiers
  only. The practice's clients are people the company holds no relationship with, so the answer
  sets what the ICO registration has to cover.
- Whether the `resident` bundle's monthly price is offered at all on the DIYA-GL page, or only on
  `bundles.html`; the plan shows both, annual first, everywhere.
