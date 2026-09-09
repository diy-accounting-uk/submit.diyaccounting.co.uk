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

## 5. The ranked inventory

83 capabilities across five domains. Each row: what it does, its axis A tier, its axis B band with
a reliability rank, its axis C blast radius, what exists today, what it needs, and what gates it.
`R4` on a row that works fine means nobody counts it yet.

### 5.1 Dev

| Capability | A | B | C | Today | Needs | Gate |
|---|---|---|---|---|---|---|
| Test suite on every push (`test.yml`) | A2 | B1 R1 | C1 | Runs on every branch, 11 of 11 | Nothing | None |
| CodeQL static analysis | A1 | B1 R1 | C0 | Push, PR and weekly, 9 of 9, zero open alerts | Nothing | None |
| Required status checks before merge | A1 | B1 R1 | C2 | The ruleset carries only "no deletion" and "no force-push" | Add `test` and CodeQL as required checks | None |
| `Closes #N` closes the issue on merge | A1 | B1 R1 | C0 | Available, unused | A PR template carrying the line | None |
| Delete branch on merge | A1 | B1 R1 | C0 | Off | One setting | None |
| Dependabot version updates | A1 | B1 R1 | C0 | Monthly grouped config for three ecosystems; no PR has ever opened | Find out why none open, then let them | None |
| Dependabot security fixes | A1 | B1 R1 | C0 | Disabled. Two alerts open, one high | One setting | None |
| Commit signature verification | A1 | B1 R1 | C0 | Off. Every commit reads `verification.reason: "unsigned"` | A signing key on the operator's machine, then a ruleset rule | P2 rests on this |
| Actions SHA pinning and a narrowed allow-list | A1 | B1 R1 | C1 | `allowed_actions: all`, `sha_pinning_required: false`, on a public repo | Two settings | None |
| CODEOWNERS review routing | A1 | B1 R1 | C0 | None | One file | None |
| Auto-merge on owner-authored commits and green checks | A1 gate, A2 check | B1 R2 | C2 | Nothing. The operator merges every PR by hand | The authorship check as a required check, plus P10's shape rules | P2, P10 |
| Auto-merge on a verified alarm origin | A1 gate, A2 check | B1 R3 | C2 | Nothing | The origin verifier | P3, P4, P10 |
| Alarm-triage draft PR | A3 | B2 R3 | C0 | Runs; opens a draft when the diff applies cleanly | Nothing to keep going. Widening it needs a remedy allow-list | P3 |
| Copilot coding agent on a security-review issue | A3 | B2 R4 | C0 | `security-review.yml` exists; its weekly cron is commented out | Switch the cron on and count the outcomes | P1 for the close |
| Automated code review on a PR | A3 | B2 R4 | C0 | `.github/copilot-instructions.md` exists; nothing runs a review automatically | A `pull_request` trigger | None |
| Feature delivery end to end | A3 | B2 R3 | C0 to C2 | The `do-next` skill and worktree sub-agents, operator-triggered | An event trigger and a merge gate | P2, P10 |
| Feature proposal from evidence | A3 | B3 R4 | C0 | Nothing. The optimiser (backlog 52l) is designed, not built | Three months of raw export | None, it only proposes |
| Plan and board drafting | A3 | B2 R2 | C0 | The `board` skill, operator-triggered | A schedule and a place to post | None |
| Release notes and tagging (`publish.yml`) | A2 | B1 R4 | C6 | Manual dispatch only | A trigger and a note template | P8 |
| SBOM generation | A2 | B1 R4 | C0 | Failing 24 of its last 26 runs | Fix it | None |

### 5.2 Ops

