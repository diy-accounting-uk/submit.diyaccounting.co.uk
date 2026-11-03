// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/publishSitemap.test.js

import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import TOML from "@iarna/toml";

import { filterSitemap, pageLastCommitDate, publishSitemap } from "../../../scripts/publish-sitemap.mjs";

const SITEMAP = readFileSync("web/public/sitemap.xml", "utf8");
const CATALOG = TOML.parse(readFileSync("web/public/submit.catalogue.toml", "utf8"));
const MANIFEST = JSON.parse(readFileSync("web/public/videos/publish.json", "utf8"));

const pagesOf = (xml) => [...xml.matchAll(/<loc>https:\/\/submit\.diyaccounting\.co\.uk\/([^<]*)<\/loc>/g)].map((match) => match[1]);

describe("publish-sitemap", () => {
  test("prod drops the practice page and the Income Tax videos page", () => {
    const pages = pagesOf(filterSitemap(SITEMAP, CATALOG, MANIFEST, "prod"));
    expect(pages).not.toContain("practice.html");
    expect(pages).not.toContain("videos-hmrc-itsa.html");
  });

  test("prod keeps the pages of listed features and the calendar", () => {
    const pages = pagesOf(filterSitemap(SITEMAP, CATALOG, MANIFEST, "prod"));
    expect(pages).toEqual(expect.arrayContaining(["", "bundles.html", "mtd-calendar.html", "videos-hmrc-vat.html", "videos-ch.html"]));
  });

  test("ci keeps every page", () => {
    expect(pagesOf(filterSitemap(SITEMAP, CATALOG, MANIFEST, "ci"))).toEqual(pagesOf(SITEMAP));
  });

  test("the result is still a well-formed urlset", () => {
    const xml = filterSitemap(SITEMAP, CATALOG, MANIFEST, "prod");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    expect(xml.match(/<url>/g)).toHaveLength(xml.match(/<\/url>/g).length);
  });

  test("publishSitemap rewrites the sitemap in a web root", () => {
    const webRoot = mkdtempSync(join(tmpdir(), "publish-sitemap-"));
    try {
      mkdirSync(join(webRoot, "videos"));
      copyFileSync("web/public/sitemap.xml", join(webRoot, "sitemap.xml"));
      copyFileSync("web/public/submit.catalogue.toml", join(webRoot, "submit.catalogue.toml"));
      writeFileSync(join(webRoot, "videos", "publish.json"), JSON.stringify(MANIFEST));
      publishSitemap(webRoot, "prod");
      expect(pagesOf(readFileSync(join(webRoot, "sitemap.xml"), "utf8"))).not.toContain("practice.html");
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });

  test("the full list carries no lastmod", () => {
    expect(SITEMAP).not.toContain("<lastmod>");
  });

  test("every kept entry gets the lastmod its page answers, placed after its loc", () => {
    const xml = filterSitemap(SITEMAP, CATALOG, MANIFEST, "prod", (page) => (page === "privacy.html" ? "2026-11-03" : undefined));
    expect(xml).toContain(
      "<loc>https://submit.diyaccounting.co.uk/privacy.html</loc>\n    <lastmod>2026-11-03</lastmod>\n    <changefreq>yearly</changefreq>",
    );
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
  });

  test("an entry whose page has no date gets no lastmod", () => {
    expect(filterSitemap(SITEMAP, CATALOG, MANIFEST, "prod")).not.toContain("<lastmod>");
  });

  test("the home page entry takes the date of index.html", () => {
    const asked = [];
    filterSitemap(SITEMAP, CATALOG, MANIFEST, "prod", (page) => {
      asked.push(page);
      return "2026-01-01";
    });
    expect(asked).toContain("index.html");
  });

  test("the pages that need a signed-in visitor or the practice licence stay out of the prod sitemap", () => {
    const prodPages = pagesOf(filterSitemap(SITEMAP, CATALOG, MANIFEST, "prod"));
    for (const page of ["practice.html", "usage.html", "settings.html", "videos-hmrc-itsa.html"]) {
      expect(prodPages, page).not.toContain(page);
    }
  });

  test("ci lists the practice page and the Income Tax videos page", () => {
    const ciPages = pagesOf(filterSitemap(SITEMAP, CATALOG, MANIFEST, "ci"));
    expect(ciPages).toEqual(expect.arrayContaining(["practice.html", "videos-hmrc-itsa.html"]));
  });

  test("the usage page asks search engines not to index it", () => {
    expect(readFileSync("web/public/usage.html", "utf8")).toContain('<meta name="robots" content="noindex" />');
  });

  describe("pageLastCommitDate", () => {
    const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });

    test("answers the date of the last commit that changed the page, not of a later commit to another file", () => {
      const repo = mkdtempSync(join(tmpdir(), "last-commit-"));
      try {
        git(repo, "init", "-q");
        git(repo, "config", "user.email", "test@example.com");
        git(repo, "config", "user.name", "Test");
        mkdirSync(join(repo, "web", "public"), { recursive: true });
        writeFileSync(join(repo, "web", "public", "a.html"), "a");
        git(repo, "add", ".");
        execFileSync("git", ["-C", repo, "commit", "-q", "-m", "a"], {
          env: { ...process.env, GIT_COMMITTER_DATE: "2026-02-03T12:00:00Z", GIT_AUTHOR_DATE: "2026-02-03T12:00:00Z" },
        });
        writeFileSync(join(repo, "web", "public", "b.html"), "b");
        git(repo, "add", ".");
        execFileSync("git", ["-C", repo, "commit", "-q", "-m", "b"], {
          env: { ...process.env, GIT_COMMITTER_DATE: "2026-05-06T12:00:00Z", GIT_AUTHOR_DATE: "2026-05-06T12:00:00Z" },
        });
        expect(pageLastCommitDate("a.html", repo)).toBe("2026-02-03");
        expect(pageLastCommitDate("b.html", repo)).toBe("2026-05-06");
        expect(pageLastCommitDate("missing.html", repo)).toBeUndefined();
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    test("answers undefined when the directory is not a git checkout", () => {
      const directory = mkdtempSync(join(tmpdir(), "no-git-"));
      try {
        expect(pageLastCommitDate("a.html", directory)).toBeUndefined();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  });
});
