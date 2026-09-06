# Plan: Capture 3 Demo Page Videos

## Status: superseded 2026-09-04. The simulator-page captures below are replaced by recording the main site with a human-audience Playwright pattern; the work is NEXT.md B17a.1–5.

## Goal

Capture high-quality demo videos of the 3 simulator journeys for use on the website and in marketing materials. Each video shows a guided walkthrough of the app operating against the HMRC sandbox simulator.

## Three Journeys

| Journey | Description | Key Steps |
|---------|-------------|-----------|
| `view-obligations` | Fetch and display VAT obligations from HMRC | Login, navigate to obligations, view results |
| `view-return` | Fetch and display a previously submitted VAT return | Login, navigate to return viewer, view return |
| `submit-vat` | Submit a new VAT return to HMRC | Login, fill in form, submit, view receipt |

## Existing Infrastructure

### Playwright Test (preferred approach)

- **Test file**: `behaviour-tests/captureDemo.behaviour.test.js`
- **Config**: `captureDemo` project in `playwright.config.js`
- **Command**: `npm run test:captureDemo-simulator`
- **Output**: `target/demo-videos/` (`.webm` files via Playwright video recording)
- **Video config**: 1280x1446 viewport, `video.mode: "on"`
- Manages local server lifecycle (HTTP, simulator, DynamoDB) via test hooks
- Uses the same helpers as other behaviour tests

### Standalone Script (alternative)

- **Script**: `scripts/capture-demo-videos.js`
- **Command**: `npx dotenv -e .env.simulator -- node scripts/capture-demo-videos.js`
- **Status**: Has import resolution issues with `@app/` path aliases (works in Playwright/Vitest but not standalone Node)
- Uses CSS injection to isolate iframe content for fullscreen recording
- 3-second hold on final frame for clean ending

### Simulator Page

- **Page**: `web/public/simulator.html`
- **Journey automation**: `web/public/widgets/simulator-journeys.js`
- Interactive demo buttons with pause/stop controls and pulsing highlight effects

## Implementation Plan

### Phase 1: Fix and validate captureDemo Playwright test

1. Run `npm run test:captureDemo-simulator` and capture output
2. If it fails, diagnose and fix (common issues: selector changes, simulator page updates, timing)
3. Verify all 3 journey videos are generated in `target/demo-videos/`
4. Check video quality and content

### Phase 2: Optimize video output

1. Review video dimensions and quality settings in `playwright.config.js`
2. Consider adding `page.waitForTimeout()` holds at key visual moments
3. Ensure journey steps have visible highlight effects for viewer clarity
4. Trim/crop videos if needed (post-processing script)

### Phase 3: CI integration (optional)

1. Add captureDemo job to `test.yml` (simulator-based, similar to other behaviour tests)
2. Upload video artifacts for download from CI
3. Consider caching or only running on specific triggers (manual dispatch)

## Dependencies

- Playwright browsers installed (`npx playwright install chromium`)
- `.env.simulator` environment (HTTP simulator, dynalite)
- No external network dependencies (all local)

## Notes

- The standalone `scripts/capture-demo-videos.js` can be updated later if `@app/` path alias resolution is fixed, but the Playwright test approach is the recommended path
- Videos are `.webm` format from Playwright; conversion to `.mp4` may be needed for web embedding
- The simulator page (`simulator.html`) already has the journey automation built in; the capture just needs to drive and record it