| Capability | A | B | C | Today | Needs | Gate |
|---|---|---|---|---|---|---|
| Deploy on push (`deploy.yml`) | A2 | B1 R2 | C2 | Runs, 7 of 9 | Nothing | None |
| Environment deploy | A2 | B1 R3 | C2, C3 | Runs, 4 of 9. The weakest link in the deploy chain | Find the recurring failure | None |
| Destroy the previous deployment | A2 | B1 R2 | C2, C4 | Runs inside `deploy.yml` | Nothing | None |
| Scheduled destroy sweep | A2 | B1 R4 | C1, C2 | Every two hours; 0 of its last 2 runs succeeded | Fix it. This is the $46.88/month leak | None |
| Keepalive and schedule revival | A2 | B1 R4 | C1 | Weekly. Re-enables workflows and checks each schedule fired on cadence | Its first proof on the new Monday slots (backlog 47, 2026-09-14) | None |
| Stack drift detection | A2 | B1 R4 | C1 | Weekly | Nothing | None |
| Certificate expiry check | A2 | B1 R4 | C2 | Weekly across ci and prod | Nothing | None |
| Backup verification | A2 | B1 R4 | C3 | Daily; 0 of its last 1 | Fix it | None |
| Restore drill, cross-account | A2 | B1 R4 | C1 | Monthly, restores prod tables into ci and deletes them | Nothing | None |
| Alarm to GitHub issue | A2 | B1 R2 | C6 | Runs on prod only, keyed on alarm family, honours a silence key | Its own identity (phase 1) | None |
| Alarm to Telegram | A2 | B1 R2 | C0 | Runs for alarms, stack events, budgets and anomalies | Nothing | None |
| Alarm silencing during a deploy | A2 | B1 R2 | C0 | An SSM key per deployment | Nothing | None |
| Alarm triage comment | A3 | B2 R3 | C6 | Runs on `issues: [opened]`, budget-guarded, filtered and guardrailed | Nothing | None |
| Closing a resolved alarm issue | A2 | B1 R4 | C0 | Nothing. A person closed all 50 of the closed ones | The origin verifier, then a close on OK plus a passing check | P1, P3 |
| Auto-remediation from a fixed remedy list | A3 picks, A2 acts | B2 R4 | C2 | Nothing | A named list of remedies and the alarm families each answers | P3, P10 |
| Roll origins to last-known-good | A2 | B1 R4 | C2 | `set-origins.yml`, dispatch only | An alarm family that triggers it | P3 |
| Probe test every four hours | A2 | B1 R2 | C1, C2 | Runs the whole behaviour matrix, 7 of 9 | Nothing | None |
| Compliance scan (pa11y, axe, Lighthouse, ZAP) | A2 | B1 R4 | C1 | Weekly, writes rows to the analytics lake | Nothing | None |
| Cost export, nightly ingestion, panels | A2 | B1 R4 | C0 | FOCUS 1.2 export, an 02:45 copy, a Glue table, three views, EMF metrics | A reader. Backlog 43 is the first one | None |
| Bedrock spend cap with an automatic IAM deny | A1 | B1 R4 | C4 | $150/month with a deny action at 100%, $5/day notify | Nothing. Never tripped | None |
| Secret rotation | A2 in part | B1 R4 | C3, C4 | Twelve third-party secrets, none dated (backlog 53). The deploy stamps `rotated-at` only when a value changes | Rotation the platform can drive per secret | None |
| GDPR erasure and export | A2 | B1 R4 | C3 | Three workflows, dispatch only, dry-run default, a `confirm` gate | Nothing. The gate is correct | Human by design |
| Test user cleanup | A2 | B1 R2 | C1 | Daily, dry-run default | Nothing | None |
| Incident write-up from an alarm and its fix | A3 | B2 R4 | C0 | Nothing | A template, with the triage comment as input | None |

### 5.3 Support

Inbound volume fell about 97% after 2018 (`_developers/SUPPORT_MAIL_ANALYSIS_2026-09.md`), so this
domain is small in traffic and high in blast radius. Every row touches a customer.

