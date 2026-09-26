<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: From books to Submit

Draft for the operator to refine. No board rows exist for it yet.

A customer's books reach a Submit filing in two ways. The activity page reads a file the
customer drops, picks from disk or picks from their own Google Drive, and fills the form. Or a
diya-gl page with the books open sends the figures to the Submit activity. The diya-gl pages also
save and open the diya-gl book in the customer's own Drive, with the customer's own Google
token, and no Submit sign-in. Two videos show a filing from a dropped file.

## User assertions (verbatim)

> Update me on or create a plan to support submission via diya-gl both indirectly in https://submit.diyaccounting.co.uk/ on the activity pages using a populate-from-diy-accounting-spreadhsheets option that prompts for a local file or google drive location, or directly from a set of accounts loaded in a diya-gl page which then jumps into submit (bundles permitting) to file and as part of this saving an diya-gl native format to google drive should be possible from the diya-gl pages without logging in to their diy accounting submit cognito session via the google account this would be client side only where the loaded page that can now export to downloadable file can also save to google drive with the users own client side auth without us managing that (and similarly when a books zip or spreadsheets xlsx or spreadsheets zip is loaded for a https://submit.diyaccounting.co.uk/ submission it is the users own google auth for google drive client side like it is for the file system) and the file from diya-gl/spreadsheets should also have the option for peiple who have savced to cloud to load DIY from there and the submission pages should have a landing zone where you can drag and drop a books zip or spreadsheets xlsx or spreadsheets zip and it load that way and here should be a video of this for a couple of activities e.g. ITSA quarterlies and VAT submission.

## Where we stand

Paths starting `../spreadsheets/` are in `../spreadsheets.diyaccounting.co.uk/`.

**Submit activity pages.**

| Page | What it takes today |
|---|---|
| `web/public/hmrc/itsa/annualSubmission.html:98-112` | "Import from a book": a file input for `.json` only, the output of the MCP tool `derive_itsa_annual_submission` |
| `web/public/hmrc/itsa/annualSubmission.html:592-633` | `importDerivedFigures` maps the JSON's allowances and adjustments onto form fields by id and names the unmapped ones |
| `web/public/hmrc/vat/submitVat.html:49`, `:99` | Typed figures only: the form and the nine box inputs (`vatDueSales` first). No import |
| `web/public/hmrc/itsa/selfEmploymentPeriod.html:46` | Typed figures only. No import |

No Submit page reads a workbook, a package zip or a diya-gl zip. No server route parses a book.
The only route that takes book bytes is the DIYA-GL storage PUT
(`app/functions/diyaGl/diyaGlPut.js:55-56`), which stores the zip opaquely.

**Derivations.** The book-to-figures mappings live in the Node MCP package: `deriveVatReturn`
(`mcp/lib/vat-tools.js:154`), `deriveItsaQuarterlyUpdate` (`mcp/lib/itsa-tools.js:213`) and
`deriveItsaAnnualSubmission` (`mcp/lib/itsa-tools.js:273`). They import the diya-gl package's
`dist/` modules (`mcp/lib/itsa-tools.js:22-26`, `mcp/lib/vat-tools.js:10-12`), pinned at 1.2.17
(`mcp/package.json:22`); the package in the spreadsheets repo is at 1.2.35
(`../spreadsheets/diya-gl/package.json:3`). `PLAN_SUBMISSION_MCP.md:14-15` already names the
three formats: `.xlsx`, `books.zip`, `books.diya-gl`.

**Gates.** `web/public/submit.catalogue.toml`:

| Activity | Bundles | Lines |
|---|---|---|
| `submit-vat` | day-guest, invited-guest, resident-vat, resident, resident-guest, resident-pro-comp, resident-pro | 260-268 |
| `self-employed` (quarterly updates) | resident, resident-pro | 330-343 |
| `self-employed-year-end` (annual submission) | resident, resident-pro | 368-375 |
| `diya-gl-storage` (S3 book store) | resident | 470-481 |

**Google on Submit.** One web OAuth client backs Cognito's "Sign in with Google", scopes
`email openid profile`, redirect URIs on the two auth domains only
(`infra/google/gcp/oauth.toml:16-24`; `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java:248-253`).
Its project number is 670010122633 (`oauth.toml:18`). The consent screen brand is
"DIY Accounting Submit", audience external (`oauth.toml:55-57`). The Drive API is not in the
enabled-API list of `diyaccounting-ga4` (`infra/google/gcp/project.toml:25-43`). The Submit CSP
allows scripts from itself, RUM and Tag Manager only, and frames from itself, YouTube and the
simulator only (`infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java:792-802`).
`../developers/submit/archive/PLAN_SIGN_IN_PARITY.md` (line 41) lists the diya-gl Drive store as a third-party grant, off while
`googleClientId` is null.

