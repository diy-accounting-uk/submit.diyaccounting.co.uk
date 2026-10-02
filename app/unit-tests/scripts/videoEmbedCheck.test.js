// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { compareEmbeds, extractEmbedId, groupAreaPageMatches, parseArgs } from "../../../scripts/video-embed-check.js";

const areaPages = ["videos-hmrc-vat.html", "videos-hmrc-itsa.html", "videos-account.html", "videos-ch.html"];

function scenario(overrides = {}) {
  return {
    channelVideos: [
      { videoId: "aaa", title: "VAT", privacyStatus: "public" },
      { videoId: "bbb", title: "Account", privacyStatus: "public" },
    ],
    manifestVideos: [
      { id: "vat-one", group: "vat", videoId: "aaa" },
      { id: "account-one", group: "account", videoId: "bbb" },
    ],
    areaPages,
    embeds: new Map([
      ["aaa", "videos-hmrc-vat.html"],
      ["bbb", "videos-account.html"],
    ]),
    oembedStatus: new Map([
      ["aaa", 200],
      ["bbb", 200],
    ]),
    ...overrides,
  };
}

describe("compareEmbeds", () => {
  it("passes when every video is embedded and playable", () => {
    const { rows, problems } = compareEmbeds(scenario());
    expect(problems).toEqual([]);
    expect(rows.map((r) => r.ok)).toEqual([true, true]);
  });

  it("fails a public channel video that is embedded nowhere", () => {
    const { problems } = compareEmbeds(
      scenario({ channelVideos: [...scenario().channelVideos, { videoId: "ccc", title: "Orphan", privacyStatus: "public" }] }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("ccc");
  });

  it("passes a private or unlisted channel video that is embedded nowhere", () => {
    const channelVideos = [
      ...scenario().channelVideos,
      { videoId: "ddd", title: "Draft", privacyStatus: "private" },
      { videoId: "eee", title: "Unlisted", privacyStatus: "unlisted" },
    ];
    expect(compareEmbeds(scenario({ channelVideos })).problems).toEqual([]);
  });

  it("fails a manifest video that is embedded nowhere", () => {
    const { problems, rows } = compareEmbeds(scenario({ embeds: new Map([["aaa", "videos-hmrc-vat.html"]]) }));
    expect(problems.some((p) => p.includes("account-one"))).toBe(true);
    expect(rows.find((r) => r.id === "account-one").ok).toBe(false);
  });

  it("fails a manifest group with no linked area page", () => {
    const manifestVideos = [...scenario().manifestVideos, { id: "ch-one", group: "companies-house", videoId: null }];
    const { problems } = compareEmbeds(scenario({ manifestVideos, areaPages: areaPages.filter((p) => p !== "videos-ch.html") }));
    expect(problems).toEqual(["manifest group companies-house has no area page linked from videos.html"]);
  });

  it("fails an embedded video whose oEmbed answers 404", () => {
    const { problems } = compareEmbeds(
      scenario({
        oembedStatus: new Map([
          ["aaa", 404],
          ["bbb", 200],
        ]),
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("404");
  });
});

describe("helpers", () => {
  it("maps each manifest group to its area page", () => {
    expect(groupAreaPageMatches("vat", areaPages)).toBe("videos-hmrc-vat.html");
    expect(groupAreaPageMatches("itsa", areaPages)).toBe("videos-hmrc-itsa.html");
    expect(groupAreaPageMatches("companies-house", areaPages)).toBe("videos-ch.html");
    expect(groupAreaPageMatches("account", areaPages)).toBe("videos-account.html");
  });

  it("reads the video id from an embed URL", () => {
    expect(extractEmbedId("https://www.youtube-nocookie.com/embed/abc123?rel=0")).toBe("abc123");
    expect(extractEmbedId("https://example.com/")).toBeNull();
  });

  it("defaults the base URL and normalises a trailing slash", () => {
    expect(parseArgs([]).base).toBe("https://submit.diyaccounting.co.uk/");
    expect(parseArgs(["--base", "https://ci.example.com"]).base).toBe("https://ci.example.com/");
  });
});
