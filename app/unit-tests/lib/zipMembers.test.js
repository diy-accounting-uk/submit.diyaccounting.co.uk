// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listZipMemberNames, isDiyaGlPackage, NotAZipError } from "../../lib/zipMembers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, "../../../fixtures/books/diya-gl-example.zip");

describe("zipMembers", () => {
  test("reads the five member names from a real diya-gl zip", () => {
    const buffer = fs.readFileSync(FIXTURE_PATH);

    const names = listZipMemberNames(buffer);

    expect(names).toEqual(["book.toml", "lines.jsonl", "report.json", "bookchecks.json", "overtyped.json"]);
  });

  test("throws NotAZipError on truncated bytes", () => {
    const buffer = fs.readFileSync(FIXTURE_PATH);
    const truncated = buffer.subarray(0, 40);

    expect(() => listZipMemberNames(truncated)).toThrow(NotAZipError);
  });

  test("throws NotAZipError on a buffer with no end-of-central-directory record", () => {
    const notAZip = Buffer.from("not a zip file at all, just some bytes that are long enough");

    expect(() => listZipMemberNames(notAZip)).toThrow(NotAZipError);
  });

  test("recognises a diya-gl package regardless of member order", () => {
    expect(isDiyaGlPackage(["book.toml", "lines.jsonl", "report.json", "bookchecks.json", "overtyped.json"])).toBe(true);
    expect(isDiyaGlPackage(["report.json", "book.toml", "lines.jsonl"])).toBe(true);
  });

  test("rejects a package missing a required member", () => {
    expect(isDiyaGlPackage(["book.toml", "report.json"])).toBe(false);
  });

  test("rejects a package with a member outside the allowed set", () => {
    expect(isDiyaGlPackage(["book.toml", "lines.jsonl", "report.json", "unexpected.txt"])).toBe(false);
  });

  test("rejects an empty member list", () => {
    expect(isDiyaGlPackage([])).toBe(false);
  });
});
