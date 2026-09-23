<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. Every item ends with a tag line: **Source** (backlog row, GitHub issue, plan doc, or
none), **Owner** (`Operator` for steps a workflow cannot do, `Claude Code` for steps a sub-agent
runs), and for Claude Code steps the **Model** a sub-agent should use (Fable > Opus > Sonnet >
Haiku; the lowest tier that fits). Anything touching code goes through a `claude/*` branch and
PR; the operator merges.

**Prod runs deployment prod-d458f02** (PR #343's merge deploy; #344 and #345 changed no deployed code).
**ci**: `ci-set1` is last-known-good and the only ci set standing; `ci-set2` was swept.
No pull request is open in this repository or its siblings.

The board runs in five sections, in this order: **in flight** (a branch, a pull request or a run
in motion, each named in the row), **machine-only**, **machine-ask**, **human-driven**,
**blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `machine-ask` is work a session drives end to end with a human present to authenticate or
approve: a second factor, an SSO login, a command the session's policy denies, a send from the
operator's address, a write to Google or GitHub the operator says go to. `human-driven` is work a
human must navigate themselves: a coding assistant's practical limits, a physical restriction
beyond one authentication (a proctored exam, a signature in person), or policy (a payment mandate,
a filing against the operator's own company, a decision between named alternatives). A row whose
only human step is merging its PR is machine-only; that is the standing workflow, not an action
the row needs. Within a section, items run by the size of the change to committed files, least
first (operator, 2026-09-13); a row that changes nothing committed — a comment, a run, a scan, a
console action — comes before any code. Operator items are briefed in
`../NEXT_OPERATOR_RUNBOOK.md` at the workspace root, one file rewritten in place. Every item
names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or `none` for a human
step.

Shared facts for the analytics rows (B52d, B52e, B52l, B52m): the prod Athena database is
`prod_env_analytics` and the workgroup `prod-env-analytics` (eu-west-2, `AWS_PROFILE=submit-prod`);
`OperatorSnapshotPublish.java` passes them to the Lambda as `GLUE_DATABASE_NAME` and
`ATHENA_WORK_GROUP_NAME` (lines 103 to 104).

## In flight

- [ ] **B30be. Refine pass 2 names the call site and the forbidden patterns.** On `claude/b89-board`, not yet pushed. The coordinator
  corrected 6 agent results on 2026-09-23 (knip deleting a used file, a Stripe API pin on every
  client, a `GITHUB_ENV` name clash, a compatibility alias, a stack-update heuristic, a
  `.dockerignore` excluding `infra/`). In `.claude/skills/refine/SKILL.md` pass 2 (`## Pass 2 —
  feasibility`, line 52), require every
  brief to name the exact call site (file:line) the change lands on, and to list the patterns the
  rules forbid that the change could reach: aliases, a setting applied wider than the call that
  needs it, whole-tree formatting or deletion tools, broad ignore rules. **Source**: session
  report Mc+ncD. **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **OF1a. PayPal client id read from a variable.** On `claude/b89-board`, not yet pushed. The operator created the live app
  `diya-finance` and put `PAYPAL_CLIENT_SECRET` on the `prod` environment as a secret and
  `PAYPAL_CLIENT_ID` as a variable (2026-09-23). `.github/workflows/deploy-environment.yml`'s step
  "Create secret in AWS from secrets.PAYPAL_CLIENT_ID" (line 339) reads `secrets.PAYPAL_CLIENT_ID`,
  so it would skip. Change it to `vars.PAYPAL_CLIENT_ID` (and its step name), keep the secret step.
  The merge's push to `main` runs `deploy-environment.yml` itself (the workflow's own path is in
  its `push.paths`); confirm that run's environment is prod, and only if it is not, dispatch
  `gh workflow run deploy-environment.yml --ref main -f environment-name=prod`. Then confirm
  `prod/submit/paypal/client_id` and `client_secret` exist (`aws --profile submit-prod
  secretsmanager describe-secret --secret-id <id>`; both were absent on 2026-09-23). Then F1b runs.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **CS1. `compliance.toml`'s presenter status is current.** On `claude/b89-board`, not yet pushed. The `companies-house-presenter`
  item (line 30) says test-account activation is pending; the test presenter 66666727000 was
  issued 2026-09-11 and its ci secrets set 2026-09-12. Update `description`, `status` and `date`,
  `compliance.yml` reads it (REPORT_CAPABILITIES OPS-38); a TOML parse is the proof.
  **Owner**: Claude Code. **Model**: Haiku. **Size**: 1 file.

- [ ] **B30bf. A parser brief carries one real month and its expected residual.** On `claude/b89-board`, not yet pushed. The PayPal
  statement parser took 4 rounds (0.67M tokens) because the activity-summary parse was overwritten
  by a later bare heading and no fixture caught it. In `.claude/skills/refine/SKILL.md` pass 2 and
  `.claude/skills/company-book/SKILL.md`'s `## Build` (line 32), require a parser brief to name one real
  source month (its path under `../drive/…/finance/`) and the expected reconciliation residual
  (0) as the first test. Shares `refine/SKILL.md` with B30be: one agent; the `company-book/SKILL.md` line lands in F2k's agent. **Source**: session
  report Mc+ncD. **Owner**: Claude Code. **Model**: Haiku. **Size**: 2 files.

- [ ] **B30bb. A Markdown-only push leaves a PR blocked.** On `claude/b89-board`, not yet pushed. `main`'s ruleset (16057564) requires
  `Check commit signatures`, `npm test`, `maven test`, `eslint` and `CodeQL` on the PR head, but
  `.github/workflows/codeql.yml` ignores `**.md` on push and pull_request (lines 19 and 23) and has
  no `workflow_dispatch`, and `test.yml` skips a Markdown-only push too (line 57; it already has
  `workflow_dispatch`, line 8); PR #344's head `5175ec17` (a skill file) sat `BLOCKED` until the
  branch was moved back. `Check commit signatures` comes from `verify-commit-signatures.yml` on
  `pull_request`, so it runs. Add `workflow_dispatch` to `codeql.yml` (the analyze job's `if:` at
  line 42 already admits it), and in `.claude/skills/auto-merge/SKILL.md` a step after the
  `gh pr list` read (line 47): when the PR head changes only `.md` files and a required check is
  missing, dispatch `test.yml` and `codeql.yml` on the head (`gh workflow run <file> --ref
  <headRef>`) and wait for them. Proof: a Markdown-only commit on a
  PR reaches `CLEAN` after the dispatches. Saves about 20 minutes and a force-push per Markdown-only
  head (session report Mc+ncD). Same agent as B30bc. **Owner**: Claude Code. **Model**:
  Sonnet. **Size**: 2 files.

- [ ] **B30bd. Worker agents start no agents.** On `claude/b89-board`, not yet pushed. The capabilities-report agent forked itself
  recursively on 2026-09-23: 0.78M tokens reported, more unreported, and duplicate writers whose
  errors had to be relayed and corrected. In `.claude/skills/do-next/SKILL.md` and
  `.claude/skills/iterate/SKILL.md`, make every worker brief say it must not call the `Agent` tool
  or fork, and that only the coordinator fans out; a brief whose work needs splitting is split by
  the coordinator before dispatch. **Source**: session report Mc+ncD. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 2 files.

- [ ] **B30bg. Sibling-repository worktrees push in one attempt.** Skill part on `claude/b89-board`, not yet pushed; the hook part is spreadsheets PR #137 (`claude/ops-prepush-clean`). The spreadsheets push on
  2026-09-23 took 3 attempts, one of them a 41-minute run: the worktree had an empty
  `node_modules`, and `../spreadsheets.diyaccounting.co.uk/.githooks/pre-push` wrote about 100
  generated files (and changed `provenance-data.js`) that then sat uncommitted. In
  `.claude/skills/do-next/SKILL.md`, make a sibling-repository brief symlink the main checkout's
  `node_modules` into its worktree; in the spreadsheets repository, make the pre-push hook fail
  with the list of files it wrote when `git status --porcelain` is not clean after
  `node scripts/test-scope.mjs --base "$base"` runs (both calls, lines 127 and 132, today end the
  hook with that command's exit status) (a branch and PR there). Shares `do-next/SKILL.md` with B30bd: one agent. **Source**: session report
  Mc+ncD. **Owner**: Claude Code. **Model**: Sonnet. **Size**: 2 files (one per repository).

- [ ] **B52h2. Forecast Search at a match type and a bid ceiling.** On `claude/b89-board`, not yet pushed. `infra/google/ads/ads-forecast.js`
  sends every keyword as `BROAD` with no maximum cost per click (line 155), so the forecast of
  2026-09-23 read £38 a click for £50 a day. Add `--match-type <EXACT|PHRASE|BROAD>` and
  `--cpc-ceiling-gbp <n>` (the API's field is `maxCpcBidCeilingMicros` inside
  `maximizeClicksBiddingStrategy`, line 154), with cases in `app/unit-tests/scripts/adsForecast.test.js`,
  and in `.claude/skills/ads-advisor/SKILL.md` say to quote the match type and ceiling with any
  forecast. **Owner**: Claude Code. **Model**: Haiku. **Size**: 3 files.

- [ ] **F2h. `mail-invoices.js` finds the workspace from a worktree.** On `claude/b89-board`, not yet pushed. `WORKSPACE_ROOT` in
  `mcp/lib/finance/mail-invoices.js` (line 21) is four directories above the file, which from
  `.claude/worktrees/<name>/` lands inside `submit.diyaccounting.co.uk/`, so `CORPUS_BIN` and
  `CORPUS_CONFIG` (lines 22 to 23) miss and F2d needed a `runCorpus` override. Replace it with an
  upward walk from the file's directory, capped at 8 levels, that accepts the first directory
  whose basename equals a configured name and which holds `index/corpus.toml`; the name is a
  config property, `"config": { "workspaceDirName": "diy-accounting-limited" }` in
  `mcp/package.json`, read by the module. No match within the cap throws, naming the start path,
  the cap and the name. Cases in `mcp/test/mail-invoices.test.js`: the main checkout, a worktree
  path, a path with no such directory. **Source**: operator 2026-09-23 (option a
  with a cap and the configured name). **Owner**: Claude Code. **Model**: Haiku. **Size**: 3
  files.

- [ ] **F2i. Direct debits confirmed from a payment schedule.** On `claude/b89-board`, not yet pushed. `invoiceLinesForPeriod` in
  `mcp/lib/finance/mail-invoices.js` (line 165) takes one total per document
  (`findInvoiceTotal`, line 105), so a schedule of dated instalments posts nothing. Hiscox's
  "Payment schedule.pdf" is indexed in the corpus as an attachment section
  (`--- attachment: Payment schedule.pdf ---` in `corpus doc mail-antony
  2026/6/12/19eba6fef669188c.eml`): a `Date  Amount` header, then rows `08/08/2026  £10.12`, and
  "If your payment collection date falls on a weekend or a bank holiday, we'll collect it the next
  working day". Add a schedule extractor: a document with a "Payment schedule" section yields
  (date, amount) instalments; each instalment inside the period becomes one `purchases` line to
  the supplier's account, dated on the collection day, matched to the bank's direct debit of the
  same amount dated on the scheduled day or up to 4 days after. Proof: March to August 2026 gives
  £9.17 March to July (the 2025 schedule, `2025/6/12/19762c6fb3568039.eml`) and £10.12 on
  10 August, the figures `../staging/2026-2027/book/VERIFICATION.md` (line 68) cites by hand, to
  account 5700. Cases in `mcp/test/mail-invoices.test.js` over the recorded attachment text.
  Shares `mail-invoices.js` with F2h: one agent, F2h first. **Source**: `PARKED.md`; operator
  2026-09-23 (option a). **Owner**: Claude Code. **Model**: Sonnet. **Size**: 2 files.

- [ ] **ITSA8. The diversion note for income the build does not cover.** On `claude/b89-board`, not yet pushed. Row 8 of
  `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` is "Not evidenced": a customer with
  foreign property or other income is not told where to finish their return. Worse,
  `applyPickedBusinessToLinks` in `web/public/hmrc/itsa/dashboard.html` (line 295) routes every
  type that is not `self-employment` to the `ukProperty*` pages, so a picked `foreign-property`
  business is sent to UK property forms. Make a `foreign-property` pick show the diversion note and
  no step 3 to 8 links, add the note beside the picker (line 331), cover both in
  `web/browser-tests/itsaDashboard.browser.test.js` (its `page.route` pattern, line 45), and mark
  row 8 (checklist line 41) evidenced with the file and line. `obligations.html` (line 74) and
  `lossesAndClaims.html` (line 76) offer `foreign-property` as a type; leave them, HMRC's
  obligations and losses cover it. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **B30bi. The ci last-known-good set goes 12 hours after its promotion.** On `claude/b89-board`, not yet pushed. `findSkipReason`
  in `app/functions/infra/selfDestruct.js` (line 137) skips every self-destruct fire while
  `/submit/ci/last-known-good-deployment` names the set, so `ci-set1` stands until another ci
  deploy passes (about $15 a month: 5 provisioned-concurrency configs, 2 canaries, 3 alarms).
  Protect the set only while the parameter's `LastModifiedDate` (from the same `GetParameter`
  call, `readSsmParameter` line 114) is under 12 hours old; `deploy.yml`'s
  `set-last-known-good-deployment` (line 3093) rewrites it on each promotion, so the clock runs
  from the last promotion. The protection window is an env var set in
  `infra/main/java/co/uk/diyaccounting/submit/stacks/SelfDestructStack.java` beside
  `LAST_KNOWN_GOOD_PARAMETER_NAME` (line 245), value 12. When the set is destroyed past the
  window, write `None` to the parameter first (the value `deploy.yml` line 513 and
  `destroy-ci.yml` line 565 treat as no set), so a skip-deploy run never resolves to a destroyed
  set; grant `ssm:PutParameter` on that parameter in the policy at line 210, which grants
  `ssm:GetParameter` today. An unreadable parameter stays protection. The schedule fires every 4
  hours from creation, so the set goes 12 to 16 hours after promotion. Cases in
  `app/unit-tests/functions/selfDestruct.test.js` (inside the window, past it, the `None` write,
  unreadable), and `infra/test/java/co/uk/diyaccounting/submit/stacks/SelfDestructStackTest.java` for the env var and the grant (sid `ReadLastKnownGoodDeployment`); `./mvnw clean verify`
  once. Prod never deploys a `SelfDestructStack`, so prod is unaffected. **Source**: operator
  2026-09-23 (option A, 12 hours). **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **ITSA13. WCAG 2.1 AA evidence for the 19 ITSA pages.** On `claude/b89-board`, not yet pushed. Row 13 of the checklist is "Not
  evidenced": no scan names any of the 19 pages under `web/public/hmrc/itsa/`. Three lists carry
  the scanned pages: `scripts/axe-quickscan.mjs`'s `PAGES` (line 12; run as `node
  scripts/axe-quickscan.mjs <baseUrl> wcag2a,wcag2aa,wcag21a,wcag21aa`), `package.json`'s
  `accessibility:axe-*` URL lists (lines 328 to 330), and `.pa11yci.{proxy,ci,prod}.json`, which
  `.github/workflows/compliance.yml`'s pa11y job runs (line 151). Add the 19 pages to all of them.
  Signed out, a page scans only its empty state; scan the populated state too with a browser test
  that serves the page as `web/browser-tests/itsaDashboard.browser.test.js` does (`page.route`,
  line 45) and injects `node_modules/axe-core/axe.min.js` (installed). Fix what either finds and
  record the result in the checklist (row 13, line 46) and `REPORT_ACCESSIBILITY_PENETRATION.md`.
  **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~8 files.

- [ ] **B30bc. A PII scan on every push, docs included.** In rework on an agent worktree: the first build reused the redactor's `DENY_PATTERNS` and hit 2,489 lines of the current tree (the words "bearer token" among them); the rework gives the scan its own patterns, targets zero hits on the tree, and exempts test directories for personal data only. GitHub secret scanning with push
  protection and non-provider patterns is on for this repository, so provider tokens and private
  keys are blocked at push already; nothing scans what a push adds for personal data. Add
  `.github/workflows/content-scan.yml` on push (every branch, no path filter) and pull_request: scan
  the lines the push or PR adds with the patterns `scripts/redact-triage-output.mjs` already
  exports (`DENY_PATTERNS`, line 19: email, NINO, UTR, VRN, EORI, AWS keys, JWTs, bearer tokens,
  IP addresses), with an allow-list for addresses and ids the repository publishes on purpose. Fail on a hit and print
  the file, line and label, never the matched value. Extend `redact-triage-output.mjs` or a
  sibling script with tests, as the capabilities rule asks.
  Proof, on a branch with an open PR, as two separate Markdown-only pushes: one changing a
  root `.md` file, one changing a `.claude/skills/*/SKILL.md`; each push runs `content scan` on
  its head (push and pull_request), and with B30bb's dispatches the PR reaches `CLEAN`. A third
  push adding a seeded fake NINO to a `.md` fails the scan with file, line and label; revert it.
  Record the run ids in OB30bc's row. Adding `content scan` to the ruleset's
  required checks is OB30bc. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **F2k. DIYA's book rebuilt so diya-gl reads it.** On `claude/b89-board`: bank lines carry
  `debitCreditCode`, `book-from-workbook.js` emits the opening journal and the opening `BC` bank
  lines, and `periodCoveredEnd` is the fiscal year end (2027-03-31). The rebuilt book (1 April to
  31 August 2026, 452 lines) is in `../staging/2026-2027/book/`: 0 book-check failures, bank 1200
  and 1210 close at £1,624.90 and £271.69, Stripe residual 0, opening balance sheet populated. The
  superseded book is in `../staging/2026-2027/book-2026-09-23-superseded/`. Remainders: F2l, OF2k,
  F2m. **Source**: Cowork inbox 2026-09-23T20:46:44Z. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: 5 files.

## Machine-only

- [ ] **F2m. DIYA's book: the non-sales receipts reclassified and the members register.** The
  rebuilt book (`../staging/2026-2027/book/`) posts £1,163.50 of April to August receipts as
  sales. The operator's answers (2026-09-23): (a) £1,000 "Mobile Payment: Antony Cartwright" is a
  directors' loan credit (account 2500), taking the DLA balance to zero; (b) the £160.22 of AWS
  refunds are a credit against hosting (5301); (c) the £1.00 and other small charges on the
  operator's own subscription are test purchases, reversed out of sales; (d) the £2.28 cashback
  is earned on PayPal purchases, a credit against purchases. Post each on the account named; if
  (a)'s £1,000 does not bring the DLA to exactly zero, report the difference rather than forcing
  it. First, the opening balances at 1 April 2026 are the closing balances of the year ended
  31 March 2026, read with diya-gl from the 2025-26 workbook set in
  `../drive/DIY Accounting Limited/finance/2025-2026 accounts/` (operator, 2026-09-23); the
  current `[openingBalances]` came from the superseded 1 March draft. The same set's bank, cash,
  sales and purchases sheets show how each kind of transaction was labelled: derive a label map
  (payee or description pattern to account, bank code, VAT code), store it at
  `../staging/labels/diya-labels.toml`, apply it to every line, and list what it does not cover in
  `VERIFICATION.md` (operator, 2026-09-23). Add `[[members]]` to `book.toml` from the Companies House register (the confirmation
  statement of 2025-10-25; share capital £100) so `RegisterofMembers` passes. Rebuild, re-run the
  report, update `VERIFICATION.md`. (b) and (d) are purchases credit notes: their totals read
  right once F2l's engine change covers purchases. **Source**: F2k's report; operator
  2026-09-23. **Owner**: Claude Code. **Model**: Sonnet. **Size**: 0 files.

- [ ] **F2l. The engine nets a credit note against turnover.** In flight: a spreadsheets branch `claude/gl-creditnote-net`, its PR to follow. The diya-gl schema fixes a line's
  `amount` at `minimum: 0` (`../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/schema/diya-gl-lines-v2.schema.json`
  lines 69 to 72) and nothing reads `documentType`: `computeGrossSales`
  (`app/lib/scenario-extractor.js` line 536), `salesTotal` (`app/lib/book-checks.js` line 326) and
  `totalsByCode` add a `sales` line with `documentType: "credit-note"` as a sale. Make those three
  subtract it, with cases over a sale and its refund in the same month, in a spreadsheets branch
  and PR; the release carries it to `@diy-accounting-uk/diya-gl`. DIYA's April book carries two
  Stripe refunds (£10.98 gross), so turnover reads £18.30 net too high until this lands; then
  rebuild the zip and re-run the report (F2k's glue is in the session scratchpad; the steps are in
  the company-book skill). **Source**: F2k's diagnosis. **Owner**: Claude Code. **Model**: Sonnet.
  **Size**: ~4 files.

## Machine-ask

## Human-driven

- [ ] **OCS. The confirmation statement, due 5 October 2026.** Made up to 21 September 2026;
  DIY Accounting Limited 06846849 last filed a CS01 on 25 October 2025
  (<https://find-and-update.company-information.service.gov.uk/company/06846849/filing-history>).
  Before filing, confirm the registered email address the 13 September update (reference
  123168-928517-893411) left on the register is the one the company keeps, and file a second update
  if it is a test value; then supply each director-PSC's personal code within 14 days of the
  statement date. Steps are task B of `../NEXT_OPERATOR_RUNBOOK.md`. **Owner**: Operator.
  **Model**: none. **Size**: 0 files.

- [ ] **OPU7n. Go for the practice licence launch.** Say go when `resident-pro` should go on sale at
  £199 a year and £19.99 a month (the catalogue flip, the nav link, the Stripe live prices, PU-7n).
  **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O34d. Send the XML Gateway email.** Send `../DRAFT_EMAIL_XMLGW_000004.md` from `antony@diyaccounting.co.uk`
  as a reply on the `xml@companieshouse.gov.uk` thread, and paste the answer into B34.6c's row when
  it comes. The draft names test presenter 66666727000, the id on the ci environment. **Source**: BACKLOG 34b. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **O11. The ITSA send day.** Name the day the recognition email goes, write it into B11.T10's
  row, and on that day send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to
  `SDSTeam@hmrc.gov.uk`, then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when
  SDST answers. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**:
  none. **Size**: 0 files.

## Blocked

- [ ] **OF2d. Copy DIYA's book into Drive.** Blocked on F2l and F2m (the rebuilt book's turnover counts two refunds and £1,163.50 of non-customer receipts as sales). The book is in
  `../staging/2026-2027/book/` (`book.toml`, `lines.jsonl` with 488 lines, `VERIFICATION.md`, and `book-diya-gl.zip` for the spreadsheets MCP):
  bank balances match every statement, Stripe and PayPal reconcile with no residual, validation
  passes, and the review items (the £200 Polycode creditor payment, Hiscox, Linktree) are
  resolved in `VERIFICATION.md`. Copy the three files into Drive under
  `finance/2026-2027 accounts/`. That copy is OF2's input. **Owner**: Operator. **Model**: none.
  **Size**: 0 files.

- [ ] **OB30bc. Make the content scan a required check.** Add `content scan` to the required
  status checks of ruleset 16057564
  (<https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/rules/16057564>), so no PR
  merges past a PII hit. Blocked on B30bc's merge and its proof: both docs-only pushes (a root
  `.md`, a skill) ran `content scan` and the PR reached `CLEAN`. **Owner**: Operator.
  **Model**: none. **Size**: 0 files.

- [ ] **F2n. The finance parsers code lines from the label map.** `bank-lines.js` (`bankCodeFor`,
  line 104) codes a line from the statement's type alone, and `paypal-statement-lines.js` and
  `stripe-lines.js` post every receipt to sales. Give each an optional `labels` input, the map F2m
  writes to `../staging/labels/diya-labels.toml` (read by the caller and passed in, so the
  parsers stay pure and the repository holds no payee data), that sets account, bank code and VAT
  code for a matching description; an unmatched line keeps today's coding and is returned in an
  `unlabelled` list. Tests over a synthetic map. The company-book skill's Build section names
  the map and the refresh from the prior year's workbooks. Blocked on F2m (the map's shape).
  **Source**: operator 2026-09-23. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~7 files.

- [ ] **B30at1. The sweep's claim check, proven.** Needs a claimed set that is not last-known-good
  (the sweep keeps the last-known-good set before it reads any claim): the next time two branches
  deploy at once, `gh workflow run destroy-ci.yml -f sweep-for-stacks=true` while the second holds
  `ci-set2`, and its log shows "stays: claimed by run". Blocked on two branches deploying at once. **Owner**: Claude Code. **Model**: Haiku.
  **Size**: 0 files.

- [ ] **F1b. PayPal's six months staged.** Run `scripts/finance/paypal-stage.js` (the credential
  read from Secrets Manager `prod/submit/paypal/client_id` and `prod/submit/paypal/client_secret`
  with `AWS_PROFILE=submit-prod`) for each month from March to August 2026, writing
  `../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json`. F2g reads the output.
  Blocked on OF1a. **Source**: `../PLAN_FINANCE_AUTOMATION.md` route 1. **Owner**: Claude Code.
  **Model**: Haiku. **Size**: 0 files.

- [ ] **F2g. PayPal transactions into diya-gl lines.** `mcp/lib/finance/paypal-lines.js` over
  F1b's staged files, on `mcp/lib/finance/stripe-lines.js`'s pattern. The statement route,
  `mcp/lib/finance/paypal-statement-lines.js`, already applies the rules this route needs
  (settled only; holds and their releases unposted, `isHoldCandidate` line 288 and
  `isReleaseCandidate` line 301; a receipt gross to `sales` with its fee to `purchases`; bank
  transfers and currency conversions unposted, `isCurrencyConversionOrTransfer` line 274): reuse
  those functions where the API's record shape allows. A bill payment is `purchases` matched to
  the mailbox invoice (`mcp/lib/finance/mail-invoices.js`). Validated with `validateLines`; a unit
  test over a recorded page; the proof is that the API route's `sales` and `purchases` lines for
  March to August 2026 equal the PayPal lines the statement route wrote into
  `../staging/2026-2027/book/lines.jsonl`.
  Blocked on F1b. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude Code.
  **Model**: Sonnet. **Size**: ~2 files.

- [ ] **B11.T10. ITSA phase 2: the testing evidence inside the window.** Within the 14 days before
  the day O11 names, re-run `scripts/itsa-sandbox-year.js` for 2023-24, 2025-26 and 2026-27 (the
  command in `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md` "The command", lines 66 to 80, output
  under `../itsa-sandbox/<tax-year>/`) and update the "Testing in the last two weeks" row of
  `_developers/hmrc/hmrc_questionnaire_itsa_pass_diy_accounting_limited_v1.md` (line 28, today
  "2026-09-21 (`5f2ff46a`)") with the run dates and commit. Blocked on O11's day. **Source**:
  BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Claude Code. **Model**: Haiku. **Size**:
  ~1 file.

- [ ] **B34.6c. Companies House accounts filing: the sandbox proof.** When O34d's answer says
  lookups are enabled: poll 000004 through `GET /api/v1/companies-house/accounts/000004` on a
  standing ci set and pin the returned `StatusCode` and any rejections as a case in
  `app/unit-tests/functions/companiesHouseAccountsGet.test.js`. The prod catalogue listing is
  BACKLOG 34c's: prod carries no `COMPANIES_HOUSE_XMLGW_URI` and no presenter secret ARNs. Blocked
  on O34d's answer. **Source**: BACKLOG 34b. **Owner**: Claude Code. **Model**: Sonnet. **Size**:
  ~1 file.

- [ ] **B52l. The optimiser over the raw export.** A notebook over `../analytics/prod/` (pulled by
  `scripts/analytics-pull.sh`, one CSV per view in `app/functions/analytics/rawExportPublish.js`'s
  `VIEW_NAMES` (line 21)): per-block correlations, the block models fitted (linear cost from
  `v_cost_daily`, log-linear funnels from `v_login_to_submission_funnel` and `v_ga4_funnel_daily`,
  Hill curves for spend), levers ranked by effect per unit cost, and the next experiment proposed
  with its predicted effect and interval as a row ready for `experiments.toml`; Bayesian
  optimisation for the continuous knobs and a Thompson-sampling bandit for allocations once
  experiments exist. The model design as a section under `PLAN_ONE_STOP_DASHBOARD.md` D16 first,
  then the notebook, then one line per objective on `web/public/operator/dashboard.html`. Blocked
  until three months of nightly export exist under `exports/prod/`: first written 2026-09-08, so
  the gate is 2026-12-09, checked with `aws --profile submit-prod s3 ls
  s3://prod-env-analytics-lake-<account>/exports/prod/`. **Source**: BACKLOG 52l;
  `PLAN_ONE_STOP_DASHBOARD.md` D16. **Owner**: Claude Code. **Model**: Opus for the models, Sonnet
  for the notebook. **Size**: ~3 files.

- [ ] **B52m. The reinvestment loop.** Trailing income, reserve, budget, return per pound and payback
  as one block on `web/public/operator/dashboard.html`, fed by observations over `v_revenue_daily`
  and `v_cost_vs_target_monthly` in `operatorSnapshotPublish.js`; the reinvestment fraction as a
  lever with the reserve floor (operator, 2026-09-22: the fraction is 20% of trailing income, the
  reserve floor £2,000, one experiment may take at most 10% of the budget unless the operator
  names a larger share for it, and the trailing window is 30 days); paid traffic and article boosts as `experiments.toml` rows with
  on-off or geographic controls; GA4 conversion import from the Ads account, which exists as code
  (`infra/google/ads/ads.toml`: customer `8142685080`, four conversion actions imported from GA4
  events, one Performance Max campaign); the cost-per-session ceiling PU-15 wrote into D17 is the
  starting bid ceiling. Blocked on B52l's fitted models (the return-per-pound figure), the cost
  panel carrying revenue (BACKLOG 43, from 2026-10-02). **Source**: BACKLOG
  52m; `PLAN_ONE_STOP_DASHBOARD.md` D17. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3
  files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard.** The company's diya-gl book,
  derived nightly and rendered above the eight objectives beside the last set filed at Companies
  House. Shape: a nightly Lambda beside `app/functions/analytics/` calling `mcp/lib/accounts-tools.js`
  `derive_micro_entity_accounts` over the cloud book, writing JSON lines to `curated/finance/` with
  a Glue table on `Ga4DailyTables.java`'s pattern, one observation set in
  `operatorSnapshotPublish.js`, and a block above `renderSnapshot`'s objectives in
  `web/public/operator/dashboard.html`. Blocked on OF2 (DIYA's book saved to the DIYA cloud, the last of the F1 and F2 rows). **Source**: BACKLOG 52i; `PLAN_ONE_STOP_DASHBOARD.md` D10. **Owner**:
  Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **F2e. The MCP writes a populated spreadsheets package.** A tool in `mcp/lib/finance/` that
  takes the book and lines and writes a DIY Accounting spreadsheets package, reconciled under the
  spreadsheets repository's existing reconciliation harness rather than a new check; nothing
  automated writes to Google Drive. Blocked on OF2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md`
  phase 2. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **PU-7n. The practice licence launch.** Operator, 2026-09-22: `resident-pro` at £199 a
  year and £19.99 a month, the monthly price shown only on `bundles.html` (the DIYA-GL page shows
  annual prices alone, for `resident` too). `web/public/submit.catalogue.toml`'s `resident-pro`
  block (line 208: `enable = "on-pass"`, `hidden = true`, `allocation = "on-pass-on-subscription"`,
  one monthly price of 999) flips to `enable = "always"`, `hidden = false`,
  `allocation = "on-subscription"` with the two prices on its prices table, then
  `stripe-catalogue-sync` test and live for the price ids into `.env.ci` and `.env.prod`
  (machine-ask for the live run); a practice page nav link is added to
  `web/public/widgets/page-chrome.js` (it has none today); the four ci probes that reach
  `resident-pro` through a pass are updated in the same change; the DIYA-GL page
  (`../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/index.html`, whose tier list at
  line 73 shows `resident` at £39 a year alone) gains a `resident-pro` line at £199 a year, in
  that repository's own PR. Blocked on OPU7n, the operator's go for the launch (the ICO fee register
  records no processing purposes, so ZB070902 needs no change). **Source**: `PLAN_PRICE_UPDATE.md` §(d); operator 2026-09-22. **Owner**: Claude
  Code. **Model**: Sonnet. **Size**: ~9 files.

- [ ] **OF2. DIYA's book saved to the DIYA cloud.** With the operator signed in through B61's
  sign-in, `save_book` writes F2d's verified book to the DIYA cloud, which is B52i's unblock event.
  Blocked on OF2d. **Source**: `../PLAN_FINANCE_AUTOMATION.md` phase 2. **Owner**: Claude
  Code; the operator signs in. **Model**: Haiku. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

