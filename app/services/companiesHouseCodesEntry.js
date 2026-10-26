// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseCodesEntry.js
// Lets a Companies House filing route take its codes from an entry the user filled on the codes
// page, so a tool call carries the entry id and the codes never pass through the chat. The route
// takes the entry once: the entry is deleted as it is read. An entry minted for a batch of clients
// holds one set of codes for each client; a route takes the codes of the client named by the
// body's clientId and deletes only those.

import { parseRequestBody } from "../lib/httpResponseHelper.js";
import { hashSub } from "./subHasher.js";
import { takeCodesEntry, takeCodesEntryForClient } from "../data/dynamoDbCodesEntryRepository.js";
import { openCodes } from "../lib/codesSeal.js";

const UNUSABLE_ENTRY = "codesEntryId names no entry that is filled, unexpired, unused and yours - ask for a new codes link";

/**
 * Replaces codesEntryId in the request body with the codes the entry holds.
 * A client-scoped request passes clientScope. An entry then applies only when it holds codes for that
 * client (a batch entry item) or was minted for the client's own company number; any other entry fails.
 *
 * @param {object} event - the Lambda event
 * @param {{userSub: string, kind: "accounts"|"confirmation-statement"|"confirmation-statement-data", clientScope?: {companyNumber?: string}}} options
 * @returns {Promise<{event: object}|{failure: string}>} the event to read the codes from, or why it cannot be had
 */
export async function applyCodesEntry(event, { userSub, kind, clientScope }) {
  const body = parseRequestBody(event);
  const entryId = body?.codesEntryId;
  if (entryId === undefined) return { event };
  if (typeof entryId !== "string" || !entryId) return { failure: "codesEntryId must be a string" };
  if (body.companyAuthCode !== undefined) return { failure: "Send either codesEntryId or companyAuthCode, not both" };

  const hashedSub = hashSub(userSub);
  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : undefined;
  const clientEntry = clientId ? await takeCodesEntryForClient(entryId, hashedSub, clientId) : null;
  const entry = clientEntry ?? (await takeCodesEntry(entryId, hashedSub));
  if (!entry || entry.kind !== kind) return { failure: UNUSABLE_ENTRY };
  if (clientScope && !clientEntry) {
    const clientCompany = clientScope.companyNumber ? String(clientScope.companyNumber).trim().toUpperCase() : undefined;
    if (!clientCompany || entry.companyNumber !== clientCompany) {
      return { failure: "codesEntryId was minted for another company number" };
    }
  }
  const requestedCompanyNumber = body.companyNumber ?? event.pathParameters?.companyNumber;
  if (entry.companyNumber && requestedCompanyNumber && String(requestedCompanyNumber).trim().toUpperCase() !== entry.companyNumber) {
    return { failure: "codesEntryId was minted for another company number" };
  }

  const { companyAuthCode, personalCodes } = await openCodes(entry.sealed, clientEntry ? `${entryId}/${clientId}` : entryId);
  const merged = { ...body, companyAuthCode };
  delete merged.codesEntryId;
  if (kind === "confirmation-statement") {
    if (!Array.isArray(body.directors) || body.directors.length !== entry.directors.length) {
      return { failure: `directors must list the ${entry.directors.length} directors the codes link was minted for, in the same order` };
    }
    merged.directors = body.directors.map((director, index) => ({ ...director, personalCode: personalCodes[index] }));
  }
  return { event: { ...event, body: JSON.stringify(merged) } };
}
