<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: diya-gl against accounting standards

A reviewer with an accounting and audit background reads a diya-gl book and finds each construct that keeps a set of accounts whole stated in code they can review: double entry, a typed chart of accounts mapped to the FRS 102 and FRS 105 taxonomy, a trial balance built from the lines, the year-end close and roll forward, control accounts, journals with a reason and an author, corrections by reversal, period locks after a filing, VAT boxes from the lines, and the ties from trial balance to each filed fact. Facts checked 2026-11-22 against `spreadsheets.diyaccounting.co.uk` main at `24547a929` and `submit.diyaccounting.co.uk` main at `60ab98a8f`.

**Status**: reviewed in three rounds; decisions answered by the operator on 2026-11-22. Tasks GLS2 to GLS20 are boarded on `NEXT.md`. Briefs are section 6.2.

## Operator assertions (verbatim)

> Assess diya-gl against accounting standards, then plan the changes an auditor would expect. Read diya-gl as someone with an accounting and audit background would, and write `PLAN_DIYA_GL_STANDARDS.md` at this root to bring it in line with normal practice, with each construct that underpins the integrity of a set of accounts stated in reviewable code.

> Assess, each with its evidence (file and line) or its absence: double entry (every entry's debits equal its credits, enforced at validation); a chart of accounts with a type for each account (asset, liability, equity, income, expense) and its mapping to the FRS 102 and FRS 105 taxonomy concepts; a trial balance built from the lines, that balances, by period; opening balances, the year-end close of income and expense to retained earnings, and the roll forward; the control accounts and their sub-ledgers (bank, VAT, PAYE, debtors, creditors, fixed assets and depreciation) reconciling to the ledger; journals and adjustments with a reason and an author; an audit trail (entered and posted, by whom and when, no silent edit: corrections by reversing entries, `postingStatus`); period locking once accounts or a VAT return are filed; the VAT return's nine boxes derived from the lines; rounding and currency; the derivation from the trial balance to the profit and loss and the balance sheet, and to each iXBRL fact; and the checks that tie them (the balance sheet balances, retained earnings agree, VAT control agrees with the returns filed). Labels: the iXBRL concept names already give the facts a standard name; propose where diya-gl should carry further labels (XBRL GL and taxonomy labels, plain English names, Welsh) and where they live. Output: the plan, with each gap, the change, its tests (property-based where an invariant applies, for example debits equal credits for any book the engine writes), and one task per change with its brief, model and size; then `/plan-review-loop` and `/refine` board the tasks. A change to the published schema states its version and its migration for books already saved.

(Board row GLS1, source: operator, 2026-11-22.)

## Goals

1. Each construct in the assertions is present in diya-gl code, or the plan names the task that adds it.
2. A reviewer can trace every figure on a filed VAT return, profit and loss account, balance sheet and iXBRL fact back to the lines, through a trial balance built from those lines.
3. No book a customer has already saved stops opening, and no figure on such a book changes, without a warning first and an operator decision.

## Rules of this plan

- **Report before reject.** A new rule ships first as a book-checks warning. A warning never blocks a save (`app/lib/book-checks.js:8-9`). A rule moves into the validator only in a later task. The validator throws on load (`app/lib/diya-gl-interchange.js:377-380`), so a rule there can stop a saved book opening.
- **Company books carry double entry.** Companies Act 2006 s386 applies to companies. Basic Sole Trader, Taxi Driver and Self Employed books are cash-basis single-entry records (`app/products/se/checks/index.js:111`). The double-entry rules in this plan apply to books whose `diya-gl:product` is `Company`. A shared rule that also fits a sole trader (currency, posting status, period lock) applies to all products.
- **The engine matches the workbook.** The Ltd calculator reproduces the workbook's formulas (`app/lib/diya-gl-calculator.js:4-8`). A change that would make a figure part from the workbook follows the spreadsheets repository's reconciliation-bug method (its `CLAUDE.md`): assert the sheet's behaviour as it is and add a warning that carries the true figure, unless the operator decides otherwise (section 7).
- **Every check is breakable.** A new check or warning has a test that corrupts one input and asserts the exact set of results that flip.
- **Schema change is v3, read beside v2.** Both schemas are closed (`additionalProperties: false` on the book root `book:9`, on `accountDefinition` `book:1094` and on the line `lines:9`), so an older reader rejects any new field. New fields go into new `-v3` schema files. The engine reads v2 and v3. It writes v3 only after Submit's pinned engine reads v3 (GLS10 before GLS11).
- **Submit pins the engine.** Submit depends on `@diy-accounting-uk/diya-gl` `1.2.94` (`package.json:408`) and builds `web/public/lib/books-bundle.js` with `npm run bundle:books`. A Submit task that uses a new engine export bumps the pin and rebuilds the bundle.

## 1. Sources

| Standard | Source | Read for |
| --- | --- | --- |
| XBRL GL 2015 framework | http://www.xbrl.org/int/gl/2015-03-25/gl-framework-REC-2015-03-25.html | Modules; SRCD links detail to summary reporting; `entriesType` mandatory |
| XBRL GL enumerations | https://xbrl.org/GLWGNotes/XBRL-GL-WGN-Elaborating_on_Enumerations-2008-01-29.htm | `postingStatus`, `entryType`, `mainAccountType`, `accountType`, `debitCreditCode`, `entriesType` values |
| XBRL GL labels | https://xbrl.org/int/gl/2015-06-10/xbrl-gl-multi-language-labels-2015-06-10.html | GL label linkbases per language; Welsh is not one |
| FRS 102 | https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/uk-accounting-standards/frs-102/ | September 2024 edition; Section 1A Small Entities |
| FRS 105 | https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/uk-accounting-standards/frs-105/ | September 2024 edition; Periodic Review 2024 effective 1 January 2026 |
| FRC taxonomies 2026 | https://www.frc.org.uk/library/standards-codes-policy/accounting-and-reporting/frc-taxonomies/current-uk-and-irish-digital-reporting-taxonomies/2026-uk-and-irish-digital-reporting-taxonomies/ | Labels in English and Welsh; suite download |
| VAT Notice 700/22 | https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat | Records per supply (3.3.2, 3.3.3); VAT account (3.3.5); adjustments (3.4); digital links (3.2.1 as fetched) |
| Companies Act 2006 s386 | https://www.legislation.gov.uk/ukpga/2006/46/section/386 | Adequate accounting records |
| ISA (UK) 240 | https://media.frc.org.uk/documents/ISA_UK_240_Revised_May_2021_Updated_September_2025.pdf | Para 33(a) journal entry tests; A44 characteristics of inappropriate entries |

Read from source:

- **s386(2)**: records "sufficient (a) to show and explain the company's transactions, (b) to disclose with reasonable accuracy, at any time, the financial position of the company at that time, and (c) to enable the directors to ensure that any accounts required to be prepared comply". s386(3) asks for day-to-day entries of money received and spent, and a record of assets and liabilities. s386(4) asks for stock statements at each year end.
- **ISA (UK) 240 para 33(a)**: the auditor tests "manual or automated journal entries recorded in the general ledger and other adjustments", selects "journal entries and other adjustments made at the end of a reporting period and post-closing entries", and considers testing them "throughout the period". **A44** lists entries "(a) made to unrelated, unusual, or seldom-used accounts, (b) made by individuals who typically do not make journal entries, (c) recorded at the end of the period or as post-closing entries that have little or no explanation or description, (d) ... that do not have account numbers, or (e) containing round numbers or consistent ending numbers." An auditor can run these tests only when each entry carries its account, its author, its date entered and a description.
- **VAT Notice 700/22**: for each supply made, keep the time of supply, the value excluding VAT and the rate of VAT, with outputs split between standard, reduced, zero, exempt and outside-scope (3.3.2). For each supply received, keep the time of supply, the value and the input tax claimed (3.3.3). The VAT account holds output tax, input tax, reverse charge tax and each type of adjustment as a separate line (3.3.5). Errors are corrected by method 1 or method 2 of Notice 700/45 (3.4.1). Copy and paste is not a digital link (3.2.1 as fetched).
- **XBRL GL enumerations** (2008 note): `postingStatus` deferred, posted, proposed, simulated, tax, unposted, cancelled, other. `entryType` adjusting, budget, comparative, external-accountant, standard, passed-adjusting, eliminating, proposed, recurring, reclassifying, simulated, tax, other. `mainAccountType` asset, liability, equity, income, gain, expense, loss, contr-to-equity, distr-from-equity, comprehensive-income, other. `accountType` account, bank, employee, customer, job, vendor, measurable, statistical, other ("account" is "one of the accounts of the trial balance"). `entriesType` "journal" is "a self-balancing (Dr = Cr) list of entries for a specific period"; "trialbalance" is "the self-balancing (Dr = Cr) result of accumulation".
- **FRC 2026 suite**: the label columns show "human-readable labels of the elements in the English and Welsh languages".

Not confirmed:

- Whether the 2015 GL taxonomy keeps the 2008 note's enumerations unchanged. The note is from 2008; the 2015 content schema at the expected URL returned 404.
- The XBRL GL elements for a reversing entry (`gl-cor:reverse`, `gl-cor:reversingDate`), for the person responsible (`gl-cor:entryResponsiblePerson`) and the SRCD element that names a summary concept (`summaryReportingElement`). No page read states them. The plan uses `diya-gl:` names for these fields until a task reads the taxonomy files.
- HMRC's rounding rule for boxes 6 to 9 (whole pounds by rounding or by truncation).
- That boxes 2, 8 and 9 apply only to Northern Ireland goods movements with the EU.
- How HMRC wants a reverse charge purchase shown across boxes 1, 4, 6 and 7. GLS16 reads the HMRC page first.
- ISA (UK) 240's paragraph numbering after any revision later than the September 2025 update read here.

## 2. Where it stands

Paths are in `spreadsheets.diyaccounting.co.uk` unless they start `submit:`. `lines` is `web/spreadsheets.diyaccounting.co.uk/public/schema/diya-gl-lines-v2.schema.json`; `book` is `.../diya-gl-book-v2.schema.json` beside it. An identical copy of both sits under `web/diya-gl.co.uk/public/schema/` (`diff -q` is empty).

### 2.1 Assessment

| # | Construct | What diya-gl has | Gap |
| --- | --- | --- | --- |
| A1 | Double entry at validation | D/C code required on journal lines only (`lines:10-18`); no balance rule in `app/lib/diya-gl-schema.js` | No rule that an entry balances; daybook contra legs are implicit |
| A2 | Typed chart, FRS mapping | Accounts grouped by table (`book:275-343`); `accountType` is GL's account/bank/customer list (`book:1100-1104`); class by code prefix (`app/lib/diya-gl-roll-forward.js:272-277`) | No account class field; no outbound account-to-concept map |
| A3 | Trial balance from lines, by period | Ltd only: the workbook's TrialBalance rebuilt by row (`app/lib/calculators/ltd.js:1580`), audit row EJ91 (`:926`) | Built from aggregates by code letter, not by account; one closing column and monthly P&L rows only; none for other products |
| A4 | Opening, close, roll forward | Opening journal read (`app/lib/scenario-extractor.js:215-283`); close by formula (`calculators/ltd.js:924`); roll forward with its own check (`diya-gl-roll-forward.js:325-375`, `:672`) | Retained earnings brought forward is the balancing figure (`diya-gl-roll-forward.js:371-372`) |
| A5 | Control accounts | Ltd ties for debtors, creditors, VAT, PAYE, CIS, CT, dividends, fixed assets, bank (`app/products/ltd/checks/ledgers.js:62-318`, `checks/index.js:231`) | No bank statement balance to reconcile to; long-term debtors on no published line |
| A6 | Journals with reason and author | `enteredBy`, `enteredDate`, `detailComment` exist (`lines:34-42`, `:98-101`) | Nothing writes or reads them; in-year journals reach no report; no journal edit |
| A7 | Audit trail, reversal, `postingStatus` | `postingStatus` posted/draft/voided (`lines:106-110`); page undo stack (`web/diya-gl.co.uk/public/edits.js:251-275`) | No code reads `postingStatus`; edits change and delete in place (`app/lib/diya-gl-edits.js:153`, `:176`) |
| A8 | Period lock after a filing | none | No filings register, no lock |
| A9 | Nine VAT boxes from lines | Ltd boxes from the engine's Vatinterface with lines attributed and reconciled (`app/lib/derivations/vat-return.js:129-136`, `:191-199`) | One 20% rate on every line; `taxCode`, `taxRate`, `taxAmount` not read (`:233-236`); boxes 2, 8, 9 fixed at nil |
| A10 | Rounding and currency | Whole-pence check (`book-checks.js:219`); half-up rounding (`book-checks.js:38-43`); `amountCurrency` (`lines:74-79`) | Engine checks pass within £1 (`app/products/ltd/checks/index.js:19`); no code reads `amountCurrency` |
| A11 | Trial balance to statements and iXBRL | PubBalSht and P&L built from TB rows (`calculators/ltd.js:1849-1885`); Submit maps cells to lines (`submit:app/services/microEntityAccountsFromResults.js:42-65`) and lines to concepts (`submit:app/services/accountsIxbrlCommon.js:56`) | The chain runs through cell addresses in two repositories; no account-to-concept table; inbound only (`app/lib/ixbrl-accounts.js:52`) |
| A12 | Ties | EJ91 = 0, net assets = shareholders' funds, opening checks (`checks/index.js:52-71`); roll pairs (`diya-gl-roll-forward.js:571-600`) | No retained-earnings movement check; no tie of VAT control to returns filed |
| A13 | Labels | Account names in the book (`accountMainDescription`); fixed descriptions (`diya-gl-roll-forward.js:244-270`); GL names in schema descriptions; Welsh accounts in Submit (`submit:app/services/accountsIxbrlCommon.js:1234-1238`) | No concept labels file; no Welsh on diya-gl.co.uk (grep of `web/diya-gl.co.uk/public` for welsh/cymraeg/"cy" is empty) |

### 2.2 Notes keyed by row

**A1.** A daybook line (sales, purchases, bank, payroll) is one-sided: its contra legs exist only in the workbook formulas the calculator reproduces. A journal line carries a D/C code. `entryNumber` names each line, not each entry: every example book has unique `entryNumber`s, and the opening journal of a rolled book numbers each line `OB-0001`, `OB-0002` (`diya-gl-roll-forward.js:288-300`). Lines of one journal entry share `documentReference` (`OB-001`, `JNL-001` in `examples/precision-code-ltd/lines.jsonl`). XBRL GL uses `entryNumber` for the entry and `lineNumber` for the line. Command: `grep -n -i -E 'debit|credit|balanc' app/lib/diya-gl-schema.js` finds nothing. The docs state the rule (`web/spreadsheets.diyaccounting.co.uk/public/schema/diya-gl-docs.md:275`, "Debits must equal Credits") that no code enforces. Measured on the examples: each journal grouped by `documentReference` balances (precision-code-ltd OB-001 18 lines and JNL-001 2 lines; brickwork-pro OB-001 7 lines; D − C = 0.00 each). EJ91 (`app/products/ltd/checks/index.js:52`) proves the whole Ltd book balances after the workbook logic. It does not prove one entry balances. The duplicate warning already reads a D/C pair as two legs (`book-checks.js:362-368`), and the transfer warning finds a one-sided transfer (`app/lib/book-checks/ltd.js:300`).

**A2.** `chartGroupOf` gives bank, assets, liabilities or capital from the code's first digit (`diya-gl-roll-forward.js:272-277`). The normal side of each balance sheet account is in `OPENING_BALANCE_LINES` (`scenario-extractor.js:215-235`). Income and expense accounts are typed only by sitting in `accounts.sales` or `accounts.purchases`. The inbound table `MAPPING_TABLE` (`ixbrl-accounts.js:52`) maps FRS concepts to account codes when a filed iXBRL file becomes a book. No outbound table maps an account to the concept it feeds. The Ltd chart maps loan interest 5803 to the legal and professional column (`scenario-extractor.js:49`), so loan interest reaches administrative expenses and not interest payable.

**A3.** `buildTrialBalance` fills cells D6 to D44 from the opening balance (`calculators/ltd.js:1606-1640`), then the journals, banks and payroll by code letter, with twelve monthly figures for each income and expense row. `results.TrialBalance` holds the cells the reports read (`:929`). A query by account code (`app/lib/book-queries.js:212`, `chartOfAccounts`) totals signed lines per account with no contra legs, so it is not a trial balance. No trial balance exists at a date inside the year or for a VAT quarter. Basic Sole Trader, Taxi Driver and Self Employed build none.

**A4.** The opening journal is the `journal` lines whose `documentReference` starts `OB-` (`scenario-extractor.js:238`). The engine checks the opening balance sheet (E37) and the opening TB column (D91) balance (`checks/index.js:70-71`). The close is the workbook's: revenue reserve EJ43 = brought forward − profit for the year (`calculators/ltd.js:924`). No closing entry is written to the lines; normal for a workbook. The roll forward writes the closing balances as the next opening journal and puts the difference on 3100 (`diya-gl-roll-forward.js:371-372`). `ltdPairs` then checks the rolled opening reserve against prior shareholders' funds less share capital and reserves (`:590-593`). That check reads two figures the same engine made from the same lines. It catches a roll defect but not a wrong close.

**A5.** Ltd control ties (each a `checkCompliance` check, shown on the books page by `web/diya-gl.co.uk/public/data.js:445`): trade creditors (`ledgers.js:62`), PAYE (`:79`), VAT creditor = opening + output − input − RV payments (`:105`), CIS (`:124`), corporation tax (`:137`), fixed assets additions and disposals against the journals (`:150-184`), cash at bank (`:318`), trade debtors (`checks/index.js:231`), dividends creditor (`app/products/ltd/checks/company-registers.js:240`). These checks compare engine figures with figures derived from the same lines, so an edit moves both sides (`web/diya-gl.co.uk/public/edits.js:23-27`). The book holds no bank statement balance: `grep -n -i -E 'statementBalance|statement balance|closingBalance'` over both schemas is empty. The published balance sheet has no line for long-term debtors (TB row 37): `buildPublishedBalanceSheet` reads rows 6 to 35 and 39 to 44 (`calculators/ltd.js:1849-1885`), and Submit refuses the imbalance this causes (`submit:app/services/microEntityAccountsFromResults.js:47-51`). The directors' loan account sits in creditors due after more than one year (`calculators/ltd.js:1868`, F31 = E29 + E30).

**A6.** `grep -rn -E 'postingStatus|enteredBy|enteredDate' app/lib app/products app/bin` is empty, outside the schema. The edits add sales, purchases, bank and payroll lines; there is no `addJournalLine` (`grep -n '^export function' app/lib/diya-gl-edits.js`). A journal line not prefixed `OB-` reaches no report: `grep -rn -E '!isOpeningBalanceLine|sourceJournalID === .journal.' app/lib app/products` finds only the opening-line test (`scenario-extractor.js:239`), and the Ltd calculator reads `scenario.sales`, `purchases`, `bank`, `payroll`, `opening_balance` and the registers, with no journal key. In precision-code-ltd, JNL-001 (a stock adjustment) duplicates `book.stock`, which is where stock reaches the report.

**A7.** `postingStatus` is in no code path, so a `voided` or `draft` line counts in every total. Its enum differs from GL's (GL has proposed, unposted, cancelled; diya-gl has draft, voided). `changeLineAmount` rewrites a line; `removeLine` deletes every line with the entry number (`diya-gl-edits.js:176-186`). The undo stack holds 50 steps in the page's memory and is lost on reload (`edits.js:256`). No edit stamps who or when.

**A8.** `grep -n -i -E 'lock|filed|approv' book` finds only `diya-gl:companiesHouseName`'s description. Submit stores VAT and accounts receipts, but no path brings a filing back to the book. The handoff to Submit is one-way, in the URL fragment (`web/diya-gl.co.uk/public/submit-handoff.js:5-13`). That handoff is a digital link in Notice 700/22's sense: no copy and paste.

**A9.** `deriveVatReturn` reads the quarter from the engine and attributes each sales and purchases line to boxes 1, 4, 6 and 7, then throws when the attributed lines and the engine part by more than half a penny (`vat-return.js:129-136`). The rate is the constant `VAT_RATE = 0.2` (`app/lib/calculators/ltd.js:65`) for every line. Its own note says the lines' `taxCode` and `taxRate` are not read (`vat-return.js:233-236`). A zero-rated, exempt or outside-scope sale therefore gets 20% VAT taken out of it, which breaks 3.3.2's split by rate. Boxes 2, 8 and 9 are fixed at 0 (`:192`, `:198-199`). Only Ltd books answer a VAT return.

**A10.** Amounts are JavaScript numbers in pounds. Queries convert to pence (`book-queries.js:53-57`). `checkCompliance` passes a check within £1 unless a call states a tolerance (`checks/index.js:19`), and EJ91 uses that default (`:52`). The VAT return rounds boxes 1 to 5 to the penny and boxes 6 to 9 to whole pounds (`vat-return.js:45-51`). `grep -rn -E 'amountCurrency|defaultCurrency' app/lib app/products` finds only two writers of `defaultCurrency: "GBP"` (`diya-gl-new-book.js:186`, `xlsx-exporter.js:2752`). A line with `amountCurrency: "EUR"` is valid and is added as pounds.

**A11.** The path from a book to a filed micro-entity fact is: lines → scenario → `buildTrialBalance` cells → `buildPublishedBalanceSheet` cells (F6, E13, E20, F31, F33, F36, F39) → Submit's `linesFromPublishedBalanceSheet` (`submit:.../microEntityAccountsFromResults.js:42-65`) → `CONCEPTS` (`submit:.../accountsIxbrlCommon.js:56`). The small company path is `submit:app/services/smallCompanyAccountsFromResults.js:287`. Submit re-derives the profit and loss reserve as shareholders' funds less share capital (`microEntityAccountsFromResults.js:62`). Each step is tested in its own repository; nothing ties a filed fact to the accounts that feed it.

**A13.** Today's label sources: the customer's `accountMainDescription`; English constants in code (`diya-gl-roll-forward.js:244-270`, check labels in `book-checks.js`); the GL name in each schema field's description; the reconciliation cell map (`app/products/ltd/cell-map.js`). The FRC suite carries English and Welsh labels for every concept. XBRL GL's label linkbases cover English, Japanese and seven other languages, not Welsh.

## 3. Changes

Each change names its tests and whether a saved book can fail to open or show a different figure after it.

### 3.1 A property-test harness (GLS2)

Add `fast-check` as a dev dependency and a generator of valid Company books, built through the engine's own writers (`buildNewBook`, the edits, `rollForward`, `buildIxbrlSummaryBooks`). First properties: every book the engine writes passes `validateBook` and `validateLines`; every journal entry it writes (journal lines grouped by `documentReference`) balances. Saved book: no effect.

### 3.2 Posting rules and a trial balance from the lines (GLS3, GLS4)

A table, `app/lib/posting-rules.js`, states for each line kind the balanced postings it stands for: a sales line debits debtors 1300 with the gross and credits its income account with the net and VAT 2200 with the VAT; a bank line debits or credits its bank account and posts the contra to the account its `diya-gl:bankCode` names (DR 1300, CR 2100, RV 2200, RP 2400, RT 2300, RC 2410, DL 2500, W 2150, DV 3200, LDR 1400, LCR 2600, the transfer letters to a transfer clearing account that feeds TB row 26 and nets to nil when both legs are in the book, `intraTransfers`, `calculators/ltd.js:1749-1760`); a payroll line posts gross, deductions and net; an opening journal line (`OB-`) posts itself. The table also states the year-end postings the calculator takes from the book's registers, not from lines: stock movements, depreciation and disposals from the asset schedule, hire purchase, dividends declared, the share issue, the interest gross-up and the corporation tax charge (`buildTrialBalance` inputs `stock`, `blocks`, `hp`, `dividendDeclared`, `shareIssue`, `calculators/ltd.js:1580-1600`, `:1651-1738`). Each such posting names its register. An in-year journal line (not `OB-`) reaches no calculator row today (A6), so the trial balance lists it apart and does not total it; `book-journal-reaches-no-report` warns on it (GLS5). Without these two rules the tie below fails: precision-code-ltd's JNL-001 repeats the stock register (`examples/precision-code-ltd/book.toml` `[stock]`). The rules come from the TrialBalance formulas in the template XML, by the reconciliation-bug method, never from this paragraph. `postingsOf(book, line)` expands one line. `trialBalance(book, lines, { from, to })` in `app/lib/book-queries.js` sums the postings by account, debit and credit columns, for any date range: the year, a month or a VAT quarter.

Tests: property, for any generated book, the postings of each line balance and the trial balance's debits equal its credits. Tie, for every Ltd example and fixture, the closing balances of the accounts that feed each calculator TrialBalance row sum to that row (a stated account-to-row map; several accounts can feed one row, for example 5800 and 5803 both feed legal and professional, `scenario-extractor.js:46-49`), to the penny. The trial balance stands before the close (A4), so rows 43 and 49 tie together to 3100 (EJ43 + EJ49 = D43, `calculators/ltd.js:924-925`). `results.TrialBalance` holds only the cells in `TRIAL_BALANCE_READS` (`calculators/ltd.js:253-303`, `:1764-1766`), so the tie reads the full `tb` object that `buildTrialBalance` returns, after the tax charge and the close set rows 35, 43, 47 and 49 on it (`:918-926`), exposed without a change to any figure. Breakability: change one bank code and assert the two accounts that move. Saved book: no effect (a query). GLS4 adds the view on the books page and a diya-gl MCP tool.

### 3.3 Report-only warnings (GLS5)

New warnings in `app/lib/book-checks.js` (shared) and `app/lib/book-checks/ltd.js`, each with offenders and a consequence line:

| Id | Warns when | Construct |
| --- | --- | --- |
| `book-journal-balances` | a Company journal entry (journal lines sharing `documentReference`) has debits ≠ credits | A1 |
| `book-journal-has-reason` | a journal line has no `detailComment` and no `lineItemComment` | A6, ISA 240 A44(c) |
| `book-journal-reaches-no-report` | a Company journal line not prefixed `OB-` (the engine totals it nowhere) | A6 |
| `book-posting-status-counted` | a line's `postingStatus` is not `posted` (it is still totalled) | A7 |
| `book-currency-not-gbp` | a line's `amountCurrency` is set and is not GBP (it is added as pounds) | A10 |
| `book-ltd-vat-code-not-applied` | a VAT-registered Company book has a sales or purchases line whose `taxCode` is not S or whose `taxRate` is set and not 0.2 | A9 |
| `book-ltd-long-term-debtors-unpublished` | closing long-term debtors (TB row 37) are not nil; the warning carries the figure the published sheet leaves out | A5 |
| `book-ltd-directors-loan-always-long-term` | the closing directors' loan account is not nil; the published sheet shows it in creditors due after more than one year whatever its terms (`calculators/ltd.js:1868`); the warning carries the figure | A5 |
| `book-ltd-loan-interest-in-administrative-expenses` | a line is coded 5803 loan interest; the published profit and loss shows it in administrative expenses and not in interest payable (`scenario-extractor.js:49`); the warning carries the total | A2 |

Tests: one per warning, breakable. Saved book: no effect; warnings never block (`book-checks.js:8-9`).

### 3.4 Account classes and the concept map (GLS6)

`app/lib/account-classes.js`: for every account any product's chart declares, its class (asset, liability, equity, income, expense, using GL's `mainAccountType` words), its normal side, and for Company accounts the FRS 102 concept and the FRS 105 line it feeds. It replaces `chartGroupOf` and `NORMAL_SIDE_OF_ACCOUNT` in the roll forward and builds from `OPENING_BALANCE_LINES`, the code maps and `MAPPING_TABLE` (one source, no second copy). `chartOfAccounts` returns the class and concept. Tests: every declared account has a class (property over the product charts); the inbound `MAPPING_TABLE` and the outbound map agree for every account both name; a book built from an iXBRL file and read back maps each concept to the same account. Saved book: no effect.

