# Operator batch brief — for Claude Cowork

This is the operator half of the board in `NEXT.md` (Block 2). Each item is browser or
account work a GitHub workflow cannot do. Claude Cowork drives the browser; the operator
approves anything that changes money, credentials or a registration. Claude Code has the
matching code items running in parallel (Block 1) and picks up each hand-back as Block 3.

**Hand-back channel.** For each item, paste the result into the Claude Code session working
this repo, or append a block to `INBOX.md` at the workspace root:

```
## [unread] <ISO-8601 UTC> — from: cowork
O2 done: STRIPE_TEST_PRICE_ID_RESIDENT_ITSA=price_..., STRIPE_PRICE_ID_RESIDENT_ITSA=price_...
```

**Cowork constraints.** The Cowork VM cannot run the AWS or Stripe CLIs against this
account's SSO, so everything below is a browser task. Never paste a secret key into a file in
this repo; price ids, measurement ids and registration numbers are fine.

**Order.** O1, O2, O3 and O6/O7 are independent and can start now. O5's second half waits for
the Track F pull request (`claude/itsa-test-user`) to merge. O9 is date-gated. Merging Block 1
PRs as they open is the single biggest unblocker and sits with the operator throughout.

---

## O1a / G2b — grant the GA4 service account admin, once

**Why.** Creating the ci GA4 property, its BigQuery export and every future grant will be
done by scripts running as the Google service account the analytics jobs already use. That
account needs admin rights first, and that first grant is the only step a person has to click.

**Where.** https://analytics.google.com (Admin, Account access management) and
https://console.cloud.google.com/iam-admin/iam?project=diyaccounting-ga4

**Steps.**
1. Find the service account's email: in AWS Secrets Manager (profile submit-prod) the secret
   named by `GA4_SERVICE_ACCOUNT_ARN` holds a JSON key whose `client_email` is the address
   (Claude Code can read it out for you without printing the key).
2. GA4 Admin, Account access management: add that email with the Administrator role on the
   DIY Accounting GA4 account (account level, not one property).
3. GCP IAM on project `diyaccounting-ga4`: grant the same email Owner, or IAM Admin plus
   BigQuery Admin.

**Hand back.** "granted" with the two roles given. Claude Code then builds the role file and
CI apply (O1b), the property-sync skill (O1c) and creates the ci property (O1d).

---

## O2 / B12c — Stripe prices for `resident-itsa` (now a skill run)

No dashboard work. Claude Code runs the `stripe-catalogue-sync` skill from the catalogue; you
give a "go" for test mode and a second "go" for live mode, and confirm the day pass numbers
(3 tokens, 100 concurrent) or supply new ones.

---

## O3 / B27c.2 — ICO registration (expired: renew)

**Why.** Registration ZB070902 (certificate PDF in the repo root) expired on 23 May 2026 and
`privacy.html` still publishes it as current. `_developers/ICO_CHECKLIST.md` marks this as
the open gap. Renewal needs a payment, so the operator approves the final step.

**Where.** https://ico.org.uk/ESDWebPages/Search (register of fee payers);
https://ico.org.uk/for-organisations/data-protection-fee/ to pay or renew.

**Steps.**
1. Search the register for `DIY Accounting Limited` and separately for company number
   `06846849`, to confirm ZB070902 is no longer listed as current.
2. Renew or re-register at the fee page (tier 1 for a company this size; the page shows the
   current amount, with a small direct-debit discount). Operator approval needed before payment.

**Hand back.** Registration number, tier, expiry date; or "registered today, number …".

**Claude Code then** records it in `_developers/ICO_CHECKLIST.md` (Block 3, B27c.2 remainder).

---

## O4 / B11a.2 — ITSA recognition questionnaire from HMRC SDST

**Why.** HMRC's software recognition for ITSA uses questionnaires like the VAT ones in
`_developers/hmrc/hmrc_questionnaire_*`. Track E maps the published minimum standards; the
questionnaire itself decides what evidence to prepare.

**Where.** https://developer.service.hmrc.gov.uk/api-documentation/docs/using-the-hub
(recognition process pages); Gmail for the SDST thread.

**Steps.**
1. On the developer hub, look for "Making Tax Digital for Income Tax: software recognition"
   or "production credentials checklist" for ITSA. If a downloadable questionnaire exists,
   save it to `_developers/hmrc/` with the same naming as the VAT ones
   (`hmrc_questionnaire_<n>_<topic>_diy_accounting_limited_v1`).
