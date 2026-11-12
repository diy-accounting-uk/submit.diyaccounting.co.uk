// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  VIEW_PATH,
  loadRanges,
  normaliseCidrs,
  parseAnthropicOutboundMarkdown,
  parsePrefixesJson,
  refreshRanges,
  renderViewSql,
  viewIsStale,
} from "../../scripts/ai-vendor-ranges.mjs";

describe("ai vendor ranges", () => {
  test("the committed view matches the committed ranges", () => {
    expect(viewIsStale(loadRanges(), readFileSync(VIEW_PATH, "utf-8"))).toBe(false);
  });

  test("a changed range makes the view stale", () => {
    const ranges = loadRanges();
    ranges.sources[0].cidrs = [...ranges.sources[0].cidrs, "192.0.2.0/24"];
    expect(viewIsStale(ranges, readFileSync(VIEW_PATH, "utf-8"))).toBe(true);
  });

  test("the view holds one row per agent and range", () => {
    const sql = renderViewSql({ sources: [{ agents: ["A", "B"], cidrs: ["192.0.2.0/24", "2001:db8::/32"] }] });
    expect(sql).toContain("('A', '192.0.2.0/24')");
    expect(sql).toContain("('B', '2001:db8::/32')");
  });

  test("parses the prefixes list of IPv4 and IPv6 ranges", () => {
    const text = JSON.stringify({ prefixes: [{ ipv4Prefix: "192.0.2.0/24" }, { ipv6Prefix: "2001:db8::/32" }] });
    expect(parsePrefixesJson(text)).toEqual(["192.0.2.0/24", "2001:db8::/32"]);
  });

  test("reads only the outbound addresses from the Anthropic page", () => {
    const text = [
      "## Inbound IP addresses",
      "`10.0.0.0/23`",
      "## Outbound IP addresses",
      "### IPv4",
      "`160.79.104.0/21`",
      "### Phased out IP addresses",
      "```text",
      "34.162.46.92/32",
      "```",
    ].join("\n");
    expect(parseAnthropicOutboundMarkdown(text)).toEqual(["160.79.104.0/21"]);
  });

  test("rejects text that is not a range", () => {
    expect(() => normaliseCidrs(["not-a-range"])).toThrow(/not a CIDR/);
  });

  test("a list that returns no ranges fails the refresh", async () => {
    const ranges = { sources: [{ agents: ["A"], url: "u", format: "prefixes-json", cidrs: [] }] };
    await expect(refreshRanges(ranges, async () => JSON.stringify({ prefixes: [] }))).rejects.toThrow(/no ranges/);
  });
});
