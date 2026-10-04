// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Builds web/public/lib/books-bundle.js: the diya-gl book reader and the three
// filing derivations as one browser ES module, loaded with import() on first use
// of the "Fill from your books" card.
//
// The bundle imports the published @diy-accounting-uk/diya-gl package exactly as
// it stands. Two substitutions keep it running under the production CSP in a
// browser: Node's own fs, path, url, os, crypto and child_process resolve to
// stubs that throw when called, and ajv resolves to a stub carrying the two
// validators ajv's standalone generator produced here, under Node, so that
// ajv.compile() and its `new Function` never ship.
//
// Usage: node scripts/build-books-bundle.mjs   (npm run bundle:books)

import { build } from "esbuild";
import { readFileSync, statSync } from "node:fs";
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

const NODE_STUBS = {
  fs: [
    "readFileSync",
    "writeFileSync",
    "existsSync",
    "readdirSync",
    "mkdirSync",
    "rmSync",
    "cpSync",
    "statSync",
    "appendFileSync",
    "renameSync",
  ],
  path: ["resolve", "dirname", "basename", "join", "extname", "relative"],
  url: ["fileURLToPath", "pathToFileURL"],
  os: ["tmpdir", "platform", "homedir"],
  crypto: ["randomBytes", "createHash"],
  child_process: ["execSync", "spawnSync"],
};

function stubSource(moduleName) {
  const names = NODE_STUBS[moduleName];
  const why = `${moduleName} is not available in the books bundle`;
  const lines = names.map(
    (name) =>
      `export function ${name}() { throw new Error('${name}(): ${why}. This code path only runs under Node; the page supplies its files through a resource loader instead.'); }`,
  );
  lines.push(`export default { ${names.join(", ")} };`);
  return lines.join("\n");
}

const nodeAbsent = {
  name: "node-absent",
  setup(pluginBuild) {
    const pattern = new RegExp(`^(node:)?(${Object.keys(NODE_STUBS).join("|")})$`);
    pluginBuild.onResolve({ filter: pattern }, (args) => ({
      path: args.path.replace(/^node:/, ""),
      namespace: "node-absent",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "node-absent" }, (args) => ({
      contents: stubSource(args.path),
      loader: "js",
    }));
  },
};

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
export { readBookSource } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
export { deriveVatReturn, deriveItsaQuarterlyUpdate, deriveItsaAnnualSubmission } from "@diy-accounting-uk/diya-gl";
`;

async function main() {
  const bookSchema = JSON.parse(readFileSync(resolve(SCHEMA_DIR, "diya-gl-book-v2.schema.json"), "utf8"));
  const linesSchema = JSON.parse(readFileSync(resolve(SCHEMA_DIR, "diya-gl-lines-v2.schema.json"), "utf8"));
  if (bookSchema.$id !== BOOK_SCHEMA_ID || linesSchema.$id !== LINES_SCHEMA_ID) {
    throw new Error("the published schemas' $id fields moved; update BOOK_SCHEMA_ID and LINES_SCHEMA_ID to match");
  }
  const generatedSource = generateStandaloneValidatorSource(bookSchema, linesSchema);

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
    plugins: [nodeAbsent, ajvAbsentPlugin(generatedSource)],
    metafile: true,
    define: { "process.env.NODE_ENV": '"production"' },
  });

  const bytes = statSync(BUNDLE_FILE).size;
  const inputCount = Object.keys(result.metafile.inputs).length;
  console.log(`Books bundle: ${BUNDLE_FILE.replace(ROOT + "/", "")}, ${(bytes / 1024).toFixed(1)} KiB from ${inputCount} modules`);
}

await main();
