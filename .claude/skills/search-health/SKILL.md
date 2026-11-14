---
name: search-health
description: Check the health of every site in Google Search Console, Bing Webmaster Tools and the local page checks, rank the fixes by the impressions of the pages they touch, write one report, and propose a board row for each fix. Invoke when a webmaster tool emails about a site, when the operator asks how the sites do in search, or monthly.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-61 Optimise the sites from the two webmaster tools and local checks
- **Use when:** a Search Console or Bing Webmaster Tools email names a site, or the operator asks how the sites do in search, what to fix first, or whether a crawl setting, coverage drop or sitemap error is real.
- **Does:** search-health runs the Search Console report, the Bing report, and the local page checks for the six sites. It joins the findings to the impressions and clicks of the pages, ranks the fixes by those impressions, writes one report to the private repository, and proposes one board row per fix without adding it.
- **Run:** `/search-health`
- **Entry:** `.claude/skills/search-health/SKILL.md`
- **Files:** .claude/skills/search-health/SKILL.md, infra/google/searchconsole/searchconsole-report.js, infra/bing/webmaster-report.js, scripts/search-health-check.mjs
- **Keywords:** search health, search console, bing webmaster, seo fixes, crawl politeness, coverage drop, sitemap error, webmaster email, ranked fixes
- **Related:** DATA-69, DATA-76, DATA-77, DEV-57
@end-capability -->

# search-health

`/search-health`. One run reads three sources, joins them by page URL, ranks the fixes by the
impressions of the pages they touch, and writes one report. It changes nothing on any site and
writes nothing to Google or Bing.

## The three sources

| Source | Command | Output | Needs |
|--------|---------|--------|-------|
| Search Console | `GOOGLE_CLOUD_PROJECT=diyaccounting-ga4 scripts/gcp-as-sso.sh node infra/google/searchconsole/searchconsole-report.js --out target/searchconsole-report.json` | 90 days of queries and pages, and the URL Inspection answer for each sitemap URL | AWS SSO login |
| Bing Webmaster Tools | `npm run bing:report-prod -- --out target/bing-webmaster-report.json` | queries, pages, traffic, crawl statistics, crawl issues, feeds, crawl settings, URL information | AWS SSO login (or `BING_WEBMASTER_API_KEY` set) |
| Local checks | `npm run search:health` | the checks of both tools that need no account, for every sitemap URL of the six sites | the network |

## Steps

1. Run the SSO check from the `campaign` skill. Ask for `aws sso login --sso-session diyaccounting` only when a check fails.
2. Run the Search Console report from the table. It takes some minutes, because it inspects each sitemap URL.
3. Run `npm run bing:report-prod -- --out target/bing-webmaster-report.json` after the SSO check of step 1. When it cannot run, write "Bing report not run" with the reason at the top of the report and use the Bing console for the questions in "What a webmaster email means". The wrapper reads the key from AWS Secrets Manager when the variable is unset. A session never creates the key.
4. Run `npm run search:health`. It makes one request at a time per host and takes about three minutes. Read the summary it prints. The full findings are in `target/search-health-check.json`.
5. Join the findings to the impressions. This command reads the three files, and works when the Search Console or Bing file is missing:

```bash
node --input-type=module <<'JS'
import fs from "node:fs";
const read = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
const local = read("target/search-health-check.json");
const google = read("target/searchconsole-report.json");
const bing = read("target/bing-webmaster-report.json");
const impressions = new Map();
const add = (key, n) => impressions.set(key, (impressions.get(key) ?? 0) + n);
for (const property of google?.properties ?? []) for (const row of property.pages) add(row.key, row.impressions);
for (const site of bing?.reports ?? []) for (const row of site.pages ?? []) add(row.key, row.impressions);
const fixes = new Map();
for (const site of local.sites) {
  for (const found of site.issues) {
    const id = `${site.host} ${found.check}`;
    const fix = fixes.get(id) ?? { id, urls: new Set(), severity: found.severity };
    fix.urls.add(found.url);
    fixes.set(id, fix);
  }
}
const ranked = [...fixes.values()].map((fix) => ({
  fix: fix.id,
  severity: fix.severity,
  pages: fix.urls.size,
  impressions: [...fix.urls].reduce((sum, url) => sum + (impressions.get(url) ?? 0), 0),
}));
ranked.sort((a, b) => b.impressions - a.impressions || b.pages - a.pages);
console.table(ranked);
JS
```

