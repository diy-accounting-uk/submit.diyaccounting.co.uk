// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/records.page.js
// The records page: uploads a spreadsheet, a package zip, a DIYA-GL zip or a DIYA-GL book as JSON as a
// new DIYA-GL book in the person's account (the file is read in this browser by the books bundle and
// only the DIYA-GL zip made from it is stored), lists the account's DIYA-GL books with each version and
// what made it, and downloads a version through the download route's short-lived link. A link with
// ?bookId=&format= downloads that book's latest version once the person is signed in; ?clientId= works
// on a practice client's DIYA-GL books.

import { fetchWithIdToken } from "./lib/services/api-client.js";

const siteText = (id, english, values) =>
  window.siteText ? window.siteText(id, english, values) : english.replace(/\{(\w+)\}/g, (whole, name) => values?.[name] ?? whole);

export const DOWNLOAD_FORMATS = ["xlsx", "zip", "diya-gl-zip", "json"];
const MULTI_WORKBOOK_PRODUCTS = ["se", "ltd"];

function byId(id) {
  return document.getElementById(id);
}

function clientQuery(clientId) {
  return clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
}

function isoDate(value) {
  if (value === undefined || value === null) return null;
  return new Date(value).toISOString().slice(0, 10);
}

async function answerOf(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.code || `HTTP ${response.status}`);
  return body;
}

function base64Of(bytes) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

/**
 * What made a version, in words: the assistant tool or the upload behind it.
 * @param {{tool?: string, editCount?: number, restoredVersion?: number}|undefined} change
 * @returns {string}
 */
export function changeText(change) {
  switch (change?.tool) {
    case "edit_lines":
      return siteText("records.change-edit", "{count} line changes by an assistant", { count: change.editCount ?? 1 });
    case "undo_book_change":
      return siteText("records.change-undo", "Undo, back to version {version}", { version: change.restoredVersion });
    case "new_book":
      return siteText("records.change-new", "Started by an assistant");
    case "new_book_from_register":
      return siteText("records.change-register", "Started from the Companies House register by an assistant");
    case "roll_forward":
      return siteText("records.change-roll", "Next year started by an assistant");
    case "import":
      return siteText("records.change-import", "Uploaded on this page");
    default:
      return siteText("records.change-saved", "Saved");
  }
}

/**
 * The DIYA-GL zip and the fields the storage route takes, from a file the person chose.
 * @param {{readBookSource: Function, writeDiyaGlZip: Function, buildFileReportDocument: Function, productModule: Function}} bundle
 * @param {Uint8Array} bytes
 * @param {string} name
 */
export async function bookUploadOf(bundle, bytes, name) {
  const { book, lines, product } = await bundle.readBookSource(bytes, name);
  if (!product) throw new Error(siteText("records.upload-no-product", "This file holds no DIYA-GL book that this site reads."));
  const report = bundle.buildFileReportDocument(book, lines, product, bundle.productModule(product));
  const zip = await bundle.writeDiyaGlZip({ book, lines, report });
  return {
    lineCount: lines.length,
    body: {
      title: (book.entityInformation?.organizationIdentifier || name.replace(/\.[^.]+$/, "")).slice(0, 120),
      product,
      periodCoveredStart: isoDate(book.documentInfo?.periodCoveredStart),
      periodCoveredEnd: isoDate(book.documentInfo?.periodCoveredEnd),
      zipBase64: base64Of(zip),
      change: { tool: "import" },
    },
  };
}

