---
name: campaign
description: Spend a bounded block of time (default one hour) campaigning for one stated goal for DIY Accounting Submit: read the figures against the goal and its stop rule, scan the week's newsletters and threads, shortlist five questions worth answering, draft an answer to each in the referrer's voice with its link and the place's rules, put them in a review queue for a person to post, make one improvement to our own pages as a PR, and report in three lines. Posts nothing to any third-party site and spends nothing. Invoke when the operator says "campaign", "spend an hour campaigning for <goal>", or names a campaign goal.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-57 Run a time-boxed marketing campaign session
- **Use when:** the operator asks Claude to spend a block of time campaigning for a goal, such as paid subscribers from Matthew's family pass.
- **Does:** campaign reads the goal's figures and stop rule, in the first session of a month reads search, AI referral, AI fetch, listing and assistant-answer figures for every site into one private table, scans newsletters and community threads, shortlists five questions, drafts answers into a review queue for a person to post, makes one improvement to the site as a PR, and reports in three lines. It posts nothing to third-party sites and spends nothing.
- **Run:** `/campaign <goal>`
- **Entry:** `.claude/skills/campaign/SKILL.md`
- **Files:** .claude/skills/campaign/SKILL.md
- **Keywords:** campaign, marketing session, referral pass, forum answers, review queue, family affiliate, newsletters, stop rule
- **Related:** DEV-45, DEV-30
@end-capability -->

# campaign

**SSO check.** Before the first AWS call, and before any request that the operator log in, run
`aws --profile diya-submit-ci sts get-caller-identity` and `aws --profile diya-submit-prod sts
get-caller-identity` in the same turn. Ask for `aws sso login --sso-session diyaccounting` only when
one fails, and name the profile and the error. Never ask for a login from memory.

`/campaign <goal> [minutes]`. One session, one goal, one review queue, one PR, one report. The
default is 60 minutes. The goal names the outcome and the pass it counts through, for example
"paid VAT subscribers through Matthew's pass `tiger-happy-mountain-silver`".

The brief this skill serves is https://claude.ai/artifact/UF5hGUYVDZJuSkjYuL5gDo (a private copy is
`../private.diyaccounting.co.uk/strategy/marketing/MATTHEW_BRIEF_2026-11-03.html`, and its review is
`MATTHEW_BRIEF_REVIEW_2026-11-03.md` beside it). Read the brief at the start of every session. Its
audience, pass mechanics, earnings, traps and stop rule are the rules of this skill.

## What this skill never does

Each of these is a decision, made for a reason. They are not limits of what can be built.

- **It never posts, comments, votes or messages on a site we do not own.** Reddit, Facebook groups
  and forums ban automated posting. A post written by Claude and sent as a person is that person's
  speech, so the person sends it. An AI that posts as Matthew misstates who is speaking, which
  risks breaching the DMCC Act 2024 (fake reviews) and the CAP Code (ad disclosure). It also gets
  accounts and the domain banned, and the cost lands on DIY Accounting Limited.
- **It never sends email.** The operator sends his own email, and matthew@ is the operator's
  account. Email to people who have not opted in is marketing under PECR, and a sole trader counts
  as an individual.
- **It never spends money.** It buys no ads, boosts, tools, followers or printing. A referral earns
  77p to £9.80, so no spend pays back.