### 3.5 Statement ties and named facts (GLS7, GLS8)

`accountsFacts(results)` returns the FRS 105 and FRS 102 Section 1A lines by concept name, from the published sheets, with Submit's presentation rules moved in so that Submit's figures do not change (GLS8). New checks in `app/products/ltd/checks/`, at a penny's tolerance: each `accountsFacts` asset, liability and share capital line equals the sum of the GLS3 trial balance accounts of its class and concept (the trial balance stands before the close, so the profit and loss reserve is the third check's, and the totals follow from the lines); the profit for the year equals income less expense from the GLS3 trial balance; revenue reserve closing = opening + profit after tax − dividends declared, from inputs the engine did not derive from the same cell; the roll forward's 3100 plug equals that closing reserve (a pair added to `rollForwardChecks`). An account whose balance changes side maps by the presentation rule: an overdrawn set of statement accounts is a creditor (the engine's sheet, `calculators/ltd.js:1857-1867`), and an overdrawn directors' loan is a current asset (Submit's rule today, `submit:app/services/microEntityAccountsFromResults.js:53-54`; the engine's PubBalSht leaves it a negative creditor, `calculators/ltd.js:1868`, so the tie is to `accountsFacts`, not to PubBalSht cells). Submit then reads `accountsFacts` in place of PubBalSht cell addresses (GLS8). Saved book: no change to any figure; a new check can show red on a book whose figures were already inconsistent.

