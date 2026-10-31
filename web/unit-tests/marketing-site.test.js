// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/marketing-site.test.js

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { generatePassphrase } from "../../app/lib/passphrase.js";
import {
  FONT_FILES,
  JSON_FILE,
  MARKETING_DIR,
  TOKEN_SOURCES,
  IMAGES_DIR,
  SHOTS_DIR,
  findSiblings,
  imageHash,
  readMarketingData,
  renderMarketingJson,
  renderSiteTokens,
  siteTokenBlock,
  tokenSourcePath,
} from "../../scripts/build-marketing-site.mjs";
import {
  carriesPass,
  codeFromPassUrl,
  isPassCode,
  londonDate,
  nativeSharePayload,
  pageAnchors,
  postLink,
  renderPost,
  runningCampaigns,
  shareUrl,
  xWeightedLength,
} from "../../web/marketing/marketing-lib.js";

const require = createRequire(import.meta.url);
const TOML = require("@iarna/toml");

const root = process.cwd();
const publicDir = path.join(root, "web", "public");
const data = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
const SECTION_IDS = ["submit", "spreadsheets", "diya-gl", "limited"];
const PASS = "tiger-happy-maple-river";
const siblings = findSiblings();
const sets = data.sections.flatMap((section) => section.sets.map((set) => ({ section, set })));

// Outside links that no file in this repository can vouch for, each named once.
const EXTERNAL_URLS = new Set([
  "https://diyaccounting.co.uk/",
  "https://diya-gl.co.uk/",
  "https://diya-gl.co.uk/bst.html",
  "https://diya-gl.co.uk/ltd.html",
  "https://diya-gl.co.uk/se.html",
  "https://diya-gl.co.uk/taxi.html",
  "https://spreadsheets.diyaccounting.co.uk/",
  "https://spreadsheets.diyaccounting.co.uk/download.html?product=BasicSoleTrader",
  "https://spreadsheets.diyaccounting.co.uk/download.html?product=Company",
  "https://spreadsheets.diyaccounting.co.uk/download.html?product=Payslip05",
  "https://spreadsheets.diyaccounting.co.uk/download.html?product=SelfEmployed",
  "https://spreadsheets.diyaccounting.co.uk/download.html?product=TaxiDriver",
]);

function submitPathExists(link) {
  const pathname = new URL(link).pathname;
  return fs.existsSync(path.join(publicDir, pathname === "/" ? "index.html" : pathname));
}

describe("marketing data", () => {
  it("marketing.json is the rendering of marketing.toml", () => {
    expect(fs.readFileSync(JSON_FILE, "utf-8")).toBe(renderMarketingJson());
  });

  it("has the top-level keys", () => {
    for (const key of [
      "version",
      "disclosure",
      "generatePassUrl",
      "passUrlTemplate",
      "passHosts",
      "passCodePattern",
      "passCodeExample",
      "submitHosts",
      "offers",
      "lengths",
      "networks",
      "imageSizes",
      "campaigns",
      "sections",
    ]) {
      expect(data, key).toHaveProperty(key);
    }
  });

  it("has the four sections in order, each with fragments, swatches and one section-wide set", () => {
    expect(data.sections.map((s) => s.id)).toEqual(SECTION_IDS);
    for (const section of data.sections) {
      expect(SECTION_IDS).toContain(section.brand);
      expect(typeof section.hasDark).toBe("boolean");
      expect(section.site.startsWith("https://")).toBe(true);
      expect(section.fragments.length).toBeGreaterThanOrEqual(1);
      for (const fragment of section.fragments) {
        expect([1280, 390]).toContain(fragment.width);
        expect(fragment.alt.length).toBeGreaterThan(0);
      }
      expect(section.swatches.length).toBeGreaterThanOrEqual(1);
      const wide = section.sets.filter((s) => s.product === "");
      expect(wide.map((s) => s.id)).toEqual([`${section.id}-all`]);
      for (const product of section.products ?? []) {
        expect(section.sets.filter((s) => s.product === product.id).length, product.id).toBeGreaterThanOrEqual(1);
      }
      for (const set of section.sets) {
        expect(set.id).toMatch(/^[a-z0-9-]+$/);
        expect(set.id.startsWith(`${section.id}-`)).toBe(true);
      }
    }
  });

  it("has unique page anchors, including the two the next page links to", () => {
    const anchors = pageAnchors(data);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(anchors).toContain("submit-vat");
    expect(anchors).toContain("submit");
    expect(anchors).toContain("affiliates");
  });
});