| Capability | A | B | C | Today | Needs | Gate |
|---|---|---|---|---|---|---|
| Support issue form | A1 | B1 R2 | C6 | One template, `.github/ISSUE_TEMPLATE/support.md` | Convert it to an issue form, so the fields are structured and `origin:human` lands at creation | None |
| Triage and label an inbound support issue | A3 | B2 R4 | C6 | Nothing | An `issues: [opened]` path beside alarm-triage | P1 |
| Identify the customer behind a failure alarm | A3 | B2 R4 | C3 | The `vat-submission-failure-alarm-user-lookup` skill, operator-triggered, read-only, no table scan | Firing from the alarm issue instead of from a person | P7 |
| Draft a support reply into Gmail | A3 | B3 R4 | C6 | Named in `STRATEGY.md` W4. Nothing built | The mail path, the draft, and somewhere to measure acceptance | P7, P8 |
| Send a support reply | A3 | B3 R4 | C3, C6 | Nothing | A measured acceptance rate first, then a reply class that qualifies | P7, P8, Q6 |
| Reply on a public GitHub issue | A3 | B3 R4 | C6 | Nothing | The publication filter, and a decision on whether public replies stay the operator's | P7, P8, Q8 |
| Reply to a YouTube comment | A3 | B3 R4 | C6 | Nothing. The `youtube.force-ssl` scope already granted for upload also covers reading and replying to comment threads | Code and a policy. No new consent | P7, P8 |
| Detect a customer-affecting incident from support volume | A3 | B3 R4 | C2 | Nothing | Enough volume to make a signal, which today there is not | None |
| Donor thank-yous | Human | B3 | C6 | Human, deliberately (`STRATEGY.md` W4) | Nothing | Decision |
| Closing a support ticket | Human | B3 | C6 | Human | Nothing | P1 |

### 5.4 Revenue

| Capability | A | B | C | Today | Needs | Gate |
|---|---|---|---|---|---|---|
| Stripe catalogue sync | A3 to trigger, A2 to act | B1 R4 | C4 | The `stripe-catalogue-sync` skill, operator-triggered, test then live | A push trigger on the catalogue file | P5 |
| Stripe webhook handling | A2 | B1 R2 | C4 | In the product, per environment | Nothing | None |
| Subscription cancel | A2 | B1 R4 | C4 | `stripe-cancel-subscription.yml`, dispatch only | Nothing. A cancel should stay deliberate | Human by design |
| Pass generation | A2 | B1 R2 | C1, C3 | Daily at 09:00 from `submit.passes.toml` | Nothing | None |
| GA4 property and BigQuery sync | A2 | B1 R4 | C0 | The `ga4-property-sync` skill and `ga4-bigquery-sync.yml` | Nothing | None |
| Google Cloud and GA4 as code | A2 | B1 R4 | C4 | Nothing. Backlog 49. Every Google change is the operator copying ids between console tabs | A tool choice, then the projects, IAM, budgets, OAuth clients, properties and streams moved into it | P5 |
| Nightly analytics ingestion and raw export | A2 | B1 R4 | C0 | Runs. The first raw export lands 02:15 UTC on 2026-09-10 | Backlog B52x proves every field fills | None |
| The optimiser: which lever to pull next | A2 script, B3 method | B3 R4 | C0 | Designed as backlog 52l, not built | Three months of export | None. It proposes only |
| Reinvestment loop spend decisions | A3 | B3 R4 | C4 | Nothing. Backlog 52m | The Ads account (O23), a reserve floor from the operator, the optimiser | P5, Q5 |
| Ads campaign management | A3 with the API, A4 through the console | B3 R4 | C4 | No account. Both earlier ones were cancelled | The account, then the API. Use A4 only until the API path is built | P5, Q5 |
| Video capture from a scene script | A2 | B1 R3 | C1 | `video-capture.yml` against a live deployment: mp4, stills and a transcript, all as artifacts. Dispatch only | An event trigger | None |
| Video publish to YouTube | A2, then human | B1 R3 | C6 | Works. Three VAT videos public since 2026-09-07. The operator runs the public flip | Nothing. The flip stays human | P8 |
| Screenshots for a release | A2 | B1 R3 | C0 to C6 | The capture run already produces stills; nothing selects or publishes them | Selection and a destination | P8 |
| Social post composition | A3 | B3 R4 | C6 | Nothing | An account, a voice, and the publication filter | P7, P8, Q7 |
| Social post publishing | A2 given the text | B1 R4 | C6 | Nothing. No account exists on any social surface | Accounts and credentials. This is the real gap in the operator's ambition | P8, Q7 |
| Emails-to-articles content pipeline | A3 | B2 R4 | C6 | Backlog 23. Ten article topics named from the sampled archive; nothing built | The pipeline, and the publication filter over 14 years of customer mail | P7, P8 |
| Feature proposal from analytics | A3 | B3 R4 | C0 | Nothing | The export, then the optimiser | None |
| HMRC listing and recognition correspondence | Human | B3 | C5 adjacent | The operator sends every email. A workflow can assemble the checklist and draft both | Nothing | P6 |
| A pricing change | Human decides, A2 applies | B1 R4 | C4 | The catalogue is the source of truth and the sync applies it | Nothing | P5 |

