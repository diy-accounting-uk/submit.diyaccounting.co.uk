<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# UK Government Form Field Standards Guide

## For Third-Party Services Authorised by HMRC

**Version:** 1.0
**Date:** January 2026
**Applicable to:** Private companies operating HMRC Recognised services (e.g., MTD VAT submission software)

---

## Scope and Applicability

### What This Guide Covers

This guide consolidates UK government standards for identifying and labelling form fields on web-based services. It covers:

- **Visible labelling**: How to present field names, hints, and error messages to users
- **Invisible identification**: HTML attributes (`id`, `name`, `autocomplete`, `aria-describedby`)
- **HMRC-specific terminology**: Correct naming for tax references and identifiers
- **Accessibility requirements**: WCAG 2.2 AA compliance obligations

### For Non-GOV.UK Sites

**Important clarification:** The GOV.UK Design System and HMRC Design Patterns are created for government services hosted on the GOV.UK domain. However, the following aspects are relevant and recommended for third-party services:

| Aspect | Applicability to Third Parties |
|--------|-------------------------------|
| **Field terminology** | **Mandatory** — Use HMRC's correct terminology for tax references |
| **Accessibility (WCAG 2.2)** | **Mandatory** — Legal requirement under UK accessibility regulations |
| **Field validation rules** | **Mandatory** — Match HMRC's expected formats for API submissions |
| **Visual styling (GOV.UK Frontend)** | **Not applicable** — Do not use GOV.UK branding on non-government sites |
| **Content patterns** | **Recommended** — Proven to help users understand tax terminology |

### What You Must NOT Do

- **Do not use GOV.UK branding** (crown logo, GOV.UK fonts, or colour schemes) on non-government sites
- **Do not imply** your service is operated by or on behalf of HMRC unless explicitly authorised
- **Do not use** the "GOV.UK Frontend" CSS framework on commercial services

### What You SHOULD Do

- Use HMRC's **correct terminology** for all tax-related fields
- Follow **WCAG 2.2 AA** accessibility guidelines
- Implement **proper validation** matching HMRC's format requirements
- Provide **clear help text** explaining where users can find their reference numbers
- Use the **autocomplete attribute** where applicable for accessibility compliance

---

## HMRC Tax Reference Fields

### VAT registration number

| Property | Value |
|----------|-------|
| **Label** | "VAT registration number" |
| **Do NOT use** | "VAT number", "VAT identification number", "VRN" |
| **Format** | 9 digits, optionally prefixed with "GB" |
| **Examples** | `123456789` or `GB123456789` |
| **Field width** | Approximately 12-15 characters |
| **Input type** | `text` (not `number` — allows "GB" prefix) |

**HTML Implementation:**

```html
<div class="form-group">
  <label for="vat-registration-number">
    VAT registration number
  </label>
  <p id="vat-registration-number-hint" class="hint">
    This is 9 numbers, sometimes with 'GB' at the start, for example
    123456789 or GB123456789. You can find it on your VAT registration certificate.
  </p>
  <input
    type="text"
    id="vat-registration-number"
    name="vatRegistrationNumber"
    class="input input--width-12"
    aria-describedby="vat-registration-number-hint"
  >
</div>
```

**Validation Rules:**

- Accept 9 digits with or without spaces
- Accept optional "GB" prefix (case-insensitive)
- Strip spaces and "GB" prefix before validation/submission
- Reject if not exactly 9 digits after normalisation

**Error Messages:**

| Scenario | Message |
|----------|---------|
| Empty field | "Enter your VAT registration number" |
| Invalid format | "Enter your VAT registration number in the correct format" |

---

### Unique Taxpayer Reference (UTR)

| Property | Value |
|----------|-------|
| **Label** | "Unique Taxpayer Reference (UTR)" or context-specific variant |
| **Do NOT use** | "UTR number", "Unique Taxpayer Reference number" |
| **Format** | 10 or 13 digits |
| **Example** | `1234567890` |
| **Field width** | Approximately 15 characters |

**Context-specific labels:**

- Self Assessment: "Self Assessment Unique Taxpayer Reference (UTR)"
- Corporation Tax: "Corporation Tax Unique Taxpayer Reference (UTR)"
- Partnership: "Partnership Unique Taxpayer Reference (UTR)"

