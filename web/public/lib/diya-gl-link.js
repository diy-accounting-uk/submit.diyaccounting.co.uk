// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/diya-gl-link.js
// A company book carried whole in a DIYA-GL app address. The fragment the app opens is the JSON
// { toml, lines }, compressed with deflate-raw, as base64url with no padding: the form the
// diya-gl package's decodeBookFragment reads. The book never reaches a server: the fragment stays in
// the browser.

/** The fragment's name in the address, as in "#book=...". */
export const FRAGMENT_KEY = "book";

function toBase64Url(bytes) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  // Base64 writes "=" only as padding, which base64url leaves out.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * The fragment that carries a book.
 * @param {{toml: string, lines: string}} texts - the text of book.toml and of lines.jsonl
 * @returns {Promise<string>}
 */
export async function bookFragment({ toml, lines }) {
  if (typeof toml !== "string" || typeof lines !== "string") {
    throw new Error("A book link needs the book.toml text and the lines.jsonl text.");
  }
  const compressed = new Blob([JSON.stringify({ toml, lines })]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return toBase64Url(new Uint8Array(await new Response(compressed).arrayBuffer()));
}

/**
 * A book's book.toml and lines.jsonl text, stamped and ordered as the DIYA-GL app writes them.
 * @param {{stampBook: Function, canonicalBookToml: Function, canonicalLinesJsonl: Function}} bundle - the books bundle
 * @param {object} book
 * @param {object[]} lines
 * @returns {{toml: string, lines: string}}
 */
export function bookTexts(bundle, book, lines) {
  const stamped = bundle.stampBook(book);
  return { toml: bundle.canonicalBookToml(stamped), lines: bundle.canonicalLinesJsonl(lines, stamped) };
}

/**
 * The DIYA-GL app address that opens a company book, or with download "package" writes it as a
 * spreadsheet package.
 * @param {string} baseUrl - the DIYA-GL site, DIYA_GL_BASE_URL
 * @param {{toml: string, lines: string}} texts
 * @param {{download?: "package"}} [options]
 * @returns {Promise<string>}
 */
export async function diyaGlBookAddress(baseUrl, texts, { download } = {}) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const query = download ? `?download=${encodeURIComponent(download)}` : "";
  return `${base}ltd.html${query}#${FRAGMENT_KEY}=${await bookFragment(texts)}`;
}
