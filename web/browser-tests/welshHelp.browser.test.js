// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshHelp.browser.test.js
//
// The Welsh copies of the help, privacy, terms and accessibility pages read in Welsh after their
// scripts run: the help page keeps its Welsh questions and searches them, and its script writes
// its own text in Welsh.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import toml from "@iarna/toml";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const WELSH = toml.parse(fs.readFileSync(path.join(process.cwd(), "i18n/cy.toml"), "utf-8")).strings;
const ENGLISH_FAQS = toml.parse(fs.readFileSync(path.join(PUBLIC_ROOT, "faqs.toml"), "utf-8")).faq;

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

async function serveSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

// The questions the committed Welsh page holds, by FAQ id.
function welshQuestionsOnFile() {
  const html = fs.readFileSync(path.join(PUBLIC_ROOT, "cy/help.html"), "utf-8");
  const questions = new Map();
  for (const item of html.split(/<div\s+class="faq-item"\s+data-id="/).slice(1)) {
    const id = item.slice(0, item.indexOf('"'));
    const text = item.match(/<span\b[^>]*class="faq-question-text"[^>]*>([\s\S]*?)<\/span\s*>/)[1];
    questions.set(id, text.replace(/\s+/g, " ").trim());
  }
  return questions;
}

async function openWelshHelp(page) {
  await serveSite(page);
  await page.goto("http://localhost:3000/cy/help.html", { waitUntil: "load" });
  await expect.poll(() => page.evaluate(() => Boolean(window.helpPageInstance?.faqSearch))).toBe(true);
}

async function shownQuestions(page) {
  return page
    .locator("#faq-list .faq-item")
    .evaluateAll((items) =>
      items.map((item) => [item.dataset.id, item.querySelector(".faq-question-text").textContent.replace(/\s+/g, " ").trim()]),
    );
}

test.describe("Welsh help page", () => {
  test("lists every question in Welsh once its script has run", async ({ page }) => {
    await openWelshHelp(page);
    const onFile = welshQuestionsOnFile();
    expect(onFile.size).toBeGreaterThan(10);
    const shown = await shownQuestions(page);
    expect(shown.length).toBe(onFile.size);
    const englishById = new Map(ENGLISH_FAQS.map((faq) => [faq.id, faq.question]));
    for (const [id, question] of shown) {
      expect(await page.evaluate((text) => new DOMParser().parseFromString(text, "text/html").body.textContent, onFile.get(id))).toBe(
        question,
      );
      expect(question).not.toBe(englishById.get(id));
    }
    await expect(page.locator("#faq-list .faq-group-title").first()).not.toHaveText(
      /^(Submission|VAT basics|Bundles|Connection|Errors|Receipts)$/,
    );
  });

  test("opens an answer in Welsh", async ({ page }) => {
    await openWelshHelp(page);
    const first = page.locator("#faq-list .faq-item").first();
    await first.locator(".faq-question").click();
    const answer = first.locator(".faq-answer");
    await expect(answer).toBeVisible();
    const id = await first.getAttribute("data-id");
    const english = ENGLISH_FAQS.find((faq) => faq.id === id)
      .answer.trim()
      .split("\n")[0]
      .replace(/^\d+\.\s+/, "");
    await expect(answer).not.toContainText(english.replace(/\*\*/g, ""));
  });

  test("a search lists matching questions in Welsh and counts them in Welsh", async ({ page }) => {
    await openWelshHelp(page);
    const onFile = welshQuestionsOnFile();
    await page.fill("#faq-search", "TAW");
    await expect(page.locator("#search-hint")).not.toHaveText(WELSH["help.hint-every-question"].cy);
    const shown = await shownQuestions(page);
    expect(shown.length).toBeGreaterThan(1);
    expect(shown.length).toBeLessThan(onFile.size);
    for (const [id, question] of shown) expect(onFile.has(id) && question.length > 0).toBe(true);
    await expect(page.locator("#search-hint")).toHaveText(WELSH["help.hint-results"].cy.replace("{count}", String(shown.length)));
  });

  test("an English keyword of a question still finds its Welsh entry", async ({ page }) => {
    await openWelshHelp(page);
    await page.fill("#faq-search", "receipt");
    await expect.poll(async () => (await shownQuestions(page)).length).toBeGreaterThan(0);
    const receiptIds = ENGLISH_FAQS.filter((faq) => faq.category === "receipts").map((faq) => faq.id);
    expect((await shownQuestions(page)).some(([id]) => receiptIds.includes(id))).toBe(true);
  });

  test("a search with no match says so in Welsh and offers every question again", async ({ page }) => {
    await openWelshHelp(page);
    await page.fill("#faq-search", "zzzzqqqq");
    await expect(page.locator("#faq-list .no-results")).toContainText(WELSH["help.no-match"].cy);
    await expect(page.locator("#search-hint")).toHaveText(WELSH["help.hint-no-match"].cy);
    await expect(page.locator("#no-results-support")).toHaveText(WELSH["help.support-request"].cy);
    await page.locator("#clear-search").click();
    expect((await shownQuestions(page)).length).toBe(welshQuestionsOnFile().size);
    await expect(page.locator("#search-hint")).toHaveText(WELSH["help.hint-every-question"].cy);
  });

  test("the English page still lists its questions in English", async ({ page }) => {
    await serveSite(page);
    await page.goto("http://localhost:3000/help.html", { waitUntil: "load" });
    await expect.poll(() => page.evaluate(() => Boolean(window.helpPageInstance?.faqSearch))).toBe(true);
    const englishQuestions = ENGLISH_FAQS.map((faq) => faq.question);
    for (const [, question] of await shownQuestions(page)) expect(englishQuestions).toContain(question);
    await expect(page.locator("#search-hint")).toHaveText("Showing every question");
  });
});

test.describe("Welsh privacy, terms and accessibility pages", () => {
  test("the cookie banner of a Welsh page links the Welsh privacy policy with no English mark", async ({ page }) => {
    await serveSite(page);
    await page.goto("http://localhost:3000/cy/terms.html", { waitUntil: "load" });
    const link = page.locator('.consent-shared a[href$="/privacy.html"], a[href="/cy/privacy.html"]').first();
    await expect(link).toHaveAttribute("href", "/cy/privacy.html");
    await expect(link).toHaveText(WELSH["consent.privacy-link"].cy);
    await expect(page.locator(".consent-in-english")).toHaveText("");
  });

  for (const name of ["privacy", "terms", "accessibility"]) {
    test(`${name} reads in Welsh and links the other Welsh copies from its footer`, async ({ page }) => {
      await serveSite(page);
      await page.goto(`http://localhost:3000/cy/${name}.html`, { waitUntil: "load" });
      await expect(page.locator("html")).toHaveAttribute("lang", "cy");
      const english = fs
        .readFileSync(path.join(PUBLIC_ROOT, `${name}.html`), "utf-8")
        .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]
        .trim();
      await expect(page.locator("h1").first()).not.toHaveText(english);
      for (const other of ["privacy", "terms", "accessibility"]) {
        await expect(page.locator(`footer a[href$="cy/${other}.html"], footer a[href="${other}.html"]`).first()).toBeAttached();
      }
    });

    test(`${name} is no wider than its English page on a phone`, async ({ page }) => {
      await serveSite(page);
      await page.setViewportSize({ width: 390, height: 900 });
      const overflow = async (address) => {
        await page.goto(address, { waitUntil: "load" });
        return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      };
      const englishOverflow = await overflow(`http://localhost:3000/${name}.html`);
      const welshOverflow = await overflow(`http://localhost:3000/cy/${name}.html`);
      expect(welshOverflow).toBeLessThanOrEqual(Math.max(englishOverflow, 0));
    });
  }
});
