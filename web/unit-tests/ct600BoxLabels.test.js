// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const builderSource = readFileSync(join(process.cwd(), "app/services/ct600Xml.js"), "utf8");
const pageSource = readFileSync(join(process.cwd(), "web/public/companies-house/fileCompanyTaxReturn.page.js"), "utf8");

function constantFromPage(name) {
  const match = pageSource.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  if (!match) throw new Error(`No ${name} in the page script`);
  return new Function(`return ${match[1]};`)();
}

// Every box the envelope builder reads, as b[<box>], is a box the return can fill.
function boxesTheBuilderEmits() {
  const envelope = builderSource.slice(builderSource.indexOf("export function buildCt600IrEnvelope"));
  return [...new Set([...envelope.matchAll(/\bb\[(\d+)\]/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
}

describe("CT600 preview box labels", () => {
  const meanings = constantFromPage("BOX_MEANINGS");
  const anchors = constantFromPage("BOX_GUIDE_ANCHORS");
  const emitted = boxesTheBuilderEmits();

  test("the builder emits a plausible set of boxes", () => {
    expect(emitted.length).toBeGreaterThan(30);
  });

  test.each(emitted)("box %i has a label and a guide anchor", (box) => {
    expect(typeof meanings[box]).toBe("string");
    expect(meanings[box].length).toBeGreaterThan(3);
    expect(anchors[box]).toMatch(/^[a-z0-9-]+$/);
  });

  test("no label or anchor names a box the builder does not emit", () => {
    expect(
      Object.keys(meanings)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(emitted);
    expect(
      Object.keys(anchors)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(emitted);
  });
});
