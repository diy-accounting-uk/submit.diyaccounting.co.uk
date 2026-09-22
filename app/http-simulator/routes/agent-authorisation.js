// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/agent-authorisation.js
// HMRC Agent Authorisation API
// Handles: POST /agents/{arn}/invitations, GET and DELETE /agents/{arn}/invitations/{invitationId},
// GET /agents/{arn}/relationships

import { randomUUID } from "crypto";

// In-memory invitations, reset whenever the simulator process restarts - the same lifetime as
// every other in-memory store this simulator keeps.
const invitations = new Map();

// Deterministic set of client identifiers the simulator treats as already having a relationship
// with any agent, so GET /agents/{arn}/relationships has something to answer besides 404 without
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

  // GET /agents/{arn}/relationships
  app.get("/agents/:arn/relationships", (req, res) => {
    const { arn } = req.params;
    const { service, clientIdType, clientId } = req.query;
    console.log(`[http-simulator:agent-authorisation] GET /agents/${arn}/relationships service=${service} clientId=${clientId}`);

    if (!isValidArn(arn) || !service || !clientIdType || !clientId) {
      return res.status(400).json({ code: "INVALID_REQUEST", message: "service, clientIdType and clientId are required" });
    }

    if (!PRE_AUTHORISED_CLIENT_IDS.has(clientId)) {
      return res.status(404).json({ code: "RELATIONSHIP_NOT_FOUND", message: "No active relationship was found" });
    }

    res.json({ arn, service, clientIdType, clientId, authorisedRelationship: true });
  });
}
