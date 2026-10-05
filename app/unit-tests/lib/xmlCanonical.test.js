// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/xmlCanonical.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseXmlTree, canonicaliseElement, childElement, localName, XmlCanonicalError } from "@app/lib/xmlCanonical.js";

const FIXTURES = join(process.cwd(), "fixtures", "hmrc-transaction-engine");

function canonicalRoot(xml) {
  return canonicaliseElement(parseXmlTree(xml));
}

function canonicalChild(xml, name) {
  return canonicaliseElement(childElement(parseXmlTree(xml), name));
}

describe("canonicaliseElement", () => {
  test("reproduces HMRC's published canonical form of the IRmark worked example byte for byte", () => {
    const submission = readFileSync(join(FIXTURES, "irmarkexample-submission.xml"), "utf8");
    const expected = readFileSync(join(FIXTURES, "irmarkexample-canonicalised.xml"), "utf8");
    const body = childElement(parseXmlTree(submission), "Body");
    const canonical = canonicaliseElement(body, {
      exclude: (element) => localName(element.name) === "IRmark" && localName(element.parent.name) === "IRheader",
    });
    expect(canonical).toBe(expected);
  });

  test("carries the ancestors' namespace declarations onto the apex element", () => {
    const xml = '<a xmlns="urn:a" xmlns:p="urn:p"><b><c/></b></a>';
    expect(canonicalChild(xml, "b")).toBe('<b xmlns="urn:a" xmlns:p="urn:p"><c></c></b>');
  });

  test("renders a namespace declaration only where it changes what is in scope", () => {
    const xml = '<a xmlns="urn:a"><b xmlns="urn:a"><c xmlns="urn:c"/></b></a>';
    expect(canonicalRoot(xml)).toBe('<a xmlns="urn:a"><b><c xmlns="urn:c"></c></b></a>');
  });

  test('renders xmlns="" only when it undoes a default namespace', () => {
    expect(canonicalRoot('<a xmlns=""><b/></a>')).toBe("<a><b></b></a>");
    expect(canonicalRoot('<a xmlns="urn:a"><b xmlns=""/></a>')).toBe('<a xmlns="urn:a"><b xmlns=""></b></a>');
  });

  test("sorts namespace declarations by prefix and attributes by namespace then local name", () => {
    const xml = '<a z="1" xmlns:y="urn:b" xmlns:x="urn:a" y:k="2" x:k="3" b="4"/>';
    expect(canonicalRoot(xml)).toBe('<a xmlns:x="urn:a" xmlns:y="urn:b" b="4" z="1" x:k="3" y:k="2"></a>');
  });

  test("escapes text and attribute values the way C14N requires", () => {
    const xml = "<a v='&quot;x&apos;&#9;&#10;&#13;&lt;&gt;&amp;'>&lt;&gt;&amp;&#13;\"'<![CDATA[<raw>]]></a>";
    expect(canonicalRoot(xml)).toBe('<a v="&quot;x\'&#x9;&#xA;&#xD;&lt;>&amp;">&lt;&gt;&amp;&#xD;"\'&lt;raw&gt;</a>');
  });

  test("normalises line endings and literal whitespace in attribute values", () => {
    expect(canonicalRoot('<a v="x\r\ny\tz">1\r\n2\r3</a>')).toBe('<a v="x y z">1\n2\n3</a>');
  });

  test("drops comments and keeps processing instructions inside the element", () => {
    expect(canonicalRoot("<a><!-- note --><?pi  some data?><b/></a>")).toBe("<a><?pi some data?><b></b></a>");
  });

  test("carries inherited xml: attributes onto the apex element", () => {
    expect(canonicalChild('<a xml:lang="en"><b/></a>', "b")).toBe('<b xml:lang="en"></b>');
  });

  test("leaves out excluded elements and keeps the text around them", () => {
    const xml = "<a>\n  <skip>x</skip>\n  <keep/>\n</a>";
    const canonical = canonicaliseElement(parseXmlTree(xml), { exclude: (element) => element.name === "skip" });
    expect(canonical).toBe("<a>\n  \n  <keep></keep>\n</a>");
  });

  test("refuses a document with a DOCTYPE", () => {
    expect(() => parseXmlTree('<!DOCTYPE a [<!ENTITY e "x">]><a>&e;</a>')).toThrow(XmlCanonicalError);
  });

  test("refuses malformed documents", () => {
    expect(() => parseXmlTree("<a><b></a>")).toThrow(XmlCanonicalError);
    expect(() => parseXmlTree("<a>")).toThrow(XmlCanonicalError);
    expect(() => parseXmlTree('<a x="1" x="2"/>')).toThrow(XmlCanonicalError);
    expect(() => parseXmlTree("<a>&unknown;</a>")).toThrow(XmlCanonicalError);
    expect(() => canonicalRoot("<p:a/>")).toThrow(XmlCanonicalError);
  });
});
