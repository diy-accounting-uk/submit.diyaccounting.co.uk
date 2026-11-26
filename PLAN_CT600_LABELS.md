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

> Also the preview form should look like the "The return as filed These are the figures HMRC received: the return period, the tax computation that works out the profit, and the tax due. Check them against your records." after submission. - for the plan.

(operator, 2026-11-25)

> Also please check: /Users/antony/Desktop/Your\ filing\ -\ DIY\ Accounting\ Submit.pdf and these names need harmonizing too

(operator, 2026-11-25, the saved filed copy of DIY Accounting Limited's CT600: the CT600 boxes, the tax computation, the micro-entity accounts and HMRC's receipt)

> For the plan, the HMRC filings will need to be in it's own section

(operator, 2026-11-25, with a screenshot of the activities page listing "File Company Tax Return (HMRC, preview)" under "Companies House")

> Another plan bug, same browserm new tab, missing activities

(operator, 2026-11-25, with two screenshots of the activities page on prod in two tabs of one browser: one lists the Companies House forms marked "sandbox", the other does not)

> In the ch journey and the hmrc journey allow "fill from HMRC/Companies House submission receipt" to [the "Fill from your books" block] - same plan - we'll expand that for the live test of both.

(operator, 2026-11-25)

> Same as the CT600 the plan needs to be adding detail to all the form fields

(operator, 2026-11-25, with a screenshot of the balance sheet on the micro-entity accounts page)

> for the plan: slightly annoying that this wasn't zero defaulted and "Average number of employees during the period" similarly errored

(operator, 2026-11-25, with a screenshot of the micro-entity accounts page: "Fixed assets" blank this year, 0 last year, and the error "Enter fixed assets for this year")

> Include a plan item to include a default like that with a note when there has been an advance: "Interest free if repaid within 12 months of the year end; unsecured; repayable on demand."

(operator, 2026-11-25)

> another plan task, we should have a submission receipt in some sort of pending state linking to a page with a status check for the CH submission, otherwise it's unsettling for the user, add that to PLAN_CT600_LABELS and then board the whole of PLAN_CT600_LABELS.

(operator, 2026-11-25, with a screenshot of the receipts page: "Companies House filings not accepted yet" as a list above the receipts table, with no link)

## Status

