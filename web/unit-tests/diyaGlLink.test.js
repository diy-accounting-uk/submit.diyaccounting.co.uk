// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, test } from "vitest";
import { decodeBookFragment } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-link.js";
import { bookFragment, bookTexts, diyaGlBookAddress } from "../public/lib/diya-gl-link.js";

const TEXTS = {
  toml: '[entityInformation]\norganizationIdentifier = "BRAMBLE & CO LTD"\n',
  lines: `${JSON.stringify({ accountMainID: "1200", amount: 1500.25, description: "Café — opening bank" })}\n`,
};

describe("diya-gl-link", () => {
  test("a book's fragment decodes with the diya-gl package's own reader to the same text", async () => {
    const fragment = await bookFragment(TEXTS);
    expect(fragment).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeBookFragment(fragment)).toEqual(TEXTS);
  });

  test("a book of many lines still decodes whole", async () => {
    const lines = Array.from({ length: 3000 }, (_, index) =>
      JSON.stringify({ accountMainID: "4000", amount: index, reference: `R${index}` }),
    ).join("\n");
    expect(decodeBookFragment(await bookFragment({ toml: TEXTS.toml, lines }))).toEqual({ toml: TEXTS.toml, lines });
  });

  test("the address opens the company book, or with download package writes the spreadsheet package", async () => {
    const open = await diyaGlBookAddress("https://ci.diya-gl.co.uk/", TEXTS);
    const pack = await diyaGlBookAddress("https://ci.diya-gl.co.uk", TEXTS, { download: "package" });
    expect(open).toMatch(/^https:\/\/ci\.diya-gl\.co\.uk\/ltd\.html#book=[A-Za-z0-9_-]+$/);
    expect(pack).toMatch(/^https:\/\/ci\.diya-gl\.co\.uk\/ltd\.html\?download=package#book=[A-Za-z0-9_-]+$/);
    expect(decodeBookFragment(pack.split("#book=")[1])).toEqual(TEXTS);
  });

  test("the text comes from the stamped book", () => {
    const calls = [];
    const bundle = {
      stampBook: (book) => ({ ...book, stamped: true }),
      canonicalBookToml: (book) => {
        calls.push(book);
        return "toml";
      },
      canonicalLinesJsonl: (lines, book) => {
        calls.push(book);
        return "lines";
      },
    };
    expect(bookTexts(bundle, { entityInformation: {} }, [])).toEqual({ toml: "toml", lines: "lines" });
    expect(calls.every((book) => book.stamped)).toBe(true);
  });

  test("a book link needs both texts", async () => {
    await expect(bookFragment({ toml: "x" })).rejects.toThrow("lines.jsonl");
  });
});
