<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Companies House filing and data coverage, a catalogue

## User assertions (verbatim)

> create a separate PLAN_*.md with a list of all the companies house APIs and or XML gateways that
> we could reasonably cover (no tasks on the board for that one, it's an interesting one stop shop
> opening up scheduled filings)

No tasks. A catalogue of every Companies House channel a small-company product could cover, what
Submit covers today, and the deadlines a scheduler could compute from public data.

## The channels

| Channel | What it does | Auth | Fee | Sandbox | Source |
|---|---|---|---|---|---|
| Public Data API (REST) | Read the register: profile, officers, PSCs, filing history, charges, insolvency, registers, exemptions, search | API key, Basic; 600 requests per 5 minutes | none | none needed; the Sandbox Test Data Generator makes test companies | <https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference>; <https://developer-specs.company-information.service.gov.uk/guides/rateLimiting> |
| Streaming API | Push of register changes as they happen, resumable by `timepoint` | a separate streaming API key, Basic | none | none | <https://developer-specs.company-information.service.gov.uk/streaming-api/reference>; `…/streaming-api/guides/authentication` |
| Document API | Metadata and content of a filed document, by the id in a filing-history item's `links.document_metadata` | API key, Basic | none | none | <https://developer-specs.company-information.service.gov.uk/document-api/reference> |
| API Filing (Manipulate Company Data) | Change the register through a transaction: registered office, registered email, insolvency | OAuth 2.0 with the company's authentication code at sign-in; scopes per company and resource | none for these three | `api-sandbox` and `identity-sandbox` hosts | <https://developer-specs.company-information.service.gov.uk/manipulate-company-data-api-filing/guides/overview> |
| Sandbox Test Data Generator | Create and delete sandbox companies with an authentication code | API key | none | is the sandbox | <https://developer-specs.company-information.service.gov.uk/sandbox-test-data-generator-api/reference>; `scripts/companies-house-test-company.js` |
| XML Gateway, software filing (input) | GovTalk envelopes carrying statutory forms and accounts; synchronous acknowledgement, asynchronous accept or reject, polled | presenter id and code (MD5 in the header) plus the company authentication code in the form; a credit account for fee-bearing forms | per form, below; charged to the credit account, invoiced monthly | the test service (`GatewayTest` 1, test presenter) for the older schemas; a sandpit staging host for the 18 November 2025 schemas until the test service carries them | <https://xmlgw.companieshouse.gov.uk/SchemaStatus>; TIS 5.3 (<https://www.gov.uk/government/publications/technical-interface-specifications-for-companies-house-software>) |
| XML Gateway, company data (input-side reads) | `CompanyDataRequest`, `MembersRegisterDataRequest`, `PaymentPeriodsRequest`, `ChargeSearch`, `GetDocument`, `DocumentRequest`, `EReminders`: the register as the filer needs it, including full dates of birth, residential addresses, shareholdings and the registered email | presenter plus company authentication code | none | as above | TIS 5.3 §2.3, §2.6, §2.7 |
| XML Gateway, output products | The older paid data feed (company search, officers, filing history, document images), separate account and price list | its own account | per product, invoiced monthly | none | <https://xmlgw.companieshouse.gov.uk/> FAQ |
| WebFiling and paper | Everything else | company authentication code, or a signature | per form | none | <https://www.gov.uk/government/publications/companies-house-fees/companies-house-fees> |

The ECCTA "presenter measures" (a presenter must be identity-verified or an ACSP) are postponed to no earlier than November 2026; they will shape the presenter account behind every XML row below. Source: <https://xmlforum.companieshouse.gov.uk/t/implementation-timeline-for-presenter-measures-update/1907>.

## Recurring filings

Fees are the software column of the fees page updated 2 July 2026, in force since 1 February 2026.

