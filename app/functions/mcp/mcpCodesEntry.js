// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-20 Take Companies House codes on a page instead of in the chat
// - **Use when:** a Companies House filing through the MCP needs the company authentication code or a director's personal code, or the codes link, its entry or its seal needs tracing.
// - **Does:** request_companies_house_codes posts to `/api/v1/mcp/codes-entries` and answers a link to companies-house/mcpCodes.html. The user types the codes there; mcpCodesEntry.js seals them with AES-256-GCM under a key derived from the MCP blob key and stores them in the mcp-sessions table for ten minutes. The accounts, confirmation statement and filing data routes take the entry by `codesEntryId` once (applyCodesEntry deletes it as it reads it, for its owner only), so no tool argument holds a code. With `clientIds`, the entry is a batch entry: the tool names each practice client from the client list, the page asks for one company authentication code per client by name, and filling it stores each client's code sealed as an item of its own under `codes:<entryId>/<clientId>`. The filing route deletes only the item of the client named by the body's `clientId` (takeCodesEntryForClient, DeleteItem as before, so no infra change), so `run_for_clients` with `submit_micro_entity_accounts_sandbox` passes one `codesEntryId` for every client (as does `submit_small_company_accounts_sandbox`). A batch entry is for `accounts` and `confirmation-statement-data`. A client-scoped accounts filing whose client lacks the `CH-ACCOUNTS` key is authorised by its `codesEntryId`: the entry must hold that client's codes (a batch entry item) or have been minted for the client's own company number, else the route answers 400 for the entry or 403 `client-not-authorised` when none is sent.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/mcp/mcpCodesEntry.js`; `app/services/companiesHouseCodesEntry.js`; `app/data/dynamoDbCodesEntryRepository.js`; `mcp/lib/submit-tools.js:requestCompaniesHouseCodes`
// - **Files:** app/functions/mcp/mcpCodesEntry.js, app/services/companiesHouseCodesEntry.js, app/data/dynamoDbCodesEntryRepository.js, app/lib/codesSeal.js, app/lib/mcpBlobKey.js, mcp/lib/server.js, mcp/lib/batch-tools.js, web/public/companies-house/mcpCodes.html, web/public/companies-house/mcpCodes.page.js, infra/main/java/co/uk/diyaccounting/submit/stacks/McpStack.java, infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java
// - **Keywords:** companies house codes, company authentication code, personal code, codes entry, codesEntryId, request_companies_house_codes, mcpCodes, codes link
// - **Related:** MCP-07, MCP-18
// @end-capability

// app/functions/mcp/mcpCodesEntry.js
// The Companies House codes entry: a tool call mints an entry (POST, signed in) and gets a link;
// the user opens the link and types the codes on the page (GET to read what to ask for, PUT to
// store the codes sealed). A filing route takes the entry by its id. The entry id is the
// capability on the link: the GET and PUT routes are public, and neither answers a code.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  parseRequestBody,
  http200OkResponse,
  http201CreatedResponse,
  http400BadRequestResponse,
  http401UnauthorizedResponse,
  http404NotFoundResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { isValidCompanyNumber, isValidCompaniesHousePersonalCode } from "../../services/companiesHouseApi.js";
import { createCodesEntry, getCodesEntry, fillCodesEntry, fillCodesEntryForClients } from "../../data/dynamoDbCodesEntryRepository.js";
import { sealCodes } from "../../lib/codesSeal.js";
import { getClient } from "../../data/dynamoDbPracticeClientRepository.js";

const logger = createLogger({ source: "app/functions/mcp/mcpCodesEntry.js" });

const KINDS = ["accounts", "confirmation-statement", "confirmation-statement-data"];
const MIN_COMPANY_AUTH_CODE_LENGTH = 6;
const MAX_COMPANY_AUTH_CODE_LENGTH = 8;
const MAX_DIRECTORS = 20;
const MAX_CLIENTS = 100;
const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODES_PATH = "/api/v1/mcp/codes-entries";
const CODES_PAGE_PATH = "/companies-house/mcpCodes.html";

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", CODES_PATH, ingestHandler);
  registerLambdaRoute(app, "get", `${CODES_PATH}/:entryId`, ingestHandler);
  registerLambdaRoute(app, "put", `${CODES_PATH}/:entryId`, ingestHandler);
}
/* v8 ignore stop */

function pageUrl(entryId) {
  return new URL(`${CODES_PAGE_PATH}?entry=${entryId}`, process.env.DIY_SUBMIT_BASE_URL).toString();
}

