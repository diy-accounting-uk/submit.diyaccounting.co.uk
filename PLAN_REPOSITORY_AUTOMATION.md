<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Automate the repository

Status: **design, drafted 2026-09-09.** No code written, no workflow added.

## What the operator asked for

> I want to go 100% automated in terms of the repositories, I want ops, support, revenue
> optimisation, dev, everything that goes through github, as and when these functions can be
> automated such that I can provide direction (operator requests) and governance (agent
> policies) and expect these to be carried out.

That is the aim `STRATEGY.md` already opens with: the operator's time goes to direction and the
few judgement calls that need a person. This plan is the scope baseline. It covers the whole
GitHub and AWS surface, plus the outside surfaces the operator named: social posting, comment
replies, screenshots and video.

The scope is everything. The ranking says what to do first.

## 1. The governance model

Two inputs from the operator, and nothing else.

**Direction** is a request for an outcome. "Ship the ITSA property endpoints." "Cut the alarms
that fire for nothing." "Get the videos on the channel." Direction arrives as a `NEXT.md` row, a
GitHub issue, or a sentence in a session. It says what, not how, and it applies to one piece of
work.

**Policy** is a standing rule that holds for every piece of work until the operator changes it.
"Only a human closes a human-raised ticket." "Never spend past this line." Policy is not
work-specific and does not expire. It lives here and in `CLAUDE.md`, and an agent checks it
before acting rather than after.

Everything between a direction and a policy is what an agent does unaided. The measure of this
plan is how little else the operator has to supply.

### The standing policies

Written so an agent can check each one before it acts. Each names how it is checked and what
happens when the check cannot be made.

**P1. A human-raised ticket may be machine-processed. Only a human closes it.**
An agent may label it, triage it, comment on it, open a PR against it and link that PR to it. The
close is the human's.

*How "human-raised" is determined.* By the API-recorded author, once the machine paths have their
own identity. Today they do not. The alarm-to-issue Lambda posts with a personal access token
belonging to `antonycc`, so every `[ALARM]` issue is recorded as authored by the operator and is
indistinguishable from one he typed. Phase 1 fixes that. Until it lands, everything classifies as
human-raised and no agent closes anything.

*When the classification is wrong or ambiguous.* Ambiguity resolves to human-raised. An agent
that cannot prove machine origin does not close. A wrong close is reversible and a reopen is the
remedy, but the rule that matters is that it never closes on a guess.

**P2. Auto-merge is permitted when every commit on the PR is the repository owner's and the
checks are green.**
This is how the sessions already work. The agent commits under the operator's identity with a
`Co-Authored-By` trailer, and the operator merges by hand afterwards. P2 removes the last step.

*What "every commit" is checked against.* `GET /repos/{owner}/{repo}/pulls/{n}/commits`, and for
each commit: GitHub's resolved `author.login` and `committer.login` both equal the owner, and
`commit.verification.verified` is true. The verified flag is what makes this a check rather than
a formality. Commits here are unsigned today (`verification.reason: "unsigned"`), so the author
field is a self-asserted string in the commit object that anyone able to push can set. Signing
comes first, or P2 proves only that the pusher held a token.

*What happens when a fork or another contributor adds a commit.* The PR leaves the rule and does
not come back. The check re-runs on every `synchronize` event, so a commit pushed after auto-merge
is queued re-opens the question. A PR whose head is a fork never qualifies, because a fork carries
its own workflow files.

*What the existing trailers do and do not prove.* `Co-Authored-By: Claude Opus 5 (1M context)`
and `Claude-Session: <url>` record that a Claude Code session produced the commit and give an
audit breadcrumb back to that session. They do not prove a model wrote the code rather than a
person, they do not identify which sub-agent, and they are free text in a message anyone can
copy. They are a reading aid. P2 must not read them.

**P3. Auto-merge is also permitted for a PR that closes an issue opened by an AWS prod alarm.**
That issue has no human author to satisfy, so P2's test cannot apply to it.

