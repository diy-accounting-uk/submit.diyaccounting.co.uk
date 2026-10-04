#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// stage-package.js -- builds the directory the npm package and the Docker image are made from.
// The server's tools import two modules from the repository's app/services (the micro-entity
// accounts balance-sheet mapping and the PayPal transaction adapter). Outside the repository
// that path does not exist, so the staged copy carries each imported module under lib/vendored/
// and points the import at it. Usage: node scripts/stage-package.js <output directory>

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_DIR = resolve(PACKAGE_DIR, "..");
const COPIED_ENTRIES = ["bin", "lib", "package.json", "package-lock.json", "README.md", "Dockerfile", ".dockerignore"];
const APP_SERVICE_IMPORT = /(["'])((?:\.\.\/)+app\/services\/([A-Za-z0-9_-]+\.js))\1/g;
const RELATIVE_IMPORT = /\bfrom\s+["']\.{1,2}\//;

function javascriptFilesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return javascriptFilesUnder(path);
    return path.endsWith(".js") ? [path] : [];
  });
}

/**
 * Copies the publishable parts of the package into outputDirectory and vendors the app/services
 * modules its lib imports.
 * @param {string} outputDirectory
 * @returns {string[]} the vendored module file names
 */
export function stagePackage(outputDirectory) {
  const output = resolve(outputDirectory);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const entry of COPIED_ENTRIES) cpSync(join(PACKAGE_DIR, entry), join(output, entry), { recursive: true });

  const vendoredDirectory = join(output, "lib", "vendored");
  const vendored = new Set();
  for (const file of javascriptFilesUnder(join(output, "lib"))) {
    const source = readFileSync(file, "utf8");
    const rewritten = source.replace(APP_SERVICE_IMPORT, (_match, quote, _specifier, moduleName) => {
      const original = join(REPOSITORY_DIR, "app", "services", moduleName);
      if (!existsSync(original)) throw new Error(`${file} imports app/services/${moduleName}, which does not exist`);
      if (!vendored.has(moduleName)) {
        const text = readFileSync(original, "utf8");
        if (RELATIVE_IMPORT.test(text))
          throw new Error(`app/services/${moduleName} imports a relative module, so it cannot be vendored alone`);
        mkdirSync(vendoredDirectory, { recursive: true });
        writeFileSync(join(vendoredDirectory, moduleName), text);
        vendored.add(moduleName);
      }
      const target = relative(dirname(file), join(vendoredDirectory, moduleName));
      const specifier = target.startsWith(".") ? target : "./" + target;
      return quote + specifier + quote;
    });
    if (rewritten !== source) writeFileSync(file, rewritten);
  }
  return [...vendored].sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputDirectory = process.argv[2];
  if (!outputDirectory) {
    console.error("Usage: node scripts/stage-package.js <output directory>");
    process.exit(2);
  }
  const vendored = stagePackage(outputDirectory);
  console.log(`Staged ${PACKAGE_DIR} into ${resolve(outputDirectory)}; vendored ${vendored.join(", ")}`);
}
