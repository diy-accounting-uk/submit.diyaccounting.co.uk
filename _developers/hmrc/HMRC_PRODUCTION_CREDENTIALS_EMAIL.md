# HMRC Production Credentials Request Email

**To:** SDSTeam@hmrc.gov.uk
**Subject:** Production Credentials Request - DIY Accounting Submit (VAT MTD)

---

> **Licence note, added 2026-09-09.** This document is the record of what we sent HMRC, so
> its wording stands. The licence changed on 2026-09-09. The service is free to use and its
> source is available under the PolyForm Internal Use License 1.0.0, with an additional grant
> for accountants and bookkeepers. It is no longer AGPL-3.0 and we no longer describe it as
> open source. Nothing about the `gov-vendor-license-ids` header changes: we still issue no
> licence keys, so the header still has no data to carry.

---

Dear Software Developer Support Team,

I am writing to request production credentials for our VAT (MTD) software application.

## Application Details

| Field | Value                              |
|-------|------------------------------------|
| Product Name | DIY Accounting Submit              |
| Product URL | https://submit.diyaccounting.co.uk |
| Version | 1.0.0                              |
| Connection Method | WEB_APP_VIA_SERVER                 |

## Organisation Details

| Field | Value |
|-------|-------|
| Company Name | DIY Accounting Limited |
| Company Number | 06846849 (England and Wales) |
| Registered Office | 37 Sutherland Avenue, Leeds, LS8 1BY |
| Contact Email | admin@diyaccounting.co.uk |
| Responsible Individual | Antony Cartwright, Director |

## API Endpoints Implemented

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/organisations/vat/{vrn}/returns` | POST | Submit VAT Return |
| `/organisations/vat/{vrn}/returns/{periodKey}` | GET | View VAT Return |
| `/organisations/vat/{vrn}/obligations` | GET | Retrieve Obligations |
| `/oauth/token` | POST | OAuth Token Exchange |

## Testing Completed

We have completed testing in the sandbox environment using the Create Test User API and Test Fraud Prevention Headers API.

**Test evidence is available at:**
https://submit.diyaccounting.co.uk/tests/test-report-template.html?test=web-test-local

## Fraud Prevention Headers

Our fraud prevention headers have been validated against specVersion 3.3 of the Test Fraud Prevention Headers API. Two items require explanation:

### 1. gov-client-public-port (Error - MISSING_HEADER)

Our application uses AWS CloudFront CDN. The client's source port is not preserved through the CloudFront edge network, making this header impossible to collect reliably.

### 2. gov-vendor-license-ids (Warning - MISSING_HEADER)

Not applicable. This is open source software and we do not issue license keys to users.

### Headers Sent Correctly

All other mandatory headers are sent correctly:

| Header | Implementation |
|--------|----------------|
| Gov-Client-Connection-Method | `WEB_APP_VIA_SERVER` |
| Gov-Client-Public-IP | Extracted from CloudFront X-Forwarded-For |
| Gov-Client-Device-ID | HMAC-SHA256 hashed user identifier |
| Gov-Client-Timezone | JavaScript Intl API |
| Gov-Client-Screens | JavaScript screen properties |
| Gov-Client-Window-Size | JavaScript window dimensions |
| Gov-Client-Browser-JS-User-Agent | JavaScript navigator.userAgent |
| Gov-Client-Multi-Factor | MFA metadata from Google federation |
| Gov-Vendor-Version | Software version from package.json |
| Gov-Vendor-Product-Name | `web-submit-diyaccounting-co-uk` |
| Gov-Vendor-Public-IP | Server public IP |
| Gov-Vendor-Forwarded | Proxy chain information |

## Compliance

| Compliance | Evidence |
|------------|----------|
| ICO Registration | ZB070902 ([ICO Public Register](https://ico.org.uk/ESDWebPages/Entry/ZB070902)) |

## Documentation

| Document | URL |
|----------|-----|
| Privacy Policy | https://submit.diyaccounting.co.uk/privacy.html |
| Terms of Use | https://submit.diyaccounting.co.uk/terms.html |
| Accessibility Statement | https://submit.diyaccounting.co.uk/accessibility.html |

---

We have accepted the HMRC Terms of Use and are ready to complete any questionnaires required for the approval process.

Kind regards,

**Antony Cartwright**
Director
DIY Accounting Ltd
admin@diyaccounting.co.uk