*How the alarm origin is proven.* Today it is claimed, not proven. The Lambda writes the title
`[ALARM] <alarm family>`, the labels `alarm` and `ops`, and the footer *"Raised automatically by
the alarm-to-issue pipeline."* Every one of those is plain text any collaborator with issue-write
can type. The author field is real and unforgeable, but it is the operator's own account, so it
separates nothing.

Three rungs, strongest last:

1. **Give the pipeline its own identity.** A GitHub App installation token, so the author is a
   bot with a fixed app slug and the credential cannot be lifted out of a run the way a PAT can.
   A dedicated machine account is the cheaper, weaker version: its PAT sits copyable in a GitHub
   Actions secret and in Secrets Manager at `{env}/submit/github/issue_bot_token`.
2. **Sign the body.** An HMAC over the alarm name, state, timestamp, region and deployment, keyed
   from a secret readable only by the Lambda's role and the verifying workflow's role, written as
   a trailer. Better than a footer sentence, and only as strong as the key stays.
3. **Re-read the source of truth.** The verifying workflow calls
   `cloudwatch describe-alarm-history` for the alarm name and window the issue body names, and
   confirms an OK-to-ALARM transition actually happened in that window. This depends on no secret
   staying secret, which is why it is the strongest.

Recommendation: rung 1 and rung 3 together, and skip rung 2.

*This is the path most worth attacking.* It is the only rule in the design that merges code with
no human anywhere in the loop. Anyone who can open an issue that looks like an alarm, and a PR
that closes it, gets a merge. The proof carries more weight here than anywhere else, so build it
to be attacked rather than to look tidy.

**P4. Never auto-merge a PR tied to an issue raised by another GitHub user.**
Issue #20 (`ITSA+MTD Add-on`, from `JDMs4`) is the live example. External issues are welcome
input and are machine-triaged like any other. They never authorise a merge, and by P1 the
operator closes them. This is a decision, stated as one.

**P5. Every spend surface an agent can reach has a cap the platform enforces, not the agent.**
The pattern is already built for one surface. `ObservabilityUE1Stack.java` puts a $150/month
Bedrock budget with an `APPLY_IAM_POLICY` deny action at 100%, plus a $5/day notify-only budget,
both reaching the operator through SNS and Telegram. The agent does not decide to stop; IAM stops
it. Generalise the shape: a budget action for AWS spend, a restricted key with its own limit for
Stripe, a daily cap set in the account for Ads. Below the cap the agent acts freely. At the cap
the platform stops it and the operator hears. The numbers are Q5.

**P6. No agent files to HMRC or Companies House.**
A filing on a real register is irreversible and is somebody's legal record. Customer filings are
the customer's own action through the product, which is what the product is for. The company's
own filings are prepared automatically and pressed by the operator. This is a safety decision.

**P7. Customer data is read through a named path and never reaches a public surface.**
An agent reads customer data only through a documented read-only path with a scoped role. The
`vat-submission-failure-alarm-user-lookup` skill is the pattern, and it never scans a customer
table. Anything an agent writes to a public surface passes the two-layer filter
`alarm-triage.yml` already runs: `scripts/redact-triage-output.mjs`'s deny-list (IPv4/v6, email,
EORI, 64-hex hash, VRN, UTR, NINO, PAYE reference, JWT, AWS access key, bearer token), then a
Bedrock guardrail on ANONYMIZE. That filter is one workflow's private step today. It becomes
shared infrastructure.

This repository is public, so a GitHub issue comment is a public surface.

**P8. Nothing goes out under the company's name that the operator has not seen, until the
acceptance rate says otherwise.**
The first post to any surface is approved by hand. After that, a post assembled from a template
with a named content source may go automatically. A composed post, or a reply in a human voice,
stays a draft until measured. The measurement is the share of drafts the operator accepted
unedited. Details are Q7 and Q8.

