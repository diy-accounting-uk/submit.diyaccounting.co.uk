// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/exploratoryCrawl.test.js

import { describe, test, expect, afterEach, vi } from "vitest";
import {
  parseArguments,
  normaliseLink,
  crawlKey,
  isListVariant,
  isDownloadLink,
  slugForUrl,
  findRawIdentifiers,
  classifyPage,
  countByClass,
  renderContactSheet,
  renderSummary,
  createRequestPacer,
  collapseBlockedRuns,
  measurePage,
  FINDING_CLASSES,
  DEFAULT_MAX_PAGES,
  PROD_REQUEST_BUDGET,
} from "../../../scripts/exploratory-crawl.mjs";

const cleanRecord = {
  status: 200,
  consoleErrors: [],
  failedRequests: [],
  brokenImages: [],
  scrollWidth: 1280,
  clientWidth: 1280,
  overflowingText: [],
  bytes: 1000,
  visibleText: "Welcome. Your return was filed on 3 March 2026.",
};

describe("parseArguments", () => {
  test("requires a lane", () => {
    expect(() => parseArguments([])).toThrow(/--lane is required/);
  });

  test("defaults to the visitor at both viewports and both themes", () => {
    const options = parseArguments(["--lane", "prod"]);
    expect(options.roles).toEqual(["visitor"]);
    expect(options.viewports).toEqual(["desktop", "phone"]);
    expect(options.themes).toEqual(["light", "dark"]);
    expect(options.maxPages).toBe(DEFAULT_MAX_PAGES);
  });

  test("reads lists and the page cap", () => {
    const options = parseArguments(["--lane", "ci", "--roles", "visitor,customer", "--viewports", "phone", "--max-pages", "5"]);
    expect(options.roles).toEqual(["visitor", "customer"]);
    expect(options.viewports).toEqual(["phone"]);
    expect(options.maxPages).toBe(5);
  });

  test("a lane with no known base URL needs one", () => {
    expect(() => parseArguments(["--lane", "simulator"])).toThrow(/--base-url is required/);
    expect(parseArguments(["--lane", "simulator", "--base-url", "http://localhost:3000/"]).baseUrl).toBe("http://localhost:3000/");
  });

  test("rejects an unknown flag, role, viewport and a missing value", () => {
    expect(() => parseArguments(["--bogus", "1"])).toThrow(/Unknown argument/);
    expect(() => parseArguments(["--lane", "ci", "--roles", "admin"])).toThrow(/Unknown role/);
    expect(() => parseArguments(["--lane", "ci", "--viewports", "tablet"])).toThrow(/Unknown viewport/);
    expect(() => parseArguments(["--lane", "ci", "--max-pages"])).toThrow(/needs a value/);
    expect(() => parseArguments(["--lane", "ci", "--max-pages", "0"])).toThrow(/positive whole number/);
  });
});

describe("normaliseLink", () => {
  const base = "https://ci-submit.diyaccounting.co.uk/";
  test("keeps a same-origin link and drops the fragment", () => {
    expect(normaliseLink("/guide.html#top", base + "index.html", base)).toBe("https://ci-submit.diyaccounting.co.uk/guide.html");
    expect(normaliseLink("help.html", base + "index.html", base)).toBe("https://ci-submit.diyaccounting.co.uk/help.html");
  });
  test("drops other origins and non-page schemes", () => {
    expect(normaliseLink("https://www.gov.uk/", base, base)).toBeNull();
    expect(normaliseLink("mailto:a@b.c", base, base)).toBeNull();
    expect(normaliseLink("javascript:void(0)", base, base)).toBeNull();
    expect(normaliseLink("", base, base)).toBeNull();
  });
  test("a signed-in crawl skips links that end the session or destroy data", () => {
    expect(normaliseLink("/auth/logout.html", base, base, { signedIn: true })).toBeNull();
    expect(normaliseLink("/auth/logout.html", base, base, { signedIn: false })).not.toBeNull();
  });
});

describe("page shape keys", () => {
  test("a list is one page shape however its values vary", () => {
    expect(crawlKey("https://x.test/list?sort=a")).toBe(crawlKey("https://x.test/list?sort=b"));
    expect(crawlKey("https://x.test/list")).not.toBe(crawlKey("https://x.test/list?sort=a"));
    expect(crawlKey("https://x.test/list?page=2")).not.toBe(crawlKey("https://x.test/list?sort=a"));
  });
  test("index.html and the folder are one page", () => {
    expect(crawlKey("https://x.test/a/index.html")).toBe(crawlKey("https://x.test/a/"));
  });
  test("recognises sort and page parameters", () => {
    expect(isListVariant("https://x.test/list?sort=a")).toBe(true);
    expect(isListVariant("https://x.test/list?page=2")).toBe(true);
    expect(isListVariant("https://x.test/list?id=2")).toBe(false);
  });
  test("a file path is a download", () => {
    expect(isDownloadLink("https://x.test/files/receipt.pdf")).toBe(true);
    expect(isDownloadLink("https://x.test/guide.html")).toBe(false);
  });
  test("builds a file-safe slug", () => {
    expect(slugForUrl("https://x.test/")).toBe("home");
    expect(slugForUrl("https://x.test/a/b.html?x=1")).toBe("a-b-html-x-1");
  });
});

