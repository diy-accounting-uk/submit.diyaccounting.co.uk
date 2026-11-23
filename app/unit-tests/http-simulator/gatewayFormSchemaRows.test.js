// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPANIES_HOUSE_FORMS } from "../../../web/public/lib/companies-house-forms.js";

const SCHEMA_DIR = join(process.cwd(), "fixtures", "companies-house-xmlgw");
const sharedRows = Object.entries(COMPANIES_HOUSE_FORMS).filter(([, form]) => form.sharedPoll);

describe("the schema the simulator checks each shared-route form against", () => {
  test("there is at least one shared-route form", () => {
    expect(sharedRows.length).toBeGreaterThan(0);
  });

  test.each(sharedRows)("%s names a schema that is in the fixtures and declares the form's own root element", (kind, form) => {
    expect(form.schema, kind).toMatch(/\.xsd$/);
    const path = join(SCHEMA_DIR, form.schema);
    expect(existsSync(path), form.schema).toBe(true);
    expect(readFileSync(path, "utf8")).toContain(`<xs:element name="${form.formIdentifier}"`);
  });
});
