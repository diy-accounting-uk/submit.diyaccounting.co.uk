<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_WAVE_SET_COMET: the rest of the CT600 track after cobalt

## Operator assertions (verbatim)

> Push a prefix: waves 1 to 8 plus AL37 and CTP4 ship first, and CTN2, CTN4, CTL1A and CTL8 start the next set.

> Build CTL1A now from the wave 8 head, and rebase it after CTN4.

(operator, 2026-11-26, 10:40 UTC.)

> there's a whole new optimisation direction on discovery and a massive oppertunity, this should be given to a fable sub-agent to research for all plugin platforms and board tasks for the comet plan to optimise for discovery

(operator, 2026-11-26, 19:00 UTC; the research is `../private.diyaccounting.co.uk/strategy/marketing/REPORT_PLUGIN_DISCOVERY_2026-11-26.md`.)

## Status

approved 2026-11-26 (the operator's words above); building. Wave 1 gated 9e71acfc0 (`claude/comet-w01`), wave 2 gated 6f1a8d763 (`claude/comet-w02`), wave 3 gated 7eea2145a (`claude/comet-w03`, equal to anvil's tested head 5db8429d0); the laptop branches are local and signed. Wave 4: CTL8 (the look pass, with WRD7 merged) split to bring delivery forward (operator, 2026-11-27): dusk does the review fixes, the typed recording and the walkthrough; cyclone, bugle and epoch record long-period, book and with-accounts at the same time from dusk's e83ea9691; anvil starts `claude/anvil-comet-w04` with dusk's fixes so far; the wave 4 gate is split across workers; the 42 simulator suites run in quarters on the wave 3 head now, so the final gate re-runs only the suites CTL8 touches; the ci proofs run in three lanes at once (signed-in browser: CTN2, CTL1A, WRD2; MCP and lake: DSC4, DSC5, DSC6; anonymous: DSC3). DASH60 and CSF1 ride the PR inside wave 3. Then `claude/comet-set`, one PR, the ci proofs, `/auto-merge`, the prod proofs.

## The goal

As for cobalt: the rows are built and gated in local waves, then submit pays for one ci deployment and one prod deployment.

## The set

