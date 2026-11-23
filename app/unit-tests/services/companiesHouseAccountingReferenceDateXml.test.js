// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  buildAccountingReferenceDateBody,
  changeToPeriod,
  FIVE_YEAR_EXTENSION_REASONS,
} from "@app/services/companiesHouseAccountingReferenceDateXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "ChangeAccountingReferenceDate-v2-7.xsd";
const CURRENT = "2099-04-30";

describe("companiesHouseAccountingReferenceDateXml", () => {
  test("a shortened period is valid against ChangeAccountingReferenceDate-v2-7.xsd and says SHORT", async () => {
    const xml = buildAccountingReferenceDateBody({ currentPeriodEnd: CURRENT, newPeriodEnd: "2099-03-31" });

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<AccountRefDate>2099-04-30</AccountRefDate><ChangeToPeriod>SHORT</ChangeToPeriod><AmendedAccountRefDate>2099-03-31</AmendedAccountRefDate>",
    );
    expect(xml).not.toContain("FiveYearExtensionDetails");
  });

  test("an extended period is valid and says EXTEND", async () => {
    const xml = buildAccountingReferenceDateBody({ currentPeriodEnd: CURRENT, newPeriodEnd: "2099-09-30" });

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<ChangeToPeriod>EXTEND</ChangeToPeriod><AmendedAccountRefDate>2099-09-30</AmendedAccountRefDate>");
  });

  test("an extension that makes the period longer than 18 months is still a valid body, for Companies House to reject", async () => {
    const xml = buildAccountingReferenceDateBody({ currentPeriodEnd: CURRENT, newPeriodEnd: "2099-12-31" });

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<ChangeToPeriod>EXTEND</ChangeToPeriod><AmendedAccountRefDate>2099-12-31</AmendedAccountRefDate>");
  });

  test.each(Object.entries(FIVE_YEAR_EXTENSION_REASONS))(
    "a second extension in five years on the ground %s carries %s and is valid",
    async (reason, code) => {
      const xml = buildAccountingReferenceDateBody({
        currentPeriodEnd: CURRENT,
        newPeriodEnd: "2099-09-30",
        fiveYearExtensionReason: reason,
      });

      expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
      expect(xml).toContain(`<FiveYearExtensionDetails><ExtensionReason>${code}</ExtensionReason></FiveYearExtensionDetails>`);
    },
  );

  test("the Secretary of State's approval carries its four-character code, escaped, and is valid", async () => {
    const xml = buildAccountingReferenceDateBody({
      currentPeriodEnd: CURRENT,
      newPeriodEnd: "2099-09-30",
      fiveYearExtensionReason: "secretary-of-state-approval",
      extensionAuthorisedCode: "A&12",
    });

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<ExtensionReason>STATE</ExtensionReason><ExtensionAuthorisedCode>A&amp;12</ExtensionAuthorisedCode></FiveYearExtensionDetails>",
    );
  });

  test("the schema check refuses a body whose elements are out of order", async () => {
    const xml = buildAccountingReferenceDateBody({ currentPeriodEnd: CURRENT, newPeriodEnd: "2099-03-31" });
    const reordered = xml.replace(
      "<AccountRefDate>2099-04-30</AccountRefDate><ChangeToPeriod>SHORT</ChangeToPeriod>",
      "<ChangeToPeriod>SHORT</ChangeToPeriod><AccountRefDate>2099-04-30</AccountRefDate>",
    );
    expect((await gatewayFormSchemaErrors(reordered, SCHEMA)).length).toBeGreaterThan(0);
  });

  test("the change is SHORT for an earlier date, EXTEND for a later one and nothing for the same date", () => {
    expect(changeToPeriod(CURRENT, "2099-04-29")).toBe("SHORT");
    expect(changeToPeriod(CURRENT, "2099-05-01")).toBe("EXTEND");
    expect(changeToPeriod(CURRENT, CURRENT)).toBeNull();
  });

  test("a malformed date, an unchanged date, and a ground or a code where it does not apply are refused", () => {
    const build = (input) => () => buildAccountingReferenceDateBody({ currentPeriodEnd: CURRENT, newPeriodEnd: "2099-09-30", ...input });
    expect(build({ currentPeriodEnd: "30/04/2099" })).toThrow(/currentPeriodEnd/);
    expect(build({ newPeriodEnd: "2099-9-30" })).toThrow(/newPeriodEnd/);
    expect(build({ newPeriodEnd: CURRENT })).toThrow(/must differ/);
    expect(build({ fiveYearExtensionReason: "overseas-company" })).toThrow(/unknown fiveYearExtensionReason/);
    expect(build({ newPeriodEnd: "2099-03-31", fiveYearExtensionReason: "administration" })).toThrow(/extended period only/);
    expect(build({ fiveYearExtensionReason: "administration", extensionAuthorisedCode: "AB12" })).toThrow(/Secretary of State/);
    expect(build({ fiveYearExtensionReason: "secretary-of-state-approval", extensionAuthorisedCode: "AB1" })).toThrow(/4 characters/);
    expect(build({ extensionAuthorisedCode: "AB12" })).toThrow(/needs fiveYearExtensionReason/);
  });
});
