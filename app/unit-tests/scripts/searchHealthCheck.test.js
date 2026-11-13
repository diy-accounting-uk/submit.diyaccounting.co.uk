// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/searchHealthCheck.test.js

import { describe, test, expect } from "vitest";

import {
  CHECKS,
  SITES,
  parseArgs,
  parseSitemap,
  checkSitemap,
  checkHreflangPairs,
  parseRobots,
  robotsAllows,
  checkRobots,
  checkIndexNowKey,
  checkPage,
  countByCheck,
  renderSummary,
} from "../../../scripts/search-health-check.mjs";

const URL_ = "https://example.test/page.html";
const TITLE = "A page title of a fair length";
const DESCRIPTION = "A meta description that is long enough to pass the lower limit and short enough for the upper one.";

function pageHtml({ head = "", body = "<h1>Heading</h1>" } = {}) {
  const defaults = `<title>${TITLE}</title>
    <meta name="description" content="${DESCRIPTION}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="canonical" href="${URL_}" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"x"}</script>`;
  return `<!doctype html><html><head>${head || defaults}</head><body>${body}</body></html>`;
}

function check(html, extra = {}) {
  return checkPage({ url: URL_, status: 200, headers: {}, html, redirects: [], ...extra });
}

const checksOf = (result) => result.issues.map((found) => found.check);