**The diya-gl pages (spreadsheets repo).**

| Fact | Where |
|---|---|
| The page reads any upload through the engine bundle, in the browser | `../spreadsheets/web/diya-gl.co.uk/public/data.js:4-22` |
| One esbuild bundle of the engine, Node built-ins stubbed, ajv pre-generated for the CSP | `../spreadsheets/scripts/build-diya-gl-bundle.mjs:4-20` |
| Seven byte kinds told apart by content; nothing touches fs, so the same read serves CLI, MCP and page | `../spreadsheets/app/lib/diya-gl-interchange.js:12-23`, `readBookSource` `:471`, `writeDiyaGlZip` `:534` |
| A file picker (`.xlsx,.zip,.json`) and a whole-page drop zone already exist | `../spreadsheets/web/diya-gl.co.uk/public/shell.js:843`, `:1198-1219` |
| Drive store built (LP-24): GIS token client, `drive.file`, a `DIYA-GL` folder, list, open, revisions, trash | `../spreadsheets/web/diya-gl.co.uk/public/drive.js:26-27`, `:161-167`, `:380-499` |
| Drive offered only to a signed-in Submit subscriber (`active-subscription`) | `drive.js:77-83` |
| "Save to my Google Drive" in the save menu | `shell.js:2967-2968` |
| `googleClientId: null`, so every Drive control is off | `../spreadsheets/web/diya-gl.co.uk/public/cloud-config.js:25` |
| LP-24 design and the seven operator console steps | `../spreadsheets/PLAN_DIYA_GL_LAUNCH.md:347-356`, `:632-665`, `:777-793` |
| LP-24a, the console steps, is an open operator row | `../spreadsheets/NEXT.md:44` |
| No link from a diya-gl page to Submit | grep of `shell.js` for `submit.diyaccounting` |

**Videos.** `videos/submit-return.json:4` ("Submit a VAT return to HMRC") and
`videos/itsa-quarterly-update.json:4` (ci only, `:16`) type their figures. The scene-script
schema has no step that drops or picks a file (`videos/scene-script.schema.json`, action
constants).

**Distance.** Journey C is mostly built and needs one gate moved plus the console steps. A, B
and the videos are new work. The shared piece for A and B is a browser build of the
derivations.

## Where a book is kept

| Who | Where they can keep a book |
|---|---|
| Anyone, not signed in to Submit | Their own device (open, download) and their own Google Drive, through their browser's own Google sign-in |
| A signed-in Submit user | All of the above, plus the DIYA cloud store on S3: a free sandbox tier kept 35 days (`app/functions/diyaGl/diyaGlPut.js:141`, the bucket's `expire-sandbox` rule at `DataStack.java:956`), or the resident tier kept while the Resident subscription runs and for 30 days after it lapses (`app/services/diyaGlEntitlement.js:30`, `diyaGlLapseSweep.js`); a practice's clients' books follow the practice's Resident Pro subscription |

## The journeys

### A. Populate an activity page from a file

1. On the VAT return, ITSA quarterly update and ITSA annual submission pages, a card "Fill from
   your DIY Accounting books" sits above the figures.
2. The card is a drop zone. It also carries two buttons: "Choose a file" (the browser's file
   dialog) and "Choose from Google Drive" (the Google Picker).
3. Accepted: a diya-gl books zip, a spreadsheets `.xlsx`, a spreadsheets package zip. Kind is
   decided by content through `readBookSource`, never by name. A legacy `.xls` gets the message
   the diya-gl page already shows.
4. The page reads the book in the browser, derives the figures for the period the form holds
   (VAT period end, ITSA period end and tax year), and fills the fields. A status line names the
   file, the period, the count filled and any figure the form has no field for, as
   `importDerivedFigures` does today.
5. A book whose period does not cover the form's period fills nothing and says why.
6. The customer checks the figures and submits as now. Only the filed figures leave the browser.

The Drive button asks Google for a `drive.file` token on its click, opens the Picker filtered to
zip and xlsx, and downloads the chosen file with that token. A file the diya-gl page saved into
the `DIYA-GL` folder shows in the Picker like any other.

### B. From accounts open in a diya-gl page to a Submit activity

1. A diya-gl page with a book open shows "File with DIY Accounting Submit" in its menu, with the
   filings the book supports: VAT return (a VAT-registered book), ITSA quarterly update and
   annual submission (a self-employed book).
2. The customer picks one and a period. The page derives the figures with the same browser
   build as A.
3. The page opens the Submit activity URL with the figures in the fragment
   (`#books=<base64url JSON>`): figures, period, source file name, package version.
4. The Submit page reads the fragment first, before any sign-in redirect, moves it to its own
   `sessionStorage`, and clears the fragment from the address bar.
5. Sign-in, HMRC authorisation and the bundle check run as they do today. A customer without
   the bundle lands on `bundles.html` from the existing entitlement widget; the figures wait in
   `sessionStorage` for the return.
6. On load the form fills from the stored figures, shows the same status line as A, and drops
   the stored copy.

The diya-gl page needs no Submit session. When `cloud.js` already has one, it can read the
entitlement first and label the menu item with what the bundle allows.

### C. The diya-gl book in the customer's own Drive, no Submit session

1. Every diya-gl page offers "Save to my Google Drive" beside the download, signed in to Submit
   or not.
2. The first save asks Google for `drive.file` in a popup, on the click. The token stays in
   that tab's `sessionStorage`, as `drive.js:87-101` does today. Submit never sees it.
3. The save writes the same diya-gl zip the download writes, into `DIYA-GL`, as today.
4. "Open from Google Drive" lists the folder (as today) and adds the Picker, so a book saved
   elsewhere or uploaded by hand opens too. The same button opens an `.xlsx` or package zip the
   customer keeps in Drive.
5. The DIYA cloud store stays, on S3, as a Resident feature (`diya-gl-storage`); Google Drive is
   not part of it. The existing Drive store, which ties Drive to a Submit subscription through
   the cloud store's list (`drive.js:77-83`, the merged list in `cloud.js`), goes; Drive is a
   browser-only save and open on the page, with the customer's own Google token (operator,
   2026-09-26).