Boarded on `NEXT.md` 2026-11-25 (operator); every task's row names its section here as its brief. The last hand edit adds CTP3, a pending receipt with a status check. v4.11 adds CTD2, a default for the terms of an advance to a director, the operator's request of 2026-11-25, by hand. v4.10 adds CTD1, zero by default on the accounts lines, the operator's request of 2026-11-25, by hand. v4.9 adds CTL10, the same field detail on the Companies House accounts pages, the operator's request of 2026-11-25, by hand; the scope is now the CT600 journey and the micro-entity and small company accounts journeys. v4.8 adds CTR2, fill a form from a filed receipt, the operator's request of 2026-11-25, by hand; the operator will widen it for the live test of both filings. v4.7 adds CTA2, the preview features that a new tab forgets, the operator's report of 2026-11-25, by hand. v4.6 adds CTA1, the CT600 in its own section of the activities page, the operator's request of 2026-11-25, by hand. v4.5 adds CTL9, one name per concept across the filed copy, the operator's request of 2026-11-25, by hand. v4.4 makes CTL7's review the filed-copy document, the operator's request of 2026-11-25, by hand. v4.3 changes CTF1's "Income and reliefs" by hand, the operator's request of 2026-11-25. v4.2 widens CTL7 to the review's layout, the operator's request of 2026-11-25, by hand. v4.1 adds CTN4, the operator's narration request of 2026-11-25, by hand after the review loop ended. v4 is review round 3 of v3.1. v3.1 adds CTN1 to CTN3, the operator's points 1 to 3 of 2026-11-25 about the status messages, and CTF1, the folded blocks. defined 2026-11-25; v2.1 adds CTL0, the operator's defect of 2026-11-25, v2.2 adds CTV1, the operator's video request, and v2.3 adds CTS1, the saved answers and the session, both of the same day, after review round 1 (plan-review-loop); not on `NEXT.md`.

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
| CTA1 | The activities page lists the Company Tax Return and the joint filing in their own section, "Corporation Tax", after "Income Tax" and before "Companies House" | nothing | machine-only | Sonnet | ~5 files |
| CTA2 | A new tab shows the same activities as the tab before it: the preview features choice is kept for the account, not for one tab | CTA1 | machine-only | Sonnet | ~5 files |
| CTD1 | Every required amount line and the average number of employees start at 0 on the micro-entity, small company and CT600 accounts forms, so a line the company does not have is not an error | nothing | machine-only | Sonnet | ~5 files |
| CTD2 | When an advance to a director is entered, the terms field starts with "Interest free if repaid within 12 months of the year end; unsecured; repayable on demand." and a note that it must match the actual arrangement | CTD1 | machine-only | Sonnet | ~5 files |
| CTP3 | A filing that waits for Companies House or HMRC shows in the receipts table as a pending receipt, linking to a status page that shows where the filing is and checks again on request | CH63 (`NEXT.md`) | machine-only | Sonnet | ~6 files |
| CTL1 | The label register: every field, its official term and source, its reference, the workbook's label and cells, and whether a difference note is needed | nothing | machine-only | Opus | 1 file (this plan's appendix) |
| CTR2 | "Fill from your books" also offers "Fill from a filing you made": the person's HMRC Company Tax Return and Companies House accounts receipts, each of which fills the CT600, micro-entity or small company accounts form with the figures it filed | CTS1 | machine-only | Sonnet | ~8 files |
| CTL2 | The table carries the register: official label, reference, note, source link and workbook cells on every entry of `ct600-fields.js`, with Welsh; the `[id, label]` arrays become objects | CTL1, CTS1, CTR2 | machine-only | Sonnet | ~6 files |
| CTL5 | `scripts/ct600-source-shots.mjs`: one WebP for each cell the table names, cut from the published package, with the cell marked | CTL2 | machine-only | Sonnet | ~3 files and the images |
| CTL4 | The page shows the reference in every label, the note with its link on every field, and the "In DIY Accounting's spreadsheets" disclosure with the file, sheet, cells, difference note and screenshot, with Welsh | CTL5 | machine-only | Sonnet | ~6 files |
| CTL10 | The micro-entity and small company accounts pages get what CTL2 to CTL5 give the CT600: the statutory term with its source, the format item, a note on every field, and the workbook place with its screenshot | CTL4 | machine-only | Sonnet | ~10 files |
| CTL7 | The review step is laid out like a form: the accounts as a table with this year and last year as columns and Change beside each figure, every row labelled with HMRC's term and a Box column, dates in words; the receipt shows the same labels | CTL4 | machine-only | Sonnet | ~4 files |
| CTV1 | Each section of the CT600 page that a CT600 video shows gets a click-to-load embed of that video, starting where the section first shows, and a link to that second | CTL7 | machine-only | Sonnet | ~7 files |
| CTF1 | The less used blocks of the form, and the intermediate boxes of "Tax worked out from your answers", fold into closed disclosures that open themselves when they hold an answer, a problem or a book's figure | CTV1 | machine-only | Sonnet | ~8 files |
| CTN1 | A status message the reader cannot see also shows as a closable bubble at the top right, with a link that jumps to the status area; every page with the status area | nothing | machine-only | Sonnet | ~5 files |
| CTN3 | The working signs (the `showLoading` spinner and "working" messages) show as a bubble on every page, so the reader sees that the button did something | CTN1 | machine-only | Sonnet | ~4 files |
| CTN2 | A failure at a step that writes to HMRC or Companies House leaves a detail panel under the status area, until it is closed or replaced: what was sent, what was not, where the answers are now, the kind of failure and the next step for that kind | CTN3, CTF1 | machine-only | Opus then Sonnet | ~8 files |
| CTN4 | Every long running submission narrates its stages as the VAT submission does, each stage a status message that CTN3 shows as a bubble | CTN2 | machine-only | Sonnet | ~12 files |
| CTL9 | The filed copy and its parts (the CT600 boxes, the tax computation, the accounts, HMRC's receipt) use one name per concept from the register, no "preview" on a live filing, dates in words, and print without a blank page | CTL7 | machine-only | Sonnet | ~8 files |
| CTL8 | The look pass: the Welsh proof, `visual-review` on the page, the guide screenshots again, `ui-ux-pro-max` on the CT600 guide frames, and the CT600 videos recorded again | CTL7, CTV1, CTN2, CTN3, CTF1, CTN4, CTL9, CTL10 | machine-only | Sonnet | screenshots and videos |
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

### CTA1. The Company Tax Return has its own section

The activities page groups activities by the directory of their page (`activityArea` in `web/public/lib/services/catalog-service.js`, line 206; the order `areaOrder` in `web/public/index.page.js`, line 415). The CT600 page is `companies-house/fileCompanyTaxReturn.html`, so the Company Tax Return and the joint filing sit under "Companies House", though they file with HMRC. `activityArea` returns a new area "Corporation Tax" for the activities `file-company-tax-return` and `file-company-tax-return-with-accounts` (by activity id, so the page keeps its path and its links); `areaOrder` puts it after "Income Tax"; `AREA_NAMES_CY` gives its Welsh name ("Treth Gorfforaeth"). The activity names drop "(HMRC, preview)" for "(HMRC)" only through UH7; until then the name stays. Gates: `web/unit-tests` for `activityArea`, the activities page browser test (`web/browser-tests/` for `index.html`), `npm test`. CTA1 changes no file another task owns, so it can land alone.

### CTA2. Preview features survive a new tab

Two settings carry the word "preview". The account setting `previewFeatures` (stored with the account, read by `operatorPreviewPasses` on the server and by the page's `fetchViewer`) opens the CT600 to an operator. The session choice (`isPreviewOn` in `web/public/lib/services/viewer-settings.js`, line 34, kept in `sessionStorage` under `previewFeatures`, sent as the `x-preview-features` header) lists the activities that the catalogue hides in this environment, such as the Companies House forms marked "sandbox". `sessionStorage` belongs to one tab, so a new tab starts with the session choice off and the activities page lists fewer activities than the tab before it (operator, 2026-11-25). The change: the session choice starts from the account's stored `previewFeatures` when the person has not chosen in this browser, and a choice made on the settings page (`web/public/settings.page.js`) is stored in `localStorage`, so every tab of the browser shows the same list; the settings page says in one line which of the two settings does what. `correlation-utils.js` sends the header from the same reader. Gates: unit tests of the reader (no choice: the account's setting; a choice: the choice), a browser case that turns preview features on, opens a second page and finds the same activities, `npm test`. CTA2 follows CTA1, because both change what the activities page lists.

### CTD1. Zero by default

On the micro-entity accounts page a required line left blank stops the preview ("Enter fixed assets for this year"), and so does "Average number of employees during the period", though the company had none and last year's column, filled from the register, already says 0 (the operator, 2026-11-25). The CT600's computation boxes already start at 0. The change: on the micro-entity, small company and dormant accounts pages and in the CT600's accounts section, each required amount line of this year starts at 0 (last year's column keeps the register's figures, or 0 when there are none), and the average number of employees starts at 0. A book, an iXBRL file, a receipt (CTR2) or a restored draft (CTS1) replaces the 0s as it does any value. The required-line check stays for a value that is not a number. Each line's note (CTL4, CTL10) says that 0 means the company has none. Gates: the accounts pages' browser tests (a blank form previews with 0s; a non-number is refused), `npm test`. CTD1 changes the accounts pages' defaults only, so it can land alone and before CTL10.

### CTD2. A default for the terms of an advance

Section 413 of the Companies Act 2006 asks the note on an advance to a director for its amount, an indication of the interest rate, its main conditions and any amounts repaid. The terms field ("Interest rate and main conditions of the advance" on the micro-entity and small company accounts pages, `directorsAdvanceTerms` in `ACCOUNTS_TEXT_FIELDS` on the CT600 page, `web/public/lib/ct600-fields.js`) starts empty, and an operator wrote a condition without the rate after it (2026-11-25). The change: when the advanced amount or the amount owed at the start or the end is above 0 and the terms field is empty, the field fills with "Interest free if repaid within 12 months of the year end; unsecured; repayable on demand." Its note says: "This is a common arrangement. Change it to the terms the company and the director agreed: the interest rate, any security, and when the advance is repaid. Section 413 needs all three." with a link to section 413 on legislation.gov.uk. The default follows the amounts until the person types in the field, as the CT600's other defaults do (`setDefaults`, `fileCompanyTaxReturn.page.js`), and clears again when every amount returns to 0. A book, iXBRL file, receipt or restored draft that carries terms keeps its own. Welsh for the new strings. Gates: browser cases on the micro-entity page and the CT600 page (an advance fills the default; a typed term stays; all amounts at 0 clears it); `npm test`. CTD2 follows CTD1 (both change the accounts pages' defaults) and CT47 on `NEXT.md`, which gives the CT600's micro-entity accounts the advance fields.

### CTP3. A pending receipt with a status check

The receipts page (`web/public/hmrc/receipt/receipts.page.js`, line 163) lists a Companies House filing that has no decision yet in a block above the receipts table ("Companies House filings not accepted yet": the form, the time sent, the submission number, "Waiting for Companies House"), with no link and no way to ask again. The filing page itself stops checking after an error (CH63), so the person is left with a sent filing and no place that says where it is (operator, 2026-11-25). The change:

1. **A pending row.** Each filing that waits for Companies House (or for HMRC's final answer) is a row in the receipts table, marked "Pending", with its date and its submission number or correlation ID as the link; the block above the table goes.
2. **A status page.** The link opens a status page for that filing (the filings page, `web/public/companies-house/filings.html`, with the filing's id): the form, the company, when it was sent, the submission number, the last time Submit asked Companies House and its answer in plain words ("Companies House has the filing and has not decided yet"), when Submit asks next (the presenter poll's next run in office hours), and that Companies House emails the company when it decides. A "Check now" button asks the gateway once, through the same status route the filing page uses, and reads 8023 inside the first hour as pending (CH63).
3. **When it is decided**, the row becomes the receipt (ACCEPT) or shows the rejection and its reasons (REJECT), and the status page links to it.
4. **Never a second filing by accident.** While a filing is pending, the filing page and the status page say so and do not offer "Start a new filing" for the same company and period without a warning that names the pending submission.
5. Welsh for the new strings. Gates: the receipts browser test (a pending row and its link), the status page browser test (Check now with a pending, an accepted and a rejected fixture answer), `npm test`. CTP3 follows CH63 on `NEXT.md` (the 8023 reading); it changes no file another task of this plan owns.

### CTL1. The label register

One table, written as the appendix of this plan, with one row for each field of the CT600 journey: the 64 box rows, the 40 form fields, `DONATIONS_PAID_FIELD`, the accounts lines of both regimes, the fixed asset note, the statements, the regime choice, the text fields of the accounts section, the loan and repayment row fields, and the five questions that `fileCompanyTaxReturn.page.js` defines itself: where the accounts go (`sendTo`), which copy goes to Companies House (`companiesHouseCopy`), `includeComparatives`, `includeFixedAssetNote` and `firstPeriodStart`. The sign-in, company lookup, agent and gateway controls are not CT600 fields and are left out. Columns:

- the field id and the current Submit label;
- the official term, its source and the URL with its anchor (the guide anchor already in `CT600_BOX_ROWS`; the legislation.gov.uk section for an accounts line);
- the reference: "Box <n>", or the format item and the boxes it feeds (turnover feeds box 145), or "none" for a question with neither;
- the workbook's label (the text in the same row as the cell, as `PubP&L` C44 is for F44) and its `sheetCell` for this year and last year, or "none" when the workbook has no such line (a value the person types, such as box 326); a figure that is the sum of several cells is written with `+` (a micro-entity line can be the sum of several workbook lines);
- "difference note: yes" when the workbook's label differs from the official term, with the note's text.

Start from what the spreadsheets repository already records: the `sheetCell` values of `app/data/filing/ct600-v3.toml` and `app/data/filing/frs105-formats.toml`, and `CELL_MAP`. Submit's `formEntriesFromBook` (`ct600-fields.js`, line 2068) maps a diya-gl book to the form, and `CELL_MAP` maps the workbook to the book. Where these disagree (for example, `frs105-formats.toml` gives "Other charges" as `PubP&L` F44, and Submit's `microProfitAndLossFromSmall` works it out from the small company lines), the row follows the figure Submit fills in and says so. Last-year cells and cells that none of these name are read from the workbook. CTL1 checks each row's cells against one workbook of the published package. A field whose term or cell the sources leave open is listed at the end of the appendix as a question for the operator.

### CTR2. Fill from a filing you made

The "Fill from your books" block (`web/public/widgets/books-import.js`) fills a form from a DIYA-GL book, a spreadsheets package or iXBRL accounts. A company that has filed one of its two returns has the other's figures already: the CT600's stored record keeps the filed accounts iXBRL (`filed.accountsIxbrl` in the async request, `app/functions/hmrc/hmrcCtReturnPost.js`, line 305), and a Companies House accounts filing keeps its own. The change:

1. The block gains a third choice, "Fill from a filing you made", on the CT600 page and on the micro-entity and small company accounts pages. It lists the person's receipts for the company on the page (HMRC Company Tax Return receipts and Companies House accounts receipts, newest first, each with its period and date), read through the receipts API the receipts page uses.
2. Choosing one reads that filing's accounts iXBRL from its stored record and fills the form through the iXBRL path the block already has (`formEntriesFromIxbrl` in `web/public/lib/ct600-fields.js`, line 2162, on the CT600 page; the accounts pages' own iXBRL fill). A CT600 receipt also fills the CT600's computation boxes from its stored boxes when the target is the CT600 page.
3. The figures are the filed ones; the page says which filing they came from and that each box can still be changed before preview. A receipt of another company, or of a period that the form's company cannot take, is not listed.
4. Welsh for the new strings. Gates: unit tests of the receipt-to-form mapping from a fixture record of each kind; browser cases on the CT600 and micro-entity pages that choose a fixture receipt and read the filled boxes; `npm test`, `npx eslint`, `npx prettier --check`. CTR2 follows CTS1, because both change how the CT600 page fills its form; the operator widens it for the live test of both filings.

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

### CTL10. The Companies House accounts pages

The micro-entity and small company accounts pages (`web/public/companies-house/fileMicroEntityAccounts.html` and `fileSmallCompanyAccounts.html`, with their `.page.js`) take the same accounts lines as the CT600's accounts section, under their own field lists, with no note on any line (the operator's screenshot of 2026-11-25: "Called up share capital not paid (optional)", "Prepayments and accrued income (optional)" and the rest, each a bare label). The register (CTL1) already holds the accounts lines' statutory terms, format items, sources and workbook places, because the CT600's accounts section uses the same lines. CTL10 applies it to these two pages:

1. Each line's label, format item ("Balance sheet item C"), note with its source link, and the "In DIY Accounting's spreadsheets" disclosure with the file, sheet, cells and screenshot (CTL5's images), rendered by the same code CTL4 writes for the CT600 page, moved to a shared module so the three pages use one renderer.
2. The prior-year column that the page fills from the company's last filed accounts at Companies House says so in its note ("From the accounts filed at Companies House for <period>").
3. A line the register marks as not in the DIY Accounting workbook says that in its disclosure.
4. Welsh for the new strings. Gates: the two pages' browser tests (a line with its format item and note, the disclosure with its cells), the micro-entity and small company behaviour suites on the simulator lane, `npm test`. CTL10 follows CTL4, because it reuses CTL4's renderer; CTL8's look pass covers both pages, and the videos of both accounts journeys are recorded again with the CT600's.

### CTL7. The review step and the receipt

The review step (`reviewAnswers` in `ct600-fields.js`) and the receipt (`filing-record.js`, `filing-result-record.js`) already read labels from the table. The operator found the review hard to read (2026-11-25): one row per figure ("Turnover, this year", then "Turnover, last year" much later), "Period of account" with ISO dates, and box numbers in some labels and not others. The change:

0. **The review is the filed copy's document.** The review before sending shows the same document the result page shows after HMRC accepts it, under "The return as filed" (the company and its UTR, the return period, the tax computation that works out the profit, the tax due, and the accounts), rendered by the same code in `web/public/lib/filing-record.js` with its heading changed to "The return you are about to file". Each figure in it carries a Change link to its box. Points 1 to 3 below apply inside that document.
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

### CTL9. One name per concept across the filed copy

The operator's saved filed copy of 2026-11-25 (six printed pages: the CT600 boxes, the Corporation Tax computation, the micro-entity accounts, HMRC's receipt) names one thing several ways:

| Concept | The names in the filed copy | Where each comes from |
|---|---|---|
| Company number | "Box 2: Company registration number", "Company number", "Registered number:" | `CT600_BOX_ROWS`; `filing-result-record.js` and `filing-record.js` (`ch.record.company-number-line`); `ctComputationsIxbrl.js` line 325 and `accountsIxbrlCommon.js` line 835 |
| Tax reference | "Box 3: Tax reference (Unique Taxpayer Reference)", "Unique Taxpayer Reference", "Unique Taxpayer Reference:" | the same three |
| The period | "Box 30: Start of the period covered by the return" with `2025-04-01`, "Return period", "Period of account", "for the year ended", "Period from" | `CT600_BOX_ROWS`; `ctComputationsIxbrl.js`; the accounts cover |
| Profit before the computation | "Profit before tax per accounts", "Profit or loss per the accounts" (the page's filed copy), "Profit or loss before tax" (the accounts) | `ctComputationsIxbrl.js` line 299; the filed copy's computation; the micro-entity format |
| Bank interest | "Box 170: Bank, building society or other interest, and profits from non-trading loan relationships", "Less: bank interest (non-trading loan relationship credits)", "Less: non-trading loan relationship credits", "Other income" | `CT600_BOX_ROWS`; `ctComputationsIxbrl.js` line 46; the filed copy; the accounts |
| Trading profit | "Box 155: Trading profits", "Adjusted trading profit", "Adjusted profit" | `CT600_BOX_ROWS`; `ctComputationsIxbrl.js` line 140; the page |
| Retained profit | "Profit and loss account" (the accounts), "Profit and loss account reserve" (the form) | the micro-entity format; `MICRO_BALANCE_SHEET_FIELDS` |

1. **One name.** Each concept takes the register's term (CTL1): HMRC's box name where the concept is a CT600 box, the statutory format's name for an accounts line, and the same words in the CT600 boxes, the computation, the receipt and the review (CTL7). The computation names the box a line feeds ("Adjusted trading profit (box 155)"). The computation and the accounts are filed documents, so a label change in `ctComputationsIxbrl.js` or the accounts builders applies to the next filing; the filed copy of an earlier filing stays as it was filed.
2. **No "preview" on a live filing.** The filed copy's heading ("Your copy of the Company Tax Return (preview)") and its title ("Company Tax Return (CT600, preview)") drop "preview" when the filing went to HMRC's live service; UH7 removes it from the activity's name for everyone.
3. **Values a person reads.** Box 4 shows its meaning ("Not one of the listed types") in place of `0`; boxes 30 and 35 show dates in words; the receipt shows "Filed 25 November 2026" once.
4. **Print.** The filed copy prints without an empty page (page 3 of the operator's PDF held one line), keeps each download link and its sentence together, and gives the receipt's label column room for "Unique Taxpayer Reference" on one line. The CT600 boxes and the receipt use the accounts' type, so the copy reads as one document.
5. Welsh for the new strings. Gates: the filed-copy unit tests, `web/browser-tests` for the result page and its print media, the computation and accounts iXBRL tests (`npm run fixtures:ixds` when a fixture changes), `npm test`; `visual-review` on the printed copy. CTL9 follows CTL7, because both change `filing-record.js` and `filing-result-record.js`.

### CTL8. The look pass

The definition of done for a major visual change, in this order: the Welsh proof (`scripts/welsh-proof.mjs`) on the page; `visual-review` on the passing run's screenshots; the `file-company-tax-return-*` videos recorded again on the simulator (`site-video-capture`) and published unlisted for the operator to watch (`video-publish`); then, with the new recordings in `publish.json`, `npm run video:walkthrough` for the CT600 guide, which also writes the CTV1 section times; `ui-ux-pro-max` on those frames.

### OCTL1. The roll-out decision

When CTL8 is on prod, the operator uses the CT600 page and decides the roll-out. The roll-out covers at least every place where Submit writes data to HMRC, Companies House or Stripe, so that every write journey behaves the same way (operator, 2026-11-26). Each journey gets:

1. the field pattern where the journey has a form: the reference and note on each field, the workbook place, and the worked panels, from its own product's workbook cells;
2. the failure detail panel of CTN2: what was sent and what was not, where the answers are, the kind of failure and its next step;
3. the staged narration of CTN4: one `info` status message per stage, which CTN3 shows as the working bubble, and a `pollPendingMessage` that names the service it waits for.

The write journeys, by service:

| Service | Journeys (page, then the route it calls) |
|---|---|
| HMRC | the VAT return (`submitVat.page.js`, `hmrcVatReturnPost.js`); the Income Tax pages in `web/public/hmrc/itsa/`; the CT600 and the joint filing (CT600 page, `hmrcCtReturnPost.js`) |
| Companies House | the micro-entity, small company, dormant and revised accounts; the confirmation statement; the forms in `web/public/companies-house/` (registered office, registered email and the rest) |
| Stripe | the bundle checkout (`billingCheckoutPost.js`), the activity checkout (`billingActivityCheckoutPost.js`), the recovery of a paid checkout (`billingRecoverPost.js`), the billing portal (`billingPortalGet.js`) |

The first step of the roll-out is an inventory of every route in `app/functions/hmrc/`, `app/functions/companies-house/` and `app/functions/billing/` that writes to the service, against the page that calls it and which of the three parts it has today; a write the table above misses joins it. Each journey then becomes a plan row; journeys of one service that share a page script run in one batch.

## Proof

- The CT600 page on ci: every field shows its reference and a note with a working link; every field with a workbook place has a disclosure with the file, sheet, cells and screenshot; every difference note matches the appendix.
- The unit test of CTL2 passes with no field left out.
- The Welsh proof passes on the page.
- `visual-review` passes on the page with the disclosures open and closed.

## Appendix: the label register

One row for each field of the CT600 journey: 198 fields in 8 groups. CTL2 copies each row into the field's entry in `web/public/lib/ct600-fields.js`.

### How to read the tables

- **Cells.** Every cell is in `Financialaccounts.xlsx` of the published package `GB Accounts Company 2026-03-31 (Mar26) Excel 2007`. A cell written `PubP&L!F9` has the `sheetCell` `Financialaccounts.xlsx!PubP&L!F9`. A `+` joins the cells of a sum. Each cell and its label were read in that workbook with the diya-gl reader.
- **Labels.** The workbook label is the text in the same row as the cell. A † marks a cell whose label is in another row; the label cell follows in brackets. CTL5 checks the cell's row for the label, so it needs the bracketed cell for these.
- **Last year.** A CT600 box has no last-year cell: the workbook holds one year's return. The accounts tables give both years.
- **Official terms.** A box term is the CT600 form's wording without its sum ("– box 155 minus box 160"). Where the form and the guide's heading differ, the table gives the form's.
- **Submit's figure.** When a book fills a field from another cell than the spreadsheets repository's files name, the row gives the cell Submit reads and says so.
- **Difference notes.** "yes" points to a note below the table, under the row's key.

### Sources

| Key | Source | URL |
|---|---|---|
| F | CT600 (2026) Version 3, HMRC 04/26 | https://assets.publishing.service.gov.uk/media/69c543424a06660f085442bd/ct600.pdf |
| G | The Company Tax Return guide | https://www.gov.uk/guidance/the-company-tax-return-guide (`#<anchor>`) |
| FA | CT600A (2026) Version 3, HMRC 04/26 | https://assets.publishing.service.gov.uk/media/69cbe2a9a60a12ca3913c668/CT600A.pdf |
| GA | Completing the CT600A page | https://www.gov.uk/guidance/supplementary-pages-ct600a-2015-version-3-close-company-loans-and-arrangements-to-confer-benefits-on-participators (`#<anchor>`) |
| R | SI 2008/409, Schedule 1, Part 1 | https://www.legislation.gov.uk/uksi/2008/409/schedule/1/part/1 |
| R7, R44, R48 | SI 2008/409, Schedule 1, paragraphs 7, 44, 48 | https://www.legislation.gov.uk/uksi/2008/409/schedule/1/paragraph/48 (7 and 44 the same way) |
| CA | Companies Act 2006, section `<n>` | https://www.legislation.gov.uk/ukpga/2006/46/section/475 (other sections the same way) |
| LoC | Life of a company: Part 1 accounts | https://www.gov.uk/government/publications/life-of-a-company-annual-requirements/life-of-a-company-part-1-accounts (`#small-company`, `#micro-entity`) |

Item codes of R: "BS1 C.II" is Section B, balance sheet Format 1, item C.II. "PL1 10" is Section B, profit and loss account Format 1, item 10. "μBS1 E" and "μPL F" are Section C, the micro-entity balance sheet Format 1 and profit and loss account format.

### 1. CT600 boxes (`CT600_BOX_ROWS`, 64 rows)

The term and the guide anchor. "ok" means that the anchor in `CT600_BOX_ROWS` is the box's heading in G. A named anchor replaces one that G does not have, or is more exact.

| Box | Submit label | Official term (F) | G anchor |
|---|---|---|---|
| 1 | Company name | Company name | ok |
| 2 | Company registration number | Company registration number | ok |
| 3 | Tax reference (Unique Taxpayer Reference) | Tax reference | ok |
| 4 | Type of company | Type of company | ok |
| 30 | Start of the period covered by the return | Period of the return: from | ok |
| 35 | End of the period covered by the return | Period of the return: to | ok |
| 50 | Making more than one return for this company now | same | ok |
| 85A | Accounts attached are for a different period | I attach accounts and computations for a different period (box 85) | ok |
| 95 | Supplementary page CT600A, loans to participators | Loans and arrangements to participators by close companies – form CT600A | ok |
| 145 | Total turnover from trade | same | ok |
| 155 | Trading profits | same | ok |
| 160 | Trading losses brought forward set against trading profits | same | ok |
| 275 | Trading losses of this or a later accounting period | Total trading losses of this or a later accounting period | ok |
| 280 | Amounts carried back from later accounting periods are included in box 275 | Put an 'X' in box 280 if amounts carried back from later accounting periods are included in box 275 | ok |
| 285 | Trading losses carried forward and claimed against total profits | same | ok |
| 295 | Total of deductions and reliefs | same | ok |
| 305 | Qualifying donations | same | ok |
| 780 | Losses of trades carried on wholly or partly in the UK: amount arising | same | `losses-of-trades-carried-on-wholly-or-partly-in-the-uk-amount` |
| 790 | Losses of trades carried on wholly outside the UK: amount arising | same | `losses-of-trades-carried-on-wholly-outside-the-uk-amount` |
| 165 | Net trading profits | same | ok |
| 170 | Bank, building society or other interest, and profits from non-trading loan relationships | same | ok |
| 235 | Profits before other deductions and reliefs | same | ok |
| 300 | Profits before qualifying donations and group relief | same | ok |
| 315 | Profits chargeable to Corporation Tax | same | ok |
| 326 | Number of associated companies in this period | same | ok |
| 327 | Number of associated companies in the first financial year | same | ok |
| 328 | Number of associated companies in the second financial year | same | ok |
| 329 | Small profit rate or marginal relief entitlement | Put an 'X' in box 329 if the company is chargeable at the small profit rate or is entitled to marginal relief | ok |
| 330 | Financial year of the first tax rate | Financial year (yyyy), first row | ok |
| 335 | Amount of profit chargeable at the first rate | Amount of profit, first row | ok |
| 340 | First rate of tax | Rate of tax %, first row | ok |
| 345 | Tax at the first rate | Tax, first row | ok |
| 380 | Financial year of the second tax rate | Financial year (yyyy), fourth row | ok |
| 385 | Amount of profit chargeable at the second rate | Amount of profit, fourth row | ok |
| 390 | Second rate of tax | Rate of tax %, fourth row | ok |
| 395 | Tax at the second rate | Tax, fourth row | ok |
| 430 | Corporation Tax | same | ok |
| 435 | Marginal relief | same | ok |
| 440 | Corporation Tax chargeable | same | ok |
| 475 | Net Corporation Tax liability | same | ok |
| 480 | Tax payable on loans to participators | Tax payable on loans and arrangements to participators | `tax-payable-on-loans-and-arrangements-to-participators` |
| 485 | Relief due on loans repaid after the CT600A period | Put an 'X' in box 485 if you completed box A70 in the supplementary pages CT600A | `box-a70-in-ct600a` |
| 510 | Tax chargeable | same | ok |
| 515 | Income Tax deducted from gross income included in profits | same | ok |
| 525 | Self-assessment of tax payable before restitution tax and coronavirus support scheme overpayments | same | ok |
| 528 | Self-assessment of tax payable | same | ok |
| 595 | Tax already paid (and not already repaid) | same | ok |
| 600 | Tax outstanding | same | ok |
| 620 | Franked investment income or exempt ABGH distributions | Franked investment income/Exempt ABGH distributions | ok |
| 690 | Annual investment allowance | Annual investment allowance: capital allowances | ok |
| 705 | Machinery and plant, main pool: allowances | Machinery and plant – main pool: capital allowances | ok |
| 710 | Machinery and plant, main pool: balancing charges | Machinery and plant – main pool: balancing charges | ok |
| 688 | Full expensing: allowances | Full expensing: capital allowances | ok |
| 689 | Full expensing: balancing charges | same | ok |
| 693 | Machinery and plant, special rate allowance: allowances | Machinery and plant – special rate allowance: capital allowances | ok |
| 694 | Machinery and plant, special rate allowance: balancing charges | Machinery and plant – special rate allowance: balancing charges | ok |
| 695 | Machinery and plant, special rate pool: allowances | Machinery and plant – special rate pool: capital allowances | ok |
| 700 | Machinery and plant, special rate pool: balancing charges | Machinery and plant – special rate pool: balancing charges | ok |
| 735 | Annual investment allowance outside the calculation of trading profits | Annual investment allowance (allowances not included in the calculation of trading profits and losses) | `annual-investment-allowance-1` |
| 760 | Machinery and plant on which first year allowance is claimed | same | ok |
| 773 | Machinery and plant, special rate allowance: qualifying expenditure | Machinery and plant – special rate allowance (qualifying expenditure) | `machinery-and-plant--special-rate-allowance` |
| 775 | Other machinery and plant: qualifying expenditure | Other machinery and plant (qualifying expenditure) | ok |
| 975 | Name of the person signing the declaration | Name (declaration) | `name` |
| 985 | Status of the person signing the declaration | Status (declaration) | `status` |

The workbook place. "Submit: …" says where a book's figure for the box comes from, when the cell is not Submit's.

| Box | This year | Workbook label | Diff |
|---|---|---|---|
| 1 | `OpenAccounts!E2` | Company Name (including Limited) | yes |
| 2 | `OpenAccounts!E3` | Company registration number | no |
| 3 | `OpenAccounts!O3` † (O2) | Tax Reference per CT603 Notice | yes |
| 4 | none | — | — |
| 30 | `CT600!B33` † (B32) | from (dd / mm / yyyy) | no |
| 35 | `CT600!M33` † (M32) | to (dd / mm / yyyy) | no |
| 50, 85A, 95 | none | — | — |
| 145 | `CT600!AK66` | Total turnover from trade or profession | yes |
| 155 | `CT600!Z70` | Trading and professional profits | yes |
| 160 | `CT600!Z72` | Trading losses brought forward claimed against profits | yes |
| 275 | `CT600!Z98` | Trading losses of this or a later accounting period | yes |
| 280, 285, 295, 300 | none | — | — |
| 305 | `MnthP&L!B37` | Charitable Donations | yes |
| 780 | `CT600!Q206` † (D205) | Trading losses Case 1 | yes |
| 790 | none | — | — |
| 165 | `CT600!AJ74` | Net trading and professional profits | yes |
| 170 | `CorporationTax!K24` | Add gross bank interest received | yes |
| 235 | `CT600!AJ92` | Profits before other deductions and reliefs | no |
| 315 | `CT600!AJ110` | Profits chargeable to corporation tax | no |
| 326 | `Admin!P14` | none in the row | open (Q2) |
| 327 | `CT600!Y118` | Associated companies in the first financial year | yes |
| 328 | `CT600!Y120` | Associated companies in the second financial year | yes |
| 329 | `CT600!AI122` | Put an 'X' in box 22 if the company claims to be charged at the starting rate… | yes |
| 330 | `CT600!C126` † (B125) | Financial year (yyyy) | no |
| 335 | `CT600!N126` † (L125) | Amount of profit | no |
| 340 | `CT600!AA126` † (Y125) | Rate of tax | no |
| 345 | `CT600!AJ126` † (AH125) | Tax | no |
| 380 | `CT600!C128` † (B125) | Financial year (yyyy) | no |
| 385 | `CT600!N128` † (L125) | Amount of profit | no |
| 390 | `CT600!AA128` † (Y125) | Rate of tax | no |
| 395 | `CT600!AJ128` † (AH125) | Tax | no |
| 430 | `CT600!AJ131` | Corporation tax | no |
| 435 | `CT600!Y133` | Marginal rate relief | yes |
| 440 | `CT600!Y135` | Corporation tax net of marginal rate relief | yes |
| 475 | `CT600!AJ145` | Corporation tax chargeable | yes |
| 480, 485 | none | — | — |
| 510 | `CT600!AJ145` | Corporation tax chargeable | yes |
| 515 | `CorporationTax!K37` | Deduct Income tax deducted from gross bank interest | yes |
| 525 | `CT600!AJ159` | Tax payable - this is your self-assessment of tax payable | yes |
| 528 | `CT600!AJ159` | Tax payable - this is your self-assessment of tax payable | yes |
| 595 | `CT600!AJ163` | Tax already paid (and not already repaid) | no |
| 600 | `CT600!AJ166` † (C165) | Tax outstanding | no |
| 620 | `CorporationTax!K29` | Add franked investment income (exempt distributions received) | yes |
| 690 | `CorporationTax!I15` | Annual Investment Allowances plant & equipment bought | yes |
| 705 | `CorporationTax!I16+I17` | Writing Down Allowance cars bought between; … assets purchased prior to | yes |
| 710 | `CorporationTax!I18` | Balancing charges on assets disposed of between | yes |
| 688, 689, 693, 694, 695, 700, 735 | none | — | — |
| 760 | `CT600!AL194` | Expenditure on machinery and plant on which first year allowance is claimed | yes |
| 773, 775 | none | — | — |
| 975 | `OpenAccounts!E5` | First Director's Name | yes |
| 985 | none | — | — |

Notes, by box:

- **Every `CT600!` cell.** The spreadsheet's CT600 sheet copies the old CT600 (Short) (2008) Version 2 form (cell X6), so its box numbers are not HMRC's: its box 3 is HMRC's box 155. Use the box number on this page.
- **1.** The spreadsheet asks for the company name including "Limited". It is the same name. Submit takes it from the company lookup.
- **3.** The spreadsheet calls this the "Tax Reference per CT603 Notice". It is the company's 10-digit Unique Taxpayer Reference. A book does not fill it; type it.
- **145.** The spreadsheet's box 1 says "trade or profession". HMRC's box 145 is "Total turnover from trade". Enter the same figure.
- **155.** The spreadsheet's box 3, "Trading and professional profits", is HMRC's box 155, "Trading profits". Submit works box 155 out from the computation.
- **160.** The spreadsheet's box 4, "Trading losses brought forward claimed against profits", is HMRC's box 160. Its figure is `OpenAccounts!Q5`, "Loss brought forward".
- **165.** The spreadsheet's box 5, "Net trading and professional profits", is HMRC's box 165.
- **170.** The spreadsheet calls this "Add gross bank interest received"; its CT600 sheet repeats it in `CT600!AJ76`. HMRC's box 170 also takes other interest and profits from non-trading loan relationships. Submit reads `CorporationTax!K24`, where `ct600-v3.toml` names `CT600!AJ76`; both show the same figure.
- **275.** The spreadsheet's box 30 sets a trading loss against bank interest by itself. A book fills Submit's box 275 with 0. Enter the spreadsheet's figure when the company makes this claim.
- **305.** The spreadsheet calls this "Charitable Donations". HMRC's box 305 is "Qualifying donations"; only donations that qualify go here.
- **780.** The spreadsheet's box 122, "Trading losses Case 1", is HMRC's box 780. Submit works box 780 out from the computation.
- **327, 328.** The spreadsheet's boxes 40 and 41 leave out "Number of". Both show `Admin!P14`, the number of associated companies, which Submit reads for box 326.
- **329.** The spreadsheet's box 42 asks about the starting rate and the small companies' rate. HMRC's box 329 asks about the small profit rate or marginal relief. Submit ticks box 329 by itself.
- **435.** The spreadsheet calls this "Marginal rate relief". HMRC calls it "Marginal relief".
- **440.** The spreadsheet's box 65, "Corporation tax net of marginal rate relief", is HMRC's box 440, "Corporation Tax chargeable".
- **475.** The spreadsheet's box 70 is called "Corporation tax chargeable", but it is HMRC's box 475, "Net Corporation Tax liability". HMRC's "Corporation Tax chargeable" is box 440.
- **510.** The spreadsheet's box 70 also gives HMRC's box 510, "Tax chargeable", when there is no tax on loans to participators.
- **515.** The spreadsheet calls this "Deduct Income tax deducted from gross bank interest". HMRC's box 515 takes Income Tax deducted from any gross income in the profits. Submit reads `CorporationTax!K37`, where `ct600-v3.toml` names `CT600!AJ154`; both show the same figure.
- **525, 528.** The spreadsheet's box 86, "Tax payable - this is your self-assessment of tax payable", gives HMRC's boxes 525 and 528.
- **595.** A book fills Submit's box 595 with 0. Enter the spreadsheet's figure.
- **620.** The spreadsheet calls this "Add franked investment income (exempt distributions received)". It is HMRC's box 620. Submit reads `CorporationTax!K29`, where `ct600-v3.toml` names `CT600!Z114`; both show the same figure.
- **690.** The spreadsheet calls this "Annual Investment Allowances plant & equipment bought". It is HMRC's box 690.
- **705.** The spreadsheet splits the writing down allowance into cars (I16) and assets bought before the period (I17). HMRC's box 705 takes both, and a balancing allowance in I18 when I18 is above 0.
- **710.** The spreadsheet's I18 is a balancing charge when it is below 0. HMRC's box 710 takes that charge as a positive figure.
- **760.** The spreadsheet's box 118 adds "Expenditure on". A book fills Submit's box 760 with 0. Enter the spreadsheet's figure.
- **975.** The spreadsheet calls this "First Director's Name". HMRC's box 975 is the name of the person who makes the declaration.

### 2. Form fields (`CT600_FORM_FIELDS`, 40 rows)

A field with a box takes its box row's term, anchor and workbook place from group 1. "Box term" in the Note column means the field's label should be the box row's term.

| Field | Box | Submit label | Note |
|---|---|---|---|
| `utr` | 3 | Box 3: Tax reference (Unique Taxpayer Reference) | Box term |
| `companyType` | 4 | Is the company one of the types listed for box 4? | Box term; G asks for a number (Q11) |
| `associatedCompanies` | 326 | Box 326: Number of associated companies in this period | Box term; also boxes 327 and 328 |
| `period` | 30, 35 | Period of account | G names boxes 30 and 35 "Period of the return"; G does not use "period of account" |
| `tradeName` | none | Trade name | Table 2a |
| `nonTradingLoanRelationshipCredits` | 170 | Box 170: Bank, building society … | Box term |
| `depreciation` | none | Depreciation added back | Table 2a |
| `amortisation` | none | Amortisation added back | Table 2a |
| `entertaining` | none | Entertaining added back | Table 2a |
| `donations` | 305 | Box 305: Donations added back and claimed | Computation add-back that also gives box 305; workbook `MnthP&L!B37` |
| `annualInvestmentAllowance` | 690 | Box 690: Annual investment allowance | Box term |
| `mainPoolAllowances` | 705 | Box 705: Main pool writing down and balancing allowances | Box term |
| `mainPoolBalancingCharges` | 710 | Box 710: Machinery and plant, main pool: balancing charges | Box term |
| `fullExpensingAllowances` | 688 | Box 688: Full expensing allowances | Box term |
| `fullExpensingBalancingCharges` | 689 | Box 689: Full expensing: balancing charges | Box term |
| `specialRateAllowances` | 693 | Box 693: … special rate allowance: allowances | Box term |
| `specialRateBalancingCharges` | 694 | Box 694: … special rate allowance: balancing charges | Box term |
| `specialRateAllowanceExpenditure` | 773 | Box 773: … special rate allowance: qualifying expenditure | Box term |
| `specialRatePoolAllowances` | 695 | Box 695: Special rate pool writing down allowances | Box term |
| `specialRatePoolAnnualInvestmentAllowance` | none | Annual investment allowance claimed on the special rate pool | Table 2a |
| `specialRatePoolBalancingCharges` | 700 | Box 700: … special rate pool: balancing charges | Box term |
| `annualInvestmentAllowanceOutsideTrade` | 735 | Box 735: Annual investment allowance outside … | Box term |
| `firstYearAllowanceExpenditure` | 760 | Box 760: Machinery and plant on which first year allowance is claimed | Box term |
| `otherMachineryAndPlantExpenditure` | 775 | Box 775: Other machinery and plant: qualifying expenditure | Box term |
| `lossesBroughtForward` | 160 | Box 160: Trading losses brought forward | The field holds the losses available; box 160 is the part set against trading profits (Q14) |
| `lossAgainstTotalProfits` | 275 | Box 275: Trading losses of this or a later accounting period | Box term |
| `lossesBroughtForwardAgainstTotalProfits` | 285 | Box 285: Trading losses carried forward … | Box term |
| `lossCarriedBack` | none | Trading loss carried back to the previous period | Table 2a |
| `priorPeriodChargeableProfits` | none | Previous period's chargeable profits (box 315 of its return) | Table 2a |
| `lossOutsideUk` | none | The trade is carried on wholly outside the UK … | Table 2a |
| `frankedInvestmentIncome` | 620 | Box 620: Franked investment income or exempt ABGH distributions | Box term |
| `incomeTaxDeducted` | 515 | Box 515: Income Tax deducted from gross income included in profits | Box term |
| `taxAlreadyPaid` | 595 | Box 595: Tax already paid (and not already repaid) | Box term |
| `ownCorporationTax` | none | Corporation Tax per your own working (optional) | Table 2a |
| `loansMade` | none | Did the company lend money to a director, shareholder or their associate …? | Table 2a |
| `releasedBeforeEnd` | none | Were any loans made in the period repaid, released or written off …? | Table 2a |
| `repaidSince` | none | Has any of it been repaid, released or written off since …? | Table 2a |
| `declarantName` | 975 | Box 975: Name of the person signing the declaration | Box term |
| `declarantStatus` | 985 | Box 985: Status of the person signing the declaration | Box term |
| `declarationAccepted` | none | I declare that the information in this return and the attached accounts and computations is correct … | Table 2a |

A field of `PER_PERIOD_FIELD_IDS` and its `Ap2` copy for the second return take the same row.

#### 2a. Form fields with no box (13 rows)

| Field | Official term (source) | Reference | This year | Diff |
|---|---|---|---|---|
| `tradeName` | none on F or in G (Q3) | Computations | `OpenAccounts!E8`: The principal activity of the company is | yes |
| `depreciation` | none on F or in G (Q3) | Computation; feeds box 155 | `CorporationTax!I8`: Add back depreciation charged during the year | no |
| `amortisation` | none on F or in G (Q3) | Computation; feeds box 155 | `CorporationTax!I7`: Add back goodwill written off | yes |
| `entertaining` | none on F or in G (Q3) | Computation; feeds box 155 | `CorporationTax!I9`: Add back business entertainment | no |
| `specialRatePoolAnnualInvestmentAllowance` | none on F (Q3) | Part of boxes 690 and 695 | none | — |
| `lossCarriedBack` | carry back claim (G `#amounts-carried-back-from-later-accounting-periods`) | Box 275 and 280 of the previous period's return | none | — |
| `priorPeriodChargeableProfits` | Profits chargeable to Corporation Tax (F box 315) | Box 315 of the previous return | none | — |
| `lossOutsideUk` | Losses of trades carried on wholly outside the UK (F box 790) | Box 780 or 790 | none | — |
| `ownCorporationTax` | none on F (Q3) | Checks box 440 | `CorporationTax!K35`: Corporation Tax chargeable | yes |
| `loansMade` | Outstanding loans and arrangements made (FA A10; GA `#a10-outstanding-loans-and-arrangements-made`) | CT600A A10; box 95 | `PubBalSht!E29`: Directors Loan Account | yes |
| `releasedBeforeEnd` | loans made during the period repaid, released, or written off, before the end of the period (FA A5; GA `#a5-loans-repaid-released-or-written-off-or-return-payments`) | CT600A A5 | none | — |
| `repaidSince` | Relief for amounts repaid, released or written off (FA Parts 2 and 3) | CT600A A25 or A50; box 485 | none | — |
| `declarationAccepted` | I declare that the information I have given on this Company Tax Return and any supplementary pages is correct and complete to the best of my knowledge and belief. (F, Declaration; G `#declaration`) | Declaration | none | — |

Notes, by field:

- **`tradeName`.** The spreadsheet holds the principal activity, and Submit starts the trade name from it. Change it when the trade has another name.
- **`amortisation`.** The spreadsheet adds back only goodwill written off. Add any other amortisation to the spreadsheet's figure.
- **`ownCorporationTax`.** The spreadsheet's own working of the tax is "Corporation Tax chargeable" in `CorporationTax!K35`. A book does not fill this field; type K35 here to check Submit's box 440.
- **`loansMade`.** The spreadsheet shows the director's loan account; a figure below 0 means the director owes the company. When the director owes more at the end than at the start (`OpenAccounts!E30`), a book answers Yes and fills one loan row.

### 3. Donations paid (`DONATIONS_PAID_FIELD`, 1 row)

| Field | Official term (source) | Reference | This year | Diff |
|---|---|---|---|---|
| `donationsPaid` | Qualifying donations (F box 305; G `#qualifying-donations`) | Box 305 of each return of a long period | `MnthP&L!B37`: Charitable Donations (the whole period: the label in row 37 reads "Charitable Donations") | yes |

- **`donationsPaid`.** The spreadsheet shows "Charitable Donations" for the whole period of account. Enter the qualifying donations paid in each accounting period.

### 4. Accounts lines (32 rows)

The format's term and item, the cell for this year and last year, and the workbook label. Last year's balance sheet: Submit reads the book's opening balance, the figures `OpenAccounts!E13` to `E35` hold; `PubBalSht` columns A and B show the same figures. Last year's profit and loss account: a book holds none, so Submit leaves it for the person to type; the workbook shows it in `PubP&L` column B.

#### 4a. Small company profit and loss account (`PROFIT_AND_LOSS_FIELDS`, 5 rows)

| Field | Submit label | Official term (R) | This year: cell, label | Last year | Diff |
|---|---|---|---|---|---|
| `turnover` | Turnover | Turnover (PL1 1; feeds box 145) | `PubP&L!F9`: Sales Turnover | `PubP&L!B9` | yes |
| `costOfSales` | Cost of sales | Cost of sales (PL1 2) | `PubP&L!F16`: Cost of Sales | `PubP&L!B16` | no |
| `administrativeExpenses` | Administrative expenses | Administrative expenses (PL1 5) | `PubP&L!F44`: Administrative Expenses | `PubP&L!B44` | no |
| `interestReceivable` | Interest receivable and similar income | Other interest receivable and similar income (PL1 10; feeds box 170) | `PubP&L!F48`: Other Income | `PubP&L!B48` | yes |
| `tax` | Tax on profit on ordinary activities | Tax on profit or loss (PL1 13) | `PubP&L!F50`: Corporation tax | `PubP&L!B50` | yes |

- **`turnover`.** The spreadsheet calls this "Sales Turnover", and it includes investment grants received (F8). The format calls it "Turnover".
- **`interestReceivable`.** The spreadsheet calls this "Other Income"; it is the interest received. The format calls it "Other interest receivable and similar income". Submit works it out as profit before tax (F49) less the operating profit, which gives F48.
- **`tax`.** The spreadsheet calls this "Corporation tax". The format calls it "Tax on profit or loss". Submit's label uses the old term "on ordinary activities".

#### 4b. Small company balance sheet (`BALANCE_SHEET_FIELDS`, 14 rows)

| Field | Submit label | Official term (R) | This year: cell, label | Last year | Diff |
|---|---|---|---|---|---|
| `fixedAssets` | Fixed assets | Fixed assets (BS1 B) | `PubBalSht!F6`: Fixed Assets | `PubBalSht!B6` | no |
| `stocks` | Stocks | Stocks (BS1 C.I) | `PubBalSht!E10`: Stock at cost | `PubBalSht!A10` | yes |
| `debtors` | Debtors | Debtors (BS1 C.II) | `PubBalSht!E11`: Trade Debtors | `PubBalSht!A11` | yes |
| `amountsOwedByDirectors` | Of which, amounts owed by directors | advances and credits granted by the company to its directors (CA 413(1)) | `PubBalSht!E29`: Directors Loan Account | `PubBalSht!A29` | yes |
| `cashAtBank` | Cash at bank and in hand | Cash at bank and in hand (BS1 C.IV) | `PubBalSht!E12`: Cash at bank and in hand | `PubBalSht!A12` | no |
| `bankLoansOverdrafts` | Bank loans and overdrafts (due within one year) | Bank loans and overdrafts (BS1 E.1) | `PubBalSht!E19`: Bank Overdraft | `PubBalSht!A19` | yes |
| `tradeCreditors` | Trade creditors (due within one year) | Trade creditors (BS1 E.2) | `PubBalSht!E16`: Trade Creditors | `PubBalSht!A16` | yes |
| `corporationTax` | Corporation tax (due within one year) | no item; part of taxation and social security (R, note 7) | `PubBalSht!E17`: Corporation Tax | `PubBalSht!A17` | no |
| `taxationSocialSecurity` | Taxation and social security (due within one year) | taxation and social security (R, note 7) | `PubBalSht!E18`: Taxation and Social Security | `PubBalSht!A18` | no |
| `otherCreditors` | Other creditors (due within one year) | Other creditors (BS1 E.4) | none | none | — |
| `creditorsAfterOneYear` | Creditors: amounts falling due after more than one year | same (BS1 H) | `PubBalSht!F31` † (C30): Creditors (falling due after more than one year) | `PubBalSht!B31` | yes |
| `bankLoansAfterOneYear` | Of which, bank loans | Bank loans and overdrafts (BS1 H.1) | none | none | — |
| `calledUpShareCapital` | Called up share capital | Called up share capital (BS1 K.I) | `PubBalSht!F36`: Called up share capital 2 ordinary shares of £1.00 each | `PubBalSht!B36` | no |
| `profitAndLossAccount` | Profit and loss account reserve | Profit and loss account (BS1 K.V) | `PubBalSht!F37+F38`: Retained Profit and Loss account; Capital Reserves | `PubBalSht!B37+B38` | yes |

- **`stocks`.** The spreadsheet calls this "Stock at cost". The format calls it "Stocks".
- **`debtors`.** The spreadsheet shows "Trade Debtors" only. Submit adds the director's loan account when the director owes the company (E29 below 0), because the format's "Debtors" includes it.
- **`amountsOwedByDirectors`.** The spreadsheet shows the director's loan account; a figure below 0 is owed by the director. Section 413 calls this an advance or credit to a director. Submit fills the amount owed, with the sign turned.
- **`bankLoansOverdrafts`.** The spreadsheet calls this "Bank Overdraft". The format calls it "Bank loans and overdrafts".
- **`tradeCreditors`.** The spreadsheet's "Trade Creditors" also holds net wages, wage deductions and dividends due. A book fills Submit's other creditors with 0 this year; move those amounts to other creditors if the company shows them apart.
- **`creditorsAfterOneYear`.** The spreadsheet's F31 adds the director's loan account (E29) to the creditors due after more than one year (E30). When the director owes the company, Submit moves that amount to debtors.
- **`profitAndLossAccount`.** The spreadsheet shows "Retained Profit and Loss account" and "Capital Reserves". The format calls the reserve "Profit and loss account". Submit takes shareholders' funds (F39) less share capital, which is F37 and F38.

#### 4c. Micro-entity profit and loss account (`MICRO_PROFIT_AND_LOSS_FIELDS`, 7 rows)

Submit fills these from the small company lines (`microProfitAndLossFromSmall`). Where `frs105-formats.toml` names another cell, the note says so (Q4).

| Field | Submit label | Official term (R) | This year: cell, label | Last year | Diff |
|---|---|---|---|---|---|
| `turnover` | Turnover | Turnover (μPL A; feeds box 145) | `PubP&L!F9`: Sales Turnover | `PubP&L!B9` | yes |
| `otherIncome` | Other income | Other income (μPL B) | `PubP&L!F48`: Other Income | `PubP&L!B48` | no |
| `rawMaterials` | Raw materials and consumables | Cost of raw materials and consumables (μPL C) | none: Submit fills 0 | none | — |
| `staffCosts` | Staff costs | Staff costs (μPL D) | none: Submit fills 0 | none | — |
| `depreciation` | Depreciation and other amounts written off assets | same (μPL E) | `PubP&L!E43`: Depreciation | `PubP&L!A43` | yes |
| `otherCharges` | Other charges | Other charges (μPL F) | `PubP&L!F16+F44-E43`: Cost of Sales; Administrative Expenses; Depreciation | `PubP&L!B16+B44-A43` | yes |
| `tax` | Tax | Tax (μPL G) | `PubP&L!F50`: Corporation tax | `PubP&L!B50` | yes |

- **`turnover`.** The spreadsheet calls this "Sales Turnover". The format calls it "Turnover".
- **`rawMaterials`.** Submit puts the cost of sales in other charges, so this line is 0. `frs105-formats.toml` names `PubP&L!F16`.
- **`staffCosts`.** Submit puts staff costs in other charges, so this line is 0. `frs105-formats.toml` names `MnthP&L!B18+B19+B20`.
- **`depreciation`.** The spreadsheet's "Depreciation" (E43) is the figure Submit reads through `CorporationTax!I8`. A loss on disposal of assets (E42) stays in other charges. `frs105-formats.toml` names `MnthP&L!B39+B40`, which adds that loss.
- **`otherCharges`.** The format's "Other charges" is the spreadsheet's cost of sales and administrative expenses, less the depreciation. `frs105-formats.toml` names `PubP&L!F44` only.
- **`tax`.** The spreadsheet calls this "Corporation tax". The format calls it "Tax".

#### 4d. Micro-entity balance sheet (`MICRO_BALANCE_SHEET_FIELDS`, 6 rows)

| Field | Submit label | Official term (R) | This year: cell, label | Last year | Diff |
|---|---|---|---|---|---|
| `fixedAssets` | Fixed assets | Fixed assets (μBS1 B) | `PubBalSht!F6`: Fixed Assets | `PubBalSht!B6` | no |
| `currentAssets` | Current assets | Current assets (μBS1 C) | `PubBalSht!E13`: Current Assets | `PubBalSht!A13` | no |
| `creditorsWithinOneYear` | Creditors: amounts falling due within one year | same (μBS1 E) | `PubBalSht!E20`: Current Liabilities | `PubBalSht!A20` | yes |
| `creditorsAfterOneYear` | Creditors: amounts falling due after more than one year | same (μBS1 H) | `PubBalSht!F31` † (C30): Creditors (falling due after more than one year) | `PubBalSht!B31` | yes |
| `calledUpShareCapital` | Called up share capital | part of Capital and reserves (μBS1 K); named at BS1 K.I | `PubBalSht!F36`: Called up share capital 2 ordinary shares of £1.00 each | `PubBalSht!B36` | no |
| `profitAndLossAccount` | Profit and loss account reserve | part of Capital and reserves (μBS1 K); named Profit and loss account at BS1 K.V | `PubBalSht!F37+F38`: Retained Profit and Loss account; Capital Reserves | `PubBalSht!B37+B38` | yes |

- **`currentAssets`.** Submit adds the director's loan account to the spreadsheet's figure when the director owes the company (E29 below 0).
- **`creditorsWithinOneYear`.** The spreadsheet calls this "Current Liabilities". The format calls it "Creditors: amounts falling due within one year".
- **`creditorsAfterOneYear`.** As in 4b.
- **`profitAndLossAccount`.** As in 4b.

### 5. Fixed asset note (`FIXED_ASSET_CLASSES` × `FIXED_ASSET_FIELDS`, 30 fields)

The cell of a field is the class's column and the field's row on `PubNotes` (for example, plant and machinery additions is `PubNotes!C9`). The note has no last-year cells. The note's heading in the workbook is "1. Tangible Assets" (`PubNotes!A3`); R48 heads it "Fixed assets".

| Class | Submit label | Official term (R) | Column: label | Diff |
|---|---|---|---|---|
| `landBuildings` | Land and buildings | Land and buildings (BS1 B.II.1) | B: Land and Buildings | no |
| `plantMachinery` | Plant and machinery | Plant and machinery etc. (BS1 B.II.2) | C: Plant and Machinery | no |
| `furnitureFittings` | Fixtures and fittings | none in R (Q6) | D: Fixtures & Fittings | no |
| `computerEquipment` | Computer equipment | none in R (Q6) | E: Computer Equipment | no |
| `motorVehicles` | Motor vehicles | none in R (Q6) | F: Motor Vehicles | no |

| Field | Submit label | Official term (R48) | Row: label | Diff |
|---|---|---|---|---|
| `costAtStart` | Cost at the start of the period | amounts as at the beginning of the financial year, at purchase price or production cost (48(1)(a), 48(2)(a)) | 8 † (A7): Original Cost | yes |
| `additions` | Additions | acquisitions (48(1)(b)(ii)) | 9: Additions | yes |
| `disposals` | Disposals (cost) | disposals (48(1)(b)(iii)) | 10: Disposals | no |
| `depreciationAtStart` | Depreciation at the start of the period | cumulative amount of provisions for depreciation, at the beginning of the year (48(3)(a)) | 14 † (A13): Depreciation | yes |
| `depreciationCharge` | Depreciation charge for the period | provisions made in respect of the financial year (48(3)(b)) | 15: Charge for the year | yes |
| `depreciationOnDisposals` | Depreciation on disposals | adjustments in consequence of the disposal of any assets (48(3)(c)) | 16: On Disposals | yes |

- **`costAtStart`.** The spreadsheet heads the rows "Original Cost" and shows the start date in A8. Enter row 8.
- **`additions`.** The spreadsheet and Submit say "Additions". The Regulations call them acquisitions.
- **`depreciationAtStart`.** The spreadsheet heads the rows "Depreciation" and shows the start date in A14. Enter row 14.
- **`depreciationCharge`.** The spreadsheet calls this "Charge for the year". It is the depreciation provided for the year.
- **`depreciationOnDisposals`.** The spreadsheet calls this "On Disposals". It is the depreciation taken off for the assets disposed of.

### 6. Statements, regime and text fields (18 rows)

| Field | Submit label (short) | Official term (source) | This year: cell, label | Diff |
|---|---|---|---|---|
| `statementSection477Exemption` | The company is entitled to exemption from audit under section 477 … | statement of the exemption (CA 475(2); CA 477) | `PubBalSht!C41`: the company was entitled to exemption from audit under section 477 … | yes |
| `statementMembersNotRequiredAudit` | The members have not required the company to obtain an audit for the year in question. | the members have not required the company to obtain an audit of its accounts for the year in question in accordance with section 476 (CA 475(3)(a)) | `PubBalSht!A44`: a) The members have not required … | no |
| `statementDirectorsResponsibilities` | The directors acknowledge their responsibilities … | the directors acknowledge their responsibilities for complying with the requirements of this Act with respect to accounting records and the preparation of accounts (CA 475(3)(b)) | `PubBalSht!A46`: b) The directors acknowledge … | no |
| `statementSmallCompaniesRegime` | These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime. | the same words (CA 414(3)(b)) | `PubBalSht!A52`: e) The accounts have been prepared in accordance with the special provisions of the Companies Act relating to small (A52; "companies" is in A53) | yes |
| `statementMicroEntityProvisions` | … and in accordance with the provisions available to micro-entities. | a statement that the accounts are prepared in accordance with the micro-entity provisions (CA 414(3)(a)) | none | — |
| `regimeSmall` | Small company accounts (FRS 102 section 1A) | small company accounts (LoC `#small-company`); small companies regime (CA 381) (Q7) | none | — |
| `regimeMicro` | Micro-entity accounts (FRS 105) | micro-entity accounts (LoC `#micro-entity`); micro-entity (CA 384A) (Q7) | none | — |
| `principalActivity` | Principal activity | none: CA 416(1)(b) is omitted (Q9) | `OpenAccounts!E8`: The principal activity of the company is | no |
| `accountingPolicies` | Accounting policies | accounting policies adopted by the company (R44) | none | — |
| `directors` | Directors who held office during the period | the names of the persons who, at any time during the financial year, were directors of the company (CA 416(1)(a)) | `OpenAccounts!E5`, `E6`: First Director's Name; Second Director's Name | yes |
| `directorsAdvanceName` | Director who owes the company money … | advances and credits granted by the company to its directors (CA 413(1)) | `OpenAccounts!E5`: First Director's Name | yes |
| `directorsAdvanceTerms` | Interest rate and main conditions of that director's advance | an indication of the interest rate; its main conditions (CA 413(3)(b), (c)) | none | — |
| `directorsAdvanceAtStart` | Owed by that director at the start of the period … | none named in CA 413(3) | `OpenAccounts!E30`: Directors Loan Account | yes |
| `directorsAdvanceMade` | Advanced to that director in the period … | its amount (CA 413(3)(a)) | `PubBalSht!E29` less `OpenAccounts!E30` | yes |
| `directorsAdvanceRepaid` | Repaid by that director in the period … | any amounts repaid (CA 413(3)(d)) | `OpenAccounts!E30` less `PubBalSht!E29` | yes |
| `averageEmployees` | Average number of employees during the period | the average number of persons employed by the company in the financial year (CA 411(1)) | none (Q12) | — |
| `directorName` | Director approving the accounts | signed on behalf of the board by a director of the company (CA 414(1)) | `PubBalSht!C56`: Name of Director | yes |
| `directorDateApproved` | Date approved | none named in CA 414 (Q10) | `PubBalSht!C57`: Date Signed | yes |

