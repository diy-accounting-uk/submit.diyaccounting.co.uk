// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/publishSitemap.test.js

import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import TOML from "@iarna/toml";

import { filterSitemap, publishSitemap } from "../../../scripts/publish-sitemap.mjs";

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
});