The code change is the gate at `drive.js:81-83` and the merged list in `cloud.js`: Drive stands
alone when there is no Cognito session. The console steps in LP-24a still apply, with the
client from decision 4.

### D. The videos

Two new scene scripts, recorded with `site-video-capture` and published with `video-publish`:

| Script | Journey | Lane |
|---|---|---|
| `videos/vat-from-books.json` | Drop the BrickWork Pro SE VAT book on the VAT return page, check the nine boxes, submit | ci, HMRC sandbox |
| `videos/itsa-quarterly-from-books.json` | Drop the same kind of SE book on the quarterly update page, check the figures, submit | ci, HMRC sandbox |

The schema gains a `dropFile` step (path, target) that the recorder plays as a real drag with a
visible file card, so the viewer sees the drop. The Drive button is shown, and not used, because
the capture has no Google account.

## Decisions

The operator accepted every recommendation below on 2026-09-26; each "Recommend" line is the decision.

1. **Where the parse and the derivation run.**
   - (a) In the browser: a Submit esbuild bundle of the diya-gl engine plus the three derivations.
   - (b) On the server: a new `POST /api/v1/books/derive` Lambda taking the file.
   - Decided: (a). The book stays in the browser, the diya-gl page already runs the same read
     in the browser, and there is no new Lambda, upload limit or data-retention question.
2. **Where the three derivations live.**
   - (a) Stay in `mcp/lib/`; Submit bundles them for the browser, and journey B hands over the
     whole book instead of figures.
   - (b) Move into the diya-gl package as exported functions (`deriveVatReturn`,
     `deriveItsaQuarterlyUpdate`, `deriveItsaAnnualSubmission`); the MCP, the Submit bundle and
     the diya-gl page all import them.
   - Decided: (b). One mapping for three callers; the diya-gl page can show the figures before
     the jump. The cost is a package release per mapping fix.
3. **How journey B hands over.**
   - (a) URL fragment, moved to Submit's `sessionStorage` on arrival.
   - (b) `sessionStorage` directly: not possible, the two sites are different origins.
   - (c) `postMessage` to a `window.open`ed Submit tab: carries the whole book, needs the opener
     alive through sign-in and a handshake on both sides.
   - (d) A short-lived server object behind a one-time id: survives everything, but puts figures
     on the server before the customer has chosen to file.
   - Decided: (a). Figures are a few hundred bytes, the fragment never reaches a server or a log,
     and it survives the sign-in redirect once stored.
