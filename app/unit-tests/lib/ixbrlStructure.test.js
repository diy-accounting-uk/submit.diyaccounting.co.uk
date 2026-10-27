// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/ixbrlStructure.test.js

import { describe, test, expect } from "vitest";
import { ixbrlStructureProblems } from "@app/lib/ixbrlStructure.js";
import { accountsDocumentCases, computationsDocumentCase } from "@app/test-helpers/accountsDocumentCases.js";

describe("ixbrlStructureProblems", () => {
  const cases = accountsDocumentCases();

  test.each(cases.map((documentCase) => [documentCase.name, documentCase.xhtml]))(
    "the %s document has no structural problem",
    (_, xhtml) => {
      expect(ixbrlStructureProblems(xhtml)).toEqual([]);
    },
  );

  test("the CT computations document has no structural problem", () => {
    expect(ixbrlStructureProblems(computationsDocumentCase())).toEqual([]);
  });

  const micro = cases.find((documentCase) => documentCase.name === "micro-entity-accounts").xhtml;

  test("reports a document that is not well-formed", () => {
    expect(ixbrlStructureProblems(micro.replace("</body>", ""))[0]).toMatch(/not well-formed/);
  });

  test("reports an ix:header in the visible body", () => {
    expect(ixbrlStructureProblems(micro.replace('<div style="display:none">', "<div>"))).toContain(
      "The ix:header is not inside a div hidden with display:none",
    );
  });

  test("reports a fact whose context or unit the header does not define", () => {
    const broken = micro.replace('contextRef="e2025" unitRef="GBP"', 'contextRef="e1999" unitRef="EUR"');
    const problems = ixbrlStructureProblems(broken);
    expect(problems.some((problem) => problem.includes("names the context e1999"))).toBe(true);
    expect(problems.some((problem) => problem.includes("names the unit EUR"))).toBe(true);
  });

  test("reports a context no fact uses", () => {
    const extra = micro.replace(
      "<xbrli:unit ",
      '<xbrli:context id="unused"><xbrli:entity><xbrli:identifier scheme="http://www.companieshouse.gov.uk/">03176906</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context><xbrli:unit ',
    );
    expect(ixbrlStructureProblems(extra)).toContain("The context unused is defined and no fact uses it");
  });

  test("reports a missing schemaRef", () => {
    expect(ixbrlStructureProblems(micro.replace(/<link:schemaRef[^>]*\/>/, ""))).toContain(
      "The ix:references carries no single link:schemaRef with an xlink:href",
    );
  });

  test("reports a figure its transform cannot read and duplicate facts that disagree", () => {
    const problems = ixbrlStructureProblems(micro.replace(">6,000</ix:nonFraction>", ">1.000,00</ix:nonFraction>"));
    expect(problems.some((problem) => problem.includes("which ixt2:numdotdecimal cannot read"))).toBe(true);
    const duplicated = micro.replace(
      "</body>",
      '<p><ix:nonFraction name="core:FixedAssets" contextRef="e2025" unitRef="GBP" decimals="0">7</ix:nonFraction></p></body>',
    );
    expect(ixbrlStructureProblems(duplicated).some((problem) => problem.includes("reported twice with different values"))).toBe(true);
  });

  test("reports a script, a hyperlink and an image", () => {
    const adorned = micro.replace(
      "</body>",
      '<p><a href="https://example.com">site</a><img src="logo.png" alt=""/></p><script>1</script></body>',
    );
    const problems = ixbrlStructureProblems(adorned);
    expect(problems).toEqual(
      expect.arrayContaining([
        "The document carries a <script> element",
        "The document carries a <a> element",
        "The document carries a <img> element",
        "The document references another file or page",
      ]),
    );
  });
});
