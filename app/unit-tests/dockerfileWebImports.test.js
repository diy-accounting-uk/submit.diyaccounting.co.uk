// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// dockerfileWebImports.test.js -- the Lambda image holds app/lib, app/functions, app/data,
// app/services, mcp/lib and mcp/bin, and only the other files the Dockerfile's last stage copies. A
// module of those folders that imports a file the image does not hold, directly or through a file it
// imports, fails to load in every Lambda that reaches it.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IMAGE_FOLDERS = ["app/lib", "app/functions", "app/data", "app/services", "mcp/lib", "mcp/bin"];
// A static import or re-export (from "..."), a side-effect import (import "..."), and an import("...").
const RELATIVE_IMPORT = /(?:\bfrom|\bimport\(|^\s*import)\s*["'](\.[^"']+)["']/gm;

function sourceFiles(root, folder) {
  return readdirSync(resolve(root, folder)).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(resolve(root, path)).isDirectory()) return sourceFiles(root, path);
    return /\.(m?js)$/.test(path) ? [path] : [];
  });
}

const inImageFolder = (path) => IMAGE_FOLDERS.some((folder) => path.startsWith(`${folder}/`));

// Each file outside the image folders that an image module reaches, directly or through files it
// imports, with the module that imports it.
function importsOutsideImageFolders(root) {
  const reached = new Map();
  const queue = IMAGE_FOLDERS.flatMap((folder) => sourceFiles(root, folder));
  const read = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (read.has(file)) continue;
    read.add(file);
    let source;
    try {
      source = readFileSync(resolve(root, file), "utf8");
    } catch {
      continue;
    }
    for (const [, specifier] of source.matchAll(RELATIVE_IMPORT)) {
      const target = relative(root, resolve(root, dirname(file), specifier));
      if (inImageFolder(target)) continue;
      if (!reached.has(target)) reached.set(target, file);
      queue.push(target);
    }
  }
  return reached;
}

// The sources of the last stage's COPY lines that copy from the build context, and the paths it
// copies from the builder stage, which stand for the same files in the build context.
function copiedSources(root) {
  const lines = readFileSync(resolve(root, "Dockerfile"), "utf8").split("\n");
  const lastStage = lines.slice(lines.findLastIndex((line) => /^FROM\s/.test(line)));
  return lastStage
    .filter((line) => /^COPY\s/.test(line))
    .flatMap((line) => {
      const words = line.trim().split(/\s+/).slice(1);
      const fromBuilder = words.some((word) => word.startsWith("--from="));
      const sources = words.filter((word) => !word.startsWith("--")).slice(0, -1);
      return fromBuilder ? sources.map((source) => source.replace(/^\/build\//, "")) : sources;
    });
}

function missingFromImage(root) {
  const copied = copiedSources(root);
  return [...importsOutsideImageFolders(root)]
    .filter(([target]) => !copied.some((source) => target === source || target.startsWith(`${source.replace(/\/$/, "")}/`)))
    .map(([target, importer]) => `${target} (imported by ${importer})`);
}

describe("the Lambda image", () => {
  it("holds every file its modules import, and every file those import", () => {
    expect(missingFromImage(ROOT)).toEqual([]);
  });

  it("finds the imports it checks", () => {
    expect([...importsOutsideImageFolders(ROOT).keys()]).toContain("web/public/lib/balance-sheet-check.js");
  });

  describe("on a small build context", () => {
    let root;
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    function context(files) {
      root = mkdtempSync(join(tmpdir(), "image-imports-"));
      for (const folder of IMAGE_FOLDERS) mkdirSync(join(root, folder), { recursive: true });
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      }
      return root;
    }

    const twoStages = (copies) => `FROM node AS builder\nCOPY web/a.js web/a.js\nFROM lambda\n${copies.join("\n")}\n`;

    it("names a file reached through a copied file that the image does not hold", () => {
      context({
        "app/lib/one.js": 'import { a } from "../../web/a.js";\n',
        "web/a.js": 'export { b } from "./b.js";\n',
        "web/b.js": "export const b = 1;\n",
        "Dockerfile": twoStages(["COPY web/a.js web/a.js"]),
      });
      expect(missingFromImage(root)).toEqual(["web/b.js (imported by web/a.js)"]);
    });

    it("names a file that only the builder stage holds", () => {
      context({
        "app/lib/one.js": 'import { a } from "../../web/a.js";\n',
        "web/a.js": "export const a = 1;\n",
        "Dockerfile": twoStages([]),
      });
      expect(missingFromImage(root)).toEqual(["web/a.js (imported by app/lib/one.js)"]);
    });

    it("counts a file the last stage copies from the builder stage, and reads mcp's modules and side-effect imports", () => {
      context({
        "mcp/lib/tool.js": 'import "../../web/a.js";\n',
        "web/a.js": "export const a = 1;\n",
        "Dockerfile": twoStages(["COPY --from=builder /build/web/a.js ./web/a.js"]),
      });
      expect(missingFromImage(root)).toEqual([]);
      writeFileSync(join(root, "Dockerfile"), twoStages([]));
      expect(missingFromImage(root)).toEqual(["web/a.js (imported by mcp/lib/tool.js)"]);
    });
  });
});
