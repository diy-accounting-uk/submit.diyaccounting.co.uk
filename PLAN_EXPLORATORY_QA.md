<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Exploratory QA of the deployed site

Status: design, drafted 2026-10-25. Rows XQ1 to XQ4 on `NEXT.md`, after the whole-site design
pass (DS4, DS5) and the fixes it raises, so the first pass reads the site the design pass left.

## Operator assertions

> construct something similar to [the word-team-rebuild exploratory QA approach] for this
> repository and add it to the board positions after all the ux design pass stuff and their fixes
> and we'll need to adapt for not having a reference site to compare with and the nightly run
> should be weekly. The goal here is to explore the site and actually how it renders and flag
> things that look like bugs or omissions or formatting failures to a human user.

## The ask

The tests prove what the DOM holds and the reader-view check proves a page is readable at the
steps a test takes. Neither walks the site the way a person does: following a link that looked
promising, resizing the window, reading a result and asking whether it says what it should.
This plan adds that walk as three mechanisms, each a board row. It finds what a human user would
see as a bug, an omission or a formatting failure, and writes it up with a screenshot so the
operator can pick what to fix.

## The three mechanisms

1. **A blind crawl, weekly (XQ2).** A Playwright script walks every same-origin link and form
   on the ci site as each role, at a desktop and a phone viewport, in light and dark, and
   records 4xx and 5xx responses, console errors, broken images, sideways overflow, text that
   overflows its box, pages over a size budget, and pages that render a raw identifier where a
   person expects a name or a date. It writes a contact sheet per role, viewport and theme. It
   runs inside `test.yml`'s scheduled run (cron `23 4 * * *` UTC) on Sundays only, by a
   day-of-week gate on the job (`date -u +%u` equal to 7), so no new schedule is added; a
   `workflow_dispatch` input runs it on demand. It finds what is broken; it does not judge.
2. **A judgement pass, on demand (XQ3).** The operator says "explore ci" (or the loop runs it
   after the design pass lands). The `/explore` skill dispatches one Opus sub-agent per role, one
   after another; each clicks through the site with the Playwright MCP browser at 1280x800 and
   390x844, walks every menu entry and the role's journeys from the guide, and writes findings
   with screenshots. A Sonnet sub-agent then verifies every finding against the oracle and traces
   its cause to a file and line. The coordinator writes one review with proposed board rows. The
   operator picks the rows.
3. **A week-on-week pass (XQ4).** The crawl's contact sheet is compared with the previous week's
   by an image diff, page by page, role by role; the pass reads each pair that differs and says
   whether the change is a landed fix, a regression, or data. This replaces the side-by-side
   pass of a site that has an original to compare with: here the previous week is the reference.

The fixes the operator picks become ordinary rows, built in a wave and merged through the
normal pipeline.

## The oracle

There is no older original to compare with. A finding is a defect when a reader would see it as
one, judged against what the repository already says the site should do:

| Oracle | Where | What it settles |
| --- | --- | --- |
| The journeys | `web/public/guide.page.js` (the sections and their `journeys`), `videos/publish.json` and each video's walkthrough | which steps a journey has, what each step shows, where it ends (the submission record) |
| The catalogue | `web/public/submit.catalogue.toml` | which activities exist, in which environment, behind which bundle; a page that offers what the catalogue withholds, or hides what it offers, is a defect |
| The design plan | `PLAN_SITE_DESIGN.md` (the shared layer, the per-page findings, the light-pinned list) | layout, tokens, the field pattern, the signed-out panel, dark mode |
| The reader-view criteria | `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_READER_VIEW_TESTS.md` and `assertReaderView` in `behaviour-tests/helpers/behaviour-helpers.js` | nothing cut at a box edge, nothing overlapping, progress messages cleared, dates and money formatted |
| The look criteria | `.claude/skills/visual-review/SKILL.md` (ten criteria) | realistic data, not a bug, clean edges, space used, readable, current, nothing in the way, safe, alt text, consistent |
| The behaviour suites | `behaviour-tests/*.behaviour.test.js` and their steps | what each page does on a valid, an empty and a failing submit |
| The availability table | `web/public/mtd-calendar.html` | which filings the site says it can make, and from when |

Anything the oracle does not settle is judged as a user would judge it, and the finding says
so. Each finding carries exactly one verdict:

- **bug**: the page does something wrong (a wrong figure, a dead control, an error on a valid
  input, a state the journey cannot leave).
- **omission**: something a user needs is missing (a link back, an explanation of a term, the
  next step after a result, an empty state, an error summary).
- **formatting**: the page is right but reads wrong (text cut or overlapping, a wrap in the
  wrong place, a misaligned column, an ISO date or an unformatted number, a raw identifier
  where a name belongs, a dark-mode colour that vanishes).
- **question**: the behaviour may be a decision; the review names where the decision is
  recorded when it finds one, else asks.

The phone pass holds the site to one standard: a user can complete the journey at 390x844
without sideways scrolling, and a fix stays inside the existing layout.

