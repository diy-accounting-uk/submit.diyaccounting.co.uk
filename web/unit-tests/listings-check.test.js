// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/listings-check.test.js

import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { main } from "../../scripts/listings-check.mjs";
import { readListings } from "../../scripts/listings-register.mjs";

describe("listings-check", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exits 0 for the committed register", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main([])).toBe(0);
    expect(log.mock.calls[0][0]).toMatch(/is sound/);
  });

  it("exits 1 and writes an issue body when a recorded price text is stale", () => {
    const register = readListings();
    register.listings[0].priceText = "£0.01/yr";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "listings-check-"));
    const body = path.join(dir, "body.md");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main(["--issue-body", body], register)).toBe(1);
    expect(error.mock.calls[0][0]).toMatch(/differs from the catalogue/);
    expect(fs.readFileSync(body, "utf8")).toMatch(/- listing capterra: recorded price text "£0.01\/yr" differs/);
    fs.rmSync(dir, { recursive: true });
  });

  it("exits 0 without writing a body when the register is sound", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const body = path.join(os.tmpdir(), `listings-check-none-${process.pid}.md`);
    expect(main(["--issue-body", body])).toBe(0);
    expect(fs.existsSync(body)).toBe(false);
  });
});
