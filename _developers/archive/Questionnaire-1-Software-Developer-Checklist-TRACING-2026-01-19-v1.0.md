<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Questionnaire 1: Software Developer Checklist - Evidence Tracing

**Organisation**: DIY Accounting Limited
**Product**: DIY Accounting Submit
**Date Completed**: 19 January 2026
**Version**: 1.0

This document traces each answer to its evidence source.

---

## Details Section

| Question | Answer | Evidence Source |
|----------|--------|-----------------|
| Primary contact name: | Antony Cartwright | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 75-76 |
| Primary contact job title: | Director | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 76 |
| Primary contact email address: | admin@diyaccounting.co.uk | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 73 |
| Company Name: | DIY Accounting Limited | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 68 |
| Company Registration Number: | 06846849 | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 89 |
| Business Address: | 37 Sutherland Avenue, Leeds, LS8 1BY | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 69 |
| Business Telephone Number: | N/A - Email contact only | HMRC_MTD_API_APPROVAL_SUBMISSION.md - email is primary contact |
| Website address: | https://submit.diyaccounting.co.uk | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 65 |
| LinkedIn address (if any): | N/A | Not applicable |
| Twitter address (if any): | N/A | Not applicable |
| Product Name: | DIY Accounting Submit | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 64 |
| Sandbox Application Name: | DIY Accounting Submit (Sandbox) | HMRC sandbox testing environment |
| Sandbox Application ID: | uqMHA6RsDGGa7h8EG2VqfqAmv4tV | .env.proxy line - HMRC_SANDBOX_CLIENT_ID |
| Production Application Name: | DIY Accounting Submit | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 64 |

---

## Product Type

| Question | Answer | Evidence Source |
|----------|--------|-----------------|
| Is your product for in house use or retail/commercial? | Retail or commercial | HMRC_MTD_API_APPROVAL_SUBMISSION.md lines 692-700 - Freemium SaaS model |
| Is your product full digital record keeping, file-only, or both? | File-only (Bridging software) | Application is bridging software - users enter VAT figures calculated from their existing digital records (e.g., DIY Accounting spreadsheets). Server populates 9-box return from user's net VAT due figure (hmrcVatReturnPost.js lines 536-548). |

---

## VAT Schemes Supported

| Scheme | Supported | Evidence Source |
|--------|-----------|-----------------|
| Cash Accounting | Yes | Bridging software: Users calculate VAT under Cash Accounting rules in their records, then submit the final net VAT due figure through our application |
| Annual Accounting | Yes | Bridging software: Users calculate VAT under Annual Accounting rules in their records, then submit at end of accounting period through our application |
| Flat Rate | Yes | Bridging software: Users calculate VAT under Flat Rate Scheme rules in their records, then submit the final flat rate VAT figure through our application |
| Retail | Yes | Bridging software: Users calculate VAT under Retail Scheme rules (Point of Sale, Apportionment, Direct Calculation) in their records, then submit through our application |
| Margin | Yes | Bridging software: Users calculate VAT under Margin Scheme rules (second-hand goods, works of art) in their records, then submit through our application |
| Exemption | No | VAT-exempt businesses do not need to submit VAT returns to HMRC - our application is specifically for VAT-registered businesses who need to file returns |

---

## Endpoints Developed

| Endpoint | Developed | Evidence Source |
|----------|-----------|-----------------|
| Retrieve VAT obligations | Yes | hmrcVatObligationGet.js - test-report-web-test-local.json line 218 |
| Submit VAT return for period | Yes | hmrcVatReturnPost.js - test-report-web-test-local.json line 69 |
| View VAT Return | Yes | hmrcVatReturnGet.js - test-report-web-test-local.json line 296 |
| Retrieve VAT liabilities | No | Not implemented - not required for MVP (HMRC_MTD_API_APPROVAL_SUBMISSION.md lines 103-106) |
| Retrieve VAT payments | No | Not implemented - not required for MVP (HMRC_MTD_API_APPROVAL_SUBMISSION.md lines 103-106) |
| Retrieve VAT penalties | No | Not implemented in current version |
| Retrieve financial details | No | Not implemented in current version |
| Retrieve Customer Information | No | Not implemented in current version |

---

## Customer Demographic

**Question**: Are you targeting a particular customer demographic or business sector?

**Answer**: UK VAT-registered sole traders and small businesses who need a simple, accessible way to submit VAT returns to HMRC. Focus on businesses using spreadsheets or basic accounting who need MTD-compliant bridging software.

**Evidence Source**: HMRC_MTD_API_APPROVAL_SUBMISSION.md line 86

---

## Technical Compliance Questions

| Question | Answer | Evidence Source |
|----------|--------|-----------------|
| Does your software meet the definition of "Digital" as described in VAT Notice 700/22? | Yes | Software captures VAT return data digitally and submits via API - no paper forms |
| Is there any manual keying permitted in boxes 1-9 of the VAT return? | Yes - This is bridging software | As file-only/bridging software, users enter figures from their digital records. VAT Notice 700/22 Section 4.3 permits this for bridging software. |
| Can your product import from a spreadsheet or CSV file? | No | Current version requires manual entry - spreadsheet import planned for future release |
| Can your product import from multiple sources to amalgamate data? | No | Single submission form - no data aggregation in current version |
| Can box 5 contain a negative amount? | No | Validation enforced - netVatDue minimum is 0 (hmrc-mtd-vat-api-1.0.yaml line 5778-5779) |
| Do boxes 6 – 9 contain pence? | No - whole pounds only | Fields accept whole pounds with zeroed decimal places per API spec (hmrc-mtd-vat-api-1.0.yaml lines 5786-5808) |
| Is the Period Key visible? | No | Period key is used internally but not displayed to users - they see date ranges instead |
| Is the Legal Declaration shown on screen prior to submission of the return? | Yes | Declaration shown on submitVat.html before submission - behaviour-tests/submitVat.behaviour.test.js |
| Have you conducted testing in the last 2 weeks? | Yes | Test executed 19 January 2026 - test-report-web-test-local.json timestamp |
| Have you conducted any error testing? | Yes | Error handling for all HMRC API error codes implemented - HMRC_MTD_API_APPROVAL_SUBMISSION.md lines 170-177 |
| Is your product built to UK standards and conventions (e.g. UK dates, £ not $ etc.)? | Yes | UK date formats, GBP currency, English language throughout |
| Is your product a white label? | No | DIY Accounting branded product, not resold under other brands |
| Is your product GDPR compliant? | Yes | Privacy policy published - https://submit.diyaccounting.co.uk/privacy.html |
| Does your product meet the Web Content Accessibility Guidelines (minimum level AA)? | Yes | Pa11y: 16/16 pages pass, axe-core: 0 violations - web/public/tests/accessibility/pa11y-report.txt |

---

## Sign-off

| Field | Value | Source |
|-------|-------|--------|
| Completed by | Antony Cartwright, Director | HMRC_MTD_API_APPROVAL_SUBMISSION.md line 75-76 |
| Date | 19 January 2026 | Current date |
| Comments | This is bridging software (file-only) that allows users to submit VAT returns from their existing digital records. Users enter their calculated net VAT due figure which the application submits via the HMRC MTD VAT API. The application supports all VAT schemes as users perform their scheme-specific calculations externally. Full test evidence available at https://submit.diyaccounting.co.uk/tests/test-report-template.html?test=web-test-local | HMRC_MTD_API_APPROVAL_SUBMISSION.md Section 3.1, hmrcVatReturnPost.js lines 536-548 |

---

**End of Questionnaire 1 Tracing Document**
