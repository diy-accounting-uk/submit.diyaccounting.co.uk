# Operator tasks — brief for Claude Desktop (Cowork)

Seven tasks a workflow cannot do, each with the pages to open, the steps, and what to hand
back. Claude Cowork drives the browser; the operator approves anything that spends money,
grants access or submits a form to a third party. Every hand-back goes to the Claude Code
session working `submit.diyaccounting.co.uk` (paste it there, or append a block to `INBOX.md`
at the workspace root):

```
## [unread] <ISO-8601 UTC> — from: cowork
O5b done: NINO QQ123456C, artifact saved to <private location>
```

Cowork's VM cannot run the AWS or HMRC CLIs against this account's SSO, so everything below is
a browser task. Never paste a secret key or a password into a repo file; ids, NINOs of sandbox
test users, reference numbers and dates are fine.

Order: O1a, O3, O4a, O4b, O5a and B34.2 are independent and can start now. O5b follows O5a.

---

## O1a — grant the GA4 service account admin, once

**Why.** The analytics jobs already run as a Google service account. Once it holds admin
rights, Claude Code creates the ci GA4 property, its BigQuery export and every future grant
from code (NEXT.md O1b–O1d). This is the last grant a person clicks.

**The account.** `ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com` (GCP project
`diyaccounting-ga4`).

**Where.** https://analytics.google.com → Admin → Account access management (for the account
that holds the production property `G-T81V5NL5MB`); and
https://console.cloud.google.com/iam-admin/iam?project=diyaccounting-ga4

**Steps.**
1. GA4 Admin → Account access management → Add users: the email above, role Administrator,
   at the account level (not a single property).
2. GCP IAM for `diyaccounting-ga4` → Grant access: the same email, role Owner. If you prefer
   narrower: Project IAM Admin plus BigQuery Admin.

**Hand back.** "O1a granted: GA4 Administrator on account <name>; GCP <Owner or the two roles>".

---

## O3 — renew the ICO registration

**Why.** Registration ZB070902 (certificate PDF in the repo root) expired on 23 May 2026;
`privacy.html` still shows the number. `_developers/ICO_CHECKLIST.md` carries this as the open
gap.

**Where.** https://ico.org.uk/ESDWebPages/Search (register) and
https://ico.org.uk/for-organisations/data-protection-fee/ (pay or renew).

**Steps.**
1. Search the register for `DIY Accounting Limited` and for company number `06846849`; confirm
   ZB070902 is no longer listed as current.
2. Renew or re-register: tier 1 for a company this size; the page shows the current fee and a
   small direct-debit discount. Operator approval before payment.
3. Note the registration number (it may stay ZB070902), the tier and the new expiry date.

**Hand back.** "O3: number <…>, tier <…>, expires <date>". Claude Code updates the checklist
and `privacy.html`.

---

## O4a — obtain the ITSA recognition questionnaire from HMRC SDST

**Why.** HMRC's software recognition for Income Tax Self Assessment uses questionnaires like the
VAT ones in `_developers/hmrc/hmrc_questionnaire_*`. Track E mapped the published minimum
standards (`_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`); the questionnaire says
what evidence to prepare.

**Where.** https://developer.service.hmrc.gov.uk/api-documentation/docs/using-the-hub (search
"Making Tax Digital for Income Tax" recognition or production credentials checklist); Gmail.

**Steps.**
1. If the hub offers a downloadable ITSA questionnaire or checklist, save it under
   `_developers/hmrc/` with the VAT files' naming
   (`hmrc_questionnaire_<n>_<topic>_diy_accounting_limited_v1.<ext>`).
2. If not, email `SDSTeam@hmrc.gov.uk` from antony@diyaccounting.co.uk, referencing the existing
   VAT production credentials for "DIY Accounting Submit", asking for the ITSA recognition
   questionnaire. Suggested subject: "ITSA software recognition questionnaire — DIY Accounting
   Submit".
3. Save any attachments from the reply under `_developers/hmrc/`.

**Hand back.** The file names saved, or "emailed SDST on <date>".

---

## O4b — ask HMRC whether a 2027-28 production window opens for new ITSA products

**Why.** HMRC's pages say production-credential access for new 2026-27 quarterly-update
products is closed (`_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`). Whether a
2027-28 window opens decides whether backlog rows 10 and 11 keep their April 2027 target.

**Where.** Gmail. Vendor team: `makingtaxdigital-softwarevendors@hmrc.gov.uk` (the same email
as O4a can carry this question; keep the answer as its own hand-back).

**Steps.**
1. Ask: will production credentials for new MTD ITSA quarterly-update software reopen for
   the 2027-28 tax year, and if so when and on what process.
2. Record the reply verbatim.

**Hand back.** HMRC's answer and date, or "asked on <date>, no reply yet".

---

## O5a — subscribe the sandbox application to the ITSA APIs

**Why.** The first read-only ITSA sandbox call (NEXT.md B10a.3) needs the sandbox app
subscribed to the Income Tax APIs.

**Where.** https://developer.service.hmrc.gov.uk/developer/applications, signed in as the
account that owns the sandbox application with client id `uqMHA6RsDGGa7h8EG2VqfqAmv4tV`
(product name "DIY Accounting Submit").

**Steps.**
1. Open the sandbox application → API subscriptions.
2. Subscribe to `Business Details (MTD)` and `Self Employment Business (MTD)` at their latest
   versions; also `Obligations (MTD)` if listed. Sandbox subscriptions need no approval.
3. Note the API versions subscribed.

**Hand back.** "O5a: subscribed Business Details vX, Self Employment Business vY (Obligations
vZ)".

---

## O5b — mint an ITSA sandbox test user

**Why.** B10a.3 logs in as a sandbox user that has both VAT and Income Tax services. The
`create-hmrc-test-user` workflow on main now honours the service choice and prints the NINO.

**Where.** https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/actions/workflows/create-hmrc-test-user.yml

**Steps.**
1. Run workflow on `main` with `service-names` = `mtd-vat,mtd-income-tax`.
2. When it completes, read the job summary (VRN and NINO) and download the credentials
   artifact.
3. Store the artifact somewhere private (not in the repo): it holds the sandbox user id and
   password.

**Hand back.** "O5b: test user created, NINO <…>, artifact saved to <private location>".

---

## B34.2 — apply for Companies House software-filing accreditation (accounts filing)

**Why.** Decided 2026-09-04: the read-only company lookup is a Claude Code item; filing
accounts through the Companies House API needs software-filing accreditation, an operator
application with weeks of lead time.

**Where.** https://www.gov.uk/guidance/company-accounts-software-filing (process and form);
`plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` for what the form asks and how the
filing half is planned.

**Steps.**
1. Read the accreditation requirements and note anything the product must demonstrate before
   applying (test submissions, a presenter id, contact details).
2. Submit the application for DIY Accounting Limited (06846849) as the software vendor of
   "DIY Accounting Submit". Operator approval before submitting.
3. Record the application date and any reference or presenter id issued.

**Hand back.** "B34.2: applied <date>, reference <…>"; Claude Code starts the filing build
(B34.3) when accreditation lands.
