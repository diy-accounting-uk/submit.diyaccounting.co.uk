// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Site configurations
const sites = {
  submit: {
    dir: path.join(process.cwd(), "web/public"),
    domain: "https://submit.diyaccounting.co.uk",
  },
};

// Helper: read file content
function readFile(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

// Helper: extract URLs from sitemap XML
function extractSitemapUrls(xml) {
  const urls = [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

// Helper: parse robots.txt directives
function parseRobotsTxt(content) {
  const lines = content.split("\n").map((l) => l.trim());
  const directives = { userAgents: [], allows: [], disallows: [], sitemaps: [] };
  for (const line of lines) {
    if (line.startsWith("#") || line === "") continue;
    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();
    const keyLower = key.toLowerCase().trim();
    if (keyLower === "user-agent") directives.userAgents.push(value);
    else if (keyLower === "allow") directives.allows.push(value);
    else if (keyLower === "disallow") directives.disallows.push(value);
    else if (keyLower === "sitemap") directives.sitemaps.push(value);
  }
  return directives;
}

// Helper: split robots.txt into groups of consecutive User-agent lines and the rules that follow
function parseRobotsGroups(content) {
  const groups = [];
  let current = null;
  let collectingAgents = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#") || line === "") continue;
    const [key, ...valueParts] = line.split(":");
    const keyLower = key.toLowerCase().trim();
    const value = valueParts.join(":").trim();
    if (keyLower === "user-agent") {
      if (!collectingAgents) {
        current = { agents: [], allows: [], disallows: [] };
        groups.push(current);
      }
      current.agents.push(value);
      collectingAgents = true;
    } else {
      collectingAgents = false;
      if (!current) continue;
      if (keyLower === "allow") current.allows.push(value);
      else if (keyLower === "disallow") current.disallows.push(value);
    }
  }
  return groups;
}

// Helper: check if a path is disallowed by robots.txt rules
function isDisallowed(urlPath, disallows) {
  return disallows.some((rule) => urlPath.startsWith(rule));
}

// Helper: extract JSON-LD from HTML
function extractJsonLd(html) {
  const blocks = [];
  const regex = /<script\s+type\s*=\s*"application\/ld\+json"\s*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // skip invalid JSON
    }
  }
  return blocks;
}

describe("Sitemap validation", () => {
  for (const [siteName, site] of Object.entries(sites)) {
    describe(`${siteName} site`, () => {
      const sitemapPath = path.join(site.dir, "sitemap.xml");

      it("sitemap.xml exists and is valid XML", () => {
        expect(fs.existsSync(sitemapPath), `${sitemapPath} should exist`).toBe(true);
        const xml = readFile(sitemapPath);
        expect(xml).toContain('<?xml version="1.0"');
        expect(xml).toContain("<urlset");
        expect(xml).toContain("</urlset>");
      });

      it("all sitemap URLs use the correct domain", () => {
        const xml = readFile(sitemapPath);
        const urls = extractSitemapUrls(xml);
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
          expect(url, `URL ${url} should start with ${site.domain}`).toMatch(new RegExp(`^${site.domain.replace(/\./g, "\\.")}`));
        }
      });

      it("no duplicate URLs in sitemap", () => {
        const xml = readFile(sitemapPath);
        const urls = extractSitemapUrls(xml);
        const unique = new Set(urls);
        expect(unique.size, `Found ${urls.length - unique.size} duplicate URLs`).toBe(urls.length);
      });

      it("no sitemap URLs are blocked by robots.txt", () => {
        const robotsPath = path.join(site.dir, "robots.txt");
        if (!fs.existsSync(robotsPath)) return; // skip if no robots.txt
        const robots = parseRobotsTxt(readFile(robotsPath));
        const xml = readFile(sitemapPath);
        const urls = extractSitemapUrls(xml);
        for (const url of urls) {
          const urlPath = new URL(url).pathname;
          expect(isDisallowed(urlPath, robots.disallows), `Sitemap URL ${url} is blocked by robots.txt Disallow rule`).toBe(false);
        }
      });
    });
  }
});