describe("checkPage", () => {
  test("a page that meets every check has no issue", () => {
    expect(check(pageHtml()).issues).toEqual([]);
  });

  test("a non-200 status is an error and stops the page checks", () => {
    const result = check("", { status: 404 });
    expect(result.issues).toEqual([expect.objectContaining({ check: "http-status", severity: "error", value: "status 404" })]);
  });

  test("a redirect chain is a warning", () => {
    const result = check(pageHtml(), { redirects: ["301 https://example.test/new"] });
    expect(result.issues).toEqual([expect.objectContaining({ check: "redirect-chain", severity: "warning" })]);
  });

  test("a missing canonical, two canonicals and a relative canonical are errors", () => {
    const none = pageHtml({
      head: `<title>${TITLE}</title><meta name="description" content="${DESCRIPTION}"><meta name="viewport" content="width=device-width"><script type="application/ld+json">{"@type":"X"}</script>`,
    });
    expect(check(none).issues.map((found) => found.value)).toEqual(["no canonical link"]);
    const two = pageHtml({
      head: `<title>${TITLE}</title><meta name="description" content="${DESCRIPTION}"><meta name="viewport" content="width=device-width"><link rel="canonical" href="${URL_}"><link rel="canonical" href="${URL_}"><script type="application/ld+json">{"@type":"X"}</script>`,
    });
    expect(check(two).issues.map((found) => found.value)).toEqual(["2 canonical links"]);
    const relative = pageHtml({
      head: `<title>${TITLE}</title><meta name="description" content="${DESCRIPTION}"><meta name="viewport" content="width=device-width"><link rel="canonical" href="/page.html"><script type="application/ld+json">{"@type":"X"}</script>`,
    });
    expect(check(relative).issues[0].value).toContain("not absolute");
  });

  test("a canonical that points elsewhere is a warning that names the target", () => {
    const html = pageHtml().replace(`href="${URL_}"`, 'href="https://example.test/other.html"');
    expect(check(html).issues).toEqual([
      expect.objectContaining({ check: "canonical", severity: "warning", value: "canonical points to https://example.test/other.html" }),
    ]);
  });

  test("a robots meta with noindex and an X-Robots-Tag with noindex are errors", () => {
    const meta = pageHtml().replace("<title>", '<meta name="robots" content="index, noindex"><title>');
    expect(checksOf(check(meta))).toEqual(["robots-meta"]);
    expect(checksOf(check(pageHtml(), { headers: { "x-robots-tag": "noindex, nofollow" } }))).toEqual(["x-robots-tag"]);
    expect(checksOf(check(pageHtml().replace("<title>", '<meta name="robots" content="index, follow"><title>')))).toEqual([]);
  });

  test("a missing title is an error and a long title is a warning", () => {
    const missing = pageHtml().replace(/<title>.*<\/title>/, "");
    expect(check(missing).issues).toEqual([expect.objectContaining({ check: "title", severity: "error" })]);
    const long = pageHtml().replace(TITLE, "T".repeat(70));
    expect(check(long).issues).toEqual([expect.objectContaining({ check: "title", severity: "warning" })]);
  });

  test("a missing meta description is an error and a short or long one is a warning", () => {
    const missing = pageHtml().replace(/<meta name="description"[^>]*>/, "");
    expect(check(missing).issues).toEqual([expect.objectContaining({ check: "meta-description", severity: "error" })]);
    expect(check(pageHtml().replace(DESCRIPTION, "Short")).issues).toEqual([
      expect.objectContaining({ check: "meta-description", severity: "warning" }),
    ]);
    expect(check(pageHtml().replace(DESCRIPTION, "D".repeat(200))).issues).toEqual([
      expect.objectContaining({ check: "meta-description", severity: "warning" }),
    ]);
  });

  test("zero and two h1 elements are errors", () => {
    expect(check(pageHtml({ body: "<p>none</p>" })).issues).toEqual([expect.objectContaining({ check: "h1", value: "0 h1 elements" })]);
    expect(check(pageHtml({ body: "<h1>a</h1><h1>b</h1>" })).issues).toEqual([
      expect.objectContaining({ check: "h1", value: "2 h1 elements" }),
    ]);
  });

  test("JSON-LD that does not parse or has no type is an error and none at all is a warning", () => {
    const broken = pageHtml().replace('{"@context":"https://schema.org","@type":"WebPage","name":"x"}', "{not json");
    expect(check(broken).issues).toEqual([expect.objectContaining({ check: "json-ld", severity: "error" })]);
    const untyped = pageHtml().replace('"@type":"WebPage",', "");
    expect(check(untyped).issues).toEqual([expect.objectContaining({ check: "json-ld", value: "a JSON-LD block has no @type" })]);
    const none = pageHtml().replace(/<script type="application\/ld\+json">.*<\/script>/, "");
    expect(check(none).issues).toEqual([expect.objectContaining({ check: "json-ld", severity: "warning" })]);
  });

  test("JSON-LD with a typed node inside @graph passes", () => {
    const graph = pageHtml().replace(
      '{"@context":"https://schema.org","@type":"WebPage","name":"x"}',
      '{"@context":"https://schema.org","@graph":[{"@type":"Organization"}]}',
    );
    expect(check(graph).issues).toEqual([]);
  });

  test("a missing viewport tag is an error", () => {
    const html = pageHtml().replace(/<meta name="viewport"[^>]*>/, "");
    expect(check(html).issues).toEqual([expect.objectContaining({ check: "viewport", value: "viewport: missing" })]);
  });

  test("an image with no alt attribute is a warning and an empty alt is not", () => {
    const html = pageHtml({ body: '<h1>x</h1><img src="/a.png"><img src="/b.png" alt=""><img src="/c.png" alt="c">' });
    expect(check(html).issues).toEqual([expect.objectContaining({ check: "image-alt", value: "1 image(s) without alt: /a.png" })]);
  });

  test("internal links are returned once each, without fragments, mail links, other hosts or downloads", () => {
    const html = pageHtml({
      body: `<h1>x</h1>
        <a href="/a.html#top">a</a><a href="/a.html">a again</a><a href="b.html">b</a>
        <a href="https://other.test/x">other</a><a href="mailto:a@b.test">mail</a>
        <a href="/file.zip">zip</a><a href="https://example.test/c">c</a>`,
    });
    expect(check(html).links.sort()).toEqual(["https://example.test/a.html", "https://example.test/b.html", "https://example.test/c"]);
  });

  test("a commented-out script does not end the parse", () => {
    const html = pageHtml({ body: '<h1>x</h1><!-- <script>var x = 1;</script> --><img src="/a.png">' });
    expect(checksOf(check(html))).toEqual(["image-alt"]);
  });
});

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://example.test/</loc>
    <lastmod>2026-11-01</lastmod>
    <xhtml:link rel="alternate" hreflang="en-GB" href="https://example.test/" />
    <xhtml:link rel="alternate" hreflang="cy" href="https://example.test/cy/index.html" />
  </url>
  <url>
    <loc>https://example.test/cy/index.html</loc>
    <lastmod>2026-11-01T10:00:00Z</lastmod>
    <xhtml:link rel="alternate" hreflang="en-GB" href="https://example.test/" />
    <xhtml:link rel="alternate" hreflang="cy" href="https://example.test/cy/index.html" />
  </url>
