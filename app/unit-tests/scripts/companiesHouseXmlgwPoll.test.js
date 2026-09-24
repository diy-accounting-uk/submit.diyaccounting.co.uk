// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/companiesHouseXmlgwPoll.test.js

import { describe, test, expect } from "vitest";

import { maskCredentials, maskHeaders, formatHttpMessage, assertOutsideRepository } from "../../../scripts/companies-house-xmlgw-poll.js";
import { buildStatusRequest } from "../../../app/services/companiesHouseXmlGateway.js";

describe("maskCredentials", () => {
  test("masks a non-empty PresenterID", () => {
    const xml = "<GetSubmissionStatus><PresenterID>123456</PresenterID></GetSubmissionStatus>";
    expect(maskCredentials(xml)).toBe("<GetSubmissionStatus><PresenterID>***</PresenterID></GetSubmissionStatus>");
  });

  test("leaves an empty PresenterID visibly empty rather than masking it", () => {
    const xml = "<GetSubmissionStatus><PresenterID></PresenterID></GetSubmissionStatus>";
    expect(maskCredentials(xml)).toBe(xml);
  });

  test("masks a non-empty SenderID", () => {
    const xml = "<IDAuthentication><SenderID>abcdef0123456789</SenderID></IDAuthentication>";
    expect(maskCredentials(xml)).toBe("<IDAuthentication><SenderID>***</SenderID></IDAuthentication>");
  });

  test("leaves an empty SenderID visibly empty", () => {
    const xml = "<IDAuthentication><SenderID></SenderID></IDAuthentication>";
    expect(maskCredentials(xml)).toBe(xml);
  });

  test("masks a non-empty Authentication/Value nested inside IDAuthentication", () => {
    const xml =
      "<IDAuthentication><SenderID>x</SenderID><Authentication><Method>clear</Method><Value>abcdef0123456789</Value></Authentication></IDAuthentication>";
    const masked = maskCredentials(xml);
    expect(masked).toContain("<Value>***</Value>");
    expect(masked).not.toContain("abcdef0123456789");
    expect(masked).toContain("<Method>clear</Method>");
  });

  // The gateway's own reply sometimes echoes SenderDetails with an empty Value - the shape that
  // made three drafts and two extra gateway calls necessary before this script existed, because
  // the poll then in use masked every Value to "***" whether or not the gateway had sent one.
  test("leaves an empty echoed Authentication/Value visibly empty", () => {
    const xml =
      "<SenderDetails><IDAuthentication><SenderID>???????????</SenderID>" +
      "<Authentication><Method>clear</Method><Value></Value></Authentication></IDAuthentication></SenderDetails>";
    const masked = maskCredentials(xml);
    expect(masked).toContain("<Value></Value>");
    expect(masked).toContain("<SenderID>***</SenderID>");
  });

  test("leaves non-credential elements untouched", () => {
    const xml = "<Status><SubmissionNumber>dp2872</SubmissionNumber><StatusCode>ACCEPT</StatusCode></Status>";
    expect(maskCredentials(xml)).toBe(xml);
  });

  test("passes a non-string value through unchanged", () => {
    expect(maskCredentials(undefined)).toBeUndefined();
  });

  test("masks the presenter id, sender id and authentication value of a real GetSubmissionStatus request built by buildStatusRequest, by submission number", () => {
    const requestXml = buildStatusRequest({
      presenterId: "PRESENTER123",
      presenterCode: "AUTHCODE456",
      submissionNumber: "ab12cd",
      transactionId: "1",
    });
    const masked = maskCredentials(requestXml);

    expect(masked).not.toContain("PRESENTER123");
    expect(masked).toMatch(/<PresenterID>\*\*\*<\/PresenterID>/);
    expect(masked).toMatch(/<SenderID>\*\*\*<\/SenderID>/);
    expect(masked).toMatch(/<Value>\*\*\*<\/Value>/);
    // The submission number is not a credential and stays visible in the masked copy.
    expect(masked).toContain("<SubmissionNumber>ab12cd</SubmissionNumber>");
  });

  test("masks a real GetSubmissionStatus request built with a company number instead of a submission number", () => {
    const requestXml = buildStatusRequest({
      presenterId: "PRESENTER123",
      presenterCode: "AUTHCODE456",
      companyNumber: "05120000",
      transactionId: "1",
    });
    const masked = maskCredentials(requestXml);

    expect(masked).not.toContain("PRESENTER123");
    expect(masked).toMatch(/<PresenterID>\*\*\*<\/PresenterID>/);
    expect(masked).toContain("<CompanyNumber>05120000</CompanyNumber>");
  });
});

describe("maskHeaders", () => {
  test("masks a non-empty Authorization header, case-insensitively", () => {
    expect(maskHeaders({ "Authorization": "Bearer abc123", "Content-Type": "text/xml" })).toEqual({
      "Authorization": "***",
      "Content-Type": "text/xml",
    });
    expect(maskHeaders({ authorization: "Bearer abc123" })).toEqual({ authorization: "***" });
  });

  test("leaves an empty Authorization header empty", () => {
    expect(maskHeaders({ Authorization: "" })).toEqual({ Authorization: "" });
  });

  test("leaves non-Authorization headers untouched", () => {
    expect(maskHeaders({ "Content-Type": "text/xml", "Content-Length": "123" })).toEqual({
      "Content-Type": "text/xml",
      "Content-Length": "123",
    });
  });

  test("handles no headers", () => {
    expect(maskHeaders(undefined)).toEqual({});
  });
});

describe("formatHttpMessage", () => {
  test("renders a start line, headers and body separated as an HTTP message", () => {
    const message = formatHttpMessage("POST https://example.test/gateway HTTP/1.1", { "Content-Type": "text/xml" }, "<GovTalkMessage/>");
    expect(message).toBe("POST https://example.test/gateway HTTP/1.1\nContent-Type: text/xml\n\n<GovTalkMessage/>");
  });

  test("renders with no headers", () => {
    const message = formatHttpMessage("HTTP/1.1 200 OK", {}, "<GovTalkMessage/>");
    expect(message).toBe("HTTP/1.1 200 OK\n\n<GovTalkMessage/>");
  });
});

describe("assertOutsideRepository", () => {
  const repoRoot = "/repo/submit.diyaccounting.co.uk";

  test("throws when the output directory is the repository root", () => {
    expect(() => assertOutsideRepository(repoRoot, repoRoot)).toThrow(/must resolve outside the repository/);
  });

  test("throws when the output directory is nested inside the repository", () => {
    expect(() => assertOutsideRepository(`${repoRoot}/../submit.diyaccounting.co.uk/tmp/poll-out`, repoRoot)).toThrow(
      /must resolve outside the repository/,
    );
  });

  test("does not throw for a sibling directory outside the repository", () => {
    expect(() => assertOutsideRepository("/repo/companies-house-poll-out", repoRoot)).not.toThrow();
  });

  test("does not throw for the repository's own parent directory", () => {
    expect(() => assertOutsideRepository("/repo", repoRoot)).not.toThrow();
  });

  test("does not throw for a directory that merely shares the repository's name as a prefix", () => {
    expect(() => assertOutsideRepository("/repo/submit.diyaccounting.co.uk-poll-out", repoRoot)).not.toThrow();
  });
});
