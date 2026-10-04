// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

describe("staging with an undeclared dependency", () => {
  test("fails naming the package a vendored module imports without declaring", async () => {
    const repository = mkdtempSync(join(tmpdir(), "diya-submit-stage-fixture-"));
    try {
      const fixture = join(repository, "mcp");
      mkdirSync(join(fixture, "scripts"), { recursive: true });
      mkdirSync(join(fixture, "lib"), { recursive: true });
      mkdirSync(join(fixture, "bin"), { recursive: true });
      mkdirSync(join(repository, "app", "services"), { recursive: true });
      cpSync(join(PACKAGE_DIR, "scripts", "stage-package.js"), join(fixture, "scripts", "stage-package.js"));
      for (const file of ["package.json", "package-lock.json", "README.md", "Dockerfile", ".dockerignore"])
        writeFileSync(join(fixture, file), "{}");
      writeFileSync(join(fixture, "package.json"), JSON.stringify({ dependencies: { zod: "1" } }));
      writeFileSync(join(fixture, "lib", "tool.js"), 'import { f } from "../../app/services/needy.js";\nexport { f };\n');
      writeFileSync(join(repository, "app", "services", "needy.js"), 'import left from "left-pad";\nexport const f = left;\n');
      const { stagePackage: stageFixture } = await import(pathToFileURL(join(fixture, "scripts", "stage-package.js")).href);
      expect(() => stageFixture(join(repository, "out"))).toThrow(/left-pad.*not declared/);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });
});

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
    expect(vendored).toEqual(expect.arrayContaining(["services/microEntityAccounts.js", "services/paypalTransactions.js"]));
    for (const name of vendored) expect(existsSync(join(staged, "lib", "vendored", "app", name)), name).toBe(true);
  });

  test("vendors the modules a vendored module imports relatively, keeping the layout", () => {
    expect(vendored).toEqual(
      expect.arrayContaining(["services/smallCompanyAccounts.js", "services/smallCompanyAccountsIxbrl.js", "lib/xmlDom.js"]),
    );
    const ixbrl = readFileSync(join(staged, "lib", "vendored", "app", "services", "smallCompanyAccountsIxbrl.js"), "utf8");
    expect(ixbrl).toContain('"../lib/xmlDom.js"');
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
  }, 60000);
});
