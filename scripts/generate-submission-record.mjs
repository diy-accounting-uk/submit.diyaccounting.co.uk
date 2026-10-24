// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Writes the two generated copies of the submission record house style:
// - app/lib/submissionRecordStyle.js: the record section of web/public/submission-record.css
//   with the .submission-record scope removed, one rule per line, for the iXBRL builders to
//   place inline in each filed document;
// - web/public/lib/submission-record.js: app/lib/submissionRecord.js for the browser.
//
// Usage: node scripts/generate-submission-record.mjs [--check]
// --check writes nothing and exits 1 when either file is not current.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE = ".submission-record";
const RECORD_START = "/* record:start */";
const RECORD_END = "/* record:end */";
const LICENCE = "// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0\n// Copyright (C) 2006-2026 DIY Accounting Limited\n";

export const STYLESHEET = "web/public/submission-record.css";
export const HELPER = "app/lib/submissionRecord.js";
export const STYLE_MODULE = "app/lib/submissionRecordStyle.js";
export const BROWSER_HELPER = "web/public/lib/submission-record.js";

function unscopedSelector(selector) {
  if (selector === SCOPE) return "body";
  if (selector.startsWith(`${SCOPE} `)) return selector.slice(SCOPE.length + 1);
  throw new Error(`The record section of ${STYLESHEET} holds a selector outside ${SCOPE}: ${selector}`);
}

/**
 * The record section of the stylesheet as a standalone document's inline style: the scope
 * removed from each selector (the bare scope becomes body), one rule per line.
 * @param {string} css - the whole stylesheet
 * @returns {string}
 */
export function recordStyleFromStylesheet(css) {
  const start = css.indexOf(RECORD_START);
  const end = css.indexOf(RECORD_END);
  if (start < 0 || end < start) throw new Error(`${STYLESHEET} has no ${RECORD_START} ... ${RECORD_END} section`);
  const section = css.slice(start + RECORD_START.length, end).replace(/\/\*[\s\S]*?\*\//g, "");
  if (section.includes("@")) throw new Error(`The record section of ${STYLESHEET} holds an at-rule, which the inline copy cannot carry`);
  const rules = section
    .split("}")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const [selectorText, declarationText] = rule.split("{");
      const selectors = selectorText
        .split(",")
        .map((selector) => unscopedSelector(selector.trim().replace(/\s+/g, " ")))
        .join(", ");
      const declarations = declarationText
        .split(";")
        .map((declaration) => declaration.trim().replace(/\s+/g, " "))
        .filter(Boolean);
      return `${selectors} { ${declarations.join("; ")}; }`;
    });
  return `\n${rules.join("\n")}\n`;
}

/**
 * The generated files and the contents each should have, from the sources in root.
 * @param {string} [root]
 * @returns {{path: string, contents: string}[]}
 */
export function generatedFiles(root = ROOT) {
  const recordStyle = recordStyleFromStylesheet(readFileSync(join(root, STYLESHEET), "utf8"));
  const helperSource = readFileSync(join(root, HELPER), "utf8");
  if (!helperSource.startsWith(LICENCE)) throw new Error(`${HELPER} does not start with the licence header`);
  const generatedNote = (source) =>
    `// Generated from ${source} by scripts/generate-submission-record.mjs. Edit the source and run\n// npm run generate:submission-record.\n`;
  return [
    {
      path: STYLE_MODULE,
      contents: `${LICENCE}\n${generatedNote(STYLESHEET)}\n// The record layer of the submission record house style, for a document that can link to no\n// stylesheet.\nexport const RECORD_STYLE = \`${recordStyle}\`;\n`,
    },
    {
      path: BROWSER_HELPER,
      contents: `${LICENCE}\n${generatedNote(HELPER)}${helperSource.slice(LICENCE.length)}`,
    },
  ];
}

function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  for (const { path, contents } of generatedFiles()) {
    const target = join(ROOT, path);
    let current = null;
    try {
      current = readFileSync(target, "utf8");
    } catch {
      current = null;
    }
    if (current === contents) continue;
    if (check) {
      stale.push(path);
    } else {
      writeFileSync(target, contents);
      console.log(`Wrote ${path}`);
    }
  }
  if (stale.length) {
    console.error(`Not current: ${stale.join(", ")}. Run npm run generate:submission-record.`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