</urlset>`;

describe("sitemap checks", () => {
  test("parseSitemap reads loc, lastmod and the hreflang alternates", () => {
    const { error, entries } = parseSitemap(SITEMAP);
    expect(error).toBeNull();
    expect(entries.map((entry) => entry.loc)).toEqual(["https://example.test/", "https://example.test/cy/index.html"]);
    expect(entries[0].lastmod).toBe("2026-11-01");
    expect(entries[0].alternates).toHaveLength(2);
  });

  test("a valid sitemap on the right host has no issue", () => {
    expect(checkSitemap(SITEMAP, "example.test", "https://example.test/sitemap.xml").issues).toEqual([]);
  });

  test("XML that does not parse and a wrong root are errors", () => {
    expect(checkSitemap("<urlset><url><loc>x</url></urlset>", "example.test", "https://example.test/sitemap.xml").issues[0]).toMatchObject({
      check: "sitemap",
      severity: "error",
    });
    expect(checkSitemap("<html></html>", "example.test", "https://example.test/sitemap.xml").issues[0].value).toContain("not urlset");
  });

  test("a loc on another host is an error", () => {
    const issues = checkSitemap(SITEMAP, "other.test", "https://other.test/sitemap.xml").issues;
    expect(issues.filter((found) => found.value.startsWith("loc is on example.test"))).toHaveLength(2);
  });

  test("a missing lastmod, a lastmod that is not a date and a repeated loc are warnings", () => {
    const xml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.test/a</loc></url>
      <url><loc>https://example.test/b</loc><lastmod>yesterday</lastmod></url>
      <url><loc>https://example.test/b</loc><lastmod>2026-11-01</lastmod></url></urlset>`;
    const values = checkSitemap(xml, "example.test", "https://example.test/sitemap.xml").issues.map((found) => found.value);
    expect(values).toEqual(["lastmod is missing", "lastmod is not a date: yesterday", "loc appears twice"]);
  });

  test("hreflang pairs: a missing return link and an alternate outside the sitemap are errors", () => {
    const entries = [
      {
        loc: "https://example.test/",
        lastmod: null,
        alternates: [
          { hreflang: "cy", href: "https://example.test/cy/" },
          { hreflang: "fr", href: "https://example.test/fr/" },
        ],
      },
      { loc: "https://example.test/cy/", lastmod: null, alternates: [] },
    ];
    const values = checkHreflangPairs(entries).map((found) => found.value);
    expect(values).toContain("cy alternate https://example.test/cy/ does not list this URL back");
    expect(values).toContain("fr alternate https://example.test/fr/ is not in the sitemap");
  });
});

const ROBOTS = `# comment
User-agent: Googlebot
User-agent: Bingbot
Allow: /
Disallow: /hmrc/

User-agent: *
Disallow: /

Sitemap: https://example.test/sitemap.xml
`;