function directorsFromBody(kind, directors, errorMessages) {
  if (kind !== "confirmation-statement") return [];
  if (!Array.isArray(directors) || directors.length === 0 || directors.length > MAX_DIRECTORS) {
    errorMessages.push(`directors must list 1 to ${MAX_DIRECTORS} directors for a confirmation statement`);
    return [];
  }
  return directors.map((director, index) => {
    const forename = typeof director?.forename === "string" ? director.forename.trim() : "";
    const surname = typeof director?.surname === "string" ? director.surname.trim() : "";
    if (!forename || !surname) errorMessages.push(`directors[${index}] needs a forename and a surname`);
    return { forename, surname };
  });
}

function clientsFromBody(kind, clients, errorMessages) {
  if (clients === undefined) return undefined;
  if (kind === "confirmation-statement") {
    errorMessages.push(
      "clients is for accounts and confirmation-statement-data; a confirmation statement is requested one company at a time",
    );
    return undefined;
  }
  if (!Array.isArray(clients) || clients.length === 0 || clients.length > MAX_CLIENTS) {
    errorMessages.push(`clients must list 1 to ${MAX_CLIENTS} practice clients`);
    return undefined;
  }
  const seen = new Set();
  return clients.map((client, index) => {
    const clientId = typeof client?.clientId === "string" ? client.clientId.trim() : "";
    if (!clientId) errorMessages.push(`clients[${index}] needs a clientId`);
    if (seen.has(clientId)) errorMessages.push(`clients[${index}] repeats clientId ${clientId}`);
    seen.add(clientId);
    return { clientId };
  });
}

// Each client must be on the caller's own practice list; its name comes from the stored client.
async function practiceClientsFor(sub, requested, errorMessages) {
  const stored = await Promise.all(requested.map(({ clientId }) => getClient(sub, clientId)));
  const unlisted = requested.filter((_, index) => !stored[index]?.displayName).map(({ clientId }) => clientId);
  if (unlisted.length > 0) {
    errorMessages.push(`clients names ids that are not in your practice's client list: ${unlisted.join(", ")}`);
    return undefined;
  }
  return requested.map(({ clientId }, index) => ({
    clientId,
    displayName: stored[index].displayName,
    ...(stored[index].companyNumber ? { companyNumber: stored[index].companyNumber } : {}),
  }));
}

async function mint(event, request, responseHeaders) {
  const user = extractUserFromAuthorizerContext(event);
  if (!user) return http401UnauthorizedResponse({ request, headers: responseHeaders, message: "Authentication required" });

  const body = parseRequestBody(event) || {};
  const errorMessages = [];
  if (!KINDS.includes(body.kind)) errorMessages.push(`kind must be one of ${KINDS.join(", ")}`);
  const requestedClients = clientsFromBody(body.kind, body.clients, errorMessages);
  const { valid, normalised } = isValidCompanyNumber(body.companyNumber);
  if (!requestedClients && !valid) errorMessages.push("Invalid company number - must be 8 characters");
  const directors = directorsFromBody(body.kind, body.directors, errorMessages);
  if (errorMessages.length > 0) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: errorMessages.join("; "),
      error: { errors: errorMessages },
    });
  }

  await initializeSalt();
  const clients = requestedClients ? await practiceClientsFor(user.sub, requestedClients, errorMessages) : undefined;
  if (errorMessages.length > 0) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: errorMessages.join("; "),
      error: { errors: errorMessages },
    });
  }
  const entry = await createCodesEntry({
    hashedSub: hashSub(user.sub),
    kind: body.kind,
    companyNumber: clients ? undefined : normalised,
    directors,
    clients,
  });
  return http201CreatedResponse({
    request,
    headers: responseHeaders,
    data: { entryId: entry.entryId, url: pageUrl(entry.entryId), expiresAt: new Date(entry.ttl * 1000).toISOString() },
  });
}

async function read(entryId, request, responseHeaders) {
  const entry = await getCodesEntry(entryId);
  if (!entry)
    return http404NotFoundResponse({
      request,
      headers: responseHeaders,
      message: "This codes link has expired or does not exist",
      error: {},
    });
  return http200OkResponse({
    request,
    headers: responseHeaders,
    data: {
      state: entry.state,
      kind: entry.kind,
      companyNumber: entry.companyNumber,
      directors: entry.directors,
      clients: entry.clients ?? [],
      expiresAt: new Date(entry.ttl * 1000).toISOString(),
    },
  });
}

function isValidCompanyAuthCode(code) {
  return code.length >= MIN_COMPANY_AUTH_CODE_LENGTH && code.length <= MAX_COMPANY_AUTH_CODE_LENGTH;
}