| Filing | Form | Channel and schema (live date) | Auth | Fee | Submit today | One-stop fit |
|---|---|---|---|---|---|---|
| Annual accounts (micro-entity FRS 105, small FRS 102 1A, dormant, full, audited) as iXBRL | AA | XML Gateway `FormSubmission` with `Document` category `ACCOUNTS`, `FormIdentifier` `Accounts`; accounts TIS 5.9 | presenter, company code; presenter account needs no credit account | none | micro-entity on ci (`PLAN_COMPANIES_HOUSE_ACCOUNTS_FILING.md`, BACKLOG 34b); small-company, dormant and the paired CT600 designed in the same plan | Due 9 months after the period end for a private company; `accounts.next_accounts.due_on` on the profile |
| Confirmation statement, with the directors' verification statement | CS01, LLCS01 | XML Gateway `ConfirmationAndVerificationStatement-v1-0.xsd` (18/11/2025); `ConfirmationStatement-v1-3.xsd` (05/03/2024) still listed live | presenter, company code, credit account, each director's personal code | £50 with the first statement of a 12-month payment period; £110 paper | none; designed in `PLAN_COMPANIES_HOUSE_CONFIRMATION_STATEMENT.md` | Due 14 days after the review date; `confirmation_statement.next_due` and `next_made_up_to` on the profile; `PaymentPeriodsRequest` says whether the fee is due |
| PSC verification statement (a PSC's personal code) | VS01, LLVS01 | XML Gateway `PSCVerificationStatement-v1-0.xsd` (18/11/2025); also the PSC web service | presenter, company code, the PSC's personal code | none | none; CS-13 in the confirmation statement plan | 14 days from the day after the confirmation date for a director-PSC; the first 14 days of the birth month for other PSCs |
| Company tax return with the same accounts | CT600 | HMRC Transaction Engine, not Companies House | Government Gateway | none | designed in the accounts plan's CT600 section | Due 12 months after the period end; payment 9 months and a day |

## Event-driven filings

| Filing | Form | Channel and schema (live date) | Auth | Fee | Submit today | One-stop fit |
|---|---|---|---|---|---|---|
| Change registered office address | AD01, LLAD01 | API Filing `registered-office-address` resource; XML Gateway `ChangeRegisteredOfficeAddress-v2-7.xsd` (18/11/2025) | OAuth (API Filing) or presenter | none | on prod through API Filing (`web/public/companies-house/changeRegisteredOffice.html`) | On demand; the profile's `registered_office_address` shows the current value |
| Change registered email address | none | API Filing `registered-email-address` resource; XML `RegisteredEmailAddress` element on IN01 and CS01 | OAuth or presenter | none | on prod through API Filing (`changeRegisteredEmail.html`) | On demand; a CS01 can carry it |
| Appoint a director, secretary or LLP member, with verification details | AP01, AP02, AP03, AP04, LLAP01, LLAP02 | XML Gateway `OfficerAppointment-v2-9.xsd` (18/11/2025) | presenter, company code, the appointee's personal code and consent to act | none | none | Within 14 days of the appointment |
| Terminate an officer | TM01, TM02, LLTM01 | XML Gateway `OfficerResignation-v2-6.xsd` (31/01/2015) | presenter, company code | none | none | Within 14 days |
| Change an officer's details | CH01, CH02, CH03, CH04, LLCH01, LLCH02 | XML Gateway `OfficerChangeDetails-v2-10.xsd` (18/11/2025) | presenter, company code | none | none | Within 14 days |
| Notify a PSC, RLE or other registrable person | PSC01, PSC02, PSC03, LLPSC01 to 03 | XML Gateway `PSCNotification-v1-2.xsd` (18/11/2025) | presenter, company code, the PSC's verification details | none | none | Within 14 days of the register entry |
| Change PSC details | PSC04, PSC05, PSC06 | XML Gateway `PSCChangeDetails-v1-2.xsd` (18/11/2025) | presenter, company code | none | none | Within 14 days |
| PSC ceased | PSC07 | XML Gateway `PSCCessation-v1-2.xsd` (18/11/2025) | presenter, company code | none | none | Within 14 days |
| PSC additional matters, and their end | PSC08, PSC09 | XML Gateway `PSCStatementNotification-v1-2.xsd`, `PSCStatementWithdrawal-v1-2.xsd` (18/11/2025) | presenter, company code | none | none | Within 14 days |
| Change the accounting reference date | AA01, LLAA01 | XML Gateway `ChangeAccountingReferenceDate-v2-7.xsd` (01/01/2021) | presenter, company code | none | none | Before the current accounts are due; moves `accounts.next_accounts.due_on` |
| Change of name | NM01, LLNM01 | XML Gateway `ChangeOfName-v2-6.xsd` (31/01/2015); the certificate comes back through `GetDocument-v1-1.xsd` | presenter, company code, credit account | £20; same day £85; paper £30 | none | On demand |
| Return of allotment of shares | SH01 | XML Gateway `ReturnofAllotmentShares-v3-0.xsd` (30/06/2016) | presenter, company code | none | none | Within one month of the allotment; feeds the next CS01's statement of capital |
| Increase in nominal capital (companies still under the 1985 Act limits) | 123 | XML Gateway `IncreaseNominalCapital-v2-6.xsd` (31/01/2015) | presenter, company code | none | none | Rare for a company formed after 2009 |
| Register a charge, or its acquisition | MR01, MR02, LLMR01, LLMR02 | XML Gateway `ChargeRegistration-v2-9.xsd` (25/05/2018), deed as a base64 PDF; `ChargeSearch-v2-8.xsd` reads charges | presenter, lender authentication code, credit account | £14; paper £24 | none | Within 21 days of creation |
| Satisfy or release a charge | MR04, MR05, LLMR04, LLMR05 | XML Gateway `ChargeUpdate-v2-8.xsd` (31/01/2015) | presenter | none | none | On demand |
| Single alternative inspection location, and moving records | AD02, AD03, AD04 | XML Gateway `SailAddress-v2-6.xsd` (31/01/2015), `RecordChangeofLocation-v3-0.xsd` (18/11/2025) | presenter, company code | none | none | On demand |
| Incorporate a company or LLP, with corporation tax registration data | IN01, LLIN01 | XML Gateway `CompanyIncorporation-v3-8.xsd` (18/11/2025), `additionalInformation/HMRC-v1-0.xsd`; certificate through `GetDocument` | presenter, credit account, each officer's and PSC's verification details | £100; same day £156; paper £124 | none | Once; it sets every deadline above |
| Insolvency practitioner appointments and case filings | various | API Filing insolvency resource | OAuth; the user must be a registered insolvency practitioner | none | none | Outside a small-company product's users |
| eReminders: which email addresses Companies House reminds | none | XML Gateway `EReminders-v1-0.xsd` (14/07/2011): `GetERemindersRequest`, `SetERemindersRequest`, up to four addresses | presenter, company code | none | none | Companies House's own reminder for accounts and the confirmation statement |
| Voluntary strike off | DS01, LLDS01 | WebFiling or paper; no schema on the gateway and no API Filing resource | company code or signature | £13 online; £18 paper | none | On demand; the profile's `company_status` shows the outcome |
| Share buy-back, reduction of capital, re-registration, restoration | SH03, SH19, RR01, RT01 | WebFiling, the upload service or paper only | as above | £20 to £341 by form | none | Outside the gateway |

Retired on the gateway and out of scope: the annual return (`AnnualReturn-v3-0.xsd` deprecated 2018), the election to keep registers at Companies House (`RegisterElectOrWithdraw`, `MembersRegisterUpdate`, retired 18/11/2025).

## Reads a one-stop shop would use

| Read | Channel | Carries | Submit today |
|---|---|---|---|
| Company profile | Public Data API `GET /company/{n}` | name, status, type, jurisdiction, SIC codes, registered office, `accounts.next_accounts` (`due_on`, `period_end_on`, `overdue`), `accounting_reference_date`, `confirmation_statement` (`last_made_up_to`, `next_due`, `next_made_up_to`, `overdue`), `registered_office_is_in_dispute`, links | `companiesHouseCompanyGet.js` maps nine of these |
| Officers | `GET /company/{n}/officers`, `/appointments/{id}` | name, role, appointed and resigned dates, month-year date of birth, nationality, residence, address, `identity_verification_details` (`appointment_verification_statement_due_on`, `identity_verified_on`, `preferred_name`, ACSP name) | none |
| PSCs and statements | `GET /company/{n}/persons-with-significant-control`, `…-statements`, and the individual, corporate-entity, legal-person and super-secure items | name, kind, natures of control, notified and ceased dates, month-year date of birth | none |
| Filing history and documents | `GET /company/{n}/filing-history`, Document API | what was filed and when, the document itself (the last accounts, the last CS01) | none |
| Charges, insolvency, registers, exemptions, UK establishments | the matching endpoints | as named | none |
| Search | `GET /search/companies`, `/advanced-search/companies`, `/alphabetical-search/companies`, officer and disqualified-officer search | | `companiesHouseSearchGet.js` covers company search |
| Register data for a filing | XML Gateway `CompanyDataRequest` (CompanyData-v3-6, 18/11/2025) | everything the CS01 needs, including full dates of birth, residential addresses, statement of capital, shareholdings, registered email, `NextDueDate`, PSC exemption flags | none; the confirmation statement plan adds it |
| Members register, payment periods | `MembersRegisterDataRequest`, `PaymentPeriodsRequest` (both v1-0, 30/06/2016) | members with shares held; whether each payment period is paid | none |
| Register changes as they happen | Streaming API streams: `companies`, `filings`, `officers`, `persons-with-significant-control`, `persons-with-significant-control-statements`, `charges`, `insolvency-cases`, `disqualified-officers`, `company-exemptions` | one event per change with the new resource | none |
| Accounts image, certificates | `DocumentRequest-v1-1.xsd` (AccountsImage), `GetDocument-v1-1.xsd` | base64 PDF | none |

## Scheduled filings

Every recurring deadline is on the public profile, with no authentication code, so a reminder or a queue can be built from the company number alone:

| Deadline | Computed from | Filing it drives |
|---|---|---|
| Accounts due | `accounts.next_accounts.due_on`; the period from `period_start_on` and `period_end_on`; `overdue` | the accounts filing, with the period pre-filled |
| Confirmation statement due | `confirmation_statement.next_due`; the review date from `next_made_up_to`; `overdue` | the CS01, with the review date pre-filled; `PaymentPeriodsRequest` for the fee |
| Directors' verification statement due | `identity_verification_details.appointment_verification_statement_due_on` per officer | the CS01's verification block, and the message to an unverified director |
| Director-PSC's code due | the day after the confirmation date, 14 days | VS01 or the PSC service |
| Other PSC's code due | `date_of_birth.month`, the first 14 days | VS01 or the PSC service |
| Corporation tax return and payment | `period_end_on` plus 12 months; plus 9 months and a day | the CT600 (HMRC) |
| Charge registration | 21 days from creation; not on the register until filed | MR01 |
| Officer and PSC changes | 14 days from the event; not on the register until filed | AP01, TM01, CH01, PSC01 to 09 |

Three mechanisms turn a reminder into a queue:

1. **A filing prepared before its date.** The CS01's `ReviewDate` must not be in the future, so a statement confirmed today for a review date next month is held and sent on the date; the accounts can be sent as soon as the period closes and the figures are final. Submit's async requests table and the nightly jobs the dashboard plan runs (`PLAN_ONE_STOP_DASHBOARD.md`) are the machinery; the practice's client rows (`app/functions/practice/practiceClientsPost.js`) hold the company numbers to sweep.
2. **The register tells the queue the filing landed.** The Streaming API's `filings` stream, or a daily poll of `filing-history`, closes the item and computes the next deadline from the profile's new `next_due`.
3. **Companies House's own reminders stay on.** `SetERemindersRequest` keeps the customer's addresses registered so a missed queue item still gets Companies House's email.

The order to grow into, by deadline served: accounts (done for micro-entities), CS01 with the verification statement, VS01 for PSCs, then the 14-day event forms (AP01, TM01, CH01, PSC01 to 09) that keep the register consistent before each CS01, then SH01 and AA01, which change what the next CS01 and accounts carry. NM01, MR01 and IN01 are fee-bearing and rarer; they wait behind the credit account the CS01 needs anyway.
