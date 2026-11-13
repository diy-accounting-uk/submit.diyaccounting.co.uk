// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/publishContent.test.js

import { describe, test, expect } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCatalog } from "../../services/productCatalog.js";
import {
  addVideoEntries,
  listedBundles,
  listedVideos,
  publishContent,
  homeActivities,
  renderBundlesBlock,
  renderHomeActivitiesBlock,
  renderVideoPageBlock,
  resolveDescription,
  videosOfPage,
} from "../../../scripts/publish-content.mjs";

const CATALOG = parseCatalog(readFileSync("web/public/submit.catalogue.toml", "utf8"));
const MANIFEST = JSON.parse(readFileSync("web/public/videos/publish.json", "utf8"));
const uploadDateOf = () => "2026-01-02";

function pageBlock(environmentName, page) {
  const videos = listedVideos(MANIFEST, CATALOG, environmentName);
  return renderVideoPageBlock(videosOfPage(page, videos), new Map(videos.map((video) => [video.id, video])), uploadDateOf);
}

describe("publish-content videos", () => {
  test("ci lists the Income Tax videos and prod lists none", () => {
    expect(videosOfPage("videos-hmrc-itsa.html", listedVideos(MANIFEST, CATALOG, "ci")).length).toBeGreaterThan(0);
    expect(videosOfPage("videos-hmrc-itsa.html", listedVideos(MANIFEST, CATALOG, "prod"))).toEqual([]);
  });

  test("a prod page names each listed video's title, thumbnail and one VideoObject", () => {
    const html = pageBlock("prod", "videos-hmrc-vat.html");
    const listed = videosOfPage("videos-hmrc-vat.html", listedVideos(MANIFEST, CATALOG, "prod"));
    expect(listed.length).toBeGreaterThan(0);
    expect(html.match(/"@type": "VideoObject"/g)).toHaveLength(listed.length);
    for (const video of listed) {
      expect(html).toContain(`id="${video.id}"`);
      expect(html).toContain(`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`);
      expect(html).toContain(`https://www.youtube-nocookie.com/embed/${video.videoId}`);
    }
    expect(html).toContain('"uploadDate": "2026-01-02"');
  });

  test("a prod page holds no Income Tax title and a ci page does", () => {
    const itsa = MANIFEST.videos.find((video) => video.group === "itsa");
    expect(pageBlock("prod", "videos-hmrc-itsa.html")).toBe("");
    expect(pageBlock("ci", "videos-hmrc-itsa.html")).toContain(itsa.title.replace(/&/g, "&amp;"));
  });

  test("a video without an upload date gets no JSON-LD block", () => {
    const videos = listedVideos(MANIFEST, CATALOG, "prod");
    const html = renderVideoPageBlock(videosOfPage("videos-ch.html", videos), new Map(), () => undefined);
    expect(html).toContain("<h2>");
    expect(html).not.toContain("VideoObject");
  });

  test("a link to one of our own sites loses its query string and a video link names the video", () => {
    const videos = new Map([["other", { id: "other", group: "vat", title: "How to do it | DIY Accounting Submit" }]]);
    const { text, html } = resolveDescription(
      "See {{video:other}}. Try it at https://submit.diyaccounting.co.uk/?utm_source=youtube&utm_medium=video. Or https://example.com/a?b=1.",
      videos,
    );
    expect(text).toBe("See How to do it. Try it at https://submit.diyaccounting.co.uk/. Or https://example.com/a?b=1.");
    expect(html).toContain('<a href="videos-hmrc-vat.html#other">How to do it</a>');
    expect(html).toContain('<a href="https://submit.diyaccounting.co.uk/">https://submit.diyaccounting.co.uk/</a>.');
    expect(html).toContain('<a href="https://example.com/a?b=1">https://example.com/a?b=1</a>.');
  });

  test("a video link to a video the environment does not list reads as plain text", () => {
    expect(resolveDescription("See {{video:missing}}.", new Map()).text).toBe("See the related video.");
  });

  test("no description printed on a page keeps a utm query on our own site", () => {
    for (const environment of ["ci", "prod"]) {
      for (const page of ["videos.html", "videos-hmrc-vat.html", "videos-ch.html", "videos-account.html", "videos-accounting.html"]) {
        expect(pageBlock(environment, page)).not.toMatch(/utm_source/);
      }
    }
  });
});

describe("publish-content sitemap", () => {
  const SITEMAP = readFileSync("web/public/sitemap.xml", "utf8");

  test("each listed video gets a video:video entry on the page that shows it, and the namespace is declared", () => {
    const videos = listedVideos(MANIFEST, CATALOG, "prod");
    const xml = addVideoEntries(SITEMAP, videos, uploadDateOf);
    expect(xml).toContain('xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"');
    const expected = ["videos.html", "videos-hmrc-vat.html", "videos-ch.html", "videos-account.html", "videos-accounting.html"].reduce(
      (sum, page) => sum + videosOfPage(page, videos).length,
      0,
    );
    expect(xml.match(/<video:video>/g)).toHaveLength(expected);
    expect(xml).toContain("<video:publication_date>2026-01-02</video:publication_date>");
  });

  test("running it twice leaves one entry per video", () => {
    const videos = listedVideos(MANIFEST, CATALOG, "prod");
    const once = addVideoEntries(SITEMAP, videos, uploadDateOf);
    expect(addVideoEntries(once, videos, uploadDateOf)).toBe(once);
  });
});