- **`statementSection477Exemption`.** The spreadsheet says the company "was entitled" to the exemption "for year end" and its date. The statement on the accounts says it "is entitled".
- **`statementSmallCompaniesRegime`.** The spreadsheet's statement (e) says "special provisions of the Companies Act relating to small companies". Section 414(3)(b) asks for the words in Submit's label. The spreadsheet's statement (d) uses those words for the accounts as delivered.
- **`directors`.** The spreadsheet names up to two directors, first and second. List every director who held office in the period.
- **`directorsAdvanceName`.** A book names the first director (`OpenAccounts!E5`). Change it when another director owes the company.
- **`directorsAdvanceAtStart`.** The spreadsheet's opening director's loan account (`OpenAccounts!E30`) is below 0 when the director owes the company. Submit fills the amount owed, with the sign turned.
- **`directorsAdvanceMade`, `directorsAdvanceRepaid`.** The spreadsheet holds the balance at the start and at the end only. A book fills the increase as advanced, or the decrease as repaid; enter the amounts when there were both.
- **`directorName`.** The spreadsheet's "Name of Director" (`PubBalSht!C56`) shows the first director (`OpenAccounts!E5`).
- **`directorDateApproved`.** The spreadsheet's "Date Signed" shows today's date (`TODAY()`). A book does not fill this field; enter the date the board approved the accounts.

