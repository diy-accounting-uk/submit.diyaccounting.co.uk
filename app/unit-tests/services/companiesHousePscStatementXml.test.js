// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  buildPscStatementNotificationBody,
  buildPscStatementWithdrawalBody,
  PSC_STATEMENTS,
} from "@app/services/companiesHousePscStatementXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const NOTIFICATION = "PSCStatementNotification-v1-2.xsd";
const WITHDRAWAL = "PSCStatementWithdrawal-v1-2.xsd";
const NOTIFIABLE = Object.keys(PSC_STATEMENTS).filter((statement) => PSC_STATEMENTS[statement].notifiable);
const ELEANOR = {
  kind: "individual-person-with-significant-control",
  title: "Mrs",
  surname: "Bramwell",
  forename: "Eleanor",
  dobMonth: 1,
  dobYear: 1970,
};

// The PSC a linked statement names; the others name none.
const pscFor = (statement) => (PSC_STATEMENTS[statement].element === "PSCLinkedStatement" ? ELEANOR : {});

describe("companiesHousePscStatementXml", () => {
  test("the statements a notification may give are the five PSC08 lists", () => {
    expect(NOTIFIABLE).toEqual([
      "NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL",
      "PSC_CONTACTED_BUT_NO_RESPONSE",
      "RESTRICTIONS_NOTICE_ISSUED_TO_PSC",
      "AWAITING_CONFIRMATION_FROM_PSC",
      "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS",
    ]);
  });

  for (const statement of NOTIFIABLE) {
    test(`a notification of ${statement} is valid against PSCStatementNotification-v1-2.xsd`, async () => {
      const xml = buildPscStatementNotificationBody({ statement, ...pscFor(statement), relevantDate: "2026-11-01" });
      expect(await gatewayFormSchemaErrors(xml, NOTIFICATION)).toEqual([]);
      expect(xml).toContain("<RelevantDate>2026-11-01</RelevantDate>");
    });
  }

  test("a company statement and a PSC statement are each their own element", () => {
    expect(buildPscStatementNotificationBody({ statement: NOTIFIABLE[0], relevantDate: "2026-11-01" })).toContain(
      "<CompanyStatement>NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL</CompanyStatement><RelevantDate>",
    );
    expect(buildPscStatementNotificationBody({ statement: "AWAITING_CONFIRMATION_FROM_PSC", relevantDate: "2026-11-01" })).toContain(
      "<PSCStatement>AWAITING_CONFIRMATION_FROM_PSC</PSCStatement><RelevantDate>",
    );
  });

  test("a linked statement names an individual by the register's particulars", () => {
    const xml = buildPscStatementNotificationBody({
      statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS",
      ...ELEANOR,
      relevantDate: "2026-11-01",
    });
    expect(xml).toContain(
      "<PSCLinkedStatement><Statement>PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS</Statement><Individual><Title>Mrs</Title>" +
        "<Surname>Bramwell</Surname><Forename>Eleanor</Forename><PartialDOB><Month>1</Month><Year>1970</Year></PartialDOB>" +
        "</Individual></PSCLinkedStatement>",
    );
  });

  test("a linked statement about a corporate entity or a legal person is valid", async () => {
    for (const [kind, element] of [
      ["corporate-entity-person-with-significant-control", "<Corporate><CorporateName>HOLDCO LIMITED</CorporateName></Corporate>"],
      ["legal-person-person-with-significant-control", "<LegalPerson><LegalPersonName>HOLDCO LIMITED</LegalPersonName></LegalPerson>"],
    ]) {
      const xml = buildPscStatementNotificationBody({
        statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS",
        kind,
        name: "HOLDCO LIMITED",
        relevantDate: "2026-11-01",
      });
      expect(xml).toContain(element);
      expect(await gatewayFormSchemaErrors(xml, NOTIFICATION)).toEqual([]);
    }
  });

  for (const statement of Object.keys(PSC_STATEMENTS)) {
    test(`a withdrawal of ${statement} is valid against PSCStatementWithdrawal-v1-2.xsd`, async () => {
      const xml = buildPscStatementWithdrawalBody({ statement, ...pscFor(statement), withdrawalDate: "2026-11-05" });
      expect(await gatewayFormSchemaErrors(xml, WITHDRAWAL)).toEqual([]);
      expect(xml).toContain("<WithdrawalDate>2026-11-05</WithdrawalDate>");
    });
  }

  test("a restrictions notice withdrawn by the company or by a court order says so and is valid", async () => {
    for (const reason of ["RESTRICTIONS_NOTICE_WITHDRAWN_BY_COMPANY", "RESTRICTIONS_NOTICE_WITHDRAWN_BY_COURT_ORDER"]) {
      const xml = buildPscStatementWithdrawalBody({
        statement: "RESTRICTIONS_NOTICE_ISSUED_TO_PSC",
        withdrawalDate: "2026-11-05",
        restrictionsWithdrawalReason: reason,
      });
      expect(xml).toContain(
        `<WithdrawalDate>2026-11-05</WithdrawalDate><RestrictionsNoticeWithdrawalReason>${reason}</RestrictionsNoticeWithdrawalReason>`,
      );
      expect(await gatewayFormSchemaErrors(xml, WITHDRAWAL)).toEqual([]);
    }
  });

  test("a statement only withdrawable, a reason without a restrictions notice, or a bad date is refused", () => {
    expect(() => buildPscStatementNotificationBody({ statement: "PSC_EXISTS_BUT_NOT_IDENTIFIED", relevantDate: "2026-11-01" })).toThrow(
      /only withdrawn/,
    );
    expect(() => buildPscStatementNotificationBody({ statement: "NO_SUCH_STATEMENT", relevantDate: "2026-11-01" })).toThrow(
      /unknown PSC statement/,
    );
    expect(() =>
      buildPscStatementWithdrawalBody({
        statement: "PSC_CONTACTED_BUT_NO_RESPONSE",
        withdrawalDate: "2026-11-05",
        restrictionsWithdrawalReason: "RESTRICTIONS_NOTICE_WITHDRAWN_BY_COMPANY",
      }),
    ).toThrow(/goes only with/);
    expect(() => buildPscStatementNotificationBody({ statement: NOTIFIABLE[0], relevantDate: "1/11/2026" })).toThrow(/relevantDate/);
    expect(() =>
      buildPscStatementNotificationBody({ statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", relevantDate: "2026-11-01" }),
    ).toThrow(/unknown PSC kind/);
  });

  test("the schema refuses a notification without its relevant date", async () => {
    const xml = buildPscStatementNotificationBody({ statement: "AWAITING_CONFIRMATION_FROM_PSC", relevantDate: "2026-11-01" }).replace(
      "<RelevantDate>2026-11-01</RelevantDate>",
      "",
    );
    expect((await gatewayFormSchemaErrors(xml, NOTIFICATION)).length).toBeGreaterThan(0);
  });
});
