// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-16 Check an accounts iXBRL document as a reader sees it
// - **Use when:** an accounts or CT computations iXBRL builder changes, or a document must be checked before it is filed.
// - **Does:** ixbrlStructureProblems lists the structural problems in an iXBRL document without a taxonomy. It checks that the document is well-formed and the ix:header is hidden with one schemaRef. It checks that every context and unit reference resolves and every context is used. It checks the ixt2 transforms, duplicate facts, and the absence of scripts, links and images. The browser test opens each accounts case and the computations as XHTML. It asserts that no header text is visible, the balance sheet reads in order and nothing follows the last note. It saves each render under target/accounts-documents/.
// - **Run:** `npx vitest run app/unit-tests/lib/ixbrlStructure.test.js`; `npx playwright test --project=browser-tests web/browser-tests/accountsDocumentRendering.browser.test.js`
// - **Entry:** `app/lib/ixbrlStructure.js:ixbrlStructureProblems`; `app/test-helpers/accountsDocumentCases.js:accountsDocumentCases`
// - **Files:** app/lib/ixbrlStructure.js, app/test-helpers/accountsDocumentCases.js, app/unit-tests/lib/ixbrlStructure.test.js, web/browser-tests/accountsDocumentRendering.browser.test.js
// - **Keywords:** ixbrl, inline xbrl, accounts document, rendering, screenshot, header hidden, context, unit, transform, xhtml, validation
// - **Related:** CH-07, CH-08, CH-13, CH-15
// @end-capability

// app/lib/ixbrlStructure.js
// The structural checks an Inline XBRL validator runs first, without a taxonomy: the document is
// well-formed XML, the ix:header is hidden and carries a schemaRef, every fact names a context
// (and a numeric fact a unit) that the header defines, every context is used, duplicate facts
// agree, the transforms are ones Companies House and HMRC accept, and nothing in the document
// runs, links out or loads from elsewhere.

import { parseXmlDocument } from "./xmlDom.js";

const ACCEPTED_TRANSFORMS = new Set(["ixt2:numdotdecimal", "ixt2:datedaymonthyearen"]);
const FORBIDDEN_ELEMENTS = ["script", "a", "img", "iframe", "object", "embed", "link", "base", "form"];
const ENGLISH_DATE = /^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/;

function elements(document, name) {
  return Array.from(document.getElementsByTagName(name));
}

function insideHeader(node) {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) {
    if (parent.nodeName === "ix:header") return true;
  }
  return false;
}

function readsAsNumDotDecimal(text) {
  const [whole, fraction, ...rest] = text.split(".");
  if (rest.length > 0 || (fraction !== undefined && !/^\d+$/.test(fraction))) return false;
  const groups = whole.split(",");
  return /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((group) => /^\d{3}$/.test(group))
    ? true
    : groups.length === 1 && /^\d+$/.test(whole);
}

function transformProblem(fact) {
  const format = fact.getAttribute("format");
  if (!format) return null;
  if (!ACCEPTED_TRANSFORMS.has(format)) return `uses the transform ${format}, which is not one this document set accepts`;
  const text = fact.textContent.trim();
  if (format === "ixt2:numdotdecimal" && !readsAsNumDotDecimal(text)) {
    return `shows "${text}", which ixt2:numdotdecimal cannot read`;
  }
  if (format === "ixt2:datedaymonthyearen" && !ENGLISH_DATE.test(text)) {
    return `shows "${text}", which ixt2:datedaymonthyearen cannot read`;
  }
  return null;
}

function factKey(fact) {
  return `${fact.getAttribute("name")}|${fact.getAttribute("contextRef")}|${fact.getAttribute("unitRef") ?? ""}`;
}

function factValue(fact) {
  const text = fact.textContent.trim();
  if (fact.nodeName !== "ix:nonFraction") return text;
  const magnitude = Number(text.replaceAll(",", ""));
  return String(fact.getAttribute("sign") === "-" ? -magnitude : magnitude);
}

/**
 * The structural problems in an Inline XBRL document, as messages; empty when it has none.
 * @param {string} xhtml
 * @returns {string[]}
 */
export function ixbrlStructureProblems(xhtml) {
  let document;
  try {
    document = parseXmlDocument(xhtml);
  } catch (error) {
    return [`The document is not well-formed XML: ${error.message}`];
  }
  const problems = [];

  const headers = elements(document, "ix:header");
  if (headers.length !== 1) problems.push(`The document carries ${headers.length} ix:header elements, not one`);
  for (const header of headers) {
    const wrapper = header.parentNode;
    const style = (wrapper?.getAttribute?.("style") ?? "").replaceAll(" ", "");
    if (wrapper?.localName !== "div" || !style.includes("display:none")) {
      problems.push("The ix:header is not inside a div hidden with display:none");
    }
  }
  if (elements(document, "link:schemaRef").filter((ref) => ref.getAttribute("xlink:href")).length !== 1) {
    problems.push("The ix:references carries no single link:schemaRef with an xlink:href");
  }

  const contextIds = new Set(elements(document, "xbrli:context").map((context) => context.getAttribute("id")));
  const unitIds = new Set(elements(document, "xbrli:unit").map((unit) => unit.getAttribute("id")));
  const usedContexts = new Set();
  const valuesByKey = new Map();

  const facts = [...elements(document, "ix:nonFraction"), ...elements(document, "ix:nonNumeric")];
  for (const fact of facts) {
    const name = fact.getAttribute("name");
    const contextRef = fact.getAttribute("contextRef");
    if (!contextIds.has(contextRef)) problems.push(`${name} names the context ${contextRef}, which the header does not define`);
    usedContexts.add(contextRef);
    if (fact.nodeName === "ix:nonFraction") {
      const unitRef = fact.getAttribute("unitRef");
      if (!unitIds.has(unitRef)) problems.push(`${name} in ${contextRef} names the unit ${unitRef}, which the header does not define`);
      if (!fact.getAttribute("decimals")) problems.push(`${name} in ${contextRef} carries no decimals attribute`);
    }
    const transform = transformProblem(fact);
    if (transform) problems.push(`${name} in ${contextRef} ${transform}`);
    if (insideHeader(fact) && fact.parentNode.nodeName !== "ix:hidden") {
      problems.push(`${name} in ${contextRef} sits in the ix:header outside ix:hidden`);
    }
    const key = factKey(fact);
    const value = factValue(fact);
    if (valuesByKey.has(key) && valuesByKey.get(key) !== value) {
      problems.push(`${name} in ${contextRef} is reported twice with different values: ${valuesByKey.get(key)} and ${value}`);
    }
    valuesByKey.set(key, value);
  }
  for (const id of contextIds) {
    if (!usedContexts.has(id)) problems.push(`The context ${id} is defined and no fact uses it`);
  }

  for (const tag of FORBIDDEN_ELEMENTS) {
    if (elements(document, tag).length > 0) problems.push(`The document carries a <${tag}> element`);
  }
  if (/\s(src|href)="/.test(xhtml)) problems.push("The document references another file or page");
  if (/\son[a-z]+="/i.test(xhtml)) problems.push("The document carries an event handler attribute");

  return problems;
}
