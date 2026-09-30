---
name: tax-sources
description: Gather and refresh the HMRC and HM Treasury sources behind the site's tax facts (calendar dates, thresholds, rates), one file per source with its gov.uk URL, retrieval date, a verbatim quote and the fact ids it supports. Invoke when a source is older than 30 days, when a page needs a new tax fact, or when the operator says "refresh the tax sources".
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# tax-sources

Every tax fact on the site (`web/public/mtd-calendar.html`, and any later rates page) rests on a
source file in `sources/`. A source file records a gov.uk page, the day it was read and the words on
the page that state the fact. A page is built from these files, and a unit test fails when a fact has
no source or its source is older than 30 days.

Run this skill in a session. Never run it in a workflow: an LLM call that commits to the repository
trips GitHub's abuse heuristics.

## Source file format

One JSON file per source at `.claude/skills/tax-sources/sources/<name>.json`. `<name>` is a short
kebab-case slug of the fact group (`itsa-mtd-over-50k`). The format carries no calendar-specific
field, so rates, allowances and any other tax figure use it unchanged.

```json
{
  "url": "https://www.gov.uk/guidance/...",
  "retrieved": "2026-09-30",
  "quote": "Text copied from the page, short, unbroken.",
  "facts": ["stable-fact-id"]
}
```

| Field | Rule |
|---|---|
| `url` | A gov.uk page. No other host. |
| `retrieved` | ISO date (`YYYY-MM-DD`) of the day the page was read. Maximum age 30 days. |
| `quote` | Verbatim page text, one or two sentences. Whitespace differences are ignored; wording is not. Table cells read left to right, row by row, as flat text. |
| `facts` | Stable fact ids the quote supports. An id never changes once a page uses it. |

Fact ids are kebab-case and carry the subject and the date or year they apply to
(`itsa-mtd-over-30k-2027-04`, `itsa-quarterly-update-deadlines`). The text, date and wording of a
fact live in the page that shows it (`scripts/build-mtd-calendar.mjs` for the calendar), never in the
source file. One page can need several files, one per quote. A fact can list in several files.

A fact with no gov.uk page that states it stays off the site. Say so in the report instead of
sourcing it elsewhere.

## Add a source

1. Find the gov.uk page. Start from `../spreadsheets.diyaccounting.co.uk/scripts/hmrc-rate-urls.cjs`
   (rate pages by tax year) and its `scripts/update-tax-data.sh`, or search with `site:gov.uk`.
2. Fetch it with the session's WebFetch, or `claude -p` with web search.
3. Copy the sentence that states the fact. A summary from a fetch tool can paraphrase, so the check
   below is the authority on whether the quote is verbatim.
4. Write the file with today's date and the fact ids.
5. Run `node scripts/verify-tax-sources.mjs <name>`. It fetches the page and exits 1 when the quote is absent.

## Refresh one source

1. `node scripts/verify-tax-sources.mjs <name>`. A pass means the page still says it.
2. On a pass, set `retrieved` to today. On a fail, fetch the page, read what it says now, and
   update `quote`. If the fact changed, update the fact's text in the page that uses it, and keep the
   id when the meaning is the same fact (a new rate for the same allowance) or add a new id when it
   is a new fact.
3. Rebuild the pages that use the source (`npm run build:mtd-calendar`) and commit the sources and the
   regenerated page together.

## Refresh all sources

1. `node scripts/verify-tax-sources.mjs` checks every file.
2. Refresh each file that failed as above, then set `retrieved` to today on the rest.
3. `npm run build:mtd-calendar`, then `npx vitest run web/unit-tests/mtdCalendar.test.js`.
4. Commit.

The 30-day limit makes the unit test fail once a source ages out. Refresh all before then.
