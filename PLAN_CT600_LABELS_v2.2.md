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

## Status

defined 2026-11-25; v2.1 adds CTL0, the operator's defect of 2026-11-25, and v2.2 adds CTV1, the operator's video request of the same day, after review round 1 (plan-review-loop); not on `NEXT.md`.

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

- **One table.** Every new fact is a property of the field's entry in `ct600-fields.js`, so the form, the review and the receipt read one record. `label` holds the official term; `hint` holds the note. The `[id, label]` arrays become objects, and the loan row labels move from the page into the table. Every use changes in the same task; no compatibility alias.
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
| CTL1 | The label register: every field, its official term and source, its reference, the workbook's label and cells, and whether a difference note is needed | nothing | machine-only | Opus | 1 file (this plan's appendix) |
| CTL2 | The table carries the register: official label, reference, note, source link and workbook cells on every entry of `ct600-fields.js`, with Welsh; the `[id, label]` arrays become objects | CTL1 | machine-only | Sonnet | ~6 files |
| CTL5 | `scripts/ct600-source-shots.mjs`: one WebP for each cell the table names, cut from the published package, with the cell marked | CTL2 | machine-only | Sonnet | ~3 files and the images |
| CTL4 | The page shows the reference in every label, the note with its link on every field, and the "In DIY Accounting's spreadsheets" disclosure with the file, sheet, cells, difference note and screenshot, with Welsh | CTL5 | machine-only | Sonnet | ~6 files |
| CTL7 | The review step and the receipt show the same labels and references, with Welsh | CTL4 | machine-only | Sonnet | ~4 files |
| CTV1 | Each section of the CT600 page that a CT600 video shows gets a click-to-load embed of that video, starting where the section first shows, and a link to that second | CTL4 | machine-only | Sonnet | ~6 files |
| CTL8 | The look pass: the Welsh proof, `visual-review` on the page, the guide screenshots again, `ui-ux-pro-max` on the CT600 guide frames, and the CT600 videos recorded again | CTL7, CTV1 | machine-only | Sonnet | screenshots and videos |
| OCTL1 | The operator decides whether to roll the pattern out to the other journeys, from the CT600 page on prod | CTL8 on prod | human-driven | operator | 0 files |

### CTL0. The worked tax panel goes to £0

Two causes, both read from the code:

1. **The own working empties the panel.** `renderWorkedTax` (`web/public/companies-house/fileCompanyTaxReturn.page.js`, line 1559) derives the return with every typed figure, `ownCorporationTax` included. `deriveCt600FromFigures` throws `Ct600RefusedError` when box 440 and the own working differ by more than £5 (`app/services/ct600Figures.js`, line 1217). The page's `catch` then clears every row and shows "Fill in the period and the accounts and the tax appears here." So each keystroke of a figure that is not yet within £5 of box 440 shows £0. Fix: the panel derives without `ownCorporationTax`, so it always shows the worked tax. The disagreement stays a refusal at the review step, as the field's note says. The long-period path (`deriveLongPeriodReturns`, `app/services/ct600LongPeriod.js`, line 54) takes the same change for each return's own working.
2. **The two-return block stays on screen.** `.worked-tax__returns { display: grid; }` (`web/public/css/long-period.css`, line 59) overrides the `hidden` attribute. After the period of account was over 12 months once (for example while a date is typed), `workedTaxLong` stays visible with its last figures under the 12-month rows. Fix: `.worked-tax__returns[hidden] { display: none; }`, as `web/public/css/bundles-cards.css` (line 26) does for its sections.

Gates: a case in `web/browser-tests/fileCompanyTaxReturn.browser.test.js` that types an own working £100 away from box 440 and still reads box 440 and box 600; a case that types a 13-month period and then a 12-month one and finds no "Return 1 of 2" heading visible; the review step still refuses the disagreement with both figures; `npm test`, `npx eslint` and `npx prettier --check` on each changed file. CTL0 touches no file that the other tasks need first, so it can land alone and before them.