**P9. When policy is silent, do the reversible half and ask.**
The agent prepares the change, opens the draft, writes the comment as a draft, then raises the
question on the issue labelled `policy:question` and proposes the missing policy. It does not
choose on the operator's behalf. It also does not stop dead: an idle agent costs as much as a
wrong one, and the reversible half survives either answer.

**P10. Automation stays inside the shapes GitHub's abuse heuristics accept.**
This is not hypothetical. `_developers/archive/PLAN_FLAGGED.md` records the flagging of two of the
operator's orgs on 2026-05-03 and the full suspension of `@antonycc` on 2026-05-06. The
high-confidence signals it lists are the exact output of naive auto-merge: 17 seconds from open
to merge, an empty PR body, zero reviewers, a self-merge, 283 files in one PR, a deletion-heavy
diff, two different author emails on one account, and a non-canonical Claude co-author trailer.
Near-recursive scheduled Actions are listed as a lower-confidence contributor.

Two of those signals are live in this repository right now. The commit author email is
`antonyccartwright@gmail.com` while the operator's working identity is `antony@polycode.co.uk`,
and the trailer this session writes is the non-canonical `Co-Authored-By: Claude Opus 5 (1M
context)` form.

So auto-merge carries shape rules of its own: a minimum delay between opening and merging, a
non-empty PR body naming what changed and what proves it, a bounded diff size above which a human
reviews regardless of the checks, one author email, and a cap on merges per day. `keepalive.yml`
already shows the schedule discipline this needs, spreading crons off the top of the hour. The
same discipline applies to agent runs: `alarm-triage.yml`'s three-runs-per-24-hours budget guard
is the existing example.

## 2. The three axes

Defined so two people ranking the same capability land in the same cell.

### Axis A: mechanism

Four tiers. Cost and fragility rise in the same direction.

| Tier | Mechanism | What bounds it |
|---|---|---|
| **A1** | Mechanical, platform native | GitHub's or AWS's own features. `Closes #N`, branch rulesets, required status checks, auto-merge, CODEOWNERS, issue forms, Dependabot, secret scanning, budget actions. They maintain it; we configure it. |
| **A2** | Mechanical, scripted | A workflow or a script with no model in the loop. Same inputs, same actions. We maintain the code, and it breaks when the world changes underneath it. |
| **A3** | LLM directed, scripted | A model decides; a script or tool acts. An API contract and a tool allow-list bound the action. `alarm-triage.yml` is the worked example: `--allowedTools "Read,Grep,Glob,Bash(aws logs:*),Bash(aws xray:*),Bash(aws cloudwatch describe-alarm-history:*),Bash(aws cloudwatch describe-alarms:*)"` against a read-only AWS role. |
| **A4** | LLM directed, remotely controlled | A model drives a browser or a console. No API contract bounds what it can reach. The only limits are the session's credentials and what the page offers. |

**A capability sits at the lowest tier that can carry it.** A1 beats A2 because we do not maintain
it. A2 beats A3 because it costs nothing per run and fails the same way twice. A3 beats A4
because an allow-list is a boundary and a browser session is not.

**Moving down a tier is progress worth naming.** A capability needs A4 today usually because a
surface has no API, or because nobody has yet seen enough runs to know its shape. Both change.
Where a row below sits at A3 or A4, it says what would move it down.

### Axis B: determinism, with reliability

| Band | Meaning |
|---|---|
| **B1** | Deterministic over the whole behaviour. Same inputs, same outputs, every run. |
| **B2** | Deterministic in part. A fixed, auditable spine with a judged step inside it, and the steps around that judgement constrain what it can do. |
| **B3** | Requires human or statistical inference across the behaviour. No single right answer to check against, only a distribution of acceptable ones. |

Reliability sits inside the band and is measured rather than asserted:

| Rank | Measured |
|---|---|
| **R1** | 99% or better over 100 runs or more |
| **R2** | 95% to 99% |
| **R3** | 80% to 95% |
| **R4** | Below 80%, or fewer than 20 runs, so: unmeasured |