describe("posts", () => {
  const maxOf = Object.fromEntries(data.lengths.map((l) => [l.id, l.max]));

  it.each(sets.map(({ section, set }) => [set.id, section, set]))("%s has its posts within the length limits", (_id, section, set) => {
    for (const id of ["headline", "short", "medium"]) expect(set.posts[id], id).toBeTruthy();
    if (section.id === "submit") expect(set.posts.long).toBeTruthy();
    for (const [id, text] of Object.entries(set.posts)) {
      expect(text.length, `${set.id} ${id}`).toBeLessThanOrEqual(maxOf[id]);
      if (id === "headline") continue;
      expect(text.trimEnd().endsWith("{link}"), `${set.id} ${id} ends with {link}`).toBe(true);
      expect(text.split("{link}").length - 1, `${set.id} ${id} link count`).toBe(1);
    }
    for (const text of Object.values(set.posts)) {
      if (section.id !== "submit") expect(text).not.toContain("{offer}");
      const placeholders = [...text.matchAll(/\{[^}]*\}/g)].map((m) => m[0]).filter((p) => p !== "{link}" && p !== "{offer}");
      expect(placeholders).toEqual([]);
    }
  });

  it.each(sets.map(({ set }) => [set.id, set]))("%s short post fits X with and without a pass", (_id, set) => {
    for (const code of [null, PASS]) {
      const link = postLink(set, { code, source: "x", medium: "social", lengthId: "short" }, data);
      expect(xWeightedLength(renderPost(set, "short", { code, link }, data))).toBeLessThanOrEqual(280);
    }
  });

  it("names no Resident bundle", () => {
    for (const { set } of sets) for (const text of Object.values(set.posts)) expect(text).not.toMatch(/Resident/);
  });
});

describe("claims", () => {
  const texts = sets.flatMap(({ set }) => [...Object.values(set.posts), set.emailSubject, set.image.headline, set.image.subline]);

  it("makes no HMRC endorsement claim", () => {
    for (const text of texts)
      expect(text).not.toMatch(/HMRC[- ](approved|accredited|certified|endorsed)|official HMRC software|recommended by HMRC/i);
  });

  it("marks the first mention of each product name per text with a trademark sign", () => {
    for (const { set } of sets) {
      for (const [id, text] of Object.entries(set.posts)) {
        for (const name of ["DIY Accounting Submit", "DIY Accounting Spreadsheets", "DIYA-GL"]) {
          const first = text.indexOf(name);
          if (first < 0) continue;
          expect(text.slice(first + name.length, first + name.length + 1), `${set.id} ${id} ${name}`).toBe("™");
        }
      }
    }
  });

  it("quotes 99p only while the monthly price is 99", () => {
    const catalogue = TOML.parse(fs.readFileSync(path.join(publicDir, "submit.catalogue.toml"), "utf-8"));
    const price = catalogue.bundles.find((b) => b.id === "resident-vat").prices.find((p) => p.interval === "month");
    if (texts.some((text) => text.includes("99p"))) expect(price.amount).toBe(99);
  });

  it("states the pass offer as the pass page does", () => {
    const page = fs.readFileSync(path.join(publicDir, "passes", "generate-digital.html"), "utf-8");
    expect(page).toContain(data.offers.withPass);
  });
});

