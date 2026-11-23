// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/filing-description.test.js

import { describe, it, expect, beforeAll } from "vitest";

const formatDate = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

describe("a filing's description in Companies House's words", () => {
  let registerDescription;
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/company/filing-history-descriptions.js");
    await import("../public/lib/company/filing-description.js");
    registerDescription = window.companiesHouseWords.registerDescription;
  });

  it.each([
    ["accounts-with-accounts-type-micro-entity", { made_up_date: "2025-03-31" }, "Micro company accounts made up to 31 March 2025"],
    [
      "accounts-with-accounts-type-total-exemption-full",
      { made_up_date: "2024-12-31" },
      "Total exemption full accounts made up to 31 December 2024",
    ],
    [
      "confirmation-statement-with-no-updates",
      { made_up_date: "2025-06-14" },
      "Confirmation statement made on 14 June 2025 with no updates",
    ],
    [
      "appoint-person-director-company-with-name-date",
      { officer_name: "Ms Rhian Pritchard", appointment_date: "2025-01-06" },
      "Appointment of Ms Rhian Pritchard as a director on 6 January 2025",
    ],
    [
      "termination-director-company-with-name-termination-date",
      { officer_name: "Mr Owen Hale", termination_date: "2025-02-28" },
      "Termination of appointment of Mr Owen Hale as a director on 28 February 2025",
    ],
    [
      "change-registered-office-address-company-with-date-old-address-new-address",
      { old_address: "12 Mill Lane, Leeds, LS1 4AB", new_address: "3 Quay Street, Cardiff, CF10 1EA", change_date: "2025-04-01" },
      "Registered office address changed from 12 Mill Lane, Leeds, LS1 4AB to 3 Quay Street, Cardiff, CF10 1EA on 1 April 2025",
    ],
    ["incorporation-company", undefined, "Incorporation"],
  ])("words %s with its values", (description, descriptionValues, words) => {
    expect(registerDescription({ description, descriptionValues }, formatDate)).toBe(words);
  });

  it("leaves a placeholder the filing has no value for empty", () => {
    expect(registerDescription({ description: "termination-director-company-with-name", descriptionValues: {} }, formatDate)).toBe(
      "Termination of appointment of as a director",
    );
  });

  it("answers null for a description the enumeration lacks, so the page words its key", () => {
    expect(registerDescription({ description: "a-description-companies-house-has-not-published" }, formatDate)).toBeNull();
  });
});
