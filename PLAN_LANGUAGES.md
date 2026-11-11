<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_LANGUAGES

Status: LANG1 is on prod since PR #792 (3f4b0e02, prod-3f4b0e0). LANG2 is done: `../private.diyaccounting.co.uk/strategy/RESEARCH_MULTILINGUAL_SITES.md` (private commit 7af3f84), recommending tier A in six languages. LANG3, LANG4 and LANG6 are on `NEXT.md`. Dropped by the operator on 2026-11-10: every language but Welsh; right-to-left languages (Urdu, Arabic, Panjabi in Shahmukhi) and their layout work, video captions, and in-language keyword research.

## User assertions (verbatim)

- "close this before the 19th with a language switch on the feedback" (operator, 2026-11-10, on HMRC Assist feedback in Welsh)
- "add a board task to research making all the diy sites multi-lingual with a list of languages we should support to reach communities where english may not be spoken but there are small businesses needing a place to file. include ranked changes in terms of language cover and how much of the site we internationalise and locate marketting oppertunities in those langauges." (operator, 2026-11-10)
- "I only want to support welsh" (operator, 2026-11-10)
- "Drop LANG7 LANG8 LANG5 (and any Right-to-left languages)" (operator, 2026-11-10)
- "Consider all the language stuff part of a new plan PLAN_LANGUAGES.md and use task naming to match. I don't want the HMC Assist approval plan to get caught up in this." (operator, 2026-11-10)

## Scope

Welsh only (operator, 2026-11-10).

The DIY Accounting sites in the languages of UK small businesses: submit (`web/public/`), the gateway (`../www.diyaccounting.co.uk/`) and spreadsheets (`../spreadsheets.diyaccounting.co.uk/`). Text that HMRC or Companies House supplies (field names, HMRC Assist messages, error text) is shown as they give it, in English or Welsh.

## Tasks

| Label | Task | State | Board |
|---|---|---|---|
| LANG1 | HMRC Assist feedback shown in Welsh and English, with a switch | on prod, PR #792 | — |
| LANG2 | Research into `../private.diyaccounting.co.uk/strategy/RESEARCH_MULTILINGUAL_SITES.md` | done, private 7af3f84 | — |
| LANG3 | Welsh scaffold: catalogue, `/cy/` pages, `hreflang`, switch | submit on prod, PR #794; www in flight | NEXT.md LANG3w |
| LANG4 | Tier A copy in Welsh | submit on prod, PR #794; www in flight | NEXT.md LANG3w |
| LANG6 | HMRC's Welsh services on the Welsh pages | submit on prod, PR #794; www in flight | NEXT.md LANG3w |

## Verification

- LANG1: browser tests for the switch (Welsh verbatim, HMRC order, at most five, one acknowledgement), the receipts page shows the language shown, `npm run test:hmrcAssistBehaviour-simulator`, then a ci deploy.
- LANG2: every figure in the report cites its source and date; the report proposes the LANG3 onward rows.
