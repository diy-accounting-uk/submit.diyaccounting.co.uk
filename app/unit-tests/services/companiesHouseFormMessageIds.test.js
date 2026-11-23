// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadCatalogue } from "../../../scripts/build-welsh-pages.mjs";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

// Every id a form's route names a refusal by, from the request checks.
const routeIds = [...read("app/services/companiesHouseForms.js").matchAll(/\bid: "([a-z0-9.-]+)"/g)].map(([, id]) => id);

// Every id a form page registers words for, from the pages that call registerMessages.
const pageIds = readdirSync(join(process.cwd(), "web/public/companies-house"))
  .filter((file) => file.endsWith(".page.js"))
  .map((file) => read(`web/public/companies-house/${file}`))
  .filter((source) => source.includes("registerMessages("))
  .flatMap((source) => [...source.matchAll(/^\s*"([a-z0-9.-]+)": \(\) =>/gm)].map(([, id]) => id));

describe("the refusals a form's route names by id", () => {
  test("there is at least one", () => {
    expect(routeIds.length).toBeGreaterThan(0);
  });

  test("each is worded by a form page, so the page shows it in the reader's language", () => {
    expect(routeIds.filter((id) => !pageIds.includes(id))).toEqual([]);
  });

  test("each has its Welsh in the catalogue", () => {
    const catalogue = loadCatalogue();
    const strings = catalogue.strings || catalogue;
    expect(routeIds.filter((id) => !strings[id]?.cy)).toEqual([]);
  });
});
