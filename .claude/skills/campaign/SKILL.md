---
name: campaign
description: Spend a bounded block of time (default one hour) campaigning for one stated goal for DIY Accounting Submit: read the figures against the goal and its stop rule, scan the week's newsletters and threads, shortlist five questions worth answering, draft an answer to each in the referrer's voice with its link and the place's rules, put them in a review queue for a person to post, make one improvement to our own pages as a PR, and report in three lines. Posts nothing to any third-party site and spends nothing. Invoke when the operator says "campaign", "spend an hour campaigning for <goal>", or names a campaign goal.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-57 Run a time-boxed marketing campaign session
- **Use when:** the operator asks Claude to spend a block of time campaigning for a goal, such as paid subscribers from Matthew's family pass.
- **Does:** campaign reads the goal's figures and stop rule, scans newsletters and community threads, shortlists five questions, drafts answers into a review queue for a person to post, makes one improvement to the site as a PR, and reports in three lines. It posts nothing to third-party sites and spends nothing.
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

### 2. Scan for questions (25%)

- Newsletters: the "Reading" label on matthew@diyaccounting.co.uk, through the Gmail connector,
  read only (the brief's "What to subscribe to" list). Note each change our audience will ask about
  this week: a VAT, MTD or Companies House rule, a deadline, a fee.
- Threads: `npm run campaign:threads -- --days 7 --out target/campaign-threads.json` reads the
  last seven days of questions from the subreddits (default `smallbusinessuk`; `--subreddits a,b`
  adds more) and from the UK Business Forums feed, read only. It needs the Reddit app's client id
  and secret in the Secrets Manager secret `prod/submit/reddit-campaign-app` (JSON
  `{"clientId","clientSecret"}`, read through `AWS_PROFILE=diya-submit-prod`); without it the script
  stops with a message naming the secret. Then read the output's `skipped` list: a source named
  there was not read (the forum's feed answers a browser challenge at times and is not retried).
  The question shape is "what cheap software sends my VAT return from a spreadsheet", and its
  relatives: bridging software, MTD for VAT without accounting software, filing accounts or a
  confirmation statement without an accountant (the script's default queries). While the secret is
  absent (board row OCAMP2), use WebSearch with `site:reddit.com/r/smallbusinessuk` and
  WebFetch on public pages, and say the coverage is partial. Read `--fixture
  scripts/fixtures/campaign-threads` to see the output shape with no credentials.
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
