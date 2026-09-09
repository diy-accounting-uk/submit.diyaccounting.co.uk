// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// licenceHeaders.test.js -- every comment-capable tracked file carries the
// SPDX identifier for PolyForm Internal Use and the company's copyright
// line. Twinned from the spreadsheets repository's
// app/test/licence-headers.test.js, but Submit has one licensing layer --
// the DIYA-GL engine it calls is a separate npm dependency
// (@diy-accounting-uk/diya-gl), not repository source -- so there is no
// closure to compute and no second identifier to expect.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

const POLYFORM = "LicenseRef-PolyForm-Internal-Use-1.0.0";
const COPYRIGHT = "Copyright (C) 2006-2026 DIY Accounting Limited";

// Directories a header sweep never enters: a generated export, generated
// test-report output, and Crown-copyright or third-party material that
// NOTICE and LICENSING.md cover instead of claiming under our own licence.
const EXCLUDED_PATH_PREFIXES = [
  "web/public-simulator/",
  "web/public/tests/",
  "web/public/docs/api/",
  "fixtures/companies-house-xmlgw/",
  "web/public/docs/hmrc-form-field-standards/",
  "node_modules/",
  "target/",
];

// Individual files: the licence text itself, a vendored third-party file
// that keeps its own notice, lock files, and the Apache Maven Wrapper.
const EXCLUDED_FILES = new Set([
  "LICENSE",
  "NOTICE",
  "package-lock.json",
  "cdk-typescript/package-lock.json",
  ".mvn/wrapper/maven-wrapper.properties",
  "mvnw",
  "mvnw.cmd",
  "web/public/lib/qrcode.min.js",
  "_developers/backlog/battery-pack/LICENSE",
]);

function isExcluded(path) {
  if (EXCLUDED_FILES.has(path)) return true;
  return EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function lineStyle(token) {
  return { prefix: `${token} `, suffix: "" };
}
function wrapStyle(open, close) {
  return { prefix: `${open} `, suffix: ` ${close}` };
}

// Which comment style a path takes, and what a header must sit after (a
// shebang, an xml declaration, a doctype, markdown front matter, or
// plantuml's @startuml marker) -- or null when the format cannot carry a
// header at all, in which case LICENSING.md's directory map covers it.
function styleFor(path) {
  const base = basename(path);
  if (base === "Dockerfile") return { ...lineStyle("#"), skipShebang: true };
  switch (extname(path)) {
    case ".java":
      return { block: true };
    case ".js":
    case ".mjs":
    case ".cjs":
    case ".ts":
      return { ...lineStyle("//"), skipShebang: true };
    case ".sh":
    case ".toml":
    case ".yml":
    case ".yaml":
    case ".properties":
      return { ...lineStyle("#"), skipShebang: true };
    case ".sql":
      return lineStyle("--");
    case ".plantuml":
      return { ...lineStyle("'"), skipStartuml: true };
    case ".css":
      return wrapStyle("/*", "*/");
    case ".html":
      return { ...wrapStyle("<!--", "-->"), skipDoctype: true };
    case ".svg":
    case ".xml":
    case ".plist":
      return { ...wrapStyle("<!--", "-->"), skipXmlDecl: true, skipDoctype: true };
    case ".md":
      return { ...wrapStyle("<!--", "-->"), skipFrontMatter: true };
    default:
      return null;
  }
}

function trackedFiles(root) {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
}

// The index of the first line the header may occupy, preserving whatever a
// format needs to stay literally first.
function skipIndex(lines, style) {
  let i = 0;
  if (style.skipShebang && lines[0] && lines[0].startsWith("#!")) i = 1;
  if (style.skipXmlDecl) {
    for (let j = i; j < Math.min(i + 2, lines.length); j++) {
      if (/^<\?xml\b/i.test(lines[j] ?? "")) {
        i = j + 1;
        break;
      }
    }
  }
  if (style.skipDoctype) {
    for (let j = i; j < Math.min(i + 2, lines.length); j++) {
      if (/^<!doctype\b/i.test(lines[j] ?? "")) {
        i = j + 1;
        break;
      }
    }
  }
  if (style.skipFrontMatter && lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close !== -1) {
      i = close + 1;
      while (lines[i] === "") i += 1;
    }
  }
  if (style.skipStartuml && lines[0] === "@startuml") i = 1;
  return i;
}

function parseLine(line, style) {
  if (typeof line !== "string") return null;
  if (!line.startsWith(style.prefix) || !line.endsWith(style.suffix)) return null;
  return style.suffix ? line.slice(style.prefix.length, -style.suffix.length) : line.slice(style.prefix.length);
}

describe("licence headers", () => {
  it("every comment-capable tracked file carries the PolyForm identifier and the copyright line", () => {
    const offenders = [];

    for (const path of trackedFiles(ROOT)) {
      if (isExcluded(path)) continue;
      const style = styleFor(path);
      if (!style) continue;

      const raw = readFileSync(resolve(ROOT, path), "utf8");
      const lines = raw.split(/\r?\n/);
      const i = skipIndex(lines, style);

      if (style.block) {
        const [open, spdxLine, copyrightLine, close] = lines.slice(i, i + 4);
        if (open !== "/*" || (close !== " */" && close !== "*/")) {
          offenders.push(`${path}: missing SPDX-License-Identifier header`);
          continue;
        }
        const identMatch = spdxLine?.match(/^ \* SPDX-License-Identifier:\s*(\S+)$/);
        if (!identMatch) {
          offenders.push(`${path}: missing SPDX-License-Identifier header`);
        } else if (identMatch[1] !== POLYFORM) {
          offenders.push(`${path}: header says ${identMatch[1]}, expected ${POLYFORM}`);
        }
        const expectedCopyrightLine = ` * ${COPYRIGHT}`;
        if (copyrightLine !== expectedCopyrightLine) {
          offenders.push(
            `${path}: copyright line is ${JSON.stringify(copyrightLine ?? null)}, expected ${JSON.stringify(expectedCopyrightLine)}`,
          );
        }
        continue;
      }

      const [spdxLine, copyrightLine] = lines.slice(i, i + 2);
      const spdxInner = parseLine(spdxLine, style);
      const identMatch = spdxInner?.match(/^SPDX-License-Identifier:\s*(\S+)$/);
      const expectedCopyrightLine = `${style.prefix}${COPYRIGHT}${style.suffix}`;

      if (!identMatch) {
        offenders.push(`${path}: missing SPDX-License-Identifier header`);
      } else if (identMatch[1] !== POLYFORM) {
        offenders.push(`${path}: header says ${identMatch[1]}, expected ${POLYFORM}`);
      }
      if (copyrightLine !== expectedCopyrightLine) {
        offenders.push(
          `${path}: copyright line is ${JSON.stringify(copyrightLine ?? null)}, expected ${JSON.stringify(expectedCopyrightLine)}`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });
});