describe("pass code", () => {
  it("matches the example and every generated passphrase", () => {
    expect(isPassCode(data.passCodeExample, data)).toBe(true);
    for (let i = 0; i < 500; i++) expect(isPassCode(generatePassphrase(4), data)).toBe(true);
  });
});

describe("links", () => {
  it("points every Submit link at a page in this repository and every other link at a named URL", () => {
    for (const { set } of sets) {
      if (data.submitHosts.includes(new URL(set.link).hostname)) expect(submitPathExists(set.link), set.link).toBe(true);
      else expect(EXTERNAL_URLS.has(set.link), set.link).toBe(true);
    }
  });

  it("has a pass page and a pass link template that exist", () => {
    expect(submitPathExists(data.generatePassUrl)).toBe(true);
    expect(submitPathExists(data.passUrlTemplate.replace("{code}", PASS))).toBe(true);
  });

  it("has share templates that use only known placeholders", () => {
    expect(data.networks.map((n) => n.id)).toEqual(expect.arrayContaining(["linkedin", "x", "facebook", "whatsapp", "reddit", "email"]));
    for (const network of data.networks) {
      expect(network.urlTemplate.startsWith("https://") || network.urlTemplate.startsWith("mailto:")).toBe(true);
      const placeholders = [...network.urlTemplate.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
      for (const placeholder of placeholders) expect(["url", "text", "title", "subject"]).toContain(placeholder);
    }
  });
});

describe("brand tokens and fonts", () => {
  const tokensCss = fs.readFileSync(path.join(MARKETING_DIR, "brand", "tokens.css"), "utf-8");

  it("has a block per site", () => {
    for (const id of SECTION_IDS) expect(siteTokenBlock(tokensCss, id), id).not.toBeNull();
  });

  it("names every swatch token in its site's block", () => {
    for (const section of data.sections) {
      const block = siteTokenBlock(tokensCss, section.brand);
      for (const swatch of section.swatches) expect(block, `${section.id} ${swatch.token}`).toContain(`${swatch.token}:`);
    }
  });

  it("holds the Submit block that submit.css renders", () => {
    const source = TOKEN_SOURCES.find((s) => s.id === "submit");
    const css = fs.readFileSync(tokenSourcePath(source, siblings), "utf-8");
    expect(siteTokenBlock(tokensCss, "submit")).toBe(renderSiteTokens("submit", css));
  });

  it.skipIf(!siblings).each(["spreadsheets", "diya-gl", "limited"])("holds the %s block that its stylesheet renders", (id) => {
    const source = TOKEN_SOURCES.find((s) => s.id === id);
    const css = fs.readFileSync(tokenSourcePath(source, siblings), "utf-8");
    expect(siteTokenBlock(tokensCss, id)).toBe(renderSiteTokens(id, css));
  });

  it("copies the fonts byte for byte", () => {
    for (const name of FONT_FILES) {
      const copy = fs.readFileSync(path.join(MARKETING_DIR, "brand", "fonts", name));
      expect(copy.equals(fs.readFileSync(path.join(publicDir, "fonts", name))), name).toBe(true);
    }
  });
});

describe("social images", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(IMAGES_DIR, "manifest.json"), "utf-8"));

  it.each(sets.map(({ section, set }) => [set.id, section, set]))(
    "%s has every size at the right dimensions and hash",
    (_id, section, set) => {
      for (const size of data.imageSizes) {
        const file = path.join(IMAGES_DIR, set.id, `${size.id}.png`);
        expect(fs.existsSync(file), `${set.id} ${size.id}`).toBe(true);
        const png = fs.readFileSync(file);
        expect(png.readUInt32BE(16), `${set.id} ${size.id} width`).toBe(size.width);
        expect(png.readUInt32BE(20), `${set.id} ${size.id} height`).toBe(size.height);
        expect(manifest[set.id][size.id], `${set.id} ${size.id} hash`).toEqual({
          width: size.width,
          height: size.height,
          hash: imageHash({ section, set, size }),
        });
      }
    },
  );

  it("keeps the images folder within 20 MB and each IAB banner within 150 KB", () => {
    let total = 0;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else total += fs.statSync(full).size;
      }
    };
    walk(IMAGES_DIR);
    expect(total).toBeLessThanOrEqual(20 * 1024 * 1024);
    for (const { set } of sets) {
      for (const id of ["mrec", "leaderboard", "mobile-banner", "skyscraper"]) {
        expect(fs.statSync(path.join(IMAGES_DIR, set.id, `${id}.png`)).size, `${set.id} ${id}`).toBeLessThanOrEqual(150 * 1024);
      }
    }
  });
});

