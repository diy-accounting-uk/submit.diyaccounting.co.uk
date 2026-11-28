// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readBookSource } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { PRODUCTS } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";

import { createSession, openBook, saveBook } from "../lib/book-tools.js";
import { HOSTED_OVERRIDES, HOSTED_TOOL_NAMES, hostedToolNames, REVIEWER_GROUP } from "../lib/hosted-tools.js";
import { HOSTED_WRITE_OVERRIDES, HOSTED_WRITE_TOOL_NAMES, STALE_BOOK_MESSAGE } from "../lib/hosted-write-tools.js";
import { createServer } from "../lib/server.js";
import { fakeBookStore } from "./helpers/fake-book-store.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const BASE = "https://ci.submit.diyaccounting.co.uk";
const V4_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function openSavedBook(store, bookId = "11111111-2222-4333-8444-555555555555") {
  const session = createSession({ credentials: { accessToken: async () => "bearer", idToken: async () => null } });
  await openBook(session, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
  await saveBook(session, { cloud: true, bookId, newBook: true });
  store.calls.length = 0;
  store.fetch.mockClear();
  return session;
}

const SALE = {
  edit: "addSaleLine",
  params: {
    line: {
      entryNumber: "TXN-9001",
      sourceJournalID: "sales",
      postingDate: "2025-06-15",
      accountMainID: "4000",
      amount: 1200,
      documentType: "invoice",
      documentReference: "INV-9001",
      detailComment: "Acme Ltd",
      lineItemComment: "Brickwork",
      taxCode: "S",
      taxRate: 0.2,
    },
  },
};

describe("the hosted write tools", () => {
  let store;

  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = BASE;
    process.env.DIY_SUBMIT_BASE_URL = BASE;
    store = fakeBookStore();
    vi.stubGlobal("fetch", store.fetch);
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    delete process.env.DIY_SUBMIT_BASE_URL;
    vi.unstubAllGlobals();
  });

  it("are offered by the hosted connector in every environment, prod included", () => {
    for (const name of HOSTED_WRITE_TOOL_NAMES) {
      expect(HOSTED_TOOL_NAMES, name).toContain(name);
      expect(hostedToolNames("prod"), name).toContain(name);
      expect(hostedToolNames("ci", [REVIEWER_GROUP]), name).toContain(name);
      expect(HOSTED_OVERRIDES[name], name).toBe(HOSTED_WRITE_OVERRIDES[name]);
    }
    const server = createServer(createSession(), { toolNames: hostedToolNames("ci"), overrides: HOSTED_OVERRIDES });
    for (const name of HOSTED_WRITE_TOOL_NAMES) expect(Object.keys(server._registeredTools), name).toContain(name);
  });

  it("annotate a change to a book destructive, a new book additive, and a link read-only", () => {
    const hints = (name) => HOSTED_WRITE_OVERRIDES[name].annotations;
    for (const name of ["edit_lines", "undo_book_change"]) {
      expect(hints(name), name).toEqual({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
    }
    for (const name of ["new_book", "roll_forward"]) {
      expect(hints(name), name).toEqual({ readOnlyHint: false, destructiveHint: false, openWorldHint: true });
    }
    for (const name of ["extract_book", "save_workbook"]) {
      expect(hints(name), name).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    }
  });

  it("edit_lines saves once with the open version's etag and answers the moved figures, never the lines", async () => {
    const session = await openSavedBook(store);
    const before = session.lines.length;

    const answer = await HOSTED_WRITE_OVERRIDES.edit_lines.handler(session, { edits: [SALE] });

    const puts = store.calls.filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].headers["if-match"]).toBe("etag-1111-1");
    expect(puts[0].body.change).toEqual({ tool: "edit_lines", editCount: 1 });
    expect(answer.version).toBe(2);
    expect(answer.previousVersion).toBe(1);
    expect(answer.lineCount).toBe(before + 1);
    expect(answer.movedFigures.length).toBeGreaterThan(0);
    expect(answer).not.toHaveProperty("lines");
    expect(answer).not.toHaveProperty("book");
    expect(session.cloud.etag).toBe("etag-1111-2");
  });

  it("edit_lines leaves the session as it was when the book changed in the account meanwhile", async () => {
    const session = await openSavedBook(store);
    store.books.get(session.cloud.bookId).metadata.latestETag = "changed-elsewhere";
    const { book, lines, cloud } = session;

    await expect(HOSTED_WRITE_OVERRIDES.edit_lines.handler(session, { edits: [SALE] })).rejects.toThrow(STALE_BOOK_MESSAGE);

    expect(session.book).toBe(book);
    expect(session.lines).toBe(lines);
    expect(session.cloud).toEqual(cloud);
  });

  it("edit_lines refuses with no saved DIYA-GL book open, and makes no call", async () => {
    await expect(HOSTED_WRITE_OVERRIDES.edit_lines.handler(createSession(), { edits: [SALE] })).rejects.toThrow(/open_book/);
    expect(store.fetch).not.toHaveBeenCalled();
  });

  it("new_book saves a new version 4 bookId with no if-match and opens it", async () => {
    const session = createSession({ credentials: { accessToken: async () => "bearer", idToken: async () => null } });

    const answer = await HOSTED_WRITE_OVERRIDES.new_book.handler(session, {
      product: "se",
      businessName: "New Trade",
      yearEnd: "2027-04-05",
    });

    const puts = store.calls.filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].headers).not.toHaveProperty("if-match");
    expect(puts[0].body.change).toEqual({ tool: "new_book" });
    expect(answer.bookId).toMatch(V4_UUID);
    expect(answer.version).toBe(1);
    expect(answer.lineCount).toBe(0);
    expect(session.cloud.bookId).toBe(answer.bookId);
  });

  it("roll_forward saves the next year as a new bookId and never writes the open book", async () => {
    const session = await openSavedBook(store);
    const priorBookId = session.cloud.bookId;

    const answer = await HOSTED_WRITE_OVERRIDES.roll_forward.handler(session, {});

    const puts = store.calls.filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].pathname).not.toContain(priorBookId);
    expect(puts[0].headers).not.toHaveProperty("if-match");
    expect(answer.priorBookId).toBe(priorBookId);
    expect(answer.bookId).toMatch(V4_UUID);
    expect(answer.bookId).not.toBe(priorBookId);
    expect(store.books.get(priorBookId).metadata.latestVersion).toBe(1);
    expect(Array.isArray(answer.failedRollChecks)).toBe(true);
  });

  it("undo_book_change saves the version before the latest as the next version, with the latest etag", async () => {
    const session = await openSavedBook(store);
    const original = session.lines.length;
    await HOSTED_WRITE_OVERRIDES.edit_lines.handler(session, { edits: [SALE] });
    store.calls.length = 0;

    const answer = await HOSTED_WRITE_OVERRIDES.undo_book_change.handler(session, {});

    expect(store.calls.map((call) => `${call.method} ${call.pathname}`)).toEqual([
      "GET /api/v1/books",
      `GET /api/v1/books/${session.cloud.bookId}/versions/1`,
      `PUT /api/v1/books/${session.cloud.bookId}`,
    ]);
    const put = store.calls[2];
    expect(put.headers["if-match"]).toBe("etag-1111-2");
    expect(put.body.change).toEqual({ tool: "undo_book_change", restoredVersion: 1 });
    expect(put.body.zipBase64).toBe(store.books.get(session.cloud.bookId).zips.get(1));
    expect(answer).toMatchObject({ version: 3, restoredVersion: 1, previousVersion: 2, lineCount: original });
    expect(answer.movedFigures.length).toBeGreaterThan(0);
    const restored = await readBookSource(Buffer.from(put.body.zipBase64, "base64"), "b.zip", { products: PRODUCTS });
    expect(restored.lines).toHaveLength(original);
  });

  it("undo_book_change refuses a version no longer kept, naming the oldest kept and each version's change", async () => {
    store = fakeBookStore({ versionsKept: 2 });
    vi.stubGlobal("fetch", store.fetch);
    const session = await openSavedBook(store);
    await HOSTED_WRITE_OVERRIDES.edit_lines.handler(session, { edits: [SALE] });
    await HOSTED_WRITE_OVERRIDES.edit_lines.handler(session, {
      edits: [{ edit: "addSaleLine", params: { line: { ...SALE.params.line, entryNumber: "TXN-9002", amount: 50 } } }],
    });

    await expect(HOSTED_WRITE_OVERRIDES.undo_book_change.handler(session, { toVersion: 1 })).rejects.toThrow(
      /oldest kept is 2.*"tool":"edit_lines","editCount":1/,
    );
    expect(store.calls.filter((call) => call.method === "PUT")).toHaveLength(2);
  });

  it("extract_book answers the upload page on the public address and makes no call", () => {
    const answer = HOSTED_WRITE_OVERRIDES.extract_book.handler(createSession(), { clientId: "client 1" });
    expect(answer.uploadLink).toBe(`${BASE}/records.html?clientId=client%201#upload`);
    expect(answer.instruction).toMatch(/DIYA-GL book/);
    expect(store.fetch).not.toHaveBeenCalled();
  });

  it("save_workbook answers the download page for the open book and refuses xlsx for a set of workbooks", async () => {
    const session = await openSavedBook(store);
    const answer = HOSTED_WRITE_OVERRIDES.save_workbook.handler(session, { format: "zip" });
    expect(answer.downloadLink).toBe(`${BASE}/records.html?bookId=${session.cloud.bookId}&format=zip`);
    expect(() => HOSTED_WRITE_OVERRIDES.save_workbook.handler(session, {})).toThrow(/package zip/);
    expect(store.fetch).not.toHaveBeenCalled();
  });
});
