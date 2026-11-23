// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/welshPageIds.test.js
// A page's script finds its elements by id, and the Welsh copy of a page runs the same script. A
// translated sentence that leaves out an element inside it takes the element's id off the page.

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WELSH_PAGES } from "../../scripts/build-welsh-pages.mjs";

const PUBLIC_DIR = join(process.cwd(), "web", "public");

function idsOf(file) {
  return new Set([...readFileSync(join(PUBLIC_DIR, file), "utf8").matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

describe("the Welsh copy of a page", () => {
  test.each(WELSH_PAGES.map((page) => [page.en, page.cy]))("%s keeps every element id in %s", (english, welsh) => {
    const welshIds = idsOf(welsh);
    expect([...idsOf(english)].filter((id) => !welshIds.has(id))).toEqual([]);
  });
});