### 3.6 Schema v3 (GLS9, GLS10, GLS11)

New files `diya-gl-book-v3.schema.json` and `diya-gl-lines-v3.schema.json` (`$id` `https://spreadsheets.diyaccounting.co.uk/schema/diya-gl-<book|lines>-v3.schema.json`), in both schema folders. Format marker `diya-gl/3` (`app/lib/provenance-data.js:14`).

| Where | Field | Values |
| --- | --- | --- |
| `accountDefinition` | `diya-gl:accountClass` | asset, liability, equity, income, expense |
| `accountDefinition` | `diya-gl:summaryConcept` | FRC concept local name |
| `accountDefinition` | `diya-gl:labels` | `{ cy: string }` |
| book root | `diya-gl:filings` | `[{ kind: vat \| accounts \| ct600, periodStart, periodEnd, filedDate, reference, figures }]` |
| book root | `diya-gl:statementBalances` | `{ <bank account>: [{ date, balance }] }` |
| line | `diya-gl:reversesEntry` | the `entryNumber` this line reverses |
| line | `entryType` | GL values used here: standard, adjusting, recurring, reclassifying, other |
| line | `postingStatus` | posted, proposed, cancelled (GL words); v2's draft reads as proposed, voided as cancelled |

Validation (GLS9): each book is validated against the schema of its own `diya-gl:formatVersion`: a `diya-gl/3` book against v3, and any other book against v2. Older engines wrote `diya-gl/1`, `diya-gl/2` and `diya-gl-books/1` (`app/data/releases.json:6`), and some books carry no marker. GLS9 changes no book in memory, so a v2 book still saves as valid v2. Today the validator, the canonical writer and Submit's bundle each take only the v2 pair (`app/lib/diya-gl-schema.js:36-110`, `app/lib/diya-gl-canonical.js:39-75`, `app/lib/app-resources.js:164-165`, `scripts/build-diya-gl-bundle.mjs:77`, `:145-150`, `:354`, `:389-401`, `scripts/build-runner.mjs:304`, `submit:scripts/build-books-bundle.mjs:34-35`, `:170-178`, `:206-209`, `:252-260`); each takes both pairs. The two bundles' `Ajv2020` stubs return a precompiled validator by schema `$id` and throw on any other, so a page or Submit bundle without the v3 ids fails on the first v3 schema.

