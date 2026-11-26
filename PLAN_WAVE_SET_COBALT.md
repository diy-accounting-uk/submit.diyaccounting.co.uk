<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_WAVE_SET_COBALT: the CT600 track after CT47 and CT48

## Operator assertions (verbatim)

> Create a wave set from all the open tasks on the board that you can and this will not start until CT47 and CT48 are done.

(operator, 2026-11-26.) The answer that finalised the set (2026-11-26): scope A, the machine rows already on `NEXT.md` (26 rows); Bramble stays its own set.

## Status

defined 2026-11-26; approved 2026-11-26 (the operator's `/collab-loop cobalt`); building wave 1.

## The goal

Use what is paid for (the laptop, the subscriptions, the cloud workers) and spend least on what is billed by use. The rows are built and gated in local waves, then submit pays for one ci deployment and one prod deployment.

## The set

- **submit, 25 rows in waves**: CTL0, CT45, CT46, CH63, CTA1, CTN1, CTN3, CTS1, CTD1, CTD2, CTP3, CTA2, CTR2, CT49, CTL2, CTL5, CTL4, CTL10, CTL7, CTL9, CTV1, CTF1, CTN2, CTN4, CTL8. Each row's brief is its `NEXT.md` row; the CT600 label rows point to their section of `PLAN_CT600_LABELS.md`.
- **Beside**:
  - CTL1 (Opus): the label register is the appendix of `PLAN_CT600_LABELS.md`, a document pushed to `main`. It must be on `main` before wave 4 starts, because CTL2 reads it.
  - OCT8 (Haiku): the CH60 proof is a read of prod and a note in the private repository.
- **Left out, with the test that removed each**:
  - UH7 (test 1): the operator opens the CT600 to the public when this set is done (OCT9, 2026-11-26), so it follows the set on prod.
  - OS18g (test 4): the operator's yes and a click in his Chrome; no pull request.
  - CHL1 (test 4): it waits on live filings in December 2026 and January 2027.
  - OCT10, OCT11, OCTL1 (test 4): the operator's own filing, check and decision.

## Rules for this set

- **`fileCompanyTaxReturn.page.js` and `web/browser-tests/fileCompanyTaxReturn.browser.test.js` are owned by one batch, `ct600-page`, in every wave.** Most CT600 rows change them, so those rows run in series in that batch, wave after wave. No other batch of a wave edits them.
- **`i18n/cy.toml` is a registry.** Each row appends its own entries. The integrator keeps both sides on a conflict and runs `npm run build:welsh` once the wave has landed; nobody merges `web/public/lib/welsh-text.js` or `web/public/cy/` by hand.
- **CT45 and CT46 share `app/services/hmrcCtSubmissionStatus.js` and the CT600 routes' grants**, so they run in series in one batch, CT45 first.
- **CT46 changes `web/public/lib/utils/correlation-utils.js` in wave 1**, and CTA2 changes it in wave 2 from CT46's version.
- **CTN1 and CTN3 change no file that the CT600 page batch owns**: their tests go in the new `web/browser-tests/statusBubble.browser.test.js`.
- **CTP3 runs in the `ct600-page` batch**, because its "pending" warning changes the filing pages that CTS1, CTD1 and CTD2 change in the same wave.

## Waves

Batch branches are `claude/cobalt-w<nn>-<batch>`, from the wave branch `claude/cobalt-w<nn>`. Wave 1 branches from `origin/main`.

### Wave 1

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTL0 | Sonnet | `fileCompanyTaxReturn.page.js`, `web/public/css/long-period.css`, `fileCompanyTaxReturn.browser.test.js` |
| ct-backend | CT45, CT46 | Sonnet | `EdgeStack.java`, `CompaniesHouseStack.java`, their tests in `infra/test/java`, `app/services/hmrcCtSubmissionStatus.js`, `app/functions/hmrc/hmrcCtReturnPost.js`, `app/services/tokenEnforcement.js`, `web/public/lib/utils/correlation-utils.js`, `web/public/lib/services/api-client.js`, the alarm's stack |
| ch-poll | CH63 | Sonnet | `app/services/companiesHouseSubmissionStatus.js`, `web/public/lib/companies-house-gateway-poll.js`, the presenter poll Lambda, `fileMicroEntityAccounts.page.js` and `.html` |
| activities | CTA1 | Sonnet | `web/public/lib/services/catalog-service.js`, `web/public/index.page.js`, their tests |
| bubble | CTN1, CTN3 | Sonnet | `web/public/lib/utils/status-bubble.js` (new), `web/public/submit.js`, `web/public/widgets/status-messages.js`, `web/public/css/messages.css`, `web/browser-tests/statusBubble.browser.test.js` (new) |

State: building, from `claude/cobalt-w01` at 934e45b8f (2026-11-26 01:50 UTC). Cloud workers, each after its setup task `setup-934e45b`: harbour CTL0; dusk CT45 then CT46; anvil CH63; garnet CTA1; flint CTN1 then CTN3. Integrator: jasper. Beside: CTL1 by a local Opus agent (it reads the spreadsheets repository). Landed on `claude/cobalt-w01`: CTL0 (23ca564fc), CTA1 (7bca4c9c2), CH63 (e80cd8676), CT45 (a8c17c191), CH63 follow-up ch63b (fe659cb87), CTN1 (b1cb61566). Queued on jasper: ch63c, CT46, CTN3, ct45b (the WAF exemption matches the two CT600 paths exactly), ch63d, ctn1b; building: ctn3b (flint), ct46b (garnet), each from a review. Wave 2 rows done and held on their workers: CTS1, ctl0b, CTD1 (harbour), cts1b, CTA2, cta2b (dusk); harbour builds CTD2 then CTP3.

### Wave 2

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTS1, CTD1, CTD2, CTP3 | Sonnet | `fileCompanyTaxReturn.page.js` and `.html`, `web/public/lib/form-draft.js` (new), `web/public/privacy.html`, `web/public/lib/ct600-fields.js`, `fileMicroEntityAccounts.page.js`, `fileSmallCompanyAccounts.page.js`, `web/public/hmrc/receipt/receipts.page.js`, `web/public/companies-house/filings.html` and its page script, their tests |
| activities | CTA2 | Sonnet | `web/public/lib/services/viewer-settings.js`, `web/public/settings.page.js`, `correlation-utils.js`, their tests |

State: pending.

### Wave 3

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTR2, CT49 | Sonnet | `web/public/widgets/books-import.js`, `ct600-fields.js`, `fileCompanyTaxReturn.page.js`, the two accounts page scripts, `web/public/lib/prior-year-fill.js`, their tests |

State: pending.

### Wave 4

CTL1's register is on `main` (53e74f267).

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTL2, CTL5 | Sonnet | `ct600-fields.js`, `fileCompanyTaxReturn.page.js`, `web/unit-tests/ct600-fields.test.js`, `scripts/ct600-source-shots.mjs` (new), `web/public/images/ct600-sources/`, `package.json` |

State: pending.

### Wave 5

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTL4, CTL10 | Sonnet | `fileCompanyTaxReturn.page.js`, the shared field renderer (new, from CTL4's code), the two accounts pages and their scripts, their browser tests |

State: pending.

### Wave 6

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTL7, CTL9 | Sonnet | `ct600-fields.js` (`reviewAnswers`), `web/public/lib/filing-record.js`, `web/public/lib/filing-result-record.js`, `fileCompanyTaxReturn.page.js`, `app/services/ctComputationsIxbrl.js`, `app/services/accountsIxbrlCommon.js`, their tests |

State: pending.

### Wave 7

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTV1 | Sonnet | `fileCompanyTaxReturn.page.js`, `scripts/site-video-capture.js`, `scripts/video-walkthrough.js`, `videos/publish.json`, `web/public/videos/publish.json` |

State: pending.

### Wave 8

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTF1 | Sonnet | `fileCompanyTaxReturn.page.js`, `ct600-fields.js`, `behaviour-tests/steps/behaviour-hmrc-company-tax-return-steps.js`, `videos/file-company-tax-return-long-period.json` |

State: pending.

### Wave 9

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTN2 (Opus writes the failure classes and their text, then Sonnet builds the panel, on one worktree) | Opus, then Sonnet | `fileCompanyTaxReturn.page.js`, `web/public/lib/utils/dom-utils.js`, `messages.css`, the failure classes module (new), `web/public/lib/services/hmrc-ct-return-service.js` |

State: pending.

### Wave 10

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| ct600-page | CTN4 | Sonnet | the pages that call `showLoading()` (CT600, accounts, confirmation statement, the Companies House forms, `web/public/hmrc/itsa/`), their browser tests |

State: pending.

### Wave 11: the look wave

| Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|
| look | CTL8 | Sonnet | the guide and site screenshots, the `file-company-tax-return-*` and accounts recordings on the simulator, the CTV1 section times in both `publish.json` copies |

State: pending.

## Gates

- **Each wave branch**: the wave's generators (`npm run build:welsh` always; `build:static-content` when a page's text changed), then `scripts/batch-check.sh claude/cobalt-w<nn>` in one background command, then under the simulator lock, in series: `npm run test:companyTaxReturnBehaviour-simulator`, and `npm run test:fileMicroEntityAccountsBehaviour-simulator` for waves 1, 2, 3, 5 and 10.
- **The set branch** `claude/cobalt-set`: `scripts/batch-check.sh claude/cobalt-set`, every simulator behaviour suite in series under the lock, and `npm run test:fileMicroEntityAccountsBehaviour-proxy` inside an SSO window (`scripts/sso-check.sh` first).
- **CT45 and CT46** also pass `./mvnw spotless:check` and `./mvnw clean verify` on their wave.

## The push

1. Assemble `claude/cobalt-set` at the gated tip of wave 11 and run its gates.
2. Read the ci slots, push `claude/cobalt-set`, open one PR whose body lists the rows by wave, and run `/watch`.
3. **ci proof list**, run inside the set's self-destruct delay:
   - CT45: the CT600 preview and file requests on the ci set pass the WAF (a body over 8 KB to `/api/v1/hmrc/ct/return`), and the status route charges the token after a sandbox acceptance.
   - CT46: the `hmrc-ct-return-submitted` event of that sandbox filing carries `correlationId`, `irmark` and `receiptId` in the ci lake.
   - CTA1, CTA2: the activities page shows "Corporation Tax", and a second tab lists the same activities.
   - CTN1, CTN3: on the ci CT600 page, an error far down the page shows the bubble.
   - CTL4, CTL10: the Proof section of `PLAN_CT600_LABELS.md` on the CT600 page and the two accounts pages.
4. `/auto-merge` merges with `--merge`. `main`'s deploy is the one prod deploy; `deploy-finish.yml` destroys the outgoing prod set.
5. **prod proof list**:
   - CT45: the operator's preview of the amended CT600 on prod answers 200 and the file request passes the WAF (OCT10 is the operator's own filing).
   - CH63: the next live Companies House accounts filing's first poll reads pending, not an error.
   - CTA1: the operator's activities page on prod shows "Corporation Tax".

## After the deploy

- OCT10: the operator files the amended CT600 on prod.
- UH7: when the prod proof list passes, open the CT600 and the joint filing to the public, in its own PR (OCT9, decided 2026-11-26).
- CTL8's recordings go to the channel unlisted for the operator to watch (`video-publish`); public only after he has watched.
- OCTL1: the operator's roll-out decision, from the page on prod.

## When the set branch fails

Push a prefix: the tip of the last gated wave whose rows need nothing from the waves after it. Wave 1 alone is a valid prefix, and it carries CT45, which OCT10 needs. The waves after the prefix start the next set, rebased on the new `main`.
