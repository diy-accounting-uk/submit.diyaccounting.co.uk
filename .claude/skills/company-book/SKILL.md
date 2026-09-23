---
name: company-book
description: Build, verify and hand over DIY Accounting Limited's own diya-gl book from its bank, Stripe, PayPal and supplier sources, and tell Cowork where it is. Invoke when the operator asks for the company's accounts, P&L, book, bookkeeping, a month's figures, "write the accounts", "assemble the book", or to let Cowork or the spreadsheets MCP read the finances.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# company-book

DIY Accounting Limited keeps its own books as a diya-gl book: `book.toml` (the entity, chart of
accounts and opening balances) and `lines.jsonl` (every posted line). This skill builds it from
the source documents, proves it, and hands it over. The company's year ends on 31 March, so
March belongs to the earlier year.

## Where things are

Paths are from the workspace root, `/Users/antony/projects/diy-accounting-limited/`.

| What | Where | Notes |
|---|---|---|
| Bank statements (NatWest current `600947-80597386`, savings `600947-80634672`) | `drive/DIY Accounting Limited/finance/<yyyy-yyyy> accounts/bank/` | CSV and PDF per month, the bank's own file names. The operator puts them here. Read-only mirror |
| PayPal statements | `drive/…/finance/<yyyy-yyyy> accounts/paypal/` | `<yyyy-mm> PayPal - transactions.PDF` and `statement.PDF` per month |
| Stripe | `staging/<yyyy-yyyy>/stripe/` | `<date>-stripe-balance-transactions.json` and `-stripe-payouts.json`, written by `scripts/finance/stripe-stage.js --month YYYY-MM` (`AWS_PROFILE=submit-prod`) |
| Prior year's completed workbooks (the control) | `drive/…/finance/<prior year> accounts/` | `Financialaccounts.xlsx`, `Currentaccount.xlsx`, `Cashaccount.xlsx`, `Purchases.xlsx`, `Sales.xlsx` and others |
| Supplier mail | `mail/antony@diyaccounting.co.uk/<yyyy>/<m>/<d>/*.eml` | Invoices and payment schedules, often as PDF attachments |
| The book | `staging/<yyyy-yyyy>/book/` | `book.toml`, `lines.jsonl`, `VERIFICATION.md`, `book-diya-gl.zip`. Private; never commit it |

Finance sources are always in the Drive mirror or `staging/`. Look there before asking the
operator for a document.

## Build

A brief for a parser change names one real source month (its path under `../drive/…/finance/`)
and states the expected reconciliation residual, 0, as the change's first test. A parser fixture
with no real month behind it can pass while missing what the real file actually does.

The parsers live in `mcp/lib/finance/` (run `npm ci` in `mcp/` first):

| Source | Module | Call |
|---|---|---|
| Opening balances and chart of accounts | `book-from-workbook.js` | `bookFromWorkbookSet` over the prior year's workbook set; `openingJournalLines(book)` and `openingBankBalanceLines(book)` to turn its `openingBalances` into the lines the engine reads |
| NatWest | `bank-lines.js` | `bankLinesFromCsv(text, { accountMainID })`, `closingBalance(text)` |
| Stripe | `stripe-lines.js` | `stripeLinesFromTransactions`, `stripePayoutLines`, `reconcileStripeMonth` |
| PayPal | `paypal-statement-lines.js` | `paypalLinesFromStatementPdf(transactionsPdf, { ...accounts, statementPdfPath })`, `reconcilePaypalMonth({ transactionsText, statementText })`; needs `pdftotext` (poppler) |
| Supplier invoices | `mail-invoices.js` | its `runCorpus` option points at the corpus CLI when run from a worktree |

Validate with `validateBook` and `validateLines` from `@diy-accounting-uk/diya-gl`
(`dist/app/lib/diya-gl-schema.js`).

Posting rules:

- Take account codes from the prior year's workbooks. Never invent one.
- Post gross income and fees as separate lines. Never net them.
- A payout or transfer that shows in two sources (a Stripe payout and its bank credit, a PayPal
  withdrawal and its bank credit) is one movement. Post it once, on the bank side.
- PayPal holds and their releases never post. The statement's own Releases figure decides which
  rows are releases.
- A payment to a creditor carries bank code `CR` and no purchases line. Polycode Limited's
  management fee is one of these.
- Every bank line carries both `diya-gl:bankCode` (the analysis column) and `debitCreditCode`
  (`D` for money in, `C` for money out). The engine's `book-ltd-bank-line-has-side` check reads
  `debitCreditCode` alone; a line with only `diya-gl:bankCode` drops out of the trial balance.
- A Ltd book's opening balance sheet is read only from an opening journal (`sourceJournalID`
  `"journal"`, `documentReference` starting `OB-`), never from `book.toml`'s own
  `[openingBalances]` table. Call `openingJournalLines(book)` after seeding the book to turn that
  table into the journal the engine reads; it declares any account referenced there that
  `book.toml` does not already carry (from a fixed map, never an invented code).