### 5.5 Governance itself

The domain that makes the other four safe. Almost none of it exists as shared machinery, and
several rows exist once, inside one workflow, where nothing else can reach them.

| Capability | A | B | C | Today | Needs | Gate |
|---|---|---|---|---|---|---|
| Provenance labels applied at creation | A2 | B1 R4 | C0 | The five `origin:*` labels do not exist | The labels, and a workflow that fills the gap when a creator did not set one | None |
| Origin verification before a close or a merge | A2 | B1 R4 | C2 | Nothing | The alarm-history re-read, and the commit authorship check | P1, P2, P3 |
| The publication filter as shared infrastructure | A2 | B1 R2 | C6 | Exists inside `alarm-triage.yml` as a script plus a guardrail | Extract it to a composite action every public-writing path calls | P7 |
| Spend caps as platform actions | A1 | B1 R4 | C4 | Bedrock only | The same shape for Stripe, Ads and total AWS | P5, Q5 |
| Agent run budgets | A2 | B1 R2 | C4 | `alarm-triage.yml`'s three-per-24-hours guard | Generalise it to every agent path | P5 |
| Merge shape rules | A2 | B1 R4 | C2 | Nothing | A minimum open-to-merge delay, a non-empty body, a diff-size ceiling, one author email, a merges-per-day cap | P10 |
| Policy-silence handling | A3 | B2 R4 | C0 | Nothing | The `policy:question` label, and the habit of proposing the missing rule | P9 |
| The reliability ledger | A2 | B1 R4 | C0 | The data sits in three places. Nobody assembles it | One job that writes workflow, alarm and behaviour-suite rates into the analytics lake | None |
| Machine-readable policy | A2 | B1 R4 | C0 | Policy is prose, here and in `CLAUDE.md` | A checked form of the gating rules, so a workflow evaluates the same rule a person reads | None |
| A kill switch across every agent path | A2 | B1 R4 | C0 | Nothing. The operator says "freeze" in a session and it binds that session only | One flag every agent path reads before acting, with the Bedrock deny policy as the backstop | None |

### The hardest cells

Four capabilities sit at or near A4 plus B3 plus C6, the hardest cell in the matrix. Saying so
plainly matters more than ranking them politely.

1. **Replying to a public comment in the company's voice** (YouTube, GitHub, any social surface).
   A3 today, A4 on any surface without an API. B3, because there is no right answer to check
   against. C6, because a reply cannot be unread. This one is closest to working, since the
   YouTube credential already carries the scope, which makes it the easiest to get wrong first.
2. **Running paid ad campaigns.** A4 until the Ads API path is built, because the console is where
   the work happens. B3, because inference from noisy data is the whole point. C4, because it
   spends money continuously rather than once.
3. **Composing and posting under the company's name.** A3 or A4 by surface. B3. C6. No account
   exists anywhere, so nothing here is close, which is the one piece of good news.
4. **Sending a support reply to a customer.** A3. B3. C6 and C3 together, because the reply is
   public-shaped and its content is the customer's own data.

