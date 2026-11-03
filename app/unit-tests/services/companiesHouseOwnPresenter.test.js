// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseOwnPresenter.test.js
import { describe, test, expect } from "vitest";
import { readOwnPresenterFromBody, readOwnPresenterFromHeaders } from "@app/services/companiesHouseOwnPresenter.js";
import { describeEventWithoutBody } from "@app/lib/httpResponseHelper.js";

describe("readOwnPresenterFromBody", () => {
  test("returns undefined and no error when the body names no own presenter", () => {
    const errors = [];
    expect(readOwnPresenterFromBody({ companyNumber: "06846849" }, errors)).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test("returns the trimmed pair", () => {
    const errors = [];
    expect(readOwnPresenterFromBody({ ownPresenter: { id: " 123456 ", code: " Abc#123 " } }, errors)).toEqual({
      presenterId: "123456",
      presenterCode: "Abc#123",
    });
    expect(errors).toEqual([]);
  });

  test.each([
    ["a missing code", { id: "123456" }],
    ["a missing id", { code: "Abc123" }],
    ["a blank id", { id: "   ", code: "Abc123" }],
    ["an id with a space inside", { id: "12 34", code: "Abc123" }],
    ["markup in the code", { id: "123456", code: "<x>" }],
    ["a code over 32 characters", { id: "123456", code: "A".repeat(33) }],
  ])("rejects %s", (_label, ownPresenter) => {
    const errors = [];
    expect(readOwnPresenterFromBody({ ownPresenter }, errors)).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
  });

  test("rejects an own presenter that is not an object", () => {
    const errors = [];
    expect(readOwnPresenterFromBody({ ownPresenter: "123456" }, errors)).toBeUndefined();
    expect(errors).toEqual(["ownPresenter must be an object with an id and a code"]);
  });
});

describe("readOwnPresenterFromHeaders", () => {
  test("returns undefined when neither header is sent", () => {
    const errors = [];
    expect(readOwnPresenterFromHeaders({ "content-type": "application/json" }, errors)).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test("reads both headers whatever their case", () => {
    const errors = [];
    expect(readOwnPresenterFromHeaders({ "x-presenter-id": "123456", "X-PRESENTER-CODE": "Abc123" }, errors)).toEqual({
      presenterId: "123456",
      presenterCode: "Abc123",
    });
  });

  test("rejects one header without the other", () => {
    const errors = [];
    expect(readOwnPresenterFromHeaders({ "X-Presenter-Id": "123456" }, errors)).toBeUndefined();
    expect(errors.length).toBe(1);
  });
});

describe("describeEventWithoutBody", () => {
  test("redacts every header whose name carries presenter", () => {
    const described = describeEventWithoutBody({
      headers: { "X-Presenter-Id": "OWN-PRES-7731", "x-presenter-code": "OwnSecretCode42", "content-type": "application/json" },
      body: "{}",
    });
    const text = JSON.stringify(described);
    expect(text).not.toContain("OWN-PRES-7731");
    expect(text).not.toContain("OwnSecretCode42");
    expect(described.headers["content-type"]).toBe("application/json");
  });
});