describe("findRawIdentifiers", () => {
  test("finds a UUID, a Stripe id, an ARN, a token and a stack name", () => {
    expect(findRawIdentifiers("Order 3f2504e0-4f89-41d3-9a0c-0305e82c3301 done")[0].kind).toBe("uuid");
    expect(findRawIdentifiers("Customer cus_Q1w2e3r4t5y6")[0].kind).toBe("stripe-id");
    expect(findRawIdentifiers("arn:aws:s3:::bucket/key")[0].kind).toBe("arn");
    expect(findRawIdentifiers("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def")[0].kind).toBe("jwt");
    expect(findRawIdentifiers("ci-set1-app-EdgeStack")[0].kind).toBe("stack-name");
  });
  test("finds a leaked placeholder or undefined value", () => {
    expect(findRawIdentifiers("Hello undefined")[0].kind).toBe("undefined-text");
    expect(findRawIdentifiers("Hello {{ name }}")[0].kind).toBe("template-placeholder");
  });
  test("finds nothing in ordinary text", () => {
    expect(findRawIdentifiers("Your VAT return for the period ending 31 March 2026 was filed.")).toEqual([]);
    expect(findRawIdentifiers(undefined)).toEqual([]);
  });
});

describe("classifyPage", () => {
  test("a clean page has no findings", () => {
    expect(classifyPage(cleanRecord)).toEqual([]);
  });
  test("flags a 4xx, a 5xx and no response", () => {
    expect(classifyPage({ ...cleanRecord, status: 404 })).toEqual([{ class: "http-error", detail: "status 404" }]);
    expect(classifyPage({ ...cleanRecord, status: 500 })[0].class).toBe("http-error");
    expect(classifyPage({ ...cleanRecord, status: null })[0].detail).toBe("no response");
  });
  test("flags each class from its measurement", () => {
    const findings = classifyPage({
      ...cleanRecord,
      consoleErrors: ["boom"],
      failedRequests: ["GET /x net::ERR_FAILED"],
      brokenImages: ["/a.png"],
      scrollWidth: 1500,
      overflowingText: ['p "long"'],
      bytes: 2 * 1024 * 1024,
      visibleText: "id 3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    });
    expect(findings.map((finding) => finding.class)).toEqual([
      "console-error",
      "failed-request",
      "broken-image",
      "sideways-overflow",
      "text-overflow",
      "page-weight",
      "raw-identifier",
    ]);
  });
  test("a page exactly at the width or the size budget is clean", () => {
    expect(classifyPage({ ...cleanRecord, scrollWidth: 1281, bytes: 1.5 * 1024 * 1024 })).toEqual([]);
  });
});

describe("counts and rendering", () => {
  const pages = [
    {
      url: "https://x.test/a",
      label: "/a",
      status: 404,
      screenshot: "001-a.png",
      findings: classifyPage({ ...cleanRecord, status: 404, consoleErrors: ["e"] }),
    },
    { url: "https://x.test/b", label: "/b", status: 200, screenshot: null, findings: [] },
  ];
  test("counts every class, including those at zero", () => {
    const counts = countByClass(pages);
    expect(Object.keys(counts)).toEqual(FINDING_CLASSES);
    expect(counts["http-error"]).toBe(1);
    expect(counts["console-error"]).toBe(1);
    expect(counts["broken-image"]).toBe(0);
  });
  test("the contact sheet escapes page text and lists each page", () => {
    const html = renderContactSheet({
      lane: "ci",
      role: "visitor",
      viewport: "phone",
      theme: "dark",
      baseUrl: "https://x.test/",
      pages: [{ ...pages[0], label: "/<script>" }, pages[1]],
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("001-a.png");
    expect(html).toContain("2 pages");
  });
  test("the summary has a row per run and a total", () => {
    const summary = renderSummary([{ lane: "ci", role: "visitor", viewport: "phone", theme: "dark", pages }]);
    expect(summary).toContain("| ci | visitor | phone | dark | 2 |");
    expect(summary).toContain("| all |");
  });
});

describe("request pacing", () => {
  test("the prod lane paces by default and other lanes do not", () => {
    expect(parseArguments(["--lane", "prod"]).requestBudget).toBe(PROD_REQUEST_BUDGET);
    expect(parseArguments(["--lane", "ci"]).requestBudget).toBe(0);
    expect(parseArguments(["--lane", "prod", "--request-budget", "0"]).requestBudget).toBe(0);
    expect(() => parseArguments(["--lane", "prod", "--request-budget", "x"])).toThrow(/--request-budget/);
  });

  test("waits until the oldest request leaves the window when the reserve does not fit", async () => {
    let clock = 0;
    const sleeps = [];
    const pacer = createRequestPacer({
      budget: 10,
      windowMs: 1000,
      reserve: 5,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    for (let count = 0; count < 6; count += 1) pacer.record();
    clock = 400;
    await pacer.waitForRoom();
    expect(sleeps).toEqual([601]);
    expect(pacer.count()).toBe(0);
  });

  test("does not wait while the reserve fits, or with no budget", async () => {
    const sleeps = [];
    const sleep = async (ms) => sleeps.push(ms);
    const limited = createRequestPacer({ budget: 100, reserve: 5, sleep });
    for (let count = 0; count < 50; count += 1) limited.record();
    await limited.waitForRoom();
    const unlimited = createRequestPacer({ budget: 0, sleep });
    for (let count = 0; count < 5000; count += 1) unlimited.record();
    await unlimited.waitForRoom();
    expect(sleeps).toEqual([]);
  });
});

describe("collapseBlockedRuns", () => {
  const page = (label, status) => ({
    url: `https://example.test${label}`,
    label,
    status,
    findings: status >= 400 ? [{ class: "http-error", detail: `status ${status}` }] : [],
  });

  test("reports a run of 403s as one finding that names the block", () => {
    const pages = [page("/a", 200), page("/b", 403), page("/c", 403), page("/d", 403), page("/e", 403)];
    const collapsed = collapseBlockedRuns(pages);
    expect(collapsed).toHaveLength(5);
    expect(collapsed[1].findings).toHaveLength(1);
    expect(collapsed[1].findings[0].detail).toMatch(/blocked: status 403 on 4 consecutive pages from \/b to \/e/);
    expect(collapsed.slice(2).flatMap((entry) => entry.findings)).toEqual([]);
    expect(countByClass(collapsed)["http-error"]).toBe(1);
  });

  test("leaves isolated 403s as they are", () => {
    const pages = [page("/a", 403), page("/b", 200), page("/c", 403), page("/d", 403)];
    expect(collapseBlockedRuns(pages)).toEqual(pages);
  });
});

describe("measurePage text overflow", () => {
  const overflowing = { scrollWidth: 300, clientWidth: 100, children: [], textContent: "Error:" };
  const fakeElement = (box, matches = true) => ({
    ...overflowing,
    tagName: "SPAN",
    matches: () => matches,
    getBoundingClientRect: () => box,
  });
  const measureWith = (entries) => {
    const body = {
      querySelectorAll: () => entries.map((entry) => entry.element),
      cloneNode: () => ({ querySelectorAll: () => [], innerText: "" }),
    };
    vi.stubGlobal("document", {
      body,
      images: [],
      title: "",
      documentElement: { scrollWidth: 10, clientWidth: 10 },
      querySelectorAll: () => [],
    });
    vi.stubGlobal("getComputedStyle", (element) => entries.find((entry) => entry.element === element).style);
    return measurePage().overflowingText;
  };
  const visibleStyle = {
    display: "block",
    visibility: "visible",
    overflowX: "visible",
    clip: "auto",
    clipPath: "none",
    textOverflow: "clip",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reports a visible box whose text overflows", () => {
    const element = fakeElement({ width: 100, height: 20 });
    expect(measureWith([{ element, style: visibleStyle }])).toEqual(['span "Error:"']);
  });

  test("skips the visually hidden pattern: clip rectangle to nothing and a one pixel box", () => {
    const element = fakeElement({ width: 1, height: 1 });
    const style = { ...visibleStyle, clip: "rect(0px, 0px, 0px, 0px)", overflowX: "hidden" };
    expect(measureWith([{ element, style }])).toEqual([]);
  });

  test("skips a clip path that shows nothing and a one pixel box with no clip", () => {
    const clipped = fakeElement({ width: 100, height: 20 });
    const tiny = fakeElement({ width: 1, height: 1 });
    expect(
      measureWith([
        { element: clipped, style: { ...visibleStyle, clipPath: "inset(50%)" } },
        { element: tiny, style: visibleStyle },
      ]),
    ).toEqual([]);
  });
});