Migration (GLS11): from GLS11 a v2 book becomes v3 on load. Its classes and concepts come from the GLS6 table, `filings` and `statementBalances` are empty, and `postingStatus` maps as above. `app/lib/share-nominal.js:5-11` is the precedent: a book that predates a format reads with the default. The engine writes v3 only from GLS11, after Submit's pinned engine reads it (GLS10). Tests: every v2 example loads with unchanged figures; a v3 book written and read back is byte-identical to the canonical form; the standalone validator build (`scripts/build-diya-gl-bundle.mjs`) covers both versions. Saved book: none fails (v2 still accepted); an older engine rejects a v3 book.

### 3.7 Audit stamps and corrections by reversal (GLS12)

Every edit that adds or changes a line sets `enteredDate` to today and `enteredBy` to the author the caller passes (section 7, D3). A new edit `addJournalEntry` takes balanced lines, a reason and an `entryType`, and refuses an unbalanced entry or one with no reason. A new edit `reverseEntry` adds the mirror lines with `diya-gl:reversesEntry` and a reason. Each mirror line sits in the reversed line's own journal with the opposite sign the engine reads: a credit note for a sales or purchases line (`signedAmount`, `scenario-extractor.js:548-550`), the other D/C code for a bank or journal line. Amounts stay positive (`lines:69-72`). So the reports and the GLS3 trial balance both move back. It throws, naming the line, for an opening (`OB-`) line, for a sales line on 4005 (the engine reads a credit note there as a bad debt, `scenario-extractor.js:552-556`), for a bank line whose code the opposite block does not analyse (only DR and CR move to the other block as refunds; any other code lands unanalysed, `ltdBankPlacement`, `app/lib/ltd-layout.js:147-155`), and for a line kind with no opposite form. An `addJournalEntry` entry dated in the year reaches no report today, as any in-year journal (A6); GLS5's warning names it. Tests: property, for any generated book, `reverseEntry` on any daybook entry it does not refuse returns each account in the trial balance, and each report figure, to its value before the reversed entry; stamps are set. Saved book: opens as before. The lock on filed periods needs the filings register, so it is in GLS13.