describe("robots.txt validation", () => {
  for (const [siteName, site] of Object.entries(sites)) {
    describe(`${siteName} site`, () => {
      const robotsPath = path.join(site.dir, "robots.txt");

      it("robots.txt exists", () => {
        expect(fs.existsSync(robotsPath), `${robotsPath} should exist`).toBe(true);
      });

      it("has User-agent: * directive", () => {
        const robots = parseRobotsTxt(readFile(robotsPath));
        expect(robots.userAgents).toContain("*");
      });

      it("has Sitemap directive pointing to correct URL", () => {
        const robots = parseRobotsTxt(readFile(robotsPath));
        const expectedSitemap = `${site.domain}/sitemap.xml`;
        expect(robots.sitemaps, `Should contain ${expectedSitemap}`).toContain(expectedSitemap);
      });
    });
  }

  describe("submit site robots.txt specific rules", () => {
    it("disallows /hmrc/, /auth/, /activities/, /errors/", () => {
      const robots = parseRobotsTxt(readFile(path.join(sites.submit.dir, "robots.txt")));
      expect(robots.disallows).toContain("/hmrc/");
      expect(robots.disallows).toContain("/auth/");
      expect(robots.disallows).toContain("/activities/");
      expect(robots.disallows).toContain("/errors/");
    });

    it("blocks no sitemap URL for any named agent", () => {
      const groups = parseRobotsGroups(readFile(path.join(sites.submit.dir, "robots.txt")));
      const urls = extractSitemapUrls(readFile(path.join(sites.submit.dir, "sitemap.xml")));
      const named = groups.filter((group) => !group.agents.includes("*"));
      expect(named.flatMap((group) => group.agents)).toEqual(expect.arrayContaining(["OAI-SearchBot", "ClaudeBot", "GPTBot"]));
      for (const group of named) {
        for (const url of urls) {
          const urlPath = new URL(url).pathname;
          expect(isDisallowed(urlPath, group.disallows), `${group.agents.join(", ")} is blocked from ${url}`).toBe(false);
        }
      }
    });

    it("repeats the six Disallow lines in every named group", () => {
      const groups = parseRobotsGroups(readFile(path.join(sites.submit.dir, "robots.txt")));
      const star = groups.find((group) => group.agents.includes("*"));
      expect(star.disallows).toHaveLength(6);
      for (const group of groups.filter((candidate) => !candidate.agents.includes("*"))) {
        expect(group.disallows, `${group.agents.join(", ")} should repeat the * Disallow lines`).toEqual(star.disallows);
      }
    });

    it("states the content signal once", () => {
      const lines = readFile(path.join(sites.submit.dir, "robots.txt")).split("\n");
      expect(lines.filter((line) => line.startsWith("Content-Signal:"))).toEqual([
        "Content-Signal: search=yes, ai-input=yes, ai-train=yes",
      ]);
    });
  });
});

describe("Meta tag validation", () => {
  for (const [siteName, site] of Object.entries(sites)) {
    describe(`${siteName} site index.html`, () => {
      const indexPath = path.join(site.dir, "index.html");

      it("has <title>", () => {
        const html = readFile(indexPath);
        expect(html).toMatch(/<title>.+<\/title>/);
      });

      it('has <meta name="description">', () => {
        const html = readFile(indexPath);
        expect(html).toMatch(/name\s*=\s*"description"/);
      });

      it('has <link rel="canonical"> (if applicable)', () => {
        const html = readFile(indexPath);
        // Gateway and spreadsheets sites may not have canonical on all pages yet
        if (siteName === "submit") {
          expect(html).toMatch(/rel\s*=\s*"canonical"/);
        }
      });
    });
  }

  describe("submit site sitemap-listed pages have <title>", () => {
    const sitemapXml = readFile(path.join(sites.submit.dir, "sitemap.xml"));
    const urls = extractSitemapUrls(sitemapXml);

    for (const url of urls) {
      const urlPath = new URL(url).pathname;
      const fileName = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
      const filePath = path.join(sites.submit.dir, fileName);

      it(`${fileName} has <title>`, () => {
        if (!fs.existsSync(filePath)) return;
        const html = readFile(filePath);
        expect(html, `${fileName} should have a <title> tag`).toMatch(/<title>.+<\/title>/);
      });
    }
  });

  describe("submit site sitemap-listed pages have <meta name='description'>", () => {
    const sitemapXml = readFile(path.join(sites.submit.dir, "sitemap.xml"));
    const urls = extractSitemapUrls(sitemapXml);

    for (const url of urls) {
      const urlPath = new URL(url).pathname;
      const fileName = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
      const filePath = path.join(sites.submit.dir, fileName);

      it(`${fileName} has <meta name="description">`, () => {
        if (!fs.existsSync(filePath)) return;
        const html = readFile(filePath);
        expect(html, `${fileName} should have a meta description`).toMatch(/name\s*=\s*"description"/);
      });
    }
  });
});

