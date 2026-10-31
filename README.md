<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-24 Document developer setup and repository conventions
- **Use when:** a new contributor needs the setup guide, or the session record needs reading.
- **Does:** README.md describes the app, setup and key features, and CLAUDE.md carries the project's Claude Code conventions. _developers/SETUP.md is the local development setup guide, and NEXT.md is the live open-work board. The PLAN_*.md documents hold the work not yet boarded, and REPORT_*.md files are session and audit reports.
- **Run:** no command; see Does and Entry
- **Entry:** `README.md`; `_developers/SETUP.md`; `NEXT.md`
- **Files:** README.md, CLAUDE.md, _developers/SETUP.md, NEXT.md
- **Keywords:** readme, setup guide, developer onboarding, next.md, plan doc, session report, architecture report
- **Related:** DEV-27, DEV-40
@end-capability -->

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

## npm scripts

<!-- scripts-table:start -->
371 scripts in package.json. A group is the text before the first colon; a name below follows it.

| Group | Scripts | Names |
|-------|---------|-------|
| `npm run test:` | 211 | `test` `all` `app-unit` `web-unit` `unit` `coverage` `system` `system-coverage` `browser` `enableCognitoNative` `disableCognitoNative` `totpCode` `behaviour` `allBehaviour` `allBehaviour-proxy` `allBehaviour-simulator` `allBehaviour-ci` `allBehaviour-prod` `authBehaviour` `authBehaviour-proxy` `authBehaviour-simulator` `authBehaviour-ci` `authBehaviour-prod` `bundleBehaviour` `bundleBehaviour-proxy` `bundleBehaviour-simulator` `bundleBehaviour-ci` `bundleBehaviour-prod` `tokenRefreshBehaviour` `tokenRefreshBehaviour-proxy` `tokenRefreshBehaviour-simulator` `tokenRefreshBehaviour-ci` `tokenRefreshBehaviour-prod` `submitVatBehaviour` `submitVatBehaviour-proxy` `submitVatBehaviour-ci` `submitVatBehaviour-prod` `submitVatBehaviour-simulator` `postVatReturnFraudPreventionHeadersBehaviour` `postVatReturnFraudPreventionHeadersBehaviour-proxy` `postVatReturnFraudPreventionHeadersBehaviour-ci` `postVatReturnFraudPreventionHeadersBehaviour-prod` `postVatReturnFraudPreventionHeadersBehaviour-simulator` `getVatObligationsBehaviour` `getVatObligationsBehaviour-proxy` `getVatObligationsBehaviour-ci` `getVatObligationsBehaviour-prod` `getVatObligationsBehaviour-simulator` `getVatLiabilitiesBehaviour` `getVatLiabilitiesBehaviour-proxy` `getVatLiabilitiesBehaviour-ci` `getVatLiabilitiesBehaviour-prod` `getVatLiabilitiesBehaviour-simulator` `getVatPaymentsBehaviour` `getVatPaymentsBehaviour-proxy` `getVatPaymentsBehaviour-ci` `getVatPaymentsBehaviour-prod` `getVatPaymentsBehaviour-simulator` `getVatPenaltiesBehaviour` `getVatPenaltiesBehaviour-proxy` `getVatPenaltiesBehaviour-ci` `getVatPenaltiesBehaviour-prod` `getVatPenaltiesBehaviour-simulator` `itsaBusinessDetailsBehaviour` `itsaBusinessDetailsBehaviour-proxy` `itsaBusinessDetailsBehaviour-ci` `itsaBusinessDetailsBehaviour-prod` `itsaBusinessDetailsBehaviour-simulator` `itsaObligationsBehaviour` `itsaObligationsBehaviour-proxy` `itsaObligationsBehaviour-ci` `itsaObligationsBehaviour-prod` `itsaObligationsBehaviour-simulator` `itsaSelfEmploymentPeriodBehaviour` `itsaSelfEmploymentPeriodBehaviour-proxy` `itsaSelfEmploymentPeriodBehaviour-ci` `itsaSelfEmploymentPeriodBehaviour-prod` `itsaSelfEmploymentPeriodBehaviour-simulator` `itsaAnnualSubmissionBehaviour` `itsaAnnualSubmissionBehaviour-proxy` `itsaAnnualSubmissionBehaviour-ci` `itsaAnnualSubmissionBehaviour-prod` `itsaAnnualSubmissionBehaviour-simulator` `itsaUkPropertyPeriodBehaviour` `itsaUkPropertyPeriodBehaviour-proxy` `itsaUkPropertyPeriodBehaviour-ci` `itsaUkPropertyPeriodBehaviour-prod` `itsaUkPropertyPeriodBehaviour-simulator` `itsaUkPropertyAnnualSubmissionBehaviour` `itsaUkPropertyAnnualSubmissionBehaviour-proxy` `itsaUkPropertyAnnualSubmissionBehaviour-ci` `itsaUkPropertyAnnualSubmissionBehaviour-prod` `itsaUkPropertyAnnualSubmissionBehaviour-simulator` `itsaForeignPropertyPeriodBehaviour` `itsaForeignPropertyPeriodBehaviour-proxy` `itsaForeignPropertyPeriodBehaviour-ci` `itsaForeignPropertyPeriodBehaviour-prod` `itsaForeignPropertyPeriodBehaviour-simulator` `itsaForeignPropertyAnnualSubmissionBehaviour` `itsaForeignPropertyAnnualSubmissionBehaviour-proxy` `itsaForeignPropertyAnnualSubmissionBehaviour-ci` `itsaForeignPropertyAnnualSubmissionBehaviour-prod` `itsaForeignPropertyAnnualSubmissionBehaviour-simulator` `itsaLossesAndClaimsBehaviour` `itsaLossesAndClaimsBehaviour-proxy` `itsaLossesAndClaimsBehaviour-ci` `itsaLossesAndClaimsBehaviour-prod` `itsaLossesAndClaimsBehaviour-simulator` `itsaFinalDeclarationBehaviour` `itsaFinalDeclarationBehaviour-proxy` `itsaFinalDeclarationBehaviour-ci` `itsaFinalDeclarationBehaviour-prod` `itsaFinalDeclarationBehaviour-simulator` `postVatReturnBehaviour` `postVatReturnBehaviour-proxy` `postVatReturnBehaviour-ci` `postVatReturnBehaviour-prod` `postVatReturnBehaviour-simulator` `practiceLicenceBehaviour` `practiceLicenceBehaviour-proxy` `practiceLicenceBehaviour-ci` `practiceLicenceBehaviour-prod` `practiceLicenceBehaviour-simulator` `getVatReturnBehaviour` `getVatReturnBehaviour-proxy` `getVatReturnBehaviour-ci` `getVatReturnBehaviour-prod` `getVatReturnBehaviour-simulator` `complianceBehaviour` `complianceBehaviour-proxy` `complianceBehaviour-ci` `complianceBehaviour-prod` `complianceBehaviour-simulator` `helpBehaviour` `helpBehaviour-proxy` `helpBehaviour-ci` `helpBehaviour-prod` `helpBehaviour-simulator` `vatValidationBehaviour` `vatValidationBehaviour-proxy` `vatValidationBehaviour-ci` `vatValidationBehaviour-prod` `vatValidationBehaviour-simulator` `hmrcAssistBehaviour` `hmrcAssistBehaviour-proxy` `hmrcAssistBehaviour-ci` `hmrcAssistBehaviour-simulator` `vatSchemesBehaviour` `vatSchemesBehaviour-proxy` `vatSchemesBehaviour-ci` `vatSchemesBehaviour-prod` `vatSchemesBehaviour-simulator` `passRedemptionBehaviour` `passRedemptionBehaviour-proxy` `passRedemptionBehaviour-ci` `passRedemptionBehaviour-prod` `passRedemptionBehaviour-simulator` `tokenEnforcementBehaviour` `tokenEnforcementBehaviour-proxy` `tokenEnforcementBehaviour-ci` `tokenEnforcementBehaviour-prod` `tokenEnforcementBehaviour-simulator` `paymentBehaviour` `paymentBehaviour-proxy` `paymentBehaviour-ci` `paymentBehaviour-prod` `paymentBehaviour-simulator` `generatePassActivityBehaviour` `generatePassActivityBehaviour-proxy` `generatePassActivityBehaviour-ci` `generatePassActivityBehaviour-prod` `generatePassActivityBehaviour-simulator` `companiesHouseBehaviour` `companiesHouseBehaviour-proxy` `companiesHouseBehaviour-ci` `companiesHouseBehaviour-prod` `companiesHouseBehaviour-simulator` `diyaGlBehaviour` `diyaGlBehaviour-proxy` `diyaGlBehaviour-ci` `diyaGlBehaviour-prod` `diyaGlBehaviour-simulator` `mcpHostedBehaviour` `mcpHostedBehaviour-simulator` `mcpHostedBehaviour-ci` `mcpHmrcGrantBehaviour` `mcpHmrcGrantBehaviour-simulator` `diyaGlSubscriptionBehaviour` `diyaGlSubscriptionBehaviour-ci` `changeRegisteredOfficeBehaviour` `changeRegisteredOfficeBehaviour-proxy` `changeRegisteredOfficeBehaviour-ci` `changeRegisteredOfficeBehaviour-prod` `changeRegisteredOfficeBehaviour-simulator` `changeRegisteredEmailBehaviour` `changeRegisteredEmailBehaviour-proxy` `changeRegisteredEmailBehaviour-ci` `changeRegisteredEmailBehaviour-prod` `changeRegisteredEmailBehaviour-simulator` `fileMicroEntityAccountsBehaviour` `fileMicroEntityAccountsBehaviour-proxy` `fileMicroEntityAccountsBehaviour-ci` `fileMicroEntityAccountsBehaviour-prod` `fileMicroEntityAccountsBehaviour-simulator` `companyTaxReturnBehaviour` `companyTaxReturnBehaviour-simulator` `fileConfirmationStatementBehaviour` `fileConfirmationStatementBehaviour-proxy` `fileConfirmationStatementBehaviour-ci` `fileConfirmationStatementBehaviour-prod` `fileConfirmationStatementBehaviour-simulator` |
| `npm run accessibility:` | 39 | `proxy` `ci` `prod` `proxy-report` `ci-report` `prod-report` `pa11y-proxy` `pa11y-ci` `pa11y-prod` `pa11y-proxy-report` `pa11y-ci-report` `pa11y-prod-report` `axe-proxy` `axe-ci` `axe-prod` `axe-proxy-report` `axe-ci-report` `axe-prod-report` `axe-wcag22-proxy` `axe-wcag22-ci` `axe-wcag22-prod` `axe-wcag22-proxy-report` `axe-wcag22-ci-report` `axe-wcag22-prod-report` `lighthouse-proxy` `lighthouse-ci` `lighthouse-prod` `lighthouse-proxy-report` `lighthouse-ci-report` `lighthouse-prod-report` `lighthouse-multi-proxy` `lighthouse-multi-ci` `lighthouse-multi-prod` `text-spacing-proxy` `text-spacing-ci` `text-spacing-prod` `text-spacing-proxy-report` `text-spacing-ci-report` `text-spacing-prod-report` |
| `npm run penetration:` | 20 | `proxy` `ci` `prod` `proxy-report` `ci-report` `prod-report` `eslint` `eslint-report` `audit` `audit-report` `audit-dev` `audit-dev-report` `retire` `retire-report` `zap-proxy` `zap-ci` `zap-prod` `zap-proxy-report` `zap-ci-report` `zap-prod-report` |
| `npm run compliance:` | 9 | `proxy` `ci` `prod` `proxy-report` `ci-report` `prod-report` `proxy-report-md` `ci-report-md` `prod-report-md` |
| `npm run video:` | 8 | `mcp-diya-gl` `accounting-diya-gl-profit` `accounting-spreadsheet-profit` `publish` `embed-check` `walkthrough` `stale` `record` |
| `npm run diagram:` | 7 | `app-all` `app-auth-billing` `app-hmrc` `app-account` `app-ops` `app-delivery` `environment` |
| `npm run ads:` | 5 | `inventory` `sync` `report` `conversions-upload` `forecast` |
| `npm run formatting:` | 5 | `formatting` `js` `js-fix` `java` `java-fix` |
| `npm run msads:` | 5 | `consent` `whoami` `inventory` `forecast` `report` |
| `npm run seo:` | 4 | `structured-data-submit-prod` `structured-data-prod` `structured-data-submit-ci` `structured-data-ci` |
| `npm run build:` | 3 | `build` `mtd-calendar` `rates-page` |
| `npm run cdk:` | 3 | `synth-environment` `synth-application` `cdk` |
| `npm run deploy:` | 3 | `app` `app-ci` `app-prod` |
| `npm run start:` | 3 | `start` `simulator` `proxy` |
| `npm run stripe:` | 3 | `cancel` `trigger-lifecycle` `configure-policies` |
| `npm run bundle:` | 2 | `bundle` `books` |
| `npm run capabilities:` | 2 | `generate` `check` |
| `npm run data:` | 2 | `data` `simulator` |
| `npm run ga4:` | 2 | `sync` `bigquery-sync` |
| `npm run mcp:` | 2 | `vat-sandbox-proof` `accounts-test-service-proof` |
| `npm run server:` | 2 | `server` `simulator` |
| `npm run verify:` | 2 | `tax-sources` `waf-false-positives` |
| `npm run auth:` | 1 | `auth` |
| `npm run cdk-ci:` | 1 | `cdk-ci` |
| `npm run clean:` | 1 | `clean` |
| `npm run cloudfront:` | 1 | `set-origins` |
| `npm run docker:` | 1 | `build` |
| `npm run everything:` | 1 | `everything` |
| `npm run exploratory:` | 1 | `diff` |
| `npm run formatting-fix:` | 1 | `formatting-fix` |
| `npm run generate:` | 1 | `submission-record` |
| `npm run generate-pass:` | 1 | `generate-pass` |
| `npm run google:` | 1 | `inventory` |
| `npm run lighthouse:` | 1 | `multi` |
| `npm run lint:` | 1 | `workflows` |
| `npm run linting:` | 1 | `linting` |
| `npm run linting-fix:` | 1 | `linting-fix` |
| `npm run playwright:` | 1 | `install` |
| `npm run pretest:` | 1 | `pretest` |
| `npm run scripts:` | 1 | `table` |
| `npm run set-apex-origins:` | 1 | `set-apex-origins` |
| `npm run simulator:` | 1 | `simulator` |
| `npm run site:` | 1 | `screenshots` |
| `npm run test-report:` | 1 | `test-report` |
| `npm run update:` | 1 | `java` |
| `npm run update-to-greatest:` | 1 | `update-to-greatest` |
| `npm run update-to-latest:` | 1 | `update-to-latest` |
| `npm run update-to-minor:` | 1 | `update-to-minor` |
| `npm run users:` | 1 | `provision` |
| `npm run validate:` | 1 | `accounts-ixbrl` |
| `npm run videos:` | 1 | `manifest` |
<!-- scripts-table:end -->

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
