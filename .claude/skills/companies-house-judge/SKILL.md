---
name: companies-house-judge
description: Judge a Companies House review folder as the XML Gateway team would, as an LLM, and triage what it finds into NEXT.md rows. Prepares the folder (our data in source/, the other company's example in reference/), reconciles our input against our output, renders one index.html per review, reads every screenshot and file, writes judge.json with a verdict and reasoning per case, re-renders, and boards a fix row per cause. Invoke after every run of companies-house-review, before any accounts submission or retest email goes to Companies House, or when the operator says "judge the review", "LLM as judge", or "is this ready for Companies House".
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# companies-house-judge

`companies-house-review` builds the evidence: each filed case rebuilt, rendered, compared with a
Companies House example, and run through their test validator. It checks what a script can check.
This skill is the person at the XML team who then reads the result: does this look like accounts a
real company could file, do our figures say what we meant, and would anything make a reviewer stop.

The 2026-10-25 review is the worked example (`target/companies-house-review/2026-10-25/`,
`judge.json`, `index.html`). Every script check passed there; the judge failed all four cases,
because the test data described accounts no real company could file (a PLC claiming the small
companies regime, share capital against the register, no s396(A1) statement, a dormant year that
had not ended). Judge the substance, not only the form.

## What the operator needs from it

- One page per review (`index.html`) that answers, per case: what we checked, why, what we found,
  and the data behind it, with the images and text inline and every file linked.
- Our input set beside our output, figure by figure, so the operator can say where every number
  came from. Our source data and the Companies House example are never mixed: the example is a
  different company, kept in `reference/` and labelled for layout only.
- The raw data in the folder, not a pointer to it, and only the files that carry data used in the
  accounts (no exchange dumps).
- A verdict per case that the operator can defend to Companies House, and a NEXT.md row per fix.

## Sources the judge reads

| What | Where |
|---|---|
| The evidence folder | `target/companies-house-review/<date>/` (`findings.md`, `walkthrough.md`, `<case>/filed.xhtml`, `rendered.png`, `visible-text.txt`, `facts.json`, `validator.txt`, `fact-comparison.md`) |
| Our test cases (the figures we file) | `scripts/fixtures/companies-house-test-service-cases.json`; read by `app/test-helpers/accountsDocumentCases.js` |
| The builders | `app/services/accountsIxbrlCommon.js`, the micro-entity and small company builders (`grep -l 'buildMicroEntityAccounts\|buildSmallCompanyAccounts' app/services/*.js`), `app/lib/ixbrlStructure.js` |
| The review script and its criteria | `scripts/companies-house-review.mjs`; criteria table in `.claude/skills/companies-house-review/SKILL.md` |
| The test-service harness and its runs | `scripts/companies-house-test-service-run.js`, `.github/workflows/companies-house-test-service.yml`; each case's fixture note names its filing run and its poll run |
| The test register (company, officers, statement of capital) | a `company-data-request` answer, e.g. `../staging/xmlgw-where-to-test/1-test-service-test-presenter-response.xml` for 03176906 |
| What the XML team asked for | their emails (commands in the review skill), the record `../private.diyaccounting.co.uk/companies-house/correspondence/TRIAGE_XMLGW_ACCOUNTS_2026-10-24.md` |
| The rules | the accounts TIS and the other sources in the review skill's Sources table; Companies Act 2006 (s384, s396, s414, s444, s475 to s481, s763) at https://www.legislation.gov.uk/ukpga/2006/46 |
| The examples | `target/companies-house-review/adp/Accounts_Bulk_Data-<date>.zip` (the Accounts Data Product) |
| The retest email | `../private.diyaccounting.co.uk/companies-house/correspondence/DRAFT_EMAIL_XMLGW_ACCOUNTS_RESUBMISSION.md` |

## Run

Steps 1 to 7 are Claude Code's. Run every command from this repository's root.

1. **Prepare.** Move our data into `source/` and the example into `reference/`, from the run
   artifacts and the bulk zip (needs `gh`):
   ```bash
   python3 -I .claude/skills/companies-house-judge/prepare_sources.py target/companies-house-review/<date>
   ```
   Each case's `source/` then holds `case-input.json`, `submit-request.xml` (its Document Data is
   `filed.xhtml`), `submit-response.xml` and `last-poll-response.xml`; `reference/` holds the raw
   `Prod…html`, `example.png` and `example-source.txt`. The script says when the filed document
   differs from the rebuilt `filed.xhtml` (a builder changed after the filing): judge the filed one.
