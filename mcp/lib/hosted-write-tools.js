// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// hosted-write-tools.js -- the tools that change a DIYA-GL book on the hosted connector. The hosted
// server keeps no book between calls (it reopens the session's cloud book from its stored bookId and
// etag on every call), so each write saves the book to the person's DIY Accounting Submit account
// before it answers, as the next version of the book, and only then takes the result into the
// session. undo_book_change saves a kept earlier version as the next one. extract_book and
// save_workbook change nothing: they answer the link to the page where the person uploads or
// downloads a file. Every book change comes from the published diya-gl tools' own handlers.

import { z } from "zod";

import { buildFileReportDocument } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { readBookSource } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { TOOLS as DIYA_GL_TOOLS } from "@diy-accounting-uk/diya-gl/dist/app/lib/mcp/diya-gl-tools.js";
import { productOf } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { PRODUCTS, productModule } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";

import { listBookMetadata, loadedBookSummary, newCloudBookId, putCloudZip, readCloudVersion, saveBook } from "./book-tools.js";
import { publicBaseUrl } from "./handoff-tools.js";
import { ADDS_OUTSIDE, CHANGES_OUTSIDE, READS } from "./tool-annotations.js";

export const EDITS = DIYA_GL_TOOLS.edit_lines.inputSchema.properties.edits.items.properties.edit.enum;
export const MAX_EDITS_PER_CALL = 50;
export const DOWNLOAD_FORMATS = ["xlsx", "zip", "diya-gl-zip", "json"];

export const STALE_BOOK_MESSAGE =
  "The DIYA-GL book changed in your account since it was opened. Open it again with open_book and make the change again.";

function requireCloudBook(session) {
  if (!session.book || !session.lines || !session.cloud) {
    throw new Error("No saved DIYA-GL book is open. Call list_books, then open_book with its bookId.");
  }
  return session.cloud;
}

// The words a person reads for a save the storage route refused.
function saveRefusal(error) {
  if (error.status === 412) return new Error(STALE_BOOK_MESSAGE);
  if (error.code === "book-limit-reached") {
    return new Error("The account already holds 20 DIYA-GL books. Delete one on the DIYA-GL site, then try again.");
  }
  if (error.status === 413 || error.code === "book-too-large") {
    return new Error("The DIYA-GL book would be larger than the 2 MB an account stores for one book, so it was not saved.");
  }
  return error;
}

// A copy of the session holding another book, so a save that fails leaves the session as it was.
function candidateSession(session, book, lines) {
  return { ...session, book, lines, product: productOf(book), sourcePath: null };
}

function adopt(session, candidate) {
  session.book = candidate.book;
  session.lines = candidate.lines;
  session.product = candidate.product;
  session.sourcePath = null;
  session.cloud = candidate.cloud;
}

async function saveCandidate(candidate, params) {
  try {
    return await saveBook(candidate, { cloud: true, ...params });
  } catch (error) {
    throw saveRefusal(error);
  }
}

async function summaryOf(session, version) {
  return { bookId: session.cloud.bookId, version, ...(await loadedBookSummary(session)) };
}

function reportOf(book, lines) {
  const product = productOf(book);
  return buildFileReportDocument(book, lines, product, productModule(product));
}

// Every figure whose value differs between two reports, with the change where both are numbers.
function movedFigures(before, after) {
  const beforeValues = new Map(before.values.map((entry) => [entry.key, entry.value]));
  const afterValues = new Map(after.values.map((entry) => [entry.key, entry.value]));
  const moved = [];
  for (const key of new Set([...beforeValues.keys(), ...afterValues.keys()])) {
    const from = beforeValues.get(key) ?? null;
    const to = afterValues.get(key) ?? null;
    if (from === to) continue;
    const delta =
      Number.isFinite(Number(from)) && Number.isFinite(Number(to)) && from !== null && to !== null
        ? Number((Number(to) - Number(from)).toFixed(6))
        : null;
    moved.push({ key, before: from, after: to, delta });
  }
  return moved.sort((a, b) => a.key.localeCompare(b.key));
}

function versionList(metadata) {
  return (metadata.versions ?? []).map(({ version, createdAt, change }) => ({
    version,
    createdAt,
    tool: change?.tool ?? null,
    editCount: change?.editCount ?? null,
  }));
}

async function editLines(session, { edits } = {}) {
  const { bookId, clientId } = requireCloudBook(session);
  if (!Array.isArray(edits) || edits.length === 0) throw new Error("edit_lines requires a non-empty edits array");
  if (edits.length > MAX_EDITS_PER_CALL) throw new Error(`edit_lines takes at most ${MAX_EDITS_PER_CALL} edits a call`);
  const edited = DIYA_GL_TOOLS.edit_lines.handler({ book: null, lines: null }, { edits, book: session.book, lines: session.lines });
  const candidate = candidateSession(session, edited.book, edited.lines);
  const saved = await saveCandidate(candidate, { bookId, clientId, change: { tool: "edit_lines", editCount: edits.length } });
  adopt(session, candidate);
  return { ...(await summaryOf(session, saved.version)), previousVersion: saved.version - 1, movedFigures: edited.movedFigures };
}

