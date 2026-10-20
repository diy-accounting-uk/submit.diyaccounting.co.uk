// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcCtReturnRequest.test.js
import { describe, test, beforeAll, expect } from "vitest";
import { buildCtReturnBodyFromBook } from "@app/test-helpers/ctReturnFixture.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments, REQUIRED_CT600_BOXES } from "@app/services/hmrcCtReturnRequest.js";
import { parseXmlDocument, firstElementText } from "@app/lib/xmlDom.js";

let baseBody;

function extract(overrides = {}, options) {
  const errors = [];
  const request = extractAndValidateCtReturnParameters(
    { body: JSON.stringify({ ...baseBody, gatewayUserId: "user", gatewayPassword: "pass", ...overrides }) },
    errors,
    options,
  );
  return { request, errors };
}

describe("extractAndValidateCtReturnParameters", () => {
  beforeAll(async () => {
    baseBody = await buildCtReturnBodyFromBook();
  });

  test("accepts a request built from a book export", () => {
    const { request, errors } = extract();
    expect(errors).toEqual([]);
    expect(request.utr).toBe(baseBody.utr);
    expect(request.gatewayUserId).toBe("user");
    expect(request.boxes[35]).toBe(baseBody.periodEnd);
  });

  test("takes no Government Gateway credentials for a preview", () => {
    const { request, errors } = extract({ gatewayUserId: undefined, gatewayPassword: undefined }, { requireGatewayCredentials: false });
    expect(errors).toEqual([]);
    expect(request.gatewayPassword).toBeUndefined();
  });

  test.each(REQUIRED_CT600_BOXES)("reports box %i when it is missing", (box) => {
    const boxes = { ...baseBody.boxes };
    delete boxes[box];
    expect(extract({ boxes }).errors).toContain(`Missing box ${box}`);
  });

  test("reports a box with a value that is neither a number nor text", () => {
    expect(extract({ boxes: { ...baseBody.boxes, 145: null, abc: 1 } }).errors).toEqual(
      expect.arrayContaining(["Invalid value for box 145", "Invalid box number abc"]),
    );
  });

  test("reports a computation line that is not a number", () => {
    expect(extract({ computationLines: { ...baseBody.computationLines, entertaining: "5" } }).errors).toContain(
      "Invalid or missing computationLines.entertaining",
    );
  });

  test("refuses a filleted accounts copy", () => {
    const smallCompany = { ...baseBody.smallCompany, filleted: true };
    expect(extract({ smallCompany }).errors).toContain("smallCompany.filleted must be false: HMRC takes the full accounts");
  });

  test("refuses a password over 128 characters", () => {
    expect(extract({ gatewayPassword: "x".repeat(129) }).errors).toContain("Invalid gatewayPassword");
  });
});

describe("buildCtReturnDocuments", () => {
  beforeAll(async () => {
    baseBody = await buildCtReturnBodyFromBook();
  });

  test("builds a return whose three documents name the same company, UTR and period", () => {
    const { request } = extract();
    const documents = buildCtReturnDocuments(request);
    const returnDocument = parseXmlDocument(documents.irEnvelopeXml);
    expect(firstElementText(returnDocument, "Reference")).toBe(baseBody.utr);
    expect(firstElementText(returnDocument, "RegistrationNumber")).toBe(baseBody.companyNumber);
    expect(documents.computationsIxbrl).toContain(baseBody.utr);
    expect(documents.computationsIxbrl).toContain(baseBody.boxes[35]);
    expect(documents.accountsIxbrl).toContain(baseBody.companyNumber);
    expect(documents.irEnvelopeXml).toContain(Buffer.from(documents.accountsIxbrl, "utf8").toString("base64"));
    expect(documents.irEnvelopeXml).toContain(Buffer.from(documents.computationsIxbrl, "utf8").toString("base64"));
  });
});
