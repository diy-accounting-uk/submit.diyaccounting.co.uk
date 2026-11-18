// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/companies.test.js

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import toml from "@iarna/toml";
import { getCompany } from "@app/http-simulator/scenarios/companies.js";

describe("the simulator's fixture companies", () => {
  test("the Precision Code Ltd book's company has a profile whose registered office is the book's address", () => {
    const book = toml.parse(readFileSync("mcp/test/fixtures/precision-code-ltd-full/book.toml", "utf8"));
    const entity = book.entityInformation;
    const company = getCompany(entity["diya-gl:companyNumber"]);
    expect(company).not.toBeNull();
    expect(company.company_name.toLowerCase()).toBe(entity.organizationIdentifier.toLowerCase());
    expect(company.company_status).toBe("active");
    expect(company.registered_office_address).toMatchObject({
      address_line_1: entity.organizationAddressLine,
      locality: entity.organizationTown,
      postal_code: entity.organizationPostcode,
    });
  });
});
