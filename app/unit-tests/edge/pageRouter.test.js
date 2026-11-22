// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "fs";
import path from "path";
import { describe, expect, test } from "vitest";
import { buildPageRouterCode, MAX_FUNCTION_BYTES, pageRouterCodeFromDisk, pagesOf } from "@app/functions/edge/pageRouterCode.js";

const docRoot = path.resolve("web/public");
const functionDir = path.resolve("app/functions/edge");
const notFoundHtml = fs.readFileSync(path.join(docRoot, "errors", "404.html"), "utf8");

// CloudFront Functions run the code as a script whose top-level handler CloudFront calls.
function loadHandler(code) {
  return new Function(`${code}\nreturn handler;`)();
}

// The event shape that CloudFront passes to a viewer-request function.
function viewerRequest(uri, querystring = {}) {
  return {
    version: "1.0",
    context: { distributionDomainName: "d111111abcdef8.cloudfront.net", distributionId: "EDFDVBD6EXAMPLE", eventType: "viewer-request" },
    viewer: { ip: "198.51.100.11" },
    request: { method: "GET", uri, querystring, headers: { host: { value: "submit.diyaccounting.co.uk" } }, cookies: {} },
  };
}

const handler = loadHandler(pageRouterCodeFromDisk(docRoot, functionDir));

describe("page router", () => {
  test("a path with no extension answers 301 to its .html page and keeps the query string", () => {
    const response = handler(
      viewerRequest("/about", { ref: { value: "nav" }, tag: { value: "a", multiValue: [{ value: "a" }, { value: "b" }] } }),
    );
    expect(response.statusCode).toBe(301);
    expect(response.headers.location.value).toBe("/about.html?ref=nav&tag=a&tag=b");
    expect(handler(viewerRequest("/bundles")).headers.location.value).toBe("/bundles.html");
    expect(handler(viewerRequest("/hmrc/vat/submitVat")).headers.location.value).toBe("/hmrc/vat/submitVat.html");
  });

  test("a directory with an index page is served it after a slash, and gains the slash without one", () => {
    const request = handler(viewerRequest("/cy/"));
    expect(request.statusCode).toBeUndefined();
    expect(request.uri).toBe("/cy/index.html");
    expect(handler(viewerRequest("/cy")).headers.location.value).toBe("/cy/");
    expect(handler(viewerRequest("/about/")).headers.location.value).toBe("/about.html");
  });

  test.each(["/nonexistent-page.html", "/cy/about.html", "/ABOUT.html", "/nonexistent", "/nonexistent/", "/hmrc/"])(
    "%s answers 404 with the site's Page not found page",
    (uri) => {
      const response = handler(viewerRequest(uri));
      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"].value).toBe("text/html");
      expect(response.body).toEqual({ encoding: "text", data: notFoundHtml });
      expect(response.body.data).toContain("<h1>Page not found</h1>");
      expect(response.body.data).toContain('href="/help.html"');
    },
  );

  test.each([
    "/",
    "/index.html",
    "/about.html",
    "/auth/login.html",
    "/submit.css",
    "/favicon.ico",
    "/.well-known/openai-apps-challenge",
    "/errors/404.html",
  ])("%s goes to the origin unchanged", (uri) => {
    const request = handler(viewerRequest(uri));
    expect(request.statusCode).toBeUndefined();
    expect(request.uri).toBe(uri);
  });

  test("every view of the company drill-down is served the company lookup page, English and Welsh", () => {
    for (const uri of [
      "/companies-house/company/00000001",
      "/companies-house/company/00000001/officers",
      "/companies-house/company/00000001/psc",
      "/companies-house/company/00000001/filing-history",
      "/companies-house/company/00000001/accounts",
      "/companies-house/company/00000001/accounts/2098-04-30",
      "/companies-house/company/00000001/accounts/2098-04-30/SIMTX00000001AA2098",
      "/companies-house/company/00000001/confirmation-statement/2098-04-16",
    ]) {
      expect(handler(viewerRequest(uri)).uri, uri).toBe("/companies-house/companySearch.html");
      expect(handler(viewerRequest(`/cy${uri}`)).uri, `/cy${uri}`).toBe("/cy/companies-house/companySearch.html");
    }
  });

  test("the drill-down rule leaves the lookup page and its neighbours alone", () => {
    expect(handler(viewerRequest("/companies-house/companySearch.html")).uri).toBe("/companies-house/companySearch.html");
    expect(handler(viewerRequest("/companies-house/company")).statusCode).toBe(404);
    expect(handler(viewerRequest("/companies-house/companies/00000001")).statusCode).toBe(404);
  });

  test("every published page is listed, so no real page answers 404", () => {
    const pages = [];
    const walk = (relativeDir) => {
      for (const entry of fs.readdirSync(path.join(docRoot, relativeDir), { withFileTypes: true })) {
        const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
        if (entry.isDirectory() && !["docs", "embed", "tests"].includes(relativePath)) walk(relativePath);
        else if (entry.isFile() && entry.name.endsWith(".html")) pages.push(`/${relativePath}`);
      }
    };
    walk("");
    expect(pages.length).toBeGreaterThan(50);
    for (const uri of pages) {
      expect(handler(viewerRequest(uri)).uri, uri).toBe(uri);
    }
  });

  test("the code fits CloudFront's 10 KB limit and carries no comment lines", () => {
    const code = pageRouterCodeFromDisk(docRoot, functionDir);
    expect(Buffer.byteLength(code, "utf8")).toBeLessThanOrEqual(MAX_FUNCTION_BYTES);
    expect(code).not.toMatch(/^\s*\/\//m);
  });
});

describe("page router code", () => {
  test("pages are grouped by directory without .html, and other behaviours' directories are left out", () => {
    expect(
      pagesOf([
        "index.html",
        "about.html",
        "submit.css",
        "cy/index.html",
        "docs/api/index.html",
        "tests/index.html",
        "embed/a.html",
        ".well-known/x",
      ]),
    ).toEqual({ "": "about index", "cy/": "index" });
  });

  test("a file with no extension outside .well-known stops the build", () => {
    expect(() => pagesOf(["robots"])).toThrow(/no extension/);
  });

  test("the data lines are filled the same way as PageRouterFunctionCode.java", () => {
    const template = '// a comment\nconst PAGES = {};\nconst NOT_FOUND_HTML = "";\n\nfunction handler() {}\n';
    expect(buildPageRouterCode({ template, pages: { "": "about" }, notFoundHtml: '<h1>"Page"</h1>' })).toBe(
      'const PAGES = {"":"about"};\nconst NOT_FOUND_HTML = "<h1>\\"Page\\"</h1>";\nfunction handler() {}\n',
    );
  });

  test("code over the size limit stops the build", () => {
    const template = 'const PAGES = {};\nconst NOT_FOUND_HTML = "";\n';
    expect(() => buildPageRouterCode({ template, pages: {}, notFoundHtml: "x".repeat(MAX_FUNCTION_BYTES) })).toThrow(/10240 bytes/);
  });
});
