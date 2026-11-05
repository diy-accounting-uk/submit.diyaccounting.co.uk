// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/exposureMatcher.test.js

import { describe, test, expect } from "vitest";
import { deflateRawSync } from "node:zlib";

import {
  NeedleSet,
  assessFormatMatch,
  digest,
  needleVariants,
  readZipEntries,
  secretLeaves,
} from "../../../scripts/lib/exposure-matcher.mjs";
import { SECRET_PATTERNS, findHits } from "../../../scripts/content-scan.mjs";

const fakeValue = "q7Zt1Lm9Xc3Vb8Nw2Rk5";

function needleSetFor(value) {
  return new NeedleSet(needleVariants(value).map((variant) => ({ ...variant, key: "fake-key" })));
}

function encodingsFound(set, text) {
  const found = [];
  set.scan(Buffer.from(text), (needle) => found.push(needle.encoding));
  return found;
}

function zipOf(name, content) {
  const compressed = deflateRawSync(Buffer.from(content));
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(30 + nameBytes.length + compressed.length, 16);
  return Buffer.concat([local, nameBytes, compressed, central, nameBytes, end]);
}

describe("secretLeaves", () => {
  test("takes a plain value as it is", () => {
    expect(secretLeaves(`  ${fakeValue}\n`)).toEqual([fakeValue]);
  });

  test("takes every version of a registry and leaves out the version pointer", () => {
    expect(secretLeaves(JSON.stringify({ current: "v2", versions: { v1: fakeValue, v2: `${fakeValue}x` } }))).toEqual([
      fakeValue,
      `${fakeValue}x`,
    ]);
  });

  test("leaves out identifiers and addresses in a stored client", () => {
    const client = { installed: { client_id: "public-identifier", client_secret: fakeValue, token_uri: "https://example.com/token" } };
    expect(secretLeaves(JSON.stringify(client))).toEqual([fakeValue]);
  });

  test("takes body lines of a private key and no certificate", () => {
    const line = "A".repeat(30) + "b".repeat(34);
    const pem = [
      "-----BEGIN CERTIFICATE-----",
      "C".repeat(64),
      "-----END CERTIFICATE-----",
      "-----BEGIN " + "PRIVATE KEY-----",
      line,
      "-----END " + "PRIVATE KEY-----",
    ];
    expect(secretLeaves(pem.join("\n"))).toEqual([line]);
  });

  test("reads text that is not JSON without an error, and drops a short value", () => {
    expect(secretLeaves("{not-json-but-long")).toEqual(["{not-json-but-long"]);
    expect(secretLeaves("abc")).toEqual([]);
  });
});

describe("NeedleSet", () => {
  test("finds the raw value", () => {
    expect(encodingsFound(needleSetFor(fakeValue), `a line ${fakeValue} more`)).toEqual(["raw"]);
  });

  test("finds the value inside a Basic header at any alignment", () => {
    for (const prefix of ["", "a:", "ab:", "abc:"]) {
      const header = Buffer.from(`${prefix}${fakeValue}:`).toString("base64");
      expect(encodingsFound(needleSetFor(fakeValue), header).some((encoding) => encoding.startsWith("base64-"))).toBe(true);
    }
  });

  test("finds the URL-encoded and JSON-escaped forms", () => {
    const value = 'pass word"1234';
    const set = needleSetFor(value);
    expect(encodingsFound(set, encodeURIComponent(value))).toContain("url-encoded");
    expect(encodingsFound(set, JSON.stringify(value))).toContain("json-escaped");
  });

  test("finds no hit in text without the value", () => {
    expect(encodingsFound(needleSetFor(fakeValue), fakeValue.slice(0, -1))).toEqual([]);
  });

  test("finds a value split across two chunks once", () => {
    const set = needleSetFor(fakeValue);
    const found = [];
    const write = set.stream((needle) => found.push(needle.encoding));
    write(Buffer.from(`start ${fakeValue.slice(0, 7)}`));
    write(Buffer.from(`${fakeValue.slice(7)} end ${"z".repeat(50)}`));
    write(Buffer.from("tail"));
    expect(found).toEqual(["raw"]);
  });
});

describe("assessFormatMatch", () => {
  test("reports the length and a placeholder, and holds no text of the match", () => {
    const assessment = assessFormatMatch("key_" + "x".repeat(24));
    expect(assessment.placeholder).toBe(true);
    expect(assessment.length).toBe(28);
    expect(Object.values(assessment).some((field) => typeof field === "string")).toBe(false);
  });

  test("does not call a random value a placeholder", () => {
    expect(assessFormatMatch(fakeValue).placeholder).toBe(false);
  });
});

describe("digest", () => {
  test("gives a different result under a different run key", () => {
    expect(digest("run-one", fakeValue)).not.toEqual(digest("run-two", fakeValue));
    expect(digest("run-one", fakeValue)).not.toContain(fakeValue);
  });
});

describe("readZipEntries", () => {
  test("reads a deflated entry from memory", () => {
    const [entry] = [...readZipEntries(zipOf("step.txt", `log line ${fakeValue}`))];
    expect(entry.name).toBe("step.txt");
    expect(entry.data.toString()).toContain(fakeValue);
  });

  test("yields nothing for bytes that are not a zip", () => {
    expect([...readZipEntries(Buffer.alloc(100))]).toEqual([]);
  });
});

describe("Companies House presenter id", () => {
  const madePresenterId = "73904128";
  const madePresenterCode = "Kq4-Wm7-Zp2";
  const presenterXml = `<PresenterIdNumber>${madePresenterId}</PresenterIdNumber><PresenterAuthenticationCode>${madePresenterCode}</PresenterAuthenticationCode>`;

  test("the value comparison finds a stored presenter id and code in a public text", () => {
    const secretString = JSON.stringify({ presenter_id: madePresenterId, presenter_code: madePresenterCode });
    const needles = secretLeaves(secretString).flatMap((leaf) => needleVariants(leaf).map((variant) => ({ ...variant, key: "presenter" })));
    const found = [];
    new NeedleSet(needles).scan(Buffer.from(presenterXml), (needle) => found.push(needle.key));
    expect(found).toContain("presenter");
  });

  test("the format scan has no pattern for a presenter id, which has no recognisable format", () => {
    expect(findHits(presenterXml, SECRET_PATTERNS)).toEqual([]);
  });
});
