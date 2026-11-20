// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/marketing-site.test.js

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

import { generatePassphrase } from "../../app/lib/passphrase.js";
import { LISTING_STATES, catalogPriceText, liveListings, listingProblems, readListings } from "../../scripts/listings-register.mjs";
import {
  COMPANY_DIR,
  FONT_FILES,
  ICON_SOURCES,
  JSON_FILE,
  LOGOS_DIR,
  LOGO_SIZES,
  PACKS_DIR,
  PACK_SHOT,
  PUBLISH_FILE,
  MARKETING_DIR,
  TOKEN_SOURCES,
  IMAGES_DIR,
  SHOTS_DIR,
  findSiblings,
  imageHash,
  logoHash,
  readMarketingData,
  renderPackIndex,
  renderMarketingJson,
  renderMarketingPage,
  renderSiteTokens,
  siteTokenBlock,
  tokenSourcePath,
  withSvgLicenceHeader,
} from "../../scripts/build-marketing-site.mjs";
import {
  carriesPass,
  codeFromPassUrl,
  isPassCode,
  listingLink,
  listingProducts,
  limitReport,
  londonDate,
  measure,
  nativeSharePayload,
  packFiles,
  packProblems,
  reviewListings,
  wordCount,
  zipStore,
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
      "listingGroups",
      "listingProducts",
      "listings",
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
    expect(anchors).toContain("listings");
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

  it("names both offers in the pass panel note", () => {
    const html = fs.readFileSync(path.join(path.dirname(JSON_FILE), "index.html"), "utf-8");
    const note = html.match(/<p id="offerNote">([^<]*)<\/p>/)[1];
    expect(note).toContain(data.offers.withoutPass.replace(/^a /, ""));
    expect(note).toContain(data.offers.withPass);
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
    const link = `https://submit.diyaccounting.co.uk/pass.html?pass=${PASS}`;
    expect(codeFromPassUrl(link, data)).toBe(PASS);
    expect(codeFromPassUrl(link.replace("https:", "http:"), data)).toBeNull();
    expect(codeFromPassUrl(link.replace("submit.", "other."), data)).toBeNull();
    expect(codeFromPassUrl(link.replace("pass.html", "index.html"), data)).toBeNull();
    expect(codeFromPassUrl(`https://submit.diyaccounting.co.uk/pass.html?pass=tiger-happy`, data)).toBeNull();
    expect(codeFromPassUrl(`${link}&ref=x`, data)).toBe(PASS);
    expect(codeFromPassUrl(`https://submit.diyaccounting.co.uk/pass.html?pass=${PASS.toUpperCase()}`, data)).toBe(PASS);
    expect(codeFromPassUrl(link.replace("pass.html", "bundles.html"), data)).toBe(PASS);
  });

  it("replaces only a Submit link with the pass link and adds the utm parameters", () => {
    const withPass = new URL(postLink(submitSet, { code: PASS, source: "copy", medium: "post", lengthId: "short" }, data));
    expect(withPass.pathname).toBe("/pass.html");
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

  it("asks search engines not to index it", () => {
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(fs.readFileSync(path.join(MARKETING_DIR, "robots.txt"), "utf-8")).toMatch(/^User-agent: \*\nDisallow: \/$/m);
    expect(fs.readFileSync(path.join(MARKETING_DIR, "robots.txt"), "utf-8")).not.toMatch(/^Allow:/m);
  });

  it("holds the affiliate box, the affiliates section and the four section anchors", () => {
    for (const id of ["affiliate", "affiliates", "listings", ...SECTION_IDS, ...SECTION_IDS.map((s) => `${s}-brand`)]) {
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
    expect(data.affiliates.annualRatePercent).toBe(cash.annualRateBps / 100);
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
    expect(section).toContain(`${data.affiliates.annualRatePercent}% of the annual`);
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

describe("listing register", () => {
  const catalogue = TOML.parse(fs.readFileSync(path.join(publicDir, "submit.catalogue.toml"), "utf-8"));
  const register = readListings();

  it("holds one entry per place of groups D, E, L and C, each in a known state", () => {
    expect(register.groups.map((g) => g.id)).toEqual(["review", "launch", "citation", "professional"]);
    expect(register.listings.length).toBeGreaterThanOrEqual(25);
    for (const listing of register.listings) expect(LISTING_STATES, listing.id).toContain(listing.state);
    expect(register.listings.filter((l) => l.state === "live").map((l) => l.id)).toEqual([
      "trustpilot",
      "saashub",
      "saashub-diy-accounting",
      "softwarereview",
      "featuredcustomers",
      "linkedin",
      "freeindex",
    ]);
    for (const place of ["Capterra", "Trustpilot", "AlternativeTo", "SaaSHub", "G2", "Product Hunt", "Yell", "AccountingWEB"]) {
      expect(
        register.listings.some((l) => l.place.startsWith(place)),
        place,
      ).toBe(true);
    }
  });

  it("is sound against the catalogue", () => {
    expect(listingProblems(register)).toEqual([]);
  });

  it("takes the price text from the catalogue, not from the copy", () => {
    const submit = register.products.find((p) => p.id === "submit");
    expect(submit.priceText).toBe(catalogPriceText("resident-vat", catalogue));
    expect(submit.priceText).toMatch(/^£\d+\.\d{2}\/yr \/ £\d+\.\d{2}\/mo$/);
    expect(submit.description160).toContain(submit.priceText);
    expect(submit.description160.length).toBeLessThanOrEqual(160);
    expect(submit.description500.length).toBeLessThanOrEqual(500);
    for (const product of register.products) {
      expect(product.description160, product.id).not.toContain("{price}");
      expect(product.description500, product.id).not.toContain("{price}");
    }
  });

  it("fails a listing whose recorded price text differs from the catalogue", () => {
    const stale = structuredClone(register);
    stale.listings[0].priceText = "£1.00/yr / £0.10/mo";
    expect(listingProblems(stale).join("\n")).toMatch(/differs from the catalogue/);
    const current = structuredClone(register);
    current.listings[0].priceText = register.products.find((p) => p.id === "submit").priceText;
    expect(listingProblems(current)).toEqual([]);
  });

  it("fails an unknown state, a repeated utm_source and a submitted listing with no date", () => {
    const broken = structuredClone(register);
    broken.listings[0].state = "pending";
    broken.listings[1].utmSource = broken.listings[0].utmSource;
    const planned = broken.listings.find((l) => l.state === "planned");
    planned.state = "submitted";
    planned.date = "";
    const text = listingProblems(broken).join("\n");
    expect(text).toMatch(/state pending/);
    expect(text).toMatch(/utmSource .* is used twice/);
    expect(text).toMatch(/records its date/);
  });

  it("returns the live listings that carry a URL", () => {
    const withoutUrl = structuredClone(register);
    withoutUrl.listings.find((l) => l.id === "featuredcustomers").url = "";
    expect(liveListings(register).map((l) => l.id)).toEqual([
      "trustpilot",
      "saashub",
      "saashub-diy-accounting",
      "softwarereview",
      "featuredcustomers",
      "linkedin",
      "freeindex",
    ]);
    expect(liveListings(withoutUrl).map((l) => l.id)).toEqual([
      "trustpilot",
      "saashub",
      "saashub-diy-accounting",
      "softwarereview",
      "linkedin",
      "freeindex",
    ]);
  });

  it("tags each link with the listing's utm_source and the product", () => {
    const listing = data.listings.find((l) => l.id === "capterra");
    const [product] = listingProducts(listing, data);
    const url = new URL(listingLink(product, listing));
    expect(url.origin + url.pathname).toBe(product.link);
    expect(url.searchParams.get("utm_source")).toBe("capterra");
    expect(url.searchParams.get("utm_medium")).toBe("listing");
    expect(url.searchParams.get("utm_campaign")).toBe("submit");
  });

  it("uses the company link for a listing that names no product", () => {
    const listing = data.listings.find((l) => l.id === "yell");
    expect(listingProducts(listing, data).map((p) => p.id)).toEqual(["company"]);
  });

  it("points every logo and screenshot at a file of the site", () => {
    for (const product of data.listingProducts) {
      const logos = product.logos;
      const files = [
        logos.icon,
        logos.square.light.svg,
        logos.square.dark.svg,
        ...["light", "dark", "transparent"].flatMap((variant) => logos.square[variant].png.map((p) => p.file)),
        logos.wide.light.svg,
        logos.wide.light.png,
        logos.wide.dark.svg,
        logos.wide.dark.png,
        ...product.screenshots.map((shot) => shot.file),
      ];
      for (const file of files) expect(fs.existsSync(path.join(MARKETING_DIR, file)), file).toBe(true);
    }
  });

  it("names no endorsement and no Resident bundle in the copy pack", () => {
    for (const product of data.listingProducts) {
      for (const text of [product.oneLine, product.description160, product.description500]) {
        expect(text).not.toMatch(/HMRC[- ](approved|accredited|certified|endorsed)|official HMRC software|recommended by HMRC|Resident/i);
      }
    }
  });
});

describe("listings page", () => {
  it("has a Listings section and its nav link", () => {
    const html = fs.readFileSync(path.join(MARKETING_DIR, "index.html"), "utf-8");
    expect(html).toContain('id="listings"');
    expect(html).toContain('href="#listings"');
  });
});

describe("the page with its script off", () => {
  const pageHtml = fs.readFileSync(path.join(MARKETING_DIR, "index.html"), "utf-8");

  it("equals what the build writes from the data", async () => {
    expect(pageHtml).toBe(await renderMarketingPage(pageHtml, readMarketingData()));
  }, 30000);

  it("states the affiliate figures and the disclosure in the text", () => {
    const section = pageHtml.slice(pageHtml.indexOf('id="affiliates"')).replace(/\s+/g, " ");
    const figures = readMarketingData().affiliates;
    expect(section).not.toMatch(/data-aff[^>]*><\/span>/);
    expect(section).toContain(`${figures.ratePercent}</span>% of what a referred customer pays`);
    expect(section).toContain(`${figures.cashHoldDays}</span> days`);
    expect(section).toContain(`${figures.capTaxYearPounds.toLocaleString("en-GB")}</span> a tax year`);
    expect(section).toContain('starts with <span data-aff="disclosure">#ad</span>');
    expect(section).toContain(`gets <span data-aff-offer>${readMarketingData().offers.withPass}</span>`);
  });

  it("writes each product summary into its section", () => {
    for (const section of readMarketingData().sections) {
      const start = pageHtml.indexOf(`id="${section.id}"`);
      const summary = pageHtml.slice(start, pageHtml.indexOf("</p>", pageHtml.indexOf("data-summary>", start)));
      expect(summary.replace(/\s+/g, " ")).toContain(section.summary.replace(/&/g, "&amp;"));
    }
  });

  it("lists every place with its state and marks only a live listing as live", () => {
    const data = readMarketingData();
    for (const listing of data.listings) {
      const state = `<span class="listing-state" data-state="${listing.state}">${listing.state}</span>`;
      expect(pageHtml.replace(/\s+/g, " ")).toContain(`${listing.place.replace(/&/g, "&amp;")} ${state}`);
    }
  });

  it("holds each brand guide hidden until the script shows it", () => {
    const guides = pageHtml.match(/<details id="[a-z-]+-brand"[^>]*>/g);
    expect(guides).toHaveLength(4);
    for (const tag of guides) expect(tag).toContain(" hidden");
    expect(fs.readFileSync(path.join(MARKETING_DIR, "marketing.js"), "utf-8")).toContain("guide.hidden = false");
  });

  it("marks the sample pass code and pass link as examples", () => {
    expect(pageHtml).toContain('placeholder="For example tiger-happy-maple-river"');
    expect(pageHtml).toContain('placeholder="For example https://submit.diyaccounting.co.uk/pass.html?pass=..."');
  });
});

describe("listing packs", () => {
  const packs = data.listingProducts;
  const catalogue = TOML.parse(fs.readFileSync(path.join(publicDir, "submit.catalogue.toml"), "utf-8"));
  const png = (file) => fs.readFileSync(path.join(MARKETING_DIR, file));
  const size = (file) => [png(file).readUInt32BE(16), png(file).readUInt32BE(20)];

  it("has a pack for each site and for each product activity", () => {
    expect(packs.filter((p) => !p.activity).map((p) => p.id)).toEqual(["submit", "spreadsheets", "diya-gl", "company"]);
    const activities = (parent) => packs.filter((p) => p.parent === parent).map((p) => p.activity);
    expect(activities("submit")).toEqual(["MTD VAT", "Limited company accounts"]);
    expect(activities("spreadsheets")).toEqual(["Basic Sole Trader", "Self Employed", "Taxi Driver", "Limited company", "Payslips"]);
    for (const pack of packs) if (pack.parent) expect(packs.find((p) => p.id === pack.parent).activity, pack.id).toBe("");
  });

  it("gives every pack every field, each within its target and every place's limit", () => {
    expect(packProblems(data)).toEqual([]);
  });

  it("fails a pack that lacks a field", () => {
    const broken = structuredClone(data);
    delete broken.listingProducts[0].tagline;
    broken.listingProducts[1].keywords = [];
    broken.listingProducts[2].screenshots = [];
    const text = packProblems(broken).join("\n");
    expect(text).toMatch(/pack submit: tagline is missing/);
    expect(text).toMatch(/pack submit-vat: keywords is missing/);
    expect(text).toMatch(/pack submit-ltd: screenshots has 0/);
  });

  it("fails a text over a place's limit, a short long description and a contact detail or call to action in it", () => {
    const broken = structuredClone(data);
    broken.listingProducts[0].tagline = "x".repeat(61);
    broken.listingProducts[1].long = "Too short. Start with a free day pass at https://submit.diyaccounting.co.uk/ or call 0845 0756015.";
    const text = packProblems(broken).join("\n");
    expect(text).toMatch(/pack submit: tagline is 61 characters, outside the limit of Product Hunt/);
    expect(text).toMatch(/pack submit-vat: long is \d+ words, outside its target/);
    expect(text).toMatch(/pack submit-vat: long holds a link, an email address or a phone number/);
    expect(text).toMatch(/pack submit-vat: long holds a call to action/);
  });

  it("measures characters as a person counts them and a long text in words", () => {
    expect(measure("DIY Accounting Submit™")).toBe(22);
    expect(wordCount("  one two\n\nthree ")).toBe(3);
    const field = data.packFields.find((f) => f.id === "categories");
    expect(limitReport(field, ["a", "b", "c", "d"]).limits.find((l) => l.place === "Product Hunt").fits).toBe(false);
  });

  it("records every place limit with its source, the date it was read and whether the place's page stated it", () => {
    for (const field of data.packFields) {
      for (const limit of field.limits ?? []) {
        expect(limit.place, field.id).toBeTruthy();
        expect(limit.source, `${field.id} ${limit.place}`).toBeTruthy();
        expect(limit.read, `${field.id} ${limit.place}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof limit.confirmed, `${field.id} ${limit.place}`).toBe("boolean");
        expect(limit.min !== undefined || limit.max !== undefined || Boolean(limit.rule), `${field.id} ${limit.place}`).toBe(true);
      }
    }
  });

  it("takes a Submit pack's price from the catalogue and states the confirmation statement charge the catalogue holds", () => {
    expect(packs.find((p) => p.id === "submit-vat").priceText).toBe(catalogPriceText("resident-vat", catalogue));
    expect(packs.find((p) => p.id === "submit-ltd").priceText).toBe(catalogPriceText("resident-ltd", catalogue));
    const cs01 = catalogue.activities.find((a) => a.id === "file-confirmation-statement").prices.find((p) => p.interval === "submission");
    for (const pack of packs.filter((p) => /£\d+\.\d{2} a filing/.test(p.priceNote ?? ""))) {
      expect(pack.priceNote, pack.id).toContain(`£${(cs01.amount / 100).toFixed(2)} a filing`);
    }
  });

  it("names no endorsement, no Resident bundle and nothing that is not production in the pack texts", () => {
    for (const pack of packs) {
      for (const text of [pack.tagline, pack.long, ...pack.features]) {
        expect(text, pack.id).not.toMatch(
          /HMRC[- ](approved|accredited|certified|endorsed)|official HMRC software|recommended by HMRC|Resident/i,
        );
        expect(text, pack.id).not.toMatch(/Income Tax return|Self Assessment filing|CT600 filing|PSC verification/i);
      }
    }
  });

  it("links each pack's videos to published videos with their lengths", () => {
    const publish = JSON.parse(fs.readFileSync(PUBLISH_FILE, "utf-8"));
    for (const pack of packs) {
      for (const video of pack.videos) {
        const published = publish.videos.find((v) => v.id === video.id);
        expect(published?.publish, `${pack.id} ${video.id}`).toBe(true);
        expect(video.url).toBe(`https://www.youtube.com/watch?v=${published.videoId}`);
        expect(Number.isInteger(video.seconds) && video.seconds > 0, `${pack.id} ${video.id}`).toBe(true);
      }
    }
  });

  it("has every pack screenshot at 1270 by 760, under 3 MB, captured and listed", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, "manifest.json"), "utf-8"));
    expect(manifest.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const listed = new Set(manifest.shots.map((s) => s.file));
    for (const pack of packs) {
      for (const shot of pack.screenshots) {
        expect(listed.has(shot.file), shot.file).toBe(true);
        expect(size(shot.file), shot.file).toEqual([PACK_SHOT.width, PACK_SHOT.height]);
        expect(png(shot.file).length, shot.file).toBeLessThan(3000000);
        expect(shot.alt.length, shot.file).toBeGreaterThan(0);
        expect(Boolean(shot.page) !== Boolean(shot.image), `${shot.file} is a page or an image`).toBe(true);
      }
    }
  });

  it("has each brand's logo set at its sizes, rendered from the current icon", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(LOGOS_DIR, "manifest.json"), "utf-8"));
    for (const section of data.sections) {
      const logos = packs.find((p) => p.section === section.id).logos;
      expect(manifest.logos[section.id].hash, section.id).toBe(logoHash(section));
      for (const variant of ["light", "dark", "transparent"]) {
        expect(logos.square[variant].png.map((p) => p.size)).toEqual(LOGO_SIZES);
        for (const { size: px, file } of logos.square[variant].png) expect(size(file), file).toEqual([px, px]);
      }
      for (const variant of ["light", "dark"]) expect(size(logos.wide[variant].png)[1], `${section.id} wide ${variant}`).toBe(400);
    }
  });

  it.skipIf(!siblings)("copies each brand's icon with this repository's header", () => {
    for (const source of ICON_SOURCES) {
      const copy = fs.readFileSync(path.join(LOGOS_DIR, source.id, "icon.svg"), "utf8");
      expect(copy, source.id).toBe(withSvgLicenceHeader(fs.readFileSync(tokenSourcePath(source, siblings), "utf8")));
    }
  });

  it("writes the pack index into the page", () => {
    const html = fs.readFileSync(path.join(MARKETING_DIR, "index.html"), "utf-8");
    for (const pack of packs) expect(html, pack.id).toContain(`href="#pack-${pack.id}"`);
    expect(renderPackIndex(data)).toContain("By product activity");
    expect(html).toMatch(/<p class="built" id="builtAt">Built \d{4}-\d{2}-\d{2}<\/p>/);
  });

  it("zips a pack's files so that an unzip tool reads each one back", () => {
    const entries = [
      { name: "pack.txt", bytes: new TextEncoder().encode("DIY Accounting Submit™") },
      { name: "logos/icon.svg", bytes: new Uint8Array(fs.readFileSync(path.join(MARKETING_DIR, packs[0].logos.icon))) },
    ];
    const zip = Buffer.from(zipStore(entries));
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    let at = zip.readUInt32LE(end + 16);
    for (const entry of entries) {
      expect(zip.readUInt32LE(at)).toBe(0x02014b50);
      const nameLength = zip.readUInt16LE(at + 28);
      expect(zip.subarray(at + 46, at + 46 + nameLength).toString("utf8")).toBe(entry.name);
      expect(zip.readUInt32LE(at + 16)).toBe(zlib.crc32(entry.bytes));
      const local = zip.readUInt32LE(at + 42);
      const dataStart = local + 30 + zip.readUInt16LE(local + 26);
      expect(Buffer.from(zip.subarray(dataStart, dataStart + entry.bytes.length)).equals(Buffer.from(entry.bytes))).toBe(true);
      at += 46 + nameLength;
    }
  });

  it("gives the review links of the review sites and citation directories only", () => {
    const places = reviewListings(data).map((l) => l.id);
    expect(places).toContain("trustpilot");
    expect(places).toContain("freeindex");
    expect(places).not.toContain("linkedin");
  });

  it("zips every file a pack names, under a unique name", () => {
    for (const pack of packs) {
      const files = packFiles(pack, data.company);
      expect(new Set(files.map(([name]) => name)).size, pack.id).toBe(files.length);
      for (const [, file] of files) expect(fs.existsSync(path.join(MARKETING_DIR, file)), file).toBe(true);
    }
  });
});

describe("the company's facts", () => {
  const company = data.company;
  const page = fs.readFileSync(path.join(publicDir, "diy-accounting-limited.html"), "utf-8");

  it("holds every fact a listing form asks for", () => {
    for (const key of ["name", "number", "registeredOffice", "supportEmail", "phone", "website", "founded", "headCount", "boilerplate"]) {
      expect(company[key], key).toBeTruthy();
    }
    expect(company.founded).toBe(2006);
    expect(company.headCount).toBe(4);
    expect(company.links.map((l) => l.id)).toEqual(expect.arrayContaining(["privacy", "terms", "accessibility", "security"]));
    for (const link of company.links) expect(submitPathExists(link.url), link.url).toBe(true);
  });

  it("states the number, the registered office and the phone as the company page does", () => {
    expect(page).toContain(`Company number: ${company.number}`);
    for (const part of company.registeredOffice.split(", ")) expect(page, part).toContain(part);
    expect(page).toContain(`Phone: ${company.phone}`);
    expect(fs.readFileSync(path.join(publicDir, "help.html"), "utf-8")).toContain(company.supportEmail);
  });

  it("gives the founder a biography of about 50 and about 150 words, and the team the names of the photograph's alt text", () => {
    expect(wordCount(company.founderShort)).toBeGreaterThanOrEqual(40);
    expect(wordCount(company.founderShort)).toBeLessThanOrEqual(60);
    expect(wordCount(company.founderLong)).toBeGreaterThanOrEqual(130);
    expect(wordCount(company.founderLong)).toBeLessThanOrEqual(170);
    expect(page).toContain(`alt="${company.teamPhotoAlt}"`);
    const names = company.teamPhotoAlt.split(": ")[1];
    expect(company.team).toContain(names);
  });

  it("copies the team photograph and crops the founder's square", () => {
    expect(
      fs.readFileSync(path.join(MARKETING_DIR, company.teamPhoto)).equals(fs.readFileSync(path.join(root, company.teamPhotoSource))),
    ).toBe(true);
    const jpg = fs.readFileSync(path.join(MARKETING_DIR, company.founderPhoto));
    const sof = jpg.indexOf(Buffer.from([0xff, 0xc0]));
    expect([jpg.readUInt16BE(sof + 7), jpg.readUInt16BE(sof + 5)]).toEqual([company.founderPhotoCrop.size, company.founderPhotoCrop.size]);
    expect(path.dirname(path.join(MARKETING_DIR, company.founderPhoto))).toBe(COMPANY_DIR);
  });
});

describe("copied icons", () => {
  const header =
    '<?xml version="1.0" encoding="UTF-8"?>\n<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->\n<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->\n';

  it("gives an icon with no header this repository's two header lines", () => {
    expect(withSvgLicenceHeader('<svg viewBox="0 0 32 32"></svg>\n')).toBe(header + '<svg viewBox="0 0 32 32"></svg>\n');
  });

  it("replaces a header written as one comment, after the XML declaration", () => {
    const sibling =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0\n     Copyright (C) 2006-2026 DIY Accounting Limited -->\n<svg></svg>\n';
    expect(withSvgLicenceHeader(sibling)).toBe(header + "<svg></svg>\n");
  });

  it("keeps the icon's own descriptive comment", () => {
    const sibling =
      "<!-- SPDX-License-Identifier: X -->\n<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->\n<!-- the ledger mark -->\n<svg></svg>\n";
    expect(withSvgLicenceHeader(sibling)).toBe(header + "<!-- the ledger mark -->\n<svg></svg>\n");
  });

  it("leaves every committed brand icon with the header", () => {
    const logos = path.join(process.cwd(), "web", "marketing", "brand", "logos");
    for (const brand of fs.readdirSync(logos).filter((name) => fs.statSync(path.join(logos, name)).isDirectory())) {
      expect(fs.readFileSync(path.join(logos, brand, "icon.svg"), "utf8").startsWith(header), brand).toBe(true);
    }
  });
});
