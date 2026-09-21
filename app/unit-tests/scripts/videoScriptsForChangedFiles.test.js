// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/videoScriptsForChangedFiles.test.js

import { describe, test, expect } from "vitest";
import { scriptsTouchedBy, isSharedWebAsset } from "../../../scripts/video-scripts-for-changed-files.mjs";

const scripts = [
  { name: "tour", pages: ["web/public/index.html", "web/public/about.html"] },
  { name: "view-obligations", pages: ["web/public/index.html", "web/public/hmrc/vat/vatObligations.html"] },
  { name: "view-liabilities", pages: ["web/public/index.html", "web/public/hmrc/vat/vatLiabilities.html"] },
];

const scriptsWithCiOnly = [
  { name: "tour", pages: ["web/public/index.html"] },
  { name: "itsa-quarterly-update", pages: ["web/public/index.html"], environments: ["ci"] },
];

describe("scriptsTouchedBy", () => {
  test("returns only the scripts whose pages intersect the changed files", () => {
    expect(scriptsTouchedBy(["web/public/hmrc/vat/vatObligations.html"], scripts)).toEqual(["view-obligations"]);
  });

  test("returns every script a changed page belongs to", () => {
    expect(scriptsTouchedBy(["web/public/index.html"], scripts)).toEqual(["tour", "view-obligations", "view-liabilities"]);
  });

  test("returns nothing when no changed file is any script's page", () => {
    expect(scriptsTouchedBy(["web/public/help.html"], scripts)).toEqual([]);
  });

  test("returns nothing for an empty list of changed files", () => {
    expect(scriptsTouchedBy([], scripts)).toEqual([]);
  });

  test("returns every script when a shared web asset changes, even with other unrelated changes", () => {
    expect(scriptsTouchedBy(["web/public/submit.js", "README.md"], scripts)).toEqual(["tour", "view-obligations", "view-liabilities"]);
  });

  test("returns every script when a file under web/public/lib changes", () => {
    expect(scriptsTouchedBy(["web/public/lib/toml-parser.js"], scripts)).toEqual(["tour", "view-obligations", "view-liabilities"]);
  });

  test("returns every script when a top-level web/public stylesheet changes", () => {
    expect(scriptsTouchedBy(["web/public/submit.css"], scripts)).toEqual(["tour", "view-obligations", "view-liabilities"]);
  });

  test("does not treat a stylesheet nested under a page directory as shared", () => {
    expect(scriptsTouchedBy(["web/public/hmrc/vat/vatObligations.css"], scripts)).toEqual([]);
  });

  test("leaves out a ci-only script when filtering for prod", () => {
    expect(scriptsTouchedBy(["web/public/index.html"], scriptsWithCiOnly, "prod")).toEqual(["tour"]);
  });

  test("keeps a ci-only script when filtering for ci", () => {
    expect(scriptsTouchedBy(["web/public/index.html"], scriptsWithCiOnly, "ci")).toEqual(["tour", "itsa-quarterly-update"]);
  });

  test("keeps every touched script when no environment filter is given", () => {
    expect(scriptsTouchedBy(["web/public/index.html"], scriptsWithCiOnly)).toEqual(["tour", "itsa-quarterly-update"]);
  });
});

describe("isSharedWebAsset", () => {
  test("matches the shared submit.js bundle", () => {
    expect(isSharedWebAsset("web/public/submit.js")).toBe(true);
  });

  test("matches anything under web/public/lib", () => {
    expect(isSharedWebAsset("web/public/lib/toml-parser.js")).toBe(true);
  });

  test("matches a top-level web/public stylesheet", () => {
    expect(isSharedWebAsset("web/public/submit.css")).toBe(true);
  });

  test("does not match a page's own html file", () => {
    expect(isSharedWebAsset("web/public/hmrc/vat/vatObligations.html")).toBe(false);
  });

  test("does not match a file outside web/public", () => {
    expect(isSharedWebAsset("app/functions/hmrcVatReturnPost.js")).toBe(false);
  });
});