async function uploadFile(file, clientId, onSaved) {
  const result = byId("uploadResult");
  result.textContent = siteText("records.upload-reading", "Reading {name}...", { name: file.name });
  try {
    const bundle = await import("./lib/books-bundle.js");
    const upload = await bookUploadOf(bundle, new Uint8Array(await file.arrayBuffer()), file.name);
    const bookId = crypto.randomUUID();
    await answerOf(
      await fetchWithIdToken(`/api/v1/books/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...upload.body, ...(clientId ? { clientId } : {}) }),
      }),
    );
    result.textContent = siteText("records.upload-saved", "Saved {title} as a new DIYA-GL book with {count} lines.", {
      title: upload.body.title,
      count: upload.lineCount,
    });
    await onSaved();
  } catch (error) {
    result.textContent = siteText("records.upload-failed", "The file was not saved: {reason}", { reason: error.message });
  }
}

/**
 * Downloads one version through the download route's link.
 * @returns {Promise<string>} the link followed
 */
export async function downloadVersion({ bookId, version = "latest", format, clientId }, navigate = (url) => window.location.assign(url)) {
  const query = new URLSearchParams({ format, ...(clientId ? { clientId } : {}) });
  const answer = await answerOf(
    await fetchWithIdToken(`/api/v1/books/${encodeURIComponent(bookId)}/versions/${encodeURIComponent(version)}/download?${query}`),
  );
  navigate(answer.url);
  return answer.url;
}

function formatLabels() {
  return {
    "xlsx": siteText("records.download-xlsx", "Workbook"),
    "zip": siteText("records.download-zip", "Package zip"),
    "diya-gl-zip": siteText("records.download-diya-gl-zip", "DIYA-GL zip"),
    "json": siteText("records.download-json", "DIYA-GL book as JSON"),
  };
}

function formatsFor(product) {
  return DOWNLOAD_FORMATS.filter((format) => format !== "xlsx" || !MULTI_WORKBOOK_PRODUCTS.includes(product));
}

function bookItem(book, clientId) {
  const item = document.createElement("li");
  item.className = "record-item";
  item.dataset.bookId = book.bookId;
  const heading = document.createElement("h3");
  heading.textContent = book.title || book.bookId;
  item.append(heading);
  const period = document.createElement("p");
  period.className = "hint";
  period.textContent = siteText("records.book-period", "{start} to {end}, version {version}", {
    start: isoDate(book.periodCoveredStart) ?? "?",
    end: isoDate(book.periodCoveredEnd) ?? "?",
    version: book.latestVersion,
  });
  item.append(period);

  const actions = document.createElement("p");
  for (const format of formatsFor(book.product)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-small";
    button.dataset.format = format;
    button.textContent = formatLabels()[format];
    button.addEventListener("click", () => {
      downloadVersion({ bookId: book.bookId, format, clientId }).catch((error) => {
        byId("downloadResult").textContent = siteText("records.download-failed", "The download did not start: {reason}", {
          reason: error.message,
        });
      });
    });
    actions.append(button, " ");
  }
  item.append(actions);

  const versions = document.createElement("ol");
  versions.className = "record-versions";
  for (const entry of [...(book.versions ?? [])].reverse()) {
    const row = document.createElement("li");
    row.value = entry.version;
    row.textContent = `${isoDate(entry.createdAt) ?? ""} ${changeText(entry.change)}`.trim();
    versions.append(row);
  }
  item.append(versions);
  return item;
}

async function listBooks(clientId) {
  const list = byId("bookList");
  const { books = [] } = await answerOf(await fetchWithIdToken(`/api/v1/books${clientQuery(clientId)}`));
  list.replaceChildren(...books.map((book) => bookItem(book, clientId)));
  if (books.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = siteText("records.no-books", "No DIYA-GL book is saved in your account yet.");
    list.append(empty);
  }
}

function signedIn() {
  try {
    return Boolean(localStorage.getItem("cognitoIdToken"));
  } catch {
    return false;
  }
}

async function init() {
  if (!signedIn()) return;
  const params = new URLSearchParams(window.location.search);
  const clientId = params.get("clientId") || undefined;
  byId("uploadFile").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) uploadFile(file, clientId, () => listBooks(clientId));
  });
  const bookId = params.get("bookId");
  const format = params.get("format");
  if (bookId && DOWNLOAD_FORMATS.includes(format)) {
    byId("downloadResult").textContent = siteText("records.download-starting", "Your download is starting.");
    downloadVersion({ bookId, format, clientId }).catch((error) => {
      byId("downloadResult").textContent = siteText("records.download-failed", "The download did not start: {reason}", {
        reason: error.message,
      });
    });
  }
  await listBooks(clientId).catch((error) => {
    byId("downloadResult").textContent = siteText("records.list-failed", "Your DIYA-GL books could not be listed: {reason}", {
      reason: error.message,
    });
  });
}

if (typeof document !== "undefined" && document.getElementById("bookList")) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}
