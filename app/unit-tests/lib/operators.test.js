// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { _clearOperatorsCache, isOperatorEmail, loadOperators } from "../../lib/operators.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("operators.js", () => {
  const originalCwd = process.cwd();
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operators-test-"));
    _clearOperatorsCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    _clearOperatorsCache();
  });

  it("loads emails from OPERATORS.txt at the process cwd, trimmed, lowercased, blank lines ignored", () => {
    fs.writeFileSync(path.join(tmpDir, "OPERATORS.txt"), "\nAntonyCCartwright@gmail.com \n\n  second@example.com\n\n");
    process.chdir(tmpDir);

    expect(loadOperators()).toEqual(["antonyccartwright@gmail.com", "second@example.com"]);
  });

  it("returns an empty list when OPERATORS.txt is absent", () => {
    process.chdir(tmpDir);

    expect(loadOperators()).toEqual([]);
  });

  it("isOperatorEmail matches a listed email case-insensitively", () => {
    fs.writeFileSync(path.join(tmpDir, "OPERATORS.txt"), "antonyccartwright@gmail.com\n");
    process.chdir(tmpDir);

    expect(isOperatorEmail("antonyccartwright@gmail.com")).toBe(true);
    expect(isOperatorEmail("AntonyCCartwright@Gmail.com")).toBe(true);
    expect(isOperatorEmail("  antonyccartwright@gmail.com  ")).toBe(true);
  });

  it("isOperatorEmail refuses an email not on the list", () => {
    fs.writeFileSync(path.join(tmpDir, "OPERATORS.txt"), "antonyccartwright@gmail.com\n");
    process.chdir(tmpDir);

    expect(isOperatorEmail("someone-else@example.com")).toBe(false);
  });

  it("isOperatorEmail refuses an empty or missing email", () => {
    fs.writeFileSync(path.join(tmpDir, "OPERATORS.txt"), "antonyccartwright@gmail.com\n");
    process.chdir(tmpDir);

    expect(isOperatorEmail("")).toBe(false);
    expect(isOperatorEmail(undefined)).toBe(false);
  });

  it("caches the file read: a change on disk after the first read is not picked up until the cache is cleared", () => {
    fs.writeFileSync(path.join(tmpDir, "OPERATORS.txt"), "first@example.com\n");
    process.chdir(tmpDir);

    expect(loadOperators()).toEqual(["first@example.com"]);

    fs.writeFileSync(path.join(tmpDir, "OPERATORS.txt"), "second@example.com\n");
    expect(loadOperators()).toEqual(["first@example.com"]);

    _clearOperatorsCache();
    expect(loadOperators()).toEqual(["second@example.com"]);
  });
});
