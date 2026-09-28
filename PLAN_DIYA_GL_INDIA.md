<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: DIYA-GL for India

> The work this plan describes is in `../spreadsheets.diyaccounting.co.uk/`; bare paths are relative to that repository's root. Its rows are on this repository's `NEXT.md`.

Researched and written 2026-09-18. Every external figure carries its source in the `## Sources`
section. `PLAN_DIYA_GL_HOME.md` landed while this plan was being written; its three tiers
(on this device, 24h sandbox, resident), its pricing alternatives in (d) and its DG-1 to DG-5
rows are the base the India tier builds on, and the pricing section below reads from it and
from `PLAN_DIYA_GL_LAUNCH.md` §3 to §5.

## Board

Phase 1, the core/uk split, plus the two operator rows that gate nothing else. Same columns and
rules as `NEXT.md`'s board; phase 2 and 3 rows (IN-7 onwards, H-IN-3 to H-IN-5) join it when
phase 1 lands. `Source` here is this plan.

| # | Item | Source | Needs | Precursors | State | Size | Model | Status |
|---|---|---|---|---|---|---|---|---|
| IN-4 | Additive schema fields: `documentInfo.diya-gl:jurisdiction`, the line `diya-gl:type` pattern, four Indian product enum values; every example's canonical text unchanged | this plan | machine-only | — | ready-to-start | ~4 files | Sonnet | — |
| IN-1 | The jurisdiction registry `app/lib/jurisdictions.js`: `jurisdictionOf(book)` with absence meaning `uk`; `productOf` and `loadTaxDataForBook` resolve through it | this plan | machine-only | — | ready-to-start | ~5 files | Sonnet | — |
| H-IN-1 | An OIDAR GST registration quote (registration, authorised representative, monthly GSTR-5A) from an Indian CA | this plan | human-driven | — | ready-to-start | ~0 files | operator | — |
| H-IN-2 | Register `diya-gl.in`, `diyagl.in` and `diya-gl.co.in` in the management account through Route 53 | this plan | human-driven | — | ready-to-start | ~0 files | operator | — |
| IN-3 | The formatting seam `app/lib/money-format.js` with a `uk` profile replacing the 32 `£` and 17 `en-GB` literals; report text byte-identical | this plan | machine-only | IN-1 | blocked-to-start | ~20 files | Sonnet | after IN-1 |
| IN-6 | `defaultCurrency` honoured: the page formatter reads it; a shared book check warns when a line's `amountCurrency` differs | this plan | machine-only | IN-3 | blocked-to-start | ~5 files | Sonnet | after IN-3 |
| IN-2 | Move `app/lib/tax/*.js` and `tax-year.js` to `app/lib/tax/uk/`; imports updated; parity gate green | this plan | machine-only | IN-1 | blocked-to-start | ~30 files | Sonnet | after IN-1 |
| IN-5 | The UK parity proofs: a jurisdiction-absent test over every `examples/*` book against `examples/parity/*`; a test that `taxDataHash` ignores `app/data/in/` | this plan | machine-only | IN-1, IN-2, IN-4 | blocked-to-start | ~3 files | Sonnet | after IN-2 |

## User assertions (verbatim)

(2026-09-18) "Also create a fable sub-agent to research support for the indian system including
web searches in diya-gl, ideally we could maintain the same diya-git schema and add multi-currency
support (I think we did that for ../../polycode-projects/bedrock-meter take a look and see of we
need to port its extension back into diya-gl) and add some indian specific transaction types
ideally as just news things but we can namespace then ideally we'd split the calcs into uk and core
so there can be uk in and core.) This nees a deep pass for indian compliance too. I'm assuming a
save in browser option would be attractive to a country where global prices feel unaffordable but
then what would be the attractive pricing model. Check in on PLAN_DIYA_GL_HOME.md for the thoughts
on the UK's pricing model. Also slightly different serendipitus branding [the :diya_lamp: emoji, a
clay oil lamp, U+1FAD4 🪔]"

Readings: "diya-git schema" is the DIYA-GL schema. "news things" is "new things". "uk in and core"
is three calc namespaces: `uk`, `in`, `core`.

## Summary

India support is a third namespace beside `core` and `uk`: the same book.toml and lines.jsonl
format, a `diya-gl:jurisdiction` field on the book (absent means `uk`), Indian rates under
`app/data/in/`, Indian tax modules under `app/lib/tax/in/`, and Indian transaction types named
`in:gst-output`, `in:tds-deducted` and so on in a new optional `diya-gl:type` line field.
The split lands first and alone: `app/lib/tax/` becomes `app/lib/tax/uk/`, a jurisdiction
registry chooses the tax modules and the tax-year rule, and the parity gate keeps every UK
book byte-identical. bedrock-meter's currency work is a display-only converter for a USD
ledger; nothing ports back. DIYA-GL keeps single-currency books with `defaultCurrency`
(already in the schema, default GBP) and a new check that every line agrees with it.
Pricing (operator, 2026-09-19): free and donations first; the one paid India bundle is ₹499 a
year through Submit's catalogue, and it opens only when GA4 shows a save rate that justifies
the OIDAR GST registration (18% IGST from the first consumer sale) the paid tier needs.
`Proprietor` (44AD) is the first Indian product. Branding: the same DIYA-GL mark with the 🪔
lamp beside it, the domains diya-gl.in, diyagl.in and diya-gl.co.in registered now, a marigold
accent, and no festival tie-in.

## The core / uk / in split

### What is UK-specific today, and what is neutral

| Layer                          | UK-specific today                                                                                                                                                                                                                                                                                                 | Country-neutral (`core`)                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tax arithmetic                 | `app/lib/tax/income-tax.js`, `national-insurance.js`, `corporation-tax.js`, `vat.js`, `capital-allowances.js`, `mileage.js`                                                                                                                                                                                       | none                                                                                                                                                                                                                      |
| Year rule                      | `app/lib/tax-year.js`: 6 April for `se`, 1 April for `ltd`                                                                                                                                                                                                                                                        | the calendar helpers in `app/lib/calculators/shared.js` (`addMonths`, `endOfMonth`, Excel serials)                                                                                                                        |
| Rate data                      | `app/data/se-*.toml`, `app/data/ltd-*.toml` (HMRC rates)                                                                                                                                                                                                                                                          | none                                                                                                                                                                                                                      |
| Products                       | `app/products/{bst,taxi,se,ltd}.js`: CELL_MAPs onto HMRC form sheets (SA103S, CT600, the VAT return); `diya-gl:sa103sBox`, `diya-gl:ct600Box`, `diya-gl:vatBox` on accounts                                                                                                                                       | `app/lib/products.js` (the lookup)                                                                                                                                                                                        |
| Calculators                    | `app/lib/calculators/{bst,taxi,se,ltd}.js`, `se-derivations.js` (MTD quarterly updates); all shaped by the UK workbooks                                                                                                                                                                                           | `app/lib/calculators/shared.js` (aggregation by account and month, sums, sheet blanks)                                                                                                                                    |
| Checks                         | `app/lib/book-checks/{se,taxi,ltd}.js` (VAT straddling, CIS, payroll rules)                                                                                                                                                                                                                                       | `app/lib/book-checks.js` shared rules: every line inside the period, every line reaches a declared account, whole pence                                                                                                   |
| Workbooks                      | `app/templates/*`, `app/lib/anchors/*`, `xlsx-exporter.js`, `generator.js`, `link-caches.js`                                                                                                                                                                                                                      | `workbook-set.js`, `xlsx-parts.js` (container handling)                                                                                                                                                                   |
| Schema                         | `taxCode` enum is UK VAT codes; `entityInformation` carries UTR, NINO, VAT number, company number, CIS flag; `tax` sub-tables name HMRC concepts; `diya-gl:vatStaggerGroup`; payroll fields `diya-gl:incomeTax`, `diya-gl:employeeNI`, `diya-gl:employerNI`; `diya-gl:cisDeduction`, `diya-gl:cisRate` on lines | the GL 2015 core: `entryNumber`, `postingDate`, `accountMainID`, `amount`, `debitCreditCode`, `sourceJournalID`, `documentInfo`, the chart of accounts, registers (fixed assets, HP, members), `defaultCurrency`, `amountCurrency` |
| Serialisation and provenance   | none                                                                                                                                                                                                                                                                                                              | `diya-gl-schema.js`, `diya-gl-canonical.js`, `diya-gl-interchange.js`, `report-serializer.js`, `canonical-report-value.js`, `provenance.js`, `period-shift.js`                                                            |
| Editing                        | `diya-gl-edits-ltd.js` (Ltd bank codes)                                                                                                                                                                                                                                                                           | `diya-gl-edits.js` (add, change, remove lines)                                                                                                                                                                            |
| Formatting                     | 32 `£` literals and 17 `en-GB` literals across `app/lib`, `app/products` and `public/diya-gl/shell.js` (`moneyFmt` at shell.js:332 is `en-GB`/`GBP`); `xlsx-exporter.js:2673` writes `defaultCurrency: "GBP"`                                                                                                     | `headlines.js` (numbers only, no formatting by design)                                                                                                                                                                    |
| Copy                           | 16 "UK"/"HMRC" mentions in the MCP server and the package README; 36 in `public/diya-gl.html`                                                                                                                                                                                                                     |                                                                                                                                                                                                                           |

### Module boundaries

Move as little as possible. The core modules stay where they are; nothing is gained by
renaming `diya-gl-canonical.js` to `core/canonical.js` except import churn. The UK-ness becomes
explicit in two places, and India lands as a sibling in each:

```
app/lib/jurisdictions.js          the registry: id -> { products, taxModules, taxYearFileName, dataDir, locale, currency }
app/lib/tax/uk/*.js               today's six modules, moved
app/lib/tax/uk/tax-year.js        today's tax-year.js, moved
app/lib/tax/in/income-tax.js      slabs (both regimes), 87A, surcharge, cess
app/lib/tax/in/presumptive.js     44AD, 44ADA (section 58 from Tax Year 2026-27)
app/lib/tax/in/gst.js             rate split, place of supply, ITC set-off, composition, RCM, GSTR-3B summary
app/lib/tax/in/tds.js             194C/H/I/J/O tables, Form 26AS ledger
app/lib/tax/in/payroll.js         PF, ESI, professional tax
app/lib/tax/in/tax-year.js        1 April for everyone; FY and Tax Year labels
app/lib/calculators/in/*.js       one per Indian product
app/lib/book-checks/in/*.js       one per Indian product
app/products/in/*.js              one per Indian product
app/data/in/fy-2025-2026.toml     rates and thresholds, sources in comments
app/data/in/fy-2026-2027.toml
app/lib/money-format.js           the one formatter: formatMoney(value, profile), formatDate(date, profile)
```

`app/data/in/` is a subdirectory on purpose. `scripts/build-provenance-data.mjs` hashes the
top-level `app/data/*.toml` files only, so adding Indian data leaves `diya-gl:taxDataHash`
unchanged for every UK book. An India book gets its own stamp value computed over
`app/data/in/*.toml` by the same function, keyed by jurisdiction.

### How a book declares its jurisdiction and currency

```toml
[documentInfo]
"diya-gl:jurisdiction" = "in"      # enum ["uk", "in"]; absent means "uk"
defaultCurrency = "INR"            # already in the schema; default "GBP"
periodCoveredStart = 2026-04-01
periodCoveredEnd = 2027-03-31

[entityInformation]
organizationIdentifier = "Sharma Traders"
taxAuthorityIdentifier = "CBDT"   # default stays "HMRC"
"diya-gl:product" = "Proprietor"   # enum gains Proprietor, Professional, CabDriver, PrivateLimited
"in:pan" = "ABCDE1234F"
"in:gstin" = "27ABCDE1234F1Z5"     # optional; absent means unregistered
"in:stateCode" = "27"              # the supplier's state, for the CGST/SGST vs IGST split
"in:regime" = "new"                # "new" | "old"
"in:presumptive" = "44AD"          # "44AD" | "44ADA" | "none"
"in:gstScheme" = "regular"         # "unregistered" | "regular" | "composition"
```

Ajv runs without `useDefaults`, so a default in the schema is documentation. The engine reads
absence as `uk`, and the registry throws on an unknown value. An India book carries no `tax`
table in v1: its rates come from `app/data/in/<fy>.toml` named by the period end, the way a UK
book falls back to `app/data/se-*.toml` when `loadTaxDataForBook` resolves the year.

### How a transaction type is namespaced

A DIYA-GL line has no type field today; its meaning is `sourceJournalID` plus `accountMainID`
plus `taxCode` plus `diya-gl:bankCode`. That stays the UK convention and nothing on a UK line
changes. India adds one optional field and a family of optional keys:

- `diya-gl:type`: a string matching `^[a-z]{2}:[a-z0-9-]+$`, for example `in:gst-output`,
  `in:tds-deducted`. The two-letter prefix is the jurisdiction. A `uk:` prefix is reserved and
  unused, so a UK line never carries the field and its canonical text never changes.
- `in:*` keys on lines: `in:hsnSac`, `in:placeOfSupplyState`, `in:cgst`, `in:sgst`, `in:igst`,
  `in:itcEligible`, `in:tdsSection`, `in:tdsAmount`, `in:pfEmployee`, `in:pfEmployer`,
  `in:esiEmployee`, `in:esiEmployer`, `in:professionalTax`, `in:counterpartyGstin`.
- `taxCode` gains GST values `GST0`, `GST5`, `GST18`, `GST40`, `RCM`, `COMP`, `EXEMPT-IN`. Adding
  enum values is additive.

The lines schema is `additionalProperties: false`, so the keys are declared in
`diya-gl-lines-v2.schema.json`. Adding optional properties to a v2 schema keeps every existing
book valid, and the canonical writer takes field order from the schema, so a line that carries
none of the new keys renders exactly as before. No format version bump.

### The parity guarantee for UK books

LP-4's gate (`diya-gl/parity.sh`, the "pack diya-gl, smoke and parity" job in `test.yml`) runs
the packed CLI over `examples/{bst,taxi,se,ltd}-latest` and diffs against `examples/parity/*`.
After the split these stay byte-identical:

1. `book.toml` and `lines.jsonl` as `read-workbook` writes them, including every `documentInfo`
   stamp (`diya-gl:taxDataHash` in particular, hence the `app/data/in/` subdirectory).
2. `report.json` and `bookchecks.json` for all four products.
3. `canonicalBookToml` and `canonicalLinesJsonl` output for every book under `examples/`.
4. The bundle's `report.json` on the DIYA-GL pages, through `product-fmt-canonical.test.js`.

Two tests are added beside the gate: a book with no `diya-gl:jurisdiction` resolves to `uk` and
produces the committed fixture; and `taxDataHash` over `app/data` is unchanged by any file
under `app/data/in/`.

### Test strategy

- Phase 1 (the split) is proved by the existing suite plus the two tests above; `npm test`
  routes to unit, calc and the parity job because `app/lib/tax/` moves.
- India has no workbook template, so no LibreOffice oracle. The anchors are hand-computed
  compliance cases from the sourced examples (an income of ₹12,00,000 in the new regime pays
  nothing after 87A; ₹50,00,000 of digital turnover under 44AD is ₹3,00,000 of deemed profit; an
  intra-state ₹10,000 sale at 18% posts ₹900 CGST and ₹900 SGST). Each check is proved
  breakable the way the reconciliation method requires: corrupt one figure, assert the exact
  failure set.
- Every Indian product gets a golden `examples/parity/in-<product>/` produced by the engine and
  reviewed by an Indian chartered accountant before launch (H-IN-4). The Rust port
  (`PLAN_DIYA_GL_RUST.md`, LP-12) becomes the independent oracle when it exists.

## Multi-currency

### What bedrock-meter has

- `seed/app/lib/accountant/schema.mjs`: money stored as integer micros (1/1,000,000 of a
  unit), helpers `gbpToMicros`, `usdToMicros`, never floats.
- `seed/app/lib/accountant/fx.mjs`: one GBP/USD rate from an SSM parameter with a 24-hour
  cache, falling back to the pinned `fx.gbp_usd_rate` (0.79) in
  `seed/app/ontology/pricing-pinned.json`, whose `currency` is `"USD"`.
- `packages/runtime/src/currency.mjs`: display only. `SUPPORTED_CURRENCIES` is USD plus the
  ECB's 30 daily reference currencies (INR included), `currencyForRegion` maps ISO-3166 to
  ISO-4217 with a stated fallback reason, `convertMicros` turns USD micros into another
  currency's micros and returns `null` for a missing rate, `formatMoney` is
  `Intl.NumberFormat`, and `displayCurrency` reads an env var. The header says it is never
  imported by a metering or cap path.
- `seed/reference-docs/PLAN_BEDROCK_ACCOUNTANT.md` lists "GBP/USD pinning staleness" as a
  risk reviewed quarterly.

That is a presentation-currency converter over a single-currency ledger with one base (USD).
There is no transaction-currency field, no per-line rate, no rounding contract beyond micros.

### The port-back decision

Nothing ports. A DIYA-GL amount is a penny-precision decimal the schema validates and the
canonical form writes to two places; micros would be a format break for every book. An FX
rate is a network or pinning concern, and DIYA-GL's provenance promise is that a report
reproduces from the book and the stamped data alone. Two ideas carry over as practice: format
through `Intl.NumberFormat` with a plain fallback, and return nothing for a missing rate
rather than guess.

### The schema change

Nothing new is required on any book. `documentInfo.defaultCurrency` (ISO 4217, default `GBP`)
and the per-line `amountCurrency` (gl-muc, default `GBP`) already exist. v1 for India is a
single-currency book in INR:

- The India products write `defaultCurrency = "INR"`; the UK exporter keeps writing `"GBP"`.
- A new shared book check warns when a line's `amountCurrency` is present and differs from
  `defaultCurrency`. Today no example carries `amountCurrency`, so no UK book warns.
- `money-format.js` reads `defaultCurrency` and the jurisdiction's locale, so the page shows
  `₹12,34,567.00` for an INR book and `£12,345.00` for a GBP book with one code path.

Foreign-currency lines (an Indian exporter invoicing in USD, a UK trader buying in EUR) are a
horizon. The design when it is needed: keep `amount` in the book currency as the only figure
every report reads, and add `diya-gl:originalAmount`, `diya-gl:originalCurrency` and
`diya-gl:exchangeRate` (six decimal places, matching the canonical rate precision) so the
conversion is recorded on the line. India would take the CBIC notified rate for GST valuation
under Rule 34 and the RBI reference rate for the books; that choice belongs to the tier when
it is designed.

## Indian compliance

Rules as they stand for FY 2025-26 and FY 2026-27. Amounts are in rupees; L is lakh
(1,00,000) and cr is crore (1,00,00,000).

### 1. The year and the due dates

- The financial year runs 1 April to 31 March. Under the Income-tax Act 1961 the income of
  FY 2025-26 is assessed in AY 2026-27. The Income-tax Act 2025 came into force on 1 April 2026
  and replaces the previous-year/assessment-year pair with one "tax year", so income from
  1 April 2026 is Tax Year 2026-27 (S1, S2).
