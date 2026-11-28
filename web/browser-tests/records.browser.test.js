// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/records.browser.test.js
// The records page: a file chosen is read in the browser and saved as a new DIYA-GL book through the
// book storage route, the account's DIYA-GL books list with each version and what made it, and a
// download follows the download route's link. The storage routes are stood in for here.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const BOOKS_DIR = path.join(process.cwd(), "mcp/test/fixtures");
const RECORDS_URL = "http://localhost:3000/records.html";
const SIGNED_LINK = "http://localhost:3000/signed-download/Precision-Code-Ltd-diya-gl.json";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function zippedBook(directory) {
  const zip = new JSZip();
  zip.file("book.toml", fs.readFileSync(path.join(BOOKS_DIR, directory, "book.toml")));
  zip.file("lines.jsonl", fs.readFileSync(path.join(BOOKS_DIR, directory, "lines.jsonl")));
  return zip.generateAsync({ type: "nodebuffer" });
}

const STORED_BOOK = {
  bookId: "11111111-2222-4333-8444-555555555555",
  title: "Precision Code Ltd",
  product: "ltd",
  periodCoveredStart: "2025-04-01",
  periodCoveredEnd: "2026-03-31",
  latestVersion: 3,
  versions: [
    { version: 1, createdAt: "2026-11-01T10:00:00.000Z", change: { tool: "import" } },
    { version: 2, createdAt: "2026-11-02T10:00:00.000Z", change: { tool: "edit_lines", editCount: 2 } },
    { version: 3, createdAt: "2026-11-03T10:00:00.000Z", change: { tool: "undo_book_change", restoredVersion: 1 } },
  ],
};

// The site from web/public, and stand-ins for the book routes that record what the page sends.
async function serveSite(page, { books = [STORED_BOOK] } = {}) {
  const calls = { puts: [], downloads: [] };
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "records@test.diyaccounting.co.uk" }));
    } catch {}
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.hostname !== "localhost") return route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    if (url.pathname === "/api/v1/bundle") return json({ bundles: [], tokensRemaining: 0 });
    if (url.pathname === "/api/v1/books" && request.method() === "GET") return json({ books });
    if (/^\/api\/v1\/books\/[^/]+$/.test(url.pathname) && request.method() === "PUT") {
      const body = JSON.parse(request.postData());
      calls.puts.push({ path: url.pathname, body });
      books = [
        ...books,
        {
          ...STORED_BOOK,
          bookId: url.pathname.split("/").pop(),
          title: body.title,
          latestVersion: 1,
          versions: [{ version: 1, createdAt: "2026-11-28T00:00:00.000Z", change: body.change }],
        },
      ];
      return json({ metadata: { latestVersion: 1, latestETag: "etag-1" } });
    }
    if (/\/download$/.test(url.pathname)) {
      calls.downloads.push(url.pathname + url.search);
      return json({ url: SIGNED_LINK, filename: "Precision-Code-Ltd-diya-gl.json", format: url.searchParams.get("format"), version: 3 });
    }
    if (url.pathname.startsWith("/signed-download/")) return route.fulfill({ status: 200, contentType: "text/plain", body: "file" });
    if (url.pathname.startsWith("/api/")) return json({});
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.join(PUBLIC_ROOT, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
  });
  return calls;
}

test.describe("the records page", () => {
  test("lists each DIYA-GL book with its versions and what made each one, newest first", async ({ page }) => {
    await serveSite(page);
    await page.goto(RECORDS_URL, { waitUntil: "domcontentloaded" });

    const item = page.locator(`#bookList li[data-book-id="${STORED_BOOK.bookId}"]`);
    await expect(item.locator("h3")).toHaveText("Precision Code Ltd");
    await expect(item).toContainText("2025-04-01 to 2026-03-31, version 3");
    await expect(item.locator(".record-versions li")).toHaveText([
      "2026-11-03 Undo, back to version 1",
      "2026-11-02 2 line changes by an assistant",
      "2026-11-01 Uploaded on this page",
    ]);
    await expect(item.locator("button")).toHaveText(["Package zip", "DIYA-GL zip", "DIYA-GL book as JSON"]);
  });

  test("saves a chosen DIYA-GL zip as a new DIYA-GL book read in the browser, and lists it", async ({ page }) => {
    const calls = await serveSite(page, { books: [] });
    await page.goto(RECORDS_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#bookList")).toContainText("No DIYA-GL book is saved in your account yet.");

    await page
      .locator("#uploadFile")
      .setInputFiles({ name: "precision.zip", mimeType: "application/zip", buffer: await zippedBook("precision-code-ltd-full") });

    await expect(page.locator("#uploadResult")).toContainText("as a new DIYA-GL book with 736 lines.");
    expect(calls.puts).toHaveLength(1);
    const { path: putPath, body } = calls.puts[0];
    expect(putPath).toMatch(/^\/api\/v1\/books\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(body).toMatchObject({
      product: "ltd",
      periodCoveredStart: "2025-04-01",
      periodCoveredEnd: "2026-03-31",
      change: { tool: "import" },
    });
    const stored = await JSZip.loadAsync(Buffer.from(body.zipBase64, "base64"));
    expect(Object.keys(stored.files).sort()).toEqual(["book.toml", "lines.jsonl", "report.json"]);
    await expect(page.locator("#bookList .record-versions li")).toHaveText(["2026-11-28 Uploaded on this page"]);
  });

  test("a download button follows the download route's link for that book and format", async ({ page }) => {
    const calls = await serveSite(page);
    await page.goto(RECORDS_URL, { waitUntil: "domcontentloaded" });

    await page.locator('#bookList button[data-format="json"]').click();

    await page.waitForURL(SIGNED_LINK);
    expect(calls.downloads).toEqual([`/api/v1/books/${STORED_BOOK.bookId}/versions/latest/download?format=json`]);
  });

  test("a link naming a book and a format starts that download once signed in", async ({ page }) => {
    const calls = await serveSite(page);
    await page.goto(`${RECORDS_URL}?bookId=${STORED_BOOK.bookId}&format=diya-gl-zip&clientId=client-1`, { waitUntil: "domcontentloaded" });

    await page.waitForURL(SIGNED_LINK);
    expect(calls.downloads).toEqual([`/api/v1/books/${STORED_BOOK.bookId}/versions/latest/download?format=diya-gl-zip&clientId=client-1`]);
  });
});
