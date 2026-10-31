// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/developer-site.test.js

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { MCP_API_PAGE, renderMcpApiPage } from "../../scripts/build-developer-site.mjs";

const root = process.cwd();
const developerDir = path.join(root, "web", "developer");
const publicDir = path.join(root, "web", "public");
const pages = ["index.html", "mcp-api.html"];

const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
const mcpPackage = JSON.parse(fs.readFileSync(path.join(root, "mcp", "package.json"), "utf-8"));
const publishMcp = fs.readFileSync(path.join(root, ".github/workflows/publish-mcp.yml"), "utf-8");
const testWorkflow = fs.readFileSync(path.join(root, ".github/workflows/test.yml"), "utf-8");

function hrefsOf(page) {
  const html = fs.readFileSync(path.join(developerDir, page), "utf-8");
  return [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
}

// Outside links that no file in this repository can vouch for, each named once.
const EXTERNAL_URLS = new Set([
  "https://github.com/diy-accounting-uk/homebrew-diya-gl",
  "https://github.com/orgs/diy-accounting-uk/packages/container/package/diya-gl",
  "https://github.com/diy-accounting-uk/spreadsheets.diyaccounting.co.uk/actions/workflows/test.yml",
]);

function resolves(link) {
  if (link.startsWith("#")) return true;
  const withoutFragment = link.split("#")[0];
  if (!/^https?:/.test(link)) return fs.existsSync(path.join(developerDir, withoutFragment));
  if (link.startsWith("https://submit.diyaccounting.co.uk/docs/")) {
    return fs.existsSync(path.join(publicDir, new URL(link).pathname));
  }
  if (link.startsWith("https://www.npmjs.com/package/")) {
    const packageName = decodeURIComponent(link.slice("https://www.npmjs.com/package/".length));
    return packageName === "@diy-accounting-uk/diya-gl" ? packageName in rootPackage.dependencies : packageName === mcpPackage.name;
  }
  if (link.startsWith("https://github.com/orgs/diy-accounting-uk/packages/container/package/")) {
    const image = link.split("/").pop();
    return image === "diya-submit-mcp" ? publishMcp.includes(`ghcr.io/diy-accounting-uk/${image}`) : EXTERNAL_URLS.has(link);
  }
  if (link === "https://ci-developer.diyaccounting.co.uk/reports/submit/index.html") {
    return testWorkflow.includes('"s3://${BUCKET}/reports/submit/"');
  }
  return EXTERNAL_URLS.has(link);
}

describe("developer site", () => {
  it.each(pages)("%s links only to files in the repository or to a known URL", (page) => {
    const unresolved = hrefsOf(page).filter((link) => !resolves(link));
    expect(unresolved).toEqual([]);
  });

  it("links the Swagger UI and both OpenAPI documents", () => {
    const links = hrefsOf("index.html");
    for (const file of ["index.html", "openapi.json", "openapi.yaml"]) {
      expect(links).toContain(`https://submit.diyaccounting.co.uk/docs/api/${file}`);
    }
  });

  it("links the npm packages, the Homebrew tap, both images and both test reports", () => {
    const links = hrefsOf("index.html");
    expect(links).toContain("https://www.npmjs.com/package/@diy-accounting-uk/diya-gl");
    expect(links).toContain("https://github.com/diy-accounting-uk/homebrew-diya-gl");
    expect(links.filter((link) => link.includes("/packages/container/package/"))).toHaveLength(2);
    expect(links).toContain("https://ci-developer.diyaccounting.co.uk/reports/submit/index.html");
    expect(links).toContain("https://github.com/diy-accounting-uk/spreadsheets.diyaccounting.co.uk/actions/workflows/test.yml");
  });

  it("carries light and dark colour tokens", () => {
    const css = fs.readFileSync(path.join(developerDir, "developer.css"), "utf-8");
    expect(css).toContain("--color-background");
    expect(css).toContain("prefers-color-scheme: dark");
  });

  it("holds an MCP API page that matches the tools the server registers", async () => {
    expect(fs.readFileSync(MCP_API_PAGE, "utf-8")).toBe(await renderMcpApiPage());
  });
});