const INVALID_COMPANY_AUTH_CODE = `Invalid companyAuthCode - must be ${MIN_COMPANY_AUTH_CODE_LENGTH} to ${MAX_COMPANY_AUTH_CODE_LENGTH} characters`;

async function fillForClients(entry, entryId, body, request, responseHeaders) {
  const given = new Map();
  for (const item of Array.isArray(body.clients) ? body.clients : []) {
    if (typeof item?.clientId === "string")
      given.set(item.clientId, typeof item.companyAuthCode === "string" ? item.companyAuthCode.trim() : "");
  }
  const errorMessages = [];
  for (const client of entry.clients) {
    if (!given.has(client.clientId)) errorMessages.push(`clients must hold a code for ${client.displayName}`);
    else if (!isValidCompanyAuthCode(given.get(client.clientId)))
      errorMessages.push(`${INVALID_COMPANY_AUTH_CODE} (${client.displayName})`);
  }
  if (errorMessages.length > 0) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: errorMessages.join("; "),
      error: { errors: errorMessages },
    });
  }
  const sealedByClient = {};
  for (const client of entry.clients) {
    sealedByClient[client.clientId] = await sealCodes(
      { companyAuthCode: given.get(client.clientId), personalCodes: [] },
      `${entryId}/${client.clientId}`,
    );
  }
  if (!(await fillCodesEntryForClients(entryId, sealedByClient))) {
    return http409ConflictResponse({
      request,
      headers: responseHeaders,
      message: "These codes were already entered for this link",
      error: {},
    });
  }
  return http200OkResponse({ request, headers: responseHeaders, data: { state: "filled" } });
}

async function fill(event, entryId, request, responseHeaders) {
  const entry = await getCodesEntry(entryId);
  if (!entry)
    return http404NotFoundResponse({
      request,
      headers: responseHeaders,
      message: "This codes link has expired or does not exist",
      error: {},
    });

  const body = parseRequestBody(event) || {};
  if (entry.clients?.length) return await fillForClients(entry, entryId, body, request, responseHeaders);
  const errorMessages = [];
  const companyAuthCode = typeof body.companyAuthCode === "string" ? body.companyAuthCode.trim() : "";
  if (!isValidCompanyAuthCode(companyAuthCode)) errorMessages.push(INVALID_COMPANY_AUTH_CODE);
  const personalCodes = [];
  if (entry.kind === "confirmation-statement") {
    const given = Array.isArray(body.personalCodes) ? body.personalCodes : [];
    if (given.length !== entry.directors.length) {
      errorMessages.push(`personalCodes must hold one code for each of the ${entry.directors.length} directors, in order`);
    } else {
      given.forEach((code, index) => {
        const { valid, normalised } = isValidCompaniesHousePersonalCode(code);
        if (!valid) errorMessages.push(`Invalid personalCodes[${index}] - must be the 11-character Companies House personal code`);
        personalCodes.push(normalised);
      });
    }
  }
  if (errorMessages.length > 0) {
    return http400BadRequestResponse({
      request,
      headers: responseHeaders,
      message: errorMessages.join("; "),
      error: { errors: errorMessages },
    });
  }

  const sealed = await sealCodes({ companyAuthCode, personalCodes }, entryId);
  if (!(await fillCodesEntry(entryId, sealed))) {
    return http409ConflictResponse({
      request,
      headers: responseHeaders,
      message: "These codes were already entered for this link",
      error: {},
    });
  }
  return http200OkResponse({ request, headers: responseHeaders, data: { state: "filled" } });
}

export async function ingestHandler(event) {
  validateEnv(["MCP_SESSIONS_DYNAMODB_TABLE_NAME", "DIY_SUBMIT_BASE_URL"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  const method = event?.requestContext?.http?.method;
  const entryId = event?.pathParameters?.entryId;

  try {
    if (method === "POST" && !entryId) return await mint(event, request, responseHeaders);
    if (entryId !== undefined && !ENTRY_ID.test(entryId)) {
      return http404NotFoundResponse({
        request,
        headers: responseHeaders,
        message: "This codes link has expired or does not exist",
        error: {},
      });
    }
    if (method === "GET" && entryId) return await read(entryId, request, responseHeaders);
    if (method === "PUT" && entryId) return await fill(event, entryId, request, responseHeaders);
    return http404NotFoundResponse({ request, headers: responseHeaders, message: "Not found", error: {} });
  } catch (error) {
    logger.error({ message: "Codes entry request failed", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({ request, headers: responseHeaders, message: "Internal server error", error: {} });
  }
}