2. If not, email `SDSTeam@hmrc.gov.uk` from antony@diyaccounting.co.uk, referencing the
   existing VAT production credentials for "DIY Accounting Submit" and asking for the ITSA
   recognition questionnaire and the current minimum functionality standards document.
   Suggested subject: "ITSA software recognition questionnaire — DIY Accounting Submit".
3. In the same email ask whether a production-credential window for new ITSA
   quarterly-update products opens for 2027-28. HMRC's pages say the 2026-27 window is
   closed to new products (see `_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`);
   the vendor team address is makingtaxdigital-softwarevendors@hmrc.gov.uk.
4. When the reply arrives, save attachments under `_developers/hmrc/`.

**Hand back.** The file names dropped into `_developers/hmrc/`, or "emailed SDST on <date>",
and HMRC's answer on the 2027-28 window.

---

## O5 / B10a.2 — Subscribe the sandbox app to the ITSA APIs and mint an ITSA test user

**Why.** Nothing in the ITSA plan is real until one sandbox call returns. That call (B10a.3)
needs the sandbox application subscribed to the ITSA APIs and a test user with a NINO.

**Where.** https://developer.service.hmrc.gov.uk/developer/applications (sign in as the
account that owns the sandbox application with client id `uqMHA6RsDGGa7h8EG2VqfqAmv4tV`);
https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/actions/workflows/create-hmrc-test-user.yml

**Steps, part 1 (ready now).**
1. Open the sandbox application → API subscriptions.
2. Subscribe to `Business Details (MTD)` (latest version) and `Self Employment Business (MTD)`
   (latest version). Also subscribe to `Obligations (MTD)` if it is listed; it is on the phase
   1 endpoint list. Sandbox subscriptions need no approval.
3. Note which versions were subscribed.

**Steps, part 2 (after the `claude/itsa-test-user` PR merges).**
4. Actions → `create-hmrc-test-user` → Run workflow. Set `service-names` to
   `mtd-vat,mtd-income-tax`. Run on `main`.
5. When it completes, download the credentials artifact and read the job summary. It should
   show a VRN and a NINO.
6. Store the artifact somewhere private (not in the repo). It holds a sandbox user id and
   password.

**Hand back.** API versions subscribed; then, after part 2, "test user created, artifact saved
to <private location>" plus the NINO (sandbox test data, safe to paste).

**Claude Code then** runs B10a.3, the read-only spike call, and writes
`_developers/hmrc/ITSA_SPIKE.md`.

---

## B34.2 — Apply for Companies House software-filing accreditation

**Why.** Decided 2026-09-04: the read-only lookup is a Claude Code item; accounts filing needs
Companies House software-filing accreditation, which is an operator application with weeks
of lead time.

**Where.** https://www.gov.uk/guidance/company-accounts-software-filing and
`plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` for what the form asks.

**Hand back.** The application date and reference; Claude Code starts the filing build when
accreditation lands.

---

## O9 / B47 — Watch the revived schedules fire on their own

**Why.** The `codeql`, `compliance` and `stack-drift` workflows were revived by hand on
2026-08-31. One unaided run each closes the item.

**Where.** https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/actions

**Steps.**
1. On or after 2026-09-06: open the `codeql` workflow and confirm a run started by
   `schedule` on that date.
2. On or after 2026-09-07 06:00 UTC: same for `compliance` and `stack-drift`.
3. If a workflow did not fire: open it, click Run workflow on `main` (that re-arms the
   schedule, as on 2026-08-31), and tell Claude Code which one missed.

**Hand back.** "all three fired on schedule" or which one missed and was re-run.

---

## O10 / B17a — Demo videos

Operator-owned end to end (Claude Code excluded by directive 2026-08-26). Channel:
https://www.youtube.com/@DIYAccountingSubmit. Plan: `PLAN_DEMO_VIDEOS.md`. Capture the main
site, not the simulator. Cowork can prepare the shot list from the plan and draft titles and
descriptions; recording and publishing are the operator's.

---

## Throughout — merge Block 1 pull requests

Track branches: `claude/funnel`, `claude/vat-reads`, `claude/catalogue-hygiene`,
`claude/accessibility`, `claude/docs-profiles`, `claude/itsa-test-user`, `claude/alarm-audit`.
Each PR carries the test commands run and their counts. Merge when CI is green; the
`deploy.yml` run on `main` reconciles prod. After each merge check `destroy-prod.yml` is
named the previous prod app stack set, or it keeps costing $46.88/month.
