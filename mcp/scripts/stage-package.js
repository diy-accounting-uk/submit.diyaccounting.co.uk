#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// stage-package.js -- builds the directory the npm package and the Docker image are made from.
// The server's tools import modules from the repository's app/ tree. Outside the repository that
// path does not exist, so the staged copy carries each imported module, and every module those
// import in turn, under lib/vendored/app/ and points the tools' imports at it. Usage: node scripts/stage-package.js <output directory>

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_DIR = resolve(PACKAGE_DIR, "..");
const APP_DIR = join(REPOSITORY_DIR, "app");
const COPIED_ENTRIES = ["bin", "lib", "package.json", "package-lock.json", "README.md", "Dockerfile", ".dockerignore"];
const IMPORT_SPECIFIER = /(\bfrom\s+|\bimport\s+)(["'])([^"']+)\2/g;

function javascriptFilesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return javascriptFilesUnder(path);
    return path.endsWith(".js") ? [path] : [];
  });
}

function packageNameOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isInside(directory, path) {
  return path === directory || path.startsWith(directory + sep);
}

/**
 * Copies the publishable parts of the package into outputDirectory and vendors every module of the
 * repository's app/ tree that the package's lib reaches through relative imports, keeping the
 * relative layout under lib/vendored/app/.
 * @param {string} outputDirectory
 * @returns {string[]} the vendored module paths relative to the repository's app/ directory
 */
export function stagePackage(outputDirectory) {
  const output = resolve(outputDirectory);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const entry of COPIED_ENTRIES) cpSync(join(PACKAGE_DIR, entry), join(output, entry), { recursive: true });

  const declared = new Set(Object.keys(JSON.parse(readFileSync(join(PACKAGE_DIR, "package.json"), "utf8")).dependencies ?? {}));
  const vendoredAppDirectory = join(output, "lib", "vendored", "app");
  const vendored = new Set();

  function requireDeclared(specifier, file) {
    const name = packageNameOf(specifier);
    if (!name.startsWith("node:") && !declared.has(name))
      throw new Error(`${file} imports ${name}, which is not declared in mcp/package.json dependencies`);
  }

  function vendor(original) {
    if (vendored.has(original)) return;
    if (!existsSync(original)) throw new Error(`${original} does not exist`);
    vendored.add(original);
    const target = join(vendoredAppDirectory, relative(APP_DIR, original));
    const text = readFileSync(original, "utf8");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    for (const match of text.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[3];
      if (!specifier.startsWith(".")) {
        requireDeclared(specifier, original);
        continue;
      }
      const imported = resolve(dirname(original), specifier);
      if (!isInside(APP_DIR, imported))
        throw new Error(`${original} imports ${specifier}, which is outside the app/ directory and cannot be vendored`);
      vendor(imported);
    }
  }

  for (const file of javascriptFilesUnder(join(output, "lib"))) {
    if (isInside(vendoredAppDirectory, file)) continue;
    const original = join(PACKAGE_DIR, relative(output, file));
    const source = readFileSync(file, "utf8");
    const rewritten = source.replace(IMPORT_SPECIFIER, (whole, lead, quote, specifier) => {
      if (!specifier.startsWith(".")) return whole;
      const imported = resolve(dirname(original), specifier);
      if (isInside(PACKAGE_DIR, imported)) return whole;
      if (!isInside(APP_DIR, imported))
        throw new Error(`${original} imports ${specifier}, which is outside both mcp/ and the app/ directory`);
      vendor(imported);
      const target = relative(dirname(file), join(vendoredAppDirectory, relative(APP_DIR, imported)));
      return lead + quote + (target.startsWith(".") ? target : "./" + target) + quote;
    });
    if (rewritten !== source) writeFileSync(file, rewritten);
  }
  return [...vendored].map((path) => relative(APP_DIR, path)).sort();
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
