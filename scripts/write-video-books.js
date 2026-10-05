// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/write-video-books.js
//
// Writes the book files the video scenes drop on "Fill from your books", one JSON file per
// fixture book, into videos/books/. Run it again after a fixture book changes:
//   node scripts/write-video-books.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { writeBookJson } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDirectory = path.join(repoRoot, "mcp/test/fixtures");
const outputDirectory = path.join(repoRoot, "videos/books");
const FIXTURE_BOOKS = ["brickwork-pro-ltd-vat", "brickwork-pro-se-vat"];

fs.mkdirSync(outputDirectory, { recursive: true });
for (const fixtureName of FIXTURE_BOOKS) {
  const { book, lines } = loadDiyaGlData(path.join(fixturesDirectory, fixtureName));
  const bookFile = path.join(outputDirectory, `${fixtureName}.json`);
  fs.writeFileSync(bookFile, writeBookJson(book, lines), "utf8");
  console.log(`wrote ${path.relative(repoRoot, bookFile)}`);
}