## Environments and roles

| Lane | URL | Sign-in | May submit | Used for |
| --- | --- | --- | --- | --- |
| ci | the host `https://ci-submit.diyaccounting.co.uk/submit.env` names (today `https://ci-set1.submit.diyaccounting.co.uk/`; the apex alias loses the OAuth state, LC1) | the ci lane's durable Cognito user by native auth (`npm run test:enableCognitoNative`, and ALWAYS `npm run test:disableCognitoNative` after) | yes: HMRC's sandbox (the synthetic account), the Companies House test service, Stripe test mode | the weekly crawl, the judgement pass |
| prod | `https://submit.diyaccounting.co.uk/` | none | no: no sign-in, no form submitted, no mail or SMS leaves, no record created | the anonymous half of the weekly crawl only |
| simulator | `npm run start:simulator`, `http://localhost:3000/` (mock sign-in) | the mock OAuth2 page | yes | verifying a fix before it is pushed |

Roles, each a pass of its own, run one after another because every sub-agent of one session
shares the MCP server's one browser:

1. **Visitor**: signed out; the root, product, help, guide, legal and video pages; the sign-in
   prompts; the signed-out panels.
2. **Customer**: signed in; the VAT, Income Tax, Companies House and Corporation Tax journeys as
   the guide lists them, the receipts and submission records, bundles, passes, usage, the books
   card and the diya-gl pages. The customer pass runs first among the signed-in passes so the
   later passes find submissions on the account.
3. **Practice**: signed in; `practice.html`, the client list, the codes link, the batch filing
   harness (`mcp-harness.html`) where the local server serves its call endpoint.
4. **Operator**: signed in; `operator/dashboard.html` and the developer-mode overlay once, to
   check it stays out of the way; every other pass keeps developer mode off.

## Rules of a pass

Written here once and restated in every brief:

- Every finding carries the URL, the role, the viewport, the theme, the numbered steps from the
  sign-in, what was seen in one sentence, a screenshot path, the oracle row it was judged
  against (or "reader's judgement"), and one verdict from the four above. No finding without a
  screenshot.
- A budget per pass: 200 tool calls and 40 screenshots, and the list of URLs visited, so a pager
  or a poll cannot loop the agent. The agent stops at the budget and says so.
- The pass never signs out through the site's sign-out link (the shared browser state would
  lose the session); it ends by closing the browser.
- A control that changes data (file, submit, pay, redeem, delete, revoke, cancel) is used only
  when the journey under test needs it, and then on a record the pass created in that lane.
- On ci, forms may be submitted. On prod, nothing is submitted and nothing is signed in.
- Screenshot names are explicit:
  `../private.diyaccounting.co.uk/engineering/submit/reviews/exploratory-<date>/<role>/<viewport>-<theme>-<nn>-<slug>.png`.
  The review and its screenshots live in the private repository because they show the test
  user's data and the site's unfinished parts.
- Developer mode stays off except in the operator pass; a finding that only shows with it on is
  recorded as such.

## The MCP server