/**
 * Saves a book as a new DIYA-GL book in the person's account under a new bookId and opens it in the
 * session once saved. Answers the open book's summary.
 * @param {Object} session
 * @param {Object} book
 * @param {Array} lines
 * @param {{clientId?: string|null, change: {tool: string}}} options
 */
export async function saveNewBook(session, book, lines, { clientId, change }) {
  const candidate = { ...candidateSession(session, book, lines), cloud: null };
  const saved = await saveCandidate(candidate, { bookId: newCloudBookId(), clientId, newBook: true, change });
  adopt(session, candidate);
  return summaryOf(session, saved.version);
}

async function newBook(session, { product, businessName, yearEnd, vatRegistered, clientId } = {}) {
  const started = await DIYA_GL_TOOLS.new_book.handler({ book: null, lines: null }, { product, businessName, yearEnd, vatRegistered });
  return saveNewBook(session, started.book, started.lines, { clientId, change: { tool: "new_book" } });
}

async function rollForward(session) {
  const { bookId: priorBookId, clientId } = requireCloudBook(session);
  const rolled = await DIYA_GL_TOOLS.roll_forward.handler({ book: null, lines: null }, { book: session.book, lines: session.lines });
  return {
    ...(await saveNewBook(session, rolled.book, rolled.lines, { clientId, change: { tool: "roll_forward" } })),
    priorBookId,
    failedRollChecks: rolled.rollChecks.filter((check) => check.result !== "pass"),
  };
}

async function undoBookChange(session, { toVersion } = {}) {
  const { bookId, clientId, etag } = requireCloudBook(session);
  const metadata = (await listBookMetadata(session, { clientId: clientId ?? undefined })).find((book) => book.bookId === bookId);
  if (!metadata) throw new Error("The open DIYA-GL book is no longer in the account.");
  if (metadata.latestETag !== etag) throw new Error(STALE_BOOK_MESSAGE);
  const kept = (metadata.versions ?? []).map((entry) => entry.version);
  const target = toVersion ?? Math.max(...kept.filter((version) => version < metadata.latestVersion), -Infinity);
  if (!kept.includes(target) || target === metadata.latestVersion) {
    const oldest = kept.length ? Math.min(...kept) : null;
    throw new Error(
      `No earlier version ${toVersion ?? ""} is kept to go back to; the oldest kept is ${oldest}. ` +
        `The kept versions: ${JSON.stringify(versionList(metadata))}`,
    );
  }

  const { bytes } = await readCloudVersion(session, { bookId, clientId, version: target });
  const { book, lines } = await readBookSource(bytes, `${bookId}.zip`, { products: PRODUCTS });
  const info = book.documentInfo ?? {};
  let written;
  try {
    written = await putCloudZip(session, {
      bookId,
      clientId,
      zipBytes: bytes,
      title: metadata.title,
      product: productOf(book),
      periodCoveredStart: metadata.periodCoveredStart ?? (info.periodCoveredStart ? String(info.periodCoveredStart).slice(0, 10) : null),
      periodCoveredEnd: metadata.periodCoveredEnd ?? (info.periodCoveredEnd ? String(info.periodCoveredEnd).slice(0, 10) : null),
      ifMatch: metadata.latestETag,
      change: { tool: "undo_book_change", restoredVersion: target },
    });
  } catch (error) {
    throw saveRefusal(error);
  }

  const moved = movedFigures(reportOf(session.book, session.lines), reportOf(book, lines));
  const candidate = candidateSession(session, book, lines);
  candidate.cloud = { bookId, clientId: clientId ?? null, etag: written.latestETag };
  adopt(session, candidate);
  return {
    ...(await summaryOf(session, written.latestVersion)),
    restoredVersion: target,
    previousVersion: metadata.latestVersion,
    movedFigures: moved,
  };
}

function uploadLink(session, { clientId } = {}) {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return {
    uploadLink: `${publicBaseUrl()}/records.html${query}#upload`,
    instruction:
      "Open this link, sign in and upload the spreadsheet, package zip, DIYA-GL zip or DIYA-GL book as JSON there. " +
      "The file is read in your browser and saved in your DIY Accounting Submit account as a new DIYA-GL book. " +
      "Then ask me to list your DIYA-GL books and open it.",
  };
}

function downloadLink(session, { format = "xlsx" } = {}) {
  const { bookId, clientId } = requireCloudBook(session);
  if (!DOWNLOAD_FORMATS.includes(format)) throw new Error(`Unknown format "${format}". Known formats: ${DOWNLOAD_FORMATS.join(", ")}`);
  if (format === "xlsx" && productModule(session.product).MULTI_FILE) {
    throw new Error("This DIYA-GL book's spreadsheet is a set of workbooks, so it downloads as a package zip: ask for format zip.");
  }
  const query = new URLSearchParams({ bookId, format, ...(clientId ? { clientId } : {}) });
  return {
    downloadLink: `${publicBaseUrl()}/records.html?${query}`,
    format,
    instruction: "Open this link and sign in: the page downloads the latest version of the DIYA-GL book in that format.",
  };
}

