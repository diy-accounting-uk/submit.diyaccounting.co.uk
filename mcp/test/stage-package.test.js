// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { stagePackage } from "../scripts/stage-package.js";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));

function javascriptFilesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return javascriptFilesUnder(path);
    return path.endsWith(".js") ? [path] : [];
  });
}

describe("the staged package", () => {
  let root;
  let staged;
  let vendored;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "diya-submit-stage-"));
    staged = join(root, "package");
    vendored = stagePackage(staged);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("vendors the app/services modules the tools import", () => {
    expect(vendored).toEqual(["microEntityAccounts.js", "paypalTransactions.js"]);
    for (const name of vendored) expect(existsSync(join(staged, "lib", "vendored", name))).toBe(true);
  });

  test("leaves no import that reaches outside the package", () => {
    for (const file of javascriptFilesUnder(join(staged, "lib"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from\s+["'](\.\.\/)+app\//);
    }
  });

  test("carries the files the image and the tarball are built from", () => {
    for (const entry of ["bin/diya-submit-mcp.js", "lib/server.js", "package.json", "package-lock.json", "Dockerfile"]) {
      expect(existsSync(join(staged, entry)), entry).toBe(true);
    }
  });

  test("loads and builds the server away from the repository", async () => {
    symlinkSync(join(PACKAGE_DIR, "node_modules"), join(staged, "node_modules"));
    const { createServer } = await import(pathToFileURL(join(staged, "lib", "server.js")).href);
    expect(createServer).toBeTypeOf("function");
  });
});