All four carry the most governance in the plan: the publication filter on every word, a labelled
origin, a draft stage that ends only when an acceptance rate justifies it, and a spend cap where
money is involved. None of them is closed off. Each is a horizon with a named next step, and each
next step is a measurement rather than a leap.

## 6. The phased build

Ordered by value over risk. Each phase names what it proves before the next starts.

### Phase 0. Switch on what the platform already offers

Every item is A1. Nothing is built and no model is involved.

- Add `test` and CodeQL as required status checks on the existing `main` ruleset, keeping the two
  rules it already carries.
- Turn on auto-merge, delete-branch-on-merge, and Dependabot automated security fixes.
- Set `sha_pinning_required` and narrow `allowed_actions`.
- Create the five `origin:*` labels and the `policy:question` label.
- Add a PR template carrying the `Closes #N` line and an origin trailer. The operator already
  liked the built-in close-on-merge behaviour; this is what makes it happen every time.
- Add CODEOWNERS naming the operator, so review routing exists before any rule needs it.
- Turn on commit signing locally and settle on one author email, which P2 and P10 both depend on.
- Fix the automation that already exists and is not running: `sbom.yml` (2 of 26),
  `verify-backups.yml` (0 of 1), `destroy-ci.yml` (0 of 2), and `security-review.yml`'s commented
  cron.

Proves: the platform gates hold and nothing in the existing flow breaks. Exit: a PR merges through
the required checks, and a Dependabot security PR merges itself.

### Phase 1. Provenance that holds

- The alarm-to-issue pipeline gets its own GitHub identity, so `issue.user` separates a machine
  issue from a human one. P3's rung 1.
- Every agent-created issue, comment and PR carries its `origin:*` label and a model-and-run
  footer.
- The alarm-origin verifier: re-read `describe-alarm-history` for the alarm name and window the
  issue body names, and confirm the transition happened. P3's rung 3.
- The publication filter becomes a composite action every public-writing path calls, instead of
  one workflow's private step.
- The reliability ledger starts collecting, because everything from phase 2 on needs real numbers
  rather than a rank somebody assigned.

Proves: a machine can check an origin and cannot be fooled by text. Exit: the verifier passes on a
real alarm issue and fails on a hand-typed copy of one.

### Phase 2. Auto-merge, narrow

- The authorship check becomes a required status check: every commit resolves to the owner, every
  signature verifies, the head is not a fork.
- P10's shape rules join the same check.
- Auto-merge turns on only for PRs that pass it, and only where the PR closes nothing or closes an
  `origin:alarm` issue whose verifier passed.
- Start with docs-only PRs, since the workspace already permits direct `.md` pushes to `main`, so
  this adds no new risk. Widen to code once the check has a run history.

Proves: the rule holds under a real batch, and the operator stops merging by hand.

### Phase 3. Ops that close their own loop

- A named list of remedies, each tied to the alarm families it answers: roll origins to
  last-known-good, re-run a stale schedule, redeploy a stack. Each remedy is A2 code, and the
  model only chooses from the list, which keeps the whole path at B2.
- The alarm-triage draft PR becomes a real PR when the change touches a file the remedy list
  allows and the checks pass.
- An alarm issue closes on OK plus a passing check, once P1 and P3 both hold for it.
- `alarm-triage.yml`'s run budget generalises to every agent path.

Proves: an alarm can close without the operator when the remedy is on the list. The measure is the
share of the 55-issue history that would have closed itself.

### Phase 4. Support

- Inbound triage and labelling on `issues: [opened]`, beside alarm-triage.
- The customer-lookup skill fires from the alarm issue rather than from a person asking.
- Reply drafting into Gmail, which `STRATEGY.md` W4 already names.
- Replies stay drafts until the acceptance rate is measured. Then one class of reply, a settled
  answer matched to a published article, sends on its own.

Proves: the operator reads drafts rather than raw mail, and the acceptance rate says which classes
can send.

### Phase 5. The outside surfaces