**HTML Implementation:**

```html
<div class="form-group">
  <label for="utr">
    Self Assessment Unique Taxpayer Reference (UTR)
  </label>
  <p id="utr-hint" class="hint">
    Your UTR can be 10 or 13 digits long. You can find it in your Personal
    Tax Account, the HMRC app, or on tax returns and other documents from HMRC.
    It might be called 'reference', 'UTR' or 'official use'.
  </p>
  <input
    type="text"
    id="utr"
    name="utr"
    class="input input--width-12"
    aria-describedby="utr-hint"
  >
</div>
```

**Validation Rules:**

- Accept 10 or 13 digits
- May include letter "K" at the end
- Accept with or without spaces
- Strip spaces before validation

**Error Messages:**

| Scenario | Message |
|----------|---------|
| Empty field | "Enter your Self Assessment Unique Taxpayer Reference" |
| Invalid format | "Enter your Self Assessment Unique Taxpayer Reference in the correct format" |

---

### Employer PAYE Reference

| Property | Value |
|----------|-------|
| **Label** | "Employer PAYE reference" |
| **Alternative** | May be called "PAYE reference" on documents |
| **Format** | 3-digit tax office number + "/" + employer reference |
| **Example** | `123/AB456` |
| **Field width** | Approximately 12 characters |

**HTML Implementation:**

```html
<div class="form-group">
  <label for="employer-paye-reference">
    Employer PAYE reference
  </label>
  <p id="employer-paye-reference-hint" class="hint">
    This is a 3-digit tax office number, a forward slash, and a tax office
    employer reference, like 123/AB456. It may be called 'Employer PAYE reference'
    or 'PAYE reference'. You can find it on your P60.
  </p>
  <input
    type="text"
    id="employer-paye-reference"
    name="employerPayeReference"
    class="input input--width-12"
    aria-describedby="employer-paye-reference-hint"
  >
</div>
```

---

### Accounts Office Reference

| Property | Value |
|----------|-------|
| **Label** | "Accounts Office reference" |
| **Format** | 13 characters |
| **Example** | `123PX00123456` or `123PX0012345X` |
| **Field width** | Approximately 15 characters |

**HTML Implementation:**

```html
<div class="form-group">
  <label for="accounts-office-reference">
    Accounts Office reference
  </label>
  <p id="accounts-office-reference-hint" class="hint">
    This is 13 characters, like 123PX00123456 or 123PX0012345X.
    You can find it on letters from HMRC about PAYE and when you
    registered as an employer.
  </p>
  <input
    type="text"
    id="accounts-office-reference"
    name="accountsOfficeReference"
    class="input input--width-15"
    aria-describedby="accounts-office-reference-hint"
  >
</div>
```

---

### EORI Number

| Property | Value |
|----------|-------|
| **Label** | "EORI number" |
| **Do NOT use** | "EORI" alone, "GB EORI number", "XI EORI number" |
| **Format** | Country code (GB or XI) + 12 or 15 digits |
| **Example** | `GB123456123456` |
| **Field width** | Approximately 20 characters |

**HTML Implementation:**

```html
<div class="form-group">
  <label for="eori-number">
    EORI number
  </label>
  <p id="eori-number-hint" class="hint">
    The first 2 letters are the country code, like GB or XI.
    This is followed by 12 or 15 digits, like GB123456123456.
  </p>
  <input
    type="text"
    id="eori-number"
    name="eoriNumber"
    class="input input--width-20"
    aria-describedby="eori-number-hint"
  >
</div>
```

---

### National Insurance Number

| Property | Value |
|----------|-------|
| **Label** | "National Insurance number" |
| **Do NOT use** | "NINO", "NI Number", "NI number" |
| **Format** | 2 letters + 6 digits + 1 letter (A, B, C, or D) |
| **Example** | `QQ 12 34 56 C` |
| **Field width** | Approximately 13 characters |

**Important:** Never use `AB 12 34 56 C` as an example — this belongs to a real person. Use `QQ 12 34 56 C` instead.

**HTML Implementation:**