- **submit, 18 rows in waves**: CTN2, CTN4, CTL1A, CTL1B, CTL8; for discovery in the assistants' directories DSC1, DSC2, DSC3, DSC4, DSC5 (wave 1) and DSC6 (wave 3; the operator's go, 2026-11-26); and for the customer wording of "book" and "books" WRD1 (wave 1), WRD2 to WRD6 (wave 3) and WRD7 (wave 4), from `../private.diyaccounting.co.uk/strategy/marketing/REPORT_BOOKS_WORDING_2026-11-26.md`. Each row's brief is its `NEXT.md` row; the CT600 rows also point to their section of `PLAN_CT600_LABELS.md`.
- **Beside** (no pull request): WRD0, the wording section of `CLAUDE.md` and the skills that point to it, which goes to `main` before wave 1 is dispatched because the other WRD rows, DSC3, DSC4 and DSC6 read it; and DSC2b, the ChatGPT half of the sweep's baseline, read in the operator's Chrome. It runs any time before ODSC1 publishes 0.1.7.
- **After the prod deploy**: ODSC1 (the operator submits plugin 0.1.7; it follows DSC1, DSC3 and DSC4 on prod and DSC2b), then DSC7 (the sweep that judges the name rule; it follows ODSC1 and DSC5 on prod). ODSC2 (the Claude listing text) waits on OOS17's listing and on DSC1 on `main`, not on this deploy. ODSC3 (Google's Connected Apps preview) waits on nothing in this set. DSC8 to DSC11 belong to the set after comet (the report's section 5.3).

## Rules for this set

- The rules of `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_WAVE_SET_COBALT.md` carry over: one batch owns `fileCompanyTaxReturn.page.js` and its browser test in every wave; `i18n/cy.toml` is a registry.
- Wave 1 branches from `main` at cobalt's merge, 7790dda02. CTN2, CTN4 and CTL1A were built from cobalt's wave heads; each rebases onto its wave branch before it lands.
- **The MCP files have one owner in a wave.** In wave 1 `plugin-listing` owns `plugins/**`, `mcp/test/plugin.test.js`, `web/public/mcp.html` and the sweep script; `mcp-tools` owns `mcp/lib/server.js`, `mcp/lib/hosted-tools.js`, `mcp/test/hosted-tools.test.js`, `mcp/test/prod-tool-answers.test.js` and the golden prompt set; `mcp-measure` owns `app/functions/mcp/mcpHttp.js`, `app/data/dynamoDbMcpSessionRepository.js`, `mcp/lib/handoff-tools.js`, `app/functions/analytics/dynamoStreamToFirehose.js` and the analytics Java. DSC3's sentence for an account with no book is in `hosted-tools.js`, so DSC4 writes it.
- **The wording rows own the text and no identifier.** They follow the customer wording section of `CLAUDE.md` (WRD0). Each sits in the batch that owns its files in its wave, after that batch's other rows: WRD1 after DSC3 (`mcp.html`, `plugins/**`), WRD5 after CTL1B (`ct600-fields.js`), WRD6 after DSC6 (`mcp/lib/**`), WRD7 before CTL8 (the scene scripts and `publish.json`). The `wording` batch of wave 3 owns the card, the site copy and the marketing text, which no other batch of that wave touches. No WRD row renames a file, an id, a route or a tool.
- **One row of a wave adds a capability comment** (DSC2 in wave 1), because `REPORT_CAPABILITIES.md` is generated and two branches that regenerate it conflict.

## Waves

### Wave 1

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| plugin-listing | DSC1, DSC3, DSC2, WRD1 | Sonnet | `plugins/diya-submit-chatgpt/**`, `plugins/diya-submit/**`, `mcp/test/plugin.test.js`, `web/public/mcp.html`, `scripts/plugin-directory-sweep.mjs` (new) and its unit test |
| mcp-tools | DSC4 (Opus writes the six descriptions and the prompt set, then Sonnet lands them) | Opus, then Sonnet | `mcp/lib/server.js`, `mcp/lib/hosted-tools.js`, `mcp/test/hosted-tools.test.js`, `mcp/test/prod-tool-answers.test.js`, `mcp/test/fixtures/golden-prompts.json` (new) and its test |
| mcp-measure | DSC5 | Sonnet | `app/functions/mcp/mcpHttp.js`, `app/data/dynamoDbMcpSessionRepository.js`, `mcp/lib/handoff-tools.js`, `app/functions/analytics/dynamoStreamToFirehose.js`, `TableChangeDelivery.java`, `BusinessViews.java`, the new view and the three count tests |
| ct600-page | CTN2 (Opus writes the failure classes and their text, then Sonnet builds the panel) | Opus, then Sonnet | `fileCompanyTaxReturn.page.js`, `web/public/lib/utils/dom-utils.js`, `messages.css`, the failure classes module (new), `web/public/lib/services/hmrc-ct-return-service.js` |

State: CTN2 built on harbour (`claude/harbour-ctn2` 4f06c130d), to rebase onto `main`; DSC1 to DSC5 and WRD1 not started.

### Wave 2

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTN4 | Sonnet | the pages that call `showLoading()` (CT600, accounts, confirmation statement, the Companies House forms, `web/public/hmrc/itsa/`), their browser tests |

State: CTN4 built on harbour (`claude/harbour-ctn4` d0b0bab33, on CTN2's commit).

### Wave 3

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| mcp-tools | DSC6, WRD6 | Sonnet | `mcp/lib/hosted-tools.js` (`PROD_HOSTED_TOOL_NAMES`, the instructions), `mcp/lib/server.js` (the new deadlines tool, the titles and descriptions), `mcp/test/hosted-tools.test.js`, `mcp/test/plugin.test.js`, `app/system-tests/mcpHosted.system.test.js`, `web/public/mcp.html`, `scripts/build-mtd-calendar.mjs` and the generated calendar, `mcp/server.json`, `web/public/.well-known/mcp/server-card.json`, `web/developer/mcp-api.html` (generated) |
| ct600-fields | CTL1A, CTL1B, WRD5 | Sonnet | `web/public/lib/ct600-fields.js`, `app/services/ctComputationsIxbrl.js`, the accounts iXBRL builders for the micro-entity lines, the ixds fixtures, their tests; the register appendix of `PLAN_CT600_LABELS.md` by the laptop |
| wording | WRD2, WRD3, WRD4 | Sonnet | `web/public/widgets/books-import.js`, `web/public/lib/company-books.js`, `web/public/lib/revision-downloads.js`, `web/public/hmrc/vat/submitVat.html` (the sign-in text), `web/public/companies-house/fileSmallCompanyAccounts.html` (one sentence), `web/public/submit.catalogue.toml` (one name), `web/public/faqs.toml`, `web/public/lib/guide-journeys.js`, `web/public/terms.html`, `web/public/privacy.html`, `web/public/spreadsheets.html`, `web/public/tools.html`, the generated `help.html` and `guide.html`, `web/marketing/marketing.toml` with `marketing.json` and `web/marketing/launch/*.md`, `web/browser-tests/booksImport.browser.test.js`, the two behaviour step files, `mcp/test/prod-tool-answers.test.js` (line 279 only) |

CTL1A builds now from cobalt's wave 8 head and rebases after CTN4 (operator, 2026-11-26). CTL1B takes its labels from HMRC's CT2024 package, because HMRC publishes no CT2025 package (operator, 2026-11-26).

State: CTL1A built on dusk (`claude/dusk-ctl1a-b` 1e4a8a06c, on `claude/dusk-ctl1a` 7fb42dff0); it rebases onto wave 2. CTL1B and WRD2 to WRD6 not started. DSC6 waits for the operator's go; without the go by the time wave 3 is gated, DSC6 leaves the set and the other rows ship.

### Wave 4: the look wave

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| look | WRD7, CTL8 | Sonnet | `videos/*.json` (the text of the scene scripts), the guide and site screenshots, the `file-company-tax-return-*` and accounts recordings on the simulator, the CTV1 section times in both `publish.json` copies |

State: pending.

## Gates

As for cobalt: each wave's generators, the split gates on the workers, the Docker build on the laptop, and the simulator suites the wave reaches; the set branch `claude/comet-set` runs every simulator suite. The discovery rows add: `npm ci` and `npm test` in `mcp/` (DSC1, DSC3, DSC4, DSC6), `npm run build:chatgpt-plugin` (DSC1, DSC3), `npm run capabilities:check` (DSC2), `./mvnw clean verify` once for the wave (DSC5), and `npm run test:mcpPrepareVatReturnBehaviour-simulator` and `npm run test:mcpHostedBehaviour-simulator` (DSC5, DSC6). The wording rows add: `npm run build:static-content` (WRD3, WRD7), `npm run marketing:build` (WRD4), `node scripts/build-developer-site.mjs` (WRD6), `npm run video:walkthrough -- --text` (WRD7), and the browser tests each row names.

## The push

1. Assemble `claude/comet-set` at the gated tip of wave 4, run its gates, push once, open one PR, `/watch`.
2. **ci proof list**: CTN1 and CTN2: a failure far down the CT600 page shows the bubble and the detail panel; CTL1A: a micro-entity sandbox filing carries the format's raw materials and staff costs lines, and the review shows box 85 and HMRC's declaration; DSC3: the tagged `mcp.html` address answers 200 and the session beacon carries the source; DSC4: the six descriptions that `tools/list` answers equal the committed text; DSC5: a session from Claude writes a lake row with client `claude`, and `v_mcp_sessions_by_client` returns it; DSC6: the reviewer account gets the due dates of a real company number and the micro-entity figures of `Precision Code Ltd`; WRD2: the VAT form's card reads "Fill from your records" in English and "Llenwi o’ch cofnodion" in Welsh, and a dropped DIYA-GL book fills the nine boxes.
3. `/auto-merge`, then the prod deploy.
4. **prod proof list**: DSC6: prod's connector lists the eleven tools to the reviewer account; DSC4 and DSC6: OpenAI's scan shows no held tool (ODSC1's step 2).

## After the deploy

- CTL8's recordings go to the channel unlisted for the operator to watch (`video-publish`); public only after he has watched.
- ODSC1, then DSC7, as the set's list says.
- WRD7: `npm run video:publish -- --sync-metadata`, then `--sync-metadata --apply`, writes the changed titles and descriptions to the channel.
