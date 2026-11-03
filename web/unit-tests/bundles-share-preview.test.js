// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/bundles-share-preview.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve(import.meta.dirname, "../public");
const html = fs.readFileSync(path.join(publicDir, "bundles.html"), "utf8");

function metaContent(attribute, name) {
  const pattern = new RegExp(`<meta\\s+${attribute}="${name}"\\s+content="([^"]*)"`);
  const match = html.match(pattern);
  return match ? match[1] : undefined;
}

describe("bundles.html share preview", () => {
  test("shows the price headline and the type and url", () => {
    expect(metaContent("property", "og:title")).toBe("VAT returns to HMRC for 99p a month");
    expect(metaContent("property", "og:type")).toBe("website");
    expect(metaContent("property", "og:url")).toBe("https://submit.diyaccounting.co.uk/bundles.html");
  });

  test("states the free week and the price after it, and matches the meta description", () => {
    const description = metaContent("property", "og:description");
    expect(description).toContain("7 days");
    expect(description).toContain("£0.99 a month or £9.99 a year");
    expect(metaContent("name", "description")).toBe(description);
  });

  test("points at an image file that exists", () => {
    const image = metaContent("property", "og:image");
    expect(image).toBe("https://submit.diyaccounting.co.uk/images/social/og-pass.png");
    expect(fs.existsSync(path.join(publicDir, "images/social/og-pass.png"))).toBe(true);
    expect(metaContent("name", "twitter:card")).toBe("summary_large_image");
  });
});
