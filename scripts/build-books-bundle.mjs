// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Builds web/public/lib/books-bundle.js: the diya-gl book reader and the three
// filing derivations as one browser ES module, loaded with import() on first use
// of the "Fill from your books" card.
//
// The bundle imports the published @diy-accounting-uk/diya-gl package exactly as
// it stands. Two substitutions keep it running under the production CSP in a
// browser: Node's own fs, path, url, os, crypto and child_process resolve to
// stubs, and ajv resolves to a stub carrying the two validators ajv's standalone
// generator produced here, under Node, so that ajv.compile() and its
// `new Function` never ship.
//
// The derivations read the tax-year TOML and the SA103 mapping through the
// package's default Node loader and accept no loader of their own. The fs stub
// therefore serves those files from a table built into the bundle, and the path
// and url stubs are enough pure-JS path handling for the default loader to find
// them. Every other file read throws.
//
// Usage: node scripts/build-books-bundle.mjs   (npm run bundle:books)

import { build } from "esbuild";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateStandaloneValidatorSource } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIR = resolve(ROOT, "node_modules", "@diy-accounting-uk", "diya-gl");
const SCHEMA_DIR = resolve(PACKAGE_DIR, "dist", "web", "spreadsheets.diyaccounting.co.uk", "public", "schema");
export const BUNDLE_FILE = resolve(ROOT, "web", "public", "lib", "books-bundle.js");

const BOOK_SCHEMA_ID = "https://spreadsheets.diyaccounting.co.uk/schema/diya-gl-book-v2.schema.json";
const LINES_SCHEMA_ID = "https://spreadsheets.diyaccounting.co.uk/schema/diya-gl-lines-v2.schema.json";

const LICENCE_COMMENT = "/*!\n * SPDX-License-Identifier: Apache-2.0\n * Copyright (C) 2006-2026 DIY Accounting Limited\n */";

const THROWING_STUBS = {
  os: ["tmpdir", "platform", "homedir"],
  crypto: ["randomBytes", "createHash"],
  child_process: ["execSync", "spawnSync"],
};

const THROWING_FS_NAMES = ["writeFileSync", "readdirSync", "mkdirSync", "rmSync", "cpSync", "statSync", "appendFileSync", "renameSync"];
const EMBEDDED_RESOURCE_DIRS = [
  { dir: resolve(PACKAGE_DIR, "dist", "app", "data"), prefix: "data/", pattern: /^(ltd|se)-\d{4}(-\d{4})?\.toml$/ },
];
const EMBEDDED_RESOURCE_FILES = [
  { file: resolve(PACKAGE_DIR, "dist", "app", "data", "hmrc", "sa103-mtd-mapping.json"), key: "data/hmrc/sa103-mtd-mapping.json" },
];

function embeddedResources() {
  const table = {};
  for (const { dir, prefix, pattern } of EMBEDDED_RESOURCE_DIRS) {
    for (const name of readdirSync(dir)
      .filter((entry) => pattern.test(entry))
      .sort()) {
      table[prefix + name] = readFileSync(resolve(dir, name), "utf8");
    }
  }
  for (const { file, key } of EMBEDDED_RESOURCE_FILES) table[key] = readFileSync(file, "utf8");
  return table;
}

function throwing(moduleName, name) {
  return `export function ${name}() { throw new Error('${name}(): ${moduleName} is not available in the books bundle. This code path only runs under Node; the page supplies its files through a resource loader instead.'); }`;
}

function fsStubSource(resources) {
  return `const RESOURCES = ${JSON.stringify(resources)};
function embedded(path) {
  const normal = String(path).replace(/\\\\/g, "/");
  return Object.keys(RESOURCES).find((key) => normal === key || normal.endsWith("/" + key));
}
export function existsSync(path) { return embedded(path) !== undefined; }
export function readFileSync(path, encoding) {
  const key = embedded(path);
  if (key === undefined) throw new Error("readFileSync(): " + path + " is not one of the files the books bundle carries (" + Object.keys(RESOURCES).join(", ") + ").");
  return encoding ? RESOURCES[key] : new TextEncoder().encode(RESOURCES[key]);
}
${THROWING_FS_NAMES.map((name) => throwing("fs", name)).join("\n")}
export default { existsSync, readFileSync, ${THROWING_FS_NAMES.join(", ")} };`;
}

const PATH_STUB_SOURCE = `function segments(parts) {
  const out = [];
  for (const part of parts) for (const piece of String(part).split("/")) {
    if (piece === "" || piece === ".") continue;
    if (piece === "..") out.pop();
    else out.push(piece);
  }
  return out;
}
export function resolve(...parts) {
  let start = 0;
  parts.forEach((part, index) => { if (String(part).startsWith("/")) start = index; });
  return "/" + segments(parts.slice(start)).join("/");
}
export function join(...parts) { return "/" + segments(parts).join("/"); }
export function dirname(path) { const parts = segments([path]); parts.pop(); return "/" + parts.join("/"); }
export function basename(path) { const parts = segments([path]); return parts[parts.length - 1] ?? ""; }
export function extname(path) { const name = basename(path); const dot = name.lastIndexOf("."); return dot > 0 ? name.slice(dot) : ""; }
export function relative() { throw new Error("relative(): path.relative is not available in the books bundle."); }
export default { resolve, join, dirname, basename, extname, relative };`;

