// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { validateXML } from "xmllint-wasm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildChangeOfNameBody,
  supportingDocumentFor,
  isValidProposedCompanyName,
  NAME_CHANGE_METHODS,
  NAME_SUPPORTING_DOCUMENTS,
} from "@app/services/companiesHouseChangeOfNameXml.js";
import { buildFormSubmission } from "@app/services/companiesHouseXmlGateway.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "ChangeOfName-v2-6.xsd";
const RESOLUTION = { method: "resolution", proposedName: "BRAMWELL TENNANT TRADING LIMITED", meetingDate: "2026-11-20" };
const PDF_BASE64 = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n").toString("base64");

// The FormSubmission element of an envelope, validated against the envelope's own schema. That
// schema holds no declaration of a form's root element, so the form, validated on its own, is taken out.
async function formSubmissionErrors(envelopeXml) {
  const formSubmission = envelopeXml
    .match(/<FormSubmission[\s\S]*<\/FormSubmission>/)[0]
    .replace(/<ChangeOfName[\s\S]*<\/ChangeOfName>/, "");
  const schema = readFileSync(join(process.cwd(), "fixtures", "companies-house-xmlgw", "FormSubmission-v2-11.xsd"), "utf8");
  const result = await validateXML({
    xml: [{ fileName: "submission.xml", contents: formSubmission }],
    schema: [{ fileName: "FormSubmission-v2-11.xsd", contents: schema }],
  });
  return result.valid ? [] : result.errors.map((error) => error.message);
}

