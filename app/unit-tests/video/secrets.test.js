// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/video/secrets.test.js

import { describe, test, expect } from "vitest";
import { collectSecrets, findSecrets, redact, assertNoSecrets } from "../../../scripts/lib/video/secrets.js";

describe("collectSecrets", () => {
  test("picks up the credential environment variables that are set", () => {
    const secrets = collectSecrets({ TEST_AUTH_PASSWORD: "TestXxx!Aa1", TEST_HMRC_PASSWORD: "hmrcpassword1" });
    expect(secrets).toEqual(expect.arrayContaining(["TestXxx!Aa1", "hmrcpassword1"]));
  });

  test("takes extra values the run resolved for itself", () => {
    expect(collectSecrets({}, ["mintedpassword"])).toEqual(["mintedpassword"]);
  });

  test("ignores blank, missing and very short values", () => {
    expect(collectSecrets({ TEST_AUTH_PASSWORD: "", TEST_HMRC_PASSWORD: "abc" }, [undefined, "  "])).toEqual([]);
  });

  test("lists each value once", () => {
    expect(collectSecrets({ TEST_AUTH_PASSWORD: "sharedsecret", TEST_HMRC_PASSWORD: "sharedsecret" })).toEqual(["sharedsecret"]);
  });
});

describe("findSecrets", () => {
  test("reports the values present in the text", () => {
    expect(findSecrets("logged in as user with hmrcpassword1", ["hmrcpassword1", "unusedsecret"])).toEqual(["hmrcpassword1"]);
  });

  test("finds nothing in clean text", () => {
    expect(findSecrets("clicks the Bundles link", ["hmrcpassword1"])).toEqual([]);
  });
});

describe("redact", () => {
  test("replaces every occurrence", () => {
    expect(redact("a hmrcpassword1 b hmrcpassword1", ["hmrcpassword1"])).toBe("a *** b ***");
  });
});

describe("assertNoSecrets", () => {
  test("passes clean text", () => {
    expect(() => assertNoSecrets("tour.vtt", "types 193054661 into #vrn", ["hmrcpassword1"])).not.toThrow();
  });

  test("names the artefact and never quotes the value it found", () => {
    let thrown;
    try {
      assertNoSecrets("tour.vtt", "types hmrcpassword1", ["hmrcpassword1"]);
    } catch (err) {
      thrown = err;
    }
    expect(thrown.message).toContain("tour.vtt");
    expect(thrown.message).not.toContain("hmrcpassword1");
  });
});