describe("publish-content bundles", () => {
  test("prod lists the day pass and three Resident bundles and not the tax agent bundle", () => {
    expect(listedBundles(CATALOG, "prod").map((bundle) => bundle.id)).toEqual([
      "resident-vat",
      "resident-ltd",
      "resident-pro",
      "day-guest",
    ]);
  });

  test("ci also lists the tax agent bundle", () => {
    expect(listedBundles(CATALOG, "ci").map((bundle) => bundle.id)).toContain("resident-tax-agent");
  });

  test("prod shows each bundle's price and no price or activity that prod does not list", () => {
    const html = renderBundlesBlock(CATALOG, "prod");
    expect(html).toContain("£9.99 a year or £0.99 a month.");
    expect(html).toContain("£39.99 a year or £3.99 a month.");
    expect(html).toContain("Free.");
    expect(html).toContain("Submit VAT (HMRC)");
    expect(html).not.toContain("£199.99");
    expect(html).not.toContain("Tax Agent");
    expect(html).not.toContain("Company Tax Return");
    expect(html).not.toContain("Self Assessment");
  });

  test("a bundle description does not repeat the price that its card shows", () => {
    const html = renderBundlesBlock(CATALOG, "prod");
    expect(html).toContain("File accounts and confirmation statements to Companies House.");
    expect(html).not.toContain("/yr");
    expect(html).not.toContain("cancel anytime");
  });

  test("ci shows the tax agent price", () => {
    expect(renderBundlesBlock(CATALOG, "ci")).toContain("£199.99 a year or £19.99 a month.");
  });
});

describe("publish-content home activities", () => {
  test("prod lists the VAT activities and no Income Tax or preview activity", () => {
    const names = homeActivities(CATALOG, "prod").map((entry) => entry.name);
    expect(names).toContain("Submit VAT (HMRC)");
    expect(homeActivities(CATALOG, "prod").some((entry) => entry.area === "Income Tax")).toBe(false);
    expect(names.join(" ")).not.toMatch(/Assist|PSC|Company Tax Return/);
  });

  test("an activity that shows only on entitlement is left out for a signed-out visitor", () => {
    expect(homeActivities(CATALOG, "prod").some((entry) => entry.area === "Companies House")).toBe(false);
  });

  test("ci lists Income Tax and prod does not", () => {
    expect(homeActivities(CATALOG, "ci").some((entry) => entry.area === "Income Tax")).toBe(true);
  });

  test("an upsell activity opens the sign-in page and every entry has a page link", () => {
    const vat = homeActivities(CATALOG, "prod").find((entry) => entry.name === "Submit VAT (HMRC)");
    expect(vat.href).toBe("auth/login.html");
    expect(homeActivities(CATALOG, "ci").every((entry) => entry.href.endsWith(".html"))).toBe(true);
  });

  test("the Welsh block holds the Welsh area heading and activity names", () => {
    const html = renderHomeActivitiesBlock(CATALOG, "prod", "../", "cy");
    expect(html).toContain('<section class="activity-group" aria-label="TAW"><h2>TAW</h2>');
    expect(html).toContain(">Cyflwyno TAW (CThEF)</a>");
    expect(html).toContain("<h2>Rhagor</h2>");
    expect(html).not.toMatch(/Submit VAT|<h2>More<\/h2>/);
  });

  test("the block groups the links by area and gives only the first link the primary style", () => {
    const html = renderHomeActivitiesBlock(CATALOG, "prod");
    expect(html).toContain('<section class="activity-group" aria-label="VAT"><h2>VAT</h2>');
    expect(html.match(/class="btn"/g)).toHaveLength(1);
    expect(html).not.toContain("Income Tax");
  });
});

describe("publishContent", () => {
  test("fills every marked block in a web root and leaves the sitemap well formed", () => {
    const webRoot = mkdtempSync(join(tmpdir(), "publish-content-"));
    try {
      mkdirSync(join(webRoot, "videos"));
      mkdirSync(join(webRoot, "cy"));
      for (const file of [
        "submit.catalogue.toml",
        "sitemap.xml",
        "bundles.html",
        "index.html",
        "cy/index.html",
        "videos.html",
        "videos-account.html",
        "videos-accounting.html",
        "videos-ch.html",
        "videos-hmrc-itsa.html",
        "videos-hmrc-vat.html",
        "videos/publish.json",
      ]) {
        copyFileSync(join("web/public", file), join(webRoot, file));
      }
      publishContent(webRoot, "prod", uploadDateOf);
      const bundles = readFileSync(join(webRoot, "bundles.html"), "utf8");
      expect(bundles).toContain('data-bundle-id="resident-pro"');
      expect(bundles).not.toContain('data-bundle-id="resident-tax-agent"');
      expect(readFileSync(join(webRoot, "index.html"), "utf8")).toContain('<section class="activity-group" aria-label="VAT">');
      expect(readFileSync(join(webRoot, "cy/index.html"), "utf8")).toContain('href="../auth/login.html"');
      expect(readFileSync(join(webRoot, "videos-ch.html"), "utf8")).toContain("VideoObject");
      expect(readFileSync(join(webRoot, "sitemap.xml"), "utf8")).toContain("<video:video>");
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });
});