4. **Which Google OAuth client the browser uses.**
   - (a) The Cognito sign-in client (`oauth.toml:16-24`), with JavaScript origins added; this is
     what LP-24's console steps say.
   - (b) A new web client in the same project, JavaScript origins only, never given a secret,
     recorded in `oauth.toml` as `purpose = "drive_browser"`.
   - (c) A new project with its own consent screen, e.g. branded DIYA-GL.
   - Decided: (b). The sign-in client's configuration stays untouched, and staying in the same
     project keeps one consent screen and, if Google ties `drive.file` grants to the project as
     expected, lets Submit's Picker and the diya-gl page see each other's files. LP-24a changes
     to name this client.
5. **Scopes.**
   - (a) `drive.file` plus the Picker. Non-sensitive; the app sees only files it created or the
     customer picked.
   - (b) `drive.readonly` or `drive`. Restricted; any server storage or transmission of the data
     brings a third-party security assessment.
   - Decided: (a). It covers every journey here.
6. **Privacy line.**
   - (a) The book never leaves the browser; only the figures filed with HMRC reach Submit.
   - (b) Allow a server-side parse for large or odd files.
   - Decided: (a), stated on the privacy page and in the drop-zone copy.
7. **Which Submit pages get the drop zone first.**
   - (a) VAT return, ITSA quarterly update, ITSA annual submission.
   - (b) Also UK property periods and the micro-entity accounts filing.
   - Decided: (a) now; (b) as follow-on rows once the shared widget exists.
8. **The existing JSON import on the annual submission page.**
   - (a) Keep it as a fourth accepted kind in the new card.
   - (b) Remove it once the card reads books directly.
   - Decided: (a): the MCP writes that JSON and customers using the MCP still need it.

## Tasks

| Id | What | Files (estimate) | Size | Model | Depends on |
|---|---|---|---|---|---|
| BS1 | Move the three derivations into the diya-gl package with tests; release; MCP imports them | spreadsheets `app/lib/calculators/`, `diya-gl/`, submit `mcp/lib/vat-tools.js`, `itsa-tools.js`, `mcp/package.json` | ~8 | Opus | decision 2 |
| BS2 | Submit browser bundle: engine read plus derivations, stubs as in `build-diya-gl-bundle.mjs`; an npm script | `scripts/build-books-bundle.mjs`, `package.json`, `web/public/lib/books-bundle.js` (built) | ~4 | Sonnet | BS1 |
| BS3 | The "Fill from your books" widget: drop zone, file dialog, status line, per-page field mapping | `web/public/widgets/books-import.js`, `web/public/hmrc/vat/submitVat.html`, `hmrc/itsa/selfEmploymentPeriod.html`, `hmrc/itsa/annualSubmission.html`, CSS | ~6 | Sonnet | BS2 |
| BS4 | Browser tests for BS3 with fixture books (diya-gl zip, xlsx, package zip, `.xls`, wrong period) | `web/browser-tests/booksImport.browser.test.js`, fixtures | ~3 | Sonnet | BS3 |
| BS5 | Google browser client: `oauth.toml` entry, Drive and Picker APIs in `project.toml`, a restricted API key recorded as code, the assert script extended | `infra/google/gcp/oauth.toml`, `project.toml`, `google-oauth-assert.js` | ~4 | Sonnet | decision 4; console steps (operator) |
| BS6 | Drive button on the Submit widget: GIS token client, Picker, download; CSP adds `accounts.google.com`, `apis.google.com`, `docs.google.com` frames, `www.googleapis.com` | `web/public/widgets/books-import.js`, `web/public/lib/google-drive-picker.js`, `EdgeStack.java` | ~4 | Sonnet | BS3, BS5 |
| BS7 | Journey B receiver on Submit: read the fragment before any auth redirect, store, fill, clear | `web/public/widgets/books-import.js`, `web/public/lib/auth-url-builder.js` | ~3 | Sonnet | BS3 |
| BS8 | Journey B sender on the diya-gl page: menu item, period choice, derive, open Submit | spreadsheets `shell.js`, a new `submit-handoff.js`, product manifests | ~4 | Sonnet | BS1, BS7 |
| BS9 | Journey C: Drive offered without a Cognito session; Picker for "Open from Google Drive"; spec cases updated | spreadsheets `drive.js`, `cloud.js`, `shell.js`, `web/browser-tests/diya-gl-drive.browser.test.js` | ~5 | Sonnet | BS5 |
| BS10 | `cloud-config.js` `googleClientId` set per host, and the Picker key | spreadsheets `cloud-config.js` | ~1 | Haiku | BS5 |
| BS11 | Privacy page: Drive, `drive.file`, the book stays in the browser | `web/public/privacy.html`, spreadsheets privacy copy | ~2 | Haiku | decision 6 |
| BS12 | Scene-script `dropFile` step and recorder support | `videos/scene-script.schema.json`, the capture runner | ~3 | Sonnet | — |
| BS13 | The two scene scripts, recorded on ci, added to `videos/publish.json` | `videos/vat-from-books.json`, `videos/itsa-quarterly-from-books.json`, `videos/publish.json` | ~3 | Sonnet | BS3, BS12 |
| BS14 | Simulator behaviour cases: drop a fixture on VAT and ITSA quarterly, submit, receipt | `behaviour-tests/` (VAT and ITSA suites) | ~2 | Sonnet | BS3 |

