// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/passMedia.test.js

import { describe, test, expect } from "vitest";
import { generateFrontSvg, generateBackSvg } from "@app/lib/passMedia.js";

const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><path d="M0 0h1v1z"/></svg>';

describe("lib/passMedia", () => {
  test("the front stacks one text line per word and grows with the word count", () => {
    const four = generateFrontSvg(["tiger", "happy", "mountain", "silver"]);
    const two = generateFrontSvg(["tiger", "happy"]);
    expect(four.match(/<text /g)).toHaveLength(4);
    expect(four).toContain('height="252"');
    expect(two).toContain('height="156"');
    expect(four).toContain(">mountain</text>");
  });

  test("the front escapes a word", () => {
    const svg = generateFrontSvg(['<b>"x"&']);
    expect(svg).toContain("&lt;b&gt;&quot;x&quot;&amp;");
    expect(svg).not.toContain("<b>");
  });

  test("the back nests the QR code and writes the code below it", () => {
    const svg = generateBackSvg(QR_SVG, "tiger-happy");
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg).toContain('<path d="M0 0h1v1z"/>');
    expect(svg).toContain(">tiger-happy</text>");
    expect(svg.startsWith("<svg ")).toBe(true);
  });

  test("the back escapes the code", () => {
    expect(generateBackSvg(QR_SVG, "<x>")).toContain("&lt;x&gt;");
  });
});