**How reliability is measured here.** Three sources exist already and nobody assembles them.

- **Workflow run history.** `gh run list --json workflowName,conclusion`. The last 100 runs, read
  on 2026-09-09: `test` 11 of 11, CodeQL 9 of 9, `deploy` 7 of 9, `probe-test` 7 of 9, `deploy
  environment` 4 of 9, `sbom` 2 of 26, `destroy-ci` 0 of 2, `verify backups` 0 of 1. Small samples
  on a busy week, and they say so. They already sort the workflows into bands, and `sbom.yml`
  failing 24 of its last 26 runs is a finding rather than noise.
- **Alarm and issue history.** 55 `[ALARM]` issues exist, 50 closed and 5 open. A person closed
  every one of the 50. That number is the size of the prize for P1 and phase 3.
- **The behaviour suites.** `probe-test.yml` runs the full behaviour matrix against a live
  deployment every four hours (`57 */4 * * *`), roughly 180 runs a month per suite. Enough to rank
  any capability whose correctness a behaviour test can express.

A capability with no measurement is R4 by definition, and the first thing it needs is a way to be
counted. Building the count is cheap. Guessing the rank is how a false alarm gets trusted.

### Axis C: blast radius

What is affected when the capability does the wrong thing.

| Band | Reach |
|---|---|
| **C0** | A branch, a draft, a local artefact. Nothing outside a `claude/*` branch changes. |
| **C1** | CI only. The `submit-ci` account (367191799875), a ci deployment, ci test users, ci data. |
| **C2** | The deployed prod service. submit.diyaccounting.co.uk, the prod Lambdas, CloudFront, the origins. |
| **C3** | Customer data. The prod DynamoDB tables (bundles, passes, capacity, receipts, HMRC API requests), the diya-gl S3 books, the Cognito user pool. |
| **C4** | Money. Stripe live prices and subscriptions, AWS spend, Bedrock spend, Google Ads spend. |
| **C5** | A statutory filing. An HMRC VAT or ITSA submission, a Companies House filing. Irreversible, on somebody else's register. |
| **C6** | Publicly visible under the company's name. A social post, a public comment reply, a release note, a YouTube title or description, a GitHub issue comment in this public repository. |

The bands are not a severity ladder. C5 and C6 fail in different ways, and a C6 mistake is often
worse than a C3 one because it cannot be deleted from the people who read it.

**Blast radius decides governance load, independent of reliability.** A capability that has never
failed in 500 runs still gets a human gate at C5, because the question is not how often it is
wrong but what one wrong answer costs. Reliability decides whether to run something at all. Blast
radius decides what has to be true before it runs.

The hardest cell is A4 + B3 + C6: a model driving a browser, with no right answer to check
against, publishing under the company's name. Nothing sits there without the operator having said
so in as many words. The cheapest cell is A1 + B1 + C0, and everything that can move there should.

## 3. What is already running

The repository is a long way past a blank sheet, and some of it the operator may not have noticed
since it landed.

**36 workflows.** `deploy.yml` builds, tests, deploys ten app stacks, sets origins, runs about 25
web-test jobs, records DORA rows and destroys the previous deployment. `deploy-environment.yml`
does the same for fourteen environment stacks across two regions. `probe-test.yml` runs the whole
behaviour matrix against a live deployment every four hours. `destroy-ci.yml` and
`destroy-prod.yml` sweep leftover stacks every two hours.

**A model is already in the loop, on Bedrock, in production.** `alarm-triage.yml` fires on
`issues: [opened]`, installs Claude Code, and runs it against Bedrock with
`CLAUDE_CODE_USE_BEDROCK=1`, `eu.anthropic.claude-sonnet-4-5` and `eu.anthropic.claude-haiku-4-5`.
It reads logs, traces and alarm history through a read-only role, posts a triage comment, and
opens a draft PR when its answer contains a diff that applies cleanly. Every part of that is
governed: a three-runs-per-day budget guard, a tool allow-list, an IAM policy naming the exact
model ARNs, a regex deny-list on the output, a Bedrock guardrail, and a `$150`/month budget with
an automatic IAM deny at 100%. There is no Anthropic API key anywhere in the org. This is the
"claude-bedrock combo" the operator asked about, and it works.

