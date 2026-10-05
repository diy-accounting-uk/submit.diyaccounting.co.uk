// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/ct600Xml.test.js

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import TOML from "@iarna/toml";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import {
  deriveCt600Boxes,
  deriveCompanyTaxReturn,
  buildCt600IrEnvelope,
  CT600_BOX_PATHS,
  CT600_NAMESPACE,
  Ct600RefusedError,
} from "@app/services/ct600Xml.js";
import { parseXmlDocument } from "@app/lib/xmlDom.js";

const BOOK_DIRECTORY = join(process.cwd(), "fixtures", "diya-gl", "precision-code-ltd");
const CT600_TOML = join(process.cwd(), "node_modules", "@diy-accounting-uk", "diya-gl", "dist", "app", "data", "filing", "ct600-v3.toml");

const COMPANY = {
  companyName: "Precision Code Ltd",
  companyNumber: "12345678",
  utr: "8596148860",
  companyType: 0,
  declarantName: "Carol Smith",
  declarantStatus: "Director",
};

let results;

beforeAll(async () => {
  const { book, lines } = loadDiyaGlData(BOOK_DIRECTORY);
  results = calculatedResultsFor(book, lines, await loadTaxDataForBook(book));
});

function withResults(changes) {
  const copy = structuredClone(results);
  for (const [sheet, cells] of Object.entries(changes)) Object.assign(copy[sheet], cells);
  return copy;
}

