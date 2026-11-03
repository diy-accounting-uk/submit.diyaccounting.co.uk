// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcReceiptSignature.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  verifyReceiptSignature,
  parseTrustedFingerprints,
  normaliseFingerprint,
  RECEIPT_SIGNATURE_VALID,
  RECEIPT_SIGNATURE_INVALID,
  RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED,
  RECEIPT_SIGNATURE_UNKNOWN_CERTIFICATE,
  RECEIPT_SIGNATURE_EXPIRED_CERTIFICATE,
} from "@app/services/hmrcReceiptSignature.js";

const fixture = (name) => readFileSync(join(process.cwd(), "fixtures", "hmrc-transaction-engine", name), "utf8");

// A receipt in the shape TPVS returns, signed with a throwaway certificate: the signature covers
// SignedInfo as Canonical XML 1.0 renders it, checked with xmllint --c14n and openssl dgst.
const SIGNED = fixture("receipt-signed-test-certificate.xml");
const SIGNED_CERTIFICATE_SHA256 = "13:FD:CF:96:78:B7:07:C6:05:A9:7C:A8:F7:AD:3F:53:21:D5:22:FB:C7:E4:6D:B8:F0:92:95:16:58:61:D7:33";
const trusted = parseTrustedFingerprints(SIGNED_CERTIFICATE_SHA256);

describe("verifyReceiptSignature", () => {
  test("is valid when the signature verifies and the certificate is trusted and in date", () => {
    const result = verifyReceiptSignature(SIGNED, { trustedFingerprints: trusted, now: new Date("2026-11-04T00:00:00Z") });
    expect(result).toMatchObject({
      outcome: RECEIPT_SIGNATURE_VALID,
      certificateSha256: normaliseFingerprint(SIGNED_CERTIFICATE_SHA256),
      certificateSubject: "C=GB, O=Test Receipt Signer, CN=receipt-signer.test.invalid",
      certificateValidTo: "2126-10-10T12:58:27.000Z",
    });
  });

  test("is unknown-certificate when no certificate is trusted, even for a well-signed receipt", () => {
    expect(verifyReceiptSignature(SIGNED).outcome).toBe(RECEIPT_SIGNATURE_UNKNOWN_CERTIFICATE);
    expect(verifyReceiptSignature(SIGNED, { trustedFingerprints: parseTrustedFingerprints("AA:BB") }).outcome).toBe(
      RECEIPT_SIGNATURE_UNKNOWN_CERTIFICATE,
    );
  });

  test("is expired-certificate when a trusted certificate is out of date, before or after its dates", () => {
    expect(verifyReceiptSignature(SIGNED, { trustedFingerprints: trusted, now: new Date("2200-01-01T00:00:00Z") }).outcome).toBe(
      RECEIPT_SIGNATURE_EXPIRED_CERTIFICATE,
    );
    expect(verifyReceiptSignature(SIGNED, { trustedFingerprints: trusted, now: new Date("2020-01-01T00:00:00Z") }).outcome).toBe(
      RECEIPT_SIGNATURE_EXPIRED_CERTIFICATE,
    );
  });

  test("is digest-not-reproduced, with both digests, when SignedInfo differs from what was signed", () => {
    const tampered = SIGNED.replace("XwHjMbO6v3X19HZ5W3M1WuioQPE=", "XwHjMbO6v3X19HZ5W3M1WuioQPF=");
    const result = verifyReceiptSignature(tampered, { trustedFingerprints: trusted });
    expect(result.outcome).toBe(RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED);
    expect(result.computedDigest).toMatch(/^[0-9a-f]{40}$/);
    expect(result.signedDigest).toMatch(/^[0-9a-f]{40}$/);
    expect(result.computedDigest).not.toBe(result.signedDigest);
    expect(result.canonicalization).toBe("http://www.w3.org/TR/2001/REC-xml-c14n-20010315");
  });

  test("is invalid when the signature value cannot be read with the embedded key", () => {
    const tampered = SIGNED.replace(/(<dsig:SignatureValue>)./, "$1A");
    expect(verifyReceiptSignature(tampered, { trustedFingerprints: trusted }).outcome).toBe(RECEIPT_SIGNATURE_INVALID);
  });

  test("is digest-not-reproduced, naming the certificate, for the receipt TPVS returned and HMRC's published example", () => {
    const tpvs = verifyReceiptSignature(fixture("tpvs-ct600-success-response.xml"));
    expect(tpvs).toMatchObject({
      outcome: RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED,
      certificateSubject: expect.stringContaining("HM Revenue and Customs"),
    });
    expect(tpvs.computedDigest).not.toBe(tpvs.signedDigest);
    const published = verifyReceiptSignature(fixture("irmarkexample-response.xml"));
    expect(published).toMatchObject({
      outcome: RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED,
      certificateSubject: "ST=Test, O=Test, CN=ServerTest",
    });
  });

  test.each([
    ["no signature", "<GovTalkMessage><Body><SuccessResponse/></Body></GovTalkMessage>", /no signature/],
    ["not XML", "not xml", /could not be read/],
    ["an unsupported signature method", SIGNED.replace("xmldsig#rsa-sha1", "xmldsig#dsa-sha1"), /Unsupported signature method/],
    ["an unsupported canonicalization", SIGNED.replace('REC-xml-c14n-20010315"', 'xml-exc-c14n#"'), /Unsupported canonicalization/],
    ["no certificate", SIGNED.replace(/<dsig:X509Certificate>[\s\S]*<\/dsig:X509Certificate>/, ""), /lacks/],
    [
      "a certificate that is not a certificate",
      SIGNED.replace(/(<dsig:X509Certificate>)[\s\S]*(<\/dsig:X509Certificate>)/, "$1AAAA$2"),
      /could not be read/,
    ],
  ])("is invalid for %s", (_label, xml, reason) => {
    const result = verifyReceiptSignature(xml, { trustedFingerprints: trusted });
    expect(result.outcome).toBe(RECEIPT_SIGNATURE_INVALID);
    expect(result.reason).toMatch(reason);
  });
});

describe("parseTrustedFingerprints", () => {
  test("reads a comma-separated list in colon or bare hex form and ignores blanks", () => {
    const set = parseTrustedFingerprints(" aa:bb:cc , DDEEFF ,,");
    expect([...set]).toEqual(["AABBCC", "DDEEFF"]);
    expect(parseTrustedFingerprints(undefined).size).toBe(0);
  });
});
