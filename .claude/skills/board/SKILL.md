---
name: board
description: Render the open-work board — one table for NEXT.md items plus backlog tier 1, then tiers 2-5 as one-line lists. Invoke when the operator asks for the board, the open items, or "what's in flight".
---

# board

Render the current open-work board from `NEXT.md` and `BACKLOG.md` (both at the repo
root). Read both files fresh every time — never render from memory of an earlier turn.

## Output shape

Exactly two parts, in this order.

**Part 1 — a table** covering every open item in `NEXT.md` plus every row in the
backlog's Tier 1, deduplicated (a NEXT.md item that is also a tier 1 row gets one
combined row). Columns:

| # | Item | Tier | State | Status | GH issue |

- `#`: the backlog row number (`44`), the NEXT.md label (`B14a`), or both (`B44/44`).
  Backlog row numbers are NOT GitHub issue numbers — never conflate them.
- `Item`: a short name, not the row's full prose.
- `Tier`: the backlog tier (`T1`…`T5`), or `NEXT` for an item with no backlog row.
- `State`: exactly one word — `in-flight` (being worked right now), `ready` (nothing
  prevents starting it, whoever the owner is), or `blocked` (waiting on a date, a
  prerequisite item, or a decision not yet made). Operator-owned work that could
  start today is `ready`, not `blocked`.
- `Status`: the explanatory sentence — the most current state known, from NEXT.md,
  the backlog's Live status block, and anything this session has done that the files
  don't record yet. In-flight work in one compact clause; date-gated items name the
  date; blocked items name what they wait on.
- `GH issue`: only when the backlog Source column cites one (`Issue #18` → `#18`),
  else `—`.

**Part 2 — four lists**, headed `**Tier 2**` through `**Tier 5**`, one line per item,
items separated by ` · `. Each entry: row number, short name, then a parenthesised
compact status and issue ref if any, e.g. `10 ITSA phase 1 (blocked on 10a; #16, #20)`.

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
- **Write the statuses back.** The explanatory status lives in `NEXT.md`, not just in
  the rendering: after rendering, update any `NEXT.md` item whose entry no longer
  matches the status you just printed (same facts, prose fitted to the entry), commit
  the `NEXT.md`-only change to `main` (the docs exception allows a direct push) and
  push. Never add rendered status for items that are not on `NEXT.md`; the backlog's
  tier tables stay as they are.
