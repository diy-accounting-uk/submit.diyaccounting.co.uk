// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/accountsDocumentRendering.browser.test.js
// Each filed accounts document rendered as Companies House and the company's readers see it: the
// XHTML opened in a browser, checked on its visible text, and saved as a picture under target/.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { accountsDocumentCases, computationsDocumentCase } from "@app/test-helpers/accountsDocumentCases.js";

const SCREENSHOT_DIRECTORY = path.join(process.cwd(), "target", "accounts-documents");
const PAGE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'; form-action 'self'";

// Text a header leaks when it is not hidden: taxonomy prefixes, URIs, ISO dates, unit names.
const HEADER_TEXT =
  /xbrli|xbrldi|iso4217|xbrl\.org|companieshouse\.gov\.uk|\b(core|bus|direp|ct-comp):|https?:\/\/|\d{4}-\d{2}-\d{2}|\bpure\b|(?<!limited by )\bshares\b(?! of)/;

async function openDocument(page, name, xhtml) {
  const url = `http://localhost:3000/accounts-documents/${name}.xhtml`;
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: "application/xhtml+xml", body: xhtml }));
  await page.goto(url, { waitUntil: "load" });
}

async function visibleText(page) {
  return page.evaluate(() => document.body.innerText);
}

function expectInOrder(text, labels) {
  let from = 0;
  for (const label of labels) {
    const at = text.indexOf(`\n${label}\t`, from) >= 0 ? text.indexOf(`\n${label}\t`, from) : text.indexOf(`\n${label}\n`, from);
    expect(at, `"${label}" appears after the line before it`).toBeGreaterThanOrEqual(from);
    from = at + label.length;
  }
}

test.describe("Accounts documents as a reader sees them", () => {
  fs.mkdirSync(SCREENSHOT_DIRECTORY, { recursive: true });

  for (const { name, xhtml, balanceSheetLabels } of accountsDocumentCases()) {
    test(`the ${name} document shows the accounts and nothing of its header`, async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 1200 });
      await openDocument(page, name, xhtml);
      await page.screenshot({ path: path.join(SCREENSHOT_DIRECTORY, `${name}.png`), fullPage: true });

      const text = await visibleText(page);
      expect(text).not.toMatch(HEADER_TEXT);

      const balanceSheet = text.slice(text.indexOf("\nBalance sheet\n"));
      expectInOrder(balanceSheet, balanceSheetLabels);

      const figures = await page.evaluate(() =>
        Array.from(document.getElementsByTagName("ix:nonFraction"))
          .filter((fact) => !fact.closest("[style*='display:none']"))
          .map((fact) => ({
            visible: fact.checkVisibility(),
            text: fact.textContent,
            label: fact.closest("tr")?.querySelector("td.label")?.textContent ?? fact.closest("p")?.textContent ?? "",
          })),
      );
      expect(figures.length).toBeGreaterThan(10);
      for (const figure of figures) {
        expect(figure.visible, `${figure.text} is visible`).toBe(true);
        expect(figure.text).toMatch(/^\d{1,3}(,\d{3})*(\.\d+)?$/);
      }

      const balanceSheetRows = await page.evaluate(() => {
        const page = Array.from(document.querySelectorAll("div.page")).find((candidate) =>
          candidate.querySelector("h2")?.textContent.startsWith("Balance sheet"),
        );
        return Array.from(page.querySelectorAll("tbody tr")).map((row) => ({
          label: row.querySelector("td.label").textContent,
          figures: Array.from(row.querySelectorAll("td.figure")).map((cell) => cell.textContent),
        }));
      });
      for (const row of balanceSheetRows.filter((candidate) => candidate.figures.some(Boolean))) {
        expect(row.figures.every(Boolean), `every year shows a figure on "${row.label}"`).toBe(true);
      }
      expect(balanceSheetRows.find((row) => row.label === "Net assets").figures).toHaveLength(2);

      const ending = await page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll("div.page"));
        const last = pages[pages.length - 1];
        const after = [];
        for (let node = last.nextSibling; node; node = node.nextSibling) {
          if (node.nodeType === 1 && node.checkVisibility()) after.push(node.nodeName);
          if (node.nodeType === 3 && node.textContent.trim()) after.push(node.textContent.trim());
        }
        return {
          title: last.querySelector("h2").textContent,
          after,
          bodyEnd: document.body.innerText.trim().endsWith(last.innerText.trim()),
        };
      });
      expect(ending.title).toBe("Notes to the financial statements");
      expect(ending.after).toEqual([]);
      expect(ending.bodyEnd).toBe(true);
    });
  }

  test("the CT computations document shows the computation and nothing of its header", async ({ page }) => {
    await openDocument(page, "ct-computations", computationsDocumentCase());
    await page.screenshot({ path: path.join(SCREENSHOT_DIRECTORY, "ct-computations.png"), fullPage: true });
    const text = await visibleText(page);
    expect(text).not.toMatch(HEADER_TEXT);
    expectInOrder(text, ["Profit before tax per accounts", "Adjusted profit before capital allowances", "Adjusted trading profit"]);
    expect(text).toContain("Less: capital allowances\t(1,000)");
  });

  test("the accounts preview frame on the filing page renders the document under the site's content security policy", async ({ page }) => {
    const pagePath = "companies-house/fileMicroEntityAccounts.html";
    const url = `http://localhost:3000/${pagePath}`;
    const html = fs.readFileSync(path.join(process.cwd(), "web/public", pagePath), "utf-8");
    await page.route("**/*.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await page.route(url, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", headers: { "Content-Security-Policy": PAGE_CSP }, body: html }),
    );
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const micro = accountsDocumentCases().find((documentCase) => documentCase.name === "micro-entity-accounts").xhtml;
    await page.evaluate((xhtml) => {
      document.getElementById("previewRendered").srcdoc = xhtml;
      for (const id of ["companyView", "formView", "previewView", "resultView"]) {
        const view = document.getElementById(id);
        if (view) view.style.display = id === "previewView" ? "block" : "none";
      }
    }, micro);
    const frame = page.frameLocator("#previewRendered");
    await expect(frame.locator("h2", { hasText: "Balance sheet" })).toBeVisible();
    const frameText = await frame.locator("body").innerText();
    expect(frameText).not.toMatch(HEADER_TEXT);
    expect(frameText).toContain("Shareholders' funds\t4,832\t134");
    await expect(page.locator("#previewIxbrl")).toHaveClass(/developer-only-section/);
    await page.locator("#previewView").screenshot({ path: path.join(SCREENSHOT_DIRECTORY, "preview-frame.png") });
  });
});
