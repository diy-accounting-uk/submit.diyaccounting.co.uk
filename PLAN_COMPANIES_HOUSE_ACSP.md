<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: ACSP registration for filing on behalf of others

Registering DIY Accounting Limited as an ACSP so Submit can keep filing customers' confirmation
statements and PSC verification statements under our own presenter once Companies House requires
it. `PLAN_COMPANIES_HOUSE.md` covers filing itself: the operator's own filings, and since
2026-09-26 customers' too, both lawful under our presenter before that requirement lands, plus the
near-term alternative of filing under a customer's own presenter (CS-P1). BACKLOG row 82.

**Starts 2027-04**, to be ready for the earliest possible requirement date (November 2027). Watch
Companies House's six-month notice — the date has slipped once already, from spring 2026, and may
slip again.

## User assertions

> Companies House filing opens to customers now, under our presenter, as each filing is ready.
> ACSP registration for filing on behalf of others starts no sooner than November 2027, at least
> six months' notice. (operator, 2026-09-26)

> A customer filing under their own presenter account is outside ACSP, and suits a paid MCP
> integration Submit could offer, since Companies House offers no such direct tool.
> (operator, 2026-09-26)

## The rule

Companies House's rule for software providers ([blog, 2024-09-13](https://companieshouse.blog.gov.uk/2024/09/13/authorised-corporate-service-providers-what-you-need-to-know/)):

- A software provider needs ACSP registration when it delivers filings to Companies House through
  its software on behalf of its clients and is responsible for paying and engaging directly with
  Companies House.
- It does not when its clients use the software with their own Companies House accounts.
- A company's own officers and employees filing for that company need no ACSP.

Submit presenting a customer's statement under our presenter and paying the fee from our credit
account is the first case. Customers filing under their own presenter accounts is the second.

## Dates

- The ACSP register opened on 18 March 2025
  ([blog, 2025-03-13](https://companieshouse.blog.gov.uk/2025/03/13/third-party-providers-get-ready-to-register-as-an-authorised-corporate-service-provider)).
  That post expected registration to become mandatory for filing on behalf of others from spring
  2026.
- Companies House has since said presenter filing restrictions come no sooner than November 2027,
  with at least six months' notice. From then a presenter must be identity verified or an ACSP.
  What counts as a presenter ("materially controlling the content and submission of the filing")
  is not yet settled, including for software providers filing for accountants
  ([Kudocs, 2026-08-12](https://www.kudocs.co.uk/presenter-verification-and-acsp-registration-companies-house-confirms-no-sooner-than-november-2027/)).

## What registration involves

- **AML supervision.** An ACSP must be supervised by one of the 25 UK anti-money laundering
  supervisory bodies and give its membership number
  ([blog, 2024-09-13](https://companieshouse.blog.gov.uk/2024/09/13/authorised-corporate-service-providers-what-you-need-to-know/)).
  DIY Accounting Limited belongs to no professional body, so HMRC would be the supervisor, as a
  trust or company service provider: £300 application fee, £400 per premises each year, £500 per
  person for the fit and proper test
  ([GOV.UK, registration fees](https://www.gov.uk/guidance/money-laundering-regulations-registration-fees);
  [GOV.UK, TCSP check](https://www.gov.uk/guidance/check-if-you-need-to-register-for-money-laundering-supervision-if-youre-a-trust-or-company-service-provider)).
- **Identity verification.** A director completes the registration and verifies through GOV.UK
  One Login. The ACSP gets a Companies House account and an ACSP number; staff added to it are not
  identity verified themselves.
- **Fee.** £55 to register
  ([blog, 2025-03-13](https://companieshouse.blog.gov.uk/2025/03/13/third-party-providers-get-ready-to-register-as-an-authorised-corporate-service-provider)).
- **Ongoing.** Companies House can suspend or remove an ACSP that loses AML supervision.
- **The filing path itself does not change.** Customer filing under our presenter is already live
  under `PLAN_COMPANIES_HOUSE.md`; registration keeps it lawful. Software authorisation carries
  over, the same forms and the same live package reference.

## Filing under a customer's own presenter

Each customer files under their own Companies House presenter account instead of ours. That keeps
Submit outside the ACSP rule at any date. `PLAN_COMPANIES_HOUSE.md`'s CS-P1 carries the design and
the build.

## Open questions

| Id | Question |
|---|---|
| A2 | Does the XML Gateway take a fee from anything other than the presenter's credit account? |
| A3 | Once Companies House settles who a "presenter" is, does software filing under the customer's own presenter still fall outside it? Ask the XML team when this plan becomes active |

## Sources

- [Authorised Corporate Service Providers: what you need to know (Companies House blog, 2024-09-13)](https://companieshouse.blog.gov.uk/2024/09/13/authorised-corporate-service-providers-what-you-need-to-know/)
- [Third-party providers: get ready to register as an ACSP (Companies House blog, 2025-03-13)](https://companieshouse.blog.gov.uk/2025/03/13/third-party-providers-get-ready-to-register-as-an-authorised-corporate-service-provider)
- [Presenter verification and ACSP registration: no sooner than November 2027 (Kudocs, 2026-08-12)](https://www.kudocs.co.uk/presenter-verification-and-acsp-registration-companies-house-confirms-no-sooner-than-november-2027/)
- [Apply to file with Companies House using software (GOV.UK)](https://www.gov.uk/guidance/apply-to-file-with-companies-house-using-software)
- [Money laundering regulations registration fees (GOV.UK)](https://www.gov.uk/guidance/money-laundering-regulations-registration-fees)
- [Check if you need to register for money laundering supervision as a TCSP (GOV.UK)](https://www.gov.uk/guidance/check-if-you-need-to-register-for-money-laundering-supervision-if-youre-a-trust-or-company-service-provider)
