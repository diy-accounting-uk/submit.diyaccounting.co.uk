// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-131 Serve the 404 page and extensionless paths at the edge
// - **Use when:** a web address has no page, has no .html, or ends in a slash, and CloudFront must answer it without touching the API's JSON errors.
// - **Does:** pageRouter.js is the CloudFront Function on the viewer request of the default behaviour. It answers 301 from /about to /about.html, serves /cy/ from /cy/index.html, and answers an address with no page with status 404 and web/public/errors/404.html. pageRouterCode.js writes the function's page list and 404 body from the published files for scripts/deploy-app.js; EdgeStack writes the same code through PageRouterFunctionCode.java.
// - **Run:** `npm run deploy:app-ci` (updates and publishes the function); `./mvnw clean verify` (synthesizes it)
// - **Entry:** `app/functions/edge/pageRouter.js:handler`; `app/functions/edge/pageRouterCode.js:pageRouterCodeFromDisk`
// - **Files:** app/functions/edge/pageRouter.js, app/functions/edge/pageRouterCode.js, app/unit-tests/edge/pageRouter.test.js, infra/main/java/co/uk/diyaccounting/submit/utils/PageRouterFunctionCode.java, web/public/errors/404.html
// - **Keywords:** cloudfront function, 404 page, page not found, extensionless path, redirect, viewer request
// - **Related:** OPS-115
// @end-capability

import fs from "fs";
import path from "path";

// Paths below these directories reach other CloudFront behaviours, which have no page router.
export const OTHER_BEHAVIOUR_DIRECTORIES = ["docs", "embed", "tests"];
// The router passes every /.well-known/ path to the origin unchanged.
export const PASS_THROUGH_DIRECTORY = ".well-known";
// CloudFront's limit on the size of a function.
export const MAX_FUNCTION_BYTES = 10240;
// The description that EdgeStack gives the function.
export const PAGE_ROUTER_COMMENT = "Redirects extensionless page paths and answers a miss with the 404 page";

const PAGES_LINE = "const PAGES = {};";
const NOT_FOUND_HTML_LINE = 'const NOT_FOUND_HTML = "";';

function filesUnder(dir, relativeDir = "") {
  const files = [];
  for (const entry of fs.readdirSync(path.join(dir, relativeDir), { withFileTypes: true })) {
    const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...filesUnder(dir, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

export function pagesOf(relativePaths) {
  const namesByDir = {};
  for (const relativePath of relativePaths) {
    const firstSegment = relativePath.split("/")[0];
    if (OTHER_BEHAVIOUR_DIRECTORIES.includes(firstSegment) || firstSegment === PASS_THROUGH_DIRECTORY) {
      continue;
    }
    const slash = relativePath.lastIndexOf("/");
    const dir = relativePath.slice(0, slash + 1);
    const fileName = relativePath.slice(slash + 1);
    if (fileName.includes(" ")) {
      throw new Error(`${relativePath}: the page router cannot list a file name with a space`);
    }
    if (fileName.endsWith(".html")) {
      if (!namesByDir[dir]) namesByDir[dir] = [];
      namesByDir[dir].push(fileName.slice(0, -".html".length));
    } else if (!fileName.includes(".")) {
      throw new Error(`${relativePath}: the page router would answer this file with no extension with 404`);
    }
  }
  const pages = {};
  for (const dir of Object.keys(namesByDir).sort()) {
    pages[dir] = namesByDir[dir].sort().join(" ");
  }
  return pages;
}

export function buildPageRouterCode({ template, pages, notFoundHtml }) {
  if (!template.split("\n").includes(PAGES_LINE) || !template.split("\n").includes(NOT_FOUND_HTML_LINE)) {
    throw new Error(`The page router template must hold the lines ${PAGES_LINE} and ${NOT_FOUND_HTML_LINE}`);
  }
  const code =
    template
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("//"))
      .map((line) => {
        if (line === PAGES_LINE) return `const PAGES = ${JSON.stringify(pages)};`;
        if (line === NOT_FOUND_HTML_LINE) return `const NOT_FOUND_HTML = ${JSON.stringify(notFoundHtml)};`;
        return line;
      })
      .join("\n") + "\n";
  const bytes = Buffer.byteLength(code, "utf8");
  if (bytes > MAX_FUNCTION_BYTES) {
    throw new Error(`The page router is ${bytes} bytes; CloudFront takes a function of at most ${MAX_FUNCTION_BYTES} bytes`);
  }
  return code;
}

export function pageRouterCodeFromDisk(docRoot, functionDir) {
  return buildPageRouterCode({
    template: fs.readFileSync(path.join(functionDir, "pageRouter.js"), "utf8"),
    pages: pagesOf(filesUnder(docRoot)),
    notFoundHtml: fs.readFileSync(path.join(docRoot, "errors", "404.html"), "utf8"),
  });
}
