// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/supportMailLanes.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";

import { chooseLane, dkimPassDomains, dkimPasses, findEntry, loadRegistry, parseRegistry } from "../../../scripts/support-mail-lanes.mjs";

const headers = JSON.parse(readFileSync(new URL("../fixtures/supportMailIntake/auth-results.json", import.meta.url), "utf8"));

const registry = parseRegistry(`
[[sender]]
domain = "vendor.example"
dkim = "vendor.example"
lane = "record"
subject = "invoice|receipt"

[[sender]]
domain = "vendor.example"
dkim = "vendor.example"
lane = "notice"

[[sender]]
domain = "billing.vendor.example"
dkim = "billing.vendor.example"
lane = "record"
`);

describe("registry", () => {
  test("parses entries with a case-insensitive subject pattern and a default for each domain", () => {
    expect(registry).toHaveLength(3);
    expect(findEntry(registry, "vendor.example", "Your INVOICE is ready").lane).toBe("record");
    expect(findEntry(registry, "vendor.example", "Something else").lane).toBe("notice");
  });

  test("the longest registered domain wins and a subdomain matches its parent", () => {
    expect(findEntry(registry, "billing.vendor.example", "anything").dkim).toBe("billing.vendor.example");
    expect(findEntry(registry, "mail.vendor.example", "anything").dkim).toBe("vendor.example");
    expect(findEntry(registry, "notvendor.example", "invoice")).toBeNull();
  });

  test("the shipped registry sends DMARC aggregate reports from Google and Microsoft to the record lane", () => {
    const shipped = loadRegistry();
    expect(findEntry(shipped, "google.com", "Report domain: diyaccounting.co.uk Submitter: google.com Report-ID: 1").lane).toBe("record");
    expect(findEntry(shipped, "microsoft.com", "Report Domain: diyaccounting.co.uk Submitter: outlook.com Report-ID: 1").lane).toBe(
      "record",
    );
    expect(findEntry(shipped, "microsoft.com", "Your account").lane).toBe("notice");
  });

  test("an entry the intake could not apply is refused", () => {
    expect(() => parseRegistry('[[sender]]\ndomain = "a.example"\nlane = "notice"')).toThrow(/no dkim/);
    expect(() => parseRegistry('[[sender]]\ndomain = "a.example"\ndkim = "a.example"\nlane = "customer"')).toThrow(/lane customer/);
    expect(() => parseRegistry('[[sender]]\ndomain = "a.example"\ndkim = "a.example"\nlane = "record"\nsubject = "x"')).toThrow(
      /no default entry/,
    );
  });

  test("the shipped registry loads, and holds only record and notice entries with a default for each domain", () => {
    const shipped = loadRegistry();
    expect(shipped.length).toBeGreaterThan(10);
    expect(new Set(shipped.map((entry) => entry.lane))).toEqual(new Set(["record", "notice"]));
  });
});

describe("Authentication-Results", () => {
  test("a pass names its signing domain", () => {
    expect(dkimPassDomains(headers.pass)).toEqual(["vendor.example"]);
    expect(dkimPasses(headers.pass, "vendor.example")).toBe(true);
  });

  test("a mailing service's own pass is listed beside the vendor's and does not replace it", () => {
    expect(dkimPassDomains(headers.passViaMailingService)).toEqual(["vendor.example", "mailer.example"]);
    expect(dkimPasses(headers.passViaMailingService, "vendor.example")).toBe(true);
    expect(dkimPasses(headers.mailingServiceOnly, "vendor.example")).toBe(false);
  });

  test("a signing domain that differs from the From domain passes when it sits under the registered domain", () => {
    expect(dkimPasses(headers.differingSigningDomain, "vendor.example")).toBe(true);
    expect(dkimPasses(headers.lookalikeDomain, "vendor.example")).toBe(false);
  });

  test("a failed, absent or missing result is not a pass", () => {
    expect(dkimPasses(headers.fail, "vendor.example")).toBe(false);
    expect(dkimPasses(headers.none, "vendor.example")).toBe(false);
    expect(dkimPasses(headers.missing, "vendor.example")).toBe(false);
    expect(dkimPasses(undefined, "vendor.example")).toBe(false);
  });

  test("only the topmost header is read, and only when Google wrote it", () => {
    expect(dkimPasses(headers.forgedLower, "vendor.example")).toBe(false);
    expect(dkimPasses(headers.forgedTop, "vendor.example")).toBe(false);
  });
});

describe("lane choice", () => {
  const choose = (extra) =>
    chooseLane({ registry, automated: false, domain: "vendor.example", subject: "Hello", headers: headers.pass, ...extra });

  test("a sender outside the registry is a customer, or a notice when automated", () => {
    expect(choose({ domain: "person.example" })).toBe("customer");
    expect(choose({ domain: "person.example", automated: true })).toBe("notice");
  });

  test("a registered sender with a passing DKIM takes the lane of its entry", () => {
    expect(choose({ subject: "Your invoice" })).toBe("record");
    expect(choose({ subject: "Account update" })).toBe("notice");
  });

  test("a registered sender whose DKIM fails, is absent or is forged is unverified", () => {
    expect(choose({ headers: headers.fail })).toBe("unverified");
    expect(choose({ headers: headers.missing })).toBe("unverified");
    expect(choose({ headers: headers.forgedLower })).toBe("unverified");
    expect(choose({ headers: headers.mailingServiceOnly })).toBe("unverified");
  });

  test("a registered domain is never a customer, even when the sender looks like a person", () => {
    expect(choose({ domain: "mail.vendor.example", automated: false, headers: headers.fail })).toBe("unverified");
  });

  test("a login subject is withheld for every sender that is not a customer", () => {
    expect(choose({ subject: "Your verification code is 123456" })).toBe("withheld");
    expect(choose({ subject: "Reset your password", headers: headers.fail })).toBe("withheld");
    expect(choose({ domain: "other.example", automated: true, subject: "Sign-in attempt" })).toBe("withheld");
    expect(choose({ domain: "person.example", subject: "I cannot sign in" })).toBe("customer");
  });
});

describe("the registry check key", () => {
  const entry = (extra) => `
[[sender]]
domain = "vendor.example"
dkim = "vendor.example"
lane = "notice"
${extra}
`;

  test("a known check id is kept on its entry", () => {
    expect(parseRegistry(entry('check = "trusted-event"'))[0].check).toBe("trusted-event");
    expect(parseRegistry(entry(""))[0].check).toBeNull();
  });

  test("an id outside the table is refused", () => {
    expect(() => parseRegistry(entry('check = "delete-everything"'))).toThrow(/has the check delete-everything/);
  });

  test("a check on a record entry is refused", () => {
    expect(() => parseRegistry(entry('check = "trusted-event"').replace('lane = "notice"', 'lane = "record"'))).toThrow(
      /not in the notice lane/,
    );
  });

  test("the live registry sets the check on the cost alerts entry only", () => {
    const withCheck = loadRegistry().filter((row) => row.check !== null);
    expect(withCheck.map((row) => [row.domain, row.check])).toEqual([["costalerts.amazonaws.com", "trusted-event"]]);
  });
});
