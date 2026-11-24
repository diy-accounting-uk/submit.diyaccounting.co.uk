<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: The Welsh site and its checks

## Operator assertions (verbatim)

> "The changes I want are: The FSB offer chain, the donators offer chain, the CT in prod chain." (operator, 2026-11-24)

The operator asked to keep only those three chains and the defects on `NEXT.md`. This plan holds the tasks that left it.

Recorded in the moved rows: the Cynnig Cymraeg email is the operator's to send (operator, 2026-11-22); the guide follows LANG14 (2026-11-22).

## Goal

The Welsh site gains a Welsh guide, and its Welsh text gets a free check from Helo Blod and a reply from the Welsh Language Commissioner.

**Status**: 3 open tasks (OLANG2, OLANG3, LANG17), tracked here, not on `NEXT.md`.

## Tasks

| Label | Class | State | Blocked by | Unblocks | Repository |
| --- | --- | --- | --- | --- | --- |
| OLANG2 | human-driven | ready | the operator makes the account and sends the text | nothing | none |
| OLANG3 | human-driven | ready | the operator sends the email | nothing | private |
| LANG17 | machine-only | ready | nothing | nothing | submit |

Model, size and repository are in each entry. "Blocked by" lists the tasks and events not yet done.

## Briefs

### OLANG2. Open a Helo Blod account and send one text for its free check

Helo Blod (Business Wales) translates 500 words a month and checks 1,000 words a year, free (`../private.diyaccounting.co.uk/strategy/marketing/WELSH_LISTINGS_AND_AWARDS_2026-11-22.md`, section 2). It needs a GOV.UK One Login and a Helo Blod and Me account in the business's name, which the operator makes. First text to check: the Welsh home page (`web/public/cy/index.html`) or the Welsh final declaration, which is a translation with no HMRC model. The checked text comes back to a session, which applies it to `i18n/cy.toml`. **Source**: LANG13's research, 2026-11-22. **Owner**: Operator (account, send), Claude Code (apply). **Model**: none. **Size**: 0 files. **Repository**: none. **Class**: human-driven. **State**: ready. **Blocked by**: the operator makes the account and sends the text. **Unblocks**: nothing.

### OLANG3. Send the Cynnig Cymraeg email

The operator reads `../private.diyaccounting.co.uk/strategy/marketing/DRAFT_EMAIL_CYNNIG_CYMRAEG.md` and sends it from antony@diyaccounting.co.uk to the Welsh Language Commissioner's address that the draft names. The reply (the next step and the fee) goes into a file beside the draft; a session then boards what it asks for. The draft is written and each fact in it was checked against the live site and the scheme's pages on 2026-11-22. **Source**: operator, 2026-11-22. **Owner**: Operator (send). **Model**: none. **Size**: 0 files. **Repository**: private. **Class**: human-driven. **State**: ready. **Blocked by**: the operator sends the email. **Unblocks**: nothing.

### LANG17. A Welsh copy of the guide

LANG14's Welsh privacy, terms, accessibility and help pages are live on prod (PR #860), and that row named the guide as the row that follows. Add `web/public/guide.html` to the Welsh build (`i18n/cy.toml`, `scripts/build-welsh-pages.mjs`, capability SITE-30), with the term decisions at the top of `cy.toml`; a term the sources do not settle is listed for a Welsh speaker. Then `npm run build:welsh`, the Welsh unit test, `npx playwright test --project=browser-tests web/browser-tests/welsh*.browser.test.js` and the Welsh proof on the simulator (`scripts/welsh-proof.mjs`). One agent at a time changes `i18n/cy.toml`. **Source**: LANG14, 2026-11-22. **Owner**: Claude Code. **Model**: Opus. **Size**: ~3 source files plus the rebuilt Welsh pages. **Repository**: submit. **Class**: machine-only. **State**: ready. **Blocked by**: nothing. **Unblocks**: nothing.