2. **Build.** Reconcile and render:
   ```bash
   python3 -I .claude/skills/companies-house-judge/build_review.py target/companies-house-review/<date>
   ```
   It writes `<case>/reconciliation.md` (every input field against its tagged value and visible
   text; every total recomputed), the Proven / Not proven / Source lines and step 0 in
   `walkthrough.md`, and `index.html`. It is idempotent: run it again after step 5.
3. **Read everything.** For each case: `reconciliation.md` (any mismatch is a builder bug),
   `findings.md`'s rows, `visible-text.txt`, `validator.txt`, `fact-comparison.md`, the gateway files
   in `source/`, and the two screenshots with the Read tool (`rendered.png`, `reference/example.png`).
4. **Judge.** Ask of each case, and write down the evidence for each answer:
   - Do the figures say what we meant? (the reconciliation; the totals; profit for the year equals
     the movement on the profit and loss reserve; the fixed asset note equals the balance sheet).
   - Could a real company file this? The company's category allows the regime claimed (a public
     company is outside the small companies regime, s384(1)(a), and cannot claim s477, s478(a));
     share capital equals the register's statement of capital; the period has ended and the approval
     date is past; the figures are plausible for the company.
   - Does it carry what the law and the examples carry? The s396(A1) company information (legal
     form, registered in which part of the UK, number, registered office); the audit exemption,
     s476, responsibility and regime statements for the type; s444(5A) for filleted; the
     never-traded sentence for a dormant company; the approval line with a named director.
   - Would a reviewer object to anything? Text in the header or footer, a fact only in `ix:hidden`
     that the reader never sees, an ISO date, a label without a figure, anything after the notes.
   - Does it look like the example? Layout, order, statements; the example's figures are never ours.
   - What did the gateway say? `submit-response.xml` taken for processing, and the last poll:
     ACCEPT, REJECT (with its reasons) or PENDING. PENDING at every poll is POLL_TIMEOUT: not proof
     of acceptance.
5. **Write `judge.json`** at the review folder's root, one object per case:
   ```json
   {"1-micro": {
     "verdict": "pass | fail | question",
     "summary": "one sentence the operator can repeat to Companies House",
     "rows": {"<findings.md criterion, its first 30 characters suffice>": "the judge's note on that row"},
     "added": [{"check": "", "why": "the rule or request, with its section or email", "result": "pass | fail | question", "found": "", "data": "file in the case folder, or a ../ path"}],
     "reasoning": ["paragraphs: evidence first, then the conclusion, then the fix"]}}
   ```
   Then run step 2 again; the page shows the verdict, the added checks and the reasoning.
6. **Triage.** For each cause (not each symptom), write one NEXT.md row in the board's row shape
   (`- [ ] **<label>. <title>.** … **Source** … **Owner** … **Model** … **Size** …`): the finding,
   its basis, the files that change (fixture, builder, review script), the proof (reconciliation,
   validator, a new review, new test submissions), and what it unblocks. A cause in the test data
   or the builders blocks any email to the XML team that cites the judged submissions: rewrite that
   row's blocker to the fix row. A check the judge had to add by hand also goes to a row for
   `scripts/companies-house-review.mjs`, so the script checks it next time.
7. **Report** to the operator: the page path with the open command in a `!` block, the verdict per
   case in one table, the rows written, and what is not proven.

## Rules

- `source/` is our data only. The example is a different company; never put it in `source/` and
  never call it source data.
- The raw files sit in the folder; a pointer like "zip X entry Y" is not evidence.
- A pass needs evidence in the folder that a person can open. "Looks fine" is not a reason.
- The judge does not edit the builders or the fixture. It writes rows; a sub-agent does the fix.
- `target/` is gitignored: the evidence is never committed. The rows and this skill are.
