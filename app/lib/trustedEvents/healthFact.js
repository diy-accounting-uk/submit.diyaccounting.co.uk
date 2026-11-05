// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/trustedEvents/healthFact.js
//
// An AWS Health event from the default bus, turned into a fact. Public service events, backup
// events and pages after the first are not account notices and are skipped.

const DESCRIPTION_LIMIT = 4000;
const ENTITY_LIMIT = 20;

function describeEntities(entities) {
  const values = (entities || []).map((entity) => entity.entityValue).filter(Boolean);
  if (values.length === 0) return "none";
  const shown = values.slice(0, ENTITY_LIMIT).join(", ");
  return values.length > ENTITY_LIMIT ? `${shown} and ${values.length - ENTITY_LIMIT} more` : shown;
}

export function healthFactFromEvent(event) {
  const detail = event.detail || {};
  if (detail.eventScopeCode === "PUBLIC") return { skip: true, reason: "public service event" };
  if (detail.backupEvent === true || detail.backupEvent === "true") return { skip: true, reason: "backup event" };
  if (detail.page !== undefined && String(detail.page) !== "1") return { skip: true, reason: "page after the first" };
  if (!detail.eventArn) throw new Error("Health event has no eventArn");
  if (!detail.affectedAccount) throw new Error("Health event has no affectedAccount");

  const optional = (name, value) => (value ? [[name, value]] : []);
  return {
    source: "aws.health",
    sourceLabel: "health",
    key: `health:${detail.affectedAccount}:${detail.eventArn}`,
    version: `${detail.statusCode}|${detail.lastUpdatedTime}`,
    subject: detail.eventTypeCode,
    scopeInTitle: true,
    region: detail.eventRegion || event.region,
    lines: [
      ["Service", detail.service],
      ["Event type", detail.eventTypeCode],
      ["Category", detail.eventTypeCategory],
      ["Status", detail.statusCode],
      ["Start", detail.startTime],
      ...optional("End", detail.endTime),
      ...optional("Actionability", detail.actionability),
      ["Event ARN", detail.eventArn],
      ["Affected entities", describeEntities(detail.affectedEntities)],
    ],
    description: (detail.eventDescription?.[0]?.latestDescription || "").slice(0, DESCRIPTION_LIMIT) || undefined,
  };
}
