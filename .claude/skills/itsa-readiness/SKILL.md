---
name: itsa-readiness
description: Say whether DIY Accounting Submit is ready to send HMRC the Income Tax (MTD) recognition email, with the evidence for each answer. Invoke when the operator asks "are we ready for ITSA", "can I send the recognition email", "check O11", "what evidence is there for HMRC", or names a send day.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# itsa-readiness

Answer one question: can the recognition email (`_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md`)
go to `SDSTeam@hmrc.gov.uk` now, or on the day the operator names? Check every item below against
the files and the code on `origin/main`. Report what you checked, not what a file claims.

## The checks

1. **Every minimum standard is evidenced.** Read `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`,
   section "The standards" (13 rows). For each row:
   - "Proof in the repository" names a handler, page and test. Confirm each file exists
     (`[ -e <path> ]`) and each test passes: `npx vitest run <unit test>` or
     `npx playwright test --project=browser-tests <browser test>`.
   - A row that says "Not evidenced" is a blocker. Name the NEXT.md row that carries it
     (for example ITSA8, ITSA13), or add one.
   - Row 11 (obligations) is a known sandbox limit: HMRC's sandbox answers
     `NO_OBLIGATIONS_FOUND` for a business made through the test-support API. It is not a
     blocker when the email says so. Check that the draft email says so.
2. **The sandbox year ran inside HMRC's 14-day log window.** HMRC reads the last 14 days of
   sandbox activity. Read the run record at the end of `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`
   and the "Testing in the last two weeks" row of
   `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md`. The last run date
   plus 14 days is the latest send day. If the send day is later, re-run the year first
   (NEXT.md row B11.T10; the command is in `ITSA_PHASE_2_SANDBOX.md`, section "The command"),
   for 2023-24, 2025-26 and 2026-27, and update that row with the dates and commit.
3. **The fraud prevention headers validate.** The run record must end with a clean response from
   HMRC's fraud prevention header validation. A warning or an error is a blocker.
4. **Accessibility is evidenced for the ITSA pages.** `scripts/axe-quickscan.mjs`'s page list must
   carry the pages under `web/public/hmrc/itsa/`, and `REPORT_ACCESSIBILITY_PENETRATION.md` must
   name them with a clean result.
5. **The email matches the evidence.** Read the draft email. Every claim in it must match a
   checklist row. The sandbox application id must match the checklist's
   (`uqMHA6RsDGGa7h8EG2VqfqAmv4tV`). It must ask about the 2027-28 production window, because
   `_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md` records the 2026-27 closure notice.
6. **Nothing open on the board blocks it.** `grep -n 'ITSA\|B11\|O11' NEXT.md`. Any open row that
   is not the send itself is listed.

## The answer

Open with one line: ready, ready on <date> after <action>, or not ready and why.

Then a table, one row per check: check, state (met / blocker / action before send), evidence (a
file and line, a test and its result, or a run date), and the NEXT.md row for any blocker.

Then two short lists:

- **You can verify:** the files and lines the operator can open, and the page
  `https://submit.diyaccounting.co.uk/hmrc/itsa/dashboard.html` for the journey.
- **I will do:** each blocker's fix and the sandbox re-run, with the latest day it must happen.

When the operator names a send day, write it into NEXT.md rows O11 and B11.T10 in the same turn.
