# PLAN_ISSUES_DELIVERY — phased grouping and Copilot recommendations

Covers 17 of the 18 open issues on `diy-accounting-uk/submit.diyaccounting.co.uk`, matched to pre-migration plans written before the repo's 2026-05 org migration renumbered issues (old #425–#746 → new #3–#20). Issue #20 (ITSA+MTD Add-on) is open but has no pre-migration plan file yet.

Per-issue plans live under `plans/issues/PLAN_ISSUE_<n>_<slug>.md`, named by current issue number. Open questions are aggregated in `plans/QUESTIONS.md`. 8 pre-migration plan files with no current-issue counterpart (580b, 580c, 645, 646, 648, 651, 652, 655) moved to `plans/archive/pre-migration/`.

---

## Grouping by delivery phase

Issues are grouped by shared code areas (so one PR / sprint can land related ones together) and by blocking dependencies. Order within a phase is free.

### Phase 1 — Quick wins & hygiene (1–2 PRs each; low risk)

Frontend hygiene and internal naming — mechanical, low-blast-radius.

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [4](issues/PLAN_ISSUE_4_home_button_canonical.md) | Home button without `index.html` | S | **Yes** |
| [6](issues/PLAN_ISSUE_6_pass_link_navigation.md) | Pass link navigation | M | **Yes** (after Q6.1) |
| [12](issues/PLAN_ISSUE_12_synthetic_naming_alignment.md) | synthetic/sandbox naming alignment | M | **Yes** (mechanical renames) |
| [13](issues/PLAN_ISSUE_13_multi_url_lighthouse.md) | Multi-URL Lighthouse | S | **Yes** |

These share the `web/public/` + workflow-config surface and do not touch Lambdas or DynamoDB.

### Phase 2 — Mobile & theme UX (single design sprint)

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [5](issues/PLAN_ISSUE_5_manage_subscription_button_mobile.md) | Mobile Manage-subscription button | S | Partial (needs visual check) |
| [8](issues/PLAN_ISSUE_8_packed_mobile_ui.md) | Packed mobile UI | M | Partial (visual audit) |

Share a CSS/media-query audit and can land as one design sprint.

### Phase 3 — Observability / ops platform

Shared stacks: Slack/Telegram forwarders, CloudWatch alarms, SNS/EventBridge wiring, GitHub App for issue-raising, detection surface.

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [7](issues/PLAN_ISSUE_7_telegram_logout_event.md) | Telegram logout event | S | **Yes** (after Q7.1) |
| [18](issues/PLAN_ISSUE_18_slack_alerting_agent_issues.md) | Slack alerting + agent-raised issues | L | Partial |
| [9](issues/PLAN_ISSUE_9_scan_detection.md) | Scan detection | L | Partial |
| [10](issues/PLAN_ISSUE_10_data_theft_detection.md) | Data theft detection | L | Partial (CloudTrail wiring yes; anomaly design no) |

Deliver roughly in this order: Slack first (it's the fan-out everything else depends on), then logout-event (piggy-backs), then #9/#10 (shared SecurityDetectionStack).

### Phase 4 — Infrastructure, disaster recovery

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [11](issues/PLAN_ISSUE_11_backups_outside_account.md) | Backups outside the account | L | Low — multi-account IAM |

Single issue but substantial (multi-account infra, restore test workflow). Its dependency on `submit-backup` account bootstrap means it has to be a dedicated sprint.

### Phase 5 — HMRC / feature expansion

Big product moves. Each needs Product sign-off + HMRC coordination before code.

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [19](issues/PLAN_ISSUE_19_optional_vat_endpoints.md) | Optional VAT endpoints (liabilities/payments/penalties) | M | **Yes** (pattern-matches existing) |
| [16](issues/PLAN_ISSUE_16_self_employed_endpoints.md) | Self-employed (ITSA) endpoints | XL | Partial |
| [15](issues/PLAN_ISSUE_15_limited_company_endpoints.md) | Limited company endpoints | ?? | Blocked on Q15.1 |
| [14](issues/PLAN_ISSUE_14_apple_microsoft_social.md) | Apple + Microsoft login | M | Partial |

Order within this phase: #19 first (reinforces HMRC approval case), #14 (UX breadth), then #16 (prep for 2026 mandate), #15 (blocked). Any Phase 5 item is a programme of work, not a sprint.

### Phase 6 — Growth & community

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [17](issues/PLAN_ISSUE_17_diy_merch.md) | DIY Merch | S (Path A) / L (Path B) | Path A yes |

---

## Dependency/ordering summary

```
Phase 1 (hygiene) ──┐
Phase 2 (UX)   ────┤── no dependency
Phase 3 (ops)  ────┘
                 │
                 ▼
Phase 4 (backups) ── independent; needs submit-backup account
                 │
                 ▼
Phase 5 (HMRC features) ── depends on Phase 1 (naming) + Phase 3 (observability useful during rollout)
                 │
                 ▼
Phase 6 (growth) ── depends on Phase 5 (subscription + #14 breadth)
```

Phases 1–3 can run in parallel. Phase 4 is independent. Phase 5 ideally lands after Phase 1 (so we don't rename concurrently with new endpoints).

---

## Copilot recommendations

### Assign to Copilot with minimal oversight
These are bounded, pattern-matching, and have clear acceptance criteria once their Q is answered:

- **#4** — Home button (mechanical search/replace + test).
- **#13** — Multi-URL Lighthouse (config + script).
- **#12** — synthetic naming rename (mechanical across codebase, migration shim per plan).
- **#6** — Pass link navigation (after Q6.1).
- **#7** — Telegram logout event (after Q7.1).
- **#19** — Optional VAT endpoints (parallels existing Lambdas).
- **#17** Path A — merch storefront link page.

### Assign to Copilot after a human picks a small design decision
Human picks the decision (2–5 minutes), Copilot then delivers:

- **#5** — after Q5.1 (mobile target).
- **#8** — after Q8.1 (which page).
- **#18** — after Q18.1 + Q18.2 (workspace + GitHub App).
- **#14** — after Q14.1 (Apple Dev Program).
- **#3** — after Q3.1 (credentials).
- **#9/#10** — after Q9.1 + Q9.2 (routing + auto-block policy).

### Do not assign to Copilot — needs continuous human judgment
These have either security blast radius, multi-account changes, or product strategy:

- **#11** — multi-account IAM, prod data in CI.
- **#16** — big HMRC programme; approval artefact coupling.
- **#15** — blocked on product strategy (Q15.1).

---

## First 30 days — recommended cadence

Week 1–2: Phase 1 quick wins (#4, #3, #13, #12 scaffolding) — all assignable to Copilot.

Week 2–3: Phase 2 mobile audit (#5, #8).

Week 3–4: Phase 3 ops — Slack (#18) + logout event (#7). Start #9/#10 once Slack channel exists.

Then: pick the Phase 5 item that matches the next HMRC approval checkpoint.

---

## Maintenance of this directory

When an issue closes: move its plan file into `plans/archive/` (the `pre-migration/` subfolder holds the 2026-05 org-migration orphans specifically) with a final status note.

When a new issue opens: the author (or a follow-up pass through this doc generator) adds a new `PLAN_ISSUE_<n>_<slug>.md` and updates this index.