```html
<div class="form-group">
  <label for="national-insurance-number">
    National Insurance number
  </label>
  <p id="national-insurance-number-hint" class="hint">
    It's on your National Insurance card, benefit letter, payslip or P60 —
    for example, 'QQ 12 34 56 C'.
  </p>
  <input
    type="text"
    id="national-insurance-number"
    name="nationalInsuranceNumber"
    class="input input--width-12"
    spellcheck="false"
    aria-describedby="national-insurance-number-hint"
  >
</div>
```

**Validation Rules:**

- Allow 13 characters (9 alphanumeric + 4 optional spaces)
- Accept upper and lower case
- Accept with or without spaces
- Final letter must be A, B, C, or D

---

## Standard Personal Information Fields

For WCAG 2.2 AA compliance (Success Criterion 1.3.5), use the `autocomplete` attribute on fields collecting user personal information.

### Names

```html
<!-- Single name field -->
<input type="text" id="full-name" name="fullName"
       autocomplete="name" spellcheck="false">

<!-- Separate fields -->
<input type="text" id="first-name" name="firstName"
       autocomplete="given-name" spellcheck="false">
<input type="text" id="last-name" name="lastName"
       autocomplete="family-name" spellcheck="false">
```

### Address Fields

```html
<input type="text" id="address-line-1" name="addressLine1"
       autocomplete="address-line1">
<input type="text" id="address-line-2" name="addressLine2"
       autocomplete="address-line2">
<input type="text" id="address-town" name="addressTown"
       autocomplete="address-level2">
<input type="text" id="address-county" name="addressCounty">
<input type="text" id="address-postcode" name="addressPostcode"
       autocomplete="postal-code">
```

### Contact Details

```html
<input type="email" id="email" name="email" autocomplete="email">
<input type="tel" id="telephone" name="telephone" autocomplete="tel">
```

### Complete Autocomplete Reference

| Field Type | autocomplete Value |
|------------|-------------------|
| Full name | `name` |
| Given name / First name | `given-name` |
| Family name / Last name | `family-name` |
| Email | `email` |
| Telephone | `tel` |
| Address line 1 | `address-line1` |
| Address line 2 | `address-line2` |
| Town / City | `address-level2` |
| County / Region | `address-level1` |
| Postcode | `postal-code` |
| Country | `country-name` |
| Date of birth | `bday` |
| Birth day | `bday-day` |
| Birth month | `bday-month` |
| Birth year | `bday-year` |

**Note:** Tax-specific references (UTR, VAT registration number, PAYE reference, etc.) do not have standard autocomplete tokens — browsers cannot auto-fill these.

---

## Currency and Monetary Values

### Format

```html
<div class="form-group">
  <label for="amount">
    How much did you pay?
  </label>
  <p id="amount-hint" class="hint">
    For example, £600 or £193.54
  </p>
  <div class="input-prefix">
    <span class="prefix">£</span>
    <input
      type="text"
      id="amount"
      name="amount"
      class="input input--width-10"
      inputmode="decimal"
      aria-describedby="amount-hint"
    >
  </div>
</div>
```

**Validation Rules:**

- Accept whole numbers or up to 2 decimal places
- Accept with or without £ symbol
- Accept with or without commas
- Accept with or without spaces
- Normalise before validation

---

## Date Fields

### Date of Birth / Memorable Dates

Use three separate fields for day, month, year:

```html
<fieldset>
  <legend>Date of birth</legend>
  <p id="dob-hint" class="hint">For example, 31 3 1980</p>
  <div class="date-input" aria-describedby="dob-hint">
    <div class="date-input__item">
      <label for="dob-day">Day</label>
      <input type="text" id="dob-day" name="dobDay"
             inputmode="numeric" class="input--width-2"
             autocomplete="bday-day">
    </div>
    <div class="date-input__item">
      <label for="dob-month">Month</label>
      <input type="text" id="dob-month" name="dobMonth"
             inputmode="numeric" class="input--width-2"
             autocomplete="bday-month">
    </div>
    <div class="date-input__item">
      <label for="dob-year">Year</label>
      <input type="text" id="dob-year" name="dobYear"
             inputmode="numeric" class="input--width-4"
             autocomplete="bday-year">
    </div>
  </div>
</fieldset>
```

