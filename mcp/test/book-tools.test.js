// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// book-tools.test.js -- open_book and save_book over the two example
// company books, round-tripped through every filesystem format the engine
// reads back: the reopened book must answer the same summary, the same
// canonical lines and the same report figures as the original.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildFileReportDocument } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { canonicalLinesJsonl } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-canonical.js";
import { productOf } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { productModule } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";

import { createSession, openBook, saveBook, SAVE_FORMATS } from "../lib/book-tools.js";
import { createServer, TOOLS } from "../lib/server.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

const EXAMPLES = [
  { name: "BrickWork Pro Ltd", dir: "brickwork-pro-ltd-vat", lineCount: 171 },
  { name: "Precision Code Ltd", dir: "precision-code-ltd-full", lineCount: 736 },
];

function figures(book, lines) {
  const product = productOf(book);
  return buildFileReportDocument(book, lines, product, productModule(product)).values;
}

let scratch;
beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "diya-submit-"));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("open_book", () => {
  for (const example of EXAMPLES) {
    it(`opens the ${example.name} example from its directory`, async () => {
      const session = createSession();
      const summary = await openBook(session, { path: join(FIXTURES, example.dir) });
      expect(summary.kind).toBe("diya-gl-dir");
      expect(summary.product).toBe("ltd");
      expect(summary.entity).toBe(example.name);
      expect(summary.period).toEqual({ start: "2025-04-01", end: "2026-03-31" });
      expect(summary.lineCount).toBe(example.lineCount);
      expect(summary.bookChecks.fail).toBe(0);
      expect(summary.failedChecks).toEqual([]);
      expect(session.lines).toHaveLength(example.lineCount);
    });
  }

  it("refuses a path that does not exist", async () => {
    await expect(openBook(createSession(), { path: join(FIXTURES, "no-such-book") })).rejects.toThrow(/No such file or directory/);
  });

  it("refuses a directory without the two book files", async () => {
    await expect(openBook(createSession(), { path: FIXTURES })).rejects.toThrow(/has no book.toml/);
  });

  it("refuses to save before a book is open", async () => {
    await expect(saveBook(createSession(), { path: join(scratch, "nothing") })).rejects.toThrow(/Call open_book first/);
  });
});

describe("save_book round trips", () => {
  // The three formats the engine reads back without a template fetch; xlsx
  // and zip compose a workbook from spreadsheets.diyaccounting.co.uk's
  // templates and stay out of a unit test.
  const ROUND_TRIPS = [
    { format: "diya-gl-dir", target: (dir) => join(dir, "book") },
    { format: "diya-gl-zip", target: (dir) => join(dir, "book-diya-gl.zip") },
    { format: "json", target: (dir) => join(dir, "book-diya-gl.json") },
  ];

  for (const example of EXAMPLES) {
    for (const trip of ROUND_TRIPS) {
      it(`${example.name} survives ${trip.format}`, async () => {
        const original = createSession();
        const before = await openBook(original, { path: join(FIXTURES, example.dir) });

        const dir = join(scratch, example.dir, trip.format);
        const saved = await saveBook(original, { path: trip.target(dir), format: trip.format });
        expect(saved.format).toBe(trip.format);
        expect(saved.lineCount).toBe(example.lineCount);
        expect(saved.bytes).toBeGreaterThan(0);

        const reopened = createSession();
        const after = await openBook(reopened, { path: saved.path });
        expect(after.kind).toBe(trip.format === "diya-gl-dir" ? "diya-gl-dir" : "file");
        expect({ ...after, kind: undefined, sourcePath: undefined }).toEqual({
          ...before,
          kind: undefined,
          sourcePath: undefined,
        });
        expect(canonicalLinesJsonl(reopened.lines)).toBe(canonicalLinesJsonl(original.lines));
        expect(figures(reopened.book, reopened.lines)).toEqual(figures(original.book, original.lines));
      });
    }
  }

  it("infers the format from the path's extension", async () => {
    const session = createSession();
    await openBook(session, { path: join(FIXTURES, EXAMPLES[0].dir) });
    expect((await saveBook(session, { path: join(scratch, "inferred", "b.json") })).format).toBe("json");
    expect((await saveBook(session, { path: join(scratch, "inferred", "b.zip") })).format).toBe("diya-gl-zip");
    expect((await saveBook(session, { path: join(scratch, "inferred", "b") })).format).toBe("diya-gl-dir");
    await expect(saveBook(session, { path: join(scratch, "inferred", "b.txt") })).rejects.toThrow(/Cannot infer/);
    await expect(saveBook(session, { path: join(scratch, "inferred", "b"), format: "csv" })).rejects.toThrow(/Unknown format/);
  });
});

describe("the server", () => {
  it("registers the book tools, the derivations, the Submit-facing tools and the practice's client tools", () => {
    expect(Object.keys(TOOLS).sort()).toEqual([
      "add_client",
      "client_authorisation_status",
      "derive_micro_entity_accounts",
      "derive_vat_return",
      "get_vat_receipt",
      "invite_client",
      "list_clients",
      "list_vat_obligations",
      "move_book_to_client",
      "open_book",
      "poll_accounts_submission",
      "preview_micro_entity_accounts",
      "run_for_clients",
      "save_book",
      "submit_micro_entity_accounts",
      "submit_vat_return",
      "write_finance_package",
    ]);
    expect(SAVE_FORMATS).toEqual(["diya-gl-dir", "diya-gl-zip", "json", "xlsx", "zip"]);
    const server = createServer();
    expect(server).toBeDefined();
  });
});
