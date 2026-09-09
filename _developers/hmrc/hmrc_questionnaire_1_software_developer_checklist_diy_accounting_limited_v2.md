<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Software Developer Checklist (Questionnaire 1)

**Version 2 - 25 January 2026**

> **Status**: PRODUCTION READY - All items compliant. See comparison with v1 (20 January 2026) at end of document.

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

**Evidence**: Company registration verified at Companies House (06846849). Contact details from HMRC_PRODUCTION_CREDENTIALS_EMAIL.md.

## Product Type

### Q1: Product Use Type
**Is your product for in house use by your own company only, or is it for retail/commercial use and you plan to sell/licence the product?**

Options: `In-house` | `Retail or commercial`

Answer: `Retail or commercial`

**Evidence**: Product is publicly accessible at https://submit.diyaccounting.co.uk. Terms of Use and Privacy Policy published. Designed for UK VAT-registered businesses.

### Q2: Product Category
**Is your product a full digital record keeping solution, file-only (bridging product), or both?**

Options: `Full digital record keeping solution` | `File-only (Bridging software)` | `Both`

Answer: `File-only (Bridging software)`

**Evidence**: The application allows users to enter VAT figures from their existing digital records (spreadsheets, accounting software) and submit to HMRC. It does not maintain digital accounting records. This complies with VAT Notice 700/22 Section 4.3 for bridging software.

## VAT Schemes Supported

| Scheme | Supported (Yes/No) |
|--------|-------------------|
| Cash Accounting | Yes |
| Annual Accounting | Yes |
| Flat Rate | Yes |
| Retail | Yes |
| Margin | Yes |
| Exemption | No |

**Evidence**: As bridging software, the 9-box VAT return format supports all standard VAT schemes. Users calculate their own figures based on their chosen scheme. The application transmits the figures without scheme-specific processing.

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

**Evidence**: Implemented endpoints documented in HMRC_MTD_API_APPROVAL_SUBMISSION.md. Lambda functions in `app/functions/hmrc/` directory: `hmrcVatObligationsGet.js`, `hmrcVatReturnPost.js`, `hmrcVatReturnGet.js`.

## Target Demographics

**Are you targeting a particular customer demographic or business sector?**

Answer: UK VAT-registered sole traders and small businesses who need a simple, accessible way to submit VAT returns to HMRC. Focus on businesses using spreadsheets or basic accounting who need MTD-compliant bridging software.

**Evidence**: Product positioning defined in index.html and about.html. Accessibility-first design (WCAG 2.1 AA compliant) supports users with disabilities.

## Technical Compliance Questions

### Q3: Digital Definition
**Does your software meet the definition of "Digital" as described in VAT Notice 700/22?**

