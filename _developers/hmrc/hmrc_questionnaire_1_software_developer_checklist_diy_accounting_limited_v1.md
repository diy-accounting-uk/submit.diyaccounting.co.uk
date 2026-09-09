<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Software Developer Checklist (Questionnaire 1)

**PRE-PRODUCTION DRAFT - 20 January 2026 - Version 1.1**

> **Note**: This document reflects the CURRENT state of the application before production approval. Items marked with ⚠️ require remediation before HMRC production approval can be granted.

## Company Details

| Field | Answer |
|-------|--------|
| Primary contact name | Antony Cartwright |
| Primary contact job title | Director |
| Primary contact email address | admin@diyaccounting.co.uk |
| Company Name | DIY Accounting Limited |
| Company Registration Number | 06846849 |
| Business Address | 37 Sutherland Avenue, Leeds, LS8 1BY |
| Business Telephone Number | N/A - Email contact only |
| Website address | https://submit.diyaccounting.co.uk |
| LinkedIn address (if any) | N/A |
| Twitter address (if any) | N/A |
| Product Name | DIY Accounting Submit |
| Sandbox Application Name | DIY Accounting Submit (Sandbox) |
| Sandbox Application ID | uqMHA6RsDGGa7h8EG2VqfqAmv4tV |
| Production Application Name | DIY Accounting Submit |

## Product Type

### Q1: Product Use Type
**Is your product for in house use by your own company only, or is it for retail/commercial use and you plan to sell/licence the product?**

Options: `In-house` | `Retail or commercial`

Answer: `Retail or commercial`

### Q2: Product Category
**Is your product a full digital record keeping solution, file-only (bridging product), or both?**

Options: `Full digital record keeping solution` | `File-only (Bridging software)` | `Both`

Answer: `File-only (Bridging software)`

## VAT Schemes Supported

| Scheme | Supported (Yes/No) |
|--------|-------------------|
| Cash Accounting | Yes |
| Annual Accounting | Yes |
| Flat Rate | Yes |
| Retail | Yes |
| Margin | Yes |
| Exemption | No |

## Endpoints Developed

| Endpoint | Developed (Yes/No) |
|----------|-------------------|
| Retrieve VAT obligations | Yes |
| Submit VAT return for period | Yes |
| View VAT Return | Yes |
| Retrieve VAT liabilities | No |
| Retrieve VAT payments | No |
| Retrieve VAT penalties | No |
| Retrieve financial details | No |
| Retrieve Customer Information | No |

## Target Demographics

**Are you targeting a particular customer demographic or business sector?**

Answer: UK VAT-registered sole traders and small businesses who need a simple, accessible way to submit VAT returns to HMRC. Focus on businesses using spreadsheets or basic accounting who need MTD-compliant bridging software.

## Technical Compliance Questions

### Q3: Digital Definition
**Does your software meet the definition of "Digital" as described in VAT Notice 700/22?**

