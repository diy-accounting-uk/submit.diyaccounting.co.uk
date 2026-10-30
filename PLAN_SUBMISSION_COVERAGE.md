<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Submission coverage: the values a filer could have that we do not take

For each Companies House and HMRC submission kind, the elements its schema or API allows that our web form, the diya-gl book, the spreadsheets packages or our builder do not take, each with a value as an optional field. Each high or medium gap has a proposed row under its part; OGAP1 picks which go on `NEXT.md`.

## Part 1. Companies House kinds and the CT600 (GAP1, Companies House agent)

Read at main `0739a3bcb` (worktree `rook-gap-ch`). CHG1 (PR #568, `claude/ltd-ch-facts`, CHG1-1 to CHG1-7) is the starting state for small accounts: registered office parts, report facts, accountants' report, bank borrowings and tax/social security, accruals, going concern, revenue, tangible asset, impairment, financial instrument, current income tax and dividend policies, controlling party. None of it is repeated below.

**Bulk method.** First 2,000 `.html` files of `target/companies-house-review/adp/Accounts_Bulk_Data-2026-10-27.zip` (20,668 files). Facts counted as distinct concepts per filing, prefix-independent (older filings use `uk-bus`, `ns5`). Groups: dormant (`bus:EntityDormantTruefalse` true) 253; micro (`bus:Micro-entities` member) 796; small filleted (`bus:FilletedAccounts` member) 301; small full 650 (the remainder: full accounts, many on default members, so it includes audited and non-FRS 102 files and overstates audit-related concepts). All groups file on the FRS-102 entry points (2023 to 2026). "Cohort" frequencies below are n/N of the group. A cohort frequency says how often filers tag a concept, not that Companies House requires it.

**Allowed by (all accounts kinds).** The FRS 102 2026 entry point `https://xbrl.frc.org.uk/FRS-102/2026-01-01/FRS-102-2026-01-01.xsd`: `bus-2026-01-01.xsd` (485 concepts), `frc-core-2026-01-01.xsd` (6,211), `direp`/`accrep`/`aurep` report modules (431 `direp` in our fixture list). Our builders tag 119 concept keys (`CONCEPTS` in `app/services/accountsIxbrlCommon.js`); CHG1 adds about 25.

**Suppliers.** diya-gl (1.2.59) publishes `PubBalSht` F6, E10, E11 (Trade Debtors), E12, E16, E17, E18, E19, E29, E30, F31, F36, F39 and `PubNotes` for five tangible classes. Its FRS 105 format file (`dist/app/data/filing/frs105-formats.toml`) marks "Called up share capital not paid" and "Prepayments and accrued income" `no-sheet-figure` (the template prints nil). The ltd product has no intangible, investment, provision, accrual or prepayment lines. Hire purchase agreements feed creditors due after one year (`PubBalSht` E30). Goodwill appears only as a P&L write-off (`MnthP&L` B38).

---

### Micro-entity accounts

Sources: FRS 102 2026 entry point above; bulk group `micro` (796); `frs105-formats.toml` for the statutory headings (SI 2008/409 Schedule 1 Section C, https://www.legislation.gov.uk/uksi/2008/409/schedule/1); page `web/public/companies-house/fileMicroEntityAccounts.html`.

Taken: 6 balance sheet lines for 2 years, optional P&L, employees, one signing director, dormant switch, share class and nominal value, 4 statements, period dates.

| Element (cohort n/796) | Web form | diya-gl | Spreadsheets | Builder | Value |
|---|---|---|---|---|---|
| `AccruedLiabilitiesNotExpressedWithinCreditorsSubtotal` (247, 31%) and `AccruedLiabilitiesDeferredIncome` (66, 8%): "Accruals and deferred income" heading | no | `no-sheet-figure` | no cell | no | Medium: a statutory heading of the micro format; a company with accruals folds them into creditors today |
| `PrepaymentsAccruedIncomeNotExpressedWithinCurrentAssetSubtotal` (222, 28%): "Prepayments and accrued income" | no | `no-sheet-figure` | no cell | no | Medium: same reason, current assets side |
| `CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset` (124, 16%) | no | `no-sheet-figure` | no cell | no | Medium: new-company shells (see dormant, 42%) |
| `ProvisionsForLiabilitiesBalanceSheetSubtotal` (112, 14%) | no | none | none | no | Low: deferred tax and dilapidations; rare in a micro book |
| Directors' advances and credits (`AdvancesCreditsDirectors` 18, `GeneralDescriptionAdvancesCreditsToDirectors...` 28, repaid/made 11-17) | no | the book holds a director's loan as a liability only (E29); an overdrawn account has no line | `Directors Loan` E29 | no | Medium: a legal note when a director owes the company (s413 CA 2006); 2-4% of filers, but the overdrawn director's account is the commonest owner-manager item |
| Financial commitments, guarantees and contingencies (`DescriptionFinancialCommitmentsOtherThanCapitalCommitments` 18, `OffBalanceSheetItems` 15; 2%) | no | none | none | no | Low |
| Second and later directors (61% of micro filings name 2 or more officers; mean 1.8) | one `directorName` | the book holds directors | n/a | one `NameEntityOfficer` | Low: one signing director meets the law; extra names are presentation |
| `StartDateForPriorPeriod` / `EndDateForPriorPeriod` (83, 10%) | no | derivable | derivable | no (contexts carry the dates) | Low |
| `NameOrLocationAccountantsOffice` (22, 3%), `DateAccountantsReport` (20, 3%) | no (CHG1 adds name and statement) | none | none | no | Low: belongs beside the CHG1 accountants' report |
| Template flags: `CompanyHasPublishedCommitmentToUKEffectiveStewardshipCodeTruefalse` (126), `InvestmentEntityRequiredToApplyExceptionFromConsolidationTruefalse` (126), `DefinedBenefitPlanMulti-employerPlanTruefalse` (110), `...ExemptionFromReportingDisclosure...` (32-71), `CompanyHasActedAsAnAgentDuringPeriodTruefalse` (42), report-type flags (`ReportIncludesStrategicReportTruefalse` 16, interim/initial 12-16) | no | none | none | no | None: set by two vendor templates; no reader acts on them |

### Dormant accounts

Sources: as micro; bulk group `dormant` (253); `fileMicroEntityAccounts.html` dormant mode.

Taken: dormant flag, trading status member (never traded / no longer trading), share class and nominal value, section 480 statement.

| Element (cohort n/253) | Web form | diya-gl | Spreadsheets | Builder | Value |
|---|---|---|---|---|---|
| `CompanyHasActedAsAnAgentDuringPeriodTruefalse` (182, 72%) | no | none | none | no | Medium: the most common untaken tag, one boolean, one line of code |
| `CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset` (106, 42%) plus `CalledUpShareCapitalNotPaid` (3) | no (unpaid capital shows as current assets) | `no-sheet-figure` | no cell | no | Medium: dormant shells whose only entry is unpaid share capital |
| `NumberSharesAllotted` (158, 62%) | no (we tag `NumberSharesIssuedFullyPaid`) | none | none | no | Low: the same count is already tagged on another concept |
| `StartDateForPriorPeriod` / `EndDateForPriorPeriod` (14, 6%) | no | n/a | n/a | no | Low |
| Policy and exemption tags (`FinancialInstrumentsClassificationPolicy` 7, `CashCashEquivalentsPolicy` 6, `FunctionalPresentationCurrencyPolicy` 7, `OtherDebtors` 11, 5% or fewer) | no | none | none | no | None for a company with no transactions |
| `DateAuditorsReport` (11), `NameEntityAuditors` (2) | no | n/a | n/a | no | None: audit-exempt companies file no auditor's report |

### Small accounts, full set

Sources: as above; bulk group `small-full` (650, caveat above); CHG1 plan section "Design: the values Companies House's examples carry (CHG1)", `git show origin/claude/ltd-ch-facts:PLAN_COMPANIES_HOUSE.md`; page `fileSmallCompanyAccounts.html`.

Taken (main): 11 balance sheet lines, both P&L formats with 9 to 16 lines, 5-class tangible asset note, tax policy, accounting policies, principal activity, employees, directors, 4 statements. CHG1 adds the values listed at the top.

| Element (cohort n/650) | Web form | diya-gl | Spreadsheets | Builder | Value |
|---|---|---|---|---|---|
| `DeferredTaxPolicy` (425, 65%) | no | none | none | no (CHG1-6 adds the current tax policies only) | Medium: the second most common policy tag; one text box |
| `DescriptionDepreciationMethodForPropertyPlantEquipment` (422, 65%), `PropertyPlantEquipmentPolicy` (129, 20%) | no | none (the note carries charges, not the method) | `PubNotes` has classes only | no | Medium: sits beside the tangible fixed asset note we already build |
| `InventoriesPolicy` (283, 44%), `DefinedContributionPensionsPolicy` (270, 42%), `CashCashEquivalentsPolicy` (215, 33%), `FinancialInstrumentsClassificationPolicy` (170, 26%), `EmployeeBenefitsPolicy` (159, 24%), `ForeignCurrencyTranslationOperationsPolicy` (114, 18%), `FunctionalPresentationCurrencyPolicy` (107, 16%), `LeasesPolicy` (103, 16%) | no | none | none | no | Medium as one group: pure text, same shape as the CHG1 policies |
| `OtherDebtors` (384, 59%), `TradeDebtorsTradeReceivables` (350, 54%), `PrepaymentsAccruedIncome` (102, 16%): the debtors split | one `debtors` line | E11 is labelled Trade Debtors | E11 only | `core:Debtors` | Medium: E11 already labels trade debtors, so a trade debtors tag needs no new input; other debtors and prepayments need form lines |
| `OtherTaxationSocialSecurityPayable` (355, 55%), `Value-addedTaxPayable` (filleted 31, 10%) | no (CHG1 adds one combined `TaxationSocialSecurityPayable`) | E18 combined | E18 combined | no | Low: CHG1's combined line meets the balance sheet; a VAT/PAYE split needs ledger kinds the sheet merges |
| `ProvisionsForLiabilitiesBalanceSheetSubtotal` (262, 40%) | no | none | none | no | Medium: shown as a balance sheet line; no book kind exists, so form only |
| `AmountsOwedToGroupUndertakings` (66, 10%), `AmountsOwedToDirectors` (filleted 44, 15%) | no | director's loan is E29 inside creditors after one year | E29 | no | Medium: the director's loan is the commonest creditor of an owner-managed company and is published, but lands inside "after one year" with no line of its own |
| Intangible assets: `IntangibleAssets` (133, 20%), `IntangibleAssetsGrossCost` (127, 20%), `AccumulatedAmortisationImpairmentIntangibleAssets` (120, 18%), `DescriptionRecognitionBasisMeasurementIntangibleAssets` (77, 12%) | no | none | goodwill write-off only (`MnthP&L` B38) | no | Medium: a second fixed asset note; form only until the book gains an intangible kind |
| `InvestmentsFixedAssets` (117, 18%), `InvestmentProperty` (84, 13%) | no | none | none | no | Low |
| `TotalAdditionsIncludingFromBusinessCombinationsPropertyPlantEquipment` (205, 32%) | no | note has additions per class | `PubNotes` | no (per-class additions only) | Low: a total on a note we already build |
| `FinanceLeaseLiabilitiesPresentValueTotal` (filleted 29, 10%) | no | hire purchase agreements exist (E30) | E30 | no | Low |
| `StatementThatMembersHaveAgreedToPreparationAbridgedAccountsUnderSection444CompaniesAct2006` (95, 15%) | no | n/a | n/a | no | Low: needed only for abridged accounts, which we do not file |
| `DateAuditorsReport` (232), `NameEntityAuditors` (83) | no | n/a | n/a | no | None: audit-exempt only |
| Template flags (stewardship code 284, investment entity 284, wholly-owned exemption 288) | no | none | none | no | None |

### Small accounts, filleted set

Sources: as small full; bulk group `small-filleted` (301); CHG1-6 (RJB Electrical filleted example).

Taken: the same as small full less the P&L page. CHG1-6 adds accruals, current tax note, current income tax and dividend policies.

| Element (cohort n/301) | Web form | diya-gl | Spreadsheets | Builder | Value |
|---|---|---|---|---|---|
| `PropertyPlantEquipmentPolicy` (257, 85%) | no | none | none | no | Medium: the most common filleted policy; fold into the policy group above |
| `TradeDebtorsTradeReceivables` (173, 57%), `OtherDebtors` (108, 36%) | no | E11 | E11 | no | Medium: as small full |
| `DescriptionDepreciationMethodForPropertyPlantEquipment` (165, 55%) | no | none | none | no | Medium |
| `InventoriesPolicy` (122, 41%), `DefinedContributionPensionsPolicy` (61, 20%), `IntangibleAssetsPolicy` (60, 20%), `CashCashEquivalentsPolicy` (49, 16%), `ForeignCurrencyTranslationOperationsPolicy` (48, 16%), `TradePayablesPolicy` (44, 15%), `ProvisionsPolicy` (44, 15%), `ShareCapitalPolicy` (42, 14%), `FunctionalPresentationCurrencyPolicy` (42, 14%), `TradeReceivablesPolicy` (39, 13%), `LeasesPolicy` (35, 12%), `DeferredTaxPolicy` (37, 12%), `ContentOtherSpecificAccountingPolicy` (59, 20%) | no | none | none | no | Medium as one group |
| `OtherTaxationSocialSecurityPayable` (102, 34%), `Value-addedTaxPayable` (31, 10%) | no | E18 | E18 | no | Low: as small full |
| `TaxationIncludingDeferredTaxationBalanceSheetSubtotal` (62, 21%), `ProvisionsForLiabilitiesBalanceSheetSubtotal` (48, 16%) | no | none | none | no | Low to medium |
| `AmountsOwedToDirectors` (44, 15%), `AccruedLiabilitiesDeferredIncome` (40, 13%) | no (CHG1-6 adds accruals) | E29 | E29 | no | Medium for directors' loan; accruals are CHG1-6 |
| `StartDateForPriorPeriod` / `EndDateForPriorPeriod` (128, 43%) | no | n/a | n/a | no | Low: the comparative contexts already carry the dates |
| `BankBorrowings` (36, 12%), `BankOverdrafts` (26, 9%) | no (CHG1 tags the combined `BankBorrowingsOverdrafts`) | E19 | E19 | no | Low: CHG1's combined concept is also valid |
| Intangibles (48-57, 16-19%), `InvestmentsFixedAssets` (37, 12%), `NameParentEntity` (22, 7%), `NameOrLocationAccountantsOffice` (26, 9%) | no | none | none | no | Low to medium: intangibles as small full; the parent name belongs to the CHG1 controlling party |

---

### Confirmation statement

Sources: gateway schemas `ConfirmationAndVerificationStatement-v1-0.xsd`, `ConfirmationStatement-v1-3.xsd`, `baseTypes-v3-7.xsd` (checked in under `fixtures/companies-house-xmlgw/`; the download index is http://xmlgw.companieshouse.gov.uk/SchemaStatus, which lists `PSCBaseTypes-v1-4` and `baseTypes` up to the versions we hold); builder `app/services/companiesHouseConfirmationStatementXml.js`; page `fileConfirmationStatement.html` and `.page.js`.

Taken: 9 of 14 root children (ReviewDate, SICCodes up to four, StatementOfCapital with one Capital, Shareholdings with joint holders up to ten, RegisteredEmailAddress, AcceptLawfulPurposeStatement, StateConfirmation, VerificationStatement/Director). The five market flags are sent as constant `false`.

| Element | Web form | diya-gl | Spreadsheets | Builder | Value |
|---|---|---|---|---|---|
| `Shareholdings/Transfers` (DateOfTransfer, NumberSharesTransferred; up to 200) | no | no share register | no | yes (the builder emits it) | Medium: the builder takes it and the page cannot; a shareholding that changed by transfer has no way to report it |
| Joint holder address: `Thoroughfare`, `County`, `OtherForeignCountry` in place of `Country` | premise, street, post town, postcode, country only | no | no | `Thoroughfare` and `County` yes; `OtherForeignCountry` no | Low |
| `StatementOfCapital/Capital` repeated for a second currency (maxOccurs unbounded) | one currency | no | no | one `Capital` | Low |
| `TradingOnMarket`, `DTR5Applies`, three `PSCExempt...` flags | no | no | no | constant false | Low: only for listed companies; true values would need a fee-model change |
| `VerificationStatement/Member` (the LLP choice) | no | no | no | director path only | Low: LLP filing is a separate product decision |

### PSC verification statement

Sources: `PSCVerificationStatement-v1-0.xsd`, `PSCBaseTypes-v1-4.xsd` (its `PSCVerificationStatementType` has one choice, `Individual`, with `Change/VerificationDetails`); builder `app/services/companiesHousePscVerificationStatementXml.js`; service `web/public/lib/services/companies-house-psc-verification-service.js`.

Count taken: 8 of 8 (Title, Surname, Forename, OtherForenames, PartialDOB, CompaniesHousePersonalCode, VerificationStatements, NameMismatchReason). No gap.

### Registered office change and registered email change

Sources: Companies House Filing API, https://developer-specs.company-information.service.gov.uk/manipulate-company-data-api-filing/reference/registered-office-address/create and `.../registered-email-address/create`; builders `companiesHouseRegisteredOfficeAddressPost.js` and `companiesHouseRegisteredEmailAddressPost.js`; pages `changeRegisteredOffice.html`, `changeRegisteredEmail.html`.

Count taken: office 9 of 9 writable properties (premises, address_line_1, address_line_2, locality, region, postal_code, country, accept_appropriate_office_address_statement, reference_etag); email 2 of 2 (registered_email_address, accept_appropriate_email_address_statement). No gap.

---

### CT600 and its computations

Sources: CT600 (2026) Version 3 form and notes, https://www.gov.uk/government/publications/corporation-tax-company-tax-return-ct600-2015-version-3 (form PDF https://assets.publishing.service.gov.uk/media/69c543424a06660f085442bd/ct600.pdf, updated 2026-04-01); box list with RIM v1.994 XML paths in `node_modules/@diy-accounting-uk/diya-gl/dist/app/data/filing/ct600-v3.toml` (276 boxes); HMRC CT technical specifications https://www.gov.uk/government/publications/corporation-tax-technical-specifications-xbrl-and-ixbrl (updated 2026-05-15; CT Computations Format 1.1, 20 November 2025: https://assets.publishing.service.gov.uk/media/691c7cd40dcbf6343e9a2999/ct-computations-format-version-1.1.pdf); accepted taxonomies https://www.gov.uk/government/publications/taxonomies-accepted-by-hm-revenue-and-customs (ct-comp 2025, 1,762 concepts in `fixtures/hmrc-ct-comp/ct-comp-2025-concepts.json`); builder `app/services/ct600Xml.js`, `ct600Figures.js`, `ctComputationsIxbrl.js`.

Taken: 42 of 276 boxes. The CT600 sheet in the diya-gl book supplies 30 boxes (30, 35, 145, 155, 160, 165, 170, 235, 315, 327, 328, 330-345, 380-395, 430, 435, 440, 475, 510, 515, 525, 528, 595, 600, 620) and all 30 are emitted, so every cell a book can supply is taken. The other 12 are typed facts (1-4, 326, 329, 690, 705, 710, 975, 985). Computation: 5 adjustment lines of about 140 prescribed in Format 1.1 (credits, depreciation, amortisation, entertaining, capital allowances total).

| Element | Web form | diya-gl | Spreadsheets | Builder | Value |
|---|---|---|---|---|---|
| Trading loss: boxes 275 (losses of this or a later period), 285 (carried forward and claimed), 780 and 790 (amount arising), computation `AdjustedLossOfPeriod` | none; the return refuses ("the book makes a trading loss; the loss boxes (780 onward) have no diya-gl cell yet", `ct600Figures.js`) | CorporationTax K26 (b/f) only; no loss-arising cell | no loss-arising cell | refuses | High: a company that made a loss cannot file at all; start-up and loss years are the common case |
| Donations: computation `AdjustmentsDonations` (book cell `MnthP&L` B37) with boxes 305/300 | none | the toml maps B37; "the sheet does not add this back" | warning only | not emitted; the expense stays in trading profit | Medium: a book with donations files a computation that disagrees with the form's treatment; the data is already in the book |
| Property income: box 190 (and 250 UK property losses), computation `AdjustmentsPropertyReceiptsPerAccounts` / `...PropertyExpensesPerAccounts` | none | none | none | no | Medium: investment companies with lettings; needs a property income source first |
| Reliefs claimed in the calculation: 245 management expenses, 255 capital allowances for management, 310/312 group relief, 445/450 (CITR, double tax relief) | none | none | none (box 295 reads nil) | no | Low: investment, group and overseas companies |
| R&D: boxes 650-685 (enhanced expenditure), 530/541 credits, 142 form CT600L, computation `AdjustmentsAdditionalDeductionForQualifyingRDExpenditureSME` | none | none | none | no | Medium: a frequent small-company claim; large (supplementary page, notification form, claim figures) |
| Associated companies and rate lines: 350-375, 400-425 (second and third rate line) | none | rows 33-34 give two lines only | two lines | two lines per financial year | Low: covers the tax-rate split for periods that straddle a rate change in three lines |
| Loans to participators: box 480 and form CT600A (95 supplementary page ticked, 485) | none | the book has an overdrawn director's account only as a negative liability | none | no | Medium: an overdrawn director's loan account at year end owes section 455 tax; today the return omits it |
| Repayment and payment details: 40, 860, 865, 870, 920-940 (bank details), 945-970 (nominee) | none | none | none | no | Low: a repayment can be left on account |
| Return questions: 5-8 (Northern Ireland), 45, 50, 55, 60, 65, 70, 75, 616-618 (exporter), 625-645 | none | none | none | no | Low: tick boxes that default to "no"; exporter information is the one a filer may have to answer |
| Supplementary pages CT600B to CT600N (boxes 96-144) | none | none | none | no | None for the ltd product's customers until a product row asks for one (the sheet carries no cell) |
| Capital allowance classes: 688-775 (full expensing, special rate pool, structures, EV charge-points, zero-emission vehicles, qualifying expenditure) | AIA and main pool only | main pool only (`MainPool...` lines) | main pool and AIA | 690, 705, 710 only | Medium: full expensing is the main relief for new plant since 2023 and has its own boxes (688/689); the builder emits only 690, 705 and 710 |
| Computation Format 1.1 Section 1 Parts 2 to 7 (about 90 lines): disallowable expenditure (fees, leased cars, motor travel, penalties, pensions, bad debts) and deductions | none | the format file lists them with no sheet cell except depreciation, entertaining, goodwill, donations | none | 4 lines | Low: the book holds only the lines already taken; each added line needs a book cell first |
| Amended return (`ReturnType="amended"`), `Sender` other than `Company`, accounts for a different period (boxes 85, 90) | none | none | none | `new` and `Company` only | Low: the amended path is the DF2c design, not a coverage gap |

---

### Proposed rows

Labels follow the row shape. All rows are Companies House or CT600; none is boarded.

- [ ] **GAP1-CH1. CT600 trading loss: file the return when the period makes a loss.** The return refuses a trading loss today (`ct600Figures.js`, "the loss boxes (780 onward) have no diya-gl cell yet"). Emit box 780 (loss arising), 275 and 285 when a loss is used against profits of the same or a later period, 790 where the loss is overseas, the computation `AdjustedLossOfPeriod` line, and a loss brought forward that exceeds the profit as carried forward. The CT600 sheet in the book has no loss-arising cell: add one in `../spreadsheets.diyaccounting.co.uk` (CorporationTax K22 negative and CT600 loss rows) on a `claude/*` branch and PR, then release diya-gl and read it. Default to carry-forward only; carry-back is a form choice that needs its own input. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~9 files.
- [ ] **GAP1-CH2. Micro and dormant balance sheet headings: accruals, prepayments, unpaid share capital, provisions.** Add the four statutory micro format 1 headings the page lacks: "Called up share capital not paid" (`CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset`, 16% of micro and 42% of dormant filers), "Prepayments and accrued income" (28%), "Accruals and deferred income" (31%), "Provisions for liabilities" (14%), on both years, in the totals, form only (the diya-gl format file marks the first two `no-sheet-figure`). Add `direp:CompanyHasActedAsAnAgentDuringPeriodTruefalse` (false) on dormant sets (72% of dormant filers). Builders in `microEntityAccountsIxbrl.js`, request in `companiesHouseAccountsPost.js`, page `fileMicroEntityAccounts.html`, the review reconcile list, the browser test and screenshots. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~8 files.
- [ ] **GAP1-CH3. Small accounts: the debtors and creditors breakdown.** Add optional lines `tradeDebtors`, `otherDebtors`, `prepayments`, `provisionsForLiabilities`, `amountsOwedToDirectors` and `amountsOwedToGroupUndertakings` to the small company balance sheet, tagged `TradeDebtorsTradeReceivables`, `OtherDebtors`, `PrepaymentsAccruedIncome`, `ProvisionsForLiabilitiesBalanceSheetSubtotal`, `AmountsOwedToDirectors`, `AmountsOwedToGroupUndertakings`, in the totals, with the rule that an absent line changes nothing. The sheet fill reads `PubBalSht` E11 as `tradeDebtors` and E29 (director's loan) as `amountsOwedToDirectors` instead of folding the loan into creditors after one year. Filled bulk cohorts: trade debtors 54-57%, other debtors 36-59%, provisions 16-40%, directors 15%. Starts after CHG1-2 and CHG1-3 (same builder, request and page). **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~10 files.
- [ ] **GAP1-CH4. Small accounts: the second accounting policy set.** Extend `SMALL_COMPANY_POLICY_FIELDS` (CHG1-2 and CHG1-6 create the list) with `PropertyPlantEquipmentPolicy` (85% filleted), `DescriptionDepreciationMethodForPropertyPlantEquipment` (55-65%), `DeferredTaxPolicy` (65% full), `InventoriesPolicy`, `DefinedContributionPensionsPolicy`, `CashCashEquivalentsPolicy`, `EmployeeBenefitsPolicy`, `ForeignCurrencyTranslationOperationsPolicy`, `FunctionalPresentationCurrencyPolicy`, `LeasesPolicy`, `FinancialInstrumentsClassificationPolicy`, as optional text boxes under the "More accounting policies" details block, in the order the examples use, with the review reconcile entries. Pure text, no totals. Blocked by CHG1-2, CHG1-6. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.
- [ ] **GAP1-CH5. Intangible assets note (goodwill) in small accounts.** Add a second fixed asset note for intangible assets (cost at start, additions, disposals, amortisation at start, charge, disposals, tags `IntangibleAssets`, `IntangibleAssetsGrossCost`, `AccumulatedAmortisationImpairmentIntangibleAssets`, policy `IntangibleAssetsPolicy`), cohort 16-20% of small filers. Form only first; a diya-gl intangible kind (the book already writes goodwill off in `MnthP&L` B38) is a spreadsheets step. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.
- [ ] **GAP1-CH6. Confirmation statement: share transfers and the full holder address.** Add `Shareholdings/Transfers` (date and number, up to 200) per holding on `fileConfirmationStatement.page.js`, and `Thoroughfare` and `County` on each joint holder's address (the builder already takes both transfers and these fields). Add the page's review lines and the preview. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.
- [ ] **GAP1-CH7. CT600: loans to participators and donations.** Two derivations the book can feed. (a) Donations: when `MnthP&L` B37 is above zero, add `AdjustmentsDonations` back in the computation and claim the amount in box 305 (and 300) so the form and the book agree; today the expense stays in trading profit. (b) An overdrawn director's loan account at the period end: tick box 95, set box 480 (tax at the section 455 rate) and refuse the return with a message that names form CT600A as the step the filer must add, until CT600A itself is built. Blocked by GAP1-CH1 (same figures module). **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.
- [ ] **GAP1-CH8. CT600: full expensing and the other capital allowance classes.** Take boxes 688/689 (full expensing in the trading calculation), 693/694, 695/700 and 735/760/775 from typed inputs on the CT600 page, with the matching `Section 2` computation lines, so a filer who claims full expensing does not fold it into the main pool figure. Blocked by GAP1-CH1. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

Not proposed (low or none): dormant `NumberSharesAllotted` (the same count is tagged on `NumberSharesIssuedFullyPaid`), prior-period date facts, vendor-template boolean flags, auditor facts, market flags and the LLP `Member` choice on the confirmation statement, supplementary pages CT600B to N, R&D claim (medium value but a project of its own with CT600L and the notification form; a `NEXT.md` row after the operator names the customer need), return question ticks, repayment and bank details.

## Part 2. GAP1 HMRC share: VAT and ITSA

Method: each API's OpenAPI and JSON request schemas were downloaded from `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/download/<api>/<version>/` and flattened to leaf fields (scratchpad `hmrcspec/`). Our side: `web/public/hmrc/**` forms and page scripts, the request builders in `app/functions/hmrc/`, the MCP tools in `mcp/lib/itsa-tools.js` and `mcp/lib/submit-tools.js`, `@diy-accounting-uk/diya-gl` 1.2.59 (`deriveVatReturn`, `deriveItsaQuarterlyUpdate`, `deriveItsaAnnualSubmission`, `deriveUkPropertyPeriod`, `deriveUkPropertyAnnual`), and the spreadsheets repository's `app/data/hmrc/sa103-mtd-mapping.json` (the SA103 workbook's box to API field map).

Builder column. Every ITSA builder (`buildMoneySection` and its siblings) passes any field it is given into the HMRC body, so "builder" is "yes" for every field below and the MCP tools take free-form sections too. The gap in every row is the web form, and, where the book supplies the figure, the books-import widget (`web/public/widgets/books-import.js`) which tells the filer "The form has no field for these figures from the book" and drops them.

Spreadsheets column. The spreadsheets repository has Self Employed (SA103), Basic Sole Trader, Company and Taxi packages and no landlord package. A "yes" means the SA103F box exists in the SE workbook.

### HMRC VAT return

Spec: VAT (MTD) 1.0, `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0` (POST `/organisations/vat/{vrn}/returns`). Fields: `periodKey`, the nine boxes (`vatDueSales`, `vatDueAcquisitions`, `totalVatDue`, `vatReclaimedCurrPeriod`, `netVatDue`, `totalValueSalesExVAT`, `totalValuePurchasesExVAT`, `totalValueGoodsSuppliedExVAT`, `totalAcquisitionsExVAT`) and `finalised`.

No gaps. 11 of 11 fields taken: the form, `buildVatReturnBody` (`finalised: true`) and `deriveVatReturn` (all nine boxes, to the penny for 1 to 5 and whole pounds for 6 to 9) agree.

### VAT Assist

Spec: VAT Assist (MTD) 1.0 (`mtd-transaction-risking`). HMRC lists the API on the Developer Hub with no documentation page (`.../service/vat-assist/1.0` and `.../vat-assist-api/1.0` return no specification), so the optional-field list cannot be taken from a published schema yet. `app/lib/hmrcAssistApi.js` sends `periodKey` plus the nine boxes. The comparison is open until HMRC publishes the specification (early adopters from January 2027, general from April 2027). Count: 10 of 10 known fields taken. No row; the existing HMRC Assist plan owns the contract.

### Self-employment period summary (cumulative, 2025-26 onward, and dated, 2023-24 to 2024-25)

Spec: Self Employment Business (MTD) 5.0, `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-employment-business-api/5.0` (PUT `/individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}`; POST and PUT `.../period`).

| field | web form | diya-gl | spreadsheets | builder | value |
|---|---|---|---|---|---|
| periodIncome.taxTakenOffTradingIncome | no | no (not derived) | yes (SA103F box 82) | yes | medium: reduces tax due and is printed on the return, so a filer who has it must file elsewhere; few filers have it |

35 of 36 fields taken (dates, turnover, other income, 15 expenses, `consolidatedExpenses`, 15 disallowable expenses).

### Self-employment annual submission

Spec: Self Employment Business (MTD) 5.0 (PUT `.../annual/{taxYear}`), 34 leaf fields in the 2026-27 definition (earlier years differ; `overlapReliefUsed` and the 2025-26 vehicle and charge-point allowances are gone by year).

| field | web form | diya-gl | spreadsheets | builder | value |
|---|---|---|---|---|---|
| allowances.structuredBuildingAllowance[] (amount, firstYear.qualifyingDate, firstYear.qualifyingAmountExpenditure, building.name, building.number, building.postcode) | no | yes (box 53, filed as an array, one item per claim) | yes (box 53, Fixed assets Schedule) | yes (array passes through) | high: the book already computes the claims and the import drops them, so a filer with a claim under-states the allowance and has no other path in Submit |
| allowances.enhancedStructuredBuildingAllowance[] (same six leaves) | no | yes (box 53.1) | yes | yes | medium: Freeport sites only, but it is the same widget as the row above |
| adjustments.averagingAdjustment | no | no | yes (box 72) | yes | low: farmers, market gardeners and creative artists only |
| adjustments.adjustmentToProfitsForClass4 | no | no | yes (box 102) | yes | low: HMRC flag "test only" for 2026-27 |
| allowances.firstYearAllowanceOnPlantAndMachinery | no | no | no | yes | low: HMRC flag "test only" for 2026-27; no source |

19 of 34 fields taken (9 adjustments, 9 allowances including `tradingIncomeAllowance`, `class4NicsExemptionReason`).

### UK property period summary (cumulative and dated)

Spec: Property Business (MTD) 6.0, `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/property-business-api/6.0` (PUT `.../uk/{nino}/{businessId}/cumulative/{taxYear}`; POST and PUT `.../uk/.../period`). 19 leaf fields in the cumulative body.

| field | web form | diya-gl | spreadsheets | builder | value |
|---|---|---|---|---|---|
| ukProperty.expenses.premisesRunningCosts | no | yes | no landlord package | yes | high: the common landlord cost (rent, rates, power, insurance); the form has only repairs and "other" |
| ukProperty.expenses.financialCosts | no | yes | no | yes | high: mortgage and loan costs |
| ukProperty.expenses.professionalFees | no | yes | no | yes | high: agent and accountancy fees, a standard SA105 line |
| ukProperty.expenses.costOfServices | no | yes | no | yes | high: cleaning, gardening, service charges |
| ukProperty.expenses.travelCosts | no | yes | no | yes | high: property travel |
| ukProperty.expenses.residentialFinancialCost | no | yes | no | yes | high: mortgage interest relief figure on residential lets |
| ukProperty.expenses.consolidatedExpenses | no | yes | no | yes | medium: the simplified route for income under the threshold; mutually exclusive with the itemised lines |
| ukProperty.income.premiumsOfLeaseGrant | no | yes | no | yes | medium: lease premiums, occasional |
| ukProperty.income.reversePremiums | no | yes | no | yes | low: rare |
| ukProperty.income.taxDeducted | no | yes | no | yes | medium: tax deducted at source by letting agents of non-resident landlords |
| ukProperty.income.rentARoom.rentsReceived | no | no | no | yes | medium: rent-a-room is a common small-landlord case |
| ukProperty.expenses.rentARoom.amountClaimed | no | no | no | yes | medium: pairs with the line above |
| ukProperty.expenses.residentialFinancialCostsCarriedForward | no | no | no | yes | low: carry-forward figure the filer holds |

6 of 19 fields taken (`fromDate`, `toDate`, `periodAmount`, `otherIncome`, `repairsAndMaintenance`, `other`).

### UK property annual submission

Spec: Property Business (MTD) 6.0 (PUT `.../uk/{nino}/{businessId}/annual/{taxYear}`), 24 leaf fields in the 2025-26 definition.

| field | web form | diya-gl | spreadsheets | builder | value |
|---|---|---|---|---|---|
| allowances.structuredBuildingAllowance[] (six leaves) | no | no (not in `deriveUkPropertyAnnual`) | no | yes | medium: commercial landlords; reuses the self-employment widget |
| allowances.enhancedStructuredBuildingAllowance[] (six leaves) | no | no | no | yes | low: Freeport sites only |
| allowances.firstYearAllowanceOnPlantAndMachinery | no | no | no | yes | low: HMRC flag "test only" for 2026-27 |

12 of 24 fields taken (3 adjustments, `nonResidentLandlord`, `rentARoom.jointlyLet`, 5 itemised allowances, `propertyIncomeAllowance`; the remaining 12 leaves are the two building-allowance arrays above).

### Foreign property

Spec: Property Business (MTD) 6.0 foreign property period (cumulative and dated), annual submission and property details endpoints. Submit has no foreign property journey; `hmrcItsaBsasTriggerPost.js` accepts only `self-employment` and `uk-property`. diya-gl and the spreadsheets packages have no foreign property source.

| field | web form | diya-gl | spreadsheets | builder | value |
|---|---|---|---|---|---|
| whole endpoint family: details create and update, period (cumulative and dated), annual submission; BSAS trigger and adjust for foreign property | no | no | no | no | medium: foreign rental income is inside the Income Tax (MTD) scope; a new journey of the UK property shape, with a country code per entry |

0 of the family taken.

### Losses and claims

Spec: Individual Losses 7.0, `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/individual-losses-api/7.0` (PUT `.../loss-claims/{taxYear}`). 8 of 8 fields taken (`claims.carryBack` x3, `claims.carrySideways`, `claims.preferenceOrder.applyFirst`, `claims.carryForward` x2, `losses.broughtForwardLosses`). No gaps.

### Tax liability adjustments

Spec: Individuals Tax Liability Adjustments 1.0 (PUT `/individuals/tax-liability/adjustments/{nino}/{taxYear}`).

| field | web form | diya-gl | spreadsheets | builder | value |
|---|---|---|---|---|---|
| taxRefundedOrSetOff.amount | no | no | no | yes | low: HMRC release flag, test only; no source |

3 of 4 fields taken.

### BSAS adjustments (self-employment and UK property)

Spec: Business Source Adjustable Summary 7.0, `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-assessment-bsas-api/7.0`. Trigger: 4 of 4 fields taken (`accountingPeriod.startDate`, `.endDate`, `typeOfBusiness`, `businessId`). Final declaration and calculation trigger carry no body field beyond the path values and `calculationType`; taken.

| field | web form | diya-gl | spreadsheets | builder | value |
|---|---|---|---|---|---|
| self-employment `income.other`, 14 further `expenses.*` (all but costOfGoods), `expenses.consolidatedExpenses`, 15 `additions.*Disallowable` | no | no | no | yes | low: an adjustment is a delta against HMRC's own summary and the filer can amend the period instead; no book source |
| uk-property `ukProperty.income` (premiumsOfLeaseGrant, reversePremiums, otherPropertyIncome), 9 `expenses.*` except repairsAndMaintenance | no | no | no | yes | low: same reason |

Self-employment adjust: 3 of 33 taken (`income.turnover`, `expenses.costOfGoods`, `zeroAdjustments`). UK property adjust: 3 of 14 (`totalRentsReceived`, `repairsAndMaintenance`, `zeroAdjustments`).

### Not compared

Read-only endpoints (obligations, business details, ITSA status, period lists, calculation retrieve, receipts, VAT obligations, liabilities, payments, penalties) send no filer data. The ITSA Assist report (Self Assessment Assist 1.0) sends no body. MCP tool schemas pass free-form sections, so they take every field the builders do.

### Proposed rows

- [ ] **GAP1-H1. UK property period form: the other income and expense fields.** The form takes 6 of the 19 cumulative fields and the book import reports the rest as "no field for these figures". Add `premisesRunningCosts`, `financialCosts`, `professionalFees`, `costOfServices`, `travelCosts`, `residentialFinancialCost`, `consolidatedExpenses` (mutually exclusive with the itemised lines, as `deriveUkPropertyPeriod` already enforces), `premiumsOfLeaseGrant`, `reversePremiums`, `taxDeducted`, `rentARoom.rentsReceived`, `rentARoom.amountClaimed` and `residentialFinancialCostsCarriedForward` to `web/public/hmrc/itsa/ukPropertyPeriod.html` and `.page.js` (read, fill, send, with an "itemise or consolidate" choice), and to `UK_PROPERTY_PERIOD_FIELDS` in `web/public/widgets/books-import.js` so the 10 book-supplied figures fill. The dated model (2023-24, 2024-25) carries the same income and expense names under `ukProperty` and the builder already passes them. Reuse the grouping the self-employment page takes from `web/public/lib/self-employment-expenses.js`. Spec: Property Business 6.0 `uk_property_cumulative_summary_create_and_amend`. Tests: a browser test that fills every field and asserts the request body, a books-import unit test for the 10 derived fields, and the visual definition of done (screenshots, `visual-review`). **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.
- [ ] **GAP1-H2. Self-employment annual: Structured Buildings Allowance claims.** Add repeatable rows for `allowances.structuredBuildingAllowance[]` and `enhancedStructuredBuildingAllowance[]` (amount, first-year qualifying date, qualifying expenditure, building name, number, postcode) to `web/public/hmrc/itsa/annualSubmission.html` and `.page.js`; send them (the builder `buildAllowancesSection` already passes the arrays; confirm the rule that they cannot be sent with `tradingIncomeAllowance`); make the books import (`kind "uk-property-annual"` sibling for self-employment) fill them from `deriveItsaAnnualSubmission`, which already returns box 53 and 53.1 as arrays. Spec: Self Employment Business 5.0 `createAmendAnnualSubmission`. Build the row widget so GAP1-H4 reuses it. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.
- [ ] **GAP1-H3. Self-employment quarterly update: tax taken off trading income.** Add `periodIncome.taxTakenOffTradingIncome` (SA103F box 82) as a money field under turnover and other income on `web/public/hmrc/itsa/selfEmploymentPeriod.html` and `.page.js` and on the amend page `selfEmploymentPeriodAmend`, read it back in "Load current total", and send it in `periodIncome` for the cumulative model and the dated 2024-25 model (`periodSummary/def2/period_income.json` carries it too). `deriveItsaQuarterlyUpdate` does not supply it, so the import leaves it blank. Spec: Self Employment Business 5.0 `createAmendCumulativePeriodSummary`. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.
- [ ] **GAP1-H4. UK property annual: Structured Buildings Allowance claims.** Add the same repeatable rows as GAP1-H2 for `ukProperty.allowances.structuredBuildingAllowance[]` and `enhancedStructuredBuildingAllowance[]` to `web/public/hmrc/itsa/ukPropertyAnnualSubmission.html` and `.page.js`; the builder `buildAllowancesSection` in `hmrcItsaUkPropertyAnnualPut.js` already passes the arrays. Starts after GAP1-H2 lands the row widget. Spec: Property Business 6.0 `uk_property_annual_submission_create_and_amend`. **Source**: GAP1. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.
- [ ] **GAP1-H5. Foreign property journey.** Foreign property income has no page, Lambda or route in Submit. Design and build the Property Business 6.0 foreign property endpoints Submit does not call: create and update property details, the cumulative period summary (2025-26 onward), the dated period summary, the annual submission, and `typeOfBusiness: foreign-property` for the BSAS trigger and adjustments. Needs a plan first (country code per entry, SA106 box map, whether the book chart gets a `diya-gl:foreignPropertyField` tag in the diya-gl package); no book source exists today, so the first version is forms only. Spec: `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/property-business-api/6.0`. **Source**: GAP1. **Owner**: Claude Code. **Model**: Opus (design), then Sonnet. **Size**: ~30 files.

### GAP1-H5 design: the foreign property journey

Read at main `d77564ba5`. Spec: Property Business (MTD) 6.0 OAS (`https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/property-business-api/6.0/oas/file` and the files it refers to), Business Source Adjustable Summary 7.0 OAS (`.../self-assessment-bsas-api/7.0/oas/file`), and HMRC's box map `mapping/csv/sa106_mapping_v2.csv` in `github.com/hmrc/income-tax-mtd-changelog`. The first version is forms only. The UK property journey is the pattern for every part.

**What the API asks for, by tax year.** Each request carries a list of entries. The key of an entry changes with the tax year.

| Tax year | Period endpoint | Entry key | Extra section |
|---|---|---|---|
| 2024-25 and before | dated: POST `period`, PUT `period/{submissionId}` | `countryCode` | `foreignFhlEea` (FHL in the EEA) |
| 2025-26 | cumulative: PUT `cumulative` | `countryCode` | none |
| 2026-27 on | cumulative: PUT `cumulative` | `propertyId` | none |

- The annual submission follows the same split: `def1` (2024-25 and before, `countryCode`, `foreignFhlEea`), `def2` (2025-26, `countryCode`), `def3` (2026-27 on, `propertyId`).
- The BSAS adjustment has four shapes: `foreignProperty[]` (2023-24 and before), `foreignProperty.countryLevelDetail[]` with `foreignFhlEea` (2024-25), `countryLevelDetail[]` (2025-26), `propertyLevelDetail[]` (2026-27 on). `zeroAdjustments: true` is the other choice from 2024-25.
- A `propertyId` comes from "Create Foreign Property Details" (2026-27 on). The request has `propertyName` (1 to 105 characters, unique in a country), `countryCode`, and an optional `endDate` with `endReason`. The answer is `{ propertyId }`.
- HMRC refuses two entries with the same country (`RULE_DUPLICATE_COUNTRY_CODE`) or the same property (`RULE_DUPLICATE_PROPERTY_ID`). It refuses itemised and consolidated expenses in one entry (`RULE_BOTH_EXPENSES_SUPPLIED`).
- The dated model requires `foreignTaxCreditRelief` (true or false) and `rentIncome.rentAmount` in each country entry. The cumulative model makes both optional.

**Decisions.**

| Topic | Decision |
|---|---|
| Country code | ISO 3166-1 alpha-3, upper case, as the API pattern `^[A-Z]{3}$` needs. The page stores the code and shows the English short name |
| Country list | `web/public/lib/country-codes.js`: the ISO 3166-1 list without `GBR`, with `JEY`, `GGY` and `IMN` in it. UK property goes on the UK journey |
| Country check on the server | The Lambda checks the pattern only. HMRC checks the list and its `RULE_COUNTRY_CODE` shows under the country field |
| Several countries (2024-25, 2025-26) | One fieldset per country. "Add another country" adds one. Each fieldset has "Remove". A country chosen in one fieldset is not offered in the others |
| Several properties (2026-27 on) | The page reads the property list from "Retrieve Foreign Property Details" and shows one fieldset per property, headed "<name> (<country>)". "Add a property" opens `foreignPropertyDetails.html` |
| Several properties in one country (2025-26 and before) | The person adds them up into the one country entry. The hint says so |
| Empty entry | An entry with no figures is left out of the body. A body with no entries is refused on the page |
| Expenses per entry | Each entry has its own "itemise or one total" choice, the same as the UK property page |
| Amounts | Pounds sterling. The hint says to convert at the rate of the day or an average rate |
| Book source | No `diya-gl:foreignPropertyField` tag in the first version. The tag shape for a later version is in row H5c |
| Periods list | `hmrcItsaUkPropertyPeriodsGet` serves both types already (the HMRC path has no type). The foreign pages call it as it is |
| BSAS trigger | `VALID_TYPES_OF_BUSINESS` in `hmrcItsaBsasTriggerPost.js` gets `foreign-property` |
| Losses | `lossesAndClaims.html` takes `foreign-property` today (SA106 box FOR31). No change |
| Dashboard | A `foreign-property` pick routes steps 3 to 8 to the foreign pages. The diversion note stays for the other business types |
| Stack | The ten new Lambdas go in `HmrcItsaStack`. Each async pair costs about ten resources, so the stack goes from about 180 to about 280 of the 500 |

**SA106 box map.** From `sa106_mapping_v2.csv`. Field names are relative to one `foreignProperty` entry.

| Box | SA106 name | API field | Endpoint |
|---|---|---|---|
| FOR14 | Total rents and other receipts | `income.rentIncome.rentAmount` + `income.otherPropertyIncome` | period |
| FOR14.1 | Property income allowance | `allowances.propertyIncomeAllowance` (at most 1,000) | annual |
| FOR14.2 | Traditional accounting | no API field | none |
| FOR15 | Number of overseas let properties | no API field | none |
| FOR16 | Premiums for the grant of a lease | `income.premiumsOfLeaseGrant` | period |
| FOR17 | Allowable property expenses | `expenses.*` itemised, or `expenses.consolidatedExpenses` | period |
| FOR19 | Private use adjustment | `adjustments.privateUseAdjustment` | annual |
| FOR20 | Balancing charges | `adjustments.balancingCharge` | annual |
| FOR21 | Capital allowances | `allowances.otherCapitalAllowance` | annual |
| FOR21.1 | Zero-emission car allowance | `allowances.zeroEmissionsCarAllowance` | annual |
| FOR22.1 | Structures and Buildings Allowance | `allowances.structuredBuildingAllowance[]` | annual |
| FOR22.2 | Electric charge-point allowance | `allowances.electricChargePointAllowance` | annual, 2024-25 and before |
| FOR23 | Replacing domestic items | `allowances.costOfReplacingDomesticItems` | annual |
| FOR24.1 | Residential finance costs | `expenses.residentialFinancialCost` | period |
| FOR24.2 | Unused finance costs brought forward | `expenses.broughtFwdResidentialFinancialCost` | period |
| FOR30A | Country or territory code | `countryCode` (2026-27 on: the property's country) | period, annual |
| FOR30C | Foreign tax taken off or paid | `income.foreignTaxPaidOrDeducted` | period |
| FOR30D | UK tax taken off | `income.specialWithholdingTaxOrUkTaxPaid` | period |
| FOR30E | Claim Foreign Tax Credit Relief | `income.foreignTaxCreditRelief` (true or false) | period |

- HMRC works out FOR18, FOR24, FOR25 to FOR30.1, FOR30B, FOR30F and FOR32. The page shows them from the tax calculation.
- FOR17 groups `premisesRunningCosts`, `repairsAndMaintenance`, `financialCosts`, `professionalFees`, `travelCosts`, `costOfServices` and `other`.
- The CSV maps FOR22.2 to `structuredBuildingAllowance > amount`. The schema has `electricChargePointAllowance` for that box, so the form uses it.
- API fields with no box in the CSV: `allowances.annualInvestmentAllowance` (the form puts it beside FOR21), `allowances.zeroEmissionsGoodsVehicleAllowance` (2024-25 and before), `foreignFhlEea.*` and `foreignFhlEea.adjustments.periodOfGraceAdjustment` (2024-25 and before). The form takes all of them, labelled with the 2024-25 SA106 wording.
- The BSAS adjustment takes `income.totalRentsReceived`, `premiumsOfLeaseGrant`, `otherPropertyIncome` and the nine expense fields per entry, the same names as the UK adjustment.

**Endpoints, Lambdas and routes.** Each Lambda is an async ingest and worker pair, as the UK ones are. Each route is in Express (`app/bin/server.js` through the Lambda's `apiEndpoint`) and in API Gateway (`SubmitSharedNames.java` names the path and method; `HmrcItsaStack.lambdaFunctionProps` carries it to `ApiRoutesStack`).

| HMRC operation | Tax years | Lambda | Submit route |
|---|---|---|---|
| Retrieve Foreign Property Details | 2026-27 on | `hmrcItsaForeignPropertyDetailsGet` | GET `/api/v1/hmrc/itsa/foreign-property/details` |
| Create Foreign Property Details | 2026-27 on | `hmrcItsaForeignPropertyDetailsPost` | POST `.../foreign-property/details` |
| Update Foreign Property Details | 2026-27 on | `hmrcItsaForeignPropertyDetailsPut` | PUT `.../foreign-property/details` |
| Create dated, or create cumulative | all | `hmrcItsaForeignPropertyPeriodPost` | POST `.../foreign-property/period` |
| Retrieve dated, or retrieve cumulative | all | `hmrcItsaForeignPropertyPeriodGet` | GET `.../foreign-property/period` |
| Amend dated, or amend cumulative | all | `hmrcItsaForeignPropertyPeriodPut` | PUT `.../foreign-property/period` |
| List period summaries | all | `hmrcItsaUkPropertyPeriodsGet` (as it is) | GET `.../uk-property/periods` |
| Retrieve annual submission | all | `hmrcItsaForeignPropertyAnnualGet` | GET `.../foreign-property/annual` |
| Create and amend annual submission | all | `hmrcItsaForeignPropertyAnnualPut` | PUT `.../foreign-property/annual` |
| BSAS trigger | all | `hmrcItsaBsasTriggerPost` (adds the type) | POST `.../bsas/trigger` |
| BSAS retrieve foreign property | all | `hmrcItsaBsasForeignPropertyGet` | GET `.../bsas/foreign-property` |
| BSAS adjust foreign property | all | `hmrcItsaBsasForeignPropertyAdjustPost` | POST `.../bsas/foreign-property/adjust` |

- `app/lib/foreignPropertyBody.js` builds the entries for the period, annual and adjustment Lambdas. It keys each entry by `countryCode` or `propertyId` from the tax year, drops empty sections, rounds to two places, and refuses a repeated key with a 400 before the HMRC call.
- `app/lib/hmrcValidation.js` gets `isValidCountryCode` and `resolveForeignPropertyEntryKey(taxYear)` ("countryCode" or "propertyId", from `FOREIGN_PROPERTY_ID_START_TAX_YEAR = "2026-27"`). `resolveItsaSubmissionModel` stays the dated or cumulative switch.
- The details Lambdas refuse a tax year before 2026-27 with a 400. The details PUT takes `propertyId` in the body and calls `.../foreign/{nino}/details/{propertyId}/{taxYear}`.
- The write Lambdas publish `itsa-foreign-property-*` activity events and the `ItsaSubmissionFailure` metric, as the UK ones do. Each write gets an `OpsStack` panel entry.

**Pages.** Under `web/public/hmrc/itsa/`, each with its `.page.js`.

| Page | Does | Catalogue activity |
|---|---|---|
| `foreignPropertyDetails.html` | lists the properties for a tax year; adds one; changes the name; ends one with a date and a reason | `self-employed-property-details` (new, 0 tokens) |
| `foreignPropertyPeriod.html` | the quarterly update: one fieldset per country or property; "Load current total" | `self-employed` |
| `foreignPropertyPeriodAmend.html` | loads a period and sends the changed figures | `self-employed` |
| `foreignPropertyPeriods.html` | lists the periods of a tax year | `self-employed-read` |
| `foreignPropertyPeriodView.html` | shows one period, entry by entry | `self-employed-read` |
| `foreignPropertyAnnualSubmission.html` | adjustments and allowances per entry, with SBA rows | `self-employed-year-end` |
| `foreignPropertyAdjustments.html` | triggers the BSAS, shows it per entry, sends adjustments or zero adjustments | `self-employed-year-end` |

- Shared front-end code: `web/public/lib/country-codes.js`, `web/public/lib/foreign-property-fields.js` (field ids, HMRC names and labels, in the shape of `uk-property-period-fields.js`), and `web/public/widgets/foreign-property-entries.js` (the add, remove and no-repeat logic for the fieldsets).
- `web/public/lib/itsaSubmissionModel.js` gets the browser copy of `resolveForeignPropertyEntryKey`.
- The 2024-25 page adds an "FHL in the EEA" section above the country fieldsets.
- When the person adds a fieldset, focus moves to its country field. Each error links from the error summary to its field in the right fieldset.
- `itsa-submission-record.js` shows one table per entry on the receipt. `hmrc-field-table.js` gets `foreignPropertySummaryRows` for the BSAS view.

**Simulator.** New route and scenario files under `app/http-simulator/`, in the shape of the `itsa-uk-property-*` files.

| Route file | Paths | Scenarios |
|---|---|---|
| `itsa-foreign-property-details.js` | GET and POST `.../foreign/{nino}/{businessId}/details/{taxYear}`, PUT `.../foreign/{nino}/details/{propertyId}/{taxYear}` | DEFAULT, STATEFUL, NOT_FOUND, DUPLICATE_PROPERTY_NAME, PROPERTY_BUSINESS_CEASED, OUTSIDE_AMENDMENT_WINDOW |
| `itsa-foreign-property-cumulative.js` | GET and PUT `.../foreign/.../cumulative/{taxYear}` | DEFAULT, STATEFUL, NOT_FOUND, PROPERTY_ID_MISMATCH, UK_PROPERTY, TAX_YEAR_NOT_SUPPORTED, the two 500s |
| `itsa-foreign-property-period.js` | POST `.../foreign/.../period/{taxYear}` | DEFAULT, STATEFUL, DUPLICATE_SUBMISSION, UK_PROPERTY |
| `itsa-foreign-property-period-detail.js` | GET and PUT `.../foreign/.../period/{taxYear}/{submissionId}` | DEFAULT, NOT_FOUND, CONSOLIDATED |
| `itsa-foreign-property-annual.js` | GET and PUT `.../foreign/.../annual/{taxYear}` | DEFAULT, STATEFUL, NOT_FOUND, UK_PROPERTY |
| `itsa-bsas.js` (change) | GET and POST `.../adjustable-summary/{nino}/foreign-property/...` | as the UK property ones |

- Every route checks the body the way HMRC does: a repeated country or property, both expense kinds in one entry, an empty `foreignProperty`, a bad country pattern, a `propertyId` the store does not hold.
- `state/store.js` gets a `foreignProperties` map, so a POST to details gives a `propertyId` that the GET lists and the cumulative PUT accepts.

**Behaviour tests.** `behaviour-tests/itsaForeignPropertyPeriod.behaviour.test.js` and `itsaForeignPropertyAnnualSubmission.behaviour.test.js`, in the shape of the UK ones, with a `foreign-property` test business from `createHmrcTestBusiness`.

- Period: 2025-26 with France itemised and Spain consolidated; "Load current total"; amend; list; view. 2026-27: add two properties, file one cumulative update for both, end one property. On the simulator, 2024-25 with an FHL in the EEA section and one country.
- Annual: load, change allowances in two entries, add an SBA row, save; trigger the BSAS for `foreign-property`, view it, send adjustments.
- Each journey asserts the HMRC request body in DynamoDB and the fraud prevention headers, as the UK ones do.

**The build.**

| Part | Files | Tests | Proof |
|---|---|---|---|
| H5b1 the base and property details | `app/lib/hmrcValidation.js`, `app/lib/foreignPropertyBody.js` (new), `app/functions/hmrc/hmrcItsaForeignPropertyDetailsGet.js`, `...DetailsPost.js`, `...DetailsPut.js` (new), their three unit tests and `app/unit-tests/lib/foreignPropertyBody.test.js` (new), `app/unit-tests/lib/hmrcValidation.test.js`, and the wiring set (~24) | entry key per tax year; empty entry dropped; repeated country or property refused before HMRC; details refused before 2026-27; `endReason` without `endDate` refused | `npm test`; `./mvnw clean verify`; the synthesised `HmrcItsaStack` and `DataStack` templates each under 500 resources |
| H5b2 the period Lambdas | `hmrcItsaForeignPropertyPeriodPost.js`, `...PeriodGet.js`, `...PeriodPut.js` (new), their unit tests, `...PeriodPost.activity.test.js`, `...PeriodPut.activity.test.js` (new), and the wiring set (~22) | dated POST with `foreignFhlEea` and `foreignNonFhlProperty[]`; cumulative PUT by country (2025-26) and by property (2026-27); itemised or consolidated per entry; receipt key; failure event | `npm test`; `./mvnw clean verify` |
| H5b3 the annual Lambdas | `hmrcItsaForeignPropertyAnnualGet.js`, `...AnnualPut.js` (new), their unit tests, `...AnnualPut.activity.test.js` (new), and the wiring set (~19) | `def1`, `def2` and `def3` bodies; SBA rows pass through; the 2024-25-only allowances refused for a later year | `npm test`; `./mvnw clean verify` |
| H5b4 the BSAS Lambdas | `hmrcItsaBsasForeignPropertyGet.js`, `hmrcItsaBsasForeignPropertyAdjustPost.js` (new), their unit tests, `hmrcItsaBsasTriggerPost.js` and its test, and the wiring set (~20) | the four adjustment shapes; `zeroAdjustments` alone; the trigger takes `foreign-property` | `npm test`; `./mvnw clean verify` |
| H5b5 the simulator | the five new route files and five new scenario files, `routes/itsa-bsas.js`, `scenarios/itsa-bsas.js`, `app/http-simulator/server.js`, `state/store.js`, `app/unit-tests/http-simulator/routes/itsa-foreign-property.test.js` (new), the two `itsa-bsas.test.js` files (~17) | each scenario per route; each body check; a `propertyId` from POST is listed by GET and taken by the cumulative PUT | `npm test` |
| H5b6 the shared front end and property details | `web/public/lib/country-codes.js`, `foreign-property-fields.js`, `web/public/widgets/foreign-property-entries.js`, `foreignPropertyDetails.html` and `.page.js` (new), `itsaSubmissionModel.js`, `web/public/lib/services/hmrc-service.js`, `submit.catalogue.toml`, `app/unit-tests/services/productCatalog.test.js`, the three `.pa11yci.*.json`, `web/unit-tests/country-codes.test.js`, `web/browser-tests/foreignPropertyEntries.browser.test.js`, `foreignPropertyDetails.browser.test.js` (new) (~16) | no `GBR`; every code three upper-case letters; add, remove, and no repeat of a country; focus on add; the details list, add, rename and end | browser tests; the `visual-review` skill on the new page's screenshots |
| H5b7 the period pages | `foreignPropertyPeriod`, `foreignPropertyPeriodAmend`, `foreignPropertyPeriods`, `foreignPropertyPeriodView` (`.html` and `.page.js`, new), `submit.catalogue.toml`, `productCatalog.test.js`, the three `.pa11yci.*.json`, `itsa-submission-record.js`, `test-data-generator.js`, `web/browser-tests/foreignPropertyPeriodFields.browser.test.js` (new), `itsaSubmissionRecords.browser.test.js`, `itsaAccessibility.browser.test.js` (~18) | each field in each entry reaches the request body; the 2024-25 FHL section; the 2026-27 property fieldsets; the receipt shows each entry | browser tests; `visual-review` on the screenshots |
| H5b8 the year-end pages and the dashboard | `foreignPropertyAnnualSubmission`, `foreignPropertyAdjustments` (`.html` and `.page.js`, new), `dashboard.html`, `dashboard.page.js`, `hmrc-field-table.js`, `submit.catalogue.toml`, `productCatalog.test.js`, the three `.pa11yci.*.json`, `itsaDashboard.browser.test.js`, `foreignPropertyAnnual.browser.test.js`, `foreignPropertyAdjustments.browser.test.js` (new), `structuredBuildingAllowanceRows.browser.test.js` (~17) | a `foreign-property` pick routes steps 3 to 8; allowances per entry; SBA rows per entry; BSAS view per entry | browser tests; `visual-review` on the screenshots |
| H5b9 the behaviour tests and CI jobs | `behaviour-tests/itsaForeignPropertyPeriod.behaviour.test.js`, `itsaForeignPropertyAnnualSubmission.behaviour.test.js` (new), `steps/behaviour-hmrc-itsa-steps.js`, `playwright.config.js`, `package.json`, `.github/workflows/test.yml`, `deploy.yml`, `probe-test.yml`, `scripts/ci/select-jobs.mjs`, `app/unit-tests/scripts/selectJobs.test.js` (~10) | the journeys under "Behaviour tests" | the two `simulator - ...Behaviour` jobs green; `HMRC_ACCOUNT=synthetic npm run test:itsaForeignPropertyPeriodBehaviour-proxy` and the annual one green against the HMRC sandbox; the ci probe jobs green on the PR deploy |
| H5b10 the docs, the availability table and the look pass | `web/public/docs/api/openapi.json`, `REPORT_CAPABILITIES.md`, `web/public/mtd-calendar.html`, `scripts/alarm-customer-lookup.mjs`, `videos/itsa-foreign-property-year.json` (new), `videos/publish.json`, `web/public/guide.page.js` (~7) | the OpenAPI document lists the new routes; the alarm lookup knows the new events | the visual definition of done: `npm run video:walkthrough`, the site screenshots, `visual-review` and `ui-ux-pro-max` on the foreign journeys, the new video recorded |

The wiring set is the 14 files that every new Lambda touches: `app/bin/server.js`, `SubmitSharedNames.java`, `HmrcItsaStack.java`, `DataStack.java`, `OpsStack.java`, `.env.proxy`, `.env.simulator`, `.env.test`, `app/test-helpers/mockHelpers.js`, `DataStackTest.java`, `HmrcItsaStackTest.java`, `SubmitApplicationCdkResourceTest.java`, `SubmitEnvironmentCdkResourceTest.java` and `infra/test/resources/lambda-env-allowlist.txt`.

- Order. H5b1 to H5b4 share the wiring set, so they run one after the other. H5b5 and H5b6 can run beside H5b1. H5b7 follows H5b6. H5b8 follows H5b7 and GAP1-H2 (the SBA row widget). H5b9 follows H5b1 to H5b8. H5b10 is last.
- Model. Every row is Sonnet. Each row copies a UK property file family that exists, with the entry list and the tax-year key as the new parts.
- H5c the book source. Blocked until a book holds foreign property postings. In `../spreadsheets.diyaccounting.co.uk`: `app/lib/derivations/foreign-property.js` (new, `deriveForeignPropertyPeriod` and `deriveForeignPropertyAnnual`), `app/test/derivations-foreign-property.test.js` (new), `web/spreadsheets.diyaccounting.co.uk/public/schema/diya-gl-book-v2.schema.json`, `web/diya-gl.co.uk/public/spec.html` (~5). Then in Submit, `web/public/widgets/books-import.js` and `scripts/build-books-bundle.mjs` with the rebuilt `web/public/lib/books-bundle.js` (~4). The account tags: `diya-gl:foreignPropertyField` (the entry field in HMRC's dotted names, for example `income.rentIncome.rentAmount`), `diya-gl:foreignPropertyCountry` (alpha-3), and `diya-gl:foreignPropertyName` (matched to HMRC's `propertyName` for 2026-27 on). The derivation sums postings by account, as `uk-property.js` does, and groups them into one entry per country or per name. Sonnet.

**Open questions.**

| # | Question | Alternatives | Recommendation |
|---|---|---|---|
| 1 | The country field control | (a) a native `<select>` of names, sorted; (b) a text input with a `<datalist>`; (c) the GOV.UK `accessible-autocomplete` library | (a): it works with a keyboard and a screen reader as it is, and adds no dependency |
| 2 | Which codes HMRC permits (`RULE_COUNTRY_CODE`) | (a) the full ISO list without `GBR`; (b) a list taken from the SA106 notes | (a), with one sandbox run in H5b9 that sends `JEY`, `GGY` and `IMN`. Remove a code from the list if the sandbox refuses it Sandbox, 2026-10-29: JEY, GGY and IMN each accepted (200); the sandbox may not validate codes as live does. |
| 3 | Does a cumulative PUT that leaves out an entry clear that entry's figures at HMRC? | (a) the page always sends every entry, filled from "Load current total"; (b) the page sends only the entries the person changed | (a). Answer it with the sandbox `STATEFUL` scenario in H5b9 before the page text is final Sandbox STATEFUL, 2026-10-29: a PUT without ESP dropped ESP (the GET held FRA only), so (a) stands. |
| 4 | The dated model (2024-25 and before) with FHL in the EEA | (a) build it in H5b2 and H5b7, as the UK journey does; (b) build 2025-26 on first and add the dated model as its own row | (a): the same Lambdas choose the endpoint by tax year, and the FHL section is one fieldset |
| 5 | The periods list route has `uk-property` in its name and serves both types | (a) call it as it is; (b) rename the Lambda and the route to `property/periods` with every caller, in its own change | (a) in H5b7. (b) is a separate rename row when the operator wants it |
| 6 | The token cost of a property details write | (a) a new `self-employed-property-details` activity at 0 tokens; (b) `self-employed` at 1 token | (a): the write sends no figures, the same as reading business details |
| 7 | Currency conversion | (a) a hint and amounts in pounds; (b) a converter with HMRC's monthly exchange rates | (a) in the first version. (b) is a later row if people ask for it |
| 8 | The book tag shape for H5c | (a) tags per account: field, country and name; (b) a country on each ledger line | (a): `uk-property.js` already sums by account, and a chart can hold one account set per country |
| 9 | New foreign Lambdas or a `location` parameter on the UK ones | (a) new foreign Lambdas; (b) one Lambda per operation for both types | (a): the bodies differ (one `ukProperty` object against a list of entries), and the UK Lambdas and their tests stay as they are |
