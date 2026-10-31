// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { CapabilityError, assemble, formatHeader, kindOf, nextId, parseHeaders } from "../../scripts/lib/capabilityHeaders.mjs";
import { generateReport } from "../../scripts/capabilities-generate.mjs";

const fieldLines = (extra = []) => [
  "- **Use when:** a sample is needed.",
  "- **Does:** it does one thing.",
  "- **Run:** `npm run sample`",
  "- **Entry:** `scripts/sample.mjs`",
  "- **Files:** scripts/sample.mjs",
  "- **Keywords:** sample, demo",
  ...extra,
];
const entry = (id = "OPS-01", extra = ["- **Related:** OPS-02"]) => ({ id, name: "Do a sample thing", fields: fieldLines(extra) });
const file = (kind, e = entry()) => ["// SPDX", "", ...formatHeader(e, kind), "", "code();", ""].join("\n");

describe("capability headers", () => {
  it.each([
    ["scripts/a.js", "slash", "//"],
    ["infra/a.sh", "hash", "#"],
    ["infra/a.sql", "dash", "--"],
    ["docs/a.html", "html", "<!--"],
  ])("round-trips a header in %s", (path, kind, leader) => {
    const original = entry();
    const lines = formatHeader(original, kind);
    expect(lines[0].startsWith(`${leader} `)).toBe(true);
    expect(kindOf(path)).toBe(kind);
    const [parsed] = parseHeaders(path, file(kind));
    expect(parsed).toMatchObject({ id: original.id, name: original.name, fields: original.fields, home: path });
  });

  it("reads an entry without a Related field", () => {
    const [parsed] = parseHeaders("a.js", file("slash", entry("OPS-14a", [])));
    expect(parsed.id).toBe("OPS-14a");
    expect(parsed.fields).toHaveLength(6);
  });

  it("reads two stacked headers in one file", () => {
    const text = [...formatHeader(entry("OPS-01"), "hash"), "", ...formatHeader(entry("OPS-02"), "hash")].join("\n");
    expect(parseHeaders("a.yml", text).map((e) => e.id)).toEqual(["OPS-01", "OPS-02"]);
  });

  it("skips headers inside fenced code blocks in Markdown", () => {
    const fenced = ["```md", ...formatHeader(entry("OPS-01"), "html"), "```", "", ...formatHeader(entry("OPS-02"), "html")].join("\n");
    expect(parseHeaders("SKILL.md", fenced).map((e) => e.id)).toEqual(["OPS-02"]);
    const tilde = ["~~~", ...formatHeader(entry("OPS-01"), "html"), "~~~"].join("\n");
    expect(parseHeaders("SKILL.md", tilde)).toEqual([]);
  });

  it("rejects `-->` in an HTML body", () => {
    const bad = { ...entry(), fields: fieldLines().map((l) => l.replace("one thing", "one --> thing")) };
    expect(() => parseHeaders("a.md", formatHeader(bad, "html").join("\n"))).toThrow(/"-->"/);
  });

  it("rejects `\\u` in a `//` body", () => {
    const bad = { ...entry(), fields: fieldLines().map((l) => l.replace("one thing", "one \\u0041 thing")) };
    expect(() => parseHeaders("A.java", formatHeader(bad, "slash").join("\n"))).toThrow(/"\\u"/);
    expect(() => parseHeaders("a.sh", formatHeader(bad, "hash").join("\n"))).not.toThrow();
  });

  it("rejects a field out of order", () => {
    const [first, second, ...rest] = fieldLines();
    const bad = { ...entry(), fields: [second, first, ...rest] };
    expect(() => parseHeaders("a.js", formatHeader(bad, "slash").join("\n"))).toThrow(/out of order/);
  });

  it("rejects a missing required field, trailing whitespace and an unterminated header", () => {
    const short = { ...entry(), fields: fieldLines().slice(0, 5) };
    expect(() => parseHeaders("a.js", formatHeader(short, "slash").join("\n"))).toThrow(/no Keywords field/);
    const padded = { ...entry(), fields: fieldLines().map((l) => `${l} `) };
    expect(() => parseHeaders("a.js", formatHeader(padded, "slash").join("\n"))).toThrow(/trailing space/);
    expect(() => parseHeaders("a.js", formatHeader(entry(), "slash").slice(0, -1).join("\n"))).toThrow(/no \/\/ @end-capability line/);
  });
});

describe("capability assembly", () => {
  const skeleton = [
    "# Report",
    "",
    "## Operations (OPS)",
    "",
    "### Group (OPS)",
    "",
    "<!-- capability OPS-01 -->",
    "<!-- capability OPS-02 -->",
    "",
  ].join("\n");
  const withHome = (id, home = `${id}.js`) => ({ ...entry(id), home, line: 1 });

  it("replaces each slot with its entry in skeleton order", () => {
    const out = assemble(skeleton, [withHome("OPS-02"), withHome("OPS-01")]);
    expect(out.indexOf("#### OPS-01 ")).toBeLessThan(out.indexOf("#### OPS-02 "));
    expect(out).not.toContain("<!-- capability");
  });

  it("raises on a duplicate id", () => {
    expect(() => assemble(skeleton, [withHome("OPS-01", "a.js"), withHome("OPS-01", "b.js"), withHome("OPS-02")])).toThrow(
      /duplicate OPS-01/,
    );
  });

  it("raises on a prefix that differs from the area's", () => {
    const wrong = skeleton.replace("<!-- capability OPS-02 -->", "<!-- capability DATA-02 -->");
    expect(() => assemble(wrong, [withHome("OPS-01"), withHome("DATA-02")])).toThrow(/prefix mismatch: DATA-02/);
  });

  it("raises on a slot with no header", () => {
    expect(() => assemble(skeleton, [withHome("OPS-01")])).toThrow(/slot OPS-02 has no header/);
  });

  it("raises on a header with no slot", () => {
    expect(() => assemble(skeleton, [withHome("OPS-01"), withHome("OPS-02"), withHome("OPS-03", "c.js")])).toThrow(
      /header OPS-03 in c\.js:1 has no skeleton slot/,
    );
  });

  it("raises a CapabilityError", () => {
    expect(() => assemble(skeleton, [])).toThrow(CapabilityError);
  });

  it("numbers the next id after the highest in the area", () => {
    expect(nextId([withHome("OPS-09"), withHome("OPS-130"), withHome("DATA-200")], "OPS")).toBe("OPS-131");
    expect(nextId([], "OPS")).toBe("OPS-01");
  });

  it("generates the contents blocks from the entries", () => {
    const marked = [
      "## Index",
      "<!-- generated:index -->",
      "<!-- /generated:index -->",
      "## Operations (OPS)",
      "<!-- generated:area OPS -->",
      "<!-- /generated:area OPS -->",
      "### Group (OPS)",
      "<!-- generated:group group-ops -->",
      "<!-- /generated:group group-ops -->",
      "<!-- capability OPS-01 -->",
      "## Keywords",
      "<!-- generated:keywords -->",
      "<!-- /generated:keywords -->",
      "",
    ].join("\n");
    const out = generateReport(marked, [withHome("OPS-01")]);
    expect(out).toContain("[OPS-01](#ops-01-do-a-sample-thing) Do a sample thing: use when a sample is needed.");
    expect(out).toContain("- demo: [OPS-01](#ops-01-do-a-sample-thing)");
  });
});
