---
name: email-draft
description: Draft an email the operator sends in his own name (to HMRC, Companies House, a supplier, a customer, an early adopter) — on Opus at minimum, from checked facts, in his own voice taken from his recent sent mail and the thread it replies to, then cut to the shortest version that still reassures. Invoke when a row or the operator asks for an email draft, a reply, a follow-up, or "write to <someone>".
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# email-draft

An email from the operator speaks for the company to a person who owes it nothing. It must be
right, short and in his voice. The operator sends every email himself; this skill only writes
the draft.

## Model

Draft on Opus at minimum, in the main session or an Opus sub-agent. Use Fable when a fact needs
a web search (a regulator's current guidance, a published deadline, a person's role). Never hand
a draft to a Haiku or Sonnet agent.

## Context: what DIY Accounting Submit is

- **The company:** DIY Accounting Limited, company number 06846849, 37 Sutherland Avenue, Leeds,
  LS8 1BY. The operator is Antony Cartwright, director, antony@diyaccounting.co.uk.
- **The history:** Excel accounting software for UK sole traders and limited companies since
  2006 (`../spreadsheets.diyaccounting.co.uk`, the packages and the `diya-gl` engine).
- **The product:** DIY Accounting Submit (https://submit.diyaccounting.co.uk), a web service
  that files from the customer's own books. Live on prod for MTD VAT (HMRC reference
  CMQAA-531) and the Companies House registered office and email changes; other filings run
  on sandbox or preview. `web/public/mtd-calendar.html#availability` (built from
  `scripts/build-mtd-calendar.mjs`) is the current list of what files where.
- **The customer:** a small UK business or limited company that does its own books, without an
  agent.

## Where the current status is

| Fact | Source |
|---|---|
| Open work and what blocks it | `NEXT.md` (read in full) |
| A plan's design and decisions | `PLAN_*.md` at this repository's root |
| What files on prod, sandbox or preview | `web/public/submit.catalogue.toml`, `web/public/mtd-calendar.html` |
| The live deployment | `aws --profile diya-submit-prod ssm get-parameter --name /submit/prod/last-known-good-deployment` |
| Earlier drafts, sent copies, evidence | `../private.diyaccounting.co.uk/` (`companies-house/correspondence/`, `hmrc/<service>/`) |
| Companies House review evidence | `target/companies-house-review/<date>/` in the primary checkout |
| Every email in and out | the `corpus-loom` MCP, sources `mail-antony` and `mail-support` |

## Steps

1. **Read the thread.** Use `corpus-loom` `search` with the subject or the correspondent's
   address (`sources: ["mail-antony"]`), then `get_document` on each message, oldest first.
   Note what the other side asked for, in their words. Note what the operator already told
   them, so the draft does not repeat it, and what he promised, so the draft keeps the promise.
2. **Read his voice.** Fetch three to five of his recent sent emails (`label SENT`, the last
   two months), the same correspondent first. Note how he opens and closes, his sentence
   length, where he says "I" and where "we", and how he admits a mistake. Example, to the
   Companies House XML team on 2026-10-24: "Thank you for reviewing our accounts submissions
   and for the clear feedback and the screenshot, yes, I should have seen that." He signs
   with "Thanks," then his name, or "Antony." to someone he has written to before.
3. **Write the draft.** Answer exactly what they asked, in the order they asked it. Give the
   ask in one sentence. Give any reassurance in one short paragraph: what changed and how it
   was checked, without a list of every fix. The reader's time is the cost.
4. **Facts pass.** Check every number, date, reference, name and claim against its source
   in the table above, and the figures against the repository or the evidence folder. Delete
   a claim you cannot source. Check what the reader already has, and do not repeat it unless a
   second reader needs it.
5. **Prose pass.** Apply the writing rules in `CLAUDE.md` and
   `.claude/skills/plain-prose/SKILL.md`: the fact first, no stance words, no narration of the
   work, no rule of three, no restatement at the end.
6. **Voice pass.** Adapt the draft to the friendlier side of his own voice from step 2: warm
   and direct, "please could you", "we'd be grateful", "happy to answer anything else". Assume
   the reader is a person who knows the context, and repeat context only where another reader
   or an AI triage might pick it up.
7. **Save and show.** Write the draft to its file in `../private.diyaccounting.co.uk/` (one
   line per paragraph, never hard-wrapped; a header block above `---` holds the routing
   notes). Commit it there. Show the email text in the reply, then the open command:
   `! subl <absolute path>`. When the operator says it is sent, rename the file from `DRAFT_`
   to `EMAIL_`, add the `Sent:` line, and update the `NEXT.md` row.

## Lengths that worked

- A retest request to the Companies House XML team: a greeting, one line, the four submission
  numbers, two short paragraphs, the close.
- An answer to HMRC SDST's two intake questions: the product name, one paragraph of background
  in news style (what it does first, then who it is for), one sentence of ask.