const clientIdSchema = z.string().optional().describe("A practice client's id, to keep the DIYA-GL book in that client's set");

export const HOSTED_WRITE_OVERRIDES = {
  edit_lines: {
    title: "Change lines in a DIYA-GL book",
    annotations: CHANGES_OUTSIDE,
    description:
      "Adds, changes or removes lines in the open DIYA-GL book (one business's sales, purchases and bank lines) with " +
      `named edits applied in order, at most ${MAX_EDITS_PER_CALL} a call, and saves the result in the person's DIY ` +
      "Accounting Submit account as the next version of the book. Answers the book's summary, the version and the " +
      "figures that moved. Use this when the person asks to record a sale, a purchase or a bank line, or to correct " +
      "one. A refused edit changes nothing; undo_book_change takes a saved change back. It files nothing.",
    inputSchema: {
      edits: z
        .array(
          z.object({
            edit: z.enum(EDITS).describe("The named edit"),
            params: z.record(z.string(), z.any()).describe("The edit's parameters"),
          }),
        )
        .min(1)
        .max(MAX_EDITS_PER_CALL)
        .describe("The edits to apply, in order"),
    },
    handler: editLines,
  },
  new_book: {
    title: "Start a new DIYA-GL book",
    annotations: ADDS_OUTSIDE,
    description:
      "Starts an empty DIYA-GL book for a new business (the product's starting accounts, the twelve months to the year " +
      "end and that year's tax rates) and saves it in the person's DIY Accounting Submit account as a new book, which " +
      "becomes the open one. Use this when the person starts keeping their records for a new business. It changes no " +
      "other DIYA-GL book and files nothing.",
    inputSchema: {
      product: z
        .enum(["bst", "taxi", "se", "ltd"])
        .describe("bst (Basic Sole Trader), taxi (Taxi Driver), se (Self Employed) or ltd (Limited Company)"),
      businessName: z.string().describe("The business or company name"),
      yearEnd: z.string().describe("The last day of the first accounting year, YYYY-MM-DD"),
      vatRegistered: z.boolean().optional().describe("se and ltd only: the business is VAT registered"),
      clientId: clientIdSchema,
    },
    handler: newBook,
  },
  roll_forward: {
    title: "Start next year's DIYA-GL book",
    annotations: ADDS_OUTSIDE,
    description:
      "Starts the next year from the open DIYA-GL book: the year end moves on a year with that year's tax rates and the " +
      "closing balances become the opening ones. Saves it in the person's DIY Accounting Submit account as a new book, " +
      "which becomes the open one; last year's book is left as it was. Answers the new book's summary and any opening " +
      "figure that does not agree with last year's closing one. Use this when the person starts a new year. It files nothing.",
    inputSchema: {},
    handler: rollForward,
  },
  undo_book_change: {
    title: "Undo the last change to a DIYA-GL book",
    annotations: CHANGES_OUTSIDE,
    description:
      "Takes back a change to the open DIYA-GL book by saving an earlier version as the next version: by default the " +
      "version before the latest, or toVersion. Answers the book's summary, the version restored and the figures that " +
      "moved. Use this when the person says a change was wrong. The undo is a version too, so another undo takes it " +
      "back. It files nothing.",
    inputSchema: {
      toVersion: z.number().int().min(1).optional().describe("The version to go back to; defaults to the one before the latest"),
    },
    handler: undoBookChange,
  },
  extract_book: {
    title: "Upload a spreadsheet as a DIYA-GL book",
    annotations: READS,
    description:
      "Answers the link to the DIY Accounting Submit page where the person uploads a spreadsheet, a package zip, a " +
      "DIYA-GL zip or a DIYA-GL book as JSON, which is read in their browser and saved in their account as a new " +
      "DIYA-GL book. Use this when the person wants to bring in records they keep in a spreadsheet. It changes nothing itself.",
    inputSchema: { clientId: clientIdSchema },
    handler: uploadLink,
  },
  save_workbook: {
    title: "Download a DIYA-GL book as a spreadsheet",
    annotations: READS,
    description:
      "Answers the link to the DIY Accounting Submit page that downloads the open DIYA-GL book as a workbook (xlsx), a " +
      "package zip, a DIYA-GL zip or a DIYA-GL book as JSON. A product whose spreadsheet is a set of workbooks " +
      "downloads as a package zip. Use this when the person wants their records as a spreadsheet or a file. It changes nothing.",
    inputSchema: {
      format: z.enum(DOWNLOAD_FORMATS).optional().describe("xlsx (the default), zip, diya-gl-zip or json"),
    },
    handler: downloadLink,
  },
};

export const HOSTED_WRITE_TOOL_NAMES = Object.keys(HOSTED_WRITE_OVERRIDES);
