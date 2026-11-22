// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseDocumentApi.js
// Client for Companies House's Document API, which serves the filed documents a filing history
// item links to, with the API key the public data client uses.

import { createLogger } from "../lib/logger.js";
import { DEFAULT_TIMEOUTS } from "../lib/httpFetch.js";
import { sendTextToCompaniesHouse } from "./companiesHouseSend.js";
import { buildCompaniesHouseHeaders, companiesHouseGetJson, sendWithApiKey } from "./companiesHouseApi.js";

const logger = createLogger({ source: "app/services/companiesHouseDocumentApi.js" });

function getCompaniesHouseDocumentBaseUrl() {
  const base = process.env.COMPANIES_HOUSE_DOCUMENT_BASE_URI;
  if (!base || String(base).trim() === "") {
    throw new Error("Missing required environment variable COMPANIES_HOUSE_DOCUMENT_BASE_URI");
  }
  return base;
}

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * The document id in a filing history item's links.document_metadata. Only the id is taken: the
 * Document API is called on its configured host, never on a host a response names.
 * @param {string} link
 * @returns {string|null}
 */
export function documentIdFromMetadataLink(link) {
  if (typeof link !== "string") return null;
  let pathname;
  try {
    pathname = new URL(link, "https://document-api.invalid").pathname;
  } catch {
    return null;
  }
  const match = pathname.match(/^\/document\/([^/]+)\/?$/);
  return match && DOCUMENT_ID_PATTERN.test(match[1]) ? match[1] : null;
}

/**
 * A filed document's metadata from the Document API: its resources list each content type it is
 * held in, with the length of each.
 * @param {string} documentId
 */
export async function companiesHouseDocumentMetadata(documentId) {
  return companiesHouseGetJson(getCompaniesHouseDocumentBaseUrl(), `/document/${documentId}`);
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * A filed document's content in one content type. The Document API answers 302 to the file, which
 * is fetched without the API key, or 406 when it holds no document of that type.
 * @param {string} documentId
 * @param {string} contentType - for example application/xhtml+xml
 * @returns {Promise<{ok: boolean, status: number, data: string, headers: object}>}
 */
export async function companiesHouseDocumentContent(documentId, contentType) {
  const requestUrl = `${getCompaniesHouseDocumentBaseUrl()}/document/${documentId}/content`;
  const answer = await sendWithApiKey((key) => {
    const headers = { ...buildCompaniesHouseHeaders(key), Accept: contentType };
    logger.info({ message: `Request to GET ${requestUrl}`, url: requestUrl, accept: contentType });
    return sendTextToCompaniesHouse(requestUrl, { method: "GET", headers, redirect: "manual" }, DEFAULT_TIMEOUTS.SHORT);
  });
  logger.info({ message: `Response from GET ${requestUrl}`, url: requestUrl, status: answer.status });
  if (!REDIRECT_STATUSES.has(answer.status)) {
    return { ok: answer.ok, status: answer.status, data: answer.ok ? answer.data : "", headers: answer.headers };
  }
  const location = answer.headers?.location;
  if (!location) {
    return { ok: false, status: 502, data: "", headers: answer.headers };
  }
  const fileUrl = new URL(location, requestUrl).toString();
  const file = await sendTextToCompaniesHouse(fileUrl, { method: "GET", headers: { Accept: contentType } }, DEFAULT_TIMEOUTS.SHORT, {
    api: "GET /document/{documentId}/file",
  });
  logger.info({ message: "Response from the Document API's file", status: file.status });
  return { ok: file.ok, status: file.status, data: file.ok ? file.data : "", headers: file.headers };
}
