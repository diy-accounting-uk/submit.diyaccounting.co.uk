// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/share-preview-tags.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve(import.meta.dirname, "../public");

function metaContent(html, attribute, name) {
  const match = html.match(new RegExp(`<meta\\s+${attribute}="${name}"\\s+content="([^"]*)"`));
  return match ? match[1] : undefined;
}

describe("share preview tags", () => {
  test.each(["guide", "help", "videos", "mtd-calendar"])("%s.html carries a full preview that matches its description", (name) => {
    const html = fs.readFileSync(path.join(publicDir, `${name}.html`), "utf8");
    expect(metaContent(html, "property", "og:type")).toBe("website");
    expect(metaContent(html, "property", "og:url")).toBe(`https://submit.diyaccounting.co.uk/${name}.html`);
    expect(metaContent(html, "property", "og:title")).toBe(html.match(/<title>(.*?)<\/title>/)[1].replace(/&(?!amp;)/g, "&amp;"));
    expect(metaContent(html, "property", "og:description")).toBe(metaContent(html, "name", "description"));
    expect(metaContent(html, "property", "og:image")).toBe("https://submit.diyaccounting.co.uk/images/social/og-submit.png");
    expect(metaContent(html, "name", "twitter:card")).toBe("summary_large_image");
  });
});
