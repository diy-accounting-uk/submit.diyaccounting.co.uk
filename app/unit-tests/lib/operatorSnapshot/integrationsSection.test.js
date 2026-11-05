// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  buildIntegrationSummarySql,
  buildIntegrationCallsSql,
  shapeIntegrationsSection,
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
});