- ITR for FY 2025-26: 31 July 2026 for non-audit individuals, with a business/profession
  non-audit date reported as 31 August 2026; 31 October 2026 for audit cases; 30 November 2026
  with transfer pricing (S3). Presumptive filers use ITR-4 Sugam when total income is at most
  ₹50L; books-based filers use ITR-3 (S4).
- Advance tax: 15%, 45%, 75% and 100% cumulatively by 15 June, 15 September, 15 December and
  15 March. A 44AD or 44ADA taxpayer pays 100% in one instalment by 15 March (S5).
- GST: GSTR-1 by the 11th of the following month and GSTR-3B by the 20th; QRMP (turnover up
  to ₹5cr) files quarterly on the 22nd or 24th by state; GSTR-9 by 31 December after the
  financial year (S6).
- Companies: AGM within six months of the year end, AOC-4 within 30 days of the AGM, MGT-7 or
  MGT-7A within 60 days (S7). LLPs: Form 11 by 30 May, Form 8 by 30 October (S8).
- TDS: deposit by the 7th of the following month (30 April for March); quarterly returns 24Q
  (salary) and 26Q (other) by 31 July, 31 October, 31 January and 31 May; Form 16A to every
  deductee after each return (S9).

### 2. Individuals and sole proprietors

New regime, the default, FY 2025-26 and unchanged for FY 2026-27 by Budget 2026 (S10, S11):

| Total income   | Rate |
| -------------- | ---- |
| up to ₹4L      | nil  |
| ₹4L to ₹8L     | 5%   |
| ₹8L to ₹12L    | 10%  |
| ₹12L to ₹16L   | 15%  |
| ₹16L to ₹20L   | 20%  |
| ₹20L to ₹24L   | 25%  |
| above ₹24L     | 30%  |

Rebate under 87A: up to ₹60,000 for total income up to ₹12L in the new regime, so ₹12L pays
nothing, with marginal relief just above; ₹12,500 up to ₹5L in the old regime (S10, S12).
Standard deduction is on salary only: ₹75,000 new regime, ₹50,000 old (S10). Old regime slabs:
nil to ₹2.5L, 5% to ₹5L, 20% to ₹10L, 30% above (S13). Surcharge: 10% above ₹50L, 15% above
₹1cr, 25% above ₹2cr, 37% above ₹5cr in the old regime; capped at 25% in the new regime (S13).
Health and education cess 4% on tax plus surcharge (S10).

Presumptive taxation (S14, S15):

| Section | Who                                   | Limit                                            | Deemed profit                              |
| ------- | ------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| 44AD    | business, resident individual/HUF/firm | turnover ≤ ₹2cr, or ≤ ₹3cr if cash receipts ≤ 5% | 8% of cash turnover, 6% of digital turnover |
| 44ADA   | specified professions                 | receipts ≤ ₹50L, or ≤ ₹75L if cash ≤ 5%         | 50% of gross receipts                      |

A 44AD taxpayer who declares below the deemed rate and has income above the exemption limit
loses the scheme for five years and needs audited books; 44ADA has no lock-in (S14). From Tax
Year 2026-27 the three presumptive sections (44AD, 44ADA, 44AE) are one section 58 in the 2025
Act with the same rates and limits (S16).

Books of account, 44AA (S17): an individual or HUF in business keeps books when income exceeds
₹2.5L or turnover exceeds ₹25L in any of the three preceding years; a specified profession
(legal, medical, engineering, architecture, accountancy, technical consultancy, interior
decoration, film artist, IT and others) when gross receipts exceed ₹1.5L, unless 44ADA is
taken. Books are kept six years.

Tax audit, 44AB (S18): business turnover above ₹1cr, or above ₹10cr when both cash receipts
and cash payments are within 5% of the totals; profession receipts above ₹50L, with no digital
uplift; and a 44AD opt-out with income above the basic exemption (₹4L in the new regime).

### 3. GST

- Registration threshold: goods ₹40L, services ₹20L in normal states; ₹20L and ₹10L in the
  special category states (S19).
- Rates from 22 September 2025, after the 56th GST Council meeting: 0%, 5%, 18% and 40%. The 12%
  and 28% slabs went; about 99% of the 12% items moved to 5% and about 90% of the 28% items to
  18%; 40% is luxury and sin goods. Compensation cess ended except on tobacco products (S20).
- Split: an intra-state supply charges CGST and SGST in equal halves (9% + 9% at the 18%
  rate); an inter-state supply charges IGST at the full rate. Place of supply for a service to a
  registered recipient is the recipient's location; to an unregistered recipient, the address
  on record, else the supplier's location (IGST Act s.12) (S21).
- Input tax credit only when the supplier has reported the invoice and it appears in the
  recipient's GSTR-2B (CGST Act s.16(2)(aa)) (S22). The set-off order is IGST credit first,
  then CGST against CGST and SGST against SGST.
- Composition scheme: goods up to ₹1.5cr (₹75L special category), services up to ₹50L; 1% for
  manufacturers and traders, 5% for restaurants, 6% for service providers; no ITC, no tax on
  the invoice (a bill of supply); CMP-08 by the 18th after each quarter, GSTR-4 annually by
  30 June (S19, S23).
- Annual return: GSTR-9 mandatory above ₹2cr; GSTR-9C reconciliation above ₹5cr (S24).
- E-invoicing for turnover above ₹5cr in any year from 2017-18, since 1 August 2023 (S25).
  HSN/SAC on invoices: four digits at or below ₹5cr, six above (S6).
- Reverse charge: s.9(3) notified supplies (goods transport agency, legal services to a
  business, and others) and s.9(4) supplies from unregistered persons as notified; the
  recipient self-invoices and pays in cash, then claims ITC where eligible (S26).

### 4. TDS and TCS as transaction types

Rates and thresholds for FY 2025-26 and FY 2026-27 after Finance Act 2025 (S27, S28):

| Section | Payment                                | Threshold                               | Rate                                      |
| ------- | -------------------------------------- | --------------------------------------- | ----------------------------------------- |
| 194C    | contractors                            | ₹30,000 single or ₹1,00,000 in the year | 1% individual/HUF payee, 2% others        |
| 194H    | commission, brokerage                  | ₹20,000                                 | 2%                                        |
| 194I    | rent                                   | ₹50,000 a month (₹6,00,000 a year)      | 2% plant and machinery, 10% land/building |
| 194J    | professional and technical fees        | ₹50,000                                 | 10% professional, 2% technical            |
| 194-O   | e-commerce operator to participant     | ₹5L for an individual/HUF with a PAN    | 0.1% (from 1 October 2024)                |

TCS on sale of goods under 206C(1H) was removed from 1 April 2025; 194Q (buyer-side TDS on
goods above ₹50L, turnover above ₹10cr) stays (S29). Credit for TDS suffered is claimed
against Form 26AS; AIS lists the wider reported transactions and TIS summarises them, and a
credit missing from 26AS is chased with the deductor before filing (S30).

### 5. Companies and LLPs

- Corporate rates FY 2025-26: 25% where turnover in the base year is at most ₹400cr, else 30%;
  22% under 115BAA for any domestic company giving up exemptions (10% surcharge and 4% cess make
  25.17%); 15% under 115BAB for new manufacturing companies; MAT at 15% under the standard
  regimes and none under 115BAA/BAB (S31).
- LLPs and firms: 30%, 12% surcharge above ₹1cr with marginal relief, 4% cess; AMT at 18.5%
  of adjusted total income (S32).
- Statutory audit: every company, whatever its size; an LLP when turnover exceeds ₹40L or
  contribution exceeds ₹25L (S7, S8).
- Filings: AOC-4 (financial statements) and MGT-7 (annual return), MGT-7A for one-person and
  small companies (paid-up capital up to ₹4cr, turnover up to ₹40cr) (S7).
