// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const spreadsheetsPath = path.join(process.cwd(), "web/public/spreadsheets.html");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

describe("spreadsheets.html page", () => {
  const html = readFile(spreadsheetsPath);

  it("contains DIYA-GL product block", () => {
    expect(html).toContain("DIYA-GL");
    expect(html).toContain("https://diya-gl.co.uk/");
    expect(html).toContain("Free double-entry bookkeeping");
  });
});
