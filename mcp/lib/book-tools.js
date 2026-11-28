// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-03 Load and save diya-gl books via MCP
// - **Use when:** an MCP session needs to open or save a diya-gl book, locally or in the cloud.
// - **Does:** The two open_book and save_book tools in mcp/lib/book-tools.js back this server's session. open_book reads a book.toml plus lines.jsonl directory, any file the engine reads, or a cloud book. save_book writes the session's book in one of five formats, locally or to the cloud.
// - **Run:** no command; see Does and Entry
// - **Entry:** `mcp/lib/book-tools.js:openBook`; `mcp/lib/book-tools.js:saveBook`; `mcp/lib/book-tools.js:createSession`
// - **Files:** mcp/lib/book-tools.js, mcp/test/book-tools.test.js, mcp/test/fixtures/brickwork-pro-ltd-vat/book.toml, mcp/test/fixtures/precision-code-ltd-full/book.toml
// - **Keywords:** open_book, save_book, diya-gl, book.toml, lines.jsonl, cloud book, mcp book tools, xlsx export
// - **Related:** MCP-02, MCP-04, MCP-05, MCP-06, SS-03, SS-06
// @end-capability

// book-tools.js -- the two book tools over the filesystem: open_book loads a
// diya-gl book from a directory (book.toml + lines.jsonl) or from any file
// the diya-gl engine reads (a workbook, a package zip, a diya-gl zip, a
// diya-gl JSON file), and save_book writes the session's book back in any
// of those shapes. Every calculation and every byte on disk comes from the
// published @diy-accounting-uk/diya-gl package; no engine code lives here.
//
// State: one loaded book per session, a plain object this module owns the
// shape of. open_book replaces it outright; save_book reads it.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, resolve as resolvePath } from "node:path";

