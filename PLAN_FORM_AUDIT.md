<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_FORM_AUDIT: HMRC form and result page findings

Pages checked against `web/public/docs/hmrc-form-field-standards/` (HMRC terminology, WCAG 2.2 AA, hint text, validation formats):
`web/public/hmrc/itsa/*.html` (19), `web/public/hmrc/vat/*.html` (6), `web/public/companies-house/*.html` (6), `bundles.html`, `practice.html`,
`help.html`, `hmrc/receipt/receipts.html`, `passes/generate-*.html`. "ITSA (all)" means every ITSA page with that field.

Boarded 2026-10-03 as five `NEXT.md` rows: FA1 (A1 to A5, A10, A12 to A14 on the ITSA pages), FA2 (the same classes on the VAT, Companies House, practice, help and bundles pages, A16 to A25, A27), FA3 (A6 to A9), FA4 (A15), FA5 (A11, A26).

| # | Page | Element | Fault | Rule broken | Model |
|---|---|---|---|---|---|
| A1 | ITSA (all 19) | `#nino` placeholder, `#nino-hint` | Example is `AB123456C`, a real person's number, in the placeholder and in the hints on obligations, businessDetails, the period pages | NI number example is `QQ 12 34 56 C`; never `AB 12 34 56 C` | Haiku |
| A2 | adjustments, annualSubmission, dashboard, finalDeclaration, lossesAndClaims, selfEmploymentPeriodAmend, selfEmploymentPeriodView, taxCalculation, taxLiabilityAdjustments, ukPropertyAdjustments, ukPropertyAnnualSubmission, ukPropertyPeriodAmend, ukPropertyPeriodView | `#nino` | No hint linked by `aria-describedby`; the example lives only in the placeholder, which disappears on input | Hint text pattern: `<p class="hint" id="nino-hint">` + `aria-describedby`; WCAG 3.3.2 | Haiku |
| A3 | adjustments, annualSubmission, finalDeclaration, lossesAndClaims, selfEmploymentPeriodAmend, selfEmploymentPeriodView, taxCalculation, ukPropertyAdjustments, ukPropertyAnnualSubmission, ukPropertyPeriodAmend, ukPropertyPeriodView | `#taxYear` | Format `2023-24` given only as a placeholder; no hint | Hint text pattern; WCAG 3.3.2 | Haiku |
| A4 | selfEmploymentPeriodAmend, selfEmploymentPeriodView, ukPropertyPeriodAmend, ukPropertyPeriodView | `#businessId` | No hint; example only in placeholder | Hint text pattern; WCAG 3.3.2 | Haiku |
| A5 | ITSA (all), VAT (all), companies-house (companyNumber, companyQuery) | Placeholders `e.g., …` | Placeholder repeats or replaces the hint; low contrast and gone once typing starts | Hint text pattern (examples go in the hint, not the placeholder) | Haiku |
| A6 | annualSubmission, lossesAndClaims, selfEmploymentPeriod, selfEmploymentPeriodAmend, taxLiabilityAdjustments, ukPropertyAnnualSubmission, ukPropertyPeriod, ukPropertyPeriodAmend, adjustments, ukPropertyAdjustments | Every `type="number"` money input | No £ prefix, no "For example, £600 or £193.54" hint; `type="number"` rejects "£1,200" | Currency input: £ prefix, accept £ and commas and normalise before validation, `inputmode="decimal"` | Sonnet |
| A7 | companies-house/fileMicroEntityAccounts, fileConfirmationStatement | Balance sheet inputs, `#totalAmountUnpaid`, `#totalAggregateNominalValue` | Same as A6: bare `type="number"` money fields with no £ prefix or hint | Currency input pattern | Sonnet |
| A8 | selfEmploymentPeriodView, ukPropertyPeriodView | Result `<dl>` | Money printed raw (`430.43`, no £, no separators), absent as `-` | Money uses `formatGbp`; absent shows `—`; use the `hmrc-field-table.js` table | Sonnet |
| A9 | selfEmploymentPeriods, ukPropertyPeriods | Results table money columns | Money printed raw, absent as `-`, not right-aligned | Money uses `formatGbp`, right-aligned tabular figures | Sonnet |
| A10 | selfEmploymentPeriodView, ukPropertyPeriodView, selfEmploymentPeriods, ukPropertyPeriods | Period start/end cells | ISO dates (`2024-04-06`) shown to the customer | HMRC content style: dates as `6 April 2024` | Haiku |
| A11 | hmrc/receipt/receipts.html | Receipt details table | Rows labelled with raw and dotted API keys (`prefix.key`) and values `[Object]`, `[Array with n items]` | HMRC terminology: plain names; no raw API keys visible | Sonnet |
| A12 | annualSubmission | `#importDerivedFiguresStatus` | "Not on this form:" lists raw `group.key` API names | No raw API keys in visible text | Haiku |
| A13 | ITSA (all), VAT (all), companies-house (h1/h2) | `h1`–`h3`, button text | Title Case ("Trigger Year-End Summary", "Retrieve Calculation", "Change Registered Email Address") | HMRC content style guide: sentence case | Haiku |
| A14 | ITSA (all), VAT (all) | `#syntheticIndicator` | "SYNTHETIC MODE" in capitals with an emoji | HMRC content style: no block capitals | Haiku |
| A15 | ITSA (all) | Form validation | Missing fields only raise a status banner ("Please fill in…"); no inline error on the field, no `aria-invalid`, no error summary linking to fields | WCAG 3.3.1, 3.3.3; error message pattern | Sonnet |
| A16 | vat/viewVatReturn | `.detail-item label` | `<label>` used for static text with no form control | WCAG 1.3.1 (semantics); use `dt`/`dd` or `th` | Haiku |
| A17 | vat/submitVat, vat/viewVatReturn | Box 4, 5, 8, 9 labels | Box names differ between the two pages ("Net VAT due or to be reclaimed" vs "Net VAT to pay or reclaim"; "purchases and other inputs" vs "purchases and inputs") | HMRC terminology, consistent box names (VAT Notice 700/12 headings). The VAT behaviour step matches the view labels, update it too | Haiku |
| A18 | practice.html | `#arnInput` label | Label is the abbreviation "ARN" | HMRC terminology: "Agent reference number" | Haiku |
| A19 | practice.html | `#utrInput` | Label lacks "(UTR)"; hint says "10 digits" | "Unique Taxpayer Reference (UTR)", 10 or 13 digits | Haiku |
| A20 | practice.html | `#vrnInput`, `#ninoInput`, `#utrInput`, `#companyNumberInput` hints | Hint `<p>` has no id; inputs carry no `aria-describedby` | Hint text pattern; WCAG 1.3.1 | Haiku |
| A21 | companies-house/changeRegisteredOffice | `#addressLine1`, `#addressLine2`, `#locality`, `#region`, `#postalCode`, `#country` | No `autocomplete` values | Address fields: `address-line1`, `address-line2`, `address-level2`, `postal-code`, `country-name` | Haiku |
| A22 | companies-house/fileConfirmationStatement | `#sicCodes` | Instructions in the label ("comma-separated, up to four"); no hint | Hint text pattern | Haiku |
| A23 | help.html | `#support-description` | Instructions only in the placeholder | WCAG 3.3.2; hint text pattern | Haiku |
| A24 | bundles.html | `#passInput` | Format `word-word-word-word` only in the placeholder; no hint | Hint text pattern; WCAG 3.3.2 | Haiku |
| A25 | bundles.html | `formatGbpPence` | Prices via `toFixed`, no thousands separator | Money uses `formatGbp` / `formatGbpWhole` | Haiku |
| A26 | ukPropertyAdjustments | `#adjustCostOfReplacingDomesticItems` | Sent as `expenses.costOfReplacingDomesticItems`; the BSAS 7.0 UK property adjust request has no such field (the summary carries it under `deductions`) | Validation formats: match HMRC's request schema | Sonnet |
| A27 | vat/vatPenalties | Penalty summary and detail cells | Absent values shown as `-` | Absent shows `—` (one convention across result pages) | Haiku |