describe("companiesHouseChangeOfNameXml", () => {
  test("a change by resolution is valid against ChangeOfName-v2-6.xsd, with the meeting date and the standard service", async () => {
    const xml = buildChangeOfNameBody(RESOLUTION);

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<MethodOfChange>RESOLUTION</MethodOfChange><ProposedCompanyName>BRAMWELL TENNANT TRADING LIMITED</ProposedCompanyName>" +
        "<MeetingDate>2026-11-20</MeetingDate><SameDay>false</SameDay><NoticeGiven>true</NoticeGiven>",
    );
  });

  test("a same-day change by resolution says SameDay true and is valid", async () => {
    const xml = buildChangeOfNameBody({ ...RESOLUTION, sameDay: true });

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<SameDay>true</SameDay>");
  });

  test("a change by the means the articles provide needs no meeting date and is valid", async () => {
    const xml = buildChangeOfNameBody({ method: "articles", proposedName: "BRAMWELL TENNANT TRADING LIMITED" });

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<MethodOfChange>ARTICLES</MethodOfChange>");
    expect(xml).not.toContain("MeetingDate");
  });

  test("a name with an ampersand and an apostrophe is escaped and stays valid", async () => {
    const xml = buildChangeOfNameBody({ ...RESOLUTION, proposedName: "BRAMWELL & TENNANT'S <TRADING> LTD" });

    expect(xml).toContain("BRAMWELL &amp; TENNANT'S &lt;TRADING&gt; LTD");
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("a name with a sensitive word travels with its permission letter as a SUPPNAMEAUTH document, and the whole submission is valid", async () => {
    const formXml = buildChangeOfNameBody({ ...RESOLUTION, proposedName: "BRAMWELL ACCREDITED TRAINING LIMITED" });
    const document = supportingDocumentFor({ kind: "sensitive-word-permission", contentBase64: PDF_BASE64, date: "2026-11-22" });
    const envelope = buildFormSubmission({
      presenterId: "presenter",
      presenterCode: "code",
      companyNumber: "00000001",
      companyName: "SIMULATOR EXAMPLE COMPANY LIMITED",
      companyAuthenticationCode: "SIMCS01",
      packageReference: "0012",
      formIdentifier: "ChangeOfName",
      submissionNumber: "NAM001",
      dateSigned: "2026-11-22",
      formXml,
      document,
      gatewayTest: true,
    });

    expect(await gatewayFormSchemaErrors(formXml, SCHEMA)).toEqual([]);
    expect(await formSubmissionErrors(envelope)).toEqual([]);
    expect(document).toEqual({
      data: PDF_BASE64,
      date: "2026-11-22",
      filename: "name-permission.pdf",
      contentType: "application/pdf",
      category: "SUPPNAMEAUTH",
    });
    expect(envelope).toContain("<ContentType>application/pdf</ContentType>");
    expect(envelope).toContain("<Category>SUPPNAMEAUTH</Category>");
  });

  test("a letter of no objection to a same-as name is a SUPPEXISTNAME document", () => {
    expect(supportingDocumentFor({ kind: "same-as-no-objection", contentBase64: PDF_BASE64, date: "2026-11-22" })).toMatchObject({
      filename: "name-no-objection.pdf",
      category: "SUPPEXISTNAME",
    });
  });

  test("the schema check refuses a body whose elements are out of order", async () => {
    const xml = buildChangeOfNameBody(RESOLUTION);
    const reordered = xml.replace(
      "<MeetingDate>2026-11-20</MeetingDate><SameDay>false</SameDay>",
      "<SameDay>false</SameDay><MeetingDate>2026-11-20</MeetingDate>",
    );
    expect((await gatewayFormSchemaErrors(reordered, SCHEMA)).length).toBeGreaterThan(0);
  });

  test("the proposed name check agrees with the schema: upper case, 3 to 160 characters, the starred characters not in the first three", async () => {
    const cases = [
      "ABC",
      "A".repeat(160),
      "CAFÉ ÀGOGO LTD",
      "AB+ LIMITED",
      "AB",
      "A".repeat(161),
      "Lower Case Ltd",
      "+AB LIMITED",
      "AB\tC LTD",
    ];
    for (const proposedName of cases) {
      const body =
        `<ChangeOfName xmlns="http://xmlgw.companieshouse.gov.uk"><MethodOfChange>ARTICLES</MethodOfChange>` +
        `<ProposedCompanyName>${proposedName}</ProposedCompanyName><NoticeGiven>true</NoticeGiven></ChangeOfName>`;
      const schemaAccepts = (await gatewayFormSchemaErrors(body, SCHEMA)).length === 0;
      expect(isValidProposedCompanyName(proposedName), proposedName).toBe(schemaAccepts);
    }
    expect(isValidProposedCompanyName("ABC")).toBe(true);
    expect(isValidProposedCompanyName("AB")).toBe(false);
    expect(isValidProposedCompanyName("Lower Case Ltd")).toBe(false);
  });

  test("the methods and the letters map to the schema's codes", () => {
    expect(NAME_CHANGE_METHODS).toEqual({ resolution: "RESOLUTION", articles: "ARTICLES" });
    expect(Object.values(NAME_SUPPORTING_DOCUMENTS).map((document) => document.category)).toEqual(["SUPPNAMEAUTH", "SUPPEXISTNAME"]);
    for (const { filename } of Object.values(NAME_SUPPORTING_DOCUMENTS)) expect(filename.length).toBeLessThanOrEqual(32);
  });

  test("an unknown method, a name outside the character set, a resolution with no date, a malformed date or an unknown letter is refused", () => {
    expect(() => buildChangeOfNameBody({ ...RESOLUTION, method: "llp" })).toThrow(/unknown method/);
    expect(() => buildChangeOfNameBody({ ...RESOLUTION, proposedName: "ab" })).toThrow(/proposedName/);
    expect(() => buildChangeOfNameBody({ ...RESOLUTION, meetingDate: undefined })).toThrow(/needs its meetingDate/);
    expect(() => buildChangeOfNameBody({ ...RESOLUTION, meetingDate: "20/11/2026" })).toThrow(/meetingDate must be/);
    expect(() => supportingDocumentFor({ kind: "resolution", contentBase64: PDF_BASE64, date: "2026-11-22" })).toThrow(
      /unknown supporting document/,
    );
  });
});
