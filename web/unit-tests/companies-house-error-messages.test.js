// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companies-house-error-messages.test.js

import { describe, it, expect } from "vitest";

import { describeGovTalkError, describeGovTalkErrors } from "../public/lib/services/companies-house-error-messages.js";

describe("describeGovTalkError", () => {
  it("names a known error number in plain words, not the gateway's own Text", () => {
    const message = describeGovTalkError({
      number: 505,
      text: "Invalid schema URI supplied",
    });
    expect(message).toBe("Companies House rejected the form this page sent. This is a software fault, not something to fix on this page.");
  });

  it("names the schema-validation error, 100, observed against the test service", () => {
    const message = describeGovTalkError({
      number: 100,
      text: "XML failed schema validation: Invalid XML: Datatype error: Type:InvalidDatatypeValueException, Message:Value 'AUTH01' with length '6' exceeds maximum length facet of '8' .",
    });
    expect(message).toBe("Companies House could not read part of the submission - a value sent was invalid or too long.");
  });

  it("names the poll blocker, 9999, observed against the test service", () => {
    expect(describeGovTalkError({ number: 9999, text: "No presenter ID supplied" })).toBe(
      "Companies House could not process this submission right now.",
    );
  });

  it("falls back to the gateway's own Text for an unlisted number", () => {
    expect(describeGovTalkError({ number: 12345, text: "Something Companies House added later" })).toBe(
      "Something Companies House added later",
    );
  });

  it("falls back to a generic message when neither a known number nor Text is given", () => {
    expect(describeGovTalkError({})).toBe("Companies House rejected this submission.");
    expect(describeGovTalkError()).toBe("Companies House rejected this submission.");
  });
});

describe("describeGovTalkErrors", () => {
  it("maps every entry in an array, most specific first", () => {
    expect(describeGovTalkErrors([{ number: 505 }, { number: 100 }])).toEqual([
      "Companies House rejected the form this page sent. This is a software fault, not something to fix on this page.",
      "Companies House could not read part of the submission - a value sent was invalid or too long.",
    ]);
  });

  it("returns an empty array when given none", () => {
    expect(describeGovTalkErrors([])).toEqual([]);
    expect(describeGovTalkErrors()).toEqual([]);
  });
});