### 3.8 Filings register, period lock and the filed-return tie (GLS13, GLS14, GLS15)

`diya-gl:filings` records each filing. A VAT filing locks the lines whose VAT period it covers; an accounts filing locks the year. Per D2 (a), a locked line cannot be changed or removed; the page offers `reverseEntry` and a replacement entry dated in the open period. Two new warnings:

- `book-vat-filed-return-changed` re-derives each filed VAT return and warns when a box no longer equals the filed figure.
- `book-vat-control-differs-from-filed` ties the VAT control account to the returns filed. At the end of the latest filed VAT period, the GLS3 trial balance's 2200 balance must equal the opening 2200 balance, plus box 5 of each filed return, less the net RV bank movements to that date, within one penny per filed return (boxes 3 and 4 round to the penny, `vat-return.js:45-47`, `:191-195`). It runs only when the book's start is the first day of a VAT quarter and filings with box figures cover every quarter from the book's start to that date. A quarter that begins before the book's start holds VAT already in the opening balance, and would show red on a correct book. Today's nearest check compares engine figures with each other (`app/products/ltd/checks/ledgers.js:105`).

The books page records a filing when the customer returns from Submit with the receipt in the URL fragment, and records a filing made elsewhere from a form (GLS14, D4 (c)); Submit's receipt pages give that link (GLS15). Saved book: a v2 book has no filings, so nothing locks until the customer records one.