### 7. Loan rows (`LOAN_ROW_FIELDS`, `REPAYMENT_ROW_FIELDS`, 8 rows)

Labels from `fileCompanyTaxReturn.page.js`. A repayment row goes to CT600A Part 2 (A25) or Part 3 (A50) by its date.

| Field | Submit label | Official term (FA) | Reference | This year | Diff |
|---|---|---|---|---|---|
| `loanName` | Name of participator or associate | Name of participator or associate | A10 column A | `OpenAccounts!E5`: First Director's Name | yes |
| `loanAmount` | Amount still owed at the end of the period | Amount of loan/benefit | A10 column B; sum A15 | `PubBalSht!E29` less `OpenAccounts!E30` | yes |
| `loanLent` | Of this, the amount lent on or after the rate change | none on FA | A20 | none | — |
| `loanRate` | Section 455 rate for this loan, if you want to use another (%) | rate applicable | A20 | none | — |
| `repaymentName` | Participator | Name of participator or associate | A25 or A50 column A | none | — |
| `repaymentDate` | Date | Date of repayment, release or write–off | A25 or A50 column D | none | — |
| `repaymentRepaid` | Amount repaid | Amount repaid | A25 or A50 column B; A30 or A55 | none | — |
| `repaymentReleased` | Amount released or written off | Amount released or written off | A25 or A50 column C; A35 or A60 | none | — |