- Schedule III, Division I (companies on Accounting Standards, which is every small company
  below the Ind AS thresholds): a vertical balance sheet of Equity and Liabilities
  (shareholders' funds, non-current liabilities, current liabilities) against Assets
  (non-current, current), and a Statement of Profit and Loss of revenue from operations, other
  income, expenses by nature (materials, purchases of stock-in-trade, changes in inventories,
  employee benefits, finance costs, depreciation and amortisation, other expenses), profit
  before tax, current and deferred tax, profit for the period, and notes (S33).

What the Ltd product's statements change to: the UK P&L and balance sheet in
`app/products/ltd.js` are FRS 102 section 1A shapes with a CT600 map. The Indian company
product needs the Schedule III line items above, a tax computation at the company's chosen
regime, a TDS payable ledger by section, a GST ledger with the three taxes, and no CT600. The
directors' report and the CH-style filings have no Indian analogue in the product; AOC-4 and
MGT-7 are MCA e-forms a chartered accountant or company secretary signs.

### 6. Payroll basics

- EPF: 12% employee and 12% employer on wages up to the ₹15,000 ceiling; a rise of the ceiling
  to ₹25,000 was reported in 2026 and the data file records whichever is in force (S34).
- ESI: 0.75% employee and 3.25% employer for gross wages up to ₹21,000 a month (S34).
- Professional tax: a state levy capped at ₹2,500 a year by Article 276; Maharashtra ₹200 a
  month plus ₹300 in February above ₹10,000; Karnataka exempt up to ₹25,000 from 1 April 2025
  and ₹200 a month above (S35).
- TDS on salary monthly through 24Q; Form 16 issued annually (S9, S34).

### 7. The product analogues and their new transaction types

| DIYA-GL product   | Indian analogue                                                    | Computation                                                                                    | Filing target                           |
| ----------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| Basic Sole Trader | `Proprietor`: a 44AD business, cash basis, single file             | deemed profit 6%/8% or actual if higher; new regime slabs with 87A; single advance tax instalment | ITR-4; GST nil or composition           |
| Self Employed     | `Professional`: a 44ADA professional or a books-based ITR-3 filer  | 50% deemed or full P&L; GST regular scheme with ITC; TDS suffered under 194J against 26AS      | ITR-3/ITR-4; GSTR-1, GSTR-3B            |
| Taxi Driver       | `CabDriver`: a platform or own-account passenger driver            | 44AD (44AE is goods carriage only); 194-O TDS by the platform; platform pays GST under s.9(5) | ITR-4                                   |
| Limited Company   | `PrivateLimited` (an LLP variant later)                            | Schedule III statements; 115BAA or 25%/30%; TDS payable by section; PF/ESI/PT                 | books for the auditor; ITR-6; AOC-4     |

The new transaction types, each a `diya-gl:type` value, with the accounts it posts to
(codes are the proposed Indian chart; every code is declared in the product's book.toml):

| `diya-gl:type`             | Postings                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `in:gst-output-intra`      | Dr 1100 Debtors or bank gross; Cr 4000 Sales net; Cr 2201 CGST output; Cr 2202 SGST output                                    |
| `in:gst-output-inter`      | Dr 1100 or bank gross; Cr 4000 net; Cr 2203 IGST output                                                                        |
| `in:gst-input-intra`       | Dr expense net; Dr 1301 CGST input; Dr 1302 SGST input; Cr 2100 Creditors or bank                                              |
| `in:gst-input-inter`       | Dr expense net; Dr 1303 IGST input; Cr 2100 or bank                                                                            |
| `in:gst-input-blocked`     | Dr expense gross (s.17(5) items, no ITC); Cr 2100 or bank                                                                      |
| `in:gst-reverse-charge`    | Dr expense; Dr 130x input where eligible; Cr 2204 RCM payable (cash only, no credit set-off)                                    |
| `in:gst-composition-levy`  | Dr 6101 Composition tax; Cr 2205 GST payable at 1%/5%/6% of the quarter's turnover                                              |
| `in:gst-payment`           | Dr 220x; Cr bank, after the set-off IGST, then CGST, then SGST                                                                  |
| `in:tds-deducted`          | on a receipt where the customer withheld: Dr bank net; Dr 1401 TDS receivable (26AS); Cr 1100                                   |
| `in:tds-deductible`        | on a payment where we withhold: Dr expense gross; Cr 2100 net; Cr 2301 TDS payable, keyed by `in:tdsSection`                    |
| `in:tds-payment`           | Dr 2301; Cr bank, by the 7th                                                                                                   |
| `in:advance-tax`           | Dr 1402 Advance tax paid; Cr bank, on the instalment dates or 15 March under 44AD                                               |
| `in:self-assessment-tax`   | Dr 1402; Cr bank                                                                                                               |
| `in:professional-tax`      | payroll: Cr 2302 PT payable; the proprietor's own enrolment: Dr 6102 PT; Cr 2302                                                |
| `in:pf`                    | Dr 5100 wages (employee share within gross); Dr 5102 employer PF; Cr 2303 PF payable                                            |
| `in:esi`                   | Dr 5100; Dr 5103 employer ESI; Cr 2304 ESI payable                                                                             |
| `in:tcs-collected`         | Cr 2305 TCS payable (206C(1) goods such as scrap; 1H is gone); a horizon for the first products                                 |

### 8. Numbering and formatting

- Grouping is three digits then pairs: ₹12,34,567.89. `new Intl.NumberFormat("en-IN", { style:
  "currency", currency: "INR" })` produces exactly that in current engines (S36).
- Dates are dd-mm-yyyy on every government form; the book keeps ISO dates and the page formats.
- Period labels: "FY 2025-26" and "AY 2026-27" for periods under the 1961 Act; "Tax Year
  2026-27" from 1 April 2026 (S1). The FY label is `FY <start>-<end two digits>`.
- Amounts on Schedule III statements are rounded to the nearest rupee, thousand, lakh or crore
  by turnover band (S33).

## Products for India

`Proprietor` is the first Indian product (operator, 2026-09-19): it is the closest analogue to
Basic Sole Trader, the largest market (every 44AD business), and needs no GST module beyond
composition. `Professional` follows
with the GST regular scheme and the TDS receivable ledger. `CabDriver` is `Proprietor` plus the
194-O receipt type and the takings view. `PrivateLimited` is phase 3.

Each product module under `app/products/in/` carries the chart of accounts, the report sections
(P&L, balance sheet, computation of income, GST summary, TDS ledger), the ITR box map in the
place of the SA103S map, `HEADLINES`, `checkCompliance`, and the `in:` edits its page offers.
The calculators aggregate the same way the UK ones do (`aggregateByAccountAndMonth`); the
difference is the tax block at the end and the two GST ledgers.

Every product opens with a "FY 2026-27" period, an `in:regime` choice, and the presumptive
choice; a wrong combination (44ADA on a business chart, composition above ₹1.5cr, 44AD with
receipts above the limit) is a book check with a fix-it helper, the way the UK products handle
a VAT flag.

## Pricing for India

### Purchasing power

- India's nominal GDP per capita is US$2,878 (2025) and US$12,801 at PPP (2026); the UK's
  nominal figure is about US$57,608 (2025) (S37, S38). The nominal gap is twenty to one; the
  price-level gap inside India (PPP over nominal) is about 4.4 to one.
- Global subscriptions priced for India: Spotify about US$1.50 a month against US$10.99 in the
  US; Netflix from ₹149 (mobile) and ₹199; Notion Plus ₹670 a user a month (S39). SaaS pricing
  guides put India at 55% to 80% off US list (S39).
- Indian accounting software: Zoho Books is free with no time limit for revenue under ₹25L,
  then ₹899 a month plus 18% GST; Vyapar's mobile app is free and the desktop plan is about
  ₹3,399 a year; TallyPrime Silver is ₹22,500 one-off plus about ₹4,500 a year (S40, S41).
  Indian small-business software is priced annually.
- GBP/INR is about 128.7 (17 September 2026) (S42), so the UK's 99p is ₹127.

### Rails

- Stripe UPI: available to Stripe accounts in GB (the list on the UPI page includes GB),
  presentment in INR, customer location India, recurring through UPI AutoPay e-mandates,
  ₹1 to ₹1,00,000 a payment and ₹15,000 a recurring payment (S43). The existing Submit Stripe
  account can enable it in the Dashboard. Stripe's own Indian accounts are invite-only and do
  not process UPI, which is a different matter (S44).
- Stripe fees on a UK account for a non-UK card: 3.25% + 20p, plus 2% when the charge currency
  converts to GBP (S45). The 20p fixed component is what decides the price shape below. The UPI
  fee for a GB account is not on the public page; it is read from the Dashboard before the price
  is set (H-IN-5).
- RBI e-mandates: a recurring card or UPI debit needs a registered mandate with an authentication
  factor at registration, a pre-debit notice 24 hours ahead, and a fresh authentication above
  ₹15,000 (S46). An annual charge under ₹15,000 is one authenticated payment with no mandate.
- Razorpay's cross-border product accepts INR by card, net banking and UPI for a foreign
  business with no Indian entity under its PA-CB licence (December 2025), settling in GBP;
  domestic fees are 2% plus GST and international cards 3% plus GST (S47, S48). It is the
  fallback if Stripe's UPI fee or success rate disappoints; it would be a second billing
  integration, which the bundle system is built to avoid.
- Stripe's INR minimum charge is ₹0.50 (S49).

### The Indian tax on the price

A foreign supplier of online services (OIDAR) to Indian consumers registers for GST from the
first sale with no threshold, charges 18% IGST, files GSTR-5A, and appoints an authorised
representative in India; a sale to a GST-registered business is instead reverse-charged by the
buyer (S50). The equalisation levy on foreign digital services ended on 1 April 2025 (S51). So
every consumer price below is GST-inclusive and the company keeps price ÷ 1.18, and the fixed
cost of the registration and the representative is the true break-even. Get the quote (H-IN-1)
before setting any price.

### The offer

The India tiers are `PLAN_DIYA_GL_HOME.md`'s three tiers with the resident price in rupees.
HOME (e) already gives the no-account reader the "On this device" row (DG-4) over the IndexedDB
autosave, HOME (b) the 24h sandbox (DG-2a, DG-2b), and HOME (c) the resident bundle through
Submit, enabled on ci only until prod lifts `DIYA_GL_RESIDENT_TIER`. HOME (d)'s rule is that a
yearly charge is a second button, never a second tier; the India bundle keeps to that by being
one price for one market.

| Tier    | Price            | What it is                                                                                                                                                    |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free    | ₹0               | the India page and its offline runner; the book kept on this device (the autosave in `autosave.js`, the DG-4 row); the downloaded file is the durable copy     |
| Sandbox | ₹0, sign-in      | DG-2's 24-hour signed-in storage, the same on every host                                                                                                      |
| Paid    | one India bundle | `resident-diya-gl-in` in Submit's catalogue: books kept until deleted (DG-3), the same entitlement path as `resident-diya-gl`, ci only until prod lifts the tier |

Price points, with the Stripe card fee at 3.25% + 20p + 2% and 18% GST inside the price:

| Price                    | In GBP | Stripe fee | Fee share | Net of GST and fee, a year | For                                                                                          | Against                                                                                           |
| ------------------------ | ------ | ---------- | --------- | -------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ₹49 a month              | £0.38  | £0.22      | 58%       | £1.61                      | PPP-honest (99p ÷ 4.4 is ₹29; Spotify's ratio gives ₹15); a familiar Indian micro-price      | the 20p kills it on cards; twelve mandate debits a year; the smallest number that funds nothing  |
| ₹99 a month              | £0.77  | £0.24      | 31%       | £5.35                      | near UK parity per month; one price to explain                                               | above Spotify India; reads as a foreign price; monthly churn on a mandate                         |
| ₹499 a year              | £3.88  | £0.40      | 10%       | £3.48 of £3.88 gross       | one charge under the ₹15,000 mandate line; Vyapar's annual convention; ₹42 a month effective | the operator's UK decision of no annual plan; a year's commitment before the product has a record |
| ₹999 a year              | £7.77  | £0.61      | 8%        | £6.07                      | still under Zoho's cheapest month; fee share smallest                                        | double the PPP line; the free tier already does the accounts                                      |

Decision (operator, 2026-09-19): ₹499 a year is the India bundle's only price, as
`resident-diya-gl-in` with `stripeCurrency = "inr"`, `stripeInterval = "year"`,
`stripePriceAmount = 49900`; `scripts/stripe-setup.js` in Submit already takes currency and
interval per bundle. India launches free and donations only, which the pages already prompt
for. The paid tier waits on the GA4 save-rate gate below, because the OIDAR registration's
fixed cost is paid for by subscribers who do not yet exist; H-IN-1 gets the quote meanwhile so
the gate has a number to clear. The rail (Stripe UPI or Razorpay) is still open.

### What GA4 evidence would change it

LP-9's events gain a `jurisdiction` dimension. The first reading is the GA4 save-rate gate
the paid tier waits on: the share of India-page loads that reach a save, read against H-IN-1's
quote, opens IN-18 when a plausible conversion of those savers at ₹499 covers the
registration's yearly cost. Three readings move the price: the share of India-page loads that
reach a save (below 20% says the free tier has not earned an ask);
UPI's share of India checkouts (above 70% with a card failure rate above 15% says move rails
to Razorpay); and the subscribe-click to checkout-complete ratio at ₹499 against a ₹299 test
(a ratio twice as high at ₹299 pays for itself at the same fee share).

## Branding

The word is the same word. "Diya" is Hindi for the clay oil lamp lit at Diwali and in Hindu,
Sikh, Jain and Buddhist worship (S52). The mark is Unicode U+1FAD4 DIYA LAMP, 🪔.

- Mark: the existing DIYA-GL wordmark with the lamp beside it, at the position the UK pages
  give `icon.svg`. The lamp is drawn as a flat SVG in the brand repository (LU-13), so the
  emoji's platform rendering never appears on a page.
- Name: "DIYA-GL India" in copy; the domain `diya-gl.in`. NIXI's whois on 2026-09-18 shows
  `diya-gl.in`, `diyagl.in` and `diya-gl.co.in` available. Route 53 registers `.in`, one to ten
  years, no privacy protection (S53); NIXI takes foreign registrants with KYC (S54). The
  operator decided (2026-09-19) to register the three now in the management account beside
  `diya-gl.co.uk` (H-IN-2), `.in` primary, the others redirecting; the IP India search (H-IN-3)
  follows the registration.
- Accent: one token, `--diya-in-accent`, a marigold (the flame and the Diwali flower) on the
  same neutral palette; nothing else in the theme changes.
- Strapline: "Apna hisaab, apne haath" ("your accounts, in your own hands"), which carries the
  UK line "ownership is the promise" into Hindi. A native speaker checks it before it ships.
- Copy rule: the lamp is a mark, never a festival campaign. No deities, no rangoli, no Diwali
  offer.

Risks:

1. Religious connotation. The lamp belongs to four faiths and to secular India, and about a
   fifth of Indians are Muslim or Christian. A lamp on a ledger reads as light on the figures;
   a Diwali tie-in narrows it. The copy rule above is the mitigation.
2. Distinctiveness. "Diya" is a common given name and a common trade name in India (Diya Gold,
   Diya Outdoor Media, Diya Gas Bottling appear in the register listings) (S55). The composite
   "DIYA-GL" is the distinctive form; the bare word is never claimed.
3. Trade mark coverage. The UK filings in `PLAN_DIYACCOUNTING_BRAND.md` (H-LU-4, not yet
   filed) cover the UK only. India is a Madrid Protocol member; a UK application is the base
   for a Madrid designation of India, or an Indian agent files direct at ₹9,000 a class for a
   company (S56). A public search of the IP India register for DIYA and DIYA-GL in classes 9
   and 42 has not been done (H-IN-3).

## Decisions taken (operator, 2026-09-19)

1. Price shape: ₹499 a year is the India bundle's only price.
2. When the paid tier opens: free and donations first; the paid India tier waits until GA4
   shows a save rate that justifies the OIDAR GST registration's fixed cost (the "GA4 save-rate
   gate" precursor on IN-18, IN-19 and H-IN-5); H-IN-1, the OIDAR quote, proceeds meanwhile.
3. First Indian product: `Proprietor` (44AD).
4. Domains: register `diya-gl.in`, `diyagl.in` and `diya-gl.co.in` now through Route 53 in the
   management account (H-IN-2 is ready to start); the IP India search (H-IN-3) follows.

## Decisions still open

1. Rails. Alternatives: Stripe UPI on the existing account (recommended; one billing system),
   or Razorpay's cross-border product (a second integration, better UPI success rates claimed).
2. What an India book produces. Alternatives: pages and JSON only, with the engine's checks as
   the proof and a CA review as the oracle (recommended for phase 2), or an Indian Excel
   template family so the LibreOffice reconciliation method applies (a large body of work that
   would follow the Rust port's oracle instead).

## Task list

| #       | Task                                                                                                                                                                                                                                     | Phase | Precursors             | Model  | Files                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IN-1    | The jurisdiction registry: `app/lib/jurisdictions.js`, `jurisdictionOf(book)` with absence meaning `uk`, `productOf` and `loadTaxDataForBook` reading through it                                                                          | 1     | —                      | Sonnet | ~5 files: `app/lib/jurisdictions.js` (new), `app/lib/product-workbook.js`, `app/lib/products.js`, `app/lib/diya-gl-engine.js`, `app/test/jurisdictions.test.js` (new)                                              |
| IN-2    | Move `app/lib/tax/*.js` to `app/lib/tax/uk/` and `app/lib/tax-year.js` to `app/lib/tax/uk/tax-year.js`; every import updated; parity green                                                                                                | 1     | IN-1                   | Sonnet | ~30 files: the seven moved modules, their importers under `app/lib`, `app/products`, `app/bin`, `app/test/tax`, `scripts/build-diya-gl-bundle.mjs`                                                                 |
| IN-3    | The formatting seam: `app/lib/money-format.js` with a `uk` profile (GBP, en-GB) replacing the 32 `£` and 17 `en-GB` literals; report text byte-identical                                                                                   | 1     | IN-1                   | Sonnet | ~20 files: `app/lib/money-format.js` (new), `app/lib/book-checks*.js`, `app/lib/report-generator.js`, `app/lib/report-indicators.js`, `app/lib/calculators/{se,taxi,se-derivations}.js`, `app/products/*.js`, `public/diya-gl/shell.js` |
| IN-4    | Additive schema fields: `documentInfo.diya-gl:jurisdiction`, the line `diya-gl:type` pattern, the product enum values; every example's canonical text unchanged                                                                               | 1     | —                      | Sonnet | ~4 files: `public/schema/diya-gl-book-v2.schema.json`, `public/schema/diya-gl-lines-v2.schema.json`, `app/test/diya-gl-schema.test.js`, `app/test/diya-gl-canonical.test.js`                                       |
| IN-5    | The UK parity proofs: a jurisdiction-absent test over every `examples/*` book against `examples/parity/*`; a test that `taxDataHash` ignores `app/data/in/`                                                                               | 1     | IN-1, IN-2, IN-4       | Sonnet | ~3 files: `app/test/jurisdiction-default-uk.test.js` (new), `app/test/provenance-tax-data-hash.test.js` (new), `scripts/build-provenance-data.mjs`                                                                 |
| IN-6    | `defaultCurrency` honoured: the page formatter reads it; a shared check warns when a line's `amountCurrency` differs                                                                                                                       | 1     | IN-3                   | Sonnet | ~5 files: `app/lib/book-checks.js`, `app/lib/money-format.js`, `public/diya-gl/shell.js`, `app/test/book-checks.test.js`, `web/browser-tests/`                                                                     |
| IN-7    | `app/data/in/fy-2025-2026.toml` and `fy-2026-2027.toml`: slabs, 87A, surcharge, cess, 44AD/44ADA, 44AA, 44AB, GST thresholds, rates, composition, TDS table, PF/ESI, advance tax dates; each value with its source in a comment              | 2     | IN-2                   | Opus   | ~3 files: the two TOMLs, `app/lib/tax/in/tax-year.js` (new)                                                                                                                                                       |
| IN-8    | `app/lib/tax/in/income-tax.js` and `presumptive.js` with hand-computed cases                                                                                                                                                              | 2     | IN-7                   | Opus   | ~4 files: the two modules, `app/test/tax/in-income-tax.test.js`, `app/test/tax/in-presumptive.test.js`                                                                                                             |
| IN-9    | `app/lib/tax/in/gst.js`: intra/inter split from state codes, ITC set-off order, composition levy, RCM, the GSTR-3B summary tables                                                                                                          | 2     | IN-7                   | Opus   | ~2 files: the module and its test                                                                                                                                                                                  |
| IN-10   | `app/lib/tax/in/tds.js` (194C/H/I/J/O, the 26AS ledger) and `payroll.js` (PF, ESI, PT by state)                                                                                                                                             | 2     | IN-7                   | Sonnet | ~4 files: the two modules and their tests                                                                                                                                                                          |
| IN-11   | The `in:` line keys in the lines schema and `app/lib/diya-gl-edits-in.js` (GST sale, GST purchase, TDS, advance tax, payroll adds)                                                                                                        | 2     | IN-4, IN-9, IN-10      | Sonnet | ~4 files: the lines schema, the edits module, `app/test/diya-gl-edits-in.test.js`, `app/lib/diya-gl-engine.js`                                                                                                     |
| IN-12   | Product `Proprietor`: chart, P&L, computation of income (presumptive against actual), ITR-4 map, GST summary, book checks, headlines, an example book, a golden `report.json`                                                                | 2     | IN-8, IN-9, IN-11      | Opus   | ~8 files: `app/products/in/proprietor.js`, `app/lib/calculators/in/proprietor.js`, `app/lib/book-checks/in/proprietor.js`, `examples/in-proprietor-latest/*`, `examples/parity/in-proprietor/*`, tests             |
| IN-13   | The `in` formatting profile: en-IN grouping, ₹, dd-mm-yyyy, the FY and Tax Year labels                                                                                                                                                    | 2     | IN-3                   | Sonnet | ~3 files: `app/lib/money-format.js`, `app/lib/tax/in/tax-year.js`, tests                                                                                                                                           |
| IN-14   | The India page `in-proprietor.html` from the shell, on the diya-gl site root DG-1e creates (`web/diya-gl.co.uk/public/`): the lamp mark, the accent token, the regime and presumptive pickers, the ITR-4 view                              | 2     | IN-12, IN-13, DG-1e    | Sonnet | ~6 files: the page, `in.css` (new), `shell.js`, `products/`, `web/browser-tests/diya-gl-in-proprietor.browser.test.js` (new), `app/lib/sitemap-builder.js`                                                          |
| IN-15   | Product `Professional`: 44ADA and books-based, the GST regular scheme with ITC, the TDS receivable ledger against 26AS                                                                                                                       | 2     | IN-12                  | Opus   | ~8 files, as IN-12 for `professional`                                                                                                                                                                             |
| IN-16   | Product `CabDriver`: `Proprietor` plus the 194-O receipt type and a takings view                                                                                                                                                          | 2     | IN-12                  | Sonnet | ~6 files, as IN-12 for `cab-driver`                                                                                                                                                                                |
| IN-17   | Product `PrivateLimited`: Schedule III statements, the regime choice, TDS payable by section, PF/ESI/PT payroll                                                                                                                             | 3     | IN-15                  | Opus   | ~10 files, as IN-12 for `private-limited`                                                                                                                                                                          |
| IN-18   | The `resident-diya-gl-in` bundle in Submit's catalogue (INR, yearly, 49900), UPI enabled, `diyaGlEntitlement.js` reading either bundle                                                                                                       | 3     | LP-21, DG-3a, H-IN-1, GA4 save-rate gate | Sonnet | ~4 files: `../submit.diyaccounting.co.uk/web/public/submit.catalogue.toml`, `app/services/diyaGlEntitlement.js`, `.env.ci`, `.env.prod`                                                                            |
| IN-19   | The India page's tier strip and panel in rupees: the "On this device" row (DG-4), the 24h sandbox label (DG-2b), the ₹499 offer where DG-3b puts the upgrade                                                                               | 3     | IN-14, DG-3b, DG-4, GA4 save-rate gate | Sonnet | ~3 files: `web/diya-gl.co.uk/public/cloud.js`, `shell.js`, `web/browser-tests/diya-gl-cloud.browser.test.js`                                                                                                       |
| IN-20   | GA4: a `jurisdiction` dimension on LP-9's events; the India price-test events                                                                                                                                                             | 3     | LP-9, IN-14            | Sonnet | ~3 files: `public/lib/analytics.js`, `public/diya-gl/diya-gl-events.js`, `web/unit-tests/diya-gl-events.test.js`                                                                                                   |
| IN-21   | The lamp mark and the accent token in the brand repository, consumed by the India page                                                                                                                                                    | 3     | LU-13, IN-14           | Sonnet | ~3 files in the brand repository, `public/diya-gl/in.css`                                                                                                                                                          |
| IN-22   | Copy: the MCP server description, the package README and the spec page say which jurisdictions the build reads; a spec section for the `in:` extension                                                                                     | 3     | IN-12                  | Sonnet | ~4 files: `app/lib/mcp/server.js`, `diya-gl/README.md`, `public/diya-gl.html`, `app/bin/build-sitemaps.js`                                                                                                        |
| H-IN-1  | An OIDAR GST registration quote (registration, authorised representative, monthly GSTR-5A) from an Indian CA; the number the GA4 save-rate gate reads against                                                                             | 1     | —                      | operator | —                                                                                                                                                                                                                  |
| H-IN-2  | Register `diya-gl.in`, `diyagl.in`, `diya-gl.co.in` in the management account through Route 53 (decided 2026-09-19)                                                                                                                       | 1     | —                      | operator | Route 53 (887764105431)                                                                                                                                                                                            |
| H-IN-3  | The IP India public search for DIYA and DIYA-GL in classes 9 and 42; the Madrid-or-direct decision                                                                                                                                         | 3     | H-IN-2, H-LU-4         | operator | —                                                                                                                                                                                                                  |
| H-IN-4  | An Indian CA reviews `app/data/in/fy-2026-2027.toml` and the `Proprietor` golden report before the page is public                                                                                                                          | 2     | IN-12                  | operator | —                                                                                                                                                                                                                  |
| H-IN-5  | Read Stripe's UPI fee for the GB account in the Dashboard and enable UPI                                                                                                                                                                  | 3     | GA4 save-rate gate     | operator | dashboard.stripe.com                                                                                                                                                                                               |

Phase 1 (IN-1 to IN-6) benefits the UK alone and lands on its own; H-IN-1 and H-IN-2 run
beside it. Phase 2 needs nothing from Submit. Phase 3 is commerce and brand, and its paid-tier
rows (IN-18, IN-19, H-IN-5) wait on the GA4 save-rate gate.

## Briefs

**IN-1, the registry.** Create `app/lib/jurisdictions.js` exporting `JURISDICTIONS` (`uk` now,
`in` later) with per-jurisdiction `products`, `taxYearFileName`, `dataDir`, `locale` and
`currency`, and `jurisdictionOf(book)` reading `book.documentInfo["diya-gl:jurisdiction"]`,
returning `"uk"` when absent and throwing on any other unknown value. `productOf` in
`app/lib/product-workbook.js` and `productModule` in `app/lib/products.js` resolve through the
registry; `loadTaxDataForBook` reads `dataDir`. Re-export from `diya-gl-engine.js`. Acceptance:
`npm test` green, `diya-gl/parity.sh` unchanged on all four products, a new test that a book with
no jurisdiction resolves to `uk` and a book with `"xx"` throws.

**IN-2, the move.** `git mv app/lib/tax/*.js app/lib/tax/uk/` and `git mv app/lib/tax-year.js
app/lib/tax/uk/tax-year.js`; update every importer (`grep -rn "lib/tax/\|tax-year" app scripts
web`); the registry's `uk` entry points at the moved modules; `scripts/build-diya-gl-bundle.mjs`
still bundles them. No logic changes, no reformatting. Acceptance: `npm test` green including the
parity job; `git diff --stat` shows import lines and renames only.

**IN-3, the formatter.** Add `app/lib/money-format.js` with `formatMoney(value, profile)` and
`formatDate(date, profile)` where a profile is `{ currency, locale, dateStyle }`; the `uk`
profile is `{ currency: "GBP", locale: "en-GB" }`. Replace each `£`/`en-GB` literal in the
listed files with a call, keeping `fmt()` in `app/products/*.js` producing the same string
(`toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })` with no
symbol). Acceptance: `product-fmt-canonical.test.js` and every report fixture byte-identical;
`grep -rn "£\|en-GB" app/lib app/products public/diya-gl/shell.js` returns only the profile
definition and comments.

**IN-4, the schema.** In `diya-gl-book-v2.schema.json` add `documentInfo."diya-gl:jurisdiction"`
(enum `["uk","in"]`, default `"uk"`, description naming absence as `uk`) and the product enum
values `Proprietor`, `Professional`, `CabDriver`, `PrivateLimited`; in
`diya-gl-lines-v2.schema.json` add `"diya-gl:type"` (string, pattern `^[a-z]{2}:[a-z0-9-]+$`).
Acceptance: `diya-gl-schema.test.js` proves the new fields validate and an unknown jurisdiction
fails; `diya-gl-canonical.test.js` proves `canonicalBookToml` and `canonicalLinesJsonl` for every
`examples/*` book are unchanged; the bundle's standalone validators regenerate.

**IN-5, the proofs.** `app/test/jurisdiction-default-uk.test.js` loads each `examples/<name>`
book, asserts no `diya-gl:jurisdiction`, runs `readBookSource` and compares `report.json` and
`bookchecks.json` with `examples/parity/<product>`. `app/test/provenance-tax-data-hash.test.js`
computes `taxDataHash()` before and after writing a temporary `app/data/in/probe.toml` and asserts
equality. Acceptance: both pass; `scripts/build-provenance-data.mjs` gains a comment naming the
top-level-only rule as deliberate.

**IN-6, the currency check.** In `app/lib/book-checks.js` add a shared warning `currency-agrees`
that lists every line whose `amountCurrency` is set and differs from
`documentInfo.defaultCurrency`; the page formatter takes `defaultCurrency` and the jurisdiction
locale from the profile. Acceptance: a test with a EUR line on a GBP book warns with the entry
numbers; every example book warns nothing; the page shows GBP unchanged.

**IN-7, the data.** Write `app/data/in/fy-2025-2026.toml` and `fy-2026-2027.toml` from section
"Indian compliance" of this plan, one table per topic (`[income_tax.new_regime]`,
`[income_tax.old_regime]`, `[rebate_87a]`, `[surcharge]`, `[cess]`, `[presumptive]`,
`[books_and_audit]`, `[gst]`, `[gst.composition]`, `[tds]`, `[payroll]`, `[advance_tax]`), every
value with its source URL in a trailing comment, and `[financial_year]` with `label`,
`tax_year_label`, `start`, `end`. `app/lib/tax/in/tax-year.js` names the file for a period end.
Acceptance: both files parse with smol-toml; a test asserts the FY 2026-27 slab table matches
the plan's table; H-IN-4 reviews.

**IN-8, income tax.** `calculateIncomeTaxIn(income, rates, { regime })` returns slab tax, 87A
rebate with marginal relief, surcharge with marginal relief, cess and the total;
`presumptiveProfit({ turnoverCash, turnoverDigital, receipts }, rates, scheme)` returns the
deemed profit and whether the scheme's limits hold. Acceptance: tests for ₹12,00,000 (zero),
₹12,10,000 (marginal relief), ₹60,00,000 (surcharge), old regime ₹5,00,000 (zero), 44AD at
₹50,00,000 digital (₹3,00,000), 44ADA at ₹40,00,000 (₹20,00,000), each breakable.

**IN-9, GST.** `splitGst(gross, rate, { supplierState, placeOfSupplyState })` returns net and
the CGST/SGST or IGST parts; `setOff(credits, liabilities)` applies IGST first; `compositionLevy`
and `reverseCharge` helpers; `gstr3bSummary(lines, book)` fills tables 3.1 and 4. Acceptance:
tests with the plan's ₹10,000 example, an inter-state case, a set-off case with leftover IGST
credit, a composition quarter, and a corrupted-cell proof.

**IN-10, TDS and payroll.** `tdsFor(section, amount, cumulative, rates)` applies the threshold
and rate per section; `form26asLedger(lines)` sums `in:tds-deducted` by deductor GSTIN/PAN;
`pfEsi(gross, rates)` and `professionalTax(gross, state, rates)`. Acceptance: tests for each
section at and just over its threshold; Maharashtra and Karnataka PT; the ₹21,000 ESI edge.

**IN-11, the edits.** Add the `in:*` keys and the GST `taxCode` values to the lines schema;
`app/lib/diya-gl-edits-in.js` exports `addGstSaleLine`, `addGstPurchaseLine`, `addTdsLine`,
`addAdvanceTaxLine`, `addPayrollLineIn`, each writing `diya-gl:type` and the `in:` keys and
posting the accounts in the plan's table. Acceptance: tests that each edit produces lines that
validate, balance, and canonicalise deterministically; every UK example still validates.

**IN-12, the Proprietor product.** `app/products/in/proprietor.js` with a chart (4000 sales,
5xxx purchases, 1100/2100 debtors and creditors, 1301–1303 and 2201–2205 GST, 1401/1402 and
2301–2305 tax ledgers), `reportSections` for P&L, computation of income, GST summary and the
ITR-4 map, `HEADLINES`, `checkCompliance`; the calculator and the checks under `in/`; an example
book `examples/in-proprietor-latest/` for FY 2026-27 with a golden report under
`examples/parity/in-proprietor/`. Acceptance: the golden report reproduces byte-for-byte through
the CLI, the MCP `report` tool and the bundle; every check is proved breakable; H-IN-4 signs the
golden figures.

**IN-13, the profile.** The `in` profile in `money-format.js`: `Intl.NumberFormat("en-IN", {
style: "currency", currency: "INR" })`, dates `dd-mm-yyyy`, labels from
`app/lib/tax/in/tax-year.js`. Acceptance: tests that 1234567.89 formats as ₹12,34,567.89 and
2026-04-01 as 01-04-2026; the FY 2026-27 label; nothing in the `uk` profile changes.

**IN-14, the page.** Build `public/diya-gl/in-proprietor.html` from the shell as `bst.html` was,
with the lamp beside the mark, `--diya-in-accent`, the regime and presumptive pickers bound to
`entityInformation`, the ITR-4 view, and the FY label in the header. Acceptance: a Playwright
test loads the example, edits a sale, sees ₹ grouping and the CGST/SGST split, saves the zip;
the sitemap lists the page; the four UK pages' tests unchanged.

**IN-15 to IN-17, the other products.** As IN-12 for each product, with its own chart, forms
and golden report; IN-15 adds the ITC and 26AS ledgers to the report, IN-16 the 194-O receipt
type and the takings view from `taxi.js`, IN-17 the Schedule III statements and the payroll
journal. Acceptance as IN-12.

**IN-18, the bundle.** In `submit.catalogue.toml` add `[[bundles]] id = "resident-diya-gl-in"`
with `stripePriceAmount = 49900`, `stripeCurrency = "inr"`, `stripeInterval = "year"`,
`tokensGranted` and refresh as `resident-diya-gl`, listed in every environment once H-IN-1 is
done and the GA4 save-rate gate has opened; run `scripts/stripe-setup.js --dry-run` then live. Acceptance: the price exists in Stripe
test and live; the bundles page shows it to a signed-in user; DG-3's entitlement reads either
bundle.

**IN-19 to IN-22.** IN-19: the India page's tier strip and panel show DG-4's "On this device"
row, DG-2b's sandbox label and DG-3b's upgrade offer with the ₹499 price, formatted through the
`in` profile. IN-20: every event from
`diya-gl-events.js` carries `jurisdiction`; a `price_test` event with the variant. IN-21: the
lamp SVG and the accent token in the brand repository, pinned by the page. IN-22: the copy reads
"UK and Indian" where a build carries both jurisdictions, and the spec page documents
`diya-gl:jurisdiction`, `diya-gl:type` and the `in:` keys with the same field table as the UK
subset. Acceptance: the browser tests, the unit tests on the events, and the sitemap.

## Sources

Files read, 2026-09-18:

- This repository: `CLAUDE.md`, `../CLAUDE.md`, `.claude/skills/plain-prose/SKILL.md`,
  `PLAN_DIYA_GL_LAUNCH.md` (§3, §4, §5, decisions, task list, LP-4, LP-21),
  `PLAN_DIYA_GL_HOME.md` (design (b) to (e), decisions, task list),
  `PLAN_DIYACCOUNTING_BRAND.md`, `NEXT.md` (the board columns and DG-1 to DG-3, read only),
  `app/lib/diya-gl-schema.js`, `app/lib/diya-gl-engine.js`, `app/lib/diya-gl-calculator.js`,
  `app/lib/diya-gl-canonical.js`, `app/lib/diya-gl-interchange.js`, `app/lib/diya-gl-loader.js`
  (`extractTaxDataFromBook`), `app/lib/diya-gl-edits.js`, `app/lib/product-workbook.js`
  (`loadTaxDataForBook`, `resolveInputs`), `app/lib/products.js`, `app/lib/tax-year.js`,
  `app/lib/tax/*.js`, `app/lib/calculators/shared.js`, `app/lib/book-checks.js`,
  `app/lib/headlines.js`, `app/lib/provenance.js`, `scripts/build-provenance-data.mjs`,
  `scripts/build-diya-gl-bundle.mjs`, `scripts/build-runner.mjs`, `app/products/bst.js`,
  `app/products/ltd.js` (CELL_MAP), `app/data/se-2026-2027.toml`, `app/data/ltd-2026.toml`,
  `public/schema/diya-gl-book-v2.schema.json`, `public/schema/diya-gl-lines-v2.schema.json`,
  `public/diya-gl.html` (headings), `public/diya-gl/autosave.js`, `public/diya-gl/shell.js`
  (formatting), `public/diya-gl/bundle-resources.js`, `diya-gl/README.md`, `diya-gl/parity.sh`,
  `.github/workflows/test.yml` (the parity job), `examples/` listing, `app/test/` listing.
- Submit: `../submit.diyaccounting.co.uk/web/public/submit.catalogue.toml` (`resident-diya-gl`),
  `../submit.diyaccounting.co.uk/scripts/stripe-setup.js` (`findOrCreatePrice`).
- bedrock-meter: `seed/app/lib/accountant/schema.mjs`, `seed/app/lib/accountant/fx.mjs`,
  `seed/app/lib/accountant/pricing.mjs` (grep), `seed/app/ontology/pricing-pinned.json`,
  `seed/reference-docs/PLAN_BEDROCK_ACCOUNTANT.md` (risks), `packages/runtime/src/currency.mjs`,
  `packages/runtime/test/currency.test.mjs`, `README.md`, `archive/PLAN_PROVENANCE.md` (grep).
- Local lookups: `whois -h whois.nixiregistry.in diya-gl.in`, `diyagl.in`, `diya-gl.co.in`
  (all "available for registration", 2026-09-18T22:54Z).

Web, all accessed 2026-09-18:

- S1 Tax Year replaces AY from 1 April 2026: https://taxguru.in/income-tax/income-tax-act-2025-shift-assessment-year-tax-year.html and https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/objective-and-scope-new-act
- S2 Income-tax Act, 2025: https://en.wikipedia.org/wiki/Income-tax_Act,_2025
- S3 ITR due dates FY 2025-26: https://cleartax.in/last-date-to-file-itr and https://www.indiafilings.com/income-tax-filing/new-due-date-for-filing-itr-2025-26
- S4 ITR-4 Sugam and ITR-3: https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/file-itr-4-sugam-online and https://cleartax.in/s/itr-3-vs-itr-4-difference
- S5 Advance tax instalments: https://cleartax.in/s/advance-tax and https://www.taxbuddy.com/blog/advance-tax-payment
- S6 GST return calendar, QRMP, HSN digits: https://cleartax.in/s/gst-calendar and https://cleartax.in/s/gstr-1
- S7 AOC-4, MGT-7/7A, statutory audit for every company: https://taxguru.in/company-law/mca-annual-filing-aoc-4-mgt-7-compliance-guide.html and https://cleartax.in/s/private-limited-company-auditing-requirements
- S8 LLP Form 8, Form 11, audit thresholds: https://taxguru.in/corporate-law/annual-filing-llp-form-8-form-11.html
- S9 TDS deposit and return dates, Form 16A: https://cleartax.in/s/tds-payment-due-dates-and-penalties
- S10 Slabs, 87A, standard deduction, cess FY 2025-26: https://cleartax.in/s/income-tax-slabs and https://www.incometaxindia.gov.in/w/what-is-rebate-under-section-87a-for-f.y-2025-26-and-who-can-claim-it-
- S11 Budget 2026 leaves slabs unchanged: https://www.axismaxlife.com/blog/tax-savings/income-tax-slab-2026-27 and https://www.canarahsbclife.com/blog/budget-news/budget-2026-income-tax-slabs-changes-salaried-self-employed
- S12 87A old regime: https://tax2win.in/guide/section-87a
- S13 Old regime slabs and surcharge: https://cleartax.in/s/marginal-relief-surcharge and https://www.bajajfinserv.in/investments/income-tax-slabs
- S14 44AD: https://cleartax.in/s/section-44ad-presumptive-scheme
- S15 44ADA: https://cleartax.in/s/section-44ada and https://taxconcept.net/income-tax/presumptive-taxation-new-thresholds-under-sections-44ad-44ada-and-44ae-for-2025/
- S16 Section 58 of the 2025 Act: https://taxguru.in/income-tax/presumptive-taxation-simplified-income-tax-act-2025-merges-44ad-44ada-44ae.html
- S17 44AA: https://www.incometaxindia.gov.in/w/maintenance-of-books-of-accounts and https://cleartax.in/s/books-of-accounts-and-audit-requirements-for-freelancers
- S18 44AB: https://tax2win.in/guide/section-44ab-income-tax-audit and https://www.taxsocial.pro/article/tax-audit-limit-ay-2026-27-section-44ab-44ad-44ada-thresholds-cash-receipts-test-basic-exemption-limit-decoded
- S19 GST registration thresholds, special category states, composition limits and rates: https://cleartax.in/s/gst-registration-limits-increased and https://razorpay.com/learn/gst-composition-scheme-benefits/
- S20 GST 2.0 rates from 22 September 2025: https://www.ey.com/en_in/technical/alerts-hub/2025/09/gst-council-announces-major-rate-rationalization-and-trade-facilitation-measures and https://busy.in/gst/gst-slabs-5-percent-18-percent/
- S21 Place of supply, IGST Act s.12: https://cleartax.in/v/gst/gst-acts/igst-section-12-place-of-supply-of-services-where-location-of-supplier-and-recipient-is-in-india
- S22 ITC and GSTR-2B, s.16(2)(aa): https://cleartax.in/s/gst-section-162aa-avail-itc
- S23 CMP-08 and GSTR-4: https://cleartax.in/s/gstr4-composition-dealer-gst-return
- S24 GSTR-9 and GSTR-9C thresholds: https://cleartax.in/s/gstr-9-annual-return and https://www.bajajfinserv.in/gstr-9c
- S25 E-invoicing ₹5cr from 1 August 2023: https://cleartax.in/s/e-invoicing-businesses-above-rs-5-crore-turnover and https://www.gstcouncil.gov.in/node/4365
- S26 Reverse charge s.9(3), s.9(4): https://cleartax.in/s/reverse-charge-gst and https://gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Reverse%20charge%20Mechanism.pdf
- S27 TDS rate chart: https://cleartax.in/s/tds-rate-chart
- S28 Budget 2025 TDS threshold changes and 194-O: https://taxgarden.in/blog/tds-threshold-changes-fy-2025-26-budget-2025-new-limits-india and https://www.terra-insight.com/insights/section-194o-tds-0-1-percent-current-rate-history-india/
- S29 TCS 206C(1H) removed: https://taxguru.in/income-tax/tcs-sale-goods-removed-april-1-2025-faqs.html
- S30 Form 26AS, AIS, TIS: https://vakilsearch.com/article/form-26as-ais-tis-india-2026-itr-filing/
- S31 Corporate rates, 115BAA, 115BAB, MAT: https://cleartax.in/s/section-115-baa-tax-rate-domestic-companies and https://taxclue.in/income-tax-slab-for-companies
- S32 LLP and firm rates, AMT: https://www.incometaxindia.gov.in/w/tax-rates%E2%80%8B and https://www.bajajfinserv.in/income-tax-slab-partnership-firm
- S33 Schedule III Division I: https://www.icai.org/resource/56994bos46206cp5annex.pdf and https://tallysolutions.com/accounting/schedule-iii-division-i-meaning-applicability-and-financial-statement-format-for-companies/
- S34 EPF, ESI, Form 16: https://empxtrack.com/blog/esi-pf-statutory-compliance/ and https://www.epfindia.gov.in/site_docs/PDFs/MiscPDFs/ContributionRate.pdf and https://calcguru.in/epf-wage-ceiling-25000/
- S35 Professional tax: https://ezhrm.in/professional-tax-india-2026-state-wise-slabs-filing-guide/ and https://www.motilaloswal.com/personal-finance/tax/what-is-professional-tax-tax-slab-rates-and-how-to-pay-the-p-tax
- S36 Indian numbering and en-IN: https://en.wikipedia.org/wiki/Indian_numbering_system and https://codes.jarhalab.com/guides/how-to-format-inr-with-indian-numbering-system
- S37 India GDP per capita: https://statisticstimes.com/economy/country/india-gdp-per-capita.php and https://www.imf.org/external/datamapper/NGDPDPC@WEO/OEMDC/ADVEC/WEOWORLD
- S38 UK GDP per capita: https://statisticstimes.com/economy/country/uk-gdp-per-capita.php
- S39 India subscription and SaaS price points: https://qz.com/india/1873128/amazon-prime-video-spotify-apple-music-priced-lowest-in-india, https://www.notebookcheck.net/Netflix-Indian-streaming-subscription-plan-dropped-as-low-as-INR-199-per-month-for-any-device.585539.0.html, https://www.itforsme.in/pricing/notion-india, https://www.playto.so/blogs/how-to-price-your-saas-for-indian-vs-international-customers-in-2026
- S40 Zoho Books India pricing and free plan: https://www.patronaccounting.com/blog/zoho-books-pricing-india-2026 and https://www.zoho.com/blog/books/free-edition-of-zoho-books-india.html
- S41 Vyapar and TallyPrime pricing: https://www.itforsme.in/pricing/vyapar-india and https://www.erpresearch.com/pricing/tallyprime
- S42 GBP/INR: https://www.xe.com/en-us/currencyconverter/convert/?Amount=1&From=GBP&To=INR
- S43 Stripe UPI (business locations include GB; recurring; limits): https://docs.stripe.com/payments/upi
- S44 Stripe accounts in India, invite-only, no UPI: https://support.stripe.com/questions/supported-payment-methods-currencies-and-businesses-for-stripe-accounts-in-india and https://www.skydo.com/people-ask/does-stripe-support-upi-in-india
- S45 Stripe UK international card fees: https://www.wearefounders.uk/stripe-fees-uk-2026/ and https://checkoutpage.com/blog/stripe-international-fees
- S46 RBI e-mandates: https://www.khaitanco.com/thought-leaderships/RBI-enhances-transaction-limits-for-processing-of-e-mandates-for-recurring-transactions:-from-INR-5000-to-INR-15000 and https://docs.stripe.com/india-recurring-payments
- S47 Razorpay for foreign businesses without an Indian entity: https://razorpay.com/blog/how-to-accept-payments-from-indian-customers-without-a-local-entity/ and https://razorpay.com/blog/razorpay-rbi-cross-border-licence-global-payments/
- S48 Razorpay fees: https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/
- S49 Stripe minimum charge amounts: https://docs.stripe.com/currencies
- S50 OIDAR registration for foreign suppliers: https://www.india-briefing.com/news/oidar-compliance-india-gst-registration-ntor-gstr5a-digital-tax-43951.html and https://treelife.in/legal/oidar-registration-in-india/
- S51 Equalisation levy abolished: https://www.akmglobal.com/blog/income-tax-update-no-equalization-levy-from-april_1/
- S52 The diya lamp: https://en.wikipedia.org/wiki/Diya_(lamp)
- S53 Route 53 registers .in: https://docs.aws.amazon.com/en_en/Route53/latest/DeveloperGuide/in.html
- S54 NIXI foreign registrants and KYC: https://www.registry.in/about-registry and https://domainindia.com/support/kb/comprehensive-guide-to-kyc-and-e-kyc-requirements-for-in-and-nixi-managed-domain
- S55 "Diya" marks on the Indian register listings: https://www.startupwala.com/trademarks-registration/search-DELHI-DIYA-GOLD-5891994 and https://www.quickcompany.in/trademarks/3262270-diya-outdoor-media
- S56 Indian trade mark fees and Madrid: https://www.intepat.com/blog/trademark-registration-fees-india and https://www.intepat.com/blog/madrid-protocol