**A second model path exists.** `security-review.yml` opens an OWASP-scoped issue and assigns it
to GitHub's Copilot coding agent to review and PR fixes. Its weekly cron is commented out, so it
only runs when dispatched by hand.

**`keepalive.yml` is load-bearing and easy to miss.** GitHub disables a scheduled workflow after
60 days of repository inactivity, silently. That happened here: the destroy sweep went dark from
2026-07-13 to 2026-08-24, six weeks of unnoticed CI cost. The workflow now re-enables every
workflow weekly, which resets the clock as a side effect, and separately checks that each
scheduled workflow actually fired within its own cadence, because a workflow can stay `active` and
still not fire on time. It fails when either check fails, which is the alert the July outage never
produced.

**The alarm chain is complete except for the close.** A prod CloudWatch alarm reaches EventBridge,
reaches `app/functions/ops/alarmToGithubIssue.js`, and becomes a GitHub issue keyed on the alarm
*family* rather than the deployment, so repeat firings comment on one rolling issue instead of
opening a new one. It honours an SSM silence key during deploys. It never closes an issue, by
design. The same events reach Telegram through `activityTelegramForwarder.js`.

**The cost pipeline runs nightly and nobody reads it yet.** A FOCUS 1.2 data export in the
management account writes Parquet to S3; a per-account Lambda copies it at 02:45 UTC into each
analytics lake; a Glue table and three SQL views (`v_cost_daily`,
`v_cost_per_submission_daily`, `v_cost_vs_target_monthly`) turn it into daily spend by service and
stack, cost per completed submission, and monthly spend against the $64.77 target.

**Monthly backup and restore proof.** `verify-backups.yml` daily, `restore-test.yml` and
`restore-drill.yml` monthly, the latter restoring prod tables from the cross-account vault into ci
and deleting them again.

**agentic-lib is not part of this.** It is `@polycode-public/agentic-lib` 8.2.0, published under
the operator's own `xn-intenton-z2a` org, described as a thin wrapper over `claude -p` plus
Bedrock that runs one transformation per trigger and opens a draft PR. None of the five DIY
Accounting repositories depend on it. The only traces here are a licence comment in
`scripts/update.sh` and an AWS session name in `_developers/SETUP.md`. The `release-and-init`
slash command that drives it points at `~/projects/xn--intenton-z2a/`, which no longer exists on
disk. Its ideas are relevant; its code is not wired in. `xn-intenton-z2a` is also one of the two
orgs flagged in the May incident P10 describes, which is worth weighing before adopting anything
from it wholesale.

**Six of the eight skills are already A3 automations with a human trigger.** Turning each into an
event-triggered one is a small change, and each names the event it would need.

| Skill | What it does | Event that would fire it |
|---|---|---|
| `stripe-catalogue-sync` | Reads `submit.catalogue.toml`, creates or finds Stripe products and prices in test then live, lands the price ids | A push touching `web/public/submit.catalogue.toml` |
| `site-video-capture` | Drives a real browser from `videos/*.json` and records an mp4 with stills and a transcript | A release, or a deploy of main that touched a page a scene script covers |
| `video-publish` | Fetches recordings from their capture runs, checks them, uploads unlisted, flips public on the operator's word | A successful capture run; the public flip stays the operator's by P8 |
| `ga4-property-sync` | Finds or creates a GA4 property, stream and BigQuery link per environment, lands the measurement id | Creation of a new GitHub Environment |
| `do-next` | Dispatches `NEXT.md`'s open items as worktree-isolated sub-agents and lands each one | A schedule, or a push that adds a `NEXT.md` row |
| `board` | Renders the open-work board from `NEXT.md`, `BACKLOG.md`, the alarm issues and the live deployments | A schedule, posting to an issue or Telegram |
| `vat-submission-failure-alarm-user-lookup` | From a submission-failure alarm, finds the customer, what HMRC answered, whether they wrote in | The `[ALARM] prod-env-hmrc-submission-failure` issue opening |
| `plain-prose` | The writing rules every human-facing surface follows | Not event-shaped; it is a constraint on the others |

