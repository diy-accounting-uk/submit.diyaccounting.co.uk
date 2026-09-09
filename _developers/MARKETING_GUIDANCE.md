<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Marketing Guidance for DIY Accounting Submit

**Document Version**: 1.0
**Last Updated**: 12 January 2026

This document outlines marketing and communications requirements for DIY Accounting Submit, based on HMRC Terms of Use and UK advertising standards.

---

## HMRC Terminology Requirements

### Permitted Terminology

| Term | Allowed | Example |
|------|---------|---------|
| "HMRC recognised" | Yes | "DIY Accounting Submit is HMRC recognised MTD software" |
| "Compatible with HMRC" | Yes | "Compatible with HMRC Making Tax Digital" |
| "Works with HMRC APIs" | Yes | "Works with official HMRC APIs" |
| "MTD-compatible" | Yes | "MTD-compatible VAT submission software" |

### Prohibited Terminology

| Term | Not Allowed | Why |
|------|-------------|-----|
| "HMRC approved" | No | Implies endorsement |
| "HMRC accredited" | No | Implies certification |
| "HMRC certified" | No | Implies official certification |
| "Official HMRC software" | No | Implies HMRC ownership |
| "Recommended by HMRC" | No | Implies endorsement |
| "Endorsed by HMRC" | No | Direct claim of endorsement |

### Correct Usage Examples

**Correct:**
- "DIY Accounting Submit is HMRC recognised software for Making Tax Digital"
- "Submit your VAT returns using HMRC's official MTD APIs"
- "Compatible with HMRC Making Tax Digital for VAT"

**Incorrect:**
- "DIY Accounting Submit is approved by HMRC"
- "HMRC-certified VAT submission software"
- "Officially endorsed by HMRC"

---

## HMRC Logo and Branding

### Prohibited Uses

You **must not**:
- Use the HMRC logo on the website
- Use the HMRC logo in any marketing materials
- Use the HMRC logo in the software interface
- Create materials that could be confused with official HMRC communications
- Use HMRC's crown or coat of arms symbols

### Permitted References

You **may**:
- Refer to "HMRC" by name in text
- Link to official HMRC documentation
- Display the "Making Tax Digital" phrase (not as a logo)
- Reference HMRC API documentation

---

## Our Own Marks

DIY Accounting™, DIY Accounting Spreadsheets™, DIY Accounting Submit™ and DIYA-GL™ are our
trade marks. None is registered yet, so write ™ after each one on its first mention in a piece
of copy. Write ® only after a mark registers.

A mark is an adjective in front of a noun: "a DIY Accounting Submit™ filing", not "a DIY
Accounting Submit". Keep the spelling and capitalisation exact, and never pluralise a mark.

`TRADEMARKS.md` in the repository root holds the full rules, including what other people may
and may not do with the marks.

---

## Advertising Standards (ASA/CAP)

All advertising must comply with the UK Advertising Standards Authority (ASA) Codes and the Committee of Advertising Practice (CAP) Code.

### Key Requirements

1. **Truthfulness**: All claims must be accurate and verifiable
2. **Clarity**: Pricing and features must be clearly stated
3. **Substantiation**: Be able to prove any claims made
4. **Fairness**: Do not denigrate competitors unfairly

### Claims We Can Make

| Claim | Evidence |
|-------|----------|
| "Free VAT submission" | Guest bundle is free |
| "Free to use, source available" | PolyForm Internal Use License 1.0.0 |
| "Data encrypted at rest and in transit" | AWS KMS, TLS 1.2+ |
| "Servers in UK" | AWS eu-west-2 London |
| "7-year receipt retention" | DynamoDB TTL configuration |

### Claims Requiring Caution

| Claim | Caution |
|-------|---------|
| "Secure" | Must have evidence (penetration testing) |
| "Fast" | Must define what "fast" means |
| "Best" | Superlatives require substantiation |
| "Easiest" | Comparative claims need evidence |

---

## Customer Consent for Marketing

### Requirements

Per UK GDPR and PECR (Privacy and Electronic Communications Regulations):

1. **Opt-in required**: Must obtain explicit consent before sending marketing emails
2. **Easy opt-out**: Every marketing email must include unsubscribe link
3. **Record consent**: Keep records of when and how consent was obtained
4. **No pre-ticked boxes**: Consent checkboxes must not be pre-selected

### Current Implementation

- No marketing emails are currently sent
- No marketing consent collection is implemented
- If marketing is added, implement:
  - Consent checkbox on registration (not pre-ticked)
  - Double opt-in confirmation email
  - Consent audit log in database
  - Unsubscribe mechanism

---

## Social Media Guidelines

### Permitted

- Announce new features
- Share helpful VAT submission tips
- Link to official HMRC guidance
- Respond to customer questions
- Point people at the published source

### Prohibited

- Impersonating HMRC
- Using HMRC branding
- Making claims we can't substantiate
- Sharing customer data or testimonials without consent
- Disparaging competitors

---

## Website Content Guidelines

### Required Disclosures

The following must be clearly visible:

1. **Company details** (Companies Act 2006):
   - Company name: DIY Accounting Limited
   - Registered number: 06846849
   - Registered address: 37 Sutherland Avenue, Leeds, LS8 1BY

2. **Legal links** (footer of every page):
   - Privacy Policy
   - Terms of Use

3. **Contact information**:
   - Email: admin@diyaccounting.co.uk

### Current Status

- Company details: In terms.html Section 20
- Privacy policy: /privacy.html (linked in footer)
- Terms of use: /terms.html (linked in footer)
- Contact: In privacy.html and terms.html

---

## Press and Media

### If Contacted by Media

1. Direct all enquiries to admin@diyaccounting.co.uk
2. Do not make statements about HMRC policies
3. Do not claim endorsement or approval
4. Refer to official HMRC documentation for MTD questions

### Press Release Template

```
FOR IMMEDIATE RELEASE

DIY Accounting Submit - Free MTD VAT Submission Software

DIY Accounting Limited announces [feature/milestone].

DIY Accounting Submit™ is HMRC recognised software that enables UK
businesses to submit VAT returns via Making Tax Digital APIs.

[Details of announcement]

About DIY Accounting Limited:
DIY Accounting Limited (Company No. 06846849) provides accounting software
for UK small businesses, free to use and with the source available.

Contact: admin@diyaccounting.co.uk
Website: https://submit.diyaccounting.co.uk
```

---

## Compliance Checklist

Before publishing any marketing material:

- [ ] No use of "approved", "accredited", or "certified" with HMRC
- [ ] No HMRC logos or crown symbols
- [ ] All claims are truthful and can be substantiated
- [ ] Company registration details included where required
- [ ] Privacy policy and terms links present
- [ ] No customer data shared without consent
- [ ] Complies with ASA/CAP codes

---

## References

- [HMRC Terms of Use](https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use)
- [ASA CAP Code](https://www.asa.org.uk/codes-and-rulings/advertising-codes.html)
- [ICO Marketing Guidelines](https://ico.org.uk/for-organisations/direct-marketing/)
- [Companies Act 2006 - Company Details](https://www.legislation.gov.uk/ukpga/2006/46/part/5/chapter/6)

---

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-12 | 1.0 | Initial version |
