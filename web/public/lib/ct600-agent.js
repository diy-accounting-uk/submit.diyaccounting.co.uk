// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/ct600-agent.js
// The pure parts of a practice filing a client's CT600 as its agent: the client choices, the stop
// for a client row that lacks what the return needs, the request fields, and the practice name the
// browser remembers.

export const DEFAULT_AGENT_STATUS = "Agent";
export const PRACTICE_NAME_MAX_LENGTH = 35;
const PRACTICE_NAME_STORAGE_KEY = "ct600PracticeName";

/**
 * The clients a practice can file for: each one that is not archived, with its choice label.
 * @param {object[]} clients - the rows of GET /api/v1/practice/clients
 * @returns {{clientId: string, label: string}[]}
 */
export function clientChoices(clients) {
  return clients
    .filter((client) => !client.archivedAt)
    .map((client) => {
      const number = client.identifiers?.companyNumber;
      return { clientId: client.clientId, label: number ? `${client.displayName} (${number})` : client.displayName };
    });
}

/**
 * What stops the form for a client, or null when the row has the UTR and the company number.
 * @param {object} client
 * @returns {string|null}
 */
export function clientFilingStop(client) {
  if (!/^\d{10}$/.test(String(client.identifiers?.utr ?? ""))) {
    return `Add the company's UTR to ${client.displayName} on Practice clients`;
  }
  if (!client.identifiers?.companyNumber) return `Add the company number to ${client.displayName} on Practice clients`;
  return null;
}

/**
 * The fields a client filing adds to the preview and submit requests.
 * @param {object|null} client - the chosen client row, or null for the practice's own company
 * @param {{practiceName: string, authorisationConfirmed: boolean}} agent
 * @returns {object}
 */
export function agentRequestFields(client, { practiceName, authorisationConfirmed }) {
  if (!client) return {};
  return { clientId: client.clientId, agent: { practiceName: practiceName.trim(), authorisationConfirmed } };
}

export function rememberedPracticeName() {
  try {
    return localStorage.getItem(PRACTICE_NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberPracticeName(name) {
  try {
    localStorage.setItem(PRACTICE_NAME_STORAGE_KEY, name);
  } catch {
    // The name is typed again next time.
  }
}
