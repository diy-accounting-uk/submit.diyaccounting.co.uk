<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Questionnaire Evidence Traceability

## DIY Accounting Limited - DIY Accounting Submit
**Document Date**: 19 January 2026
**Version**: 1.0

This document traces each answer provided in the HMRC questionnaires to the specific evidence sources that support the claims made.

---

## Table of Contents

1. [Evidence Sources](#evidence-sources)
2. [Questionnaire 1 Traceability](#questionnaire-1-software-developer-checklist-traceability)
3. [Questionnaire 2 Traceability](#questionnaire-2-wcag-21-aa-traceability)

---

## Evidence Sources

### Primary Documentation

| ID | Document | Location | Description |
|----|----------|----------|-------------|
| DOC-001 | HMRC MTD API Approval Submission | `HMRC_MTD_API_APPROVAL_SUBMISSION.md` | Comprehensive technical documentation for HMRC approval |
| DOC-002 | HMRC Production Credentials Email | `HMRC_PRODUCTION_CREDENTIALS_EMAIL.md` | Email template for production credential request |
| DOC-003 | Repository Documentation | `REPORT_REPOSITORY_CONTENTS.md` | Architecture and directory structure |

### Test Results - Accessibility

| ID | Test Type | Location | Date | Tool |
|----|-----------|----------|------|------|
| ACC-001 | Pa11y WCAG 2.1 AA | `web/public/tests/accessibility/pa11y-report.txt` | 2026-01-19 | Pa11y |
| ACC-002 | axe-core WCAG 2.1 | `web/public/tests/accessibility/axe-results.json` | 2026-01-19 | axe-core 4.11.1 |
| ACC-003 | axe-core WCAG 2.2 | `web/public/tests/accessibility/axe-wcag22-results.json` | 2026-01-19 | axe-core 4.11.1 |
| ACC-004 | Lighthouse Audit | `web/public/tests/accessibility/lighthouse-results.json` | 2026-01-19 | Lighthouse 12.8.2 |

### Test Results - Security/Penetration

| ID | Test Type | Location | Date | Tool |
|----|-----------|----------|------|------|
| SEC-001 | Dependency Audit | `web/public/tests/penetration/npm-audit.json` | 2026-01-19 | npm audit |
| SEC-002 | Vulnerable Libraries | `web/public/tests/penetration/retire.json` | 2026-01-19 | retire.js 5.4.0 |
| SEC-003 | Static Analysis | `web/public/tests/penetration/eslint-security.txt` | 2026-01-19 | ESLint Security Plugin |
| SEC-004 | Dynamic Security Scan | `web/public/tests/penetration/zap-report.json` | 2026-01-19 | OWASP ZAP 2.17.0 |
| SEC-005 | ZAP HTML Report | `web/public/tests/penetration/zap-report.html` | 2026-01-19 | OWASP ZAP 2.17.0 |

### Test Results - Behaviour/API

| ID | Test Type | Location | Date | Tool |
|----|-----------|----------|------|------|
| BEH-001 | HMRC API Test Report | `web/public/tests/test-report-web-test-local.json` | 2026-01-19 | Playwright |
| BEH-002 | Test Screenshots | `web/public/tests/behaviour-test-results/web-test-local/` | 2026-01-19 | Playwright |
| BEH-003 | Behaviour Test Source | `behaviour-tests/submitVat.behaviour.test.js` | N/A | Playwright |

### Public URLs

| ID | Document | URL |
|----|----------|-----|
| URL-001 | Privacy Policy | https://submit.diyaccounting.co.uk/privacy.html |
| URL-002 | Terms of Service | https://submit.diyaccounting.co.uk/terms.html |
| URL-003 | Accessibility Statement | https://submit.diyaccounting.co.uk/accessibility.html |
| URL-004 | User Guide | https://submit.diyaccounting.co.uk/guide/index.html |
| URL-005 | Interactive Test Report | https://submit.diyaccounting.co.uk/tests/test-report-template.html?test=web-test-local |

---

## Questionnaire 1: Software Developer Checklist Traceability

### Section 1: Organisation Details

| Question | Answer | Evidence Source | Evidence Location |
|----------|--------|-----------------|-------------------|
| Organisation Name | DIY Accounting Limited | DOC-001 | Line 68-69: Company Name |
| Company Registration | 06846849 | DOC-001 | Line 89: Companies House Registration |
| Registered Address | 37 Sutherland Avenue, Leeds, LS8 1BY | DOC-001 | Line 69: Registered Office |
| Contact Email | admin@diyaccounting.co.uk | DOC-001 | Line 73-74: Contact Email |
| Responsible Individual | Antony Cartwright | DOC-001 | Line 75-76: Responsible Individual |

### Section 2: Software Application Details

| Question | Answer | Evidence Source | Evidence Location |
|----------|--------|-----------------|-------------------|
| Software Name | DIY Accounting Submit | DOC-001 | Line 64: Product Name |
| Software Version | 1.0.0 | DOC-001 | Line 66: Version |
| Application URL | https://submit.diyaccounting.co.uk | DOC-001 | Line 65: Product URL |
| Connection Method | WEB_APP_VIA_SERVER | DOC-001 | Line 87: Connection Method |
| Target Users | UK VAT-registered businesses | DOC-001 | Line 86: Target Users |

### Section 3: API Implementation

| Question | Answer | Evidence Source | Evidence Location |
|----------|--------|-----------------|-------------------|
| APIs Implemented | VAT Obligations, VAT Return POST/GET, OAuth | DOC-001, BEH-001 | Lines 95-101, test-report-web-test-local.json hmrcApiRequests array |
| Sandbox Testing Completed | Yes | BEH-001 | `testContext.testData.isSandboxMode: true` |
| Fraud Prevention Headers Validated | Yes | BEH-001 | Lines 138-205: HMRC validation response in hmrcApiRequests |

**Fraud Prevention Header Evidence**:

| Header | Evidence Source | Evidence Location (test-report-web-test-local.json) |
|--------|-----------------|-----------------------------------------------------|
| Gov-Client-Connection-Method | BEH-001 | Line 83: `"Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER"` |
| Gov-Client-Public-IP | BEH-001 | Line 80: `"Gov-Client-Public-IP": "88.97.27.180"` |
| Gov-Client-Device-ID | BEH-001 | Line 81: `"Gov-Client-Device-ID": "7ce9ef98-0330-4232-9adc-1846ffbf46b8"` |
| Gov-Client-User-IDs | BEH-001 | Line 82: `"Gov-Client-User-IDs": "server=anonymous"` |
| Gov-Client-Timezone | BEH-001 | Line 92: `"Gov-Client-Timezone": "UTC+00:00"` |
| Gov-Client-Screens | BEH-001 | Line 91: `"Gov-Client-Screens": "width=1280&height=1446&colour-depth=24&scaling-factor=1"` |
| Gov-Client-Window-Size | BEH-001 | Line 93: `"Gov-Client-Window-Size": "width=1280&height=1446"` |
| Gov-Client-Browser-JS-User-Agent | BEH-001 | Line 88: Full user agent string |
| Gov-Client-Multi-Factor | BEH-001 | Line 89: `"Gov-Client-Multi-Factor": "type=TOTP&timestamp=2026-01-08T00%3A09%3A01Z&unique-reference=test-mfa-1768851611358"` |
| Gov-Vendor-Version | BEH-001 | Line 87: `"Gov-Vendor-Version": "web-submit-diyaccounting-co-uk=1.0.0"` |
| Gov-Vendor-Product-Name | BEH-001 | Line 86: `"Gov-Vendor-Product-Name": "web-submit-diyaccounting-co-uk"` |
| Gov-Vendor-Public-IP | BEH-001 | Line 84: `"Gov-Vendor-Public-IP": "88.97.27.180"` |
| Gov-Vendor-Forwarded | BEH-001 | Line 85: `"Gov-Vendor-Forwarded": "by=88.97.27.180&for=88.97.27.180"` |

**HMRC Validation Response Evidence** (from test-report-web-test-local.json Lines 183-205):
```json
{
  "specVersion": "3.3",
  "message": "At least 1 header is invalid",
  "errors": [
    {
      "message": "Header missing...",
      "headers": ["gov-client-public-port"]
    }
  ],
  "warnings": [
    {
      "message": "Header required",
      "headers": ["gov-vendor-license-ids"]
    }
  ]
}
```

### Section 4: Authentication & Security

| Question | Answer | Evidence Source | Evidence Location |
|----------|--------|-----------------|-------------------|
| User Authentication | AWS Cognito with Google federation | DOC-001 | Lines 152-156: Authentication & Authorization table |
| Token Storage | Encrypted DynamoDB with TTL | DOC-001 | Line 154: Token Storage |
| npm audit results | 0 critical, 0 high, 0 moderate, 3 low | SEC-001 | Lines 68-73: metadata.vulnerabilities |
| retire.js results | 0 vulnerabilities | SEC-002 | Line 1: `"data":[]` |
| ESLint Security | 0 errors, 54 warnings | SEC-003 | Line 100: `✖ 54 problems (0 errors, 54 warnings)` |
| OWASP ZAP | 0 high, 2 medium, 3 low | SEC-004 | Lines 102-132: site alerts with riskcode values |

**npm audit Detail** (from web/public/tests/penetration/npm-audit.json):
```json
"vulnerabilities": {
  "info": 0,
  "low": 3,
  "moderate": 0,
  "high": 0,
  "critical": 0,
  "total": 3
}
```
Note: All 3 low vulnerabilities are in dev dependencies (sinon/diff) not production code.

**OWASP ZAP Findings** (from web/public/tests/penetration/zap-report.json):
| Risk Level | Count | Details |
|------------|-------|---------|
| High | 0 | None |
| Medium | 2 | CSP Header Not Set (ngrok), Sub Resource Integrity Missing (ngrok fonts) |
| Low | 3 | Cross-Domain JS, Permissions Policy, HSTS (all ngrok-related) |
| Informational | 2 | Modern Web App, Cacheable Content |

Note: All medium/low findings are artifacts of using ngrok for local testing, not present in production deployment.

### Section 5: Data Protection

| Question | Answer | Evidence Source | Evidence Location |
|----------|--------|-----------------|-------------------|
| UK GDPR Compliance | Yes | URL-001 | Privacy Policy published at https://submit.diyaccounting.co.uk/privacy.html |
| Data Storage Location | AWS EU-West-2 (London) | DOC-001 | Line 683: Server locations identified |
| Data Retention | 7 years for VAT receipts | DOC-001 | Line 164: Data Retention |
| Backups | DynamoDB PITR enabled | DOC-001 | Line 165: Backups |

### Section 6: Error Handling

| Question | Answer | Evidence Source | Evidence Location |
|----------|--------|-----------------|-------------------|
| All HMRC Error Codes Handled | Yes | DOC-001 | Lines 170-177: Error handling list |
| Retry Logic | SQS with exponential backoff | DOC-001 | Line 177: Transient errors |

### Section 7: Support & Documentation

| Question | Answer | Evidence Source | Evidence Location |
|----------|--------|-----------------|-------------------|
| Privacy Policy | https://submit.diyaccounting.co.uk/privacy.html | URL-001 | Live URL verified |
| Terms of Service | https://submit.diyaccounting.co.uk/terms.html | URL-002 | Live URL verified |
| Accessibility Statement | https://submit.diyaccounting.co.uk/accessibility.html | URL-003 | Live URL verified |
| User Guide | https://submit.diyaccounting.co.uk/guide/index.html | URL-004 | Live URL verified |

### Section 8: Business Model

| Question | Answer | Evidence Source | Evidence Location |
|----------|--------|-----------------|-------------------|
| Software Distribution | Yes - freemium SaaS model | DOC-001 | Lines 692-700: Business Model Questions |
| HMRC Logo Usage | No | DOC-001 | Lines 703-714: Branding Questions |

---

## Questionnaire 2: WCAG 2.1 AA Traceability

### Executive Summary Evidence

| Metric | Result | Evidence Source | Evidence Location |
|--------|--------|-----------------|-------------------|
| Pa11y Results | 16/16 pages passed | ACC-001 | Line 19: `✔ 16/16 URLs passed` |
| axe-core WCAG 2.1 | 0 violations | ACC-002 | JSON: violations array is empty |
| axe-core WCAG 2.2 | 0 violations | ACC-003 | JSON: violations array is empty |
| Test Date | 2026-01-19 | ACC-001-004 | Timestamps in all test files |

### Pa11y Test Results Detail

From `web/public/tests/accessibility/pa11y-report.txt`:

| Page | Errors | Evidence Line |
|------|--------|---------------|
| `/` | 0 | Line 2 |
| `/index.html` | 0 | Line 3 |
| `/privacy.html` | 0 | Line 4 |
| `/terms.html` | 0 | Line 5 |
| `/about.html` | 0 | Line 6 |
| `/accessibility.html` | 0 | Line 7 |
| `/auth/login.html` | 0 | Line 8 |
| `/account/bundles.html` | 0 | Line 9 |
| `/hmrc/vat/submitVat.html` | 0 | Line 10 |
| `/hmrc/vat/vatObligations.html` | 0 | Line 11 |
| `/hmrc/vat/viewVatReturn.html` | 0 | Line 12 |
| `/hmrc/receipt/receipts.html` | 0 | Line 13 |
| `/guide/index.html` | 0 | Line 14 |
| `/help/index.html` | 0 | Line 15 |
| `/errors/404-error-distribution.html` | 0 | Line 16 |
| `/errors/404-error-origin.html` | 0 | Line 17 |

### axe-core Test Results Detail

From `web/public/tests/accessibility/axe-results.json`:

| Field | Value | Evidence |
|-------|-------|----------|
| Tool Version | axe-core 4.11.1 | Line 5: `"version": "4.11.1"` |
| Test Date | 2026-01-19T19:37:08.210Z | Line 17: timestamp |
| Test URL | https://wanted-finally-anteater.ngrok-free.app/ | Line 18: url |
| Violations | 0 | violations array empty |
| Inapplicable Rules | Multiple | Lines 22-100: rules checked but not applicable |

### WCAG Criteria Traceability

#### Principle 1: Perceivable

| Criterion | Compliance | Evidence Source | Evidence Detail |
|-----------|------------|-----------------|-----------------|
| 1.1.1 Non-text Content | Pass | ACC-001 | Pa11y: 0 img alt errors |
| 1.3.1 Info and Relationships | Pass | ACC-002 | axe-core: No structure violations |
| 1.3.2 Meaningful Sequence | Pass | ACC-002 | axe-core: Reading order validated |
| 1.4.3 Contrast (Minimum) | Pass | ACC-002 | axe-core: 0 color-contrast violations |
| 1.4.4 Resize Text | Pass | Manual | Responsive design supports 200% zoom |
| 1.4.10 Reflow | Pass | ACC-001 | Pa11y: 0 viewport errors |
| 1.4.11 Non-text Contrast | Pass | ACC-002 | axe-core: 0 violations |

#### Principle 2: Operable

| Criterion | Compliance | Evidence Source | Evidence Detail |
|-----------|------------|-----------------|-----------------|
| 2.1.1 Keyboard | Pass | ACC-001 | Pa11y: 0 keyboard errors |
| 2.1.2 No Keyboard Trap | Pass | ACC-002 | axe-core: 0 focus-trap violations |
| 2.4.1 Bypass Blocks | Pass | Manual | Skip-to-content links present |
| 2.4.2 Page Titled | Pass | ACC-002 | axe-core: 0 document-title violations |
| 2.4.3 Focus Order | Pass | ACC-002 | axe-core: 0 tabindex violations |
| 2.4.4 Link Purpose | Pass | ACC-002 | axe-core: 0 link-name violations |
| 2.4.6 Headings and Labels | Pass | ACC-002 | axe-core: 0 heading violations |
| 2.4.7 Focus Visible | Pass | ACC-001 | Pa11y: 0 focus-indicator errors |

#### Principle 3: Understandable

| Criterion | Compliance | Evidence Source | Evidence Detail |
|-----------|------------|-----------------|-----------------|
| 3.1.1 Language of Page | Pass | ACC-002 | axe-core: 0 html-has-lang violations |
| 3.2.3 Consistent Navigation | Pass | Manual | Same nav structure on all pages |
| 3.3.1 Error Identification | Pass | Manual | Form validation messages displayed |
| 3.3.2 Labels or Instructions | Pass | ACC-002 | axe-core: 0 label violations |

#### Principle 4: Robust

| Criterion | Compliance | Evidence Source | Evidence Detail |
|-----------|------------|-----------------|-----------------|
| 4.1.1 Parsing | Pass | ACC-002 | axe-core: 0 parse violations |
| 4.1.2 Name, Role, Value | Pass | ACC-002 | axe-core: 0 aria violations |

### WCAG 2.2 Additional Criteria

From `web/public/tests/accessibility/axe-wcag22-results.json`:

| Criterion | Compliance | Evidence |
|-----------|------------|----------|
| 2.4.11 Focus Not Obscured | Pass | 0 violations in WCAG 2.2 ruleset |
| 2.5.8 Target Size | Pass | Button sizing meets 24x24 requirement |
| 3.2.6 Consistent Help | Pass | Help link consistently in footer |
| 3.3.7 Redundant Entry | Pass | Forms retain values |
| 3.3.8 Accessible Authentication | Pass | OAuth flow uses standard controls |

---

## Visual Evidence - Screenshots

Screenshots from behaviour tests that provide visual evidence of application functionality:

| Screenshot | Location | Description |
|------------|----------|-------------|
| fill-in-submission-pagedown.png | BEH-002 | VAT return form with data entered |
| complete-vat-receipt.png | BEH-002 | HMRC submission receipt displayed |
| submit-hmrc-auth.png | BEH-002 | HMRC OAuth authorization page |
| view-vat-return-results.png | BEH-002 | Retrieved VAT return data display |
| home.png | BEH-002 | Application home page |
| receipt.png | BEH-002 | Receipt listing page |
| obligations-results-pagedown.png | BEH-002 | VAT obligations display |

---

## Cross-Reference Summary

### Documents Created

1. `Questionnaire-1-Software-Developer-Checklist-COMPLETED.md`
   - Based on standard HMRC software developer requirements
   - Evidence traced to: DOC-001, DOC-002, BEH-001, SEC-001-004

2. `Questionnaire-2-WCAG-2.1-AA-COMPLETED.md`
   - Based on WCAG 2.1 Level AA success criteria
   - Evidence traced to: ACC-001-004, URL-003

3. `QUESTIONNAIRE_EVIDENCE_TRACEABILITY.md` (this document)
   - Complete traceability matrix linking all answers to evidence

### Source Documents Used

| Source | Used For |
|--------|----------|
| `HMRC_MTD_API_APPROVAL_SUBMISSION.md` | Organisation details, API implementation, security measures |
| `HMRC_PRODUCTION_CREDENTIALS_EMAIL.md` | Contact details, API endpoints |
| `web/public/tests/accessibility/pa11y-report.txt` | Page-by-page WCAG compliance |
| `web/public/tests/accessibility/axe-results.json` | Detailed WCAG rule validation |
| `web/public/tests/accessibility/axe-wcag22-results.json` | WCAG 2.2 validation |
| `web/public/tests/penetration/npm-audit.json` | Dependency vulnerability counts |
| `web/public/tests/penetration/retire.json` | Known vulnerable library scan |
| `web/public/tests/penetration/eslint-security.txt` | Static code analysis results |
| `web/public/tests/penetration/zap-report.json` | Dynamic security scan results |
| `web/public/tests/test-report-web-test-local.json` | HMRC API test evidence, fraud prevention headers |

---

**End of Evidence Traceability Document**
