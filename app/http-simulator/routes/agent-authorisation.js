// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-05 Simulate HMRC Agent Authorisation and fraud-prevention headers
// - **Use when:** a test needs an agent-client invitation flow or must check Gov-Client/Gov-Vendor headers.
// - **Does:** apiEndpoint in agent-authorisation.js implements POST /agents/{arn}/invitations, GET and DELETE .../invitations/{id}, and GET /agents/{arn}/relationships, tracking invitation status in memory. apiEndpoint in fraud-headers.js answers GET /test/fraud-prevention-headers/validate, returning VALID, VALID_WITH_WARNINGS or INVALID.
// - **Run:** `import { apiEndpoint } from "app/http-simulator/routes/agent-authorisation.js"`; `import { apiEndpoint } from "app/http-simulator/routes/fraud-headers.js"`
// - **Entry:** `app/http-simulator/routes/agent-authorisation.js:apiEndpoint`; `app/http-simulator/routes/fraud-headers.js:apiEndpoint`
// - **Files:** app/http-simulator/routes/agent-authorisation.js, app/http-simulator/routes/fraud-headers.js
// - **Keywords:** agent authorisation, invitation, client relationship, fraud prevention headers, gov-client, gov-vendor, header validation
// - **Related:** DEV-03
// @end-capability

// app/http-simulator/routes/agent-authorisation.js
// HMRC Agent Authorisation API
// Handles: POST /agents/{arn}/invitations, GET and DELETE /agents/{arn}/invitations/{invitationId},
// POST /agents/{arn}/relationships

import { randomUUID } from "crypto";

// In-memory invitations, reset whenever the simulator process restarts - the same lifetime as
// every other in-memory store this simulator keeps.
const invitations = new Map();

// Deterministic set of client identifiers the simulator treats as already having a relationship
// with any agent, so POST /agents/{arn}/relationships has something to answer besides 404 without
// requiring an invitation to have been accepted first.
const PRE_AUTHORISED_CLIENT_IDS = new Set(["999999999", "AB123456C"]);

function isValidArn(arn) {
  return typeof arn === "string" && arn.length > 0;
}

export function apiEndpoint(app) {
  // POST /agents/{arn}/invitations
  app.post("/agents/:arn/invitations", (req, res) => {
    const { arn } = req.params;
    const { service, clientType, clientIdType, clientId, knownFact } = req.body || {};

    console.log(`[http-simulator:agent-authorisation] POST /agents/${arn}/invitations service=${service} clientId=${clientId}`);

    if (!isValidArn(arn)) {
      return res.status(400).json({ code: "ARN_INVALID", message: "The provided agent reference number is invalid" });
    }
    if (!Array.isArray(service) || service.length === 0 || !clientIdType || !clientId || !knownFact) {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "service, clientIdType, clientId and knownFact are required",
      });
    }

    const invitationId = randomUUID();
    invitations.set(invitationId, {
      arn,
      service,
      clientType,
      clientIdType,
      clientId,
      knownFact,
      status: "Pending",
      createdAt: new Date().toISOString(),
    });

    res.setHeader("Location", `/agents/${arn}/invitations/${invitationId}`);
    res.status(204).send();
  });

  // GET /agents/{arn}/invitations/{invitationId}
  app.get("/agents/:arn/invitations/:invitationId", (req, res) => {
    const { arn, invitationId } = req.params;
    console.log(`[http-simulator:agent-authorisation] GET /agents/${arn}/invitations/${invitationId}`);

    const invitation = invitations.get(invitationId);
    if (!invitation || invitation.arn !== arn) {
      return res.status(404).json({ code: "INVITATION_NOT_FOUND", message: "The specified invitation was not found" });
    }

    res.json({
      arn: invitation.arn,
      service: invitation.service,
      status: invitation.status,
      created: invitation.createdAt,
    });
  });

  // DELETE /agents/{arn}/invitations/{invitationId}
  app.delete("/agents/:arn/invitations/:invitationId", (req, res) => {
    const { arn, invitationId } = req.params;
    console.log(`[http-simulator:agent-authorisation] DELETE /agents/${arn}/invitations/${invitationId}`);

    const invitation = invitations.get(invitationId);
    if (!invitation || invitation.arn !== arn) {
      return res.status(404).json({ code: "INVITATION_NOT_FOUND", message: "The specified invitation was not found" });
    }
    if (invitation.status !== "Pending") {
      return res.status(409).json({ code: "INVALID_INVITATION_STATUS", message: "Only a pending invitation can be cancelled" });
    }

    invitation.status = "Cancelled";
    res.status(204).send();
  });

  // POST /agents/{arn}/relationships
  app.post("/agents/:arn/relationships", (req, res) => {
    const { arn } = req.params;
    const { service, clientIdType, clientId, knownFact } = req.body || {};
    console.log(`[http-simulator:agent-authorisation] POST /agents/${arn}/relationships service=${service} clientId=${clientId}`);

    if (!isValidArn(arn) || !Array.isArray(service) || service.length === 0 || !clientIdType || !clientId || !knownFact) {
      return res.status(400).json({
        code: "INVALID_REQUEST",
        message: "service, clientIdType, clientId and knownFact are required",
      });
    }

    if (!PRE_AUTHORISED_CLIENT_IDS.has(clientId)) {
      return res.status(404).json({ code: "RELATIONSHIP_NOT_FOUND", message: "No active relationship was found" });
    }

    res.json({ arn, service, clientIdType, clientId, authorisedRelationship: true });
  });
}