- A bank account's own opening balance is a second, separate line from the opening journal above:
  a `"BC"`-coded bank line dated the period's first day, which is how each bank workbook's own
  month tab takes its opening balance. Call `openingBankBalanceLines(book)` too, or the balance
  sheet and the bank workbook's own running total disagree by exactly the account's opening
  figure.
- `documentInfo.periodCoveredEnd` is the company's fiscal year end, not the last date this book
  happens to have data for. Setting it to a mid-year data cutoff makes the engine infer the wrong
  12-month layout (it picks the template variant and month-tab order from this date) and shifts
  every real month onto the wrong column, failing dozens of monthly P&L tie-out checks that have
  nothing to do with the book's own data. A book covering April to August of a March year end
  still carries `periodCoveredEnd = "<next> 03-31"`.
- The book period starts 1 April, not 1 March: the company's year ends 31 March, and a book that
  starts in March straddles the year end and carries part of the prior year's control into this
  one's opening position.
- `stripePayoutLines` exists for `reconcileStripeMonth`'s own proof figures, not for a line this
  book keeps: the NatWest current-account CSV already carries the same payout as a BAC receipt
  (same date, same amount), and posting both counts the payout twice.
- The engine has no way yet to net a Stripe refund or dispute against turnover: a sales-journal
  line's amount is schema-fixed to zero or more, and nothing reads `documentType`, so a
  `credit-note` line still adds to turnover instead of reducing it. Posting the refund is still
  correct; the turnover figure it feeds stays overstated by twice the refunded amount (once for
  never cancelling the original sale, once for adding again) until the engine gains a way to net
  it (a spreadsheets change, not a parser one).

Glue code for a run goes in the session's scratchpad, not the repository. A defect in a committed
parser is fixed in the parser, with a test, on a branch.

## Verify

Write `VERIFICATION.md` beside the book, one line per check with the figures:

1. The first month of the book matched line for line against the prior year's workbook (the
   control). List every line that differs and why.
2. Each month's bank closing balance, current and savings, equals the statement's.
3. Every Stripe and PayPal month reconciles with residual 0.
4. Gross and fees separate, no hold posted, no transfer counted twice.
5. `validateBook` and `validateLines` pass.
6. Monthly totals: sales, purchases by account, bank movement.
7. Anything confirmed from mail (a payment schedule, a subscription ending), with the file.

Any open judgement goes to the operator as a decision with the alternatives and their effect on
the figures. Record the answer in `VERIFICATION.md`.

## Hand over

1. Zip the book for the spreadsheets MCP:
   `cd staging/<yyyy-yyyy>/book && zip -X book-diya-gl.zip book.toml lines.jsonl`.
2. Prove the zip loads:
   ```bash
   cd ../spreadsheets.diyaccounting.co.uk
   node --input-type=module -e "import { extractBookFromFile } from './app/bin/export.js'; const r = await extractBookFromFile('<absolute path>/book-diya-gl.zip'); console.log(r.product, r.lines.length)"
   ```
3. The operator copies `book.toml`, `lines.jsonl` and `VERIFICATION.md` into Drive under
   `finance/<yyyy-yyyy> accounts/`. Nothing automated writes to Google Drive.
4. Tell Cowork (next section).
5. Keep the board current: the book's row in `NEXT.md` names the files, the checks and any open
   decision.

## Tell Cowork

Cowork runs in a Linux VM with the workspace mounted, and reaches the book through the published
spreadsheets MCP, `@diy-accounting-uk/diya-gl` (binary `diya-gl-mcp`; tools `extract_book`,
`report`, `edit_lines`, `save_workbook`; it reads and edits, it never submits). Append a block
to `INBOX.md` at the workspace root, stamped with `date -u +%FT%TZ`:

```markdown
## [unread] <ISO-8601 UTC> — to: cowork
DIY Accounting Limited's book for <period> is ready at `staging/<yyyy-yyyy>/book/`
(relative to the workspace root): `book-diya-gl.zip` (book.toml + lines.jsonl, <n> lines),
with `VERIFICATION.md` beside it.

To read it, add the spreadsheets MCP as a stdio server:
`npx -y -p @diy-accounting-uk/diya-gl diya-gl-mcp` (needs Node and npm access in the VM).
Then call `extract_book` with the zip's path, then `report` for the P&L, balance sheet, VAT and
checks. `edit_lines` tries a change in the session; `save_workbook` writes a spreadsheets
package: save it under `staging/`, never under `drive/` (the Drive mirror is read-only and a
pull overwrites it). The source statements are in `drive/DIY Accounting Limited/finance/`.
Rebuilding the book and pulling Stripe or PayPal stay with Claude Code on the host.
```

Write a new block when the book is rebuilt; mark the old one `[read]` if Cowork has not.
