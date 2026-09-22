// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// book-tools.js -- the two book tools over the filesystem: open_book loads a
// diya-gl book from a directory (book.toml + lines.jsonl) or from any file
// the diya-gl engine reads (a workbook, a package zip, a diya-gl zip, a
// diya-gl JSON file), and save_book writes the session's book back in any
// of those shapes. Every calculation and every byte on disk comes from the
// published @diy-accounting-uk/diya-gl package; no engine code lives here.
//
// State: one loaded book per session, a plain object this module owns the
// shape of. open_book replaces it outright; save_book reads it.

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

import { accessToken as mcpAccessToken } from "./auth.js";

export const SAVE_FORMATS = ["diya-gl-dir", "diya-gl-zip", "json", "xlsx", "zip"];

// The DIYA cloud forms of open_book/save_book reach DIY Accounting Submit's own storage routes
// (diyaGlListGet.js, diyaGlVersionGet.js, diyaGlPut.js), the same routes the spreadsheets site's
// DIYA-GL pages use, over the MCP's own signed-in session (auth.js). Configuration comes from the
// environment: DIYA_SUBMIT_BASE_URL, the same variable practice-tools.js and submit-tools.js read.
function baseUrl() {
  const value = process.env.DIYA_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

/**
 * A fresh, empty session: no book loaded. cloud carries the last cloud open or save's bookId,
 * clientId and etag, so a later save_book with cloud: true sends the right if-match.
 * @returns {{book: Object|null, lines: Array|null, product: string|null, sourcePath: string|null,
 *   cloud: {bookId: string, clientId: string|null, etag: string}|null}}
 */
export function createSession() {
  return { book: null, lines: null, product: null, sourcePath: null, cloud: null };
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
function summarise(session, kind, bookChecks) {
  const { book, lines, product, sourcePath } = session;
  const info = book.documentInfo ?? {};
  const entity = book.entityInformation ?? {};
  return {
    kind,
    sourcePath,
    product,
    entity: entity.organizationIdentifier ?? null,
    period: { start: isoDate(info.periodCoveredStart), end: isoDate(info.periodCoveredEnd) },
    lineCount: lines.length,
    bookChecks: bookChecks.summary,
    failedChecks: bookChecks.results.filter((r) => r.result === "fail").map((r) => ({ id: r.id, title: r.title })),
  };
}

/**
 * The session's loaded book from the DIYA cloud by book id, over the same route the spreadsheets
 * site's DIYA-GL pages read (GET /api/v1/books/{bookId}/versions/latest). Replaces the session's
 * loaded book and records the etag save_book's cloud form needs for its next if-match.
 */
async function openCloudBook(session, { bookId, clientId } = {}) {
  if (!bookId) throw new Error("open_book with cloud: true requires bookId");
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  const response = await fetch(`${baseUrl()}/api/v1/books/${encodeURIComponent(bookId)}/versions/latest${query}`, {
    headers: { Authorization: `Bearer ${await mcpAccessToken()}` },
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

  return summarise(session, "cloud", await bookChecksFor(book, lines));
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

  return summarise(session, kind, await bookChecksFor(book, lines));
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

/**
 * The session's loaded book to the DIYA cloud by book id, over the same route the spreadsheets
 * site's DIYA-GL pages write (PUT /api/v1/books/{bookId}). Carries the if-match etag from the
 * session's last cloud open or save of this same bookId; a book saved here for the first time (no
 * prior cloud open) sends none, matching a brand-new book on that route.
 */
async function saveCloudBook(session, { bookId, clientId } = {}) {
  requireLoaded(session);
  if (!bookId) throw new Error("save_book with cloud: true requires bookId");
  const { book, lines } = session;
  const info = book.documentInfo ?? {};
  const entity = book.entityInformation ?? {};

  const { results } = await bookChecksFor(book, lines);
  const bookchecks = JSON.parse(bookChecksJson(results));
  const zipBytes = Buffer.from(await writeDiyaGlZip({ book, lines, report: reportFor(book, lines), bookchecks }));

  const ifMatch = session.cloud?.bookId === bookId ? session.cloud.etag : undefined;
  const response = await fetch(`${baseUrl()}/api/v1/books/${encodeURIComponent(bookId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${await mcpAccessToken()}`,
      ...(ifMatch ? { "if-match": ifMatch } : {}),
    },
    body: JSON.stringify({
      title: entity.organizationIdentifier || bookId,
      product: session.product,
      periodCoveredStart: isoDateOrNull(info.periodCoveredStart),
      periodCoveredEnd: isoDateOrNull(info.periodCoveredEnd),
      zipBase64: zipBytes.toString("base64"),
      ...(clientId ? { clientId } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `save_book (cloud) failed with HTTP ${response.status}`);
  }

  session.cloud = { bookId, clientId: clientId ?? null, etag: body.metadata.latestETag };
  return { path: null, format: "cloud", bookId, etag: body.metadata.latestETag, lineCount: lines.length, bytes: zipBytes.length };
}

/**
 * save_book: the session's loaded book to a path, in one of five shapes.
 * diya-gl-dir writes book.toml and lines.jsonl into the directory (the
 * default for a path with no extension); diya-gl-zip and json write the
 * engine's own interchange formats; xlsx and zip compose the product's
 * workbook or package, which fetches the template from
 * spreadsheets.diyaccounting.co.uk the first time it runs. With cloud: true,
 * writes to the DIYA cloud by bookId instead (a practice client's book set
 * with clientId).
 * @param {Object} session
 * @param {{path: string, format?: string} | {cloud: true, bookId: string, clientId?: string}} params
 */
export async function saveBook(session, { path, format, cloud, bookId, clientId } = {}) {
  if (cloud) return saveCloudBook(session, { bookId, clientId });
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