- **It never promises what prod does not offer.** Read the availability table
  (`AVAILABILITY` in `scripts/build-mtd-calendar.mjs`, and
  https://submit.diyaccounting.co.uk/mtd-calendar.html) at the start. A feature in sandbox or
  preview is not mentioned as available.
- **It never writes "I use it".** Every draft says "my family runs DIY Accounting" (or "I work on
  it", when the operator is the poster) and starts with "#ad".

## The session

Note the start time. Each step has a share of the time box. When the box ends, stop at the end of
the current step and write the report with what was done.

### 1. The figures against the goal (10%)

- Pass uses: `getPassesByIssuer` reads them (`app/data/dynamoDbPassRepository.js`). The operator's
  "My generated passes" on https://submit.diyaccounting.co.uk/bundles.html shows the same Uses.
  Read prod items with a `Query` or `GetItem` by key; never `Scan` a customer table.
- Subscribers and earnings through the pass: the commission ledger
  (`app/services/commissionLedger.js`, its lines carry the referrer and the referral code). Read by
  key or through the activity lake (workgroup `prod-env-analytics`, database `prod_env_analytics`;
  `dt` is a DATE, so filter with `DATE '<day>'`). State the bytes scanned.
- The acquisition source: the view `v_campaign_channels_daily` joins the session beacon's `ref`
  and `utm_*` values (marketing plan M1 and M2,
  `../private.diyaccounting.co.uk/strategy/PLAN_MARKETING_STRATEGY.md` section 2) to pass uses,
  subscribers and commission pence, one row per day, utm source, medium, campaign and ref. Query it
  in the lake (workgroup `prod-env-analytics`) for the last 30 days and report per place, not per
  pass. Sessions come only from visits that gave consent, and a use or subscriber whose account
  has no sourced bundle record reports the pass code as `ref`.
- Judge them against the brief's stop rule. Fewer than 10 Uses in six weeks means change the
  place. Ten or more Uses with no subscriber means fix the landing page before more posting, so
  this session's step 4 picks MKT1 or MKT2.
- A count under 3 is shown as "fewer than 3", as the pass figures do. No email, name or hash of a
  customer goes into the queue, the report or a commit.

### Monthly organic read

Run it in the first session of each calendar month, when `../private.diyaccounting.co.uk/strategy/marketing/ORGANIC_<yyyy-mm>.md` for the month just ended does not exist. It reads search and AI traffic for every site. It posts nothing and spends nothing. Its time comes from this step.

The month is the last full calendar month. Name it `<yyyy-mm>`. Run every command from the repository root with the SSO check above done first.

**Two floors to state in the file.** GA4 counts only visitors who accept the cookie banner, about 13% of visits, so every `sessions` figure is a floor. An agent's name in a user agent is not proof of who fetched; `verified` is true only when the address is inside the ranges the vendor publishes (`infra/analytics/ai-vendor-ranges.json`).

**A. Athena queries (prod).** Set the profile, workgroup and database once, run one query at a time, and write each result into the table.

```bash
P=diya-submit-prod; W=prod-env-analytics; D=prod_env_analytics
M="day >= date_trunc('month', current_date - interval '1' month) AND day < date_trunc('month', current_date)"
run() {
  QID=$(aws --profile $P athena start-query-execution --work-group $W --query-execution-context "Database=$D" --query-string "$1" --query QueryExecutionId --output text)
  while :; do
    ST=$(aws --profile $P athena get-query-execution --query-execution-id $QID --query 'QueryExecution.Status.State' --output text)
    case $ST in SUCCEEDED|FAILED|CANCELLED) break;; esac; sleep 3
  done
  echo "$ST"
  aws --profile $P athena get-query-execution --query-execution-id $QID --query 'QueryExecution.[Status.StateChangeReason,Statistics.DataScannedInBytes]' --output text
  aws --profile $P athena get-query-results --query-execution-id $QID --query 'ResultSet.Rows[*].Data[*].VarCharValue' --output text
}
```

1. Search Console by page family (`v_search_console_pages_daily`). Rows are host and family; `avg_position` weights by impressions.

   ```bash
   run "SELECT host, family, sum(clicks) AS clicks, sum(impressions) AS impressions, round(sum(position * impressions) / nullif(sum(impressions), 0), 1) AS avg_position FROM v_search_console_pages_daily WHERE $M GROUP BY host, family ORDER BY clicks DESC, impressions DESC"
   ```

2. Referral sessions from assistants, search engines and gov.uk (`v_ai_referrals_daily`).

   ```bash
   run "SELECT kind, referrer, host, sum(sessions) AS sessions, sum(engaged_sessions) AS engaged_sessions FROM v_ai_referrals_daily WHERE $M GROUP BY kind, referrer, host ORDER BY kind, sessions DESC"
   ```

3. Agent fetches of Submit's own pages by agent and verified flag (`v_ai_fetches_daily`).

   ```bash
   run "SELECT agent, verified, sum(requests) AS requests FROM v_ai_fetches_daily WHERE $M GROUP BY agent, verified ORDER BY requests DESC"
   ```

4. The 20 paths that verified agents fetched most.

   ```bash
   run "SELECT agent, path, sum(requests) AS requests FROM v_ai_fetches_daily WHERE $M AND verified GROUP BY agent, path ORDER BY requests DESC LIMIT 20"
   ```

The function prints the state, then the failure reason (`None` on success) and the bytes scanned, then the result as a header line followed by one tab-separated line per row. State the bytes scanned per query in the file. A `FAILED` state stops the read: report the reason in the file and do not fill that row from memory.

**B. Logs Insights on the other three sites.** Their CloudFront access logs hold the same agent strings as `v_ai_fetches_daily` (the list is in `infra/main/resources/analytics/views/v_ai_fetches_daily.sql`; `claude-code` and `other` are left out). Each site is in its own account, in `us-east-1`:

| Site | Profile | Log group |
| --- | --- | --- |
| spreadsheets.diyaccounting.co.uk | `diya-spreadsheets` | `distribution-prod-spreadsheets-logs` |
| diya-gl.co.uk | `diya-spreadsheets` | `distribution-prod-diya-gl-logs` |
| www.diyaccounting.co.uk | `diya-gateway` | `distribution-prod-gateway-logs` |

```bash
START=$(date -v-1m -v1d -v0H -v0M -v0S -u +%s); END=$(date -v1d -v0H -v0M -v0S -u +%s)
LQ='filter `cs(User-Agent)` like /(?i)(oai-searchbot|chatgpt-user|gptbot|claude-searchbot|claude-user|claudebot|perplexitybot|perplexity-user|bingbot|googlebot)/
| parse `cs(User-Agent)` /(?i)(?<agent>oai-searchbot|chatgpt-user|gptbot|claude-searchbot|claude-user|claudebot|perplexitybot|perplexity-user|bingbot|googlebot)/
| stats count(*) as requests by agent, `cs-uri-stem`
| sort requests desc
| limit 50'
logs_query() {  # $1 profile, $2 log group
  QID=$(aws --profile $1 logs start-query --region us-east-1 --log-group-names $2 --start-time $START --end-time $END --query-string "$LQ" --query queryId --output text)
  while :; do
    ST=$(aws --profile $1 logs get-query-results --region us-east-1 --query-id $QID --query status --output text)
    case $ST in Complete|Failed|Cancelled|Timeout) break;; esac; sleep 3
  done
  echo "$ST"
  aws --profile $1 logs get-query-results --region us-east-1 --query-id $QID --query '[statistics.bytesScanned, results[*][*].value]' --output text
}
logs_query diya-spreadsheets distribution-prod-spreadsheets-logs
logs_query diya-spreadsheets distribution-prod-diya-gl-logs
logs_query diya-gateway distribution-prod-gateway-logs
```

The gateway's group is about 8 GB and a month scans about 1.6 GB, so run each query once. The output is the bytes scanned, then one tab-separated line per row: agent, path, requests. These logs hold no `verified` flag, so state that every figure is by name only.

**C. Listings.** Run `node scripts/listings-check.mjs`. Record its last line, or each problem it prints. Then open each `[[listing]]` of `web/marketing/marketing.toml` whose `state` is `live` and whose `url` is not empty, in Chrome (`mcp__claude-in-chrome__*`, read-only), and record: the page loads, the name, price and description match `priceText` and the copy pack, and any new review or rating.

**D. Search engine reports, in Chrome, read-only.**

- Bing Webmaster Tools, https://www.bing.com/webmasters, AI Performance report. Read it for each of the four sites it holds: `www.diyaccounting.co.uk` (the apex is filed under it), `submit.diyaccounting.co.uk`, `spreadsheets.diyaccounting.co.uk` and `diya-gl.co.uk`. Record citations and cited pages for the month.
- Search Console, https://search.google.com/search-console, generative AI report, for each domain property. Record what it shows for the month. When the report is absent for a property, record "report not shown".

Click nothing that changes a setting, a sitemap or a verification.

**E. The 20 questions.** Ask each question exactly as written, in a new conversation, in each of ChatGPT, Claude, Gemini, Perplexity and Copilot (100 answers). Read-only: sign in as the operator's browser already is, and submit nothing but the question. Record per answer: whether "DIY Accounting" (any of its sites) is named, and every source domain the answer cites. A question and its wording stay fixed from month to month so the months compare.

| Family | Questions |
| --- | --- |
| VAT bridging from a spreadsheet | Q1 What is the cheapest way to submit a VAT return to HMRC from a spreadsheet? Q2 Is there free MTD bridging software for VAT? Q3 How do I submit my VAT return from Excel under Making Tax Digital? Q4 Which MTD VAT bridging software costs under 20 pounds a year? |
| Free bookkeeping spreadsheets | Q5 Is there a free bookkeeping spreadsheet for a taxi driver? Q6 Where can I get an Excel bookkeeping template for a small business? Q7 What accounting spreadsheet works for a sole trader without accounting software? |
| Confirmation statement | Q8 How do I file a confirmation statement online, and what does it cost? Q9 Can I file a confirmation statement with software other than Companies House's own service? |
| Micro-entity, small and dormant accounts | Q10 How do I file dormant company accounts myself? Q11 What is the cheapest software to file micro-entity accounts at Companies House? Q12 Can I file small company accounts without an accountant? |
| MTD Income Tax with spreadsheets | Q13 Is there free MTD Income Tax software for landlords that works with spreadsheets? Q14 Am I affected by MTD for Income Tax in April 2027? Q15 How do I send quarterly updates to HMRC from a spreadsheet? |
| Low-cost multi-client filing for practices | Q16 What MTD VAT bridging software suits a small accountancy practice with many clients? |
| CT600 after HMRC's free service | Q17 What software replaces HMRC's free Company Tax Return service? Q18 Can I file a CT600 without an accountant? |
| Assistant phrasings | Q19 Can ChatGPT or Claude file my VAT return with HMRC? Q20 Is there an HMRC MCP server I can connect to an AI assistant? |

**F. The output file.** Write `../private.diyaccounting.co.uk/strategy/marketing/ORGANIC_<yyyy-mm>.md` (the private repository; never this one). It holds one table, a row per figure and a row per answer, and no customer data. Columns:

| Column | Holds |
| --- | --- |
| Group | `search`, `referral`, `fetch`, `logs`, `listing`, `bing`, `gsc-ai` or `answer` |
| Item | the host and family, the referrer, the agent and path, the listing id, or `Q<n> <assistant>` |
| This month | the figure; for an answer, `named: yes` or `named: no`, then the cited source domains |
| Last month | the same cell from the previous `ORGANIC_<yyyy-mm>.md`, or `first read` |
| Evidence | the query label (`A1`, `B2`), the report name, or the answer's conversation date |

Above the table, write one line each for the two floors, the bytes scanned per query, and any query that failed. Commit the file in the private repository on `main`.

### 2. Scan for questions (25%)

- Newsletters: the "Reading" label on matthew@diyaccounting.co.uk, through the Gmail connector,
  read only (the brief's "What to subscribe to" list). Note each change our audience will ask about
  this week: a VAT, MTD or Companies House rule, a deadline, a fee.
- Threads: `npm run campaign:threads -- --days 7 --out target/campaign-threads.json` reads the
  last seven days of questions from the UK Business Forums feed, read only. Read the output's
  `skipped` list: the forum's feed answers a browser challenge at times and is not retried. For
  Reddit, use WebSearch with `site:reddit.com/r/smallbusinessuk` and WebFetch on public pages.
  The question shape is "what cheap software sends my VAT return from a spreadsheet", and its
  relatives: bridging software, MTD for VAT without accounting software, filing accounts or a
  confirmation statement without an accountant. Read `--fixture scripts/fixtures/campaign-threads`
  to see the output shape.
- Skip AccountingWEB and the HMRC community forums for posting (their rules remove
  self-promotion). Read them for what owners ask.
- Skip a thread where the asker needs advice an accountant gives, is not VAT-registered, or asks
  about Income Tax or the CT600 while those are not live.

### 3. Shortlist five and draft (35%)

For each of five threads, in the order most likely to convert (a deadline close, a VAT-registered
asker, a spreadsheet user):

- the thread URL, the place, its date, and one line on what the asker needs;
- the place's rules on links and self-promotion, read from the place's own rules page this session,
  with that page's URL. When the rules forbid a referral link, the draft links the help item that
  answers the question (`https://submit.diyaccounting.co.uk/help.html#<faq-id>` or
  `guide.html#<step-id>`) and no pass;
- the draft: it starts with "#ad", answers the question in the first two sentences whether or not
  the asker uses Submit, says "my family runs DIY Accounting", names the price (99p a month or
  £9.99 a year), and ends with the pass link
  `https://submit.diyaccounting.co.uk/bundles.html?pass=<code>` when the rules allow it. Plain
  sentences in the poster's voice, under 120 words. Take the ready-made wording from
  https://marketing.diyaccounting.co.uk/ where it fits (it builds #ad posts from a pass code);
- a draft reply for the most likely follow-up question.

Write the five into the review queue (below). Never post them.

### 4. One improvement on our own pages (20%)

Pick the one open board row the figures point at, from `NEXT.md`: MKT1 (link preview) or MKT2
(signed-out offer and price) when Uses come without subscribers; MKT6 (video wording) before any
draft links a video; MKT7 (help page previews) when drafts link help items; COM25 when yearly sales
appear. Build it on a `claude/campaign-<topic>` branch through the repository's normal gates
(`scripts/batch-check.sh`, the PR, `/auto-merge`), or, when it is larger than the time left,
refine its row so the next session or `/iterate` can build it. Never change prices, terms or
referral rates in this step: those are the operator's decisions.

### 5. Report (10%)

Three lines, in the chat and appended to the queue's log:

1. What was done: N drafts queued (places), the PR or the row refined, the figures read.
2. What it should move: the number, and by when (a deadline date).
3. What to watch: the figure that decides the next session, against the stop rule.

Then one line for the human step: "The queue has N drafts to post: <queue URL>".

## The review queue

One private artifact, kept across sessions: https://claude.ai/artifact/FdKLWPhouk8swyX6z6Lt2G. A
session writes rows with `ArtifactData` and does not republish the page. Document ids are free
(`<date>-<n>`). Every field is a string unless noted, and a link must start with http or https.

- Collection `drafts`, one document per draft: `session`, `place`, `threadUrl`, `threadDate`,
  `need`, `rulesNote`, `rulesUrl`, `draft`, `followUp` (optional), `queuedAt`, `posted` (boolean,
  `false` on write), `postedDate` (`""` on write).
- Collection `sessions`, one document per session: `date`, `goal`, `minutes` (number, optional),
  `line1`, `line2`, `line3`, `prUrl` (optional), `pr` (optional, shown when `prUrl` is absent).

- One card per draft: the place, the thread link (Open), the rules note, the draft (Copy), the
  follow-up reply (Copy), and a "Posted" tick with the date, stored in the artifact's database so
  the next session reads what actually went out.
- A session log at the bottom: each session's date, goal, three-line report and the PR.
- Write the session's drafts with `ArtifactData` batch writes; read the Posted ticks back at the
  start of step 1, and count only ticked drafts as campaign activity.
- The queue holds no customer data. It is shared only with the people who post (the operator and
  Matthew), from its Share menu.

## The human step

The operator or Matthew opens the queue, reads each draft, edits it in their own words when it
does not sound like them, opens the thread, pastes, posts, and ticks Posted. About ten minutes for
five drafts. Replies that come back are answered by the same person; the skill can draft a reply
when the operator pastes the reply into the chat.

## Prerequisites

- OMAT1 done: the poster's account is on the family list, holds Resident Pro, is approved as a
  Family affiliate, and has a digital pass; the Gmail filter labels newsletters "Reading".
- COM25 on prod before any draft or brief states 25% of an annual purchase.
- An SSO session for the ledger and lake reads (`aws sso login --sso-session diyaccounting`).