`.mcp.json` at the repository root registers `@playwright/mcp` as a project-scoped server; the
operator approves it once in `/mcp`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y", "@playwright/mcp@0.0.83",
        "--browser", "chromium",
        "--headless",
        "--isolated",
        "--storage-state", ".cache/playwright-mcp/ci-state.json",
        "--viewport-size", "1280x800",
        "--output-dir", ".cache/playwright-mcp"
      ]
    }
  }
}
```

- `--isolated` with `--storage-state` starts each browser context from a file that holds the
  Cognito session for the ci lane's test user, so no sub-agent types a password or a TOTP code.
  `scripts/mint-exploratory-state.mjs` signs in once with Playwright (the credentials
  `npm run test:enableCognitoNative` prints, the TOTP from the same file) and writes the state
  file; the visitor pass uses a second, empty state file. After the file changes,
  `browser_close` makes the next `browser_navigate` start a fresh context.
- `--browser chromium` is Chrome for Testing in 0.0.83; install it once per machine with
  `npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing`.
- The tools the sub-agents use: `browser_navigate`, `browser_snapshot` (the default read),
  `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`,
  `browser_press_key`, `browser_take_screenshot` (on a journey's landing page, after each
  submit, and as evidence), `browser_resize` (390x844 for the phone pass, 1280x800 back),
  `browser_evaluate` (scroll width, `elementFromPoint`, `matchMedia` for the theme),
  `browser_file_upload` (files under `.cache/playwright-mcp/`, for the books card and the iXBRL
  drop), `browser_close`.
- The in-Chrome extension is not used for the passes: the operator declined it, and the headless
  server is what lets the passes run in the background while the chat stays free.

## The skill

`/explore` (`.claude/skills/explore/SKILL.md`), the whole pass:

- **Before**: check the SSO session; enable native auth and mint the state file; read the
  newest crawl report; create the date folder in the private repository.
- **Dispatch**: one Opus sub-agent per role, in the background, one at a time: visitor,
  customer, practice, operator. Each later brief names the earlier roles' findings and says not
  to re-report them. The brief is self-contained: the lane and its URL, the role and the state
  file, the start pages (the crawl's flags first), the journeys to walk (from the guide section
  for the role), the tool list to load in one `ToolSearch` call, the screenshot naming, the
  start and end steps, the rules, the finding shape, the report-back contract, and "no Agent
  tool, no git, no other edits". The sub-agent returns its findings as text under a heading;
  the coordinator writes the role's `FINDINGS.md`.
- **After**: a Sonnet verification sub-agent opens each finding's screenshot beside its oracle
  row, gives a verdict, and traces the cause to a file and line; the coordinator writes the
  review, commits it with the screenshots to the private repository, disables native auth, and
  lists the proposed rows for the operator.

## The review document

`../private.diyaccounting.co.uk/engineering/submit/reviews/REVIEW_EXPLORATORY_<date>.md`:

| Section | Content |
| --- | --- |
| Scope | the lane and its head commit, the roles, the viewports and themes, the steps and screenshots per pass, the URLs visited, the crawl run read, the records left on ci |
| Findings | each confirmed finding with its screenshots, the oracle row, the verdict and the cause with file and line, grouped by cause (a shared widget, a page script, a stylesheet rule, copy, data) |
| Decisions and data, no row | findings the oracle settles as a recorded decision or as the lane's data, each with where it is recorded |
| Not completed | each journey a pass could not finish and where it stopped, and what the next pass does about it |
| Proposed rows | one row per finding or group that shares a fix, in the board's row shape: label, title, the plan, what is wrong at which URL, role, viewport and theme, what the oracle says, the fix, the proof, size, model |

Nothing is boarded by the pass. The operator picks, asks for examples, and decides the fix where
real alternatives exist. Their words go verbatim under "Operator assertions" above.

## The weekly crawl

`scripts/exploratory-crawl.mjs`, run by a job in `test.yml` on the Sunday scheduled run and on
dispatch:

- Starts from the lane's root as the visitor, then signs in as the lane's test user (the same
  native-auth path the `-ci` behaviour variants use) and crawls again as the customer; prod is
  crawled as the visitor only.
- Follows every same-origin link and submits every form empty once, at 1280x800 and 390x844,
  light and dark, with a budget of 300 pages per role; a download is recorded as a page, a list
  is visited at one sort and one page variant.
- Records per page: status, console errors, failed requests, broken images, `scrollWidth`
  over `clientWidth`, elements whose text overflows their box, size over 1.5 MB, and text that
  matches an identifier pattern (a UUID, an ISO timestamp, a `periodKey`) outside a developer
  section.
- Writes `target/exploratory-crawl/<lane>/<role>/<viewport>-<theme>/` with a `contact-sheet.html`,
  one PNG per page and a `findings.json`; the job uploads the folder as an artifact and publishes
  the contact sheets beside the behaviour test reports under `web/public/tests/exploratory/<date>/`
  through the same publish step the test reports use.
- The job summary lists the counts per class and links the artifact; a count above the previous
  week's opens nothing on its own: the week-on-week pass (XQ4) reads it.

## Models and cost

- The role passes: Opus, because the judgement is the point. The reference site's passes took
  95 to 185 tool calls and 22 to 24 screenshots per desktop pass and 27 to 40 calls per phone
  pass, 245k to 330k tokens per role; four roles here.
- The verification pass: Sonnet, about 170k tokens for 25 findings.
- The fixes: Sonnet or Haiku by the row's size, one agent per set of files, concurrent.

## Carried from the reference setup

Lessons the first site paid for, applied here from the start:

- The harness refuses a sub-agent's write of a findings file; the brief asks for the findings
  as text and the coordinator writes the file.
- The customer pass runs before the practice and operator passes so those find data.
- Oracle paths are checked with `find` and `grep` before the first pass and written into the
  brief as they are.
- The crawler records a download as a page and caps each list at one sort and one page variant.
- Local verification of a fix runs the simulator lane on a port nobody else uses, under the
  simulator lock.
- A dev widget's controls stay out of the button role; a browser test guards it.
- Operator decisions with real alternatives are asked one at a time with the options named.

## Rows

| Row | What | Files | Model |
| --- | --- | --- | --- |
| XQ1 | the setup: `.mcp.json`, `scripts/mint-exploratory-state.mjs`, `.claude/skills/explore/SKILL.md`, the capability entries | ~4 | Sonnet |
| XQ2 | the weekly crawl: `scripts/exploratory-crawl.mjs`, its unit test, the `test.yml` job with the Sunday gate and the publish step | ~4 | Sonnet |
| XQ3 | the first judgement pass on ci and its review in the private repository | 0 here | Opus (the passes), Sonnet (the verification) |
| XQ4 | the week-on-week pass: the image diff of two crawls' contact sheets and the reading | ~2 | Sonnet |

All four follow DS4 and DS5 and the fix rows they raise, so the first pass reads the site the
design pass left. After the first pass, what it taught goes into the skill before the second.
