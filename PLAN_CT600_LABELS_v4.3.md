<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_CT600_LABELS: every field of the CT600 journey has HMRC's term, its box, a note and its place in the DIY Accounting spreadsheets

## Operator assertions (verbatim)

> I am completing the CT600 for diy accounting, and my first observations was that I liked these explatory notes and I would like them for every field in te ct600. Also the names don't match DIY Accounting, where possible prefer HMRC's term (which the note will link to) and all of these should show the CT600 form box numbers. Where the DIY label does not match HMRC (and now Submit) we should add a note about the difference. Anyway for all form fields we should mention the file, sheet and cell that the values come from location and with a screen shot. Please build a plan for these labelling improvements for just the ct600 journey, we can roll it out everywhere if the roll-out goes well.

(operator, 2026-11-25, with screenshots of the box 326 note, the profit and loss and balance sheet sections beside the workbook's `PubP&L` and `PubBalSht` sheets)

> Also for that plan, this form goes to zero when I enter a computed tax value

(operator, 2026-11-25, with screenshots of the "Tax worked out from your answers" panel: all boxes £0 after a value in "Corporation Tax per your own working", and a "Return 1 of 2" block of £0 under the 12-month figures)

> And for that plan, for each block of fields in the ct600 where that field is seen on a video, add an embedded video (where available) and a link to a time when the block is first visible in the video.

(operator, 2026-11-25)

> Also does filling in keep the session warm? there is a lot to fill in and it could easily be interupted. Please include in that plan, a strategy to inform the user and maintain data somewhere in their browser so it can be recovered, have an option in the form filling to set the "store in your browser for" option (default 28 days but please advise on this and the strategy in general).

(operator, 2026-11-25)

> I pressed "Preview the return" and I got this: so four problems, 1. for the plan - the error message is not visible on the page when the button is pressed, we need a strategy for that and it needs to be applied to the ct600 and any time the status area is out of view. I'm thinking a notification bubble top right, closable, and with an in page link to jump up to the status bar. 2. errors are a time when it is essential to give the user information about the state of their form data and where it is, also next steps are needed when the error is a tax submission that will require a bit of considerations with what could be a technical fault, diy credentials issue, or user credentials or account issue. I'm thinking there is a detail area under the status area that remains until closed or overwritten when there is a failure at a critical point such as submitting a form which writes data to HMRC or Companies House. (that's a plan thing). 3. There was no indication of anything happening when I pressed the button so I missed what I assume was a couple of processing notifications. I think these need to be floating bubbles for all places they appear. (also plan) 4. There is the error itself right now in prod where my account is logged in and I cannot file diy accounting's accounts. - please look at this one right now in the main thread.

(operator, 2026-11-25; point 4 is PR #872, outside this plan)

> Also for the plan, hide some of the less frequently used blocks in a twistie and do the same in the "Tax worked out from your answers" section if applicable.

(operator, 2026-11-25)

> preview shown... the spinner was weak though. add to that plan that we need the same narration bubbles as submit vat in any long running submission.

(operator, 2026-11-25)

> For the plan, this form is pretty bad, it should look a bit more like a form like we do for tye comopany accounts, the lableing for this year last year is clumbsy and a poor use of space, it looks lik they should be columns with "Change" next to each figure. and "period of account" looks very odd, these need to match HMRC's field labels and show box numbers (some do but its ugly).

(operator, 2026-11-25, with screenshots of the review step: one row per figure, "Turnover, this year", "Period of account" with ISO dates)

> Thanks, for the plan the "Income and reliefs" section needs some hiding with twisties, some are very common fields such as 515 and 305, they should be first, trading losses looks like a candidate.

(operator, 2026-11-25)

## Status

v4.3 changes CTF1's "Income and reliefs" by hand, the operator's request of 2026-11-25. v4.2 widens CTL7 to the review's layout, the operator's request of 2026-11-25, by hand. v4.1 adds CTN4, the operator's narration request of 2026-11-25, by hand after the review loop ended. v4 is review round 3 of v3.1. v3.1 adds CTN1 to CTN3, the operator's points 1 to 3 of 2026-11-25 about the status messages, and CTF1, the folded blocks. defined 2026-11-25; v2.1 adds CTL0, the operator's defect of 2026-11-25, v2.2 adds CTV1, the operator's video request, and v2.3 adds CTS1, the saved answers and the session, both of the same day, after review round 1 (plan-review-loop); not on `NEXT.md`.

## Goals

On the CT600 page (`web/public/companies-house/fileCompanyTaxReturn.html`), every field the person fills or reads has:

1. **A label in the official term.** A CT600 box takes HMRC's name for it; an accounts line takes the name in the statutory format of the accounts.
2. **Its reference.** A CT600 box shows "Box <n>". An accounts line has no CT600 box: it shows its item in the statutory format (for example "Balance sheet item C") and the CT600 boxes that it feeds, when it feeds one.
3. **A note.** One to three sentences that say what goes in the field, with a link to the source of the term (the Company Tax Return guide anchor, or the legislation for an accounts line).
4. **Where the figure is in DIY Accounting's Limited Company spreadsheets.** The file, the sheet and the cell for this year and for last year, a screenshot of that part of the sheet with the cell marked, and a note when the spreadsheet's label differs from the official term.

The scope is the CT600 journey only: the form, its accounts section, the review step and the receipt. Other journeys follow when the operator decides that this one went well (OCTL1).

## Where it stands

| Part | Where | State |
|---|---|---|
| One table for the CT600 | `web/public/lib/ct600-fields.js`: `CT600_BOX_ROWS` (line 26), `CT600_FORM_FIELDS` (line 636), `DONATIONS_PAID_FIELD` (line 1043), the accounts definitions (lines 1054 to 1238) | the form, the review (`reviewAnswers`) and the receipt (`web/public/lib/filing-record.js`, `filing-result-record.js`) read it |
| HMRC's box names | `CT600_BOX_ROWS`: 64 boxes, each with a label and a Company Tax Return guide anchor | complete; form fields with a box already show "Box <n>:" through `boxLabel` |
| Notes on the form fields | `CT600_FORM_FIELDS`: 40 fields, 33 with a `hint`; 13 have no `box` | 7 with no note: `lossOutsideUk`, `loansMade`, `releasedBeforeEnd`, `repaidSince`, `declarantName`, `declarantStatus`, `declarationAccepted` |
| The note and its link | `hintOf` in `web/public/companies-house/fileCompanyTaxReturn.page.js` (line 244); the link comes from the box row's anchor (`guideAnchorOf`, line 240) | a field with no box has no link |
| Accounts lines | `[id, label]` pairs: `MICRO_PROFIT_AND_LOSS_FIELDS` (7), `MICRO_BALANCE_SHEET_FIELDS` (6), `PROFIT_AND_LOSS_FIELDS` (5), `BALANCE_SHEET_FIELDS` (14), `FIXED_ASSET_FIELDS` (6 for each of the 5 `FIXED_ASSET_CLASSES`). Objects: `STATEMENT_FIELDS` (4), `MICRO_STATEMENT_FIELD`, `ACCOUNTS_REGIMES` (2), `ACCOUNTS_TEXT_FIELDS` (11) | no note, no reference, no link |
| Loan rows | labels in `fileCompanyTaxReturn.page.js` (lines 828 to 885); `ct600-fields.js` holds only their names (`LOAN_ROW_FIELDS`, `REPAYMENT_ROW_FIELDS`, line 1628) | outside the table |
| Where each figure is in the workbook | the spreadsheets repository: `app/data/filing/ct600-v3.toml` (HMRC's box list; 31 boxes carry a `sheetCell` on the workbook's `CT600` sheet), `app/data/filing/frs105-formats.toml` (the micro-entity format headings with their letter, label, legislation link and `sheetCell`), `app/products/ltd/cell-map.js` (`CELL_MAP`: rows of `[sheet, cell, workbook label, book field, section, flag]`) | this-year cells only. `PubP&L` has last year in column B and this year in column F; `PubBalSht` has last year in columns A and B and this year in columns E and F |
| A workbook to photograph | `../spreadsheets.diyaccounting.co.uk/packages/GB Accounts Company 2026-03-31 (Mar26) Excel 2007/` | the published package, with no customer data |

The operator's screenshots show the cost of the gap. The workbook's "Current Assets" (`PubBalSht` E13) and "Net Assets" (`PubBalSht` F33) are different lines. The form's "Current assets" field has no note to say which one it takes. The workbook's "Administrative Expenses" (`PubP&L` F44) has no line called "Other charges", which is the micro-entity format's name for it.

## Rules

- **One table.** Every new fact is a property of the field's entry in `ct600-fields.js`, so the form, the review and the receipt read one record. `label` holds the official term; `hint` holds the note. The `[id, label]` arrays become objects. The loan row labels and the five questions that the page defines itself (CTL1) move from the page into the table. Every use changes in the same task; no compatibility alias.
- **The workbook place is written in the table** as a `sheetCell` string in the spreadsheets repository's form, `"<file>!<sheet>!<cell>"`, with `+` between cells for a sum (`"Financialaccounts.xlsx!MnthP&L!B18+B19+B20"`). The browser cannot import from the diya-gl package: `ct600-fields.js` is a static module, and diya-gl reaches the browser only through `lib/books-bundle.js` (`scripts/build-books-bundle.mjs`). CTL5's script checks each cell against the published workbook.
- **Official terms come from their sources**, each read and cited in CTL1: the CT600 (2026) Version 3 form and the Company Tax Return guide for boxes; The Small Companies and Groups (Accounts and Directors' Report) Regulations 2008 (SI 2008/409), Schedule 1, for the micro-entity and small company formats; FRS 105 and FRS 102 Section 1A where the Regulations do not name a line. A term is never written from memory.
- **A difference note** states the workbook's label, the official term and what the person does about it, in one or two sentences ("The spreadsheet calls this Administrative Expenses. The micro-entity format calls it Other charges. Enter the spreadsheet's figure here.").
- **The text** follows `plain-prose`. Every task that adds or changes a `siteText` string adds or updates its `i18n/cy.toml` entry and runs `npm run build:welsh` in the same commit, because `web/unit-tests/welsh-pages.test.js` fails on a missing or stale entry.
- **The page shows the workbook place to every reader**, in a closed disclosure under the note ("In DIY Accounting's spreadsheets"), so a reader who does not use the spreadsheets is not slowed.
- **The screenshots** come from the published package, never from a customer's or the company's own workbook.

## Tasks

| # | Task | Waits on | Needs | Model | Size |
|---|---|---|---|---|---|
| CTL0 | The worked tax panel keeps its figures when the own working disagrees, and hides the two-return block when the period is 12 months again | nothing | machine-only | Sonnet | ~4 files |
| CTS1 | The answers are saved in the browser for the period the person chooses (28 days by default), offered back on return and deleted on filing | CTL0 | machine-only | Sonnet | ~7 files |
| CTL1 | The label register: every field, its official term and source, its reference, the workbook's label and cells, and whether a difference note is needed | nothing | machine-only | Opus | 1 file (this plan's appendix) |
| CTL2 | The table carries the register: official label, reference, note, source link and workbook cells on every entry of `ct600-fields.js`, with Welsh; the `[id, label]` arrays become objects | CTL1, CTS1 | machine-only | Sonnet | ~6 files |
| CTL5 | `scripts/ct600-source-shots.mjs`: one WebP for each cell the table names, cut from the published package, with the cell marked | CTL2 | machine-only | Sonnet | ~3 files and the images |
| CTL4 | The page shows the reference in every label, the note with its link on every field, and the "In DIY Accounting's spreadsheets" disclosure with the file, sheet, cells, difference note and screenshot, with Welsh | CTL5 | machine-only | Sonnet | ~6 files |
| CTL7 | The review step is laid out like a form: the accounts as a table with this year and last year as columns and Change beside each figure, every row labelled with HMRC's term and a Box column, dates in words; the receipt shows the same labels | CTL4 | machine-only | Sonnet | ~4 files |
| CTV1 | Each section of the CT600 page that a CT600 video shows gets a click-to-load embed of that video, starting where the section first shows, and a link to that second | CTL7 | machine-only | Sonnet | ~7 files |
| CTF1 | The less used blocks of the form, and the intermediate boxes of "Tax worked out from your answers", fold into closed disclosures that open themselves when they hold an answer, a problem or a book's figure | CTV1 | machine-only | Sonnet | ~8 files |
| CTN1 | A status message the reader cannot see also shows as a closable bubble at the top right, with a link that jumps to the status area; every page with the status area | nothing | machine-only | Sonnet | ~5 files |
| CTN3 | The working signs (the `showLoading` spinner and "working" messages) show as a bubble on every page, so the reader sees that the button did something | CTN1 | machine-only | Sonnet | ~4 files |
| CTN2 | A failure at a step that writes to HMRC or Companies House leaves a detail panel under the status area, until it is closed or replaced: what was sent, what was not, where the answers are now, the kind of failure and the next step for that kind | CTN3, CTF1 | machine-only | Opus then Sonnet | ~8 files |
| CTN4 | Every long running submission narrates its stages as the VAT submission does, each stage a status message that CTN3 shows as a bubble | CTN2 | machine-only | Sonnet | ~12 files |
| CTL8 | The look pass: the Welsh proof, `visual-review` on the page, the guide screenshots again, `ui-ux-pro-max` on the CT600 guide frames, and the CT600 videos recorded again | CTL7, CTV1, CTN2, CTN3, CTF1, CTN4 | machine-only | Sonnet | screenshots and videos |
| OCTL1 | The operator decides whether to roll the pattern out to the other journeys, from the CT600 page on prod | CTL8 on prod | human-driven | operator | 0 files |

### CTL0. The worked tax panel goes to £0

Two causes, both read from the code:

1. **The own working empties the panel.** `renderWorkedTax` (`web/public/companies-house/fileCompanyTaxReturn.page.js`, line 1559) derives the return with every typed figure, `ownCorporationTax` included. `deriveCt600FromFigures` throws `Ct600RefusedError` when the tax and the own working differ by more than £5 (`app/services/ct600Figures.js`, line 1223). The page's `catch` (line 1575) then empties the rows and shows "Fill in the period and the accounts and the tax appears here." Only the stale two-return block of cause 2 stays on screen, with its £0 figures. Fix: `renderWorkedTax` removes `ownCorporationTax` from the figures, and from each entry of `figures.accountingPeriods` for a long period, before it derives. The panel then always shows the worked tax. `ct600Figures.js` and `ct600LongPeriod.js` do not change, so the review and the filing still refuse the disagreement, as the field's note says.
2. **The two-return block stays on screen.** `.worked-tax__returns { display: grid; }` (`web/public/css/long-period.css`, line 59) overrides the `hidden` attribute. After the period of account was over 12 months once (for example while a date is typed), `workedTaxLong` stays visible with its last figures under the 12-month rows. Fix: `.worked-tax__returns[hidden] { display: none; }`, as `web/public/css/bundles-cards.css` (line 26) does for its sections.

Gates: a case in `web/browser-tests/fileCompanyTaxReturn.browser.test.js` that types an own working £100 away from box 440 and still reads box 440 and box 600; a case that types a 13-month period and then a 12-month one and finds no "Return 1 of 2" heading visible; the review step still refuses the disagreement with both figures; `npm test`, `npx eslint` and `npx prettier --check` on each changed file. CTL0 touches no file that the other tasks need first, so it can land alone and before them.

### CTS1. The sign-in stays alive and the answers survive an interruption

What happens today, read from the code:

- **Typing does not keep the sign-in warm, and it does not need to.** Nothing on the CT600 page calls the API while the person types. The stacks set no token lifetimes (`IdentityStack.java`, line 342), so Cognito's defaults apply: the ID token lasts one hour and the refresh token 30 days. The preview and the filing use `fetchWithIdToken` (`web/public/lib/services/api-client.js`, line 272). On a 401 it refreshes the tokens once with the refresh token and sends the request again. So a pause of hours loses nothing. The person goes to sign in only when that refresh fails (the refresh token ended or was revoked). No keep-alive is added.
- **An interruption loses the answers.** `sendToSignIn` (`web/public/lib/services/auth-service.js`, line 78) clears the session and goes to the sign-in page. A closed tab, a crash or a reload also loses the answers. The page keeps answers in `sessionStorage` only after a joint filing has sent its first part (`persistJoint`, `fileCompanyTaxReturn.page.js`, line 2845), and that store ends with the tab.

The change:

1. **Save the answers as the person types.** A new module, `web/public/lib/form-draft.js`, written so that other journeys can use it after OCTL1, saves `readValues()` (`fileCompanyTaxReturn.page.js`, line 1150) to `localStorage` one second after the last change. The key holds the user's `sub` (from `userInfo`) and the company number, so two companies or two people on one browser do not mix. The person types the period, so the company lookup does not know it; the record holds the period with the values, the time saved and the time it expires. The Government Gateway user ID and password and the Companies House authentication code (`gatewayUserId`, `gatewayPassword`, `companyAuthCode` in `fileCompanyTaxReturn.html`, lines 178 to 230) are outside `returnForm`, so `readValues()` never reads them. A unit test asserts that a saved record holds none of the three.
2. **Offer them back.** After the company lookup, when a saved record exists for that user and company, a notice above the form names the period and when it was saved, and offers "Restore my answers" and "Start again". "Restore my answers" fills the form with the existing `fillValues` (`fileCompanyTaxReturn.page.js`, line 2871), which also adds the loan and repayment rows. "Start again" deletes the record.
3. **The person chooses how long.** Beside the notice that the answers are being saved, a choice labelled "Keep my answers in this browser for": 7 days, 28 days (the default), 90 days, or "do not keep". The choice itself is kept in `localStorage`. A record past its expiry is deleted on the next visit to any page that loads the module. A "Delete my saved answers" control removes every record of the person in this browser.
4. **Delete on filing.** When HMRC accepts the return (and, for a joint filing, both parts), the record is deleted. The existing `persistJoint` resume point stays as it is.
5. **Tell the person.** The notice says, in plain words, that the answers are kept only in this browser, never on our servers, and that anyone who uses this browser could see them; it suggests "do not keep" on a shared computer. `web/public/privacy.html`, section "Cookies and browser storage" (line 626), adds the saved answers: what is kept, where, for how long, and how to delete them. Assumption: this storage serves a service the person asked for, so it needs no cookie consent (PECR regulation 6(4)).
6. Welsh for every new string. Gates: unit tests of `form-draft.js` (key, expiry, the three excluded fields, delete); browser cases in `web/browser-tests/fileCompanyTaxReturn.browser.test.js` that type, reload, restore and find the values, that choose "do not keep" and find nothing after a reload, and that file and find the record gone; `npm test`, `npx eslint`, `npx prettier --check`. CTS1 follows CTL0 and comes before CTL2 because all three change `fileCompanyTaxReturn.page.js`.

Advice on the default. 28 days suits a personal computer: a company's accounts and return are often prepared over several weeks, and a shorter default would lose answers between sittings. A longer default keeps a company's figures in the browser after they are needed, so 90 days is a choice and not the default. The main risk is a shared computer; the notice and "do not keep" answer it. Saving drafts on our servers would follow the person across devices, but it would hold unfiled financial figures in our tables, and the operator asked for the browser.

### CTL1. The label register

One table, written as the appendix of this plan, with one row for each field of the CT600 journey: the 64 box rows, the 40 form fields, `DONATIONS_PAID_FIELD`, the accounts lines of both regimes, the fixed asset note, the statements, the regime choice, the text fields of the accounts section, the loan and repayment row fields, and the five questions that `fileCompanyTaxReturn.page.js` defines itself: where the accounts go (`sendTo`), which copy goes to Companies House (`companiesHouseCopy`), `includeComparatives`, `includeFixedAssetNote` and `firstPeriodStart`. The sign-in, company lookup, agent and gateway controls are not CT600 fields and are left out. Columns:

- the field id and the current Submit label;
- the official term, its source and the URL with its anchor (the guide anchor already in `CT600_BOX_ROWS`; the legislation.gov.uk section for an accounts line);
- the reference: "Box <n>", or the format item and the boxes it feeds (turnover feeds box 145), or "none" for a question with neither;
- the workbook's label (the text in the same row as the cell, as `PubP&L` C44 is for F44) and its `sheetCell` for this year and last year, or "none" when the workbook has no such line (a value the person types, such as box 326); a figure that is the sum of several cells is written with `+` (a micro-entity line can be the sum of several workbook lines);
- "difference note: yes" when the workbook's label differs from the official term, with the note's text.

Start from what the spreadsheets repository already records: the `sheetCell` values of `app/data/filing/ct600-v3.toml` and `app/data/filing/frs105-formats.toml`, and `CELL_MAP`. Submit's `formEntriesFromBook` (`ct600-fields.js`, line 2068) maps a diya-gl book to the form, and `CELL_MAP` maps the workbook to the book. Where these disagree (for example, `frs105-formats.toml` gives "Other charges" as `PubP&L` F44, and Submit's `microProfitAndLossFromSmall` works it out from the small company lines), the row follows the figure Submit fills in and says so. Last-year cells and cells that none of these name are read from the workbook. CTL1 checks each row's cells against one workbook of the published package. A field whose term or cell the sources leave open is listed at the end of the appendix as a question for the operator.

### CTL2. The table carries the register

Each entry of `CT600_BOX_ROWS`, `CT600_FORM_FIELDS`, `DONATIONS_PAID_FIELD`, the accounts definitions, the loan row fields and the five page questions gets its official `label` and its `hint` from the register, and gains:

- `reference` for a field with no `box` (a box field's reference is "Box <n>" from `box`);
- `termSource` (a URL) for a field with no `box` (a box field's link is its box row's anchor);
- `source`: `{ thisYear: "<sheetCell>", lastYear: "<sheetCell>", workbookLabel, differenceNote }`, absent when the register says "none".

The `[id, label]` arrays become objects with `id` and `label`. Every use changes in the same commit: `git grep` the array names; they are used only in `ct600-fields.js`, `fileCompanyTaxReturn.page.js`, `web/unit-tests/ct600-fields.test.js` and `web/browser-tests/fileCompanyTaxReturn.browser.test.js`. The labels and hints of the loan rows and of the five page questions move from `fileCompanyTaxReturn.page.js` into `ct600-fields.js`. A unit test in `web/unit-tests/ct600-fields.test.js` asserts that every field has a label, a reference, a hint and a source link, and that every `sheetCell` has the form `<file>!<sheet>!<cell>`. Gates: `npm run bundle`, then `npm test`.

### CTL5. The screenshots

`scripts/ct600-source-shots.mjs` reads the published package's workbook for each `source` with the diya-gl workbook reader (`dist/app/lib/xlsx-reader.js`). For each single cell (not a sum), it fails when no cell in that cell's row holds the entry's `workbookLabel`. It draws the rows around each named cell as an HTML grid with the sheet's own column letters, row numbers and labels, marks the cell, takes a PNG with Playwright, and converts it with `ffmpeg-static` to `web/public/images/ct600-sources/<sheet>-<cell>.webp`, as `scripts/video-walkthrough.js` writes its WebP frames (line 353). An npm script runs it. A unit test checks that each cell the table names has its image. The images are committed.

### CTL4. The page

`hintOf` renders the note with its source link for every field, and the link comes from `termSource` when the field has no box. Each label starts with its reference ("Box 155:", "Balance sheet item C:"). Under the note, a `<details>` element named "In DIY Accounting's spreadsheets" shows the file, the sheet and the cell for this year and last year, the sum when there is one, the difference note and the CTL5 screenshot. The accounts tables and the loan rows get the same note and disclosure for each line. Gates: `web/browser-tests/fileCompanyTaxReturn.browser.test.js` and `fileCompanyTaxReturn.operatorPreview.browser.test.js` (a label with its reference, a note with its link, the disclosure closed, then open with its cells and image), `npm test`, `npx eslint`, `npx prettier --check`.

### CTL7. The review step and the receipt

The review step (`reviewAnswers` in `ct600-fields.js`) and the receipt (`filing-record.js`, `filing-result-record.js`) already read labels from the table. The operator found the review hard to read (2026-11-25): one row per figure ("Turnover, this year", then "Turnover, last year" much later), "Period of account" with ISO dates, and box numbers in some labels and not others. The change:

1. **The accounts as columns.** The profit and loss account and the balance sheet each become one table with the columns Line, This year, Last year, and a Change link beside each figure that moves focus to that box, as the accounts section of the form already lays them out (`yearLedger` and `microLedger` in `fileCompanyTaxReturn.page.js`). A line with no figure in either year shows "—"; a year with no column (first accounts) has no column.
2. **HMRC's labels and a Box column.** Every row of the other sections takes its label from the table (CTL2), with the reference in its own narrow column ("Box 3", "Box 30 and 35", "Item C", or empty), so a label never starts "Box n:". "Period of account" becomes HMRC's box 30 and box 35, "Start of the period covered by the return" and "End of the period covered by the return", as two rows.
3. **Dates in words**: "1 April 2025", as `longDateText` writes them on the page.
4. The receipt shows the same labels and references. The tests that hold the review and receipt text change with them; a browser case reads the accounts table's columns and follows one Change link to its box; `visual-review` on the review at the phone and desktop widths.

### CTV1. A video for each section

The page has nine sections (`SECTIONS` in `web/public/lib/ct600-fields.js`: company, period, accounts, computation, allowances, reliefs, payments, loans, declaration). Four public CT600 videos exist, each with its YouTube id and a `walkthrough` in `videos/publish.json` and its copy in `web/public/videos/publish.json`: `file-company-tax-return-typed` (`tLEHujmk_RM`), `-with-accounts` (`aQAF5hAcxeQ`), `-book` (`ZoUTlFPvUes`) and `-long-period` (`Lwt-U4Emrao`).

1. **The time a section first shows.** The page builds each section as `<section id="section-<id>" class="form-section">` (`fileCompanyTaxReturn.page.js`, line 1092), and the walkthrough script has no page to look in. So the capture records it: `scripts/site-video-capture.js` adds `section` to each timeline step record (line 749) whose `target` is a string, the id of the `section.form-section` that holds the target, read through the step's Playwright locator while the page is open. `scripts/video-walkthrough.js` then writes, for each CT600 video, `sections: { <section id>: <second> }` into both copies of `publish.json`: the start of the first step for each section, in seconds of the video as `startSeconds` is. A section that no step reaches gets no entry. A recording made before this change has no `section` and so gives no entry.
2. **The page.** Under each section's heading, a closed `<details>` named "Watch this part" holds the first video, in the order typed, with-accounts, book, long-period, that has an entry for the section. On open it loads an iframe from `https://www.youtube-nocookie.com/embed/<id>?start=<second>`, built as `embedElement` builds one (`web/public/widgets/video-pages.js`, line 100), so a closed section loads nothing from YouTube. Beside it, a link to `https://youtu.be/<id>?t=<second>` names the time ("Watch from 1:23"). A section with no entry shows neither.
3. **Prod.** The CT600 videos are public. The video pages hold them back on prod because prod does not list the activity, and the CT600 page reaches only CT38's operators on prod, so its embeds show nothing to a customer until UH7.
4. Welsh for the new strings. Gates: a unit test of the section times from a fixture timeline; a browser case in `web/browser-tests/fileCompanyTaxReturn.browser.test.js` that serves a `publish.json` fixture with one section time (`page.route`), opens that section's details and finds the iframe's `start` and the link's `t`; `npm test`, `npx eslint`, `npx prettier --check`. CTV1 follows CTL7 because CTL4 changes `fileCompanyTaxReturn.page.js` and CTL7 changes the review text in `fileCompanyTaxReturn.browser.test.js`, and CTV1 changes both. CTL8 records the videos again and runs `npm run video:walkthrough`, so the times follow the new recordings.

### CTF1. Fold the less used blocks

Most companies leave the capital allowances, the trading losses, the loans and the payments sections at 0 or No. The page shows them open, with every box, so the reader scrolls past about 30 boxes they do not use (the operator's form of 2026-11-25).

1. **The form.** The section `allowances` (`SECTIONS` in `web/public/lib/ct600-fields.js`), and within `payments` the optional own working, render inside a closed `<details>` whose summary names the section and says "All 0" or the count of boxes with an answer. The section `reliefs` ("Income and reliefs") stays open and is reordered (operator, 2026-11-25): first, open, the two boxes many companies fill, box 515 (`incomeTaxDeducted`) and box 305 qualifying donations paid (`DONATIONS_PAID_FIELD`); then a closed `<details>` named "Trading losses" holding box 160 (`lossesBroughtForward`), box 275 (`lossAgainstTotalProfits`), box 285 (`lossesBroughtForwardAgainstTotalProfits`), the carry-back claim (`lossCarriedBack`), the previous period's chargeable profits (`priorPeriodChargeableProfits`) and the trade outside the UK (`lossOutsideUk`); then a closed `<details>` named "Other income" holding box 620 (`frankedInvestmentIncome`). Within `allowances`, each class group (`ALLOWANCE_CLASSES` in `fileCompanyTaxReturn.page.js`) folds the same way. The company, period, accounts, computation, loans and declaration sections stay open, because every return answers them.
2. **It opens itself** when any box inside holds a value other than its default, when a book or iXBRL file filled a box inside, when a problem names a box inside (the error moves focus there), or when CTS1 restores an answer inside. The reader can always open and close it.
3. **"Tax worked out from your answers"** (`workedTaxPanel` and `renderWorkedTax`, `fileCompanyTaxReturn.page.js`, lines 743 and 1559; the panel is pushed after the reliefs section, line 1093, and stays outside that section's fold) shows, open, box 155, box 315, box 440, box 600 and any warning. The other rows of `workedItems` (line 1422) fold into a `<details>` named "How these are worked out". For a long period, each return's column folds the same way.
4. **Typing into a folded box.** A test or scene script that types into a box inside a fold opens the fold first: `web/browser-tests/fileCompanyTaxReturn.browser.test.js`, `behaviour-tests/steps/behaviour-hmrc-company-tax-return-steps.js` (`#ownCorporationTax`, line 262) and `videos/file-company-tax-return-long-period.json` (`#annualInvestmentAllowance`, `#mainPoolAllowances` and `#donationsPaid`, lines 508 to 548). Playwright does not type into a hidden field, so without this the tests and CTL8's recording fail.
5. Welsh for the new strings. Gates: browser cases that find each folded block closed on a blank form, open after a value is typed or a book fills it, and open with focus on the box a problem names; the worked tax panel shows its four boxes and opens its steps; `npm test`, `npx eslint`, `npx prettier --check`. CTF1 follows CTV1, because both change how `fileCompanyTaxReturn.page.js` renders a section. CTL8's look pass covers the folded page.

### CTN1. The bubble for a message out of view

`showStatus` and `showFailure` (`web/public/lib/utils/dom-utils.js`, lines 17 and 215), and `StatusMessages.show` in `web/public/widgets/status-messages.js` (called directly by `web/public/lib/help-page.js`, line 309, and `web/public/lib/rates/rates-calculator.js`, line 54), add a message to `#statusMessagesContainer`, which sits at the top of each page (152 pages hold it, and all 152 load `submit.js`). When the reader pressed a button far down the CT600 page, the message appeared off screen and the reader saw nothing (operator, 2026-11-25). The change, in a new module `web/public/lib/utils/status-bubble.js` that `submit.js` starts, so that it reaches every page:

- The module watches `#statusMessagesContainer` for added and removed messages (a `MutationObserver`), so it covers every function that writes there. When a message is added and the container is not in the viewport (an `IntersectionObserver` on the container), the same message also shows as a bubble fixed at the top right of the window: its text, a close button, and a link "Go to the message" that scrolls to the container and moves focus to the message.
- The bubble closes when the reader closes it, when the container scrolls into view, or when the message is removed. An error bubble stays until then; an information or success bubble closes after 8 seconds. One bubble shows the newest message; it replaces the one before.
- The bubble has no live-region role. The container (`role="status" aria-live="polite"` on all 152 pages) and an error's `role="alert"` (`showFailure`) already announce the message, so a screen reader hears it once. The close button and the link stay in the tab order.
- The bubble's style goes in `web/public/css/messages.css`. The tests go in a new `web/browser-tests/statusBubble.browser.test.js`, so CTN1 and CTN3 change no source or test file that CTL0 to CTF1 change.
- Welsh for the new strings. Gates: a browser test on a long page (the CT600 page) that scrolls down, triggers an error, finds the bubble, follows its link and finds the container in view; a test that an error shown with the container in view makes no bubble; `npm test`, `npx eslint`, `npx prettier --check`; `visual-review` on the bubble in the light and dark themes.

### CTN3. Working signs as bubbles

The pages show that a request is in progress in two ways. `showLoading()` (`web/public/widgets/status-messages.js`) shows the spinner `#loadingSpinner`, which sits beside the status area (`fileCompanyTaxReturn.html`, line 41); the CT600 page calls it for the preview and for each filing (`fileCompanyTaxReturn.page.js`, lines 2266 and 3418), and 57 files call it. A `showStatus` message of type `info` is the other way: `dom-utils.js` already treats it as progress (`clearSupersededMessages`, line 67), for example "Still processing..." while a request polls (`web/public/lib/services/api-client.js`, line 104).

CTN3 shows each of them as a working bubble at the top right, whatever the scroll position: from `showLoading()` until `hideLoading()`, and for an `info` message until it leaves the container. This replaces CTN1's rule for `info` messages. The working bubble is separate from the CTN1 message bubble, so the error that ends a request stays: the CT600 page shows the error and then calls `hideLoading()` (lines 2299 and 2301). The spinner and the message in the container stay. Welsh for the new string ("Working"). Gates, in `web/browser-tests/statusBubble.browser.test.js`: a case on the CT600 page that presses "Preview the return" with a delayed route and finds the working bubble before the answer; a case that routes a failure and finds the working bubble gone and the error bubble shown.

### CTN2. The failure detail panel

At a failure where the page writes to HMRC or Companies House (the CT600 file, the joint filing, and the preview, which is the step before them), the status message gains a panel under `#statusMessagesContainer` that stays until the reader closes it or a newer failure replaces it. It says:

1. **What was sent and what was not.** For a joint filing, which part reached which service. This comes from `sending` (`fileCompanyTaxReturn.page.js`, line 131) and its `persistJoint` record (line 2845). For the CT600 file, the server's own message states whether HMRC received the return, and the panel shows it as it is: a 502 can say "Do not file it again yet" (`app/functions/hmrc/hmrcCtReturnPost.js`, line 263).
2. **Where the answers are.** "Your answers are still in this form and saved in this browser until <date>" (from CTS1's record), or "not saved: you chose not to keep them".
3. **The kind of failure and its next step**, from the answer's status and error body:
   - a fault on our side (a 5xx from Submit that carries no HMRC or Companies House error, as on 2026-11-25): "This is a fault in Submit, not in your answers or your sign-in." with a link to Help and the request id (the `x-request-id` header, `app/lib/httpResponseHelper.js`, line 212);
   - Submit's own HMRC or Companies House credentials refused (the vendor or presenter credentials): "HMRC or Companies House refused Submit's own credentials. Nothing is wrong with your account. Try again later.";
   - the person's own credentials or account refused (a Government Gateway user ID or password, the company authentication code, an entitlement): what to check, and where;
   - HMRC or Companies House answered a business error: the error text and the field it names.
   A 502 that carries HMRC's or Companies House's errors (`error.errors`, `hmrcCtReturnPost.js`, line 283) is their answer and takes one of the last three classes by its error numbers. The classes come from one function with unit tests, built from `failureCause` in `dom-utils.js`, the CT600 error parsing in `web/public/lib/services/hmrc-ct-return-service.js` and `companiesHouseErrorText` (`fileCompanyTaxReturn.page.js`, line 3141). Opus writes the classes and the text; Sonnet builds the panel.
4. Welsh for the new strings. Gates: unit tests of the classes, one per kind, from fixture answers; browser cases that route each kind and find the panel with its next step; the panel survives a new information message and goes on a new failure or its close button. CTN2 follows CTF1, the last task before it that changes `fileCompanyTaxReturn.page.js` and its browser test, and CTN3, the last that changes the status widgets and `messages.css`. CTS1, which CTN2 reads, is before CTF1.

### CTN4. Narrate every long running submission

The VAT submission tells the person what it is doing at each stage: `submitVat.page.js` shows "Initiating HMRC authentication..." (line 396) and "Submitting VAT return to HMRC..." (line 505) as `info` status messages, and the async client shows `init.pollPendingMessage` on each poll (`web/public/lib/services/api-client.js`, line 104). The CT600 page shows only the `#loadingSpinner` beside the status area for its preview and its filings, which the operator found too weak (2026-11-25).

1. **Inventory.** Each page that sends to HMRC or Companies House and waits (the pages that call `showLoading()`: the CT600, the micro-entity, small company and dormant accounts, the confirmation statement, the Companies House forms in `web/public/companies-house/`, and the Income Tax pages in `web/public/hmrc/itsa/`), with the stages it passes through and whether it narrates them today. The inventory is a table in this section, written first.
2. **Narrate.** Each page in the inventory that lacks narration shows one `info` message per stage, in the VAT submission's words where the stage is the same ("Checking your answers...", "Sending the return to HMRC...", "Waiting for HMRC's answer...", "Sending the accounts to Companies House...", "Companies House has the accounts; sending the return to HMRC..."), and passes a `pollPendingMessage` that names the service it waits for. For the CT600 these are the preview, the HMRC submission and its Transaction Engine poll, and each part of the joint filing. CTN3 shows each message as the working bubble; the spinner stays.
3. Welsh for the new strings. Gates: for the CT600, a browser case with delayed routes that reads each stage's message in order before the answer; for each other page, the existing browser test asserts its first stage message; `npm test`, `npx eslint`, `npx prettier --check`. CTN4 follows CTN2, because both change the CT600 page's submit paths and the status messages they show.

### CTL8. The look pass

The definition of done for a major visual change, in this order: the Welsh proof (`scripts/welsh-proof.mjs`) on the page; `visual-review` on the passing run's screenshots; the `file-company-tax-return-*` videos recorded again on the simulator (`site-video-capture`) and published unlisted for the operator to watch (`video-publish`); then, with the new recordings in `publish.json`, `npm run video:walkthrough` for the CT600 guide, which also writes the CTV1 section times; `ui-ux-pro-max` on those frames.

### OCTL1. The roll-out decision

When CTL8 is on prod, the operator uses the CT600 page and says whether the pattern goes to the other journeys (VAT, the micro-entity and small company accounts pages, Income Tax). A yes becomes a plan for each journey; each uses the same table pattern and its own product's workbook cells.

## Proof

- The CT600 page on ci: every field shows its reference and a note with a working link; every field with a workbook place has a disclosure with the file, sheet, cells and screenshot; every difference note matches the appendix.
- The unit test of CTL2 passes with no field left out.
- The Welsh proof passes on the page.
- `visual-review` passes on the page with the disclosures open and closed.

## Appendix: the label register

Written by CTL1.
