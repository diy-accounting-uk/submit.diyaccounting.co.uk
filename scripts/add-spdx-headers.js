#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Script to add SPDX license headers to source files.
 * Usage: node scripts/add-spdx-headers.js
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const JS_HEADER = `// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

`;

const JAVA_HEADER = `/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

`;

const SPDX_PATTERN = /SPDX-License-Identifier/;

function findFiles(dir, extensions, exclude = []) {
  const files = [];

  function walk(currentDir) {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);

      // Skip excluded directories
      if (exclude.some((ex) => fullPath.includes(ex))) {
        continue;
      }

      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extensions.includes(extname(entry))) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function addHeader(filePath, header) {
  const content = readFileSync(filePath, "utf8");

  // Skip if already has SPDX header
  if (SPDX_PATTERN.test(content)) {
    console.log(`  Skipping (already has header): ${filePath}`);
    return false;
  }

  // Handle shebang lines
  let newContent;
  if (content.startsWith("#!")) {
    const firstNewline = content.indexOf("\n");
    const shebang = content.slice(0, firstNewline + 1);
    const rest = content.slice(firstNewline + 1);
    newContent = shebang + header + rest;
  } else {
    newContent = header + content;
  }

  writeFileSync(filePath, newContent);
  console.log(`  Added header: ${filePath}`);
  return true;
}

function main() {
  const rootDir = process.cwd();
  let jsCount = 0;
  let javaCount = 0;

  console.log("Adding SPDX headers to source files...\n");

  // JavaScript files in app/ (excluding node_modules and test fixtures)
  console.log("Processing JavaScript files in app/...");
  const appJsFiles = findFiles(join(rootDir, "app"), [".js", ".mjs"], ["node_modules"]);
  for (const file of appJsFiles) {
    if (addHeader(file, JS_HEADER)) jsCount++;
  }

  // JavaScript files in web/public/lib/
  console.log("\nProcessing JavaScript files in web/public/lib/...");
  const webJsFiles = findFiles(join(rootDir, "web/public/lib"), [".js", ".mjs"], []);
  for (const file of webJsFiles) {
    if (addHeader(file, JS_HEADER)) jsCount++;
  }

  // JavaScript files in scripts/
  console.log("\nProcessing JavaScript files in scripts/...");
  const scriptJsFiles = findFiles(join(rootDir, "scripts"), [".js", ".mjs"], []);
  for (const file of scriptJsFiles) {
    if (addHeader(file, JS_HEADER)) jsCount++;
  }

  // JavaScript files in behaviour-tests/ (main test files only)
  console.log("\nProcessing JavaScript files in behaviour-tests/...");
  const behaviourJsFiles = findFiles(join(rootDir, "behaviour-tests"), [".js"], ["node_modules"]);
  for (const file of behaviourJsFiles) {
    if (addHeader(file, JS_HEADER)) jsCount++;
  }

  // Java files in infra/main/java/
  console.log("\nProcessing Java files in infra/main/java/...");
  const javaFiles = findFiles(join(rootDir, "infra/main/java"), [".java"], []);
  for (const file of javaFiles) {
    if (addHeader(file, JAVA_HEADER)) javaCount++;
  }

  // Java files in infra/test/java/
  console.log("\nProcessing Java files in infra/test/java/...");
  const javaTestFiles = findFiles(join(rootDir, "infra/test/java"), [".java"], []);
  for (const file of javaTestFiles) {
    if (addHeader(file, JAVA_HEADER)) javaCount++;
  }

  console.log("\n========================================");
  console.log(`JavaScript files updated: ${jsCount}`);
  console.log(`Java files updated: ${javaCount}`);
  console.log(`Total files updated: ${jsCount + javaCount}`);
}

main();
