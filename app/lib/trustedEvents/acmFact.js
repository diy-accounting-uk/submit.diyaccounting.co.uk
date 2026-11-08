// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/trustedEvents/acmFact.js
//
// An ACM certificate event from the default bus, with the certificate that DescribeCertificate
// returns, turned into a fact. A certificate that is gone or in use by nothing opens nothing.

const DAY_MS = 24 * 60 * 60 * 1000;
const APPROACHING_BUCKETS = [30, 15, 7, 3, 1, 0];

/** The smallest bucket at or above `days`, or null when `days` is above every bucket. */
export function bucketFor(days, buckets) {
  const ascending = [...buckets].sort((a, b) => a - b);
  const bucket = ascending.find((candidate) => candidate >= days);
  return bucket === undefined ? null : bucket;
}

const dateOnly = (value) => new Date(value).toISOString().slice(0, 10);

function daysToExpiry(event, notAfter) {
  const reported = event.detail?.DaysToExpiry;
  if (typeof reported === "number") return reported;
  return Math.floor((new Date(notAfter).getTime() - new Date(event.time).getTime()) / DAY_MS);
}

function versionFor(detailType, days, certificate) {
  if (detailType === "ACM Certificate Expired") return { version: "expired", phrase: "expired" };
  if (detailType === "ACM Certificate Revoked") return { version: "revoked", phrase: "revoked" };
  const bucket = bucketFor(days, APPROACHING_BUCKETS);
  if (bucket === null) return null;
  if (detailType === "ACM Certificate Renewal Action Required") {
    return { version: `renewal:${certificate.RenewalSummary?.RenewalStatusReason}:${bucket}`, phrase: "needs renewal action" };
  }
  return { version: `days:${bucket}`, phrase: `expires in ${days} days` };
}

/**
 * @param {Object} event - the EventBridge event
 * @param {Object|null} certificate - the Certificate from DescribeCertificate, or null when ACM
 *   answered ResourceNotFoundException
 */
export function acmFactFromEvent(event, certificate) {
  if (!certificate) return { skip: true, reason: "certificate not found" };
  if (!certificate.InUseBy || certificate.InUseBy.length === 0) return { skip: true, reason: "certificate not in use" };

  const detailType = event["detail-type"];
  const arn = event.resources[0];
  const days = daysToExpiry(event, certificate.NotAfter);
  const chosen = versionFor(detailType, days, certificate);
  if (!chosen) return { skip: true, reason: "days to expiry above the first bucket" };

  const optional = (name, value) => (value ? [[name, value]] : []);
  return {
    source: "aws.acm",
    sourceLabel: "acm",
    key: `acm:${arn}:${dateOnly(certificate.NotAfter)}`,
    version: chosen.version,
    subject: `${certificate.DomainName} certificate ${chosen.phrase}`,
    scopeInTitle: true,
    region: arn.split(":")[3],
    lines: [
      ["Detail type", detailType],
      ["Certificate ARN", arn],
      ["Common name", certificate.DomainName],
      ["Not after", new Date(certificate.NotAfter).toISOString()],
      ["Days to expiry", days],
      ...optional("Renewal status", certificate.RenewalSummary?.RenewalStatus),
      ...(detailType === "ACM Certificate Renewal Action Required"
        ? optional("Renewal reason", certificate.RenewalSummary?.RenewalStatusReason)
        : []),
      ["In use by", certificate.InUseBy.length],
    ],
  };
}
