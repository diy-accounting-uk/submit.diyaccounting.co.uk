// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/jointFiling.test.js

import { describe, expect, test } from "vitest";
import { readJointFilingId, jointFilingFields } from "@app/services/jointFiling.js";
import { findMatchingActivitiesForUrlPath } from "@app/services/bundleManagement.js";
import { loadCatalogFromRoot } from "@app/services/productCatalog.js";

const JOINT_FILING_ID = "7d1c0f0e-5a3b-4c8e-9f21-0a6b3c9d4e11";

describe("services/jointFiling", () => {
  test("reads a UUID in lower case", () => {
    const errors = [];
    expect(readJointFilingId({ jointFilingId: JOINT_FILING_ID.toUpperCase() }, errors)).toBe(JOINT_FILING_ID);
    expect(errors).toEqual([]);
  });

  test("returns undefined and no error when the body names none", () => {
    const errors = [];
    expect(readJointFilingId({}, errors)).toBeUndefined();
    expect(readJointFilingId(undefined, errors)).toBeUndefined();
    expect(readJointFilingId({ jointFilingId: null }, errors)).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test.each(["", "12345", 42, "7d1c0f0e-5a3b-4c8e-9f21-0a6b3c9d4e1", "7d1c0f0e-5a3b-4c8e-9f21-0a6b3c9d4e11-extra"])(
    "refuses %j",
    (value) => {
      const errors = [];
      expect(readJointFilingId({ jointFilingId: value }, errors)).toBeUndefined();
      expect(errors).toEqual(["Invalid jointFilingId - must be a UUID"]);
    },
  );

  test("adds the field to a record only when there is an id", () => {
    expect(jointFilingFields(JOINT_FILING_ID)).toEqual({ jointFilingId: JOINT_FILING_ID });
    expect(jointFilingFields(undefined)).toEqual({});
  });
});

// enforceBundles only decides who may call a path. The activity a finished filing is charged to is
// named by the Lambda that records the receipt, so each send in a pair has one named activity.
describe("the activities a call from the joint page matches", () => {
  const catalog = loadCatalogFromRoot();
  const idsFor = (path) => findMatchingActivitiesForUrlPath(catalog, path).map((activity) => activity.id);
  const tokenCostOf = (id) => catalog.activities.find((activity) => activity.id === id).tokenCost;

  test("the Company Tax Return calls match the Company Tax Return activity alone", () => {
    expect(idsFor("/api/v1/hmrc/ct/return")).toEqual(["file-company-tax-return"]);
    expect(idsFor("/api/v1/hmrc/ct/return/46DCD4CC7E194088B99857931C185829")).toEqual(["file-company-tax-return"]);
  });

  test("the accounts calls match both accounts activities, so the Lambda names the one it charges", () => {
    expect(idsFor("/api/v1/companies-house/accounts")).toEqual(["file-micro-entity-accounts", "file-small-company-accounts"]);
    expect(idsFor("/api/v1/companies-house/accounts/00001A")).toEqual(["file-micro-entity-accounts", "file-small-company-accounts"]);
  });

  test("a pair costs two tokens: one for the accounts activity and one for the Company Tax Return activity", () => {
    expect(["file-micro-entity-accounts", "file-small-company-accounts"].map(tokenCostOf)).toEqual([1, 1]);
    expect(tokenCostOf("file-company-tax-return")).toBe(1);
  });
});
