// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/exploratoryDiff.test.js

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { describe, test, expect, afterEach } from "vitest";
import {
  parseArguments,
  pageNameForFile,
  listScreenshots,
  pairScreenshots,
  compareScreenshots,
  fileNameForKey,
  renderContactSheet,
  runDiff,
} from "../../../scripts/exploratory-diff.mjs";

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

// A solid-colour RGBA PNG.
function solidPng(width, height, [red, green, blue]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x += 1) row.set([red, green, blue, 255], 1 + x * 4);
  const raw = Buffer.concat(new Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const white = solidPng(4, 4, [255, 255, 255]);
const black = solidPng(4, 4, [0, 0, 0]);
const directories = [];

function crawlFolder(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "xq4-"));
  directories.push(root);
  for (const [relative, buffer] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
  }
  return root;
}

afterEach(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("parseArguments", () => {
  test("requires both folders", () => {
    expect(() => parseArguments(["--before", "a"])).toThrow(/--before and --after/);
  });

  test("reads folders, output and threshold", () => {
    expect(parseArguments(["--before", "a", "--after", "b", "--out", "o", "--threshold", "0.5"])).toEqual({
      before: "a",
      after: "b",
      outDir: "o",
      threshold: 0.5,
    });
  });

  test("rejects an unknown flag", () => {
    expect(() => parseArguments(["--before", "a", "--after", "b", "--nope", "x"])).toThrow(/Unknown argument/);
  });
});

describe("pageNameForFile", () => {
  test("drops the sequence number and the extension", () => {
    expect(pageNameForFile("018-mcp-html.png")).toBe("mcp-html");
    expect(pageNameForFile("001-home.png")).toBe("home");
  });
});

describe("listScreenshots and pairScreenshots", () => {
  test("pairs by lane, role, viewport, theme and page when the sequence numbers shift", () => {
    const before = crawlFolder({
      "ci/visitor/phone-light/001-home.png": white,
      "ci/visitor/phone-light/002-about.png": white,
      "ci/visitor/phone-light/003-gone.png": white,
    });
    const after = crawlFolder({
      "ci/visitor/phone-light/001-home.png": white,
      "ci/visitor/phone-light/002-new.png": white,
      "ci/visitor/phone-light/003-about.png": white,
      "ci/visitor/phone-dark/001-home.png": white,
    });
    const { pairs, onlyBefore, onlyAfter } = pairScreenshots(listScreenshots(before), listScreenshots(after));
    expect(pairs.map((pair) => pair.key)).toEqual(["ci/visitor/phone-light/home", "ci/visitor/phone-light/about"]);
    expect(onlyBefore).toEqual(["ci/visitor/phone-light/gone"]);
    expect(onlyAfter.sort()).toEqual(["ci/visitor/phone-dark/home", "ci/visitor/phone-light/new"]);
  });

  test("a repeated page name takes an occurrence suffix in crawl order", () => {
    const root = crawlFolder({
      "prod/visitor/desktop-light/001-form.png": white,
      "prod/visitor/desktop-light/002-form.png": black,
    });
    expect(listScreenshots(root).map((entry) => entry.key)).toEqual([
      "prod/visitor/desktop-light/form",
      "prod/visitor/desktop-light/form~2",
    ]);
  });

  test("a missing folder lists nothing", () => {
    expect(listScreenshots(path.join(os.tmpdir(), "xq4-does-not-exist"))).toEqual([]);
  });
});

describe("compareScreenshots", () => {
  test("equal images are equal", () => {
    const result = compareScreenshots(white, white);
    expect(result.equal).toBe(true);
    expect(result.differingPixels).toBe(0);
  });

  test("different images report every differing pixel and a diff image", () => {
    const result = compareScreenshots(white, black);
    expect(result.equal).toBe(false);
    expect(result.differingPixels).toBe(16);
    expect(result.ratio).toBe(1);
    expect(result.diff.subarray(1, 4).toString()).toBe("PNG");
  });

  test("a size change is reported and compared on the padded canvas", () => {
    const taller = solidPng(4, 6, [255, 255, 255]);
    const result = compareScreenshots(white, taller);
    expect(result.equal).toBe(false);
    expect(result.sizeChanged).toBe(true);
    expect(result.afterSize).toEqual({ width: 4, height: 6 });
  });
});

describe("runDiff", () => {
  test("writes the sheet and the summary for one equal and one differing pair", () => {
    const before = crawlFolder({
      "ci/customer/desktop-dark/001-home.png": white,
      "ci/customer/desktop-dark/002-account.png": white,
    });
    const after = crawlFolder({
      "ci/customer/desktop-dark/001-home.png": white,
      "ci/customer/desktop-dark/002-account.png": black,
    });
    const outDir = path.join(crawlFolder({}), "out");
    const summary = runDiff({ before, after, outDir, threshold: 0.2 });
    expect(summary.counts).toEqual({ pairs: 2, equal: 1, differing: 1, onlyBefore: 0, onlyAfter: 0 });
    expect(summary.differing[0].key).toBe("ci/customer/desktop-dark/account");
    const sheet = fs.readFileSync(path.join(outDir, "contact-sheet.html"), "utf8");
    expect(sheet).toContain("ci/customer/desktop-dark/account");
    expect(sheet).not.toContain("desktop-dark/home");
    expect(fs.existsSync(path.join(outDir, summary.differing[0].diffImage))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(outDir, "summary.json"), "utf8")).counts.differing).toBe(1);
  });
});

describe("renderContactSheet and fileNameForKey", () => {
  test("escapes the key and links the three images", () => {
    const html = renderContactSheet({
      beforeLabel: "a",
      afterLabel: "b",
      counts: { pairs: 1, equal: 0, differing: 1, onlyBefore: 0, onlyAfter: 0 },
      differing: [
        {
          key: "ci/x/<y>",
          differingPixels: 3,
          ratio: 0.5,
          sizeChanged: false,
          beforeSize: { width: 1, height: 1 },
          afterSize: { width: 1, height: 1 },
          beforeImage: "images/b.png",
          diffImage: "images/d.png",
          afterImage: "images/a.png",
        },
      ],
    });
    expect(html).toContain("ci/x/&lt;y&gt;");
    expect(html).toContain('src="images/d.png"');
  });

  test("flattens a key into a file name", () => {
    expect(fileNameForKey("ci/visitor/phone-light/home")).toBe("ci__visitor__phone-light__home");
  });
});
