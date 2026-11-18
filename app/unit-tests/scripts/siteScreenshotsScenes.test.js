// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SCENES } from "../../../scripts/site-screenshots.mjs";

describe("site-screenshots scenes", () => {
  test("every scene opens a page that exists under web/public", () => {
    for (const [name, scene] of Object.entries(SCENES)) {
      const file = path.join("web/public", scene.page.split("?")[0]);
      expect(fs.existsSync(file), `${name}: ${file}`).toBe(true);
    }
  });

  test("the Welsh receipts scene shows the Welsh copy with receipts to list", () => {
    const scene = SCENES["cy-receipts"];
    expect(scene.page).toBe("cy/hmrc/receipt/receipts.html");
    expect(fs.readFileSync(path.join("web/public", scene.page), "utf8")).toContain('<html lang="cy">');
    expect(scene.apiRoute.body.receipts.length).toBeGreaterThan(1);
    expect(scene.waitFor).toBe("#receiptsTable tbody tr");
  });
});
