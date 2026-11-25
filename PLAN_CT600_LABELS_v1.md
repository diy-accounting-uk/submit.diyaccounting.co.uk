<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_CT600_LABELS: every field of the CT600 journey has HMRC's term, its box, a note and its place in the DIY Accounting spreadsheets

## Operator assertions (verbatim)

> I am completing the CT600 for diy accounting, and my first observations was that I liked these explatory notes and I would like them for every field in te ct600. Also the names don't match DIY Accounting, where possible prefer HMRC's term (which the note will link to) and all of these should show the CT600 form box numbers. Where the DIY label does not match HMRC (and now Submit) we should add a note about the difference. Anyway for all form fields we should mention the file, sheet and cell that the values come from location and with a screen shot. Please build a plan for these labelling improvements for just the ct600 journey, we can roll it out everywhere if the roll-out goes well.

(operator, 2026-11-25, with screenshots of the box 326 note, the profit and loss and balance sheet sections beside the workbook's `PubP&L` and `PubBalSht` sheets)

## Status

defined 2026-11-25; in review (plan-review-loop); not on `NEXT.md`.

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
| One table for the CT600 | `web/public/lib/ct600-fields.js`: `CT600_BOX_ROWS` (line 26), `CT600_FORM_FIELDS` (line 636), the accounts lines (lines 1054 to 1238) | the form, the review and the help read it, so a box has one label everywhere |
| HMRC's box names | `CT600_BOX_ROWS`: 64 boxes, each with a label and a Company Tax Return guide anchor | complete |
| Notes on the form fields | `CT600_FORM_FIELDS`: 40 fields, 33 with a `hint`; 13 have no `box` | 7 with no note: `lossOutsideUk`, `loansMade`, `releasedBeforeEnd`, `repaidSince`, `declarantName`, `declarantStatus`, `declarationAccepted` |
| The note and its link | `hintOf` in `web/public/companies-house/fileCompanyTaxReturn.page.js` (line 244); the link comes from the box row's anchor (`guideAnchorOf`, line 241) | a field with no box has no link |
| Accounts lines | `MICRO_PROFIT_AND_LOSS_FIELDS` (7), `MICRO_BALANCE_SHEET_FIELDS` (6), `PROFIT_AND_LOSS_FIELDS` (5), `BALANCE_SHEET_FIELDS` (14), `FIXED_ASSET_FIELDS` (6 for each of 5 classes), `STATEMENT_FIELDS` (4), `ACCOUNTS_TEXT_FIELDS` (11) | each is `[id, label]`: no note, no reference, no link |
| Where each figure is in the workbook | `CELL_MAP` in the spreadsheets repository, `app/products/ltd/cell-map.js`; Submit's pinned `@diy-accounting-uk/diya-gl` (1.2.94) ships it as `dist/app/products/ltd/cell-map.js` | one row per cell: sheet, cell, the workbook's label, the book field, the section. The file is `Financialaccounts.xlsx`. `PubP&L` has last year in column B and this year in column F; `PubBalSht` has last year in columns A and B and this year in columns E and F |
| A workbook to photograph | `../spreadsheets.diyaccounting.co.uk/packages/GB Accounts Company 2026-03-31 (Mar26) Excel 2007/` | the published package, with no customer data |

The operator's screenshots show the cost of the gap. The workbook's "Current Assets" (`PubBalSht` E13) and "Net Assets" (`PubBalSht` F33) are different lines. The form's "Current assets" field has no note to say which one it takes. The workbook's "Administrative Expenses" (`PubP&L` F44) has no line called "Other charges", which is the micro-entity format's name for it.

## Rules

- **One table.** Every new fact (the term, its source, the reference, the note, the workbook place, the difference note) is a property of the field's entry in `ct600-fields.js`, so the form, the review and the receipt read one record. The accounts arrays change from `[id, label]` to objects. Every caller changes in the same task; no compatibility alias.
- **The workbook place comes from `CELL_MAP`.** Submit imports it from the pinned package and names a cell only by a key into that map. A cell that `CELL_MAP` lacks is added there first, in the spreadsheets repository (CTL3), and reaches Submit with the next diya-gl release.
- **Official terms come from their sources**, each read and cited in CTL1: the CT600 (2026) Version 3 form and the Company Tax Return guide for boxes; The Small Companies and Groups (Accounts and Directors' Report) Regulations 2008 (SI 2008/409), Schedule 1, for the micro-entity and small company formats; FRS 105 and FRS 102 Section 1A where the Regulations do not name a line. A term is never written from memory.
- **A difference note** states the workbook's label, the official term and what the person does about it, in one or two sentences ("The spreadsheet calls this Administrative Expenses. The micro-entity format calls it Other charges. Enter the spreadsheet's figure here.").
- **The text** follows `plain-prose`, and each string has a Welsh entry in `i18n/cy.toml` (CTL6).
- **The page shows the workbook place to every reader**, in a closed disclosure under the note ("In DIY Accounting's spreadsheets"), so a reader who does not use the spreadsheets is not slowed.
- **The screenshots** come from the published package, never from a customer's or the company's own workbook.

## Tasks

| # | Task | Waits on | Needs | Model | Size |
|---|---|---|---|---|---|
| CTL1 | The label register: every field, its official term and source, its reference, the workbook's label and cells, and whether a difference note is needed | nothing | machine-only | Opus | 1 file (this plan's appendix) |
| CTL2 | The table carries the register: term, source link, reference, note and `CELL_MAP` key on every entry of `ct600-fields.js`; the accounts arrays become objects | CTL1 | machine-only | Sonnet | ~6 files |
| CTL3 | `CELL_MAP` gains the cells CTL1 found missing (for example `PubP&L` Other Income, the last-year columns), released in diya-gl, and Submit's pin moves to it | CTL1 | machine-only | Sonnet | ~4 files (spreadsheets), 2 (submit) |
| CTL4 | The page shows the reference in every label, the note with its link on every field, and the "In DIY Accounting's spreadsheets" disclosure with the file, sheet, cells and difference note | CTL2, CTL3 | machine-only | Sonnet | ~6 files |
| CTL5 | `scripts/ct600-source-shots.mjs`: one WebP for each `CELL_MAP` key the table names, cut from the published package, with the cell marked; the disclosure shows it | CTL2 | machine-only | Sonnet | ~5 files and the images |
| CTL6 | Welsh for every new string, then `npm run build:welsh` | CTL4 | machine-only | Sonnet | ~2 files |
| CTL7 | The review step and the receipt show the same labels and references | CTL4 | machine-only | Sonnet | ~4 files |
| CTL8 | The look pass: `visual-review` on the page, the guide screenshots again, `ui-ux-pro-max` on the CT600 guide frames, and the CT600 videos recorded again | CTL5, CTL6, CTL7 | machine-only | Sonnet | screenshots and videos |
| OCTL1 | The operator decides whether to roll the pattern out to the other journeys, from the CT600 page on prod | CTL8 on prod | human-driven | operator | 0 files |

### CTL1. The label register

One table, written as the appendix of this plan, with one row for each field of the CT600 journey: the 64 box rows, the 40 form fields, the accounts lines, the statements and the text fields of section 2. Columns:

- the field id and the current Submit label;
- the official term, its source and the URL with its anchor (the guide anchor already in `CT600_BOX_ROWS`; the legislation.gov.uk section for an accounts line);
- the reference: "Box <n>", or the format item and the boxes it feeds (turnover feeds box 145);
- the workbook's label and its `CELL_MAP` keys for this year and last year, or "none" when the workbook has no such line (a value the person types, such as box 326);
- the figure's path when it is not one cell: a micro-entity line can be the sum of several workbook lines ("Other charges" is Administrative Expenses less staff costs and depreciation), and the row says which cells and the sum;
- "difference note: yes" when the workbook's label differs from the official term, with the note's text.

The paths come from code where code holds them: Submit's `formEntriesFromBook` (`ct600-fields.js`, line 2068) maps a diya-gl book to the form, and `CELL_MAP` maps the workbook to the book. CTL1 joins the two and checks each joined path against one workbook of the published package. A field whose term or path the sources leave open is listed at the end of the appendix as a question for the operator.

### CTL2. The table carries the register

Each entry of `CT600_BOX_ROWS`, `CT600_FORM_FIELDS` and the accounts arrays gains `term`, `termSource` (a URL), `reference`, `note` (the hint) and `source` (`{ thisYear: "<CELL_MAP key>", lastYear: "<CELL_MAP key>", sum: [...], differenceNote }`). The accounts arrays become objects; every caller (`fileCompanyTaxReturn.page.js`, `formEntriesFromBook`, `formEntriesFromIxbrl`, `accountsFromValues`, `microAmountIds`, `accountAmountIds`) changes in the same commit. A unit test in `web/unit-tests/ct600-fields.test.js` asserts that every field has a term, a source URL, a reference and a note, and that every `source` key exists in the pinned `CELL_MAP`.

### CTL3. The missing cells

For each cell CTL1 marks as missing from `CELL_MAP`: add the row in `app/products/ltd/cell-map.js` of the spreadsheets repository, with its test, and release diya-gl. Then move Submit's pin (`package.json`, `package-lock.json`). The spreadsheets change follows that repository's `CLAUDE.md` and its pre-push hook.

### CTL4. The page

`hintOf` renders the note with its source link for every field, and the link comes from `termSource` when the field has no box. Each label starts with its reference ("Box 155:", "Balance sheet item C:"). Under the note, a `<details>` element named "In DIY Accounting's spreadsheets" shows `Financialaccounts.xlsx`, the sheet and the cell for this year and last year, the sum when there is one, the difference note and the screenshot (CTL5). The accounts tables get the same note and disclosure for each line. Gates: `web/browser-tests/fileCompanyTaxReturn.browser.test.js` and `fileCompanyTaxReturn.operatorPreview.browser.test.js` (a label with its reference, a note with its link, the disclosure closed, then open with its cells), `npx eslint`, `npx prettier --check`.

### CTL5. The screenshots

`scripts/ct600-source-shots.mjs` reads the published package's `Financialaccounts.xlsx` with the diya-gl workbook reader. It draws the rows around each named cell as an HTML grid with the sheet's own column letters, row numbers and labels, marks the cell, and takes a WebP with Playwright into `web/public/images/ct600-sources/<sheet>-<cell>.webp`. An npm script runs it. A unit test checks that each `source` key in the table has its image. The images are committed.

### CTL6. Welsh

Every new string has its `i18n/cy.toml` entry, then `npm run build:welsh`. The Welsh proof (`scripts/welsh-proof.mjs`) runs on the page.

### CTL7. The review step and the receipt

The review step and the receipt read the label and reference from the same entries, so they show "Box <n>" and the official term. The tests that hold the review and receipt text change with them.

### CTL8. The look pass

The definition of done for a major visual change: `visual-review` on the passing run's screenshots; `npm run video:walkthrough` for the CT600 guide; `ui-ux-pro-max` on those frames; the `file-company-tax-return-*` videos recorded again on the simulator (`site-video-capture`) and published unlisted for the operator to watch (`video-publish`).

### OCTL1. The roll-out decision

When CTL8 is on prod, the operator uses the CT600 page and says whether the pattern goes to the other journeys (VAT, the micro-entity and small company accounts pages, Income Tax). A yes becomes a plan for each journey; each uses the same table pattern and its own product's `CELL_MAP`.

## Proof

- The CT600 page on ci: every field shows its reference and a note with a working link; every field with a workbook place has a disclosure with the file, sheet, cells and screenshot; every difference note matches the appendix.
- The unit test of CTL2 passes with no field left out.
- The Welsh proof passes on the page.
- `visual-review` passes on the page with the disclosures open and closed.

## Appendix: the label register

Written by CTL1.