### 3.9 VAT boxes from each line's tax code (GLS16)

`deriveVatReturn` takes each line's VAT from its `taxCode` and `taxRate`: S at the book's standard rate, R at the reduced rate, Z, E and OS with no VAT, RC per HMRC's reverse charge rule (read from HMRC first). Box 6 and box 7 take each line's net, with the exclusions of VAT Notice 700/12 sections 3.7 and 3.8 (box 7 leaves out expenditure outside the scope of VAT because it is not consideration for a supply, and wages, PAYE and rates). The reconcile against the workbook's Vatinterface stays for books whose lines are all S at the standard rate; for any other book, the derivation states the difference from the workbook in `notes`. Tests: a property that a book of only S lines gives today's boxes exactly; a book with one Z sale and one E purchase gives the hand-computed boxes. Saved book: opens; a book with non-S lines shows different boxes 1 and 3 to 7 than today. The precision-code-ltd example is one: it has 22 purchases lines coded OS or E and one sales line coded OS (`examples/precision-code-ltd/lines.jsonl`). Section 7, D5.

### 3.10 Validation that rejects (GLS17, GLS18)

Both tasks follow GLS5's warnings (D8). For books marked `diya-gl/3` only: the validator rejects an unbalanced journal entry in a Company book and a non-GBP `amountCurrency` (GLS17). GLS5 warns on both first. The engine leaves lines whose `postingStatus` is not `posted` out of every total (GLS18). Saved book: a v2 book still opens; a v3 book the engine wrote cannot fail (GLS2's property); a hand-edited v3 book can fail. GLS18 changes the figures of a book that carries non-posted lines. The engine writes no `postingStatus` today and no example carries one (`grep -c postingStatus examples/*/lines.jsonl` is 0 for each).

### 3.11 Labels (GLS19)

Labels live in three places:

- **Concept labels**: `app/data/frc-concept-labels.json`, generated by a script from the FRC suite zip's label linkbases, English and Welsh, keyed by concept local name. Submit's Welsh accounts and the books page read it.
- **Account labels**: the customer's `accountMainDescription` stays the English name; v3's `diya-gl:labels.cy` holds a Welsh name; the standard charts' Welsh names live in `account-classes.js` beside the class.
- **GL names**: the schema descriptions keep the `gl-cor:` name per field. A test checks each `gl-cor:` name in a description is in the GL enumeration note's or framework's list, or is marked `diya-gl:`.

Saved book: no effect.

### 3.12 Bank statement reconciliation (GLS20)

A warning `book-bank-statement-differs` compares each `diya-gl:statementBalances` entry with the bank account's balance at that date from the GLS3 trial balance. Saved book: no effect (a v2 book has no statement balances).

## 4. Order and what can fail

| Phase | Tasks | A saved book can fail to open | A figure can change |
| --- | --- | --- | --- |
| Report | GLS2 to GLS8 | no | no |
| v3 read | GLS9, GLS10 | no | no |
| v3 write and audit | GLS11 to GLS15, GLS19, GLS20 | no | no; edits in a filed period are refused |
| Figures | GLS16 | no | yes, books with non-S lines |
| Reject | GLS17, GLS18 | v3 books edited by hand | GLS18: books with non-posted lines |

## 5. Shared facts for every spreadsheets task

- Read `../spreadsheets.diyaccounting.co.uk/CLAUDE.md` sections Testing and Reconciliation-bug method before starting.
- Gates: `npm test` (the router) and nothing narrower in a brief; a check or warning has its breakability test.
- Pull before committing: `update.yml` and `publish-diya-gl.yml` push to main.
- A further change found there that is not in the brief is one plain question to the operator.
- Change nothing in `examples/` by hand; regenerate through `node app/bin/extract-scenarios.js` where a fixture must change.

## 6. Tasks

### 6.1 The task table

| Label | Task | Waits on | Class | Model | Size |
| --- | --- | --- | --- | --- | --- |
| GLS2 | Property-test harness and the first properties | nothing | machine-only | Sonnet | ~4 files |
| GLS3 | Posting rules and the trial balance from the lines | GLS2 | machine-only | Opus | ~5 files |
| GLS4 | Trial balance view on the books page and an MCP tool | GLS3 | machine-only | Sonnet | ~6 files |
| GLS5 | Nine report-only warnings | GLS2 | machine-only | Sonnet | ~5 files |
| GLS6 | Account classes and the account-to-concept map | GLS3 | machine-only | Opus | ~5 files |
| GLS7 | Statement ties and `accountsFacts` | GLS3, GLS6 | machine-only | Sonnet | ~5 files |
| GLS8 | Submit reads `accountsFacts` | GLS7 released to npm | machine-only | Sonnet | ~5 files |
| GLS9 | v3 schemas, read beside v2 | GLS6 | machine-only | Sonnet | ~9 files |
| GLS10 | Submit's pinned engine reads v3 | GLS9 released to npm | machine-only | Sonnet | ~4 files |
| GLS11 | The engine writes v3 | GLS10 | machine-only | Sonnet | ~6 files |
| GLS12 | Audit stamps, journal entries and reversal | GLS11 | machine-only | Sonnet | ~6 files |
| GLS13 | Filings register, period lock, VAT filing warnings | GLS12 | machine-only | Sonnet | ~6 files |
| GLS14 | Books page records a filing from a link | GLS13 | machine-only | Sonnet | ~4 files |
| GLS15 | Submit receipt pages link the filing to the book | GLS14 released | machine-only | Sonnet | ~5 files |
| GLS16 | VAT boxes from each line's tax code | GLS5 | machine-only | Opus | ~4 files |
| GLS17 | v3 validation rejects | GLS5, GLS11, GLS12 | machine-only | Sonnet | ~3 files |
| GLS18 | Non-posted lines leave the totals | GLS5, GLS11 | machine-only | Sonnet | ~4 files |
| GLS19 | Concept and account labels, English and Welsh | GLS6, GLS9 | machine-only | Sonnet | ~5 files |
| GLS20 | Bank statement balances and their warning | GLS3, GLS11 | machine-only | Sonnet | ~3 files |