**What the platform has switched off.** No branch protection beyond a ruleset carrying two rules
(no deletion, no force-push). No required status checks. Auto-merge disabled. Delete-branch-on-merge
disabled. No CODEOWNERS. No PR template. Dependabot automated security fixes disabled, and no
Dependabot PR has ever been opened despite a monthly grouped config for three ecosystems. Commit
signature verification off. `sha_pinning_required` off and `allowed_actions` set to `all`, on a
public repository. Two Dependabot alerts open, one high. Zero code-scanning alerts open. Only one
issue template, for support. No `repository_dispatch` or `issue_comment` trigger anywhere, which
is why every skill needs a person to start it.

## 4. Labelling and provenance

The operator's ask: templated or LLM-generated content is labelled as such, and issues show a
machine or human creator.

### What survives an edit

Provenance that can be edited away is not provenance. Sorted by whether it holds.

| Carrier | Survives an edit | What it proves |
|---|---|---|
| API-recorded author (`issue.user`, `comment.user`, PR author) | Yes. GitHub stamps it and nobody changes it afterwards. | Which credential made the call. Not which human, and not which process, unless that credential is single-purpose. |
| A GitHub App as the actor (`user.type` is `Bot`, a fixed app slug) | Yes. | The app made the call. An installation token is scoped and short-lived, unlike a PAT sitting in two secret stores. |
| A verified commit signature | Yes, cryptographically. | The holder of a key registered to that account produced this exact tree. The strongest carrier available. |
| An HMAC over the machine facts | The value survives; whether it verifies is the point. | The holder of the signing key composed those facts. |
| A label such as `origin:agent` | No. Any collaborator with write adds or removes it. | Intent at the moment it was applied. Good for routing, useless as proof. |
| A body trailer or footer sentence | No. Bodies are editable and edits only show in the edit history. | Nothing on its own. Reads well to a person. |
| An issue-form field | No, the body is editable after submission. | Which template was used, at creation. |
| A commit trailer (`Co-Authored-By`, `Claude-Session`) | Only within that commit; rewriting changes the SHA. | That whoever wrote the message chose to say so. |
| Re-reading the source of truth | Not a carrier. | That the event actually happened. Strongest, because it depends on no secret. |

**The rule that falls out: never gate on a label.** Labels and trailers do the reading job.
Author identity, signatures and source-of-truth re-reads do the gating job. Mixing them is how a
governance rule becomes decoration.

### The scheme

Five labels, applied by whoever creates the thing, and by a workflow that fills the gap when the
creator did not:

- `origin:human` — a person typed it.
- `origin:agent` — a model wrote it, under an operator direction.
- `origin:alarm` — our own alarm pipeline raised it.
- `origin:template` — a script filled a template. No model, no person.
- `origin:external` — someone outside the org raised it.

P1's close rule keys off `origin:human` and `origin:external` together, but only after checking
the author, because the label is the hint and the author is the proof.

### Labelling the prose

- Every agent-written issue comment ends with one line naming the model and linking the workflow
  run. `alarm-triage.yml` is close to this already; standardise the wording so a reader recognises
  it across surfaces.
- Every templated body says it is templated, in the same place.
- A release note assembled from commit subjects says it was assembled.
- A draft PR an agent opened is opened as a draft and says so in the body. The alarm-triage PR
  body already reads "Not reviewed by a human. Closes nothing."
- A social post or a public reply is labelled when a reader could take it for a person's words. A
  product announcement in the company's voice is the company's voice and needs no label. A reply
  that reads as one person answering another does.
