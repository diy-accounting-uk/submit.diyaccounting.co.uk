<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Draft email: ITSA recognition (for the operator to send)

**From:** antony@diyaccounting.co.uk
**To:** SDSTeam@hmrc.gov.uk
**Subject:** Income Tax (MTD) production approval, both stages: DIY Accounting Submit

Before sending: re-run `scripts/itsa-sandbox-year.js` so the sandbox activity is inside HMRC's
14-day log window, and read `ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` for the rows still marked
"not evidenced".

---

Dear Software Developer Support Team,

We would like to apply for production approval of DIY Accounting Submit for Making Tax Digital
for Income Tax. We are applying for the whole end-to-end journey in one application, the in-year
stage and the end-of-year stage together.

DIY Accounting Submit already holds production credentials for VAT (MTD). The Income Tax journey
runs on the same application, sandbox application id `uqMHA6RsDGGa7h8EG2VqfqAmv4tV`, with the
same fraud prevention header library.

The journey covers two income types, self-employment and UK property, and both quarterly models:
dated period summaries up to 2024-25 and cumulative period summaries from 2025-26. A customer can:

- read their businesses and ITSA status,
- file and amend quarterly updates for each business,
- file the annual submission, trigger and adjust the business source adjustable summary, record
  losses and claims, and record tax liability adjustments,
- see HMRC's calculation with the in-year estimate labelled as such and the disclaimer shown
  first,
- submit the final declaration after confirming the declaration text.

We have built against all nine APIs in the minimum functionality standards: Business Details,
Obligations, Self Employment Business, Property Business, Business Source Adjustable Summary,
Self Assessment Individual Details, Individual Calculations, Individual Losses and Individuals
Tax Liability Adjustments. Our completed checklist answers each standard with the code that meets
it.

In the sandbox we have filed complete tax years for two income types, self-employment and UK
property, across both quarterly models: dated period summaries for 2023-24 and cumulative period
summaries for 2025-26 and 2026-27. Each run filed four quarterly updates for each business, the
annual submission, a triggered and adjusted business source adjustable summary, an intent-to-finalise
calculation and a final declaration that answered 204. For 2026-27, we filed loss claims for both
businesses and tax liability adjustments, each with the required `suspend-temporal-validations` header.
The fraud prevention header validator reports no errors on the same header set; its one warning is
`gov-client-multi-factor`, which we are closing by requiring multi-factor authentication for every
account.

Two things we would like your guidance on:

1. Your API documentation says HMRC is no longer accepting production credential requests for new
   2026-27 quarterly update products. We are applying for the 2027-28 window. Please tell us
   whether this application can be considered for that window and whether anything else is
   needed for it.
2. The sandbox obligations endpoint does not return obligations for a business created through
   the test-support API, so our sandbox run files quarterly updates from the published standard
   period dates. Please tell us if you need a run against one of the fixture businesses instead.

Attached: the production approvals checklist and our answers to the software developer checklist
and the WCAG 2.1 AA checklist for the Income Tax journey.

Kind regards,

Antony Cartwright
Director, DIY Accounting Limited
Company number 06846849
antony@diyaccounting.co.uk
