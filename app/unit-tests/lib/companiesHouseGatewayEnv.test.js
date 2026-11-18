// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/companiesHouseGatewayEnv.test.js
//
// Each lane's env file sets COMPANIES_HOUSE_GATEWAY_TEST, which submit.env carries to the filing
// pages' banner. On ci and prod it must match what CompaniesHouseStack.gatewayTestFlag sets on the
// accounts Lambdas: test mode on the environment it names, the live gateway elsewhere.

import fs from "fs";
import path from "path";
import { describe, test, expect } from "vitest";
import dotenv from "dotenv";

const read = (lane) => dotenv.parse(fs.readFileSync(path.resolve(`.env.${lane}`), "utf8"));
const stack = fs.readFileSync(path.resolve("infra/main/java/co/uk/diyaccounting/submit/stacks/CompaniesHouseStack.java"), "utf8");
const testEnvName = stack.match(/XML_GATEWAY_TEST_ENV_NAME = "([a-z]+)"/)[1];

describe("COMPANIES_HOUSE_GATEWAY_TEST in the lane env files", () => {
  test.each(["simulator", "proxy"])(".env.%s runs the gateway in test mode", (lane) => {
    expect(read(lane).COMPANIES_HOUSE_GATEWAY_TEST).toBe("true");
  });

  test.each(["ci", "prod"])(".env.%s matches CompaniesHouseStack.gatewayTestFlag", (lane) => {
    expect(read(lane).COMPANIES_HOUSE_GATEWAY_TEST).toBe(lane === testEnvName ? "true" : "false");
  });

  test("the stack names one environment for test mode", () => {
    expect(testEnvName).toBe("ci");
  });
});