// An Excel serial day for an ISO date, as diya-gl's sheets carry dates.
function serial(isoDate) {
  return (Date.parse(`${isoDate}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function valueAt(document, path) {
  const [rootName, ...segments] = path.split("/").filter(Boolean);
  let node = document.documentElement;
  if (node.localName !== rootName) return undefined;
  for (const segment of segments) {
    node = Array.from(node.children).find((child) => child.localName === segment);
    if (!node) return undefined;
  }
  return node.textContent;
}

function buildDocument(boxes) {
  return parseXmlDocument(
    buildCt600IrEnvelope({ boxes, accountsIxbrl: "<html>accounts</html>", computationsIxbrl: "<html>computations</html>" }),
  );
}

describe("deriveCt600Boxes for a Company book in the marginal relief band", () => {
  test("fills the boxes from the book and the typed facts", async () => {
    const { boxes, periodStart, periodEnd } = await deriveCompanyTaxReturn(loadDiyaGlData(BOOK_DIRECTORY), COMPANY);
    expect(periodStart).toBe("2025-04-01");
    expect(periodEnd).toBe("2026-03-31");
    expect(boxes).toEqual({
      1: "Precision Code Ltd",
      2: "12345678",
      3: "8596148860",
      4: 0,
      30: "2025-04-01",
      35: "2026-03-31",
      145: 341283,
      155: 123480,
      165: 123480,
      170: 340,
      235: 123820,
      300: 123820,
      315: 123820,
      326: 0,
      329: "yes",
      330: 2025,
      335: 123820,
      340: 25,
      345: 30955,
      430: 30955,
      435: 1892.7,
      440: 29062.3,
      475: 29062.3,
      510: 29062.3,
      515: 64.51,
      525: 28997.79,
      528: 28997.79,
      600: 28997.79,
      690: 52500,
      705: 11500,
      975: "Carol Smith",
      985: "Director",
    });
  });

  test("works the tax rows by HMRC's rules from box 315", () => {
    const { boxes } = deriveCt600Boxes({ results, company: COMPANY });
    expect(boxes[165]).toBe(boxes[155] - (boxes[160] ?? 0));
    expect(boxes[235]).toBe(boxes[165] + boxes[170]);
    expect(boxes[315]).toBe(boxes[335]);
    expect(boxes[345]).toBe((boxes[335] * boxes[340]) / 100);
    expect(boxes[430]).toBe(boxes[345]);
    // Marginal relief: (upper limit - augmented profits) x taxable / augmented x 3/200.
    expect(boxes[435]).toBe(Math.round((250000 - boxes[315]) * 0.015 * 100) / 100);
    expect(boxes[440]).toBeCloseTo(boxes[430] - boxes[435], 2);
    expect(boxes[525]).toBeCloseTo(boxes[510] - boxes[515], 2);
  });

  test("takes tax already paid off the amount outstanding", () => {
    const { boxes } = deriveCt600Boxes({ results, company: { ...COMPANY, taxAlreadyPaid: 10000 } });
    expect(boxes[595]).toBe(10000);
    expect(boxes[600]).toBeCloseTo(18997.79, 2);
  });
});

describe("deriveCt600Boxes for other shapes of book", () => {
  test("charges the small profits rate and claims it in box 329 below the lower limit", () => {
    const small = withResults({ CorporationTax: { K22: 30000, K24: 0, K28: 30000, K35: 5700, K37: 0 }, CT600: { Z72: 0 } });
    small["PubP&L"].F49 = small["PubP&L"].F49 - 123480.3916666666 + 30000 - 339.51;
    const { boxes } = deriveCt600Boxes({ results: small, company: COMPANY });
    expect(boxes[315]).toBe(30000);
    expect(boxes[340]).toBe(19);
    expect(boxes[345]).toBe(5700);
    expect(boxes[329]).toBe("yes");
    expect(boxes[435]).toBeUndefined();
    expect(boxes[170]).toBeUndefined();
    expect(boxes[515]).toBeUndefined();
  });

  test("splits a period straddling 1 April between financial years by days, rounding half up", () => {
    const straddling = withResults({
      CT600: { B33: serial("2025-01-01"), M33: serial("2025-12-31") },
      Admin: { P6: 19, R6: 25, S6: 0.015, T6: 50000, U6: 250000, P7: 19, R7: 25, S7: 0.015, T7: 50000, U7: 250000 },
    });
    const { boxes } = deriveCt600Boxes({ results: straddling, company: COMPANY });
    const firstShare = Math.round((123820 * 90) / 365);
    expect(boxes[330]).toBe(2024);
    expect(boxes[335]).toBe(firstShare);
    expect(boxes[380]).toBe(2025);
    expect(boxes[385]).toBe(123820 - firstShare);
    expect(boxes[335] + boxes[385]).toBe(boxes[315]);
    expect(boxes[327]).toBe(0);
    expect(boxes[328]).toBe(0);
    expect(boxes[326]).toBeUndefined();
    expect(boxes[430]).toBe((boxes[335] * boxes[340] + boxes[385] * boxes[390]) / 100);
  });

  test("files a nil return with the mandatory boxes at zero when there is no profit", () => {
    const nil = withResults({ CorporationTax: { K22: 0, K24: 0, K28: 0, K35: 0, K37: 0, K20: 0, I7: 0, I8: 0, I9: 0 }, CT600: { Z72: 0 } });
    nil["PubP&L"].F49 = 0;
    const { boxes } = deriveCt600Boxes({ results: nil, company: COMPANY });
    expect(boxes[315]).toBe(0);
    expect(boxes[155]).toBeUndefined();
    expect(boxes[330]).toBeUndefined();
    expect(boxes[440]).toBe(0);
    expect(boxes[525]).toBe(0);
  });
});

describe("deriveCt600Boxes refuses a book outside a small trading company's return", () => {
  test.each([
    ["a book with no CT600 sheet", () => ({ ...results, CT600: undefined }), /only a Company \(ltd\) book/],
    ["a trading loss", () => withResults({ CorporationTax: { K22: -100 } }), /trading loss/],
    ["net non-trading loan debits", () => withResults({ CorporationTax: { K24: -5 } }), /non-trading loan relationship debits/],
    ["a period over 12 months", () => withResults({ CT600: { M33: serial("2026-04-30") } }), /longer than 12 months/],
    [
      "a period starting before 1 April 2015",
      () => withResults({ CT600: { B33: serial("2015-01-01"), M33: serial("2015-12-31") } }),
      /on or after 2015-04-01/,
    ],
    [
      "a working sheet whose trading profit disagrees",
      () => withResults({ CorporationTax: { K22: 200000 } }),
      /disagrees with the working sheet/,
    ],
    ["a working sheet whose tax disagrees", () => withResults({ CorporationTax: { K35: 1000 } }), /Corporation Tax .* disagrees/],
  ])("%s", (_label, makeResults, message) => {
    expect(() => deriveCt600Boxes({ results: makeResults(), company: COMPANY })).toThrow(message);
  });

  test("a company type other than 0", () => {
    expect(() => deriveCt600Boxes({ results, company: { ...COMPANY, companyType: 6 } })).toThrow(Ct600RefusedError);
  });

  test("more tax already paid than the return charges", () => {
    expect(() => deriveCt600Boxes({ results, company: { ...COMPANY, taxAlreadyPaid: 50000 } })).toThrow(/repayment boxes/);
  });

  test("missing typed facts", () => {
    expect(() => deriveCt600Boxes({ results, company: { ...COMPANY, utr: "12" } })).toThrow(/UTR/);
    expect(() => deriveCt600Boxes({ results, company: { ...COMPANY, declarantName: "" } })).toThrow(/declarant's name/);
  });
});

describe("buildCt600IrEnvelope", () => {
  test("writes every box at the element diya-gl's ct600-v3.toml names for it", () => {
    const toml = TOML.parse(readFileSync(CT600_TOML, "utf8"));
    const tomlPaths = Object.fromEntries(toml.box.map((box) => [box.number, box.xmlPath]));
    const { boxes } = deriveCt600Boxes({ results, company: { ...COMPANY, taxAlreadyPaid: 100 } });
    const document = buildDocument(boxes);
    for (const [box, value] of Object.entries(boxes)) {
      const path = CT600_BOX_PATHS[box];
      expect(path, `box ${box} has a path`).toBeDefined();
      const compositeParent = path.slice(0, path.lastIndexOf("/"));
      expect([path, compositeParent], `box ${box} matches the toml`).toContain(tomlPaths[box]);
      const written = valueAt(document, path);
      const expected = typeof value === "number" && ![4, 326, 327, 328, 330, 380].includes(Number(box)) ? value.toFixed(2) : String(value);
      expect(written, `box ${box}`).toBe(expected);
    }
  });

  test("writes the header, the attachments and an empty IRmark", () => {
    const { boxes } = deriveCt600Boxes({ results, company: COMPANY });
    const xml = buildCt600IrEnvelope({ boxes, accountsIxbrl: "<html>accounts</html>", computationsIxbrl: "<html>computations</html>" });
    const document = parseXmlDocument(xml);
    expect(document.documentElement.namespaceURI).toBe(CT600_NAMESPACE);
    expect(valueAt(document, "/IRenvelope/IRheader/Keys/Key")).toBe("8596148860");
    expect(valueAt(document, "/IRenvelope/IRheader/PeriodEnd")).toBe("2026-03-31");
    expect(valueAt(document, "/IRenvelope/IRheader/Sender")).toBe("Company");
    expect(xml).toContain('<IRmark Type="generic"></IRmark>');
    expect(document.documentElement.querySelector("CompanyTaxReturn").getAttribute("ReturnType")).toBe("new");
    expect(valueAt(document, "/IRenvelope/CompanyTaxReturn/ReturnInfoSummary/Accounts/ThisPeriodAccounts")).toBe("yes");
    expect(valueAt(document, "/IRenvelope/CompanyTaxReturn/ReturnInfoSummary/Computations/ThisPeriodComputations")).toBe("yes");
    expect(valueAt(document, "/IRenvelope/CompanyTaxReturn/Declaration/AcceptDeclaration")).toBe("yes");
    const submission = Array.from(document.documentElement.querySelector("XBRLsubmission").children).map((child) => child.localName);
    expect(submission).toEqual(["Computation", "Accounts"]);
    const encoded = valueAt(
      document,
      "/IRenvelope/CompanyTaxReturn/AttachedFiles/XBRLsubmission/Accounts/Instance/EncodedInlineXBRLDocument",
    );
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe("<html>accounts</html>");
  });

  test("escapes the typed text", () => {
    const { boxes } = deriveCt600Boxes({ results, company: { ...COMPANY, companyName: "Smith & Jones <Ltd>" } });
    expect(valueAt(buildDocument(boxes), CT600_BOX_PATHS[1])).toBe("Smith & Jones <Ltd>");
  });

  test("refuses a return without both attachments", () => {
    const { boxes } = deriveCt600Boxes({ results, company: COMPANY });
    expect(() => buildCt600IrEnvelope({ boxes, accountsIxbrl: "", computationsIxbrl: "<html/>" })).toThrow(/accounts and the computations/);
  });
});
