// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The account settings route: PUT /api/v1/account/settings writes the settings item in the user's
// partition of the bundles table, and GET /api/v1/bundle returns the settings with the bundles.

import { describe, test, beforeEach, expect, vi } from "vitest";
import { buildLambdaEvent, buildJwtAuthorizerContext, buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import {
  mockSend,
  mockLibDynamoDb,
  mockClientDynamoDb,
  MockQueryCommand,
  MockPutCommand,
  MockGetCommand,
} from "@app/test-helpers/dynamoDbMock.js";

vi.mock("@aws-sdk/lib-dynamodb", () => mockLibDynamoDb);
vi.mock("@aws-sdk/client-dynamodb", () => mockClientDynamoDb);

import { ingestHandler as accountSettingsPutHandler } from "@app/functions/account/accountSettingsPut.js";
import { ingestHandler as bundleGetHandler } from "@app/functions/account/bundleGet.js";
import { ACCOUNT_SETTINGS_ITEM_ID } from "@app/data/dynamoDbBundleRepository.js";
import { initializeSalt } from "@app/services/subHasher.js";

function putEvent(body, sub = "settings-user") {
  return buildLambdaEvent({ method: "PUT", path: "/api/v1/account/settings", body, authorizer: buildJwtAuthorizerContext(sub) });
}

describe("account settings route", () => {
  let storedSettings;
  let writtenItems;

  beforeEach(async () => {
    Object.assign(process.env, setupTestEnv({ ASYNC_REQUESTS_DYNAMODB_TABLE_NAME: "test-async-table" }));
    await initializeSalt();
    storedSettings = undefined;
    writtenItems = [];
    vi.resetAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockGetCommand) {
        return cmd.input.Key.bundleId === ACCOUNT_SETTINGS_ITEM_ID && storedSettings ? { Item: { settings: storedSettings } } : {};
      }
      if (cmd instanceof MockPutCommand) {
        writtenItems.push(cmd.input.Item);
        storedSettings = cmd.input.Item.settings;
        return {};
      }
      if (cmd instanceof MockQueryCommand) {
        return storedSettings
          ? { Items: [{ bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: storedSettings }], Count: 1 }
          : { Items: [], Count: 0 };
      }
      return {};
    });
  });

  test("PUT writes the setting to the settings item in the user's partition", async () => {
    const response = await accountSettingsPutHandler(putEvent({ passGeneration: false }));

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({ settings: { passGeneration: false } });
    expect(writtenItems).toHaveLength(1);
    expect(writtenItems[0]).toMatchObject({ bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { passGeneration: false } });
    expect(writtenItems[0].hashedSub).toBeTruthy();
  });

  test("PUT keeps the settings it does not name", async () => {
    storedSettings = { passGeneration: false, kept: "yes" };

    const response = await accountSettingsPutHandler(putEvent({ passGeneration: true }));

    expect(response.statusCode).toBe(200);
    expect(writtenItems[0].settings).toEqual({ passGeneration: true, kept: "yes" });
  });

  test.each([[{ passGeneration: "off" }], [{ colour: true }], [{}]])("PUT of %j answers 400 and writes nothing", async (body) => {
    const response = await accountSettingsPutHandler(putEvent(body));

    expect(response.statusCode).toBe(400);
    expect(writtenItems).toHaveLength(0);
  });

  test("PUT without a signed-in user answers 401", async () => {
    const response = await accountSettingsPutHandler(buildLambdaEvent({ method: "PUT", path: "/api/v1/account/settings", authorizer: {} }));

    expect(response.statusCode).toBe(401);
  });

  test("GET /api/v1/bundle returns pass generation on for a user with no stored settings", async () => {
    const response = await bundleGetHandler(buildEventWithToken(makeIdToken("settings-user"), {}));

    expect(parseResponseBody(response).settings).toEqual({ passGeneration: true });
  });

  test("GET /api/v1/bundle returns the stored setting and leaves the settings item out of the bundles", async () => {
    await accountSettingsPutHandler(putEvent({ passGeneration: false }));

    const response = await bundleGetHandler(buildEventWithToken(makeIdToken("settings-user"), {}));

    const body = parseResponseBody(response);
    expect(body.settings).toEqual({ passGeneration: false });
    expect(body.bundles.map((bundle) => bundle.bundleId)).not.toContain(ACCOUNT_SETTINGS_ITEM_ID);
  });
});
