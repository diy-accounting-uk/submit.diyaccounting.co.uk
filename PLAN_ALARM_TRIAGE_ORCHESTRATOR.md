<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Which orchestrator runs alarm triage

`NEXT.md` B78. `.github/workflows/alarm-triage.yml` has posted five comments since it shipped and
every one is an error. `PLAN_REPOSITORY_AUTOMATION.md` phase 3 builds on it, so the plan rests on
something that has never produced an answer. The operator is weighing LangGraph as the
orchestrator, because they need to learn it for other work.

This document says what the workflow actually does today, prices four ways forward, recommends
one, and ends with steps a Sonnet or Haiku sub-agent can execute.

Every AWS number below was read from the live accounts on 2026-09-10 with the `submit-ci` and
`submit-prod` SSO profiles. Every call was read-only. GitHub numbers come from the API.

---

## 1. What the workflow does, and what it has done

### 1.1 What it claims

`alarm-triage.yml` fires on `issues: [opened]` when the issue carries the `alarm` label. It counts
the day's triage runs and stops after three. It reads the alarm name, window and deployment out of
the issue body. It chains two OIDC roles into a read-only triage role, reads the guardrail ids from
SSM, resolves the alarm's log groups and console links with
`scripts/resolve-alarm-evidence.mjs`, then runs Claude Code headless on Bedrock with
`eu.anthropic.claude-sonnet-4-5`. It filters the answer through `scripts/redact-triage-output.mjs`
and a Bedrock guardrail, opens a draft PR if the answer holds a ` ```diff ` block that applies
cleanly, and comments the answer on the issue.

### 1.2 What it has done

Nine runs have reached the `run-triage` job. Five posted a comment. All five are errors.

| Issue | When | Comment | Cause |
|---|---|---|---|
| #134 | 2026-09-06 06:30 | `404 Model use case details have not been submitted` | The Anthropic use-case form had not been filed for the account |
| #140 | 2026-09-06 12:04 | `403 ... aws-marketplace:ViewSubscriptions, aws-marketplace:Subscribe` | No Marketplace agreement for the Anthropic models in the account |
| #138 | 2026-09-06 19:09 | `no assistant text found in the input JSON` | The run worked, then hit `--max-turns 12`, so the result object carried `subtype: error_max_turns` and no `result` field |
| #161 | 2026-09-09 13:17 | `could not parse /tmp/triage.json as JSON` | `--permission-mode dontAsk` is not a value claude-code 2.0.30 accepts |
| #163 | 2026-09-09 14:07 | `could not parse /tmp/triage.json as JSON` | Same |

Two more runs (#152 on 09-08, #156 on 09-08) failed before reaching the model, on
`cloudwatch:DescribeAlarms ... because no identity-based policy allows the action`. The deployed
role lagged the CDK. The live `prod-env-alarm-triage-role` carries the `DescribeAlarms` Allow now,
so that one is closed.

Two of the five comments are the same fault, so there are four distinct causes and three are
already gone. What remains is one invalid CLI argument.

One thing is common to all five, and it is worth naming separately. None of them should ever have
been a comment. Both the `Run triage` step and the `Filter the output` step pipe their command
through `2>&1 | tee`, which merges stderr into the file the next step reads and hands the pipeline
`tee`'s exit code. `scripts/redact-triage-output.mjs` does the right thing on every failure shape,
writing the reason to stderr and exiting non-zero, and its unit tests cover all of them. The
workflow throws that away and posts the reason instead.

### 1.3 The run that nearly worked

Run 34053827545 on #138 is the only run that has reached the model and done work. It ran 12 turns
in 160 seconds, read logs, and stopped because 12 was the turn cap at the time. Its result record
shows two `permission_denials`: the agent tried `ls -la /tmp/*.json` and `gh issue view 138`, both
outside `--allowedTools`. The prompt now tells the agent it has no `gh` and no general shell, so
that pair should not recur.

That run also shows `resolve-alarm-evidence.mjs` crashing with `ERR_MODULE_NOT_FOUND`, because
`npm ci` ran after it. Commit `1ca17b6a` moved the install first. Run 34356014873 on 09-09 confirms
the fix: the resolver printed a full evidence object with `alarmFound: true`, the CloudTrail log
group prefix and the Insights query.

So the pipeline around the model works. The model call is the only broken link, and a flag value
breaks it.

### 1.4 The flag

```
error: option '--permission-mode <mode>' argument 'dontAsk' is invalid.
Allowed choices are acceptEdits, bypassPermissions, default, plan.
```

`dontAsk` exists in claude-code 2.1.267. It does not exist in 2.0.30, which
`CLAUDE_CODE_VERSION` pins. `2>&1 | tee` then puts the usage error in `/tmp/triage.json`, the
redact script cannot parse it and says so on stderr, and the next step's own `2>&1 | tee` posts
that sentence to the issue.

`default` is the right value on 2.0.30. `--allowedTools` already names the fence, and `default`
denies anything outside it rather than prompting. `plan` was the earlier value and it was wrong:
plan mode blocks the `aws logs` calls the prompt depends on, which is what burned the 12 turns
on #138.

---

## 2. The numbers

### 2.1 Alarm volume

55 `[ALARM]` issues exist, opened between 2026-09-01 18:21 UTC and 2026-09-09 18:46 UTC. That is
7.94 days, so 6.9 issues a day and about 209 a month at the current rate. 34 are prod and 21 are
ci. 53 are closed and 2 are open. A person closed every closed one.

Per day: 16, 8, 5, 3, 9, 2, 0, 5, 7. The volume is bursty, and the 16-issue day is what the
three-runs-a-day guard exists for.

`_developers/ALARM_AUDIT_2026-09.md` counts the other side of the same picture: of 146 prod metric
alarms over 90 days, five ever transitioned to ALARM, and every Lambda health check stayed in OK or
INSUFFICIENT_DATA. Most of the 55 issues come from CIS security checks, deployment-set churn and
the composite stack-health rollups, not from application faults.

### 2.2 What a triage run costs on Bedrock, measured

Cost Explorer for submit-prod on 2026-09-06, the only day any model call landed:

| Usage type | Tokens | Cost |
|---|---|---|
| `EUW2-MP:EUW2_CacheReadInputTokenCount` | 125,514 | $0.0414 |
| `EUW2-MP:EUW2_CacheWriteInputTokenCount` | 30,552 | $0.1260 |
| `EUW2-MP:EUW2_InputTokenCount` | 1,038 | $0.0012 |
| `EUW2-MP:EUW2_OutputTokenCount` | 1,888 | $0.0305 |

$0.199 for the day, across three model-reaching runs. That is the entire Bedrock model bill for
the account this month.

Those rows give the eu-west-2 rate: cache read $0.33 per million tokens, cache write $4.13,
output $16.18. The 12-turn run on #138 used 22 input, 6,244 cache write, 100,459 cache read and
1,281 output tokens, so it cost **$0.080**.

A run that reaches an answer will take more turns. Cache reads grow with the square of the turn
count, so 30 turns puts cache reads near 625k, output near 4k, cache writes near 15k. That is
about **$0.34**. The working band is **$0.08 to $0.35 per triage**.

`PLAN_ALARM_EVIDENCE_AND_TRIAGE.md` section 6.3 estimated $1.05 a run. Measured, it is three to
thirteen times less.

| Volume | Cost per month |
|---|---|
| The workflow's own cap, 3 executed runs a day, 90 a month | $7 to $32 |
| Every alarm issue, 209 a month | $17 to $73 |

Both sit inside the $150 monthly Bedrock budget. GitHub Actions minutes are free: the repository is
public and the job runs on a standard runner for three to five minutes.

### 2.3 The cost guard cannot see the spend

`ObservabilityUE1Stack.java` filters both budgets on `Service: ["Amazon Bedrock"]`. AWS bills
Anthropic models through Marketplace under their own service names. The live budgets say so:

```
prod-env-bedrock-daily    limit=5.0    DAILY    actual=0.0   filters={"Service":["Amazon Bedrock"]}
prod-env-bedrock-monthly  limit=150.0  MONTHLY  actual=0.0   filters={"Service":["Amazon Bedrock"]}
```

Meanwhile Cost Explorer shows $0.1978 under `Claude Sonnet 4.5 (Amazon Bedrock Edition)` and
$0.0014 under `Claude Haiku 4.5 (Amazon Bedrock Edition)`. Only $0.0004 of guardrail spend lands
under `Amazon Bedrock` itself. The deny action that attaches
`prod-env-alarm-triage-bedrock-deny` at 100% of the monthly budget cannot fire, because the
budget it watches will stay near zero however much the models are used.

This is independent of which option wins, unless triage leaves Bedrock entirely.

### 2.4 Model access, checked today

| Account | `anthropic.claude-sonnet-4-5` | `anthropic.claude-haiku-4-5` | Use-case form |
|---|---|---|---|
| submit-prod (972912397388) | agreement AVAILABLE, AUTHORIZED, entitled | agreement AVAILABLE, AUTHORIZED, entitled | filed |
| submit-ci (367191799875) | agreement **NOT_AVAILABLE** | agreement **NOT_AVAILABLE** | filed |

`amazon.nova-lite-v1:0` shows AVAILABLE in submit-ci, so ci's gap is the Anthropic Marketplace
agreement specifically, not Bedrock access in general.

Both environments have `SUBMIT_ALARM_TRIAGE_ROLE_ARN` set, so a ci alarm will start a run and hit
the 403 that #140 already recorded. 21 of the 55 issues are ci.

### 2.5 Log retention decides what a proof run can prove

Prod Lambda and API Gateway log groups keep 3 days. A deployment set's log groups disappear when
that deployment self-destructs. A `workflow_dispatch` re-run against an old issue will find nothing
to read, whatever the orchestrator. The first proof has to run on an alarm that fired within the
last three days, on a deployment that still exists.

---

## 3. The options

### Option 1. Finish the Bedrock path as built

Change `--permission-mode dontAsk` to `default`, stop the two `2>&1 | tee` pipes turning a
failure into a comment, gate the result object, and fix the budget filter. About twenty lines in
two files. Everything else is already built and, as of 09-09, already runs: the OIDC role chain,
the read-only triage role with its `DenyCustomerData` statement, the evidence resolver, the
deny-list, the guardrail, the draft-PR path and the run budget.

**Cost.** $7 to $32 a month at the workflow's cap, $17 to $73 at full volume. No licence, no
hosting, no seats.

**Upkeep.** One pinned CLI version. The `dontAsk` break is the shape of the risk: a flag that a
newer version accepts and the pinned one rejects, discovered in production because nothing
validated it. A `jq -e` gate on the result object turns that class of break into a red run instead
of a wrong comment. Bumping the pin is then a reviewed change with a proof run behind it.

**Blockers.** Marketplace and the use-case form are gone for prod. They stay for ci until someone
accepts the agreement in submit-ci, or triage runs prod-only.

### Option 2. Rebuild the orchestration on LangGraph

`@langchain/langgraph` reached 1.0 GA in October 2025 alongside the Python package and now carries
StateGraph, checkpointers, streaming, subgraphs and `interrupt()` human-in-the-loop. It is
production-viable in TypeScript. Python still gets features first.

**Where it would run.** In the GitHub runner, as a Node script the workflow invokes. That is the
honest answer. This repository deploys Lambdas from Docker images and has no long-running host,
and LangGraph does not need one: a single-shot diagnosis with a handful of tool calls holds no
state between runs. A Lambda would work too, and would drop the runner and the checkout, at the
cost of the repository read that answers "connect this log line to the code that wrote it".
LangGraph Platform is the third home and nothing here needs it.

**What it adds over calling a model directly.** For this workload, close to nothing. LangGraph's
value is checkpointed state, resumable interrupts, fan-out to parallel branches, and a graph you
can inspect. Alarm triage reads a few log queries and writes 400 words. There is no branch to fan
out, no state to checkpoint, and no operator gate mid-run.

**What it costs to keep working.** The framework is free and self-hosting it in the runner adds no
bill. LangSmith tracing is free for one seat on the Developer plan and $39 per seat per month on
Plus with 10,000 base traces; at 209 runs a month the free seat covers it. The real cost is code.
LangGraph replaces one `claude -p` invocation with a graph definition, a model adapter through
`@langchain/aws`, a tool loop, a tool allowlist, and the repository-reading tools that Claude Code
supplies for free. That is a few hundred lines this repository now owns and tests, plus three npm
packages tracking a moving model API.

**Blockers.** They move, they do not disappear. On Bedrock through `@langchain/aws`, Marketplace
and the use-case form apply exactly as now. Pointed at the Anthropic API instead, they go and an
API key arrives in their place.

**The learning argument, priced.** It is real and it should be taken at face value. It just does
not attach here. Phase 3 of `PLAN_REPOSITORY_AUTOMATION.md` is where it attaches: a named remedy
list, a model that may only choose from it, a check that must pass, and an operator gate before
anything reaches prod. That is a bounded state machine with an interrupt in the middle, which is
the shape LangGraph is built for. Learning it on phase 3 pays twice. Learning it by rewriting a
workflow whose only fault is an invalid flag value pays once and delays the proof.

### Option 3a. Call the Anthropic Messages API from the workflow, no framework

Drop Claude Code and LangGraph. Use `@anthropic-ai/sdk` in a Node script: one system prompt, a
small tool set (run an Insights query, fetch trace summaries, read a repository file), and a
`while (stop_reason === "tool_use")` loop.

**Cost.** Sonnet 5 is $2 per million input and $10 per million output on the first-party API, with
cache reads at $0.20 and cache writes at $2.50. The same 30-turn shape costs about $0.20, so $18 to
$42 a month at full volume. Roughly 40% under Bedrock eu-west-2.

**Upkeep.** One SDK. You own the loop, the tool schemas and the allowlist, so about 200 to 300
lines of new code and its tests. The tool surface is smaller than Claude Code's, which cuts both
ways: fewer moving parts, and no `Grep`/`Glob` over the repository unless you write them.

**Blockers.** Marketplace and the use-case form go. An `ANTHROPIC_API_KEY` secret arrives, which
`REPORT_IDENTITY_AUDIT.md` recommendation 8 is already trying to reduce the count of. AWS Budgets
stops being the spend guard, because the spend leaves AWS; the cap becomes an Anthropic Console
limit plus the workflow's own run budget. The Bedrock guardrail stays usable through
`bedrock-runtime apply-guardrail`, which the triage role already permits and which costs a fraction of a
cent a run.

### Option 3b. Move triage into `alarmToGithubIssue.js`

The Lambda already receives the alarm event, resolves the evidence through
`app/lib/alarmEvidence.js`, holds the GitHub token, and writes the issue. Adding a Bedrock call
before it writes would put the diagnosis in the opening issue body, with no runner, no checkout and
no OIDC chain.

**Cost.** Same per-token bill as Option 1, minus the runner. Fewer turns, because the Lambda would
run one structured call rather than an agentic loop, so nearer $0.02 a run.

**Upkeep.** Lowest of the four. It reuses code that already ships and is already tested.

**Blockers.** Marketplace and the use-case form stay. Two capabilities go: the Lambda has no
repository checkout, so it cannot connect a log line to the code that wrote it; and it has no path
to a branch or a draft PR, which is the whole of phase 3. Worth keeping as a later addition for the
alarm families whose answer is a lookup, not an investigation. It does not replace the workflow.

### Side by side

| | 1. Bedrock as built | 2. LangGraph | 3a. Anthropic API direct | 3b. In the Lambda |
|---|---|---|---|---|
| Cost per run | $0.08 to $0.35 | same as its backend | ~$0.20 | ~$0.02 |
| Cost per month at 209 runs | $17 to $73 | same as its backend | $18 to $42 | ~$4 |
| New code to own | ~20 lines | ~400 lines + 3 packages | ~250 lines + 1 package | ~80 lines |
| Reads the repository | yes | if you write the tools | if you write the tools | no |
| Opens a draft PR | yes | if you write it | if you write it | no |
| Marketplace + use-case form | gone for prod, open for ci | unchanged on Bedrock, gone off it | gone | unchanged |
| Spend guard | AWS Budgets, once the filter is fixed | as its backend | Anthropic Console | AWS Budgets |
| Time to first real triage | one commit | days | a day or two | a day |

---

## 4. Recommendation

**Take Option 1. Fix the flag, gate the result, fix the budget filter, and run the proof on the
next live prod alarm.**

Three of the four causes in the failure history are already gone. The fourth is one word. The
measured cost is a tenth of what the design assumed. Every other option starts by rebuilding
machinery that already works so it can reach the same model call that is one commit away.

Then put LangGraph on phase 3, where a remedy chooser with a human gate is genuinely graph-shaped,
and where the learning has something to grip.

Keep Option 3b in view for the CIS families. `prod-env-cis-iam-policy-changes` and its siblings are
eight of the 55 issues and their answer is a CloudTrail lookup, not an investigation. Answering
those in the Lambda would keep them out of the run budget entirely. That is a later step, after the
first proof.

### What would change this

- **The proof run needs far more than 30 turns, or costs over $1.** Then an agentic loop is the
  wrong shape for this job and Option 3a's single structured call wins on both cost and
  predictability.
- **`--permission-mode default` denies the `aws logs` calls the prompt depends on.** Then Option 1
  needs a CLI version bump, and if that bump breaks something else, the flat SDK surface of Option
  3a is worth its tool loop.
- **The operator wants ci triaged and will not accept the Marketplace agreement in submit-ci.**
  Then one API key covers both environments and Option 3a wins on reach.
- **Two or three more model-driven workflows land this quarter.** Phase 4 support triage and phase
  5 selection would make a shared orchestrator worth its weight, and LangGraph moves from having no
  grip to being the obvious home.

---

## 5. The first proof

A green badge proves nothing. The proof is one real alarm diagnosed end to end.

**Setup.** The run must fire from `issues: [opened]` on a live prod alarm, within three days of the
alarm firing, on a deployment that still exists. Prod log groups keep three days and a retired
deployment's groups are deleted outright. A `workflow_dispatch` against an old issue will read an
empty window and produce a confident answer about nothing. Prod alarms fire about four times a day,
so waiting for one costs less than a day.

**What has to happen in the run.**

1. The evidence step prints `"alarmFound": true` with a log group prefix that matches the current
   deployment.
2. `/tmp/triage.json` parses, `.subtype` is `success`, `.is_error` is `false`, and `.result` is
   non-empty.
3. The comment has the three sections the prompt asks for: what broke, is it still broken, what is
   the next action.
4. Either a ` ```diff ` block applies cleanly and a draft PR opens, or the answer is a named runbook
   step or "watch, no action" with a reason.

**How we know it worked.** Not from the exit code.

- **Question 1 is checkable.** The comment names a function or resource. The operator opens the
  CloudWatch link already in the issue body and sees the same failure shape. If the comment names
  something the console does not show, the run read the wrong window or the wrong log group.
- **Question 2 is checkable against the alarm.** `aws --profile submit-prod cloudwatch
  describe-alarms --alarm-names <name>` gives the current state. The comment's answer has to agree
  with it.
- **Question 3 is checkable by acting on it.** If it names a change, the draft PR exists and its
  diff is the change described. If it says "watch, no action", the reason has to be a fact from the
  evidence, not a hedge.
- **The bill is checkable.** After the run, Cost Explorer for that day on
  `Claude Sonnet 4.5 (Amazon Bedrock Edition)` and `Claude Haiku 4.5 (Amazon Bedrock Edition)`
  gives the real per-run cost. If it lands above $0.35, the cost band in section 2.2 is wrong and
  section 4's first bullet applies.

**What counts as a pass.** One comment on one real prod alarm issue where the operator reads all
three answers, checks them against the console, and agrees. That is the number `PLAN_REPOSITORY_AUTOMATION.md` phase 3 needs before it can talk about a share of the 55-issue history closing
itself.

---

## 6. Execution steps

Two code steps, then the operator, then a record. The two code steps touch different files and can
run at the same time.

### Step 1. The workflow: the flag, the exit codes, and the commit identity

**Model: Sonnet. File: `.github/workflows/alarm-triage.yml`. Nothing else.**

Four changes in one file. They are separate faults, but one agent owns the file.

**1a. The flag.** In the `Run triage` step, change `--permission-mode dontAsk` to
`--permission-mode default`. `dontAsk` is not a value claude-code 2.0.30 accepts; the CLI prints a
usage error and exits non-zero. `default` denies anything outside `--allowedTools` instead of
prompting, which is the fence the workflow already wants. Leave `CLAUDE_CODE_VERSION` alone; a pin
bump is a separate change with its own proof run.

**1b. The model call must not write its own error into the JSON file.** The step currently pipes
`claude ... 2>&1 | tee /tmp/triage.json`, so a usage error lands in the file the next step parses,
and `tee`'s exit code hides the failure. Replace it with a redirect and a check:

```bash
set -o pipefail
PROMPT=$(envsubst < prompts/alarm-triage.md)
claude -p "$PROMPT" \
  --max-turns 30 \
  --output-format json \
  --permission-mode default \
  --allowedTools "..." \
  > /tmp/triage.json
jq -e '.subtype == "success" and (.is_error | not) and (.result | length > 0)' /tmp/triage.json \
  > /dev/null || {
    echo "triage produced no answer:" | tee -a "$GITHUB_STEP_SUMMARY"
    head -c 2000 /tmp/triage.json | tee -a "$GITHUB_STEP_SUMMARY"
    exit 1
  }
```

Keep the `--allowedTools` list exactly as it is. Note that this gate also turns
`subtype: error_max_turns` into a failed run rather than a comment saying `triage stopped`, which
is the behaviour we want while the path is unproven.

**1c. The filter step must not turn stderr into a comment.** `scripts/redact-triage-output.mjs`
already writes its errors to stderr and exits non-zero, and its unit tests already cover every
failure shape. The workflow discards that: `node scripts/redact-triage-output.mjs /tmp/triage.json
2>&1 | tee /tmp/triage-comment.md` merges stderr into the comment body and swallows the exit code.
That is how `no assistant text found in the input JSON` reached issue #138. Replace it with:

```bash
set -o pipefail
node scripts/redact-triage-output.mjs /tmp/triage.json > /tmp/triage-comment.md
echo "redactions=$(wc -l < /tmp/redactions.txt)" | tee -a "$GITHUB_OUTPUT"
```

The step's shell already runs with `-e`, so a non-zero exit now fails the run and the reason stays
in the log.

**1d. The commit identity.** The `Open a draft PR` step commits as
`claude-alarm-triage <noreply@anthropic.com>`, which GitHub attributes to the account `claude`,
which we do not control. `REPORT_IDENTITY_AUDIT.md` recommendation 3 covers it. It has not mattered
because no draft PR has ever opened, and the first successful triage is the first time it will.
Set the identity to `github-actions[bot]
<41898282+github-actions[bot]@users.noreply.github.com>`, matching the token the step already uses.
It moves to the `diya-agent` app's identity when that app exists.

**Done when:** the file parses, no `noreply@anthropic.com` remains under `.github/workflows/`, and
neither `2>&1 |` remains in the two steps above.

### Step 2. The Bedrock budgets watch the service that is actually billed

**Model: Sonnet. Files: `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityUE1Stack.java`,
`infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentUE1CdkResourceTest.java`.**

Both `CfnBudget`s filter on `Service: ["Amazon Bedrock"]`. AWS bills Anthropic models through
Marketplace under `Claude Sonnet 4.5 (Amazon Bedrock Edition)` and
`Claude Haiku 4.5 (Amazon Bedrock Edition)`. Read on 2026-09-10: both live budgets report $0.00
actual while Cost Explorer shows $0.199 of model spend. The `APPLY_IAM_POLICY` deny action on the
monthly budget therefore cannot fire.

- Widen `costFilters` on both budgets to three service names: `Amazon Bedrock` for the guardrail
  charge, plus the Marketplace service name of each model the triage role pins in
  `ObservabilityStack.java`.
- Add a CDK test asserting the budget carries one Marketplace service name per pinned model, so
  re-pinning a model cannot blind the budget again without a red test.

**Done when:** `./mvnw clean verify` passes.

### Step 3. Decide ci, then run the proof

**Operator. Two calls and a wait.**

1. **ci.** Either accept the Anthropic model agreement in submit-ci, or leave it. Both anthropic
   models read `agreementAvailability: NOT_AVAILABLE` there, while `amazon.nova-lite` reads
   AVAILABLE, so the gap is the Marketplace agreement specifically. `SUBMIT_ALARM_TRIAGE_ROLE_ARN`
   is set on the ci environment, so ci alarms start runs today and hit the 403. After step 1 they
   fail quietly instead of commenting. 21 of the 55 issues are ci.
2. **The proof.** After steps 1 and 2 merge, wait for the next prod alarm issue to open and let the
   workflow fire on it. Do not `workflow_dispatch` an old issue: prod log groups keep three days
   and a retired deployment's groups are deleted outright, so an old window reads empty and the
   answer would be confident about nothing. Prod alarms fire about four times a day.

Then read the comment against section 5's four checks.

### Step 4. Record what the proof measured

**Model: Haiku. Files: `PLAN_REPOSITORY_AUTOMATION.md`, `NEXT.md`, this file.**

Replace section 2.2's extrapolated band with the measured cost of the proof run, taken from Cost
Explorer for that day on the two Marketplace service names. Delete B78 from `NEXT.md`. Phase 3 of
`PLAN_REPOSITORY_AUTOMATION.md` can then rest on a path that has produced an answer.
