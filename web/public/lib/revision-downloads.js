// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/revision-downloads.js
// The accounts being amended, offered as a DIYA-GL book: a JSON file to download, a spreadsheet
// package the DIYA-GL app writes, and the book opened in the DIYA-GL app. The books bundle reads the
// filed document as a company book in this browser; the DIYA-GL addresses carry the book in their
// fragment, which no server receives.

import { bookTexts, diyaGlBookAddress } from "./diya-gl-link.js";

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

function element(tag, attributes = {}, text = "") {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

function downloadFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = element("a", { href: url, download: name });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The book of a filed accounts document: the company book of the filed year, its JSON file, its
 * book.toml and lines.jsonl text and the differences the reader found.
 * @param {object} bundle - the books bundle
 * @param {string} filedDocument - the filed iXBRL
 */
export async function bookOfFiledAccounts(bundle, filedDocument) {
  const read = await bundle.readBookSource(new TextEncoder().encode(filedDocument), "accounts.xhtml");
  return {
    json: bundle.writeBookJson(read.book, read.lines),
    texts: bookTexts(bundle, read.book, read.lines),
    differences: read.differences ?? [],
  };
}

/**
 * Fill the amend view's downloads with the accounts being amended as a DIYA-GL book.
 * @param {HTMLElement} holder - the element revisionDownloads
 * @param {{filedDocument: string, filleted: boolean, companyNumber: string, periodEnd: string,
 *   loadBundle: () => Promise<object>, diyaGlBaseUrl?: string}} source
 */
export async function showRevisionDownloads(holder, { filedDocument, filleted, companyNumber, periodEnd, loadBundle, diyaGlBaseUrl }) {
  holder.replaceChildren(element("h4", {}, siteText("ch.revision.downloads-heading", "Download the accounts being amended")));
  let book;
  try {
    book = await bookOfFiledAccounts(await loadBundle(), filedDocument);
  } catch (error) {
    console.error("The accounts being amended could not be made into a DIYA-GL book:", error);
    holder.appendChild(
      element(
        "p",
        { class: "hint", id: "revisionDownloadsUnavailable" },
        siteText(
          "ch.revision.downloads-unavailable",
          "These accounts could not be made into a DIYA-GL book, so they cannot be downloaded here.",
        ),
      ),
    );
    return;
  }
  holder.appendChild(
    element(
      "p",
      { class: "hint" },
      siteText(
        "ch.revision.downloads-summary",
        "The book is a summary of the filed accounts: the opening balances and one line for each filed figure. Correct it in the DIYA-GL app or the spreadsheets, then drop it on the books card above.",
      ),
    ),
  );
  if (filleted) {
    holder.appendChild(
      element(
        "p",
        { class: "hint" },
        siteText(
          "ch.revision.downloads-filleted",
          "The filed copy is filleted and holds no profit and loss account, so the book has one line for the year's profit.",
        ),
      ),
    );
  }
  if (book.differences.length > 0) {
    holder.appendChild(
      element("p", { class: "hint" }, siteText("ch.revision.downloads-differences", "Where the book differs from the filed accounts:")),
    );
    const list = element("ul", { id: "revisionDownloadsDifferences" });
    for (const difference of book.differences) list.appendChild(element("li", {}, difference));
    holder.appendChild(list);
  }
  holder.appendChild(
    element(
      "p",
      { class: "hint" },
      siteText(
        "ch.revision.downloads-nothing-uploaded",
        "Nothing is uploaded: the book is made in this browser, and the DIYA-GL links carry it inside the address.",
      ),
    ),
  );

  const actions = element("p", { class: "revision-downloads-actions" });
  const download = element(
    "button",
    { type: "button", class: "btn-small", id: "revisionDownloadBook" },
    siteText("ch.revision.downloads-book", "Download as a DIYA-GL book"),
  );
  download.addEventListener("click", () => downloadFile(`${companyNumber}-${periodEnd}-diya-gl-book.json`, book.json));
  actions.appendChild(download);
  if (diyaGlBaseUrl) {
    const packageLink = element(
      "a",
      {
        class: "btn-small",
        id: "revisionDownloadPackage",
        target: "_blank",
        rel: "noopener",
        href: await diyaGlBookAddress(diyaGlBaseUrl, book.texts, { download: "package" }),
      },
      siteText("ch.revision.downloads-package", "Download as a spreadsheet package"),
    );
    const openLink = element(
      "a",
      {
        class: "btn-small",
        id: "revisionOpenInDiyaGl",
        target: "_blank",
        rel: "noopener",
        href: await diyaGlBookAddress(diyaGlBaseUrl, book.texts),
      },
      siteText("ch.revision.downloads-open", "Open in DIYA-GL"),
    );
    actions.append(" ", packageLink, " ", openLink);
  }
  holder.appendChild(actions);
}

/**
 * Offer the accounts being amended as a DIYA-GL book in the revision section. The form opens without
 * waiting for the book; a book that cannot be made says so in its place.
 * @param {object} source - the revision source accounts-revision.js answers
 * @param {{loadBundle: () => Promise<object>}} deps
 */
export async function fillRevisionDownloads(source, { loadBundle }) {
  const holder = document.getElementById("revisionDownloads");
  if (!holder) return;
  const env = await (window.envReady ?? Promise.resolve({})).catch(() => ({}));
  await showRevisionDownloads(holder, {
    filedDocument: source.filedDocument,
    filleted: Boolean(source.mapped?.filleted),
    companyNumber: source.companyNumber,
    periodEnd: source.period?.end,
    loadBundle,
    diyaGlBaseUrl: env.DIYA_GL_BASE_URL,
  });
}