- Wire `video-capture.yml` to a release, and to a deploy of `main` that touched a page a scene
  script covers. Write a scene script when a feature is built, not afterwards.
- Select and publish screenshots from the capture run's stills.
- YouTube publishing stays as it is. The operator presses public.
- Comment replies start on YouTube, because the credential already exists and the volume is small
  enough to read every one.
- Social posting needs accounts first, and none exist. Then a staged post directory the operator
  empties, in the shape `../PLAN_FINANCE_AUTOMATION.md` chose for its write boundary. Then
  automatic posting from a template with a named source. Then composed posts, if the acceptance
  rate earns it.

Proves: nothing reaches the public under the company's name that the operator has not seen, until
a measurement says it can.

### Phase 6. Propose, deliver, measure

- The optimiser reads three months of raw export and proposes the next experiment with its
  predicted effect and interval.
- A proposal becomes a plan doc, a plan doc becomes a batch, a batch becomes a PR. `do-next`
  already runs those last three steps with the operator merging, and phase 2 removed the merge.
- The loop closes when a proposal's predicted effect meets the measured one, which is also how the
  reliability ledger learns to rank a B3 capability.

Proves: the operator supplies direction and policy, and the rest arrives.

### The operator's ambition, ranked

> I'd have it propose features, deliver them, make screenshots and videos and share them on
> social media and respond to comments.

| Step | A | B | C | How far away |
|---|---|---|---|---|
| Propose features | A3 | B3 | C0 | Needs three months of raw export, whose first night is 2026-09-10. The design (52l) is written. Nothing structural is missing |
| Deliver them | A3 | B2 | C0 to C2 | Already happens. `do-next` and worktree sub-agents build and open the PR. Only the merge gate is missing, which is phase 2 |
| Screenshots and video | A2 | B1 | C1 to C6 | Closer than it looks. `site-video-capture` records from a scene script, and `video-capture.yml` runs it against a live deployment, producing mp4, stills and a transcript. Missing: an event trigger and a scene script per feature |
| Share them on social media | A2 to publish, A3 to compose | B1 or B3 | C6 | The real gap. No account on any social surface, no credential, no posting code. YouTube is the only channel that exists |
| Respond to comments | A3 | B3 | C6 | The YouTube credential already carries `youtube.force-ssl`, which covers reading and replying to comment threads, so no new consent is needed. Missing: the code and the policy. Every other surface needs an account first |

## 7. Open questions

Each names the alternatives and a recommendation. An assumption stands until the operator says
otherwise.

**Q1. Which identity raises machine issues.** A GitHub App is the strongest: the author is a bot
with a fixed slug, and an installation token is short-lived and scoped, so it cannot be copied out
of a secret store and reused. A dedicated machine account is cheaper to set up and weaker, because
its PAT sits copyable in a GitHub Actions secret and in Secrets Manager. Keeping the operator's own
PAT is the status quo, and it makes P1 and P3 uncheckable. Assumption: a GitHub App. If the setup
cost is unwelcome, a machine account plus the alarm-history re-read gets most of the way, because
the re-read does not depend on the credential at all.

**Q2. Whether "human" in P1 means the operator or any person.** Issue #20 is from `JDMs4`, a real
outside user, which makes this live rather than theoretical. Treating any person as human means an
external issue is closed by the operator, which is a handful of closes a year and reads well to
the person who raised it. Treating only the operator as human would let an agent close an external
issue, which saves nothing and looks careless. Assumption: any person.

**Q3. Whether to turn on commit signing.** P2 is not a real check without it, because an unsigned
commit's author field is a string anyone who can push may set. The cost is a key on the operator's
machine, one author email instead of two, and every agent session's commit path changing at once.
The alternative is auto-merge that proves only that the pusher held a token, which given P10 is
worse than no auto-merge. Assumption: turn it on in phase 0, before anything depends on it.

**Q4. How wide auto-merge goes on day one.** Docs-only is the safest start and adds no new risk,
since `.md` pushes to `main` are already permitted. Docs plus verified alarm fixes is the next
rung, and it is where the operator's interest lies. Everything green is the end state.
Assumption: docs-only first, widening when the authorship check has thirty runs behind it.