GLS4, GLS5 and GLS6 can run in parallel after their waits. GLS5 and GLS7 both add to `app/products/ltd/checks/` and `book-checks/ltd.js`; they land one after the other. GLS8 and GLS10 are one Submit pin bump when GLS7 and GLS9 ship in the same release.

### 6.2 Briefs

#### GLS2. Property-test harness and the first properties

- **Repository**: spreadsheets. **Saved book**: no effect.
- **Do**: add `fast-check` to `devDependencies`. Write `app/test/support/book-generators.js`: arbitrary Company books built only through `buildNewBook`, the named edits (`app/lib/diya-gl-edits.js`), `rollForward` and `buildIxbrlSummaryBooks`, with amounts in whole pence. Write `app/test/diya-gl-properties.test.js`: every generated book passes `validateBook` and `validateLines`; journal lines grouped by `documentReference` balance to the penny.
- **Done when**: `npm test` passes; a deliberately unbalanced writer (in the test only) makes the balance property fail with a shrunk counter-example.

#### GLS3. Posting rules and the trial balance from the lines

- **Repository**: spreadsheets. **Saved book**: no effect.
- **Do**: discover each line kind's postings from `Financialaccounts.xlsx` TrialBalance formulas in the Ltd template XML (JSZip) and `app/lib/calculators/ltd.js:1580-1764`. Write `app/lib/posting-rules.js` (the table, `postingsOf` and the register postings of section 3.2; in-year journal lines listed apart, not totalled) and `trialBalance(book, lines, { from, to })` in `app/lib/book-queries.js`; export both from `app/lib/diya-gl-engine.js`. A line kind the table does not know throws, naming the line.
- **Tests**: property (GLS2 generator): each line's postings balance; the trial balance balances for the year, each month and each VAT quarter. Tie: for precision-code-ltd and brickwork-pro, the accounts that feed each TrialBalance row sum to that row via a stated account-to-row map, to the penny; rows 43 and 49 tie together to 3100. The tie reads the full `tb` object from `buildTrialBalance` after the tax charge and the close (`:918-926`), because `results.TrialBalance` holds only the `TRIAL_BALANCE_READS` cells (`calculators/ltd.js:253-303`); expose it without a change to any figure. Breakability: change one bank code; exactly the two accounts it names move.

#### GLS4. Trial balance view on the books page and an MCP tool

- **Repository**: spreadsheets. **Saved book**: no effect.
- **Do**: a Trial balance view on the Company books page (`web/diya-gl.co.uk/public/`), with a period picker (year, month, VAT quarter) and each account's lines on demand; a diya-gl MCP tool `trial_balance` with the same arguments.
- **Done when**: a browser test shows the view's totals equal; the spreadsheets repository's visual definition of done for a new view.

#### GLS5. Nine report-only warnings

- **Repository**: spreadsheets. **Saved book**: no effect.
- **Do**: the nine warnings in section 3.3, in `app/lib/book-checks.js` (shared ones) and `app/lib/book-checks/ltd.js`, each with `tier: "warning"`, offenders and a consequence line. `book-ltd-long-term-debtors-unpublished` computes the closing long-term debtors with `longTermDebtorsClosing` (`app/lib/diya-gl-roll-forward.js:379`, exported for this). `results.TrialBalance` carries no EJ37 (`calculators/ltd.js:253-303`). The clean example for `book-ltd-vat-code-not-applied` is `brickwork-pro/ltd-vat` (all S); precision-code-ltd warns as it stands.
- **Tests**: one test per warning that passes on a clean example and warns on a corrupted copy, with the exact offender set.

#### GLS6. Account classes and the account-to-concept map

- **Repository**: spreadsheets. **Saved book**: no effect.
- **Do**: `app/lib/account-classes.js` per section 3.4. Concepts from the FRC 2026 suite (`https://www.frc.org.uk/documents/8907/FRC-2026-Taxonomy-v1.0.0.zip`), checked against `MAPPING_TABLE` (`app/lib/ixbrl-accounts.js:52`). Replace `chartGroupOf` and `NORMAL_SIDE_OF_ACCOUNT` in `app/lib/diya-gl-roll-forward.js`. Add class and concept to `chartOfAccounts`. State 5803's placement (A2) as found; D7 decides it.
- **Tests**: every account in every product chart has a class; inbound and outbound maps agree; the iXBRL round trip maps each concept to the same account.

#### GLS7. Statement ties and `accountsFacts`

- **Repository**: spreadsheets. **Saved book**: no figure changes; a new check can show red on an inconsistent book.
- **Do**: `accountsFacts(results)` (FRS 105 lines and FRS 102 Section 1A lines by concept name), exported from the engine, carrying the presentation rules of `submit:app/services/microEntityAccountsFromResults.js:42-65` and `submit:app/services/smallCompanyAccountsFromResults.js` so GLS8's expected values hold. The four checks of section 3.5 at a penny's tolerance, in `app/products/ltd/checks/`, with the presentation rule for accounts that change side, and the 3100 pair in `rollForwardChecks`.
- **Tests**: each check passes on every Ltd example and flips alone when one input is corrupted.

#### GLS8. Submit reads `accountsFacts`

- **Repository**: submit. **Saved book**: no effect.
- **Do**: bump `@diy-accounting-uk/diya-gl` to the release carrying GLS7; `npm run bundle:books`; change `app/services/microEntityAccountsFromResults.js` and `app/services/smallCompanyAccountsFromResults.js` to read `accountsFacts`. Keep the refusal of an unbalanced sheet.
- **Tests**: the existing unit tests of both modules pass unchanged in their expected values; the accounts behaviour journey on the simulator lane.

#### GLS9. v3 schemas, read beside v2

- **Repository**: spreadsheets. **Saved book**: none fails; an older engine rejects a v3 book.
- **Do**: the two v3 schema files of section 3.6 in both schema folders. Validation per section 3.6: each book against the schema of its own `diya-gl:formatVersion`, with no change to the book in memory. `useSchemas`, `loadSchemasFrom` and `generateStandaloneValidatorSource` (`app/lib/diya-gl-schema.js:36-110`), the canonical writer's `useSchemas` and `loadSchemasFrom` (`app/lib/diya-gl-canonical.js:39-75`) and the resource names (`app/lib/app-resources.js:164-165`) take the v2 and the v3 pair. The books page bundle (`scripts/build-diya-gl-bundle.mjs`: the schema copy `:77`, the `Ajv2020` stub `:145-150`, the offline URL list `:354`, the standalone validator `:389-401`) and the offline runner (`scripts/build-runner.mjs:304`) carry both pairs; `diya-gl-docs.md` describes v3. The writer still writes v2.
- **Tests**: each v2 example loads with unchanged report figures and saves as valid v2; a v3 book round-trips through the canonical writer.

