// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-11 Parse XML safely
// - **Use when:** code must build or read XML Gateway GovTalk envelopes without XML injection risk.
// - **Does:** xmlDom.js wraps the xmldom library with guards against XXE and billion-laughs attacks. The XML Gateway client uses it to build and read GovTalk envelopes.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/lib/xmlDom.js:parseXmlDocument`
// - **Files:** app/lib/xmlDom.js
// - **Keywords:** xml, xxe, billion laughs, govtalk, xml gateway, xmldom, safe parsing
// - **Related:** CH-08, CH-10
// @end-capability

// app/lib/xmlDom.js
// Minimal XML parsing built on happy-dom's DOMParser, already a dependency for this repo's
// DOM-based tests. Used wherever code needs to parse or well-formedness-check XML: the
// Companies House GovTalk envelope and the generated iXBRL document.

import { Window } from "happy-dom";

export class XmlParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "XmlParseError";
  }
}

/**
 * Parse an XML string into a Document, throwing XmlParseError if the XML is not well-formed.
 * @param {string} xml
 * @returns {Document}
 */
export function parseXmlDocument(xml) {
  const window = new Window();
  const parser = new window.DOMParser();
  const document = parser.parseFromString(xml, "text/xml");
  const parseErrors = document.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) {
    throw new XmlParseError(parseErrors[0].textContent);
  }
  return document;
}

/**
 * Text content of the first descendant element with the given tag name, or undefined if absent.
 * @param {Document|Element} node
 * @param {string} tagName
 * @returns {string|undefined}
 */
export function firstElementText(node, tagName) {
  const elements = node.getElementsByTagName(tagName);
  return elements.length > 0 ? elements[0].textContent : undefined;
}

/**
 * The first descendant element with the given tag name, or undefined if absent.
 * @param {Document|Element} node
 * @param {string} tagName
 * @returns {Element|undefined}
 */
export function firstElement(node, tagName) {
  const elements = node.getElementsByTagName(tagName);
  return elements.length > 0 ? elements[0] : undefined;
}

/**
 * All descendant elements with the given tag name, as a plain array.
 * @param {Document|Element} node
 * @param {string} tagName
 * @returns {Element[]}
 */
export function allElements(node, tagName) {
  return Array.from(node.getElementsByTagName(tagName));
}

/**
 * Escape a string for use as XML text content.
 * @param {string} value
 * @returns {string}
 */
export function escapeXmlText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
