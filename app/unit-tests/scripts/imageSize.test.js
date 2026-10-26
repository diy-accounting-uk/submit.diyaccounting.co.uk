// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import path from "path";
import { imageSize } from "../../../scripts/lib/video/imageSize.js";

describe("imageSize", () => {
  test("reads the pixel size of a published walkthrough image", () => {
    const size = imageSize(path.resolve("web/public/videos/view-obligations/obligations-form-0-thumb.webp"));
    expect(size.width).toBe(480);
    expect(size.height).toBeGreaterThan(0);
  });

  test("rejects a file that is not an image", () => {
    expect(() => imageSize(path.resolve("package.json"))).toThrow(/not a WebP or PNG/);
  });
});
