<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# DIY Accounting Submit™

**HMRC recognised software for Making Tax Digital VAT submissions**

Submit UK VAT returns to HMRC using the official Making Tax Digital (MTD) APIs.

**Website**: https://submit.diyaccounting.co.uk
**Status**: Production

---

## What is DIY Accounting Submit?

DIY Accounting Submit is a free web application that enables UK VAT-registered businesses to:

- **View VAT obligations** - See your outstanding and fulfilled VAT periods
- **Submit VAT returns** - File your VAT return directly to HMRC
- **View submission receipts** - Access confirmation of submitted returns
- **Track submission history** - Keep records for 7 years (HMRC requirement)

The software connects directly to HMRC's official MTD APIs and implements all required fraud prevention measures.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Free to use** | Guest bundle available at no cost |
| **HMRC compliant** | Full fraud prevention header implementation |
| **Secure** | Data encrypted at rest (AES-256) and in transit (TLS 1.2+) |
| **UK hosted** | AWS eu-west-2 (London) region |
| **Privacy focused** | User identifiers hashed before storage |
| **Source available** | Read the whole source under the PolyForm Internal Use License 1.0.0 |
| **7-year retention** | Submission receipts stored per HMRC requirements |

---

## How It Works

1. **Sign in** with Google (via AWS Cognito)
2. **Authorise** the application through HMRC's secure OAuth flow
3. **Enter** your VAT return figures
4. **Submit** directly to HMRC
5. **Receive** confirmation and receipt

Your HMRC Government Gateway credentials are never stored by this application. Authentication is handled entirely by HMRC's secure OAuth service.

---

## Technology

| Component | Technology |
|-----------|------------|
| Frontend | Static HTML/JavaScript (no framework dependencies) |
| Backend | Node.js on AWS Lambda |
| Authentication | AWS Cognito with Google federation |
| Data storage | AWS DynamoDB (encrypted at rest) |
| Hosting | AWS CloudFront + S3 |
| Security | AWS WAF, TLS 1.2+, fraud prevention headers |

### HMRC Integration

- **APIs used**: VAT MTD (obligations, returns)
- **Connection method**: WEB_APP_VIA_SERVER
- **Fraud prevention**: All Gov-Client and Gov-Vendor headers implemented
- **Error handling**: Full HMRC error code mapping

---

## Compliance

### HMRC Requirements

| Requirement | Status |
|-------------|--------|
| Fraud prevention headers | Implemented and validated |
| OAuth 2.0 authentication | Implemented |
| Error handling | All HMRC error codes handled |
| Accessibility (WCAG 2.1 AA) | Implemented (13/13 pages pass) |
| Penetration testing | Scheduled |

### Data Protection

| Requirement | Status |
|-------------|--------|
| UK GDPR compliance | Implemented |
| Privacy policy | Published |
| Terms of service | Published |
| Data subject rights | Export/deletion scripts available |
| 72-hour breach notification | Documented procedures |

---

## Organisation

**DIY Accounting Limited**
- Registered Office: 37 Sutherland Avenue, Leeds, LS8 1BY.
- Company Number: 06846849
- Registered in England and Wales
- Contact: admin@diyaccounting.co.uk

---

## Documentation

| Document | Description |
|----------|-------------|
| [Privacy Policy](https://submit.diyaccounting.co.uk/privacy.html) | How we handle your data |
| [Terms of Use](https://submit.diyaccounting.co.uk/terms.html) | Service terms and conditions |
| [User Guide](https://submit.diyaccounting.co.uk/guide/index.html) | How to use the application |
| [Accessibility Statement](https://submit.diyaccounting.co.uk/accessibility.html) | WCAG 2.1 AA compliance |

---

## Licence

The service is free to use and the source is available. The source is licensed under the
**PolyForm Internal Use License 1.0.0**, with an additional grant for accountants and bookkeepers.

- Use the hosted service at https://submit.diyaccounting.co.uk.
- Run your own copy on your own machine, for your own or your company's business.
- An accountant or bookkeeper may use it to prepare accounts for their own clients.
- Do not host it for other people, under our name or any other, and do not pass the source on.

See [LICENSE](LICENSE) for the full text and [LICENSING.md](LICENSING.md) for which licence
covers which file.

### Contributions

This repository does not accept contributions. Please do not send a pull request.

Found a security problem? [SECURITY.md](SECURITY.md) says how to tell us privately.

### Trade marks

DIY Accounting™, DIY Accounting Submit™ and DIYA-GL™ are trade marks of DIY Accounting Limited.
The licence gives you no right to use them. See [TRADEMARKS.md](TRADEMARKS.md).

### Third-Party Attributions

- HMRC and Making Tax Digital are trademarks of HM Revenue and Customs
- AWS is a trademark of Amazon Web Services
- Google is a trademark of Alphabet Inc.

---

## Support

For support enquiries: **admin@diyaccounting.co.uk**

For HMRC-specific questions about VAT or Making Tax Digital, please contact HMRC directly or visit [gov.uk/vat](https://www.gov.uk/vat).

---

*DIY Accounting Submit is HMRC recognised software. This software is not endorsed, approved, or certified by HMRC.*
