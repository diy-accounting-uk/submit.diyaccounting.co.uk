---
name: explore
description: Walk the deployed ci site as a person would, one role at a time (visitor, customer, practice, operator), with the Playwright MCP browser; verify each finding against the oracle; write one review with screenshots in the private repository. Invoke when the operator says "explore ci", "exploratory pass", "judgement pass", or asks for a human-eye review of the site.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# explore

A test checks what its author thought of. This pass follows a link that looked promising, resizes
the window, reads a result and asks whether it says what it should. The design is in
`PLAN_EXPLORATORY_QA.md`: the oracle, the verdicts, the review document. Read its "Rules of a
pass" and "The oracle" sections before you dispatch.

The coordinator (this session) plans, dispatches and writes. A role sub-agent only browses and
reports text.

## Before

1. Check the SSO session: `aws --profile diya-submit-ci sts get-caller-identity`. If it fails,
   ask the operator to run `aws sso login --sso-session diyaccounting`, then stop.
2. Install the browser once per machine:
   `npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing`.
3. Enable native auth, mint the state files, disable native auth, in one Bash call so the disable
   cannot be skipped:
   ```bash
   export AWS_PROFILE=diya-submit-ci; npm run test:enableCognitoNative && node scripts/mint-exploratory-state.mjs; npm run test:disableCognitoNative
   ```
   If `enableCognitoNative` says the credentials already exist, run the disable first.
4. Approve the `playwright` server once in `/mcp` (it is in `.mcp.json`). After the state file
   changes, a role's first call is `browser_close`, so the next `browser_navigate` starts a
   fresh context from the new file.
5. Read the newest weekly crawl report (`target/exploratory-crawl/` or the `test.yml` artifact)
   and keep its flags as start pages.
6. Check each oracle path with `find` and `grep`; write the paths into the briefs as they are.
7. Create the date folder
   `../private.diyaccounting.co.uk/engineering/submit/reviews/exploratory-<date>/` with one
   folder per role.

## Dispatch

One Opus sub-agent per role, in the background, one at a time, because every sub-agent of one
session shares the MCP server's one browser. Order: visitor, customer, practice, operator. Each
later brief lists the earlier roles' findings and says not to report them again.

| Role | State file | Pages and journeys |
| --- | --- | --- |
| Visitor | `.cache/playwright-mcp/visitor-state.json` (signed out) | root, product, help, guide, legal and video pages; the sign-in prompts; the signed-out panels |
| Customer | `.cache/playwright-mcp/ci-state.json` | the VAT, Income Tax, Companies House and Corporation Tax journeys as the guide lists them; receipts and submission records; bundles, passes, usage; the books card and the diya-gl pages |
| Practice | `.cache/playwright-mcp/ci-state.json` | `practice.html`, the client list, the codes link, the batch filing harness (`mcp-harness.html`) where the server serves its call endpoint |
| Operator | `.cache/playwright-mcp/ci-state.json` | `operator/dashboard.html` and the developer-mode overlay once, to check it stays out of the way |

The visitor pass starts the browser from the empty state: change the server's `--storage-state`
argument to the visitor file for that pass only, or sign out in a fresh context by clearing
cookies and storage with `browser_evaluate`. Restore `.mcp.json` before you commit.

The lane is ci: the host `https://ci-submit.diyaccounting.co.uk/submit.env` names (today
`https://ci-set1.submit.diyaccounting.co.uk/`). On ci, forms may be submitted against HMRC's
sandbox, the Companies House test service and Stripe test mode. Prod is the visitor pass only:
no sign-in, no form submitted.

Each brief is self-contained and holds:

- the lane and its URL, the role and its state file;
- the start pages, the crawl's flags first;
- the journeys to walk, taken from the guide section for the role (`web/public/guide.page.js`);
- the tool list, loaded in one `ToolSearch` call: `browser_navigate`, `browser_snapshot` (the
  default read), `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`,
  `browser_press_key`, `browser_take_screenshot`, `browser_resize` (390x844 for the phone pass,
  1280x800 back), `browser_evaluate` (scroll width, `elementFromPoint`, `matchMedia` for the
  theme), `browser_file_upload` (files under `.cache/playwright-mcp/`), `browser_close`;
- the screenshot naming (below), the start step and the end step;
- the rules of a pass (below) and the finding shape (below);
- the oracle paths, checked;
- "no Agent tool, no git, no other edits";
- the report-back contract: the findings as text under a heading, then the URLs visited and the
  tool-call and screenshot counts. The coordinator writes the role's `FINDINGS.md`, because the
  harness refuses a sub-agent's write of a findings file.

## Rules of a pass

- Every finding carries the URL, the role, the viewport, the theme, the numbered steps from the
  sign-in, what was seen in one sentence, a screenshot path, the oracle row it was judged
  against (or "reader's judgement"), and one verdict: bug, omission, formatting or question.
  No finding without a screenshot.
- The budget is 200 tool calls and 40 screenshots per pass, plus the list of URLs visited, so a
  pager or a poll cannot loop the agent. The agent stops at the budget and says so.
- The pass never signs out through the site's sign-out link, because the shared browser state
  would lose the session. It ends with `browser_close`.
- A control that changes data (file, submit, pay, redeem, delete, revoke, cancel) is used only
  when the journey under test needs it, and then on a record the pass created in that lane.
- Developer mode stays off except in the operator pass. A finding that shows only with it on is
  recorded as such.
- Screenshot names:
  `../private.diyaccounting.co.uk/engineering/submit/reviews/exploratory-<date>/<role>/<viewport>-<theme>-<nn>-<slug>.png`.
  The review and its screenshots stay in the private repository because they show the test
  user's data and the site's unfinished parts.
- Two viewports: 1280x800 and 390x844. A user must finish each journey at 390x844 without
  sideways scrolling.

## After

1. A Sonnet verification sub-agent opens each finding's screenshot beside its oracle row, gives
   a verdict, and traces the cause to a file and line.
2. Write `../private.diyaccounting.co.uk/engineering/submit/reviews/REVIEW_EXPLORATORY_<date>.md`
   with the sections Scope, Findings (grouped by cause), Decisions and data (no row), Not
   completed, Proposed rows (the board's row shape: label, title, plan, what is wrong at which
   URL, role, viewport and theme, what the oracle says, the fix, the proof, size, model).
3. Commit the review and the screenshots in the private repository. Push nothing without the
   operator's word.
4. Disable native auth if a step left it on: `npm run test:disableCognitoNative`.
5. List the proposed rows for the operator. Board nothing: the operator picks.

## Models

- The role passes: Opus, because the judgement is the point.
- The verification pass: Sonnet.
- The fixes the operator picks: ordinary board rows, Sonnet or Haiku by size.
