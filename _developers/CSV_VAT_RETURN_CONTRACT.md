# CSV VAT return contract

A DIY Accounting spreadsheet package computes a VAT return quarter by
quarter. Submit files a VAT return with HMRC. This document is the file
format that carries one from the spreadsheet to Submit without re-keying.

It is a contract between two repositories: `spreadsheets.diyaccounting.co.uk`
(writes the file) and `submit.diyaccounting.co.uk` (reads it). Neither side
owns it. Change it in both repositories together, and keep the fixtures
under `fixtures/vat-return-csv/` as the shared test data both sides run
against.

Submit's reader lives at `app/lib/vatReturnCsv.js`. It has no import
endpoint or UI yet: today it turns a fixture file into the same nine-box
object `app/lib/vatReturnTypes.js` already builds for the HMRC submission
call.

## File shape

- UTF-8 text. A leading byte-order mark is accepted and stripped (common in
  spreadsheet exports); nothing else about the encoding is negotiable.
- Comma-separated, one header row followed by one row per return. Multiple
  rows in one file mean multiple periods (or multiple VRNs) submitted
  together; nothing links rows to each other.
- A field containing a comma, a quote or a newline is wrapped in double
  quotes with `""` as the escaped quote, per RFC 4180. None of this
  contract's columns need it, since none of them are free text.
- LF or CRLF line endings are both accepted.
- The header names below are required, in any order. An unrecognised extra
  column is rejected rather than silently ignored, so a typo in a column
  name fails loudly instead of leaving that box unset.

## Columns

| Column | Type | Required | Example |
|---|---|---|---|
| `vrn` | 9 digits | yes | `193054661` |
| `periodStart` | ISO date `YYYY-MM-DD` | yes | `2025-01-01` |
| `periodEnd` | ISO date `YYYY-MM-DD` | yes | `2025-03-31` |
| `vatDueSales` | decimal, 2 places | yes | `1250.00` |
| `vatDueAcquisitions` | decimal, 2 places | yes | `0.00` |
| `totalVatDue` | decimal, 2 places | yes | `1250.00` |
| `vatReclaimedCurrPeriod` | decimal, 2 places | yes | `320.45` |
| `netVatDue` | decimal, 2 places | yes | `929.55` |
| `totalValueSalesExVAT` | whole number | yes | `15000` |
| `totalValuePurchasesExVAT` | whole number | yes | `8500` |
| `totalValueGoodsSuppliedExVAT` | whole number | yes | `0` |
| `totalAcquisitionsExVAT` | whole number | yes | `0` |
| `finalised` | literal `true` | yes | `true` |

Every value is required on every row. A business that does not trade with
the EU still writes `0` for boxes 2, 8 and 9; there is no way to leave a box
blank, because HMRC has none either.

## Mapping to the nine VAT boxes

| Column | HMRC box | Meaning |
|---|---|---|
| `vatDueSales` | Box 1 | VAT due on sales and other outputs |
| `vatDueAcquisitions` | Box 2 | VAT due on acquisitions from EU member states |
| `totalVatDue` | Box 3 | Total VAT due: Box 1 + Box 2 |
| `vatReclaimedCurrPeriod` | Box 4 | VAT reclaimed on purchases and other inputs |
| `netVatDue` | Box 5 | Net VAT due to HMRC or reclaimed: \|Box 3 − Box 4\| |
| `totalValueSalesExVAT` | Box 6 | Total value of sales excluding VAT |
| `totalValuePurchasesExVAT` | Box 7 | Total value of purchases excluding VAT |
| `totalValueGoodsSuppliedExVAT` | Box 8 | Total value of goods supplied to EU member states |
| `totalAcquisitionsExVAT` | Box 9 | Total value of acquisitions from EU member states |

`vrn` and `finalised` carry the submission's identity and its declaration;
they are not boxes.

## Why the period is two dates, not a period key

HMRC period keys are opaque: a four-character code HMRC assigns per
obligation, not something either repository can compute from a quarter
number or a date. Submit already looks up the period key it needs from
HMRC's obligations endpoint by date range
(`app/lib/obligationFormatter.js`'s `findObligationByDateRange`), the same
way its own VAT return form works. The CSV carries `periodStart` and
`periodEnd` for the same reason: a spreadsheet computing a quarter's figures
knows the quarter's calendar dates, never HMRC's period key for it.

A reader that receives a CSV row with dates matching no open obligation
cannot file it. That is an obligation-lookup failure at submission time, not
a CSV format error, so it is out of this contract's scope.

## Rounding and sign rules HMRC applies

- **Boxes 1-5** are monetary values to the nearest penny (2 decimal places).
  Boxes 1, 2, 3 and 4 can be negative (a credit note total exceeding the
  period's sales or purchases, for example). Box 5 is an absolute
  difference, so it is never negative.
- **Box 3** must equal Box 1 + Box 2, exactly, to 2 decimal places.
- **Box 5** must equal the absolute value of Box 3 − Box 4, exactly, to 2
  decimal places.
- **Boxes 6-9** are whole pounds, no pence. Box 6 and Box 7 can be negative
  in the same way as boxes 1-4; boxes 8 and 9 are usually `0` for a
  GB-only trader.
- The CSV carries every box's final value. The reader checks the box 3 and
  box 5 arithmetic against the other columns; it does not compute or round
  anything itself. A writer that rounds wrong produces a file the reader
  rejects, rather than a file the reader silently corrects.

## What a reader must reject

- A missing required column, or an extra column it does not recognise.
- A duplicate column name in the header row.
- A file with a header row but no return rows.
- A row whose field count does not match the header.
- `vrn` that is not exactly 9 digits.
- `periodStart` or `periodEnd` not in `YYYY-MM-DD` form, or not a real
  calendar date.
- `periodEnd` earlier than `periodStart`.
- A monetary column (boxes 1-5) with anything other than exactly 2 decimal
  places, or a non-numeric value.
- A whole-pound column (boxes 6-9) with a decimal point, or a non-numeric
  value.
- `totalVatDue` not equal to `vatDueSales + vatDueAcquisitions`.
- `netVatDue` not equal to `|totalVatDue - vatReclaimedCurrPeriod|`.
- `netVatDue` negative.
- `finalised` not exactly the literal `true`. HMRC requires a finalised
  declaration to accept a return, so a row that has not declared itself
  finalised cannot be filed and the reader will not guess.

## Fixtures

`fixtures/vat-return-csv/` holds the shared test files, named for what each
one is or tests:

- `valid-quarterly-return.csv`, `valid-negative-adjustment.csv`,
  `valid-multi-period.csv` parse without error.
- `invalid-*.csv` files each isolate one rejection rule above (a missing
  column, an unknown column, a bad date format, box arithmetic that does
  not add up, a negative Box 5, wrong decimal precision, a bad VRN, a
  non-numeric value, an unfinalised row, or a header with no data rows).

`app/lib/vatReturnCsv.js`'s unit tests
(`app/unit-tests/lib/vatReturnCsv.test.js`) read every fixture in this
directory and assert the valid ones parse to the expected nine-box object
and the invalid ones are rejected with the reason named above.