Operator steps sit beside BS5: create the web client with the JavaScript origins
(`https://submit.diyaccounting.co.uk`, the ci set hosts, `https://diya-gl.co.uk`,
`https://ci.diya-gl.co.uk`), enable the Drive and Picker APIs, add `drive.file` to the consent
screen, create the API key restricted to those sites plus `https://docs.google.com/*`, and
confirm brand verification. They replace LP-24a's steps 1 to 4.

## Risks and open questions

1. **Project of the sign-in client.** Project number 670010122633 is recorded, not the project
   id. It is not `diyaccounting-ga4` (958354756046): the GA4 service account gets 403 on
   `projects.get` for it (checked 2026-09-26 through `scripts/gcp-as-sso.sh`), so it is a separate
   project the service account has no role in. Its id decides where BS5 lands, and whether the
   Drive client is created as code there needs a role for the service account in
   `analytics/google-roles.toml` first.
2. **`drive.file` across two sites.** Expected: a file created under one client in a project is
   visible to another client in the same project. To prove in BS9 before BS6 relies on it.
3. **Brand verification.** Google asks every external production app to pass brand
   verification (homepage, privacy policy, verified domains, branding). `diya-gl.co.uk` as a
   JavaScript origin likely needs to be an authorised, verified domain on the consent screen.
4. **ci origins.** JavaScript origins are exact hosts. Named ci deployments beyond the ci sets
   and the apex will not get Drive; tests stub Google there.
5. **Bundle size.** The engine bundle loaded on three activity pages. Load it on first use of the
   card, not on page load.
6. **Google Sheets conversions.** Decided by the operator, 2026-09-26: this plan stores and
   retrieves DIY Accounting authored files only (a diya-gl zip, a spreadsheets `.xlsx` or package
   zip, a books zip). A file Drive holds as a native Google Sheet is refused with a message asking
   for the DIY Accounting file, because a converted Sheet does not reliably convert back to the
   workbook the reader expects. Native Sheets support is its own plan, `PLAN_GOOGLE_SHEETS.md`.
7. **Period mismatch.** A VAT book whose periods straddle HMRC's obligation dates
   (`PLAN_SUBMISSION_MCP.md`, dependencies table) fills nothing. The message must say which
   periods the book covers.
8. **Journey C and the Resident bundle.** Decided by the operator, 2026-09-26: Drive is free and
   needs no Submit sign-in. Saving a book to the customer's own Drive from the page costs DIY
   Accounting one page download, the same as a local file, and a Drive store tied to a Submit
   account gives the same experience while making DIY Accounting a party to the customer's
   Drive access. The subscriber gate at `drive.js:77-83` goes, and the launch plan's Resident
   bundle (`../spreadsheets/PLAN_DIYA_GL_LAUNCH.md:354-356`) drops Drive; the spreadsheets
   repository makes that change.
9. **Headless Google.** No test Google account signs in headlessly, so consent, Picker and
   upload are checked by hand after a prod deploy, as LP-24 already plans.

## Verification

| Journey | Proof |
|---|---|
| A, local file | BS4: each fixture kind fills the VAT boxes and ITSA fields with values equal to `derive_vat_return` and `derive_itsa_quarterly_update` on the same book; `.xls` and wrong period fill nothing |
| A, Drive | Browser test with `accounts.google.com`, `apis.google.com` and `www.googleapis.com` stubbed by `page.route`, as LP-24's spec does; then the operator picks a file from their own Drive on prod |
| A, end to end | BS14 on the simulator lane, then `submitVatBehaviour` on ci with a dropped fixture |
| B | Browser test: the diya-gl page opens Submit with a fragment; Submit stores it, clears it, survives a stubbed sign-in redirect, fills the form, and the stored copy is gone after fill |
| C | LP-24 spec cases re-run with no Cognito session; case 1 changes from "absent" to "offered"; the operator saves and reopens a book on their own Drive |
| Privacy | A browser test asserts no request carries the book bytes to Submit; only the filing call carries figures |
| D | The two videos on `videos.html`, each showing the drop, the filled figures and the receipt |
