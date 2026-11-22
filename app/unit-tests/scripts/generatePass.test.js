// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/generatePass.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { _clearOperatorsCache } from "@app/lib/operators.js";
import { operatorRestrictionProblem } from "../../../scripts/generate-pass.js";

describe("generate-pass.js operator restriction", () => {
  let originalOperatorEmails;
  beforeEach(() => {
    originalOperatorEmails = process.env.OPERATOR_EMAILS;
    process.env.OPERATOR_EMAILS = "operator@example.com";
    _clearOperatorsCache();
  });
  afterEach(() => {
    process.env.OPERATOR_EMAILS = originalOperatorEmails;
    _clearOperatorsCache();
  });

  test("an operator pass restricted to an operator's email may be created", async () => {
    expect(await operatorRestrictionProblem("operator", "operator@example.com")).toBeNull();
  });

  test.each([
    ["an email that is not an operator's", "someone@example.com"],
    ["no email", null],
  ])("an operator pass restricted to %s is refused", async (_label, email) => {
    expect(await operatorRestrictionProblem("operator", email)).toBe(
      "A pass for the bundle 'operator' must be restricted to an operator's email (--email)",
    );
  });

  test("a pass for another bundle needs no operator email", async () => {
    expect(await operatorRestrictionProblem("invited-guest", "someone@example.com")).toBeNull();
  });
});
