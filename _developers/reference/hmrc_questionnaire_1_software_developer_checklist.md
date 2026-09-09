<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Software Developer Checklist (Questionnaire 1)

## Company Details

| Field | Answer |
|-------|--------|
| Primary contact name | |
| Primary contact job title | |
| Primary contact email address | |
| Company Name | |
| Company Registration Number | |
| Business Address | |
| Business Telephone Number | |
| Website address | |
| LinkedIn address (if any) | |
| Twitter address (if any) | |
| Product Name | |
| Sandbox Application Name | |
| Sandbox Application ID | |
| Production Application Name | |

## Product Type

### Q1: Product Use Type
**Is your product for in house use by your own company only, or is it for retail/commercial use and you plan to sell/licence the product?**

Options: `In-house` | `Retail or commercial`

Answer:

### Q2: Product Category
**Is your product a full digital record keeping solution, file-only (bridging product), or both?**

Options: `Full digital record keeping solution` | `File-only (Bridging software)` | `Both`

Answer:

## VAT Schemes Supported

| Scheme | Supported (Yes/No) |
|--------|-------------------|
| Cash Accounting | |
| Annual Accounting | |
| Flat Rate | |
| Retail | |
| Margin | |
| Exemption | |

## Endpoints Developed

| Endpoint | Developed (Yes/No) |
|----------|-------------------|
| Retrieve VAT obligations | |
| Submit VAT return for period | |
| View VAT Return | |
| Retrieve VAT liabilities | |
| Retrieve VAT payments | |
| Retrieve VAT penalties | |
| Retrieve financial details | |
| Retrieve Customer Information | |

## Target Demographics

**Are you targeting a particular customer demographic or business sector?**

Answer:

## Technical Compliance Questions

### Q3: Digital Definition
**Does your software meet the definition of "Digital" as described in VAT Notice 700/22?**

Reference: [VAT Notice 700/22 Section 4.2.1](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat#digital-record-keeping)

Answer: `Yes` | `No`

### Q4: Manual Keying
**Is there any manual keying permitted in boxes 1-9 of the VAT return?**

Note: Manual element must be removed before a Production application can be approved. See [VAT Notice 700/22 Section 3.2.1](https://www.gov.uk/government/publications/vat-notice-70022-making-tax-digital-for-vat/vat-notice-70022-making-tax-digital-for-vat). The boxes must be populated from the customer's digital record and no manual keying is permitted in the 9 boxes of the VAT return itself.

Answer: `Yes` | `No`

### Q5: Spreadsheet Import
**Can your product import from a spreadsheet or CSV file?**

Answer: `Yes` | `No`

### Q6: Multiple Source Import
**Can your product import from multiple sources to amalgamate data?**

Answer: `Yes` | `No`

### Q7: Box 5 Negative Amount
**Can box 5 contain a negative amount?**

Note: Box 5 cannot contain a negative amount, the minimum value is 0.00. See VAT documentation for [Submit VAT return for Period](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api/1.0#_submit-vat-return-for-period_post_accordion). Our systems will identify if the figure is a positive or negative dependent upon which figure (in Box 3 or Box 4) was higher.

Answer: `Yes` | `No`

### Q8: Boxes 6-9 Pence
**Do boxes 6-9 contain pence?**

Note: These fields should contain whole pounds only. If pence is included, this should be to 2 zeroed decimal places.

Answer: `Yes` | `No`

### Q9: Period Key Visibility
**Is the Period Key visible?**

Note: Period Keys should not be shown to the customer, these are for software use to ensure the return is recorded against the correct obligation.

Answer: `Yes` | `No`

### Q10: Legal Declaration
**Is the Legal Declaration shown on screen prior to submission of the return?**

Note: It must be shown. Please add prior to data submission if it is missing. A copy of the declaration text can be found in the [VAT (MTD) end-to-end service guide](https://developer.service.hmrc.gov.uk/guides/vat-mtd-end-to-end-service-guide/documentation/obligations.html#period-keys). Please include a screenshot of the text displayed in your software at the point of submission.

Answer: `Yes` | `No`

Screenshot: *(Paste screenshot here)*

### Q11: Recent Testing
**Have you conducted testing in the last 2 weeks?**

Note: If not could you please do so as our testing logs are only retained for a 14 day period.

Answer: `Yes` | `No`

### Q12: Error Testing
**Have you conducted any error testing?**

Note: Although not mandatory it is beneficial.

Answer: `Yes` | `No`

### Q13: UK Standards
**Is your product built to UK standards and conventions (e.g. UK dates, £ not $ etc.)?**

Answer: `Yes` | `No`

### Q14: White Label
**Is your product a white label?**

Note: In general, white label branding is a practice in which a product or service is produced by one company and then rebranded by another company to make it appear to be their own.

Answer: `Yes` | `No`

### Q15: GDPR Compliance
**Is your product GDPR compliant?**

Reference: [Terms of Use](https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use) - "Storing Data"

Answer: `Yes` | `No`

### Q16: WCAG Compliance
**Does your product meet the Web Content Accessibility Guidelines (minimum level AA)?**

Reference: [WCAG 2.1](https://www.w3.org/TR/WCAG21/), [Terms of Use](https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use) - "Accessibility"

Answer: `Yes` | `No`

## Sign-off

| Field | Value |
|-------|-------|
| Completed by | |
| Date | |
| Any comments | |