6. Add the findings that come from the two tools and not from the local checks. From Search Console: each `inspections` row whose `verdict` is not `PASS`, whose `coverageState` names a problem, or whose `canonicalMatches` is `false`. From Bing: each row of `issues`, any `crawl.totals.code4xx`, `code5xx` or `blockedByRobotsTxt` above zero, a `feeds` row whose `status` is not `Success`, and any entry under `errors`. Give each the impressions of its page from the same two reports.
7. Write `../private.diyaccounting.co.uk/strategy/marketing/SEARCH_HEALTH_<yyyy-mm-dd>.md` (the private repository, never this one). It holds:
   - the date, which of the three sources ran, and the range of the Search Console data;
   - one table per site: sitemap URLs, impressions and clicks per engine, and the count of findings per check;
   - the ranked fixes: for each, the check, the pages, their impressions, the evidence (the value found, from the JSON), and the file or generator that owns the page. Pages of this site are in `web/public/`; `scripts/build-sitemaps.cjs` owns the sitemaps; the spreadsheets, diya-gl and gateway pages are generated in their own repositories (`../spreadsheets.diyaccounting.co.uk`, `../www.diyaccounting.co.uk`), so name the generator there and read it first;
   - the Bing crawl settings of each site, as read.
8. Propose one board row for each fix, in the form of the rows on `NEXT.md` (label, bold title, the evidence, **Source**, **Owner**, **Model**, **Size**, **Repository**). Put the proposed rows at the end of the report under "Proposed board rows". Do not edit `NEXT.md` or any `PLAN_*.md`; the coordinator adds the rows.
9. Reply with the highest-impression fix first, the count of fixes, and the path of the report.

## What a webmaster email means

Answer each from the reports. Open a console only for what the APIs do not give.

| Email | What it means | How to check |
|-------|---------------|--------------|
| Bing "Crawl politeness issues" | Bing says its crawler may have been slowed, or that a `Crawl-delay` or the crawl-rate setting limits it | `npm run search:health` reports any `Crawl-delay` and whether Googlebot and Bingbot may fetch each sitemap URL. In the Bing report, read `settings.crawlRate` (24 hourly values) and `crawl.totals`. A flat default rate, no `Crawl-delay`, and `code2xx` far above `code4xx`, `code5xx` and `blockedByRobotsTxt` means nothing to change. |
| Search Console "Page indexing" or coverage drop | Google indexes fewer URLs than before | Read `inspectionSummary` and each `inspections` row of the Search Console report: `coverageState`, `robotsTxtState`, `canonicalMatches`. A URL Google leaves out and the local checks flag (`robots-meta`, `x-robots-tag`, `canonical`, `http-status`) is the cause. Compare `crawl.latest[].inIndex` in the Bing report for the same period. |
| Search Console or Bing sitemap error | An engine could not read or fetch a submitted sitemap | `GOOGLE_CLOUD_PROJECT=diyaccounting-ga4 scripts/gcp-as-sso.sh node infra/google/searchconsole/searchconsole-sync.js --sitemaps-only` (it reads only, without `--apply`) prints each sitemap's last download, errors and warnings. In the Bing report read `feeds[].status` and `urlCount`. The local `sitemap` and `hreflang` checks read the live file. |
| Either tool, "security issue" or "manual action" | A person at the engine flagged the site | The APIs do not give it. Open the tool's console, read the message, and write the finding into the report. |

The Search Console Page indexing counts, Core Web Vitals field data, the Bing Site Scan and the Bing
AI Performance report have no method in the APIs this skill calls. Lighthouse gives lab figures:
`npm run accessibility:lighthouse-multi-prod`. When one of those is the question, open the console
read-only (`mcp__claude-in-chrome__*`), click nothing that changes a setting, and say in the report
that the figure came from the console.

## Rules

- Read-only. No Google, Bing or AWS write, no sitemap submission, no setting changed.
- The Bing key stays in the environment. Never print it, never write it to a file or a command line that is logged.
- Every figure in the report comes from a file this skill produced. Say which.
- Never narrow a finding on judgement: a finding on a page of a sibling repository is a row too, with that repository named.
