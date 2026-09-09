<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Licensing

Copyright (C) 2006-2026 DIY Accounting Limited.

Source: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk

DIY Accounting Submit is free to use and the source is available. This page says which
licence covers which file.

## The layer

This repository is the hosted product: the PolyForm Internal Use License 1.0.0, plus the
additional grant in `LICENSE` that lets an accountant or bookkeeper use the service to
prepare accounts for their own clients. Use the hosted service, or run a local copy on your
own machine to keep your own books or your clients' books. Do not host this product, or a
renamed copy of it, for other people, and do not redistribute the source.

The DIYA-GL engine this repository calls (the `@diy-accounting-uk/diya-gl` package and its
image) is a separate, Apache-2.0 dependency and is not covered by this file.

### Running on localhost is permitted use

PolyForm Internal Use permits use for your own and your company's internal business
operations. Running a local copy of this site or its Docker image on your own machine is
exactly that. The licence stops at distribution: do not pass the software on to other
people, and do not host it for others under any name.

## Top-level directories

| Path | Licence |
| --- | --- |
| `_developers/` | PolyForm |
| `.claude/`, `.github/`, `.junie/`, `.mvn/`, `.run/` | PolyForm; the Maven wrapper is Apache-2.0 third-party code, see below |
| `analytics/` | PolyForm |
| `app/` | PolyForm |
| `behaviour-tests/` | PolyForm |
| `cdk-application/`, `cdk-backup/`, `cdk-cost/`, `cdk-environment/`, `cdk-typescript/` | PolyForm |
| `docs/` | PolyForm |
| `fixtures/` | PolyForm; the Companies House XML Gateway schemas under `fixtures/companies-house-xmlgw/` are Crown copyright, see below |
| `infra/` | PolyForm |
| `prompts/` | PolyForm |
| `scripts/` | PolyForm |
| `videos/` | PolyForm |
| `web/` | PolyForm; the third-party items below cover specific files inside it |
| the root files | PolyForm |

### Files that carry no comment

An `.xlsx`, `.docx`, `.pdf`, `.png` or `.json` file cannot carry an SPDX header. Each takes
the licence its directory takes in the table above.

## Third-party material

- **qrcode** (`web/public/lib/qrcode.min.js`), MIT. The vendored copy carries no header
  comment. A runtime dependency of the `qrcode` package named in `package.json`.
- **Google "G" logo** (`web/public/images/g-logo.png`), used on `web/public/auth/login.html`
  under Google's brand guidelines for a sign-in button. Not licensed onward.
- **PolicyBee logo** (`web/public/images/policybee-logo.png`), used under the partner
  arrangement described on `web/public/policybee.html`. Not licensed onward.
- **Lighthouse, Playwright and OWASP ZAP reports** under `web/public/tests/`, generated
  third-party tool output kept for the public test history page.
- **Companies House XML Gateway schemas** (`fixtures/companies-house-xmlgw/`), Crown
  copyright, used under the
  [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- **HMRC form field standards** (`web/public/docs/hmrc-form-field-standards/`), Crown
  copyright, used under the Open Government Licence v3.0.
- **Apache Maven Wrapper** (`mvnw`, `mvnw.cmd`, `.mvn/wrapper/maven-wrapper.properties`),
  Apache License 2.0, copyright the Apache Software Foundation.

## SPDX identifiers

`LicenseRef-PolyForm-Internal-Use-1.0.0` for this repository's own work. PolyForm Internal
Use is not on the SPDX list, and the additional grant makes the text bespoke, so the
`LicenseRef` form points at `LICENSE` as the text it names. `package.json` reads
`SEE LICENSE IN LICENSE`.