### CTL1. The label register

One table, written as the appendix of this plan, with one row for each field of the CT600 journey: the 64 box rows, the 40 form fields, `DONATIONS_PAID_FIELD`, the accounts lines of both regimes, the fixed asset note, the statements, the regime choice, the text fields of the accounts section, and the loan and repayment row fields. The sign-in, company lookup, agent and gateway controls are not CT600 fields and are left out. Columns:

- the field id and the current Submit label;
- the official term, its source and the URL with its anchor (the guide anchor already in `CT600_BOX_ROWS`; the legislation.gov.uk section for an accounts line);
- the reference: "Box <n>", or the format item and the boxes it feeds (turnover feeds box 145), or "none" for a question with neither;
- the workbook's label and its `sheetCell` for this year and last year, or "none" when the workbook has no such line (a value the person types, such as box 326); a figure that is the sum of several cells is written with `+` (a micro-entity line can be the sum of several workbook lines);
- "difference note: yes" when the workbook's label differs from the official term, with the note's text.

Start from what the spreadsheets repository already records: the `sheetCell` values of `app/data/filing/ct600-v3.toml` and `app/data/filing/frs105-formats.toml`, and `CELL_MAP`. Submit's `formEntriesFromBook` (`ct600-fields.js`, line 2068) maps a diya-gl book to the form, and `CELL_MAP` maps the workbook to the book. Where these disagree (for example, `frs105-formats.toml` gives "Other charges" as `PubP&L` F44, and Submit's `microProfitAndLossFromSmall` works it out from the small company lines), the row follows the figure Submit fills in and says so. Last-year cells and cells that none of these name are read from the workbook. CTL1 checks each row's cells against one workbook of the published package. A field whose term or cell the sources leave open is listed at the end of the appendix as a question for the operator.

### CTL2. The table carries the register

Each entry of `CT600_BOX_ROWS`, `CT600_FORM_FIELDS`, `DONATIONS_PAID_FIELD`, the accounts definitions and the loan row fields gets its official `label` and its `hint` from the register, and gains:

- `reference` for a field with no `box` (a box field's reference is "Box <n>" from `box`);
- `termSource` (a URL) for a field with no `box` (a box field's link is its box row's anchor);
- `source`: `{ thisYear: "<sheetCell>", lastYear: "<sheetCell>", workbookLabel, differenceNote }`, absent when the register says "none".

The `[id, label]` arrays become objects with `id` and `label`. Every use changes in the same commit: `git grep` the array names; they are used only in `ct600-fields.js`, `fileCompanyTaxReturn.page.js`, `web/unit-tests/ct600-fields.test.js` and `web/browser-tests/fileCompanyTaxReturn.browser.test.js`. The loan row labels and hints move from `fileCompanyTaxReturn.page.js` into `ct600-fields.js`. A unit test in `web/unit-tests/ct600-fields.test.js` asserts that every field has a label, a reference, a hint and a source link, and that every `sheetCell` has the form `<file>!<sheet>!<cell>`. Gates: `npm run bundle`, then `npm test`.

### CTL5. The screenshots

`scripts/ct600-source-shots.mjs` reads the published package's workbook for each `source` with the diya-gl workbook reader (`dist/app/lib/xlsx-reader.js`). It fails when the workbook's label beside a cell is not the entry's `workbookLabel`. It draws the rows around each named cell as an HTML grid with the sheet's own column letters, row numbers and labels, marks the cell, and takes a WebP with Playwright into `web/public/images/ct600-sources/<sheet>-<cell>.webp`. An npm script runs it. A unit test checks that each cell the table names has its image. The images are committed.

### CTL4. The page

`hintOf` renders the note with its source link for every field, and the link comes from `termSource` when the field has no box. Each label starts with its reference ("Box 155:", "Balance sheet item C:"). Under the note, a `<details>` element named "In DIY Accounting's spreadsheets" shows the file, the sheet and the cell for this year and last year, the sum when there is one, the difference note and the CTL5 screenshot. The accounts tables and the loan rows get the same note and disclosure for each line. Gates: `web/browser-tests/fileCompanyTaxReturn.browser.test.js` and `fileCompanyTaxReturn.operatorPreview.browser.test.js` (a label with its reference, a note with its link, the disclosure closed, then open with its cells and image), `npm test`, `npx eslint`, `npx prettier --check`.

### CTL7. The review step and the receipt

The review step (`reviewAnswers` in `ct600-fields.js`) and the receipt (`filing-record.js`, `filing-result-record.js`) already read labels from the table. They show the reference beside each label: "Box <n>" for a box, the format item for an accounts line. The tests that hold the review and receipt text change with them.

### CTV1. A video for each section

The page has nine sections (`SECTIONS` in `web/public/lib/ct600-fields.js`: company, period, accounts, computation, allowances, reliefs, payments, loans, declaration). Four public CT600 videos exist, each with its YouTube id and a `walkthrough` in `videos/publish.json` and its copy in `web/public/videos/publish.json`: `file-company-tax-return-typed` (`tLEHujmk_RM`), `-with-accounts` (`aQAF5hAcxeQ`), `-book` (`ZoUTlFPvUes`) and `-long-period` (`Lwt-U4Emrao`).

1. **The time a section first shows.** `planWalkthrough` in `scripts/video-walkthrough.js` (line 109) already reads each recording's timeline (`timeline.steps`, with `sceneId`). It also records, for each CT600 video, `sections: { <section id>: <second> }`: the start of the first step whose `target` is inside that section's element on the page. The value goes into both copies of `publish.json` when `npm run video:walkthrough` runs. A section that no step reaches gets no entry.
2. **The page.** Under each section's heading, a closed `<details>` named "Watch this part" holds the first video, in the order typed, with-accounts, book, long-period, that has an entry for the section. On open it loads an iframe from `https://www.youtube-nocookie.com/embed/<id>?start=<second>`, built as `embedElement` builds one (`web/public/widgets/video-pages.js`, line 100), so a closed section loads nothing from YouTube. Beside it, a link to `https://youtu.be/<id>?t=<second>` names the time ("Watch from 1:23"). A section with no entry shows neither.
3. **Prod.** The CT600 videos are public. The video pages hold them back on prod because prod does not list the activity, and the CT600 page reaches only CT38's operators on prod, so its embeds show nothing to a customer until UH7.
4. Welsh for the new strings. Gates: a unit test of the section times from a fixture timeline; a browser case in `web/browser-tests/fileCompanyTaxReturn.browser.test.js` that opens one section's details and finds the iframe's `start` and the link's `t`; `npm test`, `npx eslint`, `npx prettier --check`. CTV1 follows CTL4 because both change `fileCompanyTaxReturn.page.js`. CTL8 records the videos again and runs `npm run video:walkthrough`, so the times follow the new recordings.

### CTL8. The look pass

The definition of done for a major visual change: the Welsh proof (`scripts/welsh-proof.mjs`) on the page; `visual-review` on the passing run's screenshots; `npm run video:walkthrough` for the CT600 guide; `ui-ux-pro-max` on those frames; the `file-company-tax-return-*` videos recorded again on the simulator (`site-video-capture`) and published unlisted for the operator to watch (`video-publish`).

### OCTL1. The roll-out decision

When CTL8 is on prod, the operator uses the CT600 page and says whether the pattern goes to the other journeys (VAT, the micro-entity and small company accounts pages, Income Tax). A yes becomes a plan for each journey; each uses the same table pattern and its own product's workbook cells.

## Proof

- The CT600 page on ci: every field shows its reference and a note with a working link; every field with a workbook place has a disclosure with the file, sheet, cells and screenshot; every difference note matches the appendix.
- The unit test of CTL2 passes with no field left out.
- The Welsh proof passes on the page.
- `visual-review` passes on the page with the disclosures open and closed.

## Appendix: the label register

Written by CTL1.
