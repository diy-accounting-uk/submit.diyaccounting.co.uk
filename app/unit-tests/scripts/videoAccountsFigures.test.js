// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The accounts the scene scripts under videos/ type must pass the accounts form's own balance check,
// or the recording stops at the form's refusal before the preview.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { capitalAndReservesMismatch } from "../../../web/public/lib/balance-sheet-check.js";

const VIDEOS = path.join(process.cwd(), "videos");

// Each value a scene script types or fills, by its target.
function typedValues(script) {
  const values = {};
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      if ((node.action === "fill" || node.action === "type") && typeof node.target === "string")
        values[node.target] = node.text ?? node.value;
      Object.values(node).forEach(walk);
    }
  };
  walk(script);
  return values;
}

const scripts = fs
  .readdirSync(VIDEOS)
  .filter((name) => name.endsWith(".json"))
  .map((name) => [name, typedValues(JSON.parse(fs.readFileSync(path.join(VIDEOS, name), "utf-8")))]);

describe("the accounts a scene script types", () => {
  const typingCapitalAndReserves = scripts.filter(
    ([, values]) => values["#currentCapitalAndReserves"] || values["#priorCapitalAndReserves"],
  );

  test("finds the scripts that type capital and reserves", () => {
    expect(typingCapitalAndReserves.map(([name]) => name)).toEqual(
      expect.arrayContaining(["file-micro-entity-accounts.json", "short-file-micro-entity-accounts.json"]),
    );
  });

  test.each(typingCapitalAndReserves)(
    "%s: capital and reserves equal share capital plus the profit and loss reserve, both years",
    (name, values) => {
      for (const year of ["current", "prior"]) {
        if (values[`#${year}CapitalAndReserves`] === undefined) continue;
        const mismatch = capitalAndReservesMismatch({
          calledUpShareCapital: Number(values[`#${year}CalledUpShareCapital`]),
          profitAndLossAccount: Number(values[`#${year}ProfitAndLossAccount`]),
          capitalAndReserves: Number(values[`#${year}CapitalAndReserves`]),
        });
        expect(mismatch, `${name}, ${year} year`).toBeNull();
      }
    },
  );
});
