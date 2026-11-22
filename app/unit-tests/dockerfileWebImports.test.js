// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// dockerfileWebImports.test.js -- the Lambda image holds app/lib, app/functions, app/data and
// app/services, and only the files of web/ the Dockerfile names. A module of those folders that
// imports a file of web/ the image does not hold fails to load in every Lambda that reaches it.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IMAGE_FOLDERS = ["app/lib", "app/functions", "app/data", "app/services"];
const RELATIVE_IMPORT = /(?:\bfrom|\bimport\()\s*["'](\.[^"']+)["']/g;

function sourceFiles(folder) {
  return readdirSync(resolve(ROOT, folder)).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(resolve(ROOT, path)).isDirectory()) return sourceFiles(path);
    return path.endsWith(".js") ? [path] : [];
  });
}

// Each file of web/ an image module imports, with one module that imports it.
function webImports() {
  const imports = new Map();
  for (const file of IMAGE_FOLDERS.flatMap(sourceFiles)) {
    for (const [, specifier] of readFileSync(resolve(ROOT, file), "utf8").matchAll(RELATIVE_IMPORT)) {
      const target = relative(ROOT, resolve(ROOT, dirname(file), specifier));
      if (target.startsWith("web/") && !imports.has(target)) imports.set(target, file);
    }
  }
  return imports;
}

// The sources of the Dockerfile's COPY lines that copy from the build context.
function copiedSources() {
  return readFileSync(resolve(ROOT, "Dockerfile"), "utf8")
    .split("\n")
    .filter((line) => /^COPY\s/.test(line) && !line.includes("--from="))
    .map((line) => line.trim().split(/\s+/)[1]);
}

describe("the Lambda image", () => {
  it("holds every file of web/ that its modules import", () => {
    const copied = copiedSources();
    const missing = [...webImports()]
      .filter(([target]) => !copied.some((source) => target === source || target.startsWith(`${source}/`)))
      .map(([target, importer]) => `${target} (imported by ${importer})`);

    expect(missing).toEqual([]);
  });

  it("finds the imports it checks", () => {
    expect([...webImports().keys()]).toContain("web/public/lib/balance-sheet-check.js");
  });
});