- **`loanName`.** A book names the first director (`OpenAccounts!E5`) for the one loan row it fills.
- **`loanAmount`.** The spreadsheet holds the director's loan account at the start and at the end. A book fills the increase in the amount the director owes. Enter each loan made in the period and still owed.

### 8. Questions the page defines (5 rows)

| Field | Submit label | Official term (source) | Reference | This year | Diff |
|---|---|---|---|---|---|
| `sendTo` | Where are you sending these accounts? | none | none | none | — |
| `companiesHouseCopy` | Which copy goes to Companies House? (Full accounts; Filleted accounts) | a small company need not deliver its profit and loss account and directors' report (CA 444(1)) (Q8) | none | none | — |
| `includeComparatives` | Include last year's figures | the corresponding amount for the immediately preceding financial year (R7(1)) | none | `PubP&L` column B; `PubBalSht` columns A and B | no |
| `includeFixedAssetNote` | Include the tangible fixed assets note | Fixed assets (R48) | none | `PubNotes!A3`: 1. Tangible Assets | yes |
| `firstPeriodStart` | Does the first accounting period start on the first day of the accounts? | accounting period (F boxes 275, 280); the period of the return (G `#and-35-period-of-the-return`) | Box 30 of return 1 | none | — |

- **`includeFixedAssetNote`.** The spreadsheet calls the note "1. Tangible Assets". The Regulations' note is on fixed assets; Submit's note covers the tangible ones.

