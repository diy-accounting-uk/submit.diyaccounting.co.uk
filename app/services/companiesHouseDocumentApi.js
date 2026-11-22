// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseDocumentApi.js
// Client for Companies House's Document API, which serves the filed documents a filing history
// item links to, with the API key the public data client uses.

import { createLogger } from "../lib/logger.js";
import { DEFAULT_TIMEOUTS, HttpTimeoutError } from "../lib/httpFetch.js";
import { sendTextToCompaniesHouse } from "./companiesHouseSend.js";
import { buildCompaniesHouseHeaders, companiesHouseGetJson, sendWithApiKey } from "./companiesHouseApi.js";
import { loggedUrlOf } from "../lib/loggedPath.js";

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

const HOST_LABEL_PATTERN = /^[a-z0-9-]+$/;

// Amazon S3's regional hosts, path style (s3.<region>.amazonaws.com) or virtual-hosted style
// (<bucket>.s3.<region>.amazonaws.com), where the Document API keeps its files.
function isAmazonS3Host(hostname) {
  const labels = hostname.split(".");
  if (labels.length < 4 || !labels.every((label) => HOST_LABEL_PATTERN.test(label))) return false;
  const [s3, region, amazonaws, com] = labels.slice(-4);
  return s3 === "s3" && region.length > 0 && amazonaws === "amazonaws" && com === "com";
}

/**
 * Whether a content request's redirect may be followed: to Amazon S3 over https, or to the
 * configured Document API's own address, which serves the file itself in the simulator.
 * @param {URL} fileUrl
 */
export function isDocumentFileLocation(fileUrl) {
  if (fileUrl.origin === new URL(getCompaniesHouseDocumentBaseUrl()).origin) return true;
  return fileUrl.protocol === "https:" && fileUrl.port === "" && isAmazonS3Host(fileUrl.hostname);
}

function badGateway(headers) {
  return { ok: false, status: 502, data: "", headers };
}

/**
 * A filed document's content in one content type. The Document API answers 302 to the file, which
 * is fetched without the API key and only from the hosts isDocumentFileLocation allows, or 406 when
 * it holds no document of that type. A redirect anywhere else, or a further redirect from the file's
 * host, answers 502 and fetches nothing more. A body over maxBytes stops the read and answers
 * tooLarge; a request or body that does not arrive in time answers 504.
 * @param {string} documentId
 * @param {string} contentType - for example application/xhtml+xml
 * @param {{maxBytes: number}} limits - the most bytes of a document read
 * @returns {Promise<{ok: boolean, status: number, data: string, headers: object, tooLarge?: boolean}>}
 */
export async function companiesHouseDocumentContent(documentId, contentType, { maxBytes }) {
  try {
    return await readDocumentContent(documentId, contentType, maxBytes);
  } catch (error) {
    if (!(error instanceof HttpTimeoutError)) throw error;
    logger.warn({ message: "The Document API did not answer in time", timeoutMs: error.timeoutMs });
    return { ok: false, status: 504, data: "", headers: {} };
  }
}

async function readDocumentContent(documentId, contentType, maxBytes) {
  const requestUrl = `${getCompaniesHouseDocumentBaseUrl()}/document/${documentId}/content`;
  const answer = await sendWithApiKey((key) => {
    const headers = { ...buildCompaniesHouseHeaders(key), Accept: contentType };
    logger.info({ message: `Request to GET ${loggedUrlOf(requestUrl)}`, url: loggedUrlOf(requestUrl), accept: contentType });
    return sendTextToCompaniesHouse(requestUrl, { method: "GET", headers, redirect: "manual" }, DEFAULT_TIMEOUTS.SHORT, { maxBytes });
  });
  if (answer.tooLarge) return { ok: false, status: 413, data: "", headers: answer.headers, tooLarge: true };
  logger.info({ message: `Response from GET ${loggedUrlOf(requestUrl)}`, url: loggedUrlOf(requestUrl), status: answer.status });
  if (!REDIRECT_STATUSES.has(answer.status)) {
    return { ok: answer.ok, status: answer.status, data: answer.ok ? answer.data : "", headers: answer.headers };
  }
  const location = answer.headers?.location;
  if (!location) return badGateway(answer.headers);
  let fileUrl;
  try {
    fileUrl = new URL(location, requestUrl);
  } catch {
    return badGateway(answer.headers);
  }
  if (!isDocumentFileLocation(fileUrl)) {
    logger.warn({ message: "The Document API redirected to a host the file is not fetched from", host: fileUrl.host });
    return badGateway(answer.headers);
  }
  let file;
  try {
    file = await sendTextToCompaniesHouse(
      fileUrl.toString(),
      { method: "GET", headers: { Accept: contentType }, redirect: "error" },
      DEFAULT_TIMEOUTS.SHORT,
      { api: "GET /document/{documentId}/file", maxBytes },
    );
  } catch (error) {
    if (error?.name !== "TypeError") throw error;
    logger.warn({ message: "The Document API's file could not be fetched", host: fileUrl.host, error: error.message });
    return badGateway({});
  }
  logger.info({ message: "Response from the Document API's file", status: file.status });
  if (file.tooLarge) return { ok: false, status: 413, data: "", headers: file.headers, tooLarge: true };
  return { ok: file.ok, status: file.status, data: file.ok ? file.data : "", headers: file.headers };
}
