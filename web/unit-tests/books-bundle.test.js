// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

const bundleUrl = pathToFileURL(path.join(process.cwd(), "web/public/lib/books-bundle.js")).href;

describe("books-bundle.js", () => {
  it("exposes the book reader and the three filing derivations", async () => {
    const bundle = await import(bundleUrl);
    expect(Object.keys(bundle).sort()).toEqual([
      "deriveItsaAnnualSubmission",
      "deriveItsaQuarterlyUpdate",
      "deriveVatReturn",
      "readBookSource",
    ]);
    for (const name of Object.keys(bundle)) {
      expect(typeof bundle[name]).toBe("function");
    }
  });

  it("rejects bytes that are not a book with the reader's own error", async () => {
    const { readBookSource } = await import(bundleUrl);
    await expect(readBookSource(new Uint8Array([1, 2, 3]), "notes.bin")).rejects.toThrow(/notes\.bin/);
  });

  it("reads a JSON book against the precompiled validators", async () => {
    const { readBookSource } = await import(bundleUrl);
    const document = { format: "diya-gl-json", version: 1, product: "bst", book: {}, lines: [] };
    const error = await readBookSource(new TextEncoder().encode(JSON.stringify(document)), "book.json").catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toMatch(/schemas could not be read|not available in the books bundle/);
  });
});
