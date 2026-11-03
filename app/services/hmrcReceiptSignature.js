// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcReceiptSignature.js
// Checks the XML digital signature on the receipt (SuccessResponse/IRmarkReceipt) that HMRC's
// Transaction Engine returns. The Document Submission Protocol makes this check optional, so its
// outcome is logged and stored beside the receipt and never changes an accepted return.
//
// The receipt carries its own signing certificate in KeyInfo/X509Data. HMRC publishes no
// certificate for it (protocol version 1.2 removed the certificate references), so the signature is
// verified against the embedded key and the certificate is then compared with a list of trusted
// SHA-256 fingerprints. With an empty list every well-signed receipt is "unknown-certificate".
//
// Node's crypto verifies the signature over SignedInfo, which xmlCanonical.js canonicalises
// (Canonical XML 1.0, the only canonicalisation the receipt names). No XML-signature library is
// needed because the receipt has one fixed shape and the existing canonicaliser already carries
// the IRmark.

import { createHash, createVerify, publicDecrypt, constants, X509Certificate } from "node:crypto";
import { parseXmlTree, canonicaliseElement, childElement, localName } from "../lib/xmlCanonical.js";

const CANONICAL_XML_1_0 = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const SIGNATURE_ALGORITHMS = {
  "http://www.w3.org/2000/09/xmldsig#rsa-sha1": { verify: "RSA-SHA1", digest: "sha1" },
  "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256": { verify: "RSA-SHA256", digest: "sha256" },
};

export const RECEIPT_SIGNATURE_VALID = "valid";
export const RECEIPT_SIGNATURE_INVALID = "invalid";
export const RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED = "digest-not-reproduced";
export const RECEIPT_SIGNATURE_UNKNOWN_CERTIFICATE = "unknown-certificate";
export const RECEIPT_SIGNATURE_EXPIRED_CERTIFICATE = "expired-certificate";

function elementText(element) {
  return element.children
    .filter((child) => child.type === "text")
    .map((child) => child.value)
    .join("");
}

function findDescendant(element, name) {
  for (const child of element.children) {
    if (child.type !== "element") continue;
    if (localName(child.name) === name) return child;
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return undefined;
}

/**
 * A certificate fingerprint as 64 upper-case hex digits, from the colon-separated form Node and
 * openssl print or from bare hex.
 * @param {string} fingerprint
 * @returns {string}
 */
export function normaliseFingerprint(fingerprint) {
  return fingerprint.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

/**
 * The trusted receipt certificate fingerprints from a comma-separated list.
 * @param {string|undefined} list - e.g. the HMRC_RECEIPT_CERTIFICATE_SHA256 setting
 * @returns {Set<string>}
 */
export function parseTrustedFingerprints(list) {
  return new Set((list || "").split(",").map(normaliseFingerprint).filter(Boolean));
}

function invalid(reason, certificate) {
  return { outcome: RECEIPT_SIGNATURE_INVALID, reason, ...describeCertificate(certificate) };
}

function describeCertificate(certificate) {
  if (!certificate) return {};
  return {
    certificateSha256: normaliseFingerprint(certificate.fingerprint256),
    certificateSubject: certificate.subject.replace(/\n/g, ", "),
    certificateValidFrom: new Date(certificate.validFrom).toISOString(),
    certificateValidTo: new Date(certificate.validTo).toISOString(),
  };
}

/**
 * Check the signature on a Transaction Engine receipt.
 *
 * @param {string} responseXml - the whole GovTalk response that carries the SuccessResponse
 * @param {object} [options]
 * @param {Set<string>} [options.trustedFingerprints] - SHA-256 fingerprints of receipt certificates to trust
 * @param {Date} [options.now]
 * @returns {{outcome: "valid"|"invalid"|"digest-not-reproduced"|"unknown-certificate"|"expired-certificate", reason?: string, computedDigest?: string, signedDigest?: string, canonicalization?: string, certificateSha256?: string, certificateSubject?: string, certificateValidFrom?: string, certificateValidTo?: string}}
 */
export function verifyReceiptSignature(responseXml, { trustedFingerprints = new Set(), now = new Date() } = {}) {
  let certificate;
  try {
    const signature = findDescendant(parseXmlTree(responseXml), "Signature");
    if (!signature) return invalid("The receipt carries no signature");
    const signedInfo = childElement(signature, "SignedInfo");
    const signatureValue = childElement(signature, "SignatureValue");
    const certificateElement = findDescendant(signature, "X509Certificate");
    if (!signedInfo || !signatureValue || !certificateElement)
      return invalid("The signature lacks SignedInfo, SignatureValue or a certificate");

    const canonicalization = childElement(signedInfo, "CanonicalizationMethod")?.attributes.find((a) => a.name === "Algorithm")?.value;
    if (canonicalization !== CANONICAL_XML_1_0) return invalid(`Unsupported canonicalization ${canonicalization}`);
    const signatureMethod = childElement(signedInfo, "SignatureMethod")?.attributes.find((a) => a.name === "Algorithm")?.value;
    const algorithm = SIGNATURE_ALGORITHMS[signatureMethod];
    if (!algorithm) return invalid(`Unsupported signature method ${signatureMethod}`);

    certificate = new X509Certificate(Buffer.from(elementText(certificateElement).replace(/\s+/g, ""), "base64"));
    const canonicalSignedInfo = canonicaliseElement(signedInfo);
    const computedDigest = createHash(algorithm.digest).update(canonicalSignedInfo, "utf8").digest("hex");
    const signatureBytes = Buffer.from(elementText(signatureValue).replace(/\s+/g, ""), "base64");
    // The signature's own digest is the tail of its PKCS#1 DigestInfo. When it differs from the
    // digest of SignedInfo as canonicalised here, the signed bytes are not reproduced, which says
    // nothing about whether the receipt is genuine.
    const signedDigest = publicDecrypt({ key: certificate.publicKey, padding: constants.RSA_PKCS1_PADDING }, signatureBytes)
      .subarray(-createHash(algorithm.digest).digest().length)
      .toString("hex");
    if (signedDigest !== computedDigest) {
      return {
        outcome: RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED,
        computedDigest,
        signedDigest,
        canonicalization,
        ...describeCertificate(certificate),
      };
    }
    const verifier = createVerify(algorithm.verify);
    verifier.update(canonicalSignedInfo, "utf8");
    if (!verifier.verify(certificate.publicKey, elementText(signatureValue).replace(/\s+/g, ""), "base64")) {
      return invalid("The signature does not match SignedInfo", certificate);
    }
  } catch (error) {
    return invalid(`The signature could not be read: ${error.message}`, certificate);
  }

  const details = describeCertificate(certificate);
  if (!trustedFingerprints.has(details.certificateSha256)) return { outcome: RECEIPT_SIGNATURE_UNKNOWN_CERTIFICATE, ...details };
  if (now < new Date(certificate.validFrom) || now > new Date(certificate.validTo)) {
    return { outcome: RECEIPT_SIGNATURE_EXPIRED_CERTIFICATE, ...details };
  }
  return { outcome: RECEIPT_SIGNATURE_VALID, ...details };
}
