// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/itsa-self-employment-period-state.test.js
// A read of a self-employment period summary returns what an earlier create or amend sent.

import { describe, test, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { apiEndpoint as periodEndpoint } from "@app/http-simulator/routes/itsa-self-employment-period.js";
import { apiEndpoint as periodDetailEndpoint } from "@app/http-simulator/routes/itsa-self-employment-period-detail.js";
import { apiEndpoint as cumulativeEndpoint } from "@app/http-simulator/routes/itsa-self-employment-cumulative.js";
import { reset as resetState } from "@app/http-simulator/state/store.js";

const NINO = "AA123456A";
const BUSINESS_ID = "XBIS00000000001";
const BASE = `/individuals/business/self-employment/${NINO}/${BUSINESS_ID}`;

function buildApp() {
  const app = express();
  app.use(express.json());
  periodEndpoint(app);
  periodDetailEndpoint(app);
  cumulativeEndpoint(app);
  return app;
}

describe("http-simulator self-employment period summaries", () => {
  let app;

  beforeEach(() => {
    resetState();
    app = buildApp();
  });

  test("a dated period read returns the summary the create sent", async () => {
    const body = {
      periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
      periodIncome: { turnover: 1000, other: 0 },
      periodExpenses: { costOfGoods: 150 },
    };
    const created = await request(app).post(`${BASE}/period`).send(body);
    expect(created.body.periodId).toBe("2024-04-06_2024-07-05");

    const read = await request(app).get(`${BASE}/period/2024-25/${created.body.periodId}`);

    expect(read.status).toBe(200);
    expect(read.body).toEqual(body);
  });

  test("a dated period read returns the figures an amend sent", async () => {
    const periodId = "2024-04-06_2024-07-05";
    await request(app)
      .post(`${BASE}/period`)
      .send({
        periodDates: { periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" },
        periodIncome: { turnover: 1000, other: 0 },
        periodExpenses: { costOfGoods: 150 },
      });
    const amend = { periodIncome: { turnover: 1200, other: 50 }, periodExpenses: { costOfGoods: 180, otherExpenses: 40 } };
    const amended = await request(app).put(`${BASE}/period/2024-25/${periodId}`).send(amend);
    expect(amended.status).toBe(204);

    const read = await request(app).get(`${BASE}/period/2024-25/${periodId}`);

    expect(read.body.periodIncome).toEqual(amend.periodIncome);
    expect(read.body.periodExpenses).toEqual(amend.periodExpenses);
    expect(read.body.periodDates).toEqual({ periodStartDate: "2024-04-06", periodEndDate: "2024-07-05" });
  });

  test("a dated period nobody created reads as the canned summary", async () => {
    const read = await request(app).get(`${BASE}/period/2024-25/2017-04-06_2017-07-04`);

    expect(read.body.periodIncome.turnover).toBe(5000);
  });

  test("a cumulative read returns the running total the last PUT sent", async () => {
    const total = { periodIncome: { turnover: 55950, other: 0 }, periodExpenses: { costOfGoods: 12450 } };
    const put = await request(app).put(`${BASE}/cumulative/2025-26`).send(total);
    expect(put.status).toBe(204);

    const read = await request(app).get(`${BASE}/cumulative/2025-26`);

    expect(read.body).toEqual(total);
  });

  test("a cumulative year nobody filed reads as the canned total", async () => {
    const read = await request(app).get(`${BASE}/cumulative/2025-26`);

    expect(read.body.periodIncome.turnover).toBe(5000);
  });
});
