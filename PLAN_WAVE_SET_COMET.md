<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_WAVE_SET_COMET: the rest of the CT600 track after cobalt

## Operator assertions (verbatim)

> Push a prefix: waves 1 to 8 plus AL37 and CTP4 ship first, and CTN2, CTN4, CTL1A and CTL8 start the next set.

> Build CTL1A now from the wave 8 head, and rebase it after CTN4.

(operator, 2026-11-26, 10:40 UTC.)

## Status

approved 2026-11-26 (the operator's words above); building: the rows build now on the cloud workers, and the waves land on cobalt's merge commit on `main`.

## The goal

As for cobalt: the rows are built and gated in local waves, then submit pays for one ci deployment and one prod deployment.

## The set

- **submit, 5 rows in waves**: CTN2, CTN4, CTL1A, CTL1B, CTL8. Each row's brief is its `NEXT.md` row and its section of `PLAN_CT600_LABELS.md`.

## Rules for this set

- The rules of `PLAN_WAVE_SET_COBALT.md` carry over: one batch owns `fileCompanyTaxReturn.page.js` and its browser test in every wave; `i18n/cy.toml` is a registry.
- Wave 1 branches from `main` once cobalt has merged. Rows built before then rebase onto it before they land.

## Waves

### Wave 1

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTN2 (Opus writes the failure classes and their text, then Sonnet builds the panel) | Opus, then Sonnet | `fileCompanyTaxReturn.page.js`, `web/public/lib/utils/dom-utils.js`, `messages.css`, the failure classes module (new), `web/public/lib/services/hmrc-ct-return-service.js` |

State: CTN2 built on harbour (`claude/harbour-ctn2` 4f06c130d); CTN4 building next.

### Wave 2

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTN4 | Sonnet | the pages that call `showLoading()` (CT600, accounts, confirmation statement, the Companies House forms, `web/public/hmrc/itsa/`), their browser tests |

State: queued on harbour after CTN2.

### Wave 3

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-fields | CTL1A, CTL1B | Sonnet | `web/public/lib/ct600-fields.js`, `app/services/ctComputationsIxbrl.js`, the accounts iXBRL builders for the micro-entity lines, the ixds fixtures, their tests; the register appendix of `PLAN_CT600_LABELS.md` by the laptop |

CTL1A builds now from cobalt's wave 8 head and rebases after CTN4 (operator, 2026-11-26). CTL1B takes its labels from HMRC's CT2024 package, because HMRC publishes no CT2025 package (operator, 2026-11-26).

State: CTL1A built (`claude/dusk-ctl1a` 7fb42dff0) but answer 3; ctl1a-b building on dusk.

### Wave 4: the look wave

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| look | CTL8 | Sonnet | the guide and site screenshots, the `file-company-tax-return-*` and accounts recordings on the simulator, the CTV1 section times in both `publish.json` copies |

State: pending.

## Gates

As for cobalt: each wave's generators, the split gates on the workers, the Docker build on the laptop, and the simulator suites the wave reaches; the set branch `claude/comet-set` runs every simulator suite.

## The push

1. Assemble `claude/comet-set` at the gated tip of wave 4, run its gates, push once, open one PR, `/watch`.
2. **ci proof list**: CTN1 and CTN2: a failure far down the CT600 page shows the bubble and the detail panel; CTL1A: a micro-entity sandbox filing carries the format's raw materials and staff costs lines, and the review shows box 85 and HMRC's declaration.
3. `/auto-merge`, then the prod deploy.

## After the deploy

- CTL8's recordings go to the channel unlisted for the operator to watch (`video-publish`); public only after he has watched.
