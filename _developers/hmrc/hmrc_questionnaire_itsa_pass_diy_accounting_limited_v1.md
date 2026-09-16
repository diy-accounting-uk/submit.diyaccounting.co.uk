<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# ITSA pass over the two HMRC questionnaires

**Version 1, 16 September 2026.** The VAT answers are in
`hmrc_questionnaire_1_software_developer_checklist_diy_accounting_limited_v2.md` and
`hmrc_questionnaire_2_WCAG_2.1_AA_diy_accounting_limited_v2.md`. This file answers the same
questions for the Income Tax (MTD) journey and says where the ITSA answer differs from the VAT one.
Company, contact and product details are unchanged from the VAT questionnaires.

## Questionnaire 1: software developer checklist

| Question | VAT answer | ITSA answer | Evidence |
|---|---|---|---|
| Product use type | Retail or commercial | Retail or commercial | Same product, same site |
| Product category | File-only (bridging) | File-only (bridging), with a digital link from a DIYA-GL book: the annual submission form imports a book's derived figures, and the MCP tools derive quarterly and annual figures from a book | `web/public/hmrc/itsa/annualSubmission.html`; `mcp/lib/itsa-tools.js` |
| Schemes or income types supported | Cash, annual, flat rate, retail, margin | Self-employment and UK property, both quarterly models (dated to 2024-25, cumulative from 2025-26) | `ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` rows 4 and 6 |
| Endpoints developed | Obligations, submit return, view return | The nine APIs in the approvals checklist: Business Details, Obligations, Self Employment Business, Property Business, Business Source Adjustable Summary, Self Assessment Individual Details, Individual Calculations, Individual Losses, Individuals Tax Liability Adjustments | `app/functions/hmrc/hmrcItsa*.js`, 30 handlers |
| Target demographics | UK VAT-registered sole traders and small businesses | Sole traders and landlords mandated into MTD for Income Tax from April 2026 (income over £50,000) and April 2027 (over £30,000), using spreadsheets or a DIYA-GL book | `STRATEGY.md` |
| Digital definition | Yes | Yes. Figures move from the customer's digital records to HMRC through the API; the book import and the MCP derivation are digital links | Row 3 of the checklist |
| Manual keying | Yes, as bridging software | Yes, as bridging software, on the quarterly and annual forms; the book import fills the annual form without keying | `annualSubmission.html` |
| Spreadsheet or CSV import | No | Partly: the annual form imports the JSON that `derive_itsa_annual_submission` writes from a book | `web/browser-tests/annualSubmission.import.browser.test.js` |
| Multiple source import | No | No | |
| Negative amounts and pence | Box 5 never negative; boxes 6 to 9 whole pounds | Every money field takes pounds and pence to two places as HMRC's ITSA schemas require; no whole-pound boxes | The `step="0.01"` inputs on the period pages |
| Period key visible | No | Not applicable: the ITSA endpoints take dates, and every date comes from the obligation or the tax year the customer picked; no period key is computed or shown | `PLAN_ITSA_PHASE_2.md` T11 |
| Legal declaration before submission | Yes, HMRC's VAT wording | Yes. The final declaration page shows the declaration before the button; the quarterly pages show the submission cost and the tax-year model before sending | `finalDeclaration.html` line 138; `widgets/submission-cost.js` |
| Testing in the last two weeks | Yes | The sandbox year ran on 2026-09-14 (`17698550`). Re-run `scripts/itsa-sandbox-year.js` within two weeks of sending, because HMRC keeps its testing logs for 14 days | `ITSA_PHASE_2_SANDBOX.md` |
| Error testing | Yes | Yes. Every ITSA page carries HMRC's `Gov-Test-Scenario` options for its endpoint, and the simulator carries the error shapes | `app/http-simulator/routes/itsa-*.js` and `scenarios/itsa-*.js` |
| UK standards | Yes | Yes. Same pages, styles and formats as VAT | |
| White label | No | No | |
| GDPR | Yes, ICO ZB070902 | Yes, the same registration. ITSA receipts follow the VAT receipts' 7-year retention | `app/data/` receipt repositories |
| WCAG | Yes, 0 violations on 21 pages | Not evidenced for the 19 ITSA pages: the scan's page list carries no ITSA page. Add them to `scripts/axe-quickscan.mjs` and re-run before sending | Checklist row 13 |

## Questionnaire 2: WCAG 2.1 AA

The VAT questionnaire answers every criterion "Supports" for the VAT pages with the January 2026
scan as evidence. The ITSA pages share the header, footer, form styles, hint pattern and error
summary of the VAT pages, so each criterion's answer is expected to carry over. The scan has not
run over them, so no criterion can be marked "Supports" for ITSA yet.

What produces the evidence:

1. Add the 19 pages under `web/public/hmrc/itsa/` to the `PAGES` list in
   `scripts/axe-quickscan.mjs`.
2. Run the accessibility suite (`npm run accessibility:*` scripts) against ci or prod.
3. Re-generate `REPORT_ACCESSIBILITY_PENETRATION.md` and update the "Testing Summary" table of
   questionnaire 2 with the new page count and results.

Until then the ITSA answer to questionnaire 2 is "not evidenced" on every row.
