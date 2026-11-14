<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: keep local test runs inside what the machine can carry

Status: proposal, waiting for the operator's choice of measures. Covers submit and spreadsheets.

## Operator assertion (verbatim)

> Investigate why these load problems occur and propose a strategy to avoid it.

## What happened on 2026-11-14

The load average rose to 27 at 15:02 and 40 at 15:44 UTC on 16 logical cores (8 physical). At 20:04, with nothing running, it was 0.8 and the timing probe took 2.7 seconds. Under load, tests failed by timeout in files no change touched:

- the spreadsheets pre-push browser suite timed out the `diya-gl-se-layouts` axe check (120 seconds) and reached 371 of 548 tests in 84 minutes;
- the submit batch check's browser suite reached 273 of 1299 tests in 90 minutes, with timeouts in `fileCompanyTaxReturn.browser.test.js`;
- the spreadsheets `calc` leg exited 1 after 9m49s; the same leg passed in 2m24s on a quiet machine;
- SC3's LibreOffice conversions hit their 60 second limit (`xslRoundtrip` in `app/lib/spreadsheet-runner.js` line 591);
- CU4b's `npm test` timed out one 5 second test.

## Causes

1. **Heavy suites ran at the same time, with nothing to stop them.** Between 14:30 and 15:45 the machine ran, together: up to ten sub-agents, several of them running a full `npm test`; the submit batch check (`maven verify`, `npm test`, then the browser suite); the spreadsheets pre-push suite (LibreOffice `calc`, then its browser suite); and SC3's LibreOffice generation. The only lock is the simulator lock for behaviour suites (`/tmp/submit-simulator.lock`). No lock covers browser suites, LibreOffice legs or full unit runs, and none spans the two repositories.
2. **Every browser test records a video, a trace and a screenshot, locally too.** Both `playwright.config.js` files set `video: { mode: "on" }` at 1280x1446, `screenshot: "on"`, and `trace: "on"`. Each recording runs an ffmpeg VP9 encoder at about one core, beside the Chromium renderer and the test server, so one browser worker uses about three cores.
3. **Each unit run takes a large share of the cores.** Submit's `vitest.config.js` sets `maxWorkers: "50%"` (8 forks). Spreadsheets sets 4 workers, and each can start a LibreOffice process. Four agents running `npm test` at once ask for 32 forks.
4. **Timeouts assume a quiet machine.** LibreOffice 60 seconds, Playwright 120 seconds (spreadsheets) and 300 seconds (submit), Vitest 5 seconds. At twice the quiet time a timeout fails a test with no defect, so a slow machine produces red runs that look like regressions.
5. **Local runs repeat what CI runs.** The batch check and the pre-push hook run browser suites that CI runs again as required checks on a clean runner.

## Measures

| # | Measure | Where | Effect |
|---|---|---|---|
| L1 | One machine-wide lock for heavy work: `lockf -k /tmp/diya-heavy.lock <command>` around each browser suite, LibreOffice leg, full `npm test` and `maven verify`, in `scripts/batch-check.sh`, the spreadsheets pre-push legs and every agent brief. It spans both repositories and every session. | both | heavy suites queue instead of running together |
| L2 | Local recording on failure only: `video` and `trace` set to `retain-on-failure` unless `CI` is set; `screenshot` stays `on` (the visual review reads it). | both `playwright.config.js` | about one core less per browser worker |
| L3 | Unit workers from the measured load: a helper sets `VITEST_MAX_WORKERS` to the free cores (16 minus the one-minute load average, halved, at least 1); agent briefs set 2. | both `vitest.config.js`, briefs | unit runs shrink when the machine is busy |
| L4 | The local batch check skips the browser gate unless the batch changes `web/`; CI's required browser check covers it. The spreadsheets pre-push keeps its scoped browser leg. | `scripts/batch-check.sh` | removes the longest local run |
| L5 | Measurements that need a quiet machine run in CI: SR9's twice-generated year-end becomes a dispatched job on a GitHub runner, not a local run. | spreadsheets workflow | no measurement depends on local load |
| L6 | The coordinator checks the probe (`CLAUDE.md`, "Reading machine load") before it starts a heavy suite and holds it when the probe takes more than twice its quiet time. | iterate and do-next skills | a slow machine delays work instead of failing it |

L1 and L2 address the causes that produced most of the load; L3 to L6 reduce what is left.
