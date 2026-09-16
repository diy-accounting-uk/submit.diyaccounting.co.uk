<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Draft email: ITSA production credentials (for the operator to send)

**From:** antony@diyaccounting.co.uk
**To:** SDSTeam@hmrc.gov.uk
**Subject:** Production credentials request, Income Tax (MTD): DIY Accounting Submit

Send this after the recognition application is approved, or with it if SDST asks for both at
once. The VAT request this mirrors is `HMRC_PRODUCTION_CREDENTIALS_EMAIL.md`.

---

Dear Software Developer Support Team,

We are writing to request production credentials for the Income Tax (MTD) APIs for DIY
Accounting Submit, which already holds production credentials for VAT (MTD).

## Application details

| Field | Value |
|---|---|
| Product name | DIY Accounting Submit |
| Product URL | https://submit.diyaccounting.co.uk |
| Sandbox application id | `uqMHA6RsDGGa7h8EG2VqfqAmv4tV` |
| Connection method | `WEB_APP_VIA_SERVER` |
| Income types | Self-employment and UK property |

## Organisation details

| Field | Value |
|---|---|
| Company name | DIY Accounting Limited |
| Company number | 06846849 (England and Wales) |
| Registered office | 37 Sutherland Avenue, Leeds, LS8 1BY |
| Contact email | antony@diyaccounting.co.uk |
| Responsible individual | Antony Cartwright, Director |

## APIs we are requesting production access to

| API | What the product does with it |
|---|---|
| Business Details | Lists the customer's businesses and their ids |
| Obligations | Shows quarterly and final declaration obligations |
| Self Employment Business | Files and amends quarterly updates (dated and cumulative) and the annual submission |
| Property Business | The same for UK property |
| Business Source Adjustable Summary | Triggers, shows and adjusts the year-end summary |
| Self Assessment Individual Details | Reads the customer's ITSA status |
| Individual Calculations | Triggers and shows the calculation, with the in-year estimate labelled and the disclaimer first; submits the final declaration |
| Individual Losses | Records loss claims |
| Individuals Tax Liability Adjustments | Records tax liability adjustments |

## Testing completed

We have filed a complete self-employment tax year in the sandbox: four quarterly updates, the
annual submission, a triggered and adjusted business source adjustable summary, an
intent-to-finalise calculation and a final declaration (204). The fraud prevention header
validator reports no errors on that run; its one warning is `gov-client-multi-factor`, which we
are closing by requiring multi-factor authentication for every account.

Our production approvals checklist answers each of the minimum functionality standards with the
code that meets it, and is attached.

## Fraud prevention headers

The headers are the ones already evaluated for our VAT (MTD) production credentials, sent by the
same library on every Income Tax call. The connection method is `WEB_APP_VIA_SERVER`.

## Compliance and documents

| Item | Reference |
|---|---|
| ICO registration | ZB070902, https://ico.org.uk/ESDWebPages/Entry/ZB070902 |
| Privacy policy | https://submit.diyaccounting.co.uk/privacy.html |
| Terms of use | https://submit.diyaccounting.co.uk/terms.html |
| Accessibility statement | https://submit.diyaccounting.co.uk/accessibility.html |

We have accepted the HMRC terms of use and will complete any further questionnaires the approval
needs.

Kind regards,

Antony Cartwright
Director, DIY Accounting Limited
antony@diyaccounting.co.uk
