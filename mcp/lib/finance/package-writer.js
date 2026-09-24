// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// package-writer.js -- a diya-gl book and its lines written out as the
// unzipped package directory a product's spreadsheets package holds: one
// workbook for a single-file product (Basic Sole Trader, Taxi Driver), the
// whole named set for a multi-file one (Self Employed, Company). Every
// workbook byte comes from the published @diy-accounting-uk/diya-gl
// package's own saveWorkbookFiles; this module only resolves the book/lines
// input and writes the files it hands back to a local directory.

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { extractBookFromFile } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { nodeResourceLoader } from "@diy-accounting-uk/diya-gl/dist/app/lib/app-resources.js";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { saveWorkbookFiles } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";

// The book and lines to write, from whichever of bookPath or book+lines the
// caller gave. A directory is read as book.toml + lines.jsonl; a file is
// read by content, the same sniffing open_book uses.
async function resolveBook({ bookPath, book, lines }) {
  if (book && lines) return { book, lines };
  if (!bookPath) throw new Error("write_finance_package requires bookPath, or book and lines");
  const resolved = resolvePath(bookPath);
  if (!existsSync(resolved)) throw new Error(`No such file or directory: ${resolved}`);
  if (statSync(resolved).isDirectory()) {
    for (const name of ["book.toml", "lines.jsonl"]) {
      if (!existsSync(resolvePath(resolved, name))) throw new Error(`${resolved} has no ${name}`);
    }
    return loadDiyaGlData(resolved);
  }
  return extractBookFromFile(resolved);
}

/**
 * A diya-gl book and its lines, written as the unzipped package directory a
 * product's spreadsheets package holds: <outputDir>/<dirName>/<file...>,
 * where dirName and the file set are the product's own naming, exactly as
 * savePackageZip's zip entries are named.
 *
 * @param {Object} params
 * @param {string} [params.bookPath] - a diya-gl-dir (book.toml + lines.jsonl), or any file the engine reads
 * @param {Object} [params.book] - a parsed book.toml, instead of bookPath
 * @param {Array} [params.lines] - parsed lines.jsonl entries, instead of bookPath
 * @param {string} [params.templatePackagePath] - the spreadsheets repository's app/ directory, read directly
 *   instead of fetching the workbook templates over the network on first use
 * @param {string} params.outputDir - the directory the package's own named directory is written under
 * @returns {Promise<{ outputDir: string, product: string, dirName: string, files: string[] }>}
 */
export async function writeFinancePackage({ bookPath, book, lines, templatePackagePath, outputDir } = {}) {
  if (!outputDir) throw new Error("write_finance_package requires outputDir");
  const resolved = await resolveBook({ bookPath, book, lines });
  const options = templatePackagePath ? { resources: nodeResourceLoader(resolvePath(templatePackagePath)) } : {};

  const { product, dirName, files } = await saveWorkbookFiles(resolved.book, resolved.lines, options);

  const packageDir = resolvePath(outputDir, dirName);
  mkdirSync(packageDir, { recursive: true });
  for (const { name, bytes } of files) {
    writeFileSync(resolvePath(packageDir, name), Buffer.from(bytes));
  }

  return { outputDir: packageDir, product, dirName, files: files.map((file) => file.name) };
}