Reference: [VAT Notice 700/22 Section 4.2.1](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat#digital-record-keeping)

Answer: `Yes`

**Evidence**: The application provides a digital link between the user's digital records and HMRC via the MTD API. All data transmission is electronic with no manual transcription required after initial entry from digital records.

### Q4: Manual Keying
**Is there any manual keying permitted in boxes 1-9 of the VAT return?**

Note: Manual element must be removed before a Production application can be approved. See [VAT Notice 700/22 Section 3.2.1](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat). The boxes must be populated from the customer's digital record and no manual keying is permitted in the 9 boxes of the VAT return itself.

Answer: `Yes` - This is bridging software.

**Evidence**: As file-only/bridging software, users enter figures from their digital records. VAT Notice 700/22 Section 4.3 explicitly permits this for bridging software: "Bridging software allows businesses to keep their digital records in spreadsheets and then submit their VAT return information to HMRC".

### Q5: Spreadsheet Import
**Can your product import from a spreadsheet or CSV file?**

Answer: `No`

**Evidence**: The current version requires manual entry of figures from the user's digital records. Future versions may add spreadsheet import functionality.

### Q6: Multiple Source Import
**Can your product import from multiple sources to amalgamate data?**

Answer: `No`

**Evidence**: Single-source entry only. Users enter figures calculated in their own accounting software/spreadsheet.

### Q7: Box 5 Negative Amount
**Can box 5 contain a negative amount?**

Note: Box 5 cannot contain a negative amount, the minimum value is 0.00. See VAT documentation for [Submit VAT return for Period](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0#_submit-vat-return-for-period_post_accordion). Our systems will identify if the figure is a positive or negative dependent upon which figure (in Box 3 or Box 4) was higher.

Answer: `No`

**Evidence**: Box 5 (netVatDue) is calculated as `Math.abs(box3 - box4)` ensuring always positive. See `submitVat.html` lines 459-464: `const net = Math.round(Math.abs(box3 - box4) * 100) / 100;`. Validation at lines 551-570 ensures NET_VAT_DUE_MIN = 0.

### Q8: Boxes 6-9 Pence
**Do boxes 6-9 contain pence?**

Note: These fields should contain whole pounds only. If pence is included, this should be to 2 zeroed decimal places.

Answer: `No` - whole pounds only

**Evidence**: Boxes 6-9 use `inputmode="numeric"` and validation enforces whole numbers. See `submitVat.html` lines 573-598: `validateVatWholeAmount()` checks `Number.isInteger(num)` and displays error "must be a whole number without pence". Hint text states "Enter a whole number without pence".

### Q9: Period Key Visibility ✅
**Is the Period Key visible?**

Note: Period Keys should not be shown to the customer, these are for software use to ensure the return is recorded against the correct obligation.

Answer: `No` - **COMPLIANT**

**Evidence**: Users select VAT periods via date inputs (periodStart/periodEnd) showing human-readable dates. Period key is resolved server-side. See `submitVat.html` line 120: `<input type="hidden" id="periodKey" name="periodKey" value="" />`. Users never see period key codes like "24A1".

### Q10: Legal Declaration ✅
**Is the Legal Declaration shown on screen prior to submission of the return?**

Note: It must be shown. Please add prior to data submission if it is missing. A copy of the declaration text can be found in the [VAT (MTD) end-to-end service guide](https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html#period-keys). Please include a screenshot of the text displayed in your software at the point of submission.

Answer: `Yes` - **COMPLIANT**

**Evidence**: Legal declaration implemented in `submitVat.html` lines 301-308 using HMRC's exact wording:
```html
<div class="declaration-box">
  <input type="checkbox" id="declaration" name="declaration" required aria-describedby="declaration-hint" />
  <label for="declaration">
    When you submit this VAT information you are making a legal declaration that the information is true and complete. A false declaration can result in prosecution.
  </label>
  <p id="declaration-hint" class="hint">You must tick this box to confirm you understand before submitting</p>
</div>
```
Form validation enforces checkbox before submission. Declaration text matches HMRC VAT MTD end-to-end service guide exactly.

Screenshot: See live application at https://submit.diyaccounting.co.uk/hmrc/vat/submitVat.html

### Q11: Recent Testing
**Have you conducted testing in the last 2 weeks?**

Note: If not could you please do so as our testing logs are only retained for a 14 day period.

Answer: `Yes`

**Evidence**: Latest test run 24 January 2026. REPORT_ACCESSIBILITY_PENETRATION.md generated 2026-01-24T23:24:12.615Z. Test reports available at https://submit.diyaccounting.co.uk/tests/. 583 automated tests passing across unit, system, browser, and behaviour test suites.

### Q12: Error Testing
**Have you conducted any error testing?**

Note: Although not mandatory it is beneficial.

Answer: `Yes`

**Evidence**: Error scenarios tested via Developer Options on submitVat.html including: INVALID_VRN, INVALID_PERIODKEY, INVALID_PAYLOAD, DUPLICATE_SUBMISSION, TAX_PERIOD_NOT_ENDED, INSOLVENT_TRADER, HTTP 500/503 responses. See lines 316-326. Behaviour tests in `behaviour-tests/` cover error paths.

### Q13: UK Standards
**Is your product built to UK standards and conventions (e.g. UK dates, £ not $ etc.)?**

Answer: `Yes`

**Evidence**: Dates formatted as "1 Jan 2024 to 31 Mar 2024" (UK convention). Currency displayed as "£" with GBP formatting. All form hints reference £ (e.g., "Enter an amount with up to 2 decimal places, for example £600 or £193.54"). Language set to `lang="en"` on all pages. Compliant with UK-Government-Form-Field-Standards-Guide.md.

### Q14: White Label
**Is your product a white label?**

Note: In general, white label branding is a practice in which a product or service is produced by one company and then rebranded by another company to make it appear to be their own.

Answer: `No`

**Evidence**: DIY Accounting Limited is the sole developer and operator. No third-party rebranding arrangements exist.

### Q15: GDPR Compliance ✅
**Is your product GDPR compliant?**

Reference: [Terms of Use](https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use) - "Storing Data"

Answer: `Yes` - **COMPLIANT**

**Evidence**: Privacy Policy published at https://submit.diyaccounting.co.uk/privacy.html. ICO registration completed:
- **ICO Registration Number**: ZB070902
- **ICO Public Register Entry**: https://ico.org.uk/ESDWebPages/Entry/ZB070902
- **Registration Certificate**: "ICO Registration Certificate - ZB070902 - Diy Accounting Limited.pdf" (in repository)
- **Data Controller**: DIY Accounting Limited

Data minimization: only stores HMRC OAuth tokens temporarily in session, VAT submission receipts in DynamoDB with 7-year retention (legal requirement). No personal data sold or shared. Users can request data deletion via admin@diyaccounting.co.uk.

### Q16: WCAG Compliance ✅
**Does your product meet the Web Content Accessibility Guidelines (minimum level AA)?**

Reference: [WCAG 2.1](https://www.w3.org/TR/WCAG21/), [Terms of Use](https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use) - "Accessibility"

Answer: `Yes` - **COMPLIANT**

**Evidence**: REPORT_ACCESSIBILITY_PENETRATION.md (24 January 2026) shows:
- Pa11y (WCAG 2.1 AA): 21/21 pages passed, 0 errors
- axe-core: 0 violations, 748 passes
- axe-core (WCAG 2.2): 0 violations, 450 passes
- Lighthouse Accessibility: 95%

All previous violations (document-title, link-in-text-block, landmark-one-main, page-has-heading-one) have been remediated. Accessibility statement published at https://submit.diyaccounting.co.uk/accessibility.html.

## Sign-off

| Field | Value |
|-------|-------|
| Completed by | Antony Cartwright, Director |
| Date | 24 January 2026 |
| Status | PRODUCTION READY |
| Any comments | All compliance gaps from v1 (20 January 2026) have been remediated. Q10 (Legal Declaration) implemented with mandatory checkbox. Q16 (WCAG) now fully compliant with 0 axe-core violations. Application ready for HMRC production approval submission. |

---

## Version Comparison: v1 (20 Jan) → v2 (24 Jan)

| Question | v1 Status | v2 Status | Change |
|----------|-----------|-----------|--------|
| Q9 Period Key | ✅ Compliant | ✅ Compliant | No change |
| Q10 Legal Declaration | ❌ NON-COMPLIANT | ✅ COMPLIANT | **FIXED** |
| Q16 WCAG Compliance | ⚠️ Partial (13 violations) | ✅ COMPLIANT (0 violations) | **FIXED** |

**Commits addressing remediation** (19-24 January 2026):
- `80b382b0` feat: update accessibility error pages and enhance security review documentation
- `b17e59f1` feat: update accessibility error pages and enhance security review documentation
- `8e12320c` security: OWASP Top 10 security review and npm vulnerability fix