describe("brand shots", () => {
  it("has a light shot per fragment and a dark shot only where the site has a dark scheme", () => {
    for (const section of data.sections) {
      for (const fragment of section.fragments) {
        const shot = (theme) => path.join(SHOTS_DIR, section.id, `${fragment.id}-${theme}.png`);
        expect(fs.existsSync(shot("light")), `${section.id} ${fragment.id} light`).toBe(true);
        expect(fs.existsSync(shot("dark")), `${section.id} ${fragment.id} dark`).toBe(section.hasDark);
      }
    }
  });

  it("lists every shot in the manifest with the date it was captured", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SHOTS_DIR, "manifest.json"), "utf-8"));
    expect(manifest.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const shot of manifest.shots) expect(fs.existsSync(path.join(SHOTS_DIR, shot.file)), shot.file).toBe(true);
  });
});

describe("campaigns", () => {
  it("has unique ids, ordered ISO dates, 'Post ' labels and targets on the page", () => {
    const anchors = pageAnchors(data);
    expect(new Set(data.campaigns.map((c) => c.id)).size).toBe(data.campaigns.length);
    for (const campaign of data.campaigns) {
      expect(campaign.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(campaign.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(campaign.start <= campaign.end).toBe(true);
      expect(campaign.label.startsWith("Post ")).toBe(true);
      expect(anchors).toContain(campaign.target);
    }
  });
});

describe("marketing-lib", () => {
  const submitSet = sets.find(({ section }) => section.id === "submit").set;
  const sheetSet = sets.find(({ section }) => section.id === "spreadsheets").set;
  const network = (id) => data.networks.find((n) => n.id === id);

  it("reads a code from a pass link", () => {
    const link = `https://submit.diyaccounting.co.uk/bundles.html?pass=${PASS}`;
    expect(codeFromPassUrl(link, data)).toBe(PASS);
    expect(codeFromPassUrl(link.replace("https:", "http:"), data)).toBeNull();
    expect(codeFromPassUrl(link.replace("submit.", "other."), data)).toBeNull();
    expect(codeFromPassUrl(link.replace("bundles.html", "index.html"), data)).toBeNull();
    expect(codeFromPassUrl(`https://submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy`, data)).toBeNull();
    expect(codeFromPassUrl(`${link}&ref=x`, data)).toBe(PASS);
    expect(codeFromPassUrl(`https://submit.diyaccounting.co.uk/bundles.html?pass=${PASS.toUpperCase()}`, data)).toBe(PASS);
  });

  it("replaces only a Submit link with the pass link and adds the utm parameters", () => {
    const withPass = new URL(postLink(submitSet, { code: PASS, source: "copy", medium: "post", lengthId: "short" }, data));
    expect(withPass.pathname).toBe("/bundles.html");
    expect(withPass.searchParams.get("pass")).toBe(PASS);
    expect(withPass.searchParams.get("utm_source")).toBe("copy");
    expect(withPass.searchParams.get("utm_medium")).toBe("post");
    expect(withPass.searchParams.get("utm_campaign")).toBe(submitSet.id);
    expect(withPass.searchParams.get("utm_content")).toBe("short");
    const sheet = new URL(postLink(sheetSet, { code: PASS, source: "copy", medium: "post", lengthId: "short" }, data));
    expect(sheet.searchParams.has("pass")).toBe(false);
    expect(sheet.hostname).toBe(new URL(sheetSet.link).hostname);
  });

  it("opens with #ad only for a pass on a Submit set, and fills the offer", () => {
    const render = (set, code) =>
      renderPost(set, "short", { code, link: postLink(set, { code, source: "copy", medium: "post", lengthId: "short" }, data) }, data);
    const withPass = render(submitSet, PASS);
    expect(withPass.startsWith("#ad ")).toBe(true);
    expect(withPass).toContain(data.offers.withPass);
    const without = render(submitSet, null);
    expect(without.startsWith("#ad")).toBe(false);
    expect(without).toContain(data.offers.withoutPass);
    expect(render(sheetSet, PASS).startsWith("#ad")).toBe(false);
    expect(carriesPass(sheetSet, PASS, data)).toBe(false);
  });

  it("builds the share URL of each network", () => {
    const link = (net, lengthId) => postLink(submitSet, { code: PASS, source: net.id, medium: net.utmMedium, lengthId }, data);
    const text = (net, lengthId) => renderPost(submitSet, lengthId, { code: PASS, link: link(net, lengthId) }, data);
    const linkedin = network("linkedin");
    expect(shareUrl(linkedin, submitSet, "medium", { code: PASS }, data)).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link(linkedin, "medium"))}`,
    );
    const facebook = network("facebook");
    expect(shareUrl(facebook, submitSet, "medium", { code: PASS }, data)).toBe(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link(facebook, "medium"))}`,
    );
    const whatsapp = network("whatsapp");
    expect(shareUrl(whatsapp, submitSet, "medium", { code: PASS }, data)).toBe(
      `https://wa.me/?text=${encodeURIComponent(text(whatsapp, "medium"))}`,
    );
    const x = network("x");
    expect(shareUrl(x, submitSet, "long", { code: PASS }, data)).toBe(
      `https://x.com/intent/post?text=${encodeURIComponent(text(x, "short"))}`,
    );
    const reddit = network("reddit");
    expect(shareUrl(reddit, submitSet, "medium", { code: PASS }, data)).toBe(
      `https://www.reddit.com/submit?url=${encodeURIComponent(link(reddit, "medium"))}&title=${encodeURIComponent(`#ad ${submitSet.posts.headline}`)}`,
    );
    const email = network("email");
    const emailLink = postLink(submitSet, { code: PASS, source: "email", medium: "email", lengthId: "medium" }, data);
    expect(shareUrl(email, submitSet, "medium", { code: PASS }, data)).toBe(
      `mailto:?subject=${encodeURIComponent(submitSet.emailSubject)}&body=${encodeURIComponent(renderPost(submitSet, "medium", { code: PASS, link: emailLink }, data))}`,
    );
  });

  it("counts a URL as 23 and a trademark sign as 2 for X", () => {
    expect(xWeightedLength("a https://submit.diyaccounting.co.uk/bundles.html?pass=x&utm_source=x")).toBe(2 + 23);
    expect(xWeightedLength("™")).toBe(2);
    expect(xWeightedLength("abc")).toBe(3);
  });

  it("lists the campaigns running on a London date, both ends inclusive", () => {
    const ids = (iso) => runningCampaigns(data, new Date(iso)).map((c) => c.id);
    expect(ids("2026-10-31T23:30:00Z")).toEqual([]);
    expect(londonDate(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31");
    expect(ids("2026-11-01T00:00:00Z").length).toBe(2);
    expect(ids("2027-10-31T12:00:00Z").length).toBe(2);
    expect(ids("2027-10-31T23:30:00Z").length).toBe(2);
    expect(ids("2027-11-01T12:00:00Z")).toEqual([]);
    expect(londonDate(new Date("2026-05-31T23:30:00Z"))).toBe("2026-06-01");
  });

  it("splits the closing link off the native share text", () => {
    const payload = nativeSharePayload(submitSet, "short", { code: PASS }, data);
    expect(payload.title).toBe(submitSet.posts.headline);
    expect(payload.url).toContain(`pass=${PASS}`);
    expect(payload.text).not.toContain(payload.url);
  });
});

describe("marketing page", () => {
  const html = fs.readFileSync(path.join(MARKETING_DIR, "index.html"), "utf-8");
  const links = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);

  function resolves(link) {
    if (link.startsWith("#")) return true;
    if (link.startsWith("https://submit.diyaccounting.co.uk/")) return submitPathExists(link);
    if (/^https?:/.test(link)) return EXTERNAL_URLS.has(link) || link.startsWith("https://marketing.diyaccounting.co.uk/");
    return fs.existsSync(path.join(MARKETING_DIR, link.split("#")[0]));
  }

  it("resolves every link and source", () => {
    expect(links.filter((link) => !resolves(link))).toEqual([]);
  });

  it("holds the affiliate box, the affiliates section and the four section anchors", () => {
    for (const id of ["affiliate", "affiliates", ...SECTION_IDS, ...SECTION_IDS.map((s) => `${s}-brand`)]) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it("links its stylesheets and script", () => {
    for (const link of [
      "marketing.css",
      "marketing.js",
      "brand/submit.css",
      "brand/spreadsheets.css",
      "brand/diya-gl.css",
      "brand/limited.css",
    ]) {
      expect(links, link).toContain(link);
    }
  });
});

describe("affiliates section", () => {
  const referrals = TOML.parse(fs.readFileSync("referrals.toml", "utf8"));
  const cash = referrals.tiers.find((t) => t.id === "casual");
  const customer = referrals.tiers.find((t) => t.id === "customer");
  const terms = fs.readFileSync("web/public/terms.html", "utf8");

  it("takes its figures from referrals.toml", () => {
    expect(data.affiliates.ratePercent).toBe(cash.rateBps / 100);
    expect(data.affiliates.months).toBe(cash.months);
    expect(data.affiliates.creditHoldDays).toBe(customer.holdDays);
    expect(data.affiliates.cashHoldDays).toBe(cash.holdDays);
    expect(data.affiliates.capMonthPounds).toBe(cash.capMonthPence / 100);
    expect(data.affiliates.capTaxYearPounds).toBe(cash.capTaxYearPence / 100);
  });

  it("links the application to the signed-in affiliate section of the submit site", () => {
    expect(data.affiliates.applyUrl).toBe("https://submit.diyaccounting.co.uk/bundles.html#affiliateApplySection");
    expect(fs.readFileSync(path.join(MARKETING_DIR, "index.html"), "utf8")).toContain("data-aff-apply");
  });

  it("states the same figures in the terms", () => {
    const section = terms.slice(terms.indexOf('id="affiliate-and-referral-passes"'));
    expect(section).toContain(`${data.affiliates.ratePercent}%`);
    expect(section).toContain(`first ${data.affiliates.months} months`);
    expect(section).toContain(`${data.affiliates.creditHoldDays} days after`);
    expect(section).toContain(`${data.affiliates.cashHoldDays} days after`);
    expect(section).toContain(`&pound;${data.affiliates.capMonthPounds} a`);
    expect(section).toContain(`&pound;${data.affiliates.capTaxYearPounds.toLocaleString("en-GB")} a tax year`);
    expect(section).toContain(`&pound;${cash.minPayoutPence / 100}`);
    expect(section).toContain("These terms take effect when the first affiliate is approved.");
  });
});

describe("marketing.json source", () => {
  it("reads the same data from the TOML as the committed JSON holds", () => {
    expect(readMarketingData()).toEqual(data);
  });
});
