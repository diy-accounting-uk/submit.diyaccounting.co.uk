// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import {
  parseArgs,
  parseKeywordsList,
  readKeywordsFile,
  resolveKeywords,
  parseBudgetGbp,
  defaultForecastPeriod,
  buildHistoricalMetricsRequest,
  buildForecastMetricsRequest,
  shapeHistoricalMetrics,
  shapeForecastMetrics,
  buildForecastReport,
  GEO_TARGET_CONSTANT_UK,
  LANGUAGE_CONSTANT_ENGLISH,
} from "../../../infra/google/ads/ads-forecast.js";

describe("ads-forecast parseArgs", () => {
  it("reads --keywords and --budget-gbp", () => {
    expect(parseArgs(["--keywords", "a,b", "--budget-gbp", "50"])).toEqual({
      keywords: "a,b",
      keywordsFile: undefined,
      budgetGbp: "50",
      clientFile: undefined,
    });
  });
  it("reads --keywords-file", () => {
    expect(parseArgs(["--keywords-file", "/tmp/keywords.txt", "--budget-gbp", "50"]).keywordsFile).toBe("/tmp/keywords.txt");
  });
  it("reads --client-file with its path", () => {
    expect(parseArgs(["--keywords", "a", "--budget-gbp", "1", "--client-file", "/tmp/client.json"]).clientFile).toBe("/tmp/client.json");
  });
  it("fails when neither --keywords nor --keywords-file is given", () => {
    expect(() => parseArgs(["--budget-gbp", "50"])).toThrow(/one of --keywords or --keywords-file is required/);
  });
  it("fails when both --keywords and --keywords-file are given", () => {
    expect(() => parseArgs(["--keywords", "a", "--keywords-file", "/tmp/k.txt", "--budget-gbp", "50"])).toThrow(/mutually exclusive/);
  });
  it("fails when --budget-gbp is missing", () => {
    expect(() => parseArgs(["--keywords", "a"])).toThrow(/--budget-gbp is required/);
  });
  it("fails when --keywords has no value", () => {
    expect(() => parseArgs(["--keywords"])).toThrow(/--keywords requires/);
  });
  it("fails when --budget-gbp has no value", () => {
    expect(() => parseArgs(["--keywords", "a", "--budget-gbp"])).toThrow(/--budget-gbp requires/);
  });
  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("ads-forecast parseKeywordsList", () => {
  it("splits on commas and trims", () => {
    expect(parseKeywordsList(" submit vat return , mtd vat software ,")).toEqual(["submit vat return", "mtd vat software"]);
  });
});

describe("ads-forecast readKeywordsFile", () => {
  it("reads one keyword per line, dropping blank lines", () => {
    const readFileSync = () => "submit vat return\n\nmtd vat software\n  \n";
    expect(readKeywordsFile("/tmp/keywords.txt", readFileSync)).toEqual(["submit vat return", "mtd vat software"]);
  });
});

describe("ads-forecast resolveKeywords", () => {
  it("prefers --keywords when given", () => {
    expect(resolveKeywords({ keywords: "a,b", keywordsFile: undefined })).toEqual(["a", "b"]);
  });
  it("reads --keywords-file when --keywords is absent", () => {
    const readFileSync = () => "a\nb\n";
    expect(resolveKeywords({ keywords: undefined, keywordsFile: "/tmp/k.txt" }, readFileSync)).toEqual(["a", "b"]);
  });
  it("fails when the resolved list is empty", () => {
    expect(() => resolveKeywords({ keywords: " , ", keywordsFile: undefined })).toThrow(/no keywords given/);
  });
});

describe("ads-forecast parseBudgetGbp", () => {
  it("parses a positive number", () => {
    expect(parseBudgetGbp("50")).toBe(50);
  });
  it("rejects zero", () => {
    expect(() => parseBudgetGbp("0")).toThrow(/positive number/);
  });
  it("rejects a non-numeric value", () => {
    expect(() => parseBudgetGbp("fifty")).toThrow(/positive number/);
  });
});

describe("ads-forecast defaultForecastPeriod", () => {
  it("starts tomorrow and runs 30 days", () => {
    expect(defaultForecastPeriod(new Date("2026-09-23T10:00:00Z"))).toEqual({ from: "2026-09-24", to: "2026-10-23" });
  });
});

describe("ads-forecast buildHistoricalMetricsRequest", () => {
  it("targets the UK and English for the given keywords", () => {
    expect(buildHistoricalMetricsRequest(["submit vat return", "mtd vat software"])).toEqual({
      keywords: ["submit vat return", "mtd vat software"],
      language: LANGUAGE_CONSTANT_ENGLISH,
      geoTargetConstants: [GEO_TARGET_CONSTANT_UK],
      keywordPlanNetwork: "GOOGLE_SEARCH",
    });
    expect(LANGUAGE_CONSTANT_ENGLISH).toBe("languageConstants/1000");
    expect(GEO_TARGET_CONSTANT_UK).toBe("geoTargetConstants/2826");
  });
});

describe("ads-forecast buildForecastMetricsRequest", () => {
  it("builds a maximize-clicks campaign at the daily budget, for the given period", () => {
    const request = buildForecastMetricsRequest(["submit vat return"], 50, { from: "2026-09-24", to: "2026-10-23" });
    expect(request).toEqual({
      forecastPeriod: { startDate: "2026-09-24", endDate: "2026-10-23" },
      campaign: {
        languageConstants: [LANGUAGE_CONSTANT_ENGLISH],
        geoTargetConstants: [GEO_TARGET_CONSTANT_UK],
        biddingStrategy: { maximizeClicksBiddingStrategy: { dailyTargetSpendMicros: "50000000" } },
        adGroups: [{ keywords: [{ text: "submit vat return", matchType: "BROAD" }] }],
      },
    });
  });
});

describe("ads-forecast shapeHistoricalMetrics", () => {
  it("converts bid micros to pounds and carries the search volume and competition through", () => {
    const body = {
      results: [
        {
          text: "submit vat return",
          closeVariants: ["file vat return"],
          keywordMetrics: {
            avgMonthlySearches: "1300",
            competition: "MEDIUM",
            competitionIndex: "42",
            lowTopOfPageBidMicros: "450000",
            highTopOfPageBidMicros: "1200000",
          },
        },
      ],
    };
    expect(shapeHistoricalMetrics(body)).toEqual([
      {
        text: "submit vat return",
        closeVariants: ["file vat return"],
        avgMonthlySearches: 1300,
        competition: "MEDIUM",
        competitionIndex: 42,
        lowTopOfPageBidGbp: 0.45,
        highTopOfPageBidGbp: 1.2,
      },
    ]);
  });

  it("answers null competitionIndex when the field is absent", () => {
    const body = { results: [{ text: "x", keywordMetrics: {} }] };
    expect(shapeHistoricalMetrics(body)[0].competitionIndex).toBeNull();
  });

  it("answers an empty array when there are no results", () => {
    expect(shapeHistoricalMetrics({})).toEqual([]);
  });
});

describe("ads-forecast shapeForecastMetrics", () => {
  it("converts cost and average CPC micros to pounds", () => {
    const body = { campaignForecastMetrics: { clicks: 128.4, costMicros: "45000000", averageCpcMicros: "350000" } };
    expect(shapeForecastMetrics(body)).toEqual({ clicks: 128.4, costGbp: 45, averageCpcGbp: 0.35 });
  });

  it("answers zeroed metrics when the response carries none", () => {
    expect(shapeForecastMetrics({})).toEqual({ clicks: 0, costGbp: 0, averageCpcGbp: 0 });
  });
});

describe("ads-forecast buildForecastReport", () => {
  it("carries every field through unchanged", () => {
    const report = buildForecastReport({
      keywords: ["a"],
      budgetGbp: 50,
      period: { from: "2026-09-24", to: "2026-10-23" },
      historical: [1],
      forecast: { clicks: 2 },
    });
    expect(report).toEqual({
      keywords: ["a"],
      budgetGbp: 50,
      period: { from: "2026-09-24", to: "2026-10-23" },
      historical: [1],
      forecast: { clicks: 2 },
    });
  });
});
