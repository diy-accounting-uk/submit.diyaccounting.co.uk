// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/pass-share-preview.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve(import.meta.dirname, "../public");
const html = fs.readFileSync(path.join(publicDir, "pass.html"), "utf8");

function metaContent(attribute, name) {
  const pattern = new RegExp(`<meta\\s+${attribute}="${name}"\\s+content="([^"]*)"`);
  const match = html.match(pattern);
  return match ? match[1] : undefined;
}

describe("pass.html share preview", () => {
  test("has a neutral title, type and url", () => {
    expect(metaContent("property", "og:title")).toBe("You have a pass for DIY Accounting Submit");
    expect(metaContent("property", "og:type")).toBe("website");
    expect(metaContent("property", "og:url")).toBe("https://submit.diyaccounting.co.uk/pass.html");
  });

  test("has a neutral description, the same in og, twitter and the meta description", () => {
    const description = metaContent("property", "og:description");
    expect(description).toBe("Open this link to see what your pass gives you, and add it to your account.");
    expect(metaContent("name", "description")).toBe(description);
    expect(metaContent("name", "twitter:description")).toBe(description);
    expect(metaContent("name", "twitter:title")).toBe(metaContent("property", "og:title"));
  });

  test("states no price, no free offer and no bundle name", () => {
    const text = ["og:title", "og:description"]
      .map((name) => metaContent("property", name))
      .concat([metaContent("name", "description"), metaContent("name", "twitter:title"), metaContent("name", "twitter:description")])
      .join(" ");
    expect(text).not.toMatch(/£|\bp\b|\d/);
    expect(text).not.toMatch(/free|month|year|resident|guest|pro\b/i);
  });

  test("points at an image file that exists, and not at the offer image", () => {
    const image = metaContent("property", "og:image");
    expect(image).toBe("https://submit.diyaccounting.co.uk/images/social/og-pass-link.png");
    expect(metaContent("name", "twitter:image")).toBe(image);
    expect(fs.existsSync(path.join(publicDir, "images/social/og-pass-link.png"))).toBe(true);
    expect(metaContent("name", "twitter:card")).toBe("summary_large_image");
  });

  test("asks search engines not to index a link that carries a code", () => {
    expect(metaContent("name", "robots")).toBe("noindex");
  });
});