#### GLS10. Submit's pinned engine reads v3

- **Repository**: submit. **Saved book**: no effect.
- **Do**: bump `@diy-accounting-uk/diya-gl` to the release carrying GLS9 (`package.json:408`). Change `scripts/build-books-bundle.mjs` to hand the v2 and the v3 pair to GLS9's loaders: the schema ids (`:34-35`), the `Ajv2020` stub that picks a validator by `$id` (`:170-178`), the bundle entry's `useSchemas` call (`:206-209`) and the standalone validator source (`:252-260`). Run `npm run bundle:books`, then the books-import and MCP book unit tests and a v3 book read through the bundle.

#### GLS11. The engine writes v3

- **Repository**: spreadsheets. **Saved book**: no effect on load; a book saved again is written as v3.
- **Do**: `scripts/build-provenance-data.mjs` sets `FORMAT_VERSION` to `diya-gl/3` and regenerates `app/lib/provenance-data.js` (generated; not edited by hand); the loader migrates a v2 book to v3 on load per section 3.6; every writer (`buildNewBook`, `rollForward`, `buildIxbrlSummaryBooks`, the exporter, the canonical writer) states class and concept on each account.
- **Tests**: GLS2's properties over v3 books; every v2 example migrates with unchanged figures; the parity gate passes.

#### GLS12. Audit stamps, journal entries and reversal

- **Repository**: spreadsheets. **Saved book**: opens as before.
- **Do**: section 3.7 in `app/lib/diya-gl-edits.js` and the page's edit path (`web/diya-gl.co.uk/public/edits.js`). The author comes from the caller per D3.
- **Tests**: the reversal property; an unbalanced `addJournalEntry` throws; an entry with no reason throws; stamps set on add and change.

#### GLS13. Filings register, period lock, VAT filing warnings

- **Repository**: spreadsheets. **Saved book**: opens; nothing locks until a filing is recorded.
- **Do**: section 3.8's lock in the edits (per D2), the page's offer of `reverseEntry` for a locked line, the two warnings, and an edit `recordFiling`.
- **Tests**: an edit inside a filed VAT period throws and names the filing; `book-vat-filed-return-changed` flips when one locked line's amount is corrupted in a copy; `book-vat-control-differs-from-filed` flips when one filed box 5 is changed by £1.

#### GLS14. Books page records a filing from a link

- **Repository**: spreadsheets. **Saved book**: no effect until the customer accepts.
- **Do**: the books page reads `#filing=<base64url JSON>` (kind, period, filed date, reference, figures), shows it, and calls `recordFiling` when the customer confirms. Mirror the fragment rules of `submit-handoff.js`. A form records a filing made elsewhere (kind, period, filed date, reference and, for a VAT filing, the nine boxes) through the same `recordFiling` (D4 (c)). Both GLS13 warnings read the filed boxes.
- **Tests**: a browser test of accept and decline; a browser test of the form; a fragment whose figures differ from the book's derived figures shows the difference before the customer accepts.

#### GLS15. Submit receipt pages link the filing to the book

- **Repository**: submit. **Saved book**: no effect.
- **Do**: the VAT receipt and the accounts receipt pages give "Record this filing in your books", a link to diya-gl.co.uk with the GLS14 fragment. Welsh text in `i18n/cy.toml` and `npm run build:welsh`.
- **Tests**: a unit test of the fragment; a browser test of the link on both receipts.

#### GLS16. VAT boxes from each line's tax code

- **Repository**: spreadsheets. **Saved book**: opens; boxes change for books with non-S lines.
- **Do**: read HMRC's guidance on reverse charge boxes, on boxes 2, 8 and 9 and on what boxes 6 and 7 leave out (VAT Notice 700/12 sections 3.7 and 3.8) first and cite it in the commit. Then section 3.9 in `app/lib/derivations/vat-return.js`, rates from the book's tax data.
- **Tests**: the all-S property returns today's boxes exactly; the hand-computed mixed book; the diya-gl.co.uk handoff and the Submit MCP `derive_vat_return` path read the new notes.

#### GLS17. v3 validation rejects

- **Repository**: spreadsheets. **Saved book**: a v2 book opens; a hand-edited v3 book can fail.
- **Do**: section 3.10's two rules in `validateLines` and `validateBook`, for `diya-gl/3` books only.
- **Tests**: each rule rejects a corrupted v3 book with a message naming the line or account; every v2 example still loads.

#### GLS18. Non-posted lines leave the totals

- **Repository**: spreadsheets. **Saved book**: opens; figures change for books with non-posted lines.
- **Do**: the loader leaves out lines whose `postingStatus` is present and not `posted` before any total; `book-posting-status-counted` becomes a notice of the lines left out.
- **Tests**: a book with one cancelled sale reports the sale's total less; every example's figures are unchanged.

#### GLS19. Concept and account labels, English and Welsh

- **Repository**: spreadsheets. **Saved book**: no effect.
- **Do**: section 3.11. A script `scripts/build-frc-concept-labels.mjs` reads the FRC suite zip and writes `app/data/frc-concept-labels.json`; the Welsh names of the standard charts in `account-classes.js`; the schema-description test.
- **Tests**: every concept in the outbound map has an English and a Welsh label; the script's output is stable on a second run.

#### GLS20. Bank statement balances and their warning

- **Repository**: spreadsheets. **Saved book**: no effect.
- **Do**: section 3.12, with an edit `setStatementBalance`.
- **Tests**: the warning flips when one statement balance differs by a penny.

## 7. Decisions

Operator, 2026-11-22.

| Id | Decision | Design |
| --- | --- | --- |
| D1 | How new fields reach the schema | v3 schema files read beside v2. v2 is closed, so a field added to it makes every older engine, including Submit's pinned 1.2.94, reject a re-saved book. |
| D2 | When an edit must be a reversal | Only for lines in a filed period. |
| D3 | Who `enteredBy` names | The signed-in name where the page has one, else "books page". |
| D4 | How a filing reaches the book | Both: Submit's receipt links back with the filing in the fragment (GLS14, GLS15), and the customer marks a period filed by hand for filings made elsewhere. |
| D5 | VAT boxes when lines carry other tax codes | Follow each line's code and state the difference from the workbook (GLS16), per VAT Notice 700/22 3.3.2, which asks for value and rate per supply. |
| D6 | Welsh on diya-gl.co.uk | The labels file only, for Submit's Welsh accounts (GLS19). |
| D7 | Workbook classifications an auditor would query | Keep the template for long-term debtors, the directors' loan and loan interest 5803, and warn with the true figure (the last three warnings of section 3.3, in GLS5). |
| D8 | When report-only rules start to reject or change figures (GLS17, GLS18) | After GLS5's warnings have shipped, reject for v3 books and leave non-posted lines out of totals. |