Reference: [VAT Notice 700/22 Section 4.2.1](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat#digital-record-keeping)

Answer: `Yes`

### Q4: Manual Keying
**Is there any manual keying permitted in boxes 1-9 of the VAT return?**

Note: Manual element must be removed before a Production application can be approved. See [VAT Notice 700/22 Section 3.2.1](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat). The boxes must be populated from the customer's digital record and no manual keying is permitted in the 9 boxes of the VAT return itself.

Answer: `Yes` - This is bridging software. As file-only/bridging software, users enter figures from their digital records. VAT Notice 700/22 Section 4.3 permits this for bridging software.

### Q5: Spreadsheet Import
**Can your product import from a spreadsheet or CSV file?**

Answer: `No`

### Q6: Multiple Source Import
**Can your product import from multiple sources to amalgamate data?**

Answer: `No`

### Q7: Box 5 Negative Amount
**Can box 5 contain a negative amount?**

Note: Box 5 cannot contain a negative amount, the minimum value is 0.00. See VAT documentation for [Submit VAT return for Period](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0#_submit-vat-return-for-period_post_accordion). Our systems will identify if the figure is a positive or negative dependent upon which figure (in Box 3 or Box 4) was higher.

Answer: `No`

### Q8: Boxes 6-9 Pence
**Do boxes 6-9 contain pence?**

Note: These fields should contain whole pounds only. If pence is included, this should be to 2 zeroed decimal places.

Answer: `No` - whole pounds only

### Q9: Period Key Visibility ✅
**Is the Period Key visible?**

Note: Period Keys should not be shown to the customer, these are for software use to ensure the return is recorded against the correct obligation.

Answer: `No` - **COMPLIANT**

Implementation: Users select VAT periods from a dropdown showing human-readable date ranges (e.g., "1 Jan 2024 to 31 Mar 2024"). The period key is stored in a hidden field and used internally for API submission. Users never see period key codes like "24A1".

Files implementing this:
- `web/public/hmrc/vat/submitVat.html` - Obligation dropdown with hidden periodKey field
- `web/public/hmrc/vat/viewVatReturn.html` - Obligation dropdown for fulfilled periods
- `web/public/hmrc/vat/vatObligations.html` - Table displays date ranges, not period keys
- `web/public/lib/utils/obligation-utils.js` - Formatting utilities for obligation display

### Q10: Legal Declaration ⚠️
**Is the Legal Declaration shown on screen prior to submission of the return?**

Note: It must be shown. Please add prior to data submission if it is missing. A copy of the declaration text can be found in the [VAT (MTD) end-to-end service guide](https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html#period-keys). Please include a screenshot of the text displayed in your software at the point of submission.

Answer: `No` - **NON-COMPLIANT - REQUIRES REMEDIATION**

Current State: No legal declaration is currently shown on submitVat.html before submission. The form submits directly without requiring user acknowledgment of the declaration.

Remediation Required: Add a mandatory checkbox with the legal declaration text that must be checked before the submit button becomes active. The declaration text is:

> "When you submit this VAT information you are making a legal declaration that the information is true and complete. A false declaration can result in prosecution."

See PLAN-9-BOX-VAT-IMPLEMENTATION.md Component 6 (Submit VAT Form UI) for implementation details.

### Q11: Recent Testing
**Have you conducted testing in the last 2 weeks?**

Note: If not could you please do so as our testing logs are only retained for a 14 day period.

Answer: `Yes`

### Q12: Error Testing
**Have you conducted any error testing?**

Note: Although not mandatory it is beneficial.

Answer: `Yes`

### Q13: UK Standards
**Is your product built to UK standards and conventions (e.g. UK dates, £ not $ etc.)?**

Answer: `Yes`

### Q14: White Label
**Is your product a white label?**

Note: In general, white label branding is a practice in which a product or service is produced by one company and then rebranded by another company to make it appear to be their own.

Answer: `No`

### Q15: GDPR Compliance
**Is your product GDPR compliant?**

Reference: [Terms of Use](https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use) - "Storing Data"

Answer: `Yes`

### Q16: WCAG Compliance ⚠️
**Does your product meet the Web Content Accessibility Guidelines (minimum level AA)?**

Reference: [WCAG 2.1](https://www.w3.org/TR/WCAG21/), [Terms of Use](https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use) - "Accessibility"

Answer: `Partial` - **REQUIRES REMEDIATION**

Current State (per REPORT_ACCESSIBILITY_PENETRATION.md dated 19 January 2026):
- Pa11y (WCAG 2.1 AA): ✅ 16/16 pages passed
- axe-core: ❌ 13 violations across pages

axe-core Violations Requiring Remediation:
| Rule | Impact | Description |
|------|--------|-------------|
| document-title | Serious | Some pages missing non-empty `<title>` element |
| link-in-text-block | Serious | Links not distinguished from surrounding text (9 instances) |
| landmark-one-main | Moderate | Document missing main landmark |
| page-has-heading-one | Moderate | Page missing level-one heading |

Remediation Required: Address axe-core violations before production approval. See REPORT_ACCESSIBILITY_PENETRATION.md for full details and PLAN-9-BOX-VAT-IMPLEMENTATION.md Component 4 (CSS/Accessibility) for link styling fixes.

## Compliance Gap Summary

The following items require remediation before HMRC production approval:

| Item | Question | Current State | Remediation |
|------|----------|---------------|-------------|
| ✅ Q9 | Period Key Visibility | Hidden from users | Completed - uses obligation dropdown |
| ⚠️ Q10 | Legal Declaration | Not shown | Add mandatory declaration checkbox |
| ⚠️ Q16 | WCAG Compliance | 13 axe-core violations | Fix document-title, link-in-text-block |

Note: Q9 has been remediated. Users now see human-readable date ranges instead of period keys. The 9-box VAT return form has also been implemented. See PLAN-9-BOX-VAT-IMPLEMENTATION.md for remaining work.

## Sign-off

| Field | Value |
|-------|-------|
| Drafted by | Antony Cartwright, Director |
| Draft Date | 20 January 2026 |
| Status | PRE-PRODUCTION - Pending Q10 and Q16 remediation |
| Any comments | This is bridging software (file-only) that allows users to submit VAT returns from their existing digital records. Q9 (period key visibility) has been remediated. Current implementation requires remediation of Q10 (legal declaration) and Q16 (WCAG compliance) before production approval. See PLAN-9-BOX-VAT-IMPLEMENTATION.md for the implementation roadmap. |
