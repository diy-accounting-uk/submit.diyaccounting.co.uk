---
name: board
description: Render the open-work board — one table for NEXT.md items plus backlog tier 1, tiers 2-5 as one-line lists, then the open alarm issues grouped by family with a recommended action each. Invoke when the operator asks for the board, the open items, or "what's in flight".
---

# board

Render the current open-work board from `NEXT.md` and `BACKLOG.md` (both at the repo
root). Read both files fresh every time — never render from memory of an earlier turn.

## Output shape

Exactly three parts, in this order.

**Part 1 — a table** covering every open item in `NEXT.md` plus every row in the
backlog's Tier 1, deduplicated (a NEXT.md item that is also a tier 1 row gets one
combined row). Columns:

| # | Item | Tier | State | Status | GH issue |

Rows run in board order: in-flight tasks, ready agent tasks, ready operator tasks,
blocked operator tasks, blocked agent tasks. Within a group, keep `NEXT.md`'s order.
Never group rows by backlog number or tier.

- `#`: the backlog row number (`44`), the NEXT.md label (`B14a`), or both (`B44/44`).
  Backlog row numbers are NOT GitHub issue numbers — never conflate them.
- `Item`: a short name, not the row's full prose.
- `Tier`: the backlog tier (`T1`…`T5`). Only backlog rows have a tier — an item
  tracked only on `NEXT.md` gets `—`, exactly as an item without a GitHub issue does;
  `NEXT` is where things are tracked, not a tier.
- `State`: exactly one word — `in-flight` (being worked right now), `ready` (nothing
  prevents starting it, whoever the owner is), or `blocked` (waiting on a date, a
  prerequisite item, or a decision not yet made). Operator-owned work that could
  start today is `ready`, not `blocked`.
- `Status`: an annotation, not a paragraph — one clause, 12 words or fewer, current
  as of this render. Date-gated items name the date; blocked items name the blocker;
  in-flight items name the current step only. The full narrative lives in `NEXT.md`,
  never in this column.
- `GH issue`: only when the backlog Source column cites one (`Issue #18` → `#18`),
  else `—`.

**Part 2 — one list per backlog tier below Tier 1** (whatever tiers the file
currently has), each headed `**Tier N**`, one line per item, items separated by ` · `.
Each entry: row number, short name, then a parenthesised compact status and issue ref
if any, e.g. `10 ITSA phase 1 (blocked on 10a; #16, #20)`.

**Part 3 — the open alarm issues, grouped.** Run
`gh issue list --state open --label alarm --limit 200 --json number,title,createdAt,updatedAt`
(titles are `[ALARM] <alarm name>`). Parse each name into environment (`ci`/`prod`), scope
(`env` or a deployment name such as `prod-b2bad16`), and family (the alarm name with the
deployment segment removed, e.g. `app-api-5xx`, `env-salt-secret-unexpected-read`). One row per
family, deployment-scoped and environment-scoped kept apart:

| Family | Issues | Exists now | Recommended action | NEXT.md item |

- `Exists now`: whether the alarm still exists — a deployment-scoped alarm on a destroyed
  deployment does not (`gh run list --workflow destroy-ci.yml` and `NEXT.md`'s prod line say
  which deployments are gone; a read-only `aws cloudwatch describe-alarms` settles it when an
  SSO session exists, otherwise say "unverified").
- `Recommended action`: exactly one of `close as stale` (deployment gone or alarm type deleted),
  `close as superseded` (renamed or moved by landed work; name the new alarm), `fix` (name the
  file), `tune` (name the threshold or filter), `keep open and watch` (real signal, action
  pending elsewhere), `investigate` (needs logs or CloudTrail; say what).
- `NEXT.md item`: the label of the item that carries the action, or `new` when this render
  creates one.

## Rules

- Open and in-flight work only. Nothing done, decided-against, or removed.
- Never annotate an item "deferred", "later", or similar — its tier already says
  that. Status words describe state (open, in flight, blocked on X, operator-owned,
  date-gated), not priority.
- If a GitHub issue referenced by a row is known to be closed, drop the ref rather
  than list a dead issue; run `gh issue list --state open` to check only when the
  answer would change a row.
- End with one line for any open GitHub issue that is referenced from NEXT.md but is
  not a backlog row (e.g. a standing-drift issue), so the table stays complete without
  inventing rows.
- No commentary beyond the table, the lists, and that closing line, unless something
  in the session materially changed an item since the files were last written — then
  one sentence per such item, after the lists.
- **Keep `NEXT.md` in board order.** Its open items sit under five headings in this
  sequence: `## In flight`, `## Ready: Claude Code`, `## Ready: operator`,
  `## Blocked: operator`, `## Blocked: Claude Code`. Before rendering, move any item
  whose owner and state no longer match its heading (an operator item whose blocker
  landed moves up to `Ready: operator`; a Claude Code item that gained a blocker moves
  down to `Blocked: Claude Code`). That move is part of the write-back below.
- **Every alarm family has a home on `NEXT.md`.** A family whose action is `close as stale`
  or `close as superseded` joins the operator item that lists issues to close (create it if
  missing; keep the list current, adding new numbers and dropping closed ones). A family whose
  action is `fix`, `tune` or `investigate` gets its own Claude Code item under BACKLOG row 30
  (`B30<letter>`, next free letter) with the file or lookup it needs, the owner and the model
  tier, in the ready or blocked section its blocker dictates (an AWS lookup with no SSO session
  is blocked on `aws sso login --sso-session diyaccounting`). `keep open and watch` needs no
  item. Never close, label or comment on an issue from this skill; the operator closes them.
- **Write the statuses back.** The explanatory status lives in `NEXT.md`, not just in
  the rendering: after rendering, update any `NEXT.md` item whose entry no longer
  matches the status you just printed (same facts, prose fitted to the entry), commit
  the `NEXT.md`-only change to `main` (the docs exception allows a direct push) and
  push. Never add rendered status for items that are not on `NEXT.md`; the backlog's
  tier tables stay as they are.