describe("Social tags and breadcrumbs on every sitemap page", () => {
  const sitemapXml = readFile(path.join(sites.submit.dir, "sitemap.xml"));
  const urls = extractSitemapUrls(sitemapXml);

  for (const url of urls) {
    const urlPath = new URL(url).pathname;
    const fileName = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
    const filePath = path.join(sites.submit.dir, fileName);

    describe(fileName, () => {
      const html = readFile(filePath);

      it("has Open Graph and twitter:card tags", () => {
        expect(html).toMatch(/<meta\s+property="og:title"\s+content="[^"]+"/);
        expect(html).toMatch(/<meta\s+property="og:description"\s+content="[^"]+"/);
        expect(html).toMatch(/<meta\s+property="og:type"\s+content="website"/);
        expect(html).toMatch(/<meta\s+property="og:site_name"\s+content="DIY Accounting"/);
        expect(html).toMatch(
          /<meta\s+property="og:image"\s+content="https:\/\/submit\.diyaccounting\.co\.uk\/images\/social\/og-[a-z-]+\.png"/,
        );
        expect(html).toMatch(/<meta\s+name="twitter:card"\s+content="summary_large_image"/);
        expect(html).toMatch(/<meta\s+property="og:url"\s+content="https:\/\/submit\.diyaccounting\.co\.uk\/[^"]*"/);
      });

      if (urlPath !== "/" && urlPath !== "/cy/index.html") {
        it("has a BreadcrumbList from the home page", () => {
          const breadcrumb = extractJsonLd(html).find((block) => block["@type"] === "BreadcrumbList");
          expect(breadcrumb, "should have a BreadcrumbList JSON-LD block").toBeTruthy();
          expect(breadcrumb.itemListElement[0].item).toBe("https://submit.diyaccounting.co.uk/");
          expect(breadcrumb.itemListElement.length).toBeGreaterThan(1);
        });
      }
    });
  }

  it("og-submit.png exists", () => {
    expect(fs.existsSync(path.join(sites.submit.dir, "images/social/og-submit.png"))).toBe(true);
  });
});

describe("Structured data validation", () => {
  it('submit index.html has JSON-LD with @type "WebApplication"', () => {
    const html = readFile(path.join(sites.submit.dir, "index.html"));
    const jsonLdBlocks = extractJsonLd(html);
    expect(jsonLdBlocks.length).toBeGreaterThan(0);
    const app = jsonLdBlocks.find((b) => b["@type"] === "WebApplication");
    expect(app, "Should have a WebApplication JSON-LD block").toBeTruthy();
    expect(app["@context"]).toBe("https://schema.org");
    expect(app.name).toBe("DIY Accounting Submit");
  });

  it("submit index.html has one Organization JSON-LD block with the company record", () => {
    const html = readFile(path.join(sites.submit.dir, "index.html"));
    const organizations = extractJsonLd(html).filter((block) => block["@type"] === "Organization");
    expect(organizations).toHaveLength(1);
    const [organization] = organizations;
    expect(organization.name).toBe("DIY Accounting Limited");
    expect(organization.legalName).toBe("DIY Accounting Limited");
    expect(organization.identifier).toEqual({
      "@type": "PropertyValue",
      "propertyID": "Companies House company number",
      "value": "06846849",
    });
    expect(organization.address.postalCode).toBe("LS8 1BY");
    expect(organization.sameAs).toEqual([
      "https://find-and-update.company-information.service.gov.uk/company/06846849",
      "https://www.youtube.com/@DIYAccountingSubmit",
      "https://github.com/diy-accounting-uk",
      "https://www.npmjs.com/package/@diy-accounting-uk/diya-submit",
      "https://www.npmjs.com/package/@diy-accounting-uk/diya-gl",
      "https://www.wikidata.org/wiki/Q142144452",
    ]);
  });
});