import { buildFileReportDocument, calculatedResultsFor, extractBookFromFile } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { runBookChecks, bookChecksJson } from "@diy-accounting-uk/diya-gl/dist/app/lib/book-checks.js";
import { canonicalBookToml, canonicalLinesJsonl } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-canonical.js";
import { readBookSource, writeBookJson, writeDiyaGlZip } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { validateBook, validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";
import { loadTaxDataForBook, productOf, savePackageZip, saveWorkbook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { PRODUCTS, productModule } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";
import { stampBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/provenance.js";

import { storedCredentials } from "./auth.js";
import { desktopClientHeaders } from "./client-headers.js";
import { UNKNOWN_CLIENT } from "./client-kind.js";

export const SAVE_FORMATS = ["diya-gl-dir", "diya-gl-zip", "json", "xlsx", "zip"];

// The DIY Accounting Submit account forms of open_book/save_book reach DIY Accounting Submit's own storage routes
// (diyaGlListGet.js, diyaGlVersionGet.js, diyaGlPut.js), the same routes the spreadsheets site's
// DIYA-GL pages use, over the session's credentials. Configuration comes from the
// environment: DIYA_SUBMIT_BASE_URL, the same variable practice-tools.js and submit-tools.js read.
function baseUrl() {
  const value = process.env.DIYA_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

/**
 * A fresh, empty session: no book loaded. cloud carries the last cloud open or save's bookId,
 * clientId and etag, so a later save_book with cloud: true sends the right if-match. credentials
 * supplies the bearer every API call sends (the stdio server's is auth.js's file-backed pair; the
 * hosted Lambda passes the request's bearer and an idToken that answers null). pollBudgetMs caps
 * how long one tool call polls an asynchronous route, null for the route's own attempt limit.
 * clientHeaders answers the headers a call to an HMRC route carries for HMRC's fraud prevention
 * data (the stdio server reads its own machine; the hosted Lambda passes what the caller gives).
 * @param {{credentials?: {accessToken: () => Promise<string>, idToken: () => Promise<string|null>},
 *   pollBudgetMs?: number|null, clientHeaders?: () => Promise<Object>, client?: string}} [options] - client is the
 *   assistant's kind from client-kind.js
 * @returns {{client: string, book: Object|null, lines: Array|null, product: string|null, sourcePath: string|null,
 *   cloud: {bookId: string, clientId: string|null, etag: string}|null,
 *   credentials: {accessToken: () => Promise<string>, idToken: () => Promise<string|null>},
 *   pollBudgetMs: number|null, clientHeaders: () => Promise<Object>}}
 */
export function createSession({
  credentials = storedCredentials,
  pollBudgetMs = null,
  clientHeaders = desktopClientHeaders,
  client = UNKNOWN_CLIENT,
} = {}) {
  return {
    client,
    book: null,
    lines: null,
    product: null,
    sourcePath: null,
    cloud: null,
    hmrcGrant: null,
    credentials,
    pollBudgetMs,
    clientHeaders,
  };
}

function requireLoaded(session) {
  if (!session.book || !session.lines) {
    throw new Error("No book is loaded. Call open_book first.");
  }
}

function isoDate(value) {
  if (value === undefined || value === null) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function reportFor(book, lines) {
  const product = productOf(book);
  return buildFileReportDocument(book, lines, product, productModule(product));
}

// The book checks and warnings with the book's own tax year's data behind
// them, the same pair of calls the diya-gl package's own MCP server makes,
// so a book opened here and the same book exported by the CLI agree.
async function bookChecksFor(book, lines) {
  const taxData = await loadTaxDataForBook(book);
  const results = calculatedResultsFor(book, lines, taxData);
  return runBookChecks({ book, lines, taxData, results });
}

/**
 * The summary open_book answers: what the book is, whose it is, which period
 * it covers, how many lines it holds, and the check and warning counts.
 */
function summarise(session, bookChecks) {
  const { book, lines, product } = session;
  const info = book.documentInfo ?? {};
  const entity = book.entityInformation ?? {};
  return {
    product,
    entity: entity.organizationIdentifier ?? null,
    period: { start: isoDate(info.periodCoveredStart), end: isoDate(info.periodCoveredEnd) },
    lineCount: lines.length,
    bookChecks: bookChecks.summary,
    failedChecks: bookChecks.results.filter((r) => r.result === "fail").map((r) => ({ id: r.id, title: r.title })),
  };
}

/**
 * The summary open_book answers, for the session's loaded book.
 * @param {Object} session
 */
export async function loadedBookSummary(session) {
  requireLoaded(session);
  return summarise(session, await bookChecksFor(session.book, session.lines));
}

/**
 * The metadata of each book saved in the DIY Accounting Submit account, most recently updated first, over the route
 * the spreadsheets site's DIYA-GL pages list (GET /api/v1/books): every field the route stores,
 * the etag a replacing save sends among them. clientId lists a practice client's book set instead
 * of the practice's own.
 * @param {Object} session
 * @param {{clientId?: string}} params
 * @returns {Promise<Object[]>}
 */
export async function listBookMetadata(session, { clientId } = {}) {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const response = await fetch(`${baseUrl()}/api/v1/books${query}`, {
    headers: { Authorization: `Bearer ${await session.credentials.accessToken()}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `list_books failed with HTTP ${response.status}`);
  }
  return body.books ?? [];
}

/**
 * list_books: the saved books, most recently updated first, each as the bookId open_book takes,
 * the title, the product and the period the book covers. The route's other fields (its versions,
 * etags, sizes, times, retention and the account's entitlement) answer no question a person asks
 * about their books, so the tool leaves them out.
 * @param {Object} session
 * @param {{clientId?: string}} params
 * @returns {Promise<{books: Array<{bookId: string, title: string|null, product: string|null,
 *   period: {start: string|null, end: string|null}}>}>}
 */
export async function listBooks(session, { clientId } = {}) {
  const books = await listBookMetadata(session, { clientId });
  return {
    books: books.map((book) => ({
      bookId: book.bookId,
      title: book.title ?? null,
      product: book.product ?? null,
      period: { start: isoDate(book.periodCoveredStart), end: isoDate(book.periodCoveredEnd) },
    })),
  };
}

/**
 * The session's loaded book from the DIY Accounting Submit account by book id, over the same route the spreadsheets
 * site's DIYA-GL pages read (GET /api/v1/books/{bookId}/versions/latest). Replaces the session's
 * loaded book and records the etag save_book's cloud form needs for its next if-match.
 */
async function openCloudBook(session, { bookId, clientId } = {}) {
  if (!bookId) throw new Error("open_book with cloud: true requires bookId");
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const response = await fetch(`${baseUrl()}/api/v1/books/${encodeURIComponent(bookId)}/versions/latest${query}`, {
    headers: { Authorization: `Bearer ${await session.credentials.accessToken()}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `open_book (cloud) failed with HTTP ${response.status}`);
  }

  const bytes = Buffer.from(body.zipBase64, "base64");
  const { product, book, lines } = await readBookSource(bytes, `${bookId}.zip`, { products: PRODUCTS });
  if (!product) throw new Error(`Cloud book ${bookId} declares no product this server can open`);

  session.book = book;
  session.lines = lines;
  session.product = product;
  session.sourcePath = null;
  session.cloud = { bookId, clientId: clientId ?? null, etag: body.metadata.latestETag };

  return summarise(session, await bookChecksFor(book, lines));
}

/**
 * Reloads the cloud book a stored pointer names into the session, as open_book with cloud: true
 * does. The session's cloud pointer afterwards carries the etag the cloud answered, which may be
 * newer than the pointer's.
 * @param {Object} session
 * @param {{bookId: string, clientId?: string|null, etag?: string}} pointer
 */
export async function restoreCloudBook(session, { bookId, clientId } = {}) {
  return openCloudBook(session, { bookId, clientId: clientId ?? undefined });
}

/**
 * open_book: a path in, the loaded book's summary out. A directory is read
 * as book.toml + lines.jsonl; a file is read by content, whichever of the
 * engine's kinds it sniffs as. With cloud: true, reads bookId from the DIYA
 * cloud instead (a practice client's own book with clientId). Replaces the
 * session's loaded book.
 * @param {Object} session
 * @param {{path: string} | {cloud: true, bookId: string, clientId?: string}} params
 */
export async function openBook(session, { path, cloud, bookId, clientId } = {}) {
  if (cloud) return openCloudBook(session, { bookId, clientId });
  if (!path) throw new Error("open_book requires a path, or cloud: true and bookId");
  const resolved = resolvePath(path);
  if (!existsSync(resolved)) throw new Error(`No such file or directory: ${resolved}`);

  let kind;
  let book;
  let lines;
  if (statSync(resolved).isDirectory()) {
    for (const name of ["book.toml", "lines.jsonl"]) {
      if (!existsSync(resolvePath(resolved, name))) throw new Error(`${resolved} has no ${name}`);
    }
    ({ book, lines } = loadDiyaGlData(resolved));
    kind = "diya-gl-dir";
  } else {
    ({ book, lines } = await extractBookFromFile(resolved));
    kind = "file";
  }

  const product = productOf(book);
  if (!product) throw new Error(`${resolved} declares no product this server can open`);

  session.book = book;
  session.lines = lines;
  session.product = product;
  session.sourcePath = resolved;

  return { kind, sourcePath: resolved, ...summarise(session, await bookChecksFor(book, lines)) };
}

function refuseUnlessValid(book, lines) {
  const stamped = stampBook(book);
  const bookErrors = validateBook(stamped);
  if (!bookErrors.valid) {
    throw new Error(`The book does not conform to the published v2 book schema: ${bookErrors.errors.join("; ")}`);
  }
  const lineErrors = validateLines(lines, stamped);
  if (!lineErrors.valid) {
    const shown = lineErrors.errors.slice(0, 20).join("; ");
    const more = lineErrors.errors.length > 20 ? ` (and ${lineErrors.errors.length - 20} more)` : "";
    throw new Error(`The lines do not conform to the published v2 lines schema: ${shown}${more}`);
  }
  return stamped;
}

function formatFor(path, requested) {
  if (requested) {
    if (!SAVE_FORMATS.includes(requested)) {
      throw new Error(`Unknown format "${requested}". Known formats: ${SAVE_FORMATS.join(", ")}`);
    }
    return requested;
  }
  const ext = extname(path).toLowerCase();
  if (ext === "") return "diya-gl-dir";
  if (ext === ".json") return "json";
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".zip") return "diya-gl-zip";
  throw new Error(`Cannot infer a format from ${basename(path)}; pass one of ${SAVE_FORMATS.join(", ")}`);
}

function isoDateOrNull(value) {
  if (value === undefined || value === null) return null;
  return new Date(value).toISOString().slice(0, 10);
}

// An error from a cloud book route, carrying the HTTP status and the route's code so a caller can
// answer a stale version, a full account or an oversized book in its own words.
function cloudRouteError(response, body, fallback) {
  const error = new Error(body?.message || fallback);
  error.status = response.status;
  error.code = body?.error?.code ?? body?.message ?? null;
  return error;
}

/**
 * A new cloud book's id: the version 4 UUID the storage route's book id pattern takes.
 * @returns {string}
 */
export function newCloudBookId() {
  return randomUUID();
}

/**
 * The stored DIYA-GL zip of one version of a cloud book, and the book's metadata, over the route
 * open_book's cloud form reads (GET /api/v1/books/{bookId}/versions/{version}).
 * @param {Object} session
 * @param {{bookId: string, clientId?: string|null, version: number|"latest"}} params
 * @returns {Promise<{bytes: Buffer, metadata: Object}>}
 */
export async function readCloudVersion(session, { bookId, clientId, version }) {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const response = await fetch(`${baseUrl()}/api/v1/books/${encodeURIComponent(bookId)}/versions/${encodeURIComponent(version)}${query}`, {
    headers: { Authorization: `Bearer ${await session.credentials.accessToken()}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw cloudRouteError(response, body, `Reading version ${version} failed with HTTP ${response.status}`);
  return { bytes: Buffer.from(body.zipBase64, "base64"), metadata: body.metadata };
}

/**
 * Stores a DIYA-GL zip as the next version of a cloud book (PUT /api/v1/books/{bookId}). ifMatch is
 * the etag of the version the zip replaces, or null for a new book. change says what made this
 * version, for the version list and the activity record.
 * @returns {Promise<Object>} the book's metadata after the write
 */
export async function putCloudZip(
  session,
  { bookId, clientId, zipBytes, title, product, periodCoveredStart, periodCoveredEnd, ifMatch, change },
) {
  const response = await fetch(`${baseUrl()}/api/v1/books/${encodeURIComponent(bookId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${await session.credentials.accessToken()}`,
      ...(ifMatch ? { "if-match": ifMatch } : {}),
    },
    body: JSON.stringify({
      title,
      product,
      periodCoveredStart,
      periodCoveredEnd,
      zipBase64: zipBytes.toString("base64"),
      ...(clientId ? { clientId } : {}),
      ...(change ? { change } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw cloudRouteError(response, body, `save_book (cloud) failed with HTTP ${response.status}`);
  return body.metadata;
}

/**
 * The DIYA-GL zip of a book and lines, with the report and the book checks computed from them: the
 * bytes the cloud stores.
 * @returns {Promise<Buffer>}
 */
export async function diyaGlZipOf(book, lines) {
  const { results } = await bookChecksFor(book, lines);
  const bookchecks = JSON.parse(bookChecksJson(results));
  return Buffer.from(await writeDiyaGlZip({ book, lines, report: reportFor(book, lines), bookchecks }));
}

/**
 * The session's loaded book to the DIY Accounting Submit account by book id, over the same route the spreadsheets
 * site's DIYA-GL pages write (PUT /api/v1/books/{bookId}). Carries the if-match etag from the
 * session's last cloud open or save of this same bookId; a book saved here for the first time (no
 * prior cloud open), or one saved with newBook, sends none, matching a brand-new book on that route.
 */
async function saveCloudBook(session, { bookId, clientId, change, newBook = false } = {}) {
  requireLoaded(session);
  if (!bookId) throw new Error("save_book with cloud: true requires bookId");
  const { book, lines } = session;
  const info = book.documentInfo ?? {};
  const entity = book.entityInformation ?? {};

  const zipBytes = await diyaGlZipOf(book, lines);
  const ifMatch = !newBook && session.cloud?.bookId === bookId ? session.cloud.etag : undefined;
  const metadata = await putCloudZip(session, {
    bookId,
    clientId,
    zipBytes,
    title: entity.organizationIdentifier || bookId,
    product: session.product,
    periodCoveredStart: isoDateOrNull(info.periodCoveredStart),
    periodCoveredEnd: isoDateOrNull(info.periodCoveredEnd),
    ifMatch,
    change,
  });

  session.cloud = { bookId, clientId: clientId ?? null, etag: metadata.latestETag };
  return {
    path: null,
    format: "cloud",
    bookId,
    etag: metadata.latestETag,
    version: metadata.latestVersion,
    lineCount: lines.length,
    bytes: zipBytes.length,
  };
}

/**
 * save_book: the session's loaded book to a path, in one of five shapes.
 * diya-gl-dir writes book.toml and lines.jsonl into the directory (the
 * default for a path with no extension); diya-gl-zip and json write the
 * engine's own interchange formats; xlsx and zip compose the product's
 * workbook or package, which fetches the template from
 * spreadsheets.diyaccounting.co.uk the first time it runs. With cloud: true,
 * writes to the DIY Accounting Submit account by bookId instead (a practice client's book set
 * with clientId).
 * @param {Object} session
 * @param {{path: string, format?: string} | {cloud: true, bookId: string, clientId?: string}} params
 */
export async function saveBook(session, { path, format, cloud, bookId, clientId, change, newBook } = {}) {
  if (cloud) return saveCloudBook(session, { bookId, clientId, change, newBook });
  if (!path) throw new Error("save_book requires a path, or cloud: true and bookId");
  requireLoaded(session);
  const { book, lines } = session;
  const resolved = resolvePath(path);
  const chosen = formatFor(resolved, format);

  if (chosen === "diya-gl-dir") {
    const stamped = refuseUnlessValid(book, lines);
    mkdirSync(resolved, { recursive: true });
    const bookToml = canonicalBookToml(stamped);
    const linesJsonl = canonicalLinesJsonl(lines);
    writeFileSync(resolvePath(resolved, "book.toml"), bookToml);
    writeFileSync(resolvePath(resolved, "lines.jsonl"), linesJsonl);
    return {
      path: resolved,
      format: chosen,
      files: ["book.toml", "lines.jsonl"],
      lineCount: lines.length,
      bytes: Buffer.byteLength(bookToml) + Buffer.byteLength(linesJsonl),
    };
  }

  let bytes;
  if (chosen === "json") {
    bytes = Buffer.from(writeBookJson(book, lines), "utf8");
  } else if (chosen === "diya-gl-zip") {
    const { results } = await bookChecksFor(book, lines);
    const bookchecks = JSON.parse(bookChecksJson(results));
    bytes = Buffer.from(await writeDiyaGlZip({ book, lines, report: reportFor(book, lines), bookchecks }));
  } else if (chosen === "zip") {
    bytes = Buffer.from((await savePackageZip(book, lines)).zip);
  } else {
    bytes = Buffer.from((await saveWorkbook(book, lines)).workbook);
  }
  mkdirSync(resolvePath(resolved, ".."), { recursive: true });
  writeFileSync(resolved, bytes);
  return { path: resolved, format: chosen, files: [basename(resolved)], lineCount: lines.length, bytes: bytes.length };
}
