# PLAN_LANGUAGES

Status: LANG1 and LANG2 in flight (2026-11-10). No task is on main yet.

## User assertions (verbatim)

- "close this before the 19th with a language switch on the feedback" (operator, 2026-11-10, on HMRC Assist feedback in Welsh)
- "add a board task to research making all the diy sites multi-lingual with a list of languages we should support to reach communities where english may not be spoken but there are small businesses needing a place to file. include ranked changes in terms of language cover and how much of the site we internationalise and locate marketting oppertunities in those langauges." (operator, 2026-11-10)
- "Consider all the language stuff part of a new plan PLAN_LANGUAGES.md and use task naming to match. I don't want the HMC Assist approval plan to get caught up in this." (operator, 2026-11-10)

## Scope

The DIY Accounting sites in the languages of UK small businesses: submit (`web/public/`), the gateway (`../www.diyaccounting.co.uk/`) and spreadsheets (`../spreadsheets.diyaccounting.co.uk/`). Text that HMRC or Companies House supplies (field names, HMRC Assist messages, error text) is shown as they give it, in English or Welsh.

## Tasks

| Label | Task | State | Board |
|---|---|---|---|
| LANG1 | HMRC Assist feedback shown in Welsh and English, with a switch, before 2026-11-19 | in flight, `claude/wren-welsh` | NEXT.md |
| LANG2 | Research: languages ranked by reach, scope tiers ranked by cost, marketing per language, into `../private.diyaccounting.co.uk/strategy/RESEARCH_MULTILINGUAL_SITES.md` | in flight | NEXT.md |
| LANG3+ | The first tier LANG2 recommends, one row per change | blocked on LANG2 | not yet |

## Verification

- LANG1: browser tests for the switch (Welsh verbatim, HMRC order, at most five, one acknowledgement), the receipts page shows the language shown, `npm run test:hmrcAssistBehaviour-simulator`, then a ci deploy.
- LANG2: every figure in the report cites its source and date; the report proposes the LANG3 onward rows.
