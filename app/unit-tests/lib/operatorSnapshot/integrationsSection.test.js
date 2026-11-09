// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  buildIntegrationSummarySql,
  buildIntegrationCallsSql,
  shapeIntegrationsSection,
  shapeHeaderChecks,
  headerCheckPartitionKeys,
  INTEGRATION_ORGS,
} from "@app/lib/operatorSnapshot/integrationsSection.js";

const windows = [
  ["today", (day) => `${day} >= TODAY`],
  ["prev_1", (day) => `${day} = YESTERDAY`],
  ["last_7", (day) => `${day} > D7`],
  ["last_30", (day) => `${day} > D30`],
  ["prev_30", (day) => `${day} > D60`],
  ["last_90", (day) => `${day} > D90`],
  ["prev_90", (day) => `${day} > D180`],
];

const toWindows = (row) => ({
  today: { value: Number(row.today) },
  previousDay: { value: Number(row.prev_1) },
  last7: { value: Number(row.last_7) },
  last30: { value: Number(row.last_30), trend: null },
  last90: { value: Number(row.last_90), trend: null },
});

describe("integrationsSection", () => {
  test("the summary query counts live calls in each window by organisation and status", () => {
    const sql = buildIntegrationSummarySql(windows);
    expect(sql).toContain("FROM   v_integration_calls_daily");
    expect(sql).toContain("target = 'live'");
    expect(sql).toContain("sum(CASE WHEN day >= TODAY THEN calls END)");
    expect(sql).toContain("GROUP  BY 1, 2");
  });

  test("the calls query takes the newest 100 and the newest 100 failed of 30 days", () => {
    const sql = buildIntegrationCallsSql();
    expect(sql).toContain("recent_rank <= 100");
    expect(sql).toContain("failed_rank <= 100");
    expect(sql).toContain("date_add('day', -30, current_date)");
    expect(sql).not.toContain("raw");
  });

  test("the section orders the summary by organisation then status, with outcomes after numbers", () => {
    const row = (org, status) => ({ org, status, today: "1", prev_1: "2", last_7: "3", last_30: "4", last_90: "5" });
    const section = shapeIntegrationsSection({
      summaryRows: [row("stripe", "200"), row("hmrc", "timeout"), row("hmrc", "500"), row("hmrc", "200")],
      callRows: [],
      tableName: "prod-env-integration-calls",
      region: "eu-west-2",
      toWindows,
    });
    expect(section.summary.map((entry) => `${entry.org} ${entry.status}`)).toEqual(["hmrc 200", "hmrc 500", "hmrc timeout", "stripe 200"]);
    expect(section.table).toBe("prod-env-integration-calls");
  });

  test("a call row keeps the sort key, the time from it, the header rule result and its failed rules", () => {
    const section = shapeIntegrationsSection({
      summaryRows: [],
      callRows: [
        {
          org: "hmrc",
          call_id: "2026-11-04T10:15:30.123Z#a1b2c3d4",
          api: "POST /organisations/vat/{vrn}/returns",
          method: "POST",
          duration_ms: "412",
          status_label: "201",
          fph_rules: "fail",
          fph_rules_failed: "Gov-Client-Device-ID,Gov-Vendor-Version",
        },
        {
          org: "stripe",
          call_id: "2026-11-04T10:16:00.000Z#ffffffff",
          api: "POST /v1/customers",
          method: "POST",
          duration_ms: null,
          status_label: "timeout",
        },
      ],
      tableName: "t",
      region: "eu-west-2",
      toWindows,
    });
    expect(section.calls.hmrc[0]).toEqual({
      id: "2026-11-04T10:15:30.123Z#a1b2c3d4",
      at: "2026-11-04T10:15:30.123Z",
      api: "POST /organisations/vat/{vrn}/returns",
      method: "POST",
      ms: 412,
      status: "201",
      rules: "fail",
      rulesFailed: ["Gov-Client-Device-ID", "Gov-Vendor-Version"],
    });
    expect(section.calls.stripe[0]).toMatchObject({ ms: null, status: "timeout", rules: null, rulesFailed: [] });
    expect(Object.keys(section.calls)).toEqual(INTEGRATION_ORGS);
  });

  test("a section from rows of the three organisations holds no email, VRN, NINO, Stripe customer id or IP address", () => {
    const section = shapeIntegrationsSection({
      summaryRows: [{ org: "hmrc", status: "200", today: "1", prev_1: "1", last_7: "1", last_30: "1", last_90: "1" }],
      callRows: INTEGRATION_ORGS.map((org) => ({
        org,
        call_id: "2026-11-04T10:15:30.123Z#a1b2c3d4",
        api: "GET /organisations/vat/{vrn}/obligations",
        method: "GET",
        duration_ms: "100",
        status_label: "200",
      })),
      tableName: "prod-env-integration-calls",
      region: "eu-west-2",
      toWindows,
    });
    const text = JSON.stringify(section);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/\b\d{9}\b/);
    expect(text).not.toMatch(/\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/);
    expect(text).not.toMatch(/\bcus_\w+/);
    expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
  });

  describe("header checks", () => {
    const item = (over) => ({
      pk: "fph#2026-11-08",
      sk: "2b7ff70b",
      recordType: "fph-check",
      result: "pass",
      hmrcCode: "VALID_HEADERS",
      api: "GET /organisations/vat/{vrn}/obligations",
      connectionMethod: "WEB_APP_VIA_SERVER",
      checkedAt: "2026-11-08T12:16:48.130Z",
      errors: [],
      warnings: [],
      ...over,
    });

    test("a pass has no message and no headers", () => {
      expect(shapeHeaderChecks([item({})])).toEqual([
        {
          day: "2026-11-08",
          api: "GET /organisations/vat/{vrn}/obligations",
          connectionMethod: "WEB_APP_VIA_SERVER",
          result: "pass",
          hmrcCode: "VALID_HEADERS",
          message: null,
          headers: [],
          checkedAt: "2026-11-08T12:16:48.130Z",
        },
      ]);
    });

    test("a warn shows its first warning and a fail its first error, the error first when both exist", () => {
      const warn = item({
        result: "warn",
        hmrcCode: "POTENTIALLY_INVALID_HEADERS",
        warnings: [{ code: "W1", message: "Value looks unusual", headers: ["Gov-Client-User-Agent"] }],
      });
      const fail = item({
        result: "fail",
        hmrcCode: "INVALID_HEADERS",
        errors: [{ code: "E1", message: "Header missing", headers: ["Gov-Client-Device-ID", "Gov-Vendor-Version"] }],
        warnings: [{ code: "W1", message: "Ignored beside an error", headers: ["Gov-Client-User-Agent"] }],
      });
      const [shapedFail, shapedWarn] = shapeHeaderChecks(
        [warn, fail].map((row, index) => ({ ...row, checkedAt: `2026-11-08T1${index}:00:00.000Z` })),
      );
      expect(shapedWarn).toMatchObject({ result: "warn", message: "Value looks unusual", headers: ["Gov-Client-User-Agent"] });
      expect(shapedFail).toMatchObject({
        result: "fail",
        message: "Header missing",
        headers: ["Gov-Client-Device-ID", "Gov-Vendor-Version"],
      });
    });

    test("rows run newest first across days, and items of other record types are left out", () => {
      const rows = shapeHeaderChecks([
        item({ pk: "fph#2026-11-06", checkedAt: "2026-11-06T09:00:00.000Z" }),
        item({ pk: "fph#2026-11-08", checkedAt: "2026-11-08T09:00:00.000Z" }),
        item({ pk: "call#hmrc#2026-11-08", recordType: "call" }),
        item({ pk: "fph#2026-11-07", checkedAt: "2026-11-07T09:00:00.000Z" }),
      ]);
      expect(rows.map((row) => row.day)).toEqual(["2026-11-08", "2026-11-07", "2026-11-06"]);
    });

    test("no items give an empty list, and the section carries the list", () => {
      expect(shapeHeaderChecks([])).toEqual([]);
      const section = shapeIntegrationsSection({ summaryRows: [], callRows: [], tableName: "t", region: "r", toWindows });
      expect(section.headerChecks).toEqual([]);
      const withItems = shapeIntegrationsSection({
        summaryRows: [],
        callRows: [],
        headerCheckItems: [item({})],
        tableName: "t",
        region: "r",
        toWindows,
      });
      expect(withItems.headerChecks).toHaveLength(1);
    });

    test("the partition keys are today and the six days before, newest first", () => {
      expect(headerCheckPartitionKeys(new Date("2026-11-08T00:30:00.000Z"))).toEqual([
        "fph#2026-11-08",
        "fph#2026-11-07",
        "fph#2026-11-06",
        "fph#2026-11-05",
        "fph#2026-11-04",
        "fph#2026-11-03",
        "fph#2026-11-02",
      ]);
    });
  });
});
