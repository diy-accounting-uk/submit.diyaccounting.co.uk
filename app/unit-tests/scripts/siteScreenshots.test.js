// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/siteScreenshots.test.js

import { describe, it, expect } from "vitest";
import { parseArgs, selectPages } from "../../../scripts/site-screenshots.mjs";

const PAGES = ["about.html", "cy/about.html", "cy/index.html", "hmrc/vat/submitVat.html", "cy/hmrc/vat/submitVat.html", "index.html"];

describe("site screenshots page selection", () => {
  it("keeps every page when neither option is given", () => {
    expect(selectPages(PAGES, parseArgs([]))).toEqual(PAGES);
  });

  it("drops the Welsh pages with --exclude cy/", () => {
    expect(selectPages(PAGES, parseArgs(["--exclude", "cy/"]))).toEqual(["about.html", "hmrc/vat/submitVat.html", "index.html"]);
  });

  it("applies --exclude after --only, so a part shared with a Welsh path keeps only the English page", () => {
    expect(selectPages(PAGES, parseArgs(["--only", "about.html,submitVat", "--exclude", "cy/"]))).toEqual([
      "about.html",
      "hmrc/vat/submitVat.html",
    ]);
  });

  it("takes a list of parts to exclude", () => {
    expect(selectPages(PAGES, parseArgs(["--exclude", "cy/,hmrc/"]))).toEqual(["about.html", "index.html"]);
  });
});