### 9. Accounts pages only (`MICRO_PAGE_LINES`, `SMALL_PAGE_LINES`, 20 rows)

Lines that the micro-entity and small company accounts pages define in `accounts-line-detail.js` and the CT600 does not have. Cells are in `Financialaccounts.xlsx` of the published package. Last year is column A or B of the same row.

| Field | Page | Official term (R) | This year: cell, label | Last year | Diff |
|---|---|---|---|---|---|
| `capitalAndReserves` | micro | Capital and reserves (μBS1 K) | `PubBalSht!F39`: Shareholders' Funds | `PubBalSht!B39` | no |
| `changeInStocks` | small | Increase or decrease in stocks (PL2 2) | `PubP&L!E14-E12`: Less Closing Stock at (closing less opening) | `PubP&L!A14-A12` | no |
| `otherOperatingIncome` | small | Other operating income (PL2 4) | `PubP&L!F8`: Investment Grants received | `PubP&L!B8` | no |
| `rawMaterialsConsumables` | small | Raw materials and consumables (PL2 5(a)) | `PubP&L!E13+E29`: Purchases, Consumable Materials | `PubP&L!A13+A29` | no |
| `otherExternalCharges` | small | Other external charges (PL2 5(b)) | `PubP&L!F15`: Sub contractors | `PubP&L!B15` | no |
| `staffCosts` | small | Staff costs (PL2 6) | `PubP&L!E21+E22+E23`: Wages and Salaries, Directors Wages, National Insurance | `PubP&L!A21+A22+A23` | no |
| `depreciation` | small | Depreciation (PL2 7(a)) | `PubP&L!E43`: Depreciation | `PubP&L!A43` | no |
| `interestPayable` | small | Interest payable (PL2 14) | `PubP&L!E38`: Bank Interest Paid | `PubP&L!A38` | no |
| `tradeDebtors` | small | Trade debtors (BS1 C.II.1) | `PubBalSht!E11`: Trade Debtors | `PubBalSht!A11` | no |
| `amountsOwedToDirectors` | small | Other creditors after one year (BS1 H.4) | `PubBalSht!E29`: Directors Loan Account | `PubBalSht!A29` | yes |
| `calledUpShareCapitalNotPaid`, `prepaymentsAccruedIncome`, `provisionsForLiabilities` (both pages), `accrualsDeferredIncome`, `ownWorkCapitalised`, `otherOperatingExpenses`, `otherDebtors`, `prepayments`, `accruals`, `amountsOwedToGroupUndertakings` | both or small | μBS1 A, D, I, J; PL2 3, 8; BS1 C.II.3, D, E.4, H.3 | none | none | — |

- **`amountsOwedToDirectors`.** A figure above 0 in the Directors Loan Account is owed to a director. A figure below 0 is owed by a director and goes in debtors.

### Cells not confirmed

- `Admin!P14`: the cell Submit reads for associated companies. It is empty in the published package and has no label in its row.
- The † cells (`CT600!B33`, `M33`, `Q206`, `C126` to `AJ128`, `AJ166`; `OpenAccounts!O3`; `PubBalSht!F31`; `PubNotes` rows 8 and 14): each label was read in the cell in brackets, not in the cell's row.
- Every figure in the published package is 0 or empty, so each cell was checked by its label and formula, not by a value.
- `CELL_MAP` labels are not always the workbook's text (for example `MnthP&L!B37` is "Charitable Donations" in the workbook and "Charitable Donations (code y)" in `CELL_MAP`). This register uses the workbook's text.

### The operator's answers (2026-11-26)

The `(Qn)` marks in the appendix point here. CTL1A applies the answers marked "change"; the others keep Submit's current wording and behaviour.

1. Box 85A: label "Box 85". Change.
2. Associated companies: the disclosure shows "none" (not `Admin!P14`), and the person types the number in Submit's form. Change.
3. Computation lines: take each term from HMRC's CT computations taxonomy (the `ct-comp` element labels that `app/services/ctComputationsIxbrl.js` already files). Change.
4. Micro-entity costs: file the format's lines, raw materials and consumables from `PubP&L!F16` and staff costs from `MnthP&L!B18+B19+B20`; other charges falls by the same amount. Change.
5. `-` in a `sheetCell`: allowed. Keep.
6. Fixed asset classes: keep all five of Submit's names. Keep.
7. FRS 102 Section 1A and FRS 105: keep in the labels. Keep.
8. "Filleted accounts": keep, with a hint that cites CA 444(1). Keep.
9. "Principal activity": keep. Keep.
10. "Date approved": keep, with a hint that cites CA 414. Keep.
11. Box 4: label "Box 4: Type of company", keep Yes or No (No files 0). Keep.
12. Average number of employees: the disclosure shows "none". Keep.
13. The declaration: HMRC's text, word for word. Change.
14. Losses brought forward: "Trading losses brought forward", with a reference that box 160 is the part set against trading profits. Change.