const URL_STUB_SOURCE = `export function fileURLToPath(url) { return decodeURIComponent(new URL(String(url)).pathname); }
${throwing("url", "pathToFileURL")}
export default { fileURLToPath, pathToFileURL };`;

function nodeAbsentPlugin(resources) {
  const names = ["fs", "path", "url", ...Object.keys(THROWING_STUBS)];
  const pattern = new RegExp(`^(node:)?(${names.join("|")})$`);
  const sources = {
    fs: fsStubSource(resources),
    path: PATH_STUB_SOURCE,
    url: URL_STUB_SOURCE,
    ...Object.fromEntries(
      Object.entries(THROWING_STUBS).map(([moduleName, fnNames]) => [
        moduleName,
        [...fnNames.map((name) => throwing(moduleName, name)), `export default { ${fnNames.join(", ")} };`].join("\n"),
      ]),
    ),
  };
  return {
    name: "node-absent",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: pattern }, (args) => ({
        path: args.path.replace(/^node:/, ""),
        namespace: "node-absent",
      }));
      pluginBuild.onLoad({ filter: /.*/, namespace: "node-absent" }, (args) => ({
        contents: sources[args.path],
        loader: "js",
      }));
    },
  };
}

function ajvAbsentPlugin(generatedSource) {
  const stubbed = new Set(["ajv/dist/2020.js", "ajv-formats", "ajv/dist/standalone/index.js"]);
  const stubSources = {
    "ajv/dist/2020.js": `${generatedSource}
class Ajv2020Stub {
  compile(schema) {
    const id = schema && schema.$id;
    if (id === "${BOOK_SCHEMA_ID}") return validateBook;
    if (id === "${LINES_SCHEMA_ID}") return validateLines;
    throw new Error("Ajv2020.compile(): the books bundle carries only the two published diya-gl schemas precompiled, got $id " + id);
  }
}
export default Ajv2020Stub;`,
    "ajv-formats": "export default function addFormats() {}",
    "ajv/dist/standalone/index.js": `export default function standaloneCode() {
  throw new Error("standaloneCode(): runs once at build time to generate the precompiled validators the bundle carries.");
}`,
  };
  return {
    name: "ajv-absent",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^ajv/ }, (args) => {
        if (!stubbed.has(args.path)) return null;
        return { path: args.path, namespace: "ajv-absent" };
      });
      pluginBuild.onLoad({ filter: /.*/, namespace: "ajv-absent" }, (args) => ({
        contents: stubSources[args.path],
        loader: "js",
        resolveDir: ROOT,
      }));
    },
  };
}

// The bundle's public surface: the engine read, the three derivations, and the
// schemas registered so the read validates with no further setup.
const ENTRY_SOURCE = `
import bookSchema from "@diy-accounting-uk/diya-gl/dist/web/spreadsheets.diyaccounting.co.uk/public/schema/diya-gl-book-v2.schema.json";
import linesSchema from "@diy-accounting-uk/diya-gl/dist/web/spreadsheets.diyaccounting.co.uk/public/schema/diya-gl-lines-v2.schema.json";
import { useSchemas } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";
useSchemas(bookSchema, linesSchema);
import { readBookSource as readBookSourceWith } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { PRODUCTS } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";
export const readBookSource = (bytes, name) => readBookSourceWith(bytes, name, { products: PRODUCTS });
export { deriveVatReturn, deriveItsaQuarterlyUpdate, deriveItsaAnnualSubmission } from "@diy-accounting-uk/diya-gl";
`;

async function main() {
  const bookSchema = JSON.parse(readFileSync(resolve(SCHEMA_DIR, "diya-gl-book-v2.schema.json"), "utf8"));
  const linesSchema = JSON.parse(readFileSync(resolve(SCHEMA_DIR, "diya-gl-lines-v2.schema.json"), "utf8"));
  if (bookSchema.$id !== BOOK_SCHEMA_ID || linesSchema.$id !== LINES_SCHEMA_ID) {
    throw new Error("the published schemas' $id fields moved; update BOOK_SCHEMA_ID and LINES_SCHEMA_ID to match");
  }
  const generatedSource = generateStandaloneValidatorSource(bookSchema, linesSchema).replaceAll(
    JSON.stringify({ _items: ['require("ajv-formats/dist/formats").', { str: "fullFormats" }, ""] }),
    'require("ajv-formats/dist/formats").fullFormats',
  );

  const result = await build({
    stdin: { contents: ENTRY_SOURCE, resolveDir: ROOT, loader: "js", sourcefile: "books-bundle-entry.js" },
    outfile: BUNDLE_FILE,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    sourcemap: false,
    legalComments: "eof",
    banner: { js: LICENCE_COMMENT },
    plugins: [nodeAbsentPlugin(embeddedResources()), ajvAbsentPlugin(generatedSource)],
    metafile: true,
    define: { "process.env.NODE_ENV": '"production"' },
  });

  const bytes = statSync(BUNDLE_FILE).size;
  const inputCount = Object.keys(result.metafile.inputs).length;
  console.log(`Books bundle: ${BUNDLE_FILE.replace(ROOT + "/", "")}, ${(bytes / 1024).toFixed(1)} KiB from ${inputCount} modules`);
}

await main();