---

## Accessibility Requirements

### WCAG 2.2 AA Compliance

All form fields must meet these requirements:

1. **Labels**: Every input must have an associated `<label>` element
2. **Error identification**: Errors must be clearly identified and described
3. **Input purpose**: Use `autocomplete` for fields collecting personal user information
4. **Focus visible**: Form controls must have visible focus indicators
5. **Colour contrast**: Text must have 4.5:1 contrast ratio (3:1 for large text)

### Required Attributes

```html
<input
  type="text"
  id="field-id"           <!-- Unique identifier -->
  name="fieldName"        <!-- Form submission name -->
  aria-describedby="..."  <!-- Links to hint/error text -->
  autocomplete="..."      <!-- When collecting user info -->
>
```

### Error Message Pattern

```html
<div class="form-group form-group--error">
  <label for="vat-registration-number">
    VAT registration number
  </label>
  <p id="vat-registration-number-hint" class="hint">
    This is 9 numbers, sometimes with 'GB' at the start.
  </p>
  <p id="vat-registration-number-error" class="error-message">
    <span class="visually-hidden">Error:</span>
    Enter your VAT registration number
  </p>
  <input
    type="text"
    id="vat-registration-number"
    name="vatRegistrationNumber"
    class="input input--error"
    aria-describedby="vat-registration-number-hint vat-registration-number-error"
    aria-invalid="true"
  >
</div>
```

---

## HMRC Terminology Quick Reference

### Capitalisation Rules

| Term | Correct | Incorrect |
|------|---------|-----------|
| Income Tax | Initial caps | income tax |
| VAT | All caps | Vat, vat |
| Corporation Tax | Initial caps | corporation tax |
| Self Assessment | Initial caps | self assessment |
| National Insurance | Initial caps | national insurance |
| Making Tax Digital | Initial caps (brand name) | MTD, making tax digital |

### General Rules

- Capitalise specific tax names: "Income Tax", "Corporation Tax", "Beer Duty"
- Do not capitalise generic references: "the tax", "duties", "a levy"
- Use "Making Tax Digital for VAT" (lowercase 'f')
- Use "Unique Taxpayer Reference" (never "UTR number")
- Use "VAT registration number" (never "VAT number")
- Use "National Insurance number" (never "NINO")

### Numbers and References

| Type | Format | Example |
|------|--------|---------|
| VAT registration number | 9 digits | `123456789` |
| UTR | 10 or 13 digits | `1234567890` |
| National Insurance | 2L + 6N + 1L | `QQ 12 34 56 C` |
| EORI | 2L + 12-15N | `GB123456123456` |
| Employer PAYE reference | 3N + "/" + ref | `123/AB456` |
| Accounts Office reference | 13 characters | `123PX00123456` |
| Company Registration Number | 8 characters | `06846849` |

---

## Form Design Best Practices

### Do

- ✓ Use clear, specific labels that match HMRC terminology
- ✓ Provide hint text explaining format and where to find the reference
- ✓ Show format examples in hint text
- ✓ Use specific error messages for different error states
- ✓ Link errors to the relevant field
- ✓ Set appropriate field widths to indicate expected length
- ✓ Use `inputmode="numeric"` for number-only fields
- ✓ Use `spellcheck="false"` for reference numbers and names

### Don't

- ✗ Use abbreviations without explanation (UTR, NINO, VRN)
- ✗ Hide help text in expandable sections for critical references
- ✗ Use placeholder text instead of labels
- ✗ Use generic error messages ("Invalid input")
- ✗ Disable copy/paste on form fields
- ✗ Set `maxlength` without clear feedback (truncates silently)
- ✗ Use `AB 12 34 56 C` as a National Insurance example (real person)

---

## Source References

- GOV.UK Design System: https://design-system.service.gov.uk/
- HMRC Design Patterns: https://design.tax.service.gov.uk/hmrc-design-patterns/
- HMRC Content Style Guide: https://design.tax.service.gov.uk/hmrc-content-style-guide/
- WCAG 2.2: https://www.w3.org/WAI/WCAG22/quickref/
- Making Tax Digital for VAT API: https://developer.service.hmrc.gov.uk/

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2026 | Initial release |

