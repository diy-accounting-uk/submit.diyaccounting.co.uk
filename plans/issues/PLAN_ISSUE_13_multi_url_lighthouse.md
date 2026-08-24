# PLAN: Issue #13 (pre-migration #703) — Multi-URL Lighthouse

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/13
> Original body: expand Lighthouse to run against every sitemap URL, not just home. Two candidate approaches: custom script iterating `sitemap.xml`, or `@lhci/cli` (Lighthouse CI) which supports multi-URL natively.
> Existing plans: `_developers/backlog/IMPLEMENTATION_PLAN_PRODUCTION_HARDENING.md` mentions weekly compliance.

## Elaboration

Current state (from recon):
- Lighthouse is run in `.github/workflows/compliance.yml` weekly (Monday 6am UTC).
- Only the home page is audited.
- Sitemap lives at `web/public/sitemap.xml` (statically maintained, ~73 lines, enumerates ~15 pages).
- Pa11y already runs a broader URL set via `.pa11yci.*.json`.

Gap: SEO/performance regressions on deep pages (e.g. `/bundles.html`, `/hmrc/vat/submitVat.html`, `/guide.html`) are invisible because Lighthouse never visits them. Since the submit app grows via the bundles/passes/activities funnel, the pages most likely to affect conversion are exactly the ones not being audited.

## Likely source files to change

- `.github/workflows/compliance.yml` — add a Lighthouse CI step (or expand the existing Lighthouse step) that iterates `sitemap.xml`.
- New `lighthouserc.json` (or `.lighthouserc.json`) — Lighthouse CI config: URL list, thresholds per category (SEO ≥ 95, Perf ≥ 80, A11y ≥ 95, Best-practices ≥ 95).
- New `scripts/lighthouse-from-sitemap.sh` (or `.js`) — reads `web/public/sitemap.xml`, emits URL list consumable by LHCI or the ad-hoc script.
- `package.json` — add `lighthouse:multi` script.

## Likely tests to change/add

- The Lighthouse CI report itself is the test. No unit test needed.
- Optional: an assertion in CI that the set of URLs tested equals the set of sitemap URLs (prevents silent drops when sitemap changes but config doesn't).

## Likely docs to change

- `_developers/backlog/IMPLEMENTATION_PLAN_PRODUCTION_HARDENING.md` — update Phase 3.
- `accessibility.html` — mention expanded coverage.
- `REPORT_ACCESSIBILITY_PENETRATION.md` — expand the compliance section.

## Acceptance criteria

1. On weekly compliance run, Lighthouse audits every URL listed in `web/public/sitemap.xml` (currently ~15 URLs).
2. A per-URL HTML report is uploaded as a GitHub Actions artifact.
3. A fail threshold per category blocks the workflow: Perf ≥ 80, A11y ≥ 95, SEO ≥ 95, Best-practices ≥ 95. Thresholds configurable.
4. CI duration grows by ≤10 min (each URL is ~30 s; 15 × 30 s = 7.5 min in series; parallelise 3-way → ~3 min).
5. A single script can be run locally (`npm run lighthouse:multi`) to reproduce the CI results.
6. Drift check: if `sitemap.xml` gains a URL that's not in the LHCI config, the workflow fails with a clear message.

## Implementation approach

**Recommended — adopt `@lhci/cli` with sitemap as the source of truth.**

1. Add `@lhci/cli` as a devDependency.
2. Create `lighthouserc.json`:
   ```json
   {
     "ci": {
       "collect": {
         "url": ["dynamically injected"],
         "numberOfRuns": 1
       },
       "assert": {
         "assertions": {
           "categories:performance": ["error", {"minScore": 0.80}],
           "categories:accessibility": ["error", {"minScore": 0.95}],
           "categories:seo": ["error", {"minScore": 0.95}],
           "categories:best-practices": ["error", {"minScore": 0.95}]
         }
       },
       "upload": { "target": "filesystem", "outputDir": "./target/lhci-reports" }
     }
   }
   ```
3. `scripts/lighthouse-from-sitemap.js` — parse `sitemap.xml` (use `xml2js` already in the repo's dep tree or a regex for `<loc>…</loc>`) and write the URL list into the LHCI config or pass as CLI args.
4. Compliance workflow: run `scripts/lighthouse-from-sitemap.js`, then `npx lhci autorun --config=lighthouserc.json`.
5. Add drift check: compare sitemap URL count with LHCI report count; fail if mismatch.

### Alternative A — custom script with `lighthouse` directly
Spawn `npx lighthouse --only-categories=seo,performance,accessibility,best-practices --output=html --output-path=… URL` per URL. More control, less UX. Works but loses LHCI's threshold-enforcement and upload features.

### Alternative B — treat SEO separately (seozoomy/sitebulb-like)
Run specialist SEO tools. Out of scope.

## Questions (for QUESTIONS.md)

- Q13.1: Thresholds — are 80/95/95/95 acceptable, or would you prefer tighter (e.g. 90/95/95/95 for Perf)?
- Q13.2: Run weekly (existing cadence) or every PR? (PR-level is more expensive but catches regressions sooner.)
- Q13.3: Run against `prod`, `ci`, or both? (Recommendation: `prod` weekly + `ci` on each PR against the diff-affected pages only.)
- Q13.4: Should the sitemap generator itself be automated (derive from file listing) so adding a page doesn't require a second sitemap edit?

## Good fit for Copilot?

Yes — entirely. Bounded workflow YAML + config + small script. Assign after Q13.1 and Q13.2 are answered.