describe("robots.txt checks", () => {
  test("parseRobots groups consecutive user agents and reads the sitemap lines", () => {
    const robots = parseRobots(ROBOTS);
    expect(robots.groups).toHaveLength(2);
    expect(robots.groups[0].agents).toEqual(["googlebot", "bingbot"]);
    expect(robots.sitemaps).toEqual(["https://example.test/sitemap.xml"]);
  });

  test("robotsAllows picks the named group, then the longest rule, and Allow wins a tie", () => {
    const robots = parseRobots(ROBOTS);
    expect(robotsAllows(robots, "Googlebot", "/about.html")).toBe(true);
    expect(robotsAllows(robots, "Googlebot", "/hmrc/x")).toBe(false);
    expect(robotsAllows(robots, "SomeOtherBot", "/about.html")).toBe(false);
    const tie = parseRobots("User-agent: *\nAllow: /a\nDisallow: /a\n");
    expect(robotsAllows(tie, "x", "/a")).toBe(true);
    const wildcard = parseRobots("User-agent: *\nDisallow: /*.json$\n");
    expect(robotsAllows(wildcard, "x", "/data.json")).toBe(false);
    expect(robotsAllows(wildcard, "x", "/data.json.html")).toBe(true);
  });

  test("a compliant robots.txt has no issue", () => {
    const issues = checkRobots(ROBOTS, {
      host: "example.test",
      sitemapUrl: "https://example.test/sitemap.xml",
      urls: ["https://example.test/", "https://example.test/about.html"],
    });
    expect(issues).toEqual([]);
  });

  test("a Crawl-delay, a missing Sitemap line and a blocked sitemap URL are errors", () => {
    const text = "User-agent: Bingbot\nCrawl-delay: 10\nDisallow: /private/\n";
    const issues = checkRobots(text, {
      host: "example.test",
      sitemapUrl: "https://example.test/sitemap.xml",
      urls: ["https://example.test/private/x.html"],
    });
    const values = issues.map((found) => found.value);
    expect(values).toContain("Crawl-delay 10 for bingbot");
    expect(values).toContain("no Sitemap line for https://example.test/sitemap.xml");
    expect(values).toContain("Bingbot may not fetch this sitemap URL");
    expect(values).not.toContain("Googlebot may not fetch this sitemap URL");
  });

  test("an empty robots.txt is an error", () => {
    expect(checkRobots("", { host: "example.test", sitemapUrl: null, urls: [] })[0].value).toBe("robots.txt holds no user-agent group");
  });
});

describe("checkIndexNowKey", () => {
  const KEY = "abc123";
  test("a 200 with the key is clean", () => {
    expect(checkIndexNowKey(200, `${KEY}\n`, KEY, "https://example.test/abc123.txt")).toEqual([]);
  });
  test("another status and another body are errors", () => {
    expect(checkIndexNowKey(404, "", KEY, "u")[0].value).toBe("the key file answers 404");
    expect(checkIndexNowKey(200, "other", KEY, "u")[0].value).toBe("the key file does not hold the key");
  });
});

describe("arguments and summary", () => {
  test("parseArgs reads the options and rejects an unknown site", () => {
    expect(parseArgs(["--site", "diya-gl.co.uk", "--out", "x.json", "--pause", "0", "--fail-on-errors"])).toEqual({
      sites: ["diya-gl.co.uk"],
      out: "x.json",
      pause: 0,
      failOnErrors: true,
    });
    expect(() => parseArgs(["--site", "nope.test"])).toThrow("Unknown site");
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown argument");
  });

  test("every check id used by the site list has a mirrored report named", () => {
    expect(SITES.map((site) => site.host)).toContain("submit.diyaccounting.co.uk");
    for (const name of [
      "http-status",
      "canonical",
      "robots-meta",
      "title",
      "h1",
      "json-ld",
      "viewport",
      "image-alt",
      "internal-link",
      "hreflang",
      "sitemap",
      "robots-txt",
      "indexnow",
    ]) {
      expect(CHECKS[name]).toBeTruthy();
    }
  });

  test("countByCheck and renderSummary list counts then each finding", () => {
    const issues = [
      { check: "h1", severity: "error", url: "https://example.test/a", value: "0 h1 elements" },
      { check: "h1", severity: "error", url: "https://example.test/b", value: "2 h1 elements" },
      { check: "title", severity: "warning", url: "https://example.test/a", value: "title is 70 characters" },
    ];
    expect(countByCheck(issues)).toEqual({ h1: 2, title: 1 });
    const lines = renderSummary([{ host: "example.test", urls: 2, issues, notes: [] }]);
    expect(lines[0]).toBe("example.test: 2 sitemap URLs, 3 findings");
    expect(lines).toContain("  h1: 2");
    expect(lines).toContain("    [error] h1 https://example.test/a 0 h1 elements");
  });
});