**Q5. The numbers behind P5.** Bedrock already has $150/month with an automatic deny, and $5/day
as a warning, which the alarm-triage path has never approached. Ads has no account yet, and O23
asks the operator for a reserve floor. Total AWS runs against a $64.77/month steady-state target
the cost panel now tracks. Recommendation: keep the Bedrock numbers, set the Ads daily cap in the
account itself rather than in our code, and add a total-AWS budget action at 150% of target so a
runaway loop stops without a person. The operator names the reserve floor.

**Q6. Whether an agent may ever send a customer email unread.** Never sending is the status quo
and costs the operator every reply. Sending one narrow class, a settled answer matched to a
published article, once the acceptance rate clears a threshold, is the middle. Sending anything
the model judges safe is the far end and is not proposed. Recommendation: the middle, with the
threshold set from the first fifty drafts rather than chosen now. Support volume fell about 97%
after 2018, so the saving is small and the risk is not, which argues for patience here rather than
speed.

**Q7. Which social surfaces, and who owns the accounts.** None exist. Each one is a credential, a
voice, a moderation surface, and a place the company can be wrong in public. Recommendation: one
surface first, chosen for where the £20k-to-£30k ITSA wave actually reads, with the operator
holding the account and the agent posting through a token that can be revoked in a click. Which
surface is the operator's call; the plan does not have the evidence to pick.

**Q8. Whether a labelled agent reply on a public GitHub issue is acceptable at all.** Labelled
replies scale the operator's reach and are honest about what they are. Keeping public replies
human keeps the company's voice one voice, which for a five-issues-a-year repository costs almost
nothing. Recommendation: keep public GitHub replies human for now, and let YouTube comments be
where the labelled-reply pattern is tested, because the volume is smaller and the surface is
already ours.

**Q9. What the kill switch is, and who can pull it.** One flag every agent path reads before
acting, with the Bedrock deny policy as the backstop that works even when the flag is not read.
The alternative is what exists now: the operator says "freeze" in a session and it binds only that
session. Recommendation: an SSM parameter every agent path checks, and a `gh workflow run` that
sets it, so the operator can stop everything from a phone.

**Q10. What happens when policy is silent and the operator is away.** P9 says do the reversible
half and ask. The open part is whether the question waits for the next session or reaches the
operator at once. Telegram already carries alarms and budgets, so the channel exists.
Recommendation: `policy:question` on the issue, and a Telegram message only when the blocked work
is tier 1. Everything else waits.

## Sources

- `STRATEGY.md` (the aim, and W4's autonomous-operations workstream), `BACKLOG.md` rows 23, 30,
  43, 47, 49, 52, 52l, 52m and 53, `NEXT.md`.
- `.github/workflows/` (36 files), `.github/agents/`, `.github/actions/`, `.github/dependabot.yml`,
  `.github/ISSUE_TEMPLATE/support.md`, `.github/copilot-instructions.md`.
- `app/functions/ops/alarmToGithubIssue.js`, `activityTelegramForwarder.js` and
  `bedrockBudgetAlertForward.js`; `scripts/redact-triage-output.mjs`,
  `scripts/resolve-alarm-evidence.mjs`, `prompts/alarm-triage.md`.
- `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java`, `ObservabilityStack.java`,
  `ObservabilityUE1Stack.java`, `CostExportStack.java`, and the `analytics/` stacks and views.
- `.claude/skills/` (eight skills), `_developers/archive/PLAN_FLAGGED.md`,
  `_developers/SUPPORT_MAIL_ANALYSIS_2026-09.md`, `../PLAN_FINANCE_AUTOMATION.md`.
- Live reads on 2026-09-09: the repository settings, the `main` ruleset, the labels, the
  environments, the Actions permissions, the Dependabot and code-scanning alerts, the last 100
  workflow runs, the 55 `[ALARM]` issues, and the commit verification state of `main`.
