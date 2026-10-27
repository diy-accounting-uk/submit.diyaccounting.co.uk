---
name: companies-house-judge
description: Judge a Companies House review folder as the XML Gateway team would, as an LLM, and triage what it finds into NEXT.md rows. Reads the folder the review script wrote (our data in source/, the other company's example in reference/, the reconciliation of our input against our output, one index.html per review), reads every screenshot and file, writes judge.json with a verdict and reasoning per case, re-renders, and boards a fix row per cause. Invoke after every run of companies-house-review, before any accounts submission or retest email goes to Companies House, or when the operator says "judge the review", "LLM as judge", or "is this ready for Companies House".
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# companies-house-judge

`companies-house-review` builds the evidence: each filed case rebuilt, rendered, compared with a
Companies House example, and run through their test validator. It checks what a script can check.
This skill is the person at the XML team who then reads the result: does this look like accounts a
real company could file, do our figures say what we meant, and would anything make a reviewer stop.
The review script writes everything the judge reads, including `index.html`; the judge adds
`judge.json` and the script renders it.

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
| The test-service harness and its runs | `scripts/companies-house-test-service-run.js`, `.github/workflows/companies-house-test-service.yml`; the filing run of each case is passed to the review script with `--run <case>=<run id>` |
| The test register (company, officers, statement of capital) | a `company-data-request` answer, e.g. `../staging/xmlgw-where-to-test/1-test-service-test-presenter-response.xml` for 03176906 |
| What the XML team asked for | their emails (commands in the review skill), the record `../private.diyaccounting.co.uk/companies-house/correspondence/TRIAGE_XMLGW_ACCOUNTS_2026-10-24.md` |
| The rules | the accounts TIS and the other sources in the review skill's Sources table; Companies Act 2006 (s384, s396, s414, s444, s475 to s481, s763) at https://www.legislation.gov.uk/ukpga/2006/46 |
| The examples | `target/companies-house-review/adp/Accounts_Bulk_Data-<date>.zip` (the Accounts Data Product) |
| The retest email | `../private.diyaccounting.co.uk/companies-house/correspondence/DRAFT_EMAIL_XMLGW_ACCOUNTS_RESUBMISSION.md` |

## Run

Steps 1 to 6 are Claude Code's. Run every command from this repository's root.

1. **Review.** One run of the review script writes the folder the judge reads:
   ```bash
   node scripts/companies-house-review.mjs --adp-zip target/companies-house-review/adp/<zip> \
     --run micro-entity-accounts=<run id> --run micro-entity-accounts-dormant=<run id> \
     --run small-company-accounts-full=<run id> --run small-company-accounts-filleted=<run id>
   ```
   Each `--run` names the `companies-house-test-service` run that filed the case (needs `gh`; the
   fixture notes name older runs, so they are not read). `--runs-dir <dir>` reads
   `<dir>/<run id>/…/evidence-log.json` instead of downloading. Each case's `source/` holds
   `case-input.json`, `submit-request.xml` (its Document Data is `filed.xhtml`),
   `submit-response.xml` and `last-poll-response.xml`; `reference/` holds the raw `Prod…html`,
   `example.png` and `example-source.txt`. The submission number in `submission.txt` comes from the
   evidence log. The script says when the filed document differs from the rebuilt `filed.xhtml`
   (a builder changed after the filing): judge the filed one. A case with `"fictional": true` in
   the fixture is shown as a company not on any register; every other case links its register entry.
   It also writes `<case>/reconciliation.md` (every input field against its tagged value and
   visible text; every total recomputed), the Proven / Not proven / Source / Judge lines and step 0
   in `walkthrough.md`, and `index.html`. Run it again after step 4: it renders `judge.json`.
2. **Read everything.** For each case: `reconciliation.md` (any mismatch is a builder bug),
   `findings.md`'s rows, `visible-text.txt`, `validator.txt`, `fact-comparison.md`, the gateway files
   in `source/`, and the two screenshots with the Read tool (`rendered.png`, `reference/example.png`).
3. **Judge.** Ask of each case, and write down the evidence for each answer:
   - Do the figures say what we meant? (the reconciliation; the totals; profit for the year equals
     the movement on the profit and loss reserve; the fixed asset note equals the balance sheet).
   - Could a real company file this? The script checks the company's category (a public company is
     outside the small companies regime, s384(1)(a), and cannot claim s477, s478(a)), the s396(A1)
     statement, that the period has ended and the approval date is past, narrative facts only in
     `ix:hidden`, the never-traded sentence of a dormant company, placeholder text in names,
     officers and addresses, and one balance sheet date per company. The judge reads those rows and
     checks what the script does not: share capital against the register's statement of capital (a
     register read the script does not make yet), and whether the figures are plausible for the company.
   - Does it carry what the law and the examples carry? The audit exemption, s476, responsibility
     and regime statements for the type; s444(5A) for filleted; the approval line with a named director.
   - Would a reviewer object to anything? Text in the header or footer, an ISO date, a label
     without a figure, anything after the notes.
   - Does it look like the example? Layout, order, statements; the example's figures are never ours.
   - What did the gateway say? `submit-response.xml` taken for processing, and the last poll:
     ACCEPT, REJECT (with its reasons) or PENDING. PENDING at every poll is POLL_TIMEOUT: not proof
     of acceptance.
