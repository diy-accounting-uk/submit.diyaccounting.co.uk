<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Project: Governed Autonomous Agent Lab (Slack × GitHub × AWS)

## 1. Project Intent

This project defines a **governed autonomous lab** in which multiple AI agents operate collaboratively,
without a human in the loop by default, yet remain **mechanically bounded** to the accounts, budgets,
and legal regimes defined by a human owner.

The lab may:

* write and modify code
* change infrastructure
* deploy to a public production website
* trigger CI/CD workflows
* communicate internally via Slack

The lab may **not**:

* expand its own boundary
* create real-world legal or financial obligations
* operate outside UK + EU compliance
* bypass budgets or policy enforcement

Autonomy is allowed **inside a box that cannot grow itself**.

---

## 2. Conceptual Model

### 2.1 Agents as Slack Apps

Each agent is implemented as a **distinct Slack App**, giving it:

* a unique identity
* a unique system prompt
* a defined capability set

**Identity =**

* LLM backend (OpenAI Codex / completion API)
* Role prompt (Builder, Reviewer, Supervisor, etc.)
* Capability manifest (what MCP servers it may call)
* Budget envelope

Slack is the **collaboration surface**, not the execution environment.

---

### 2.2 Capabilities via MCP

All real actions are performed through **MCP servers**.

Examples:

* `slack-mcp` → send messages
* `github-mcp` → issues, commits, PRs, workflows
* `playwright-mcp` → browser tests and reports
* (later) `aws-mcp`, `infra-mcp`, `data-mcp`

Agents cannot act directly.
They must **propose tool calls** that pass through the policy gate.

Capabilities are **necessary but never sufficient**.

---

### 2.3 Team Charter (Governance as Prompt + Policy)

A shared **TEAM_CHARTER.md** defines:

* Purpose of the lab
* UK + EU compliance frame
* Absolute “never-do” categories
* Budgets and limits
* Authority and escalation rules
* Definition of “done”

This charter is:

* injected into all agents as context
* mirrored mechanically in the policy gate

Prompt governs intent; policy gate governs reality.

---

## 3. Authority and Autonomy

* Agents may:

    * push directly to main
    * approve their own PRs
    * modify GitHub workflows
    * deploy to production autonomously

* Humans retain ultimate control by owning:

    * AWS account (root)
    * GitHub organisation
    * Slack workspace
    * Prompts, policies, budgets

Agents **may not** modify:

* budgets
* policies
* audit logs
* the policy gate itself

---

## 4. Compliance and Hard Boundaries

### 4.1 Jurisdiction

The lab operates under **UK + EU law**:

* UK legal standards
* EU GDPR and related digital regulation
* Conservative interpretation by default

---

### 4.2 Absolute Never-Do Categories

These are **non-overrideable**, regardless of prompt or budget:

1. **Real-world legal or financial commitments**
   No companies, contracts, bank/payment accounts, property, hiring, purchases.

2. **Physical harm enablement**
   No weapon design, manufacture, logistics, or optimisation.

3. **Unauthorized access / credential misuse**
   No harvesting, bypassing auth, lateral movement, or exfiltration.

4. **Unapproved external influence**
   No external contact outside allowlist.
   No persuasion, lobbying, impersonation, harassment.

5. **Data protection violations**
   No personal data leakage, no cross-environment contamination.

6. **Autonomy expansion**
   No new cloud accounts, orgs, payment methods, or uncontrolled public endpoints.

7. **Control-plane tampering**
   No modifying budgets, policies, logs, or the gate.

---

## 5. Budgets (Daily, Hard Stop)

On exhaustion: **deny immediately**.

### Financial

* Total spend: **£100/day**

### Delivery

* Production deploys: **10/day**
* GitHub workflow edits: **10/day**

### Communications

* Internal DMs (incl. @human): **10/day**
* External direct contacts: **0/day**
* Group messages: **10/day**

Budgets apply at:

* agent
* team
* repo
* environment

---

## 6. Task Model

A **task** is any inbound event:

* Slack DM or mention
* Channel message
* GitHub issue, comment, or workflow event

Tasks may:

* spawn child tasks
* be split or merged freely
* be delegated to any agent

There is no rigid schema; auditability matters more than structure.

---

## 7. Definition of “Done”

A task is done when:

1. The responsible agent posts a final Slack message
2. The message includes **evidence links**:

    * Playwright reports
    * Logs
    * Commits / PRs / deploy references
3. Optional: a “done” vote is called

    * quorum-based
    * unanimity not required
    * “done” ≠ “perfect”

This explicitly addresses the “LLM never finishes” failure mode.

---

## 8. Policy Gate (The System Spine)

The **policy gate** is the core system. Agents are clients.

### 8.1 Required metadata for every tool call

```json
{
  "taskId": "...",
  "actorAgent": "...",
  "capability": "...",
  "environment": "ci | prod",
  "estimatedCostGBP": number,
  "riskClass": "low | medium | high",
  "externalContactsTouched": number,
  "dataClassesTouched": ["code", "logs", "personal", "secrets"],
  "justification": "string"
}
```

No metadata → no execution.

---

### 8.2 Decision Algorithm (Simplified)

1. **Authenticate**

    * valid agent?
    * capability allowed?

2. **Absolute policy check**

    * matches never-do category? → DENY

3. **Environment constraints**

    * allowed in ci/prod? → else DENY

4. **Budget evaluation**

    * would exceed any budget? → DENY

5. **Compliance checks**

    * contacts on allowlist?
    * data classes permitted?

6. **Approve**

    * decrement budgets
    * emit approval token
    * execute tool call

Agents must handle denials by replanning, delegating, or escalating to @human.

---

## 9. Deployment Model (Scale-to-Zero)

### 9.1 Repositories

**Repo A — Lab Definition (GitHub template)**

* TEAM_CHARTER.md
* Agent prompts
* Capability manifests
* Budget configuration
* Slack app metadata
* Example workflows

Cloning Repo A = creating a new lab.

**Repo B — Lab Backend (AWS mono-repo)**

* Policy gate service
* MCP servers
* Budget tracking
* Audit logging
* Event ingestion

One backend can host many labs.

---

### 9.2 AWS Components

**Always-on (minimal)**

* API Gateway
* Policy Gate Lambda
* Budget store (DynamoDB)
* Audit log sink (S3)

**Scale-to-zero**

* Agent Lambdas
* MCP server Lambdas
* Slack event handlers
* GitHub webhook handlers
* On-demand Playwright runners (Lambda/Fargate)

No agents run unless an event arrives.

---

## 10. How to Start (Deliberately Minimal)

### First governed capability

**`send_slack_message`**

Why:

* Low cost
* No external side effects
* Exercises identity, budget, policy, and audit paths

### Minimal first gate rules

* Counts against:

    * internal DM budget
    * group message budget
* Requires:

    * taskId
    * justification
* Enforced deny on:

    * external contact
    * budget exhaustion

### First milestones

1. Slack event → agent invocation
2. Agent proposes “send message”
3. Policy gate approves or denies
4. Message sent
5. Action logged to S3

Only once this is solid should GitHub or deployment capabilities be added.

---

## 11. Key Challenges (Explicit)

1. **Policy correctness beats prompt quality**
   The gate must be right even when the LLM is wrong.

2. **Workflow mutation risk**
   GitHub Actions are effectively arbitrary execution.
   Budgets + allowlists are non-optional.

3. **Drift toward “ship it”**
   Voting + evidence prevents silent quality erosion.

4. **Containment inside owned accounts**
   “Dedicated bot org” reduces blast radius but doesn’t remove it.

5. **Auditability from day one**
   If it’s not logged, it didn’t happen.

---

## 12. What This Is (Plainly)

This is not:

* a chatbot
* a plugin system
* a single “AI engineer”

It *is*:

* a governed autonomous software lab
* with real agency
* real constraints
* and a hard mechanical boundary

The policy gate is the system.
Agents are replaceable.

---