4. **Write `judge.json`** at the review folder's root, one object per case:
   ```json
   {"1-micro": {
     "verdict": "pass | fail | question",
     "summary": "one sentence the operator can repeat to Companies House",
     "rows": {"<findings.md criterion, its first 30 characters suffice>": "the judge's note on that row"},
     "added": [{"check": "", "why": "the rule or request, with its section or email", "result": "pass | fail | question", "found": "", "data": "file in the case folder, or ../ path; a path that starts with a case folder (3-small-full/visible-text.txt) is read from the review folder"}],
     "reasoning": ["paragraphs: evidence first, then the conclusion, then the fix"]}}
   ```
   Then run step 1 again with the same arguments (the validator runs again); the page shows the verdict, the added checks and the reasoning.
5. **Triage.** For each cause (not each symptom), write one NEXT.md row in the board's row shape
   (`- [ ] **<label>. <title>.** … **Source** … **Owner** … **Model** … **Size** …`): the finding,
   its basis, the files that change (fixture, builder, review script), the proof (reconciliation,
   validator, a new review, new test submissions), and what it unblocks. A cause in the test data
   or the builders blocks any email to the XML team that cites the judged submissions: rewrite that
   row's blocker to the fix row. A check the judge had to add by hand also goes to a row for
   `scripts/companies-house-review.mjs`, so the script checks it next time.
6. **Report** to the operator: the page path with the open command in a `!` block, the verdict per
   case in one table, the rows written, and what is not proven.

## The page

`index.html` is the deliverable the operator reads, and its shape is fixed: the 2026-10-25 review's
page is the reference (operator, 2026-10-26: "this output was much better"). `scripts/companies-house-review.mjs`
writes it (`scripts/lib/companiesHouseReviewPage.js`); a change to it keeps every part below, in
this order, and is checked against a fresh build of a finished folder.

1. A title with the review date, one line on what the four filings are, and a link per case.
2. Per case, a card: Proven (input fields and totals with the mismatch count, the validator, the
   gateway), Not proven (acceptance while PENDING; synthetic figures), Figures from (the fixture
   and its line), Company from (the test register file), Judge (verdict and summary).
3. "1. Our input against our output": one row per input field (input, the concept and context it
   is tagged as, the tagged value, shown as text, result), then one row per total (rule, tagged,
   recomputed, result).
4. "2. Companies House's rules and requests": per findings.md row, the check, why we check it
   (email, TIS or section of the Act), the result, what we found, links to the data, the judge's
   note; then "2b. Checks the judge added" in the same columns; the visible text and the validator
   output folded underneath.
5. "3. What the gateway answered": taken for processing (qualifier, errors, gateway time) and the
   last status, with links to the three source files.
6. "4. Our layout beside a published example": ours and the example side by side, the example
   named as a different company for layout only, and the link to fact-comparison.md.
7. "5. Judge's reasoning": the paragraphs from judge.json.

Colours carry meaning only: green for a match or pass, red for a mismatch or fail, amber for
pending or a question. The page works at 390 pixels wide with no sideways scroll, and in dark mode.

## Rules

- `source/` is our data only. The example is a different company; never put it in `source/` and
  never call it source data.
- The raw files sit in the folder; a pointer like "zip X entry Y" is not evidence.
- A pass needs evidence in the folder that a person can open. "Looks fine" is not a reason.
- The judge does not edit the builders or the fixture. It writes rows; a sub-agent does the fix.
- `target/` is gitignored: the evidence is never committed. The rows and this skill are.
