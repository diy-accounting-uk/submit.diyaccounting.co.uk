// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The account settings route: PUT /api/v1/account/settings writes the settings item in the user's
// partition of the bundles table and changes its watch list one company at a time, and GET
// /api/v1/bundle returns the settings with the bundles.

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
  MockUpdateCommand,
} from "@app/test-helpers/dynamoDbMock.js";

vi.mock("@aws-sdk/lib-dynamodb", () => mockLibDynamoDb);
vi.mock("@aws-sdk/client-dynamodb", () => mockClientDynamoDb);

// The catalogue as the repository holds it, except where a test moves the watch list activity to
// a bundle the account does not hold.
let watchListBundles;
vi.mock("@app/services/productCatalog.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadCatalogFromRoot: () => {
      const catalog = actual.loadCatalogFromRoot();
      if (!watchListBundles) return catalog;
      return {
        ...catalog,
        activities: catalog.activities.map((activity) =>
          activity.id === "company-watch-list" ? { ...activity, bundles: watchListBundles } : activity,
        ),
      };
    },
  };
});

import { ingestHandler as accountSettingsPutHandler } from "@app/functions/account/accountSettingsPut.js";
import { ingestHandler as bundleGetHandler } from "@app/functions/account/bundleGet.js";
import { ACCOUNT_SETTINGS_ITEM_ID } from "@app/data/dynamoDbBundleRepository.js";
import { initializeSalt } from "@app/services/subHasher.js";

function putEvent(body, sub = "settings-user") {
  return buildLambdaEvent({ method: "PUT", path: "/api/v1/account/settings", body, authorizer: buildJwtAuthorizerContext(sub) });
}

const conditionFailure = () => Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });

// The settings item, with the route's update expressions applied as DynamoDB applies them: one
// setting's path, the watch list's conditional append, or the conditional removal of one entry.
function applyUpdate(item, input) {
  const names = input.ExpressionAttributeNames;
  const values = input.ExpressionAttributeValues;
  if (!item?.settings) throw conditionFailure();
  const settings = item.settings;
  const expression = input.UpdateExpression;
  if (expression.startsWith("SET #settings.#watched = list_append")) {
    const watched = settings.watchedCompanies;
    if (watched && (watched.length >= values[":cap"] || watched.includes(values[":number"]))) throw conditionFailure();
    settings.watchedCompanies = [...(watched ?? []), ...values[":one"]];
  } else if (expression.startsWith("REMOVE #settings.#watched[")) {
    const index = Number(/\[(\d+)\]/.exec(expression)[1]);
    if (settings.watchedCompanies?.[index] !== values[":number"]) throw conditionFailure();
    settings.watchedCompanies.splice(index, 1);
  } else {
    for (const [key, name] of Object.entries(names)) {
      if (key.startsWith("#name")) settings[name] = values[`:value${key.slice("#name".length)}`];
    }
  }
  return { Attributes: item };
}

describe("account settings route", () => {
  let storedItem;
  let writes;

  beforeEach(async () => {
    Object.assign(process.env, setupTestEnv({ ASYNC_REQUESTS_DYNAMODB_TABLE_NAME: "test-async-table" }));
    await initializeSalt();
    storedItem = undefined;
    writes = 0;
    watchListBundles = undefined;
    vi.resetAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockGetCommand) {
        return cmd.input.Key.bundleId === ACCOUNT_SETTINGS_ITEM_ID && storedItem ? { Item: structuredClone(storedItem) } : {};
      }
      if (cmd instanceof MockPutCommand) {
        if (cmd.input.ConditionExpression && storedItem) throw conditionFailure();
        writes += 1;
        storedItem = structuredClone(cmd.input.Item);
        return {};
      }
      if (cmd instanceof MockUpdateCommand) {
        const answer = applyUpdate(storedItem, cmd.input);
        writes += 1;
        return structuredClone(answer);
      }
      if (cmd instanceof MockQueryCommand) {
        return storedItem ? { Items: [structuredClone(storedItem)], Count: 1 } : { Items: [], Count: 0 };
      }
      return {};
    });
  });

  test("PUT writes the setting to the settings item in the user's partition", async () => {
    const response = await accountSettingsPutHandler(putEvent({ passGeneration: false }));

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({ settings: { passGeneration: false, watchedCompanies: [], previewFeatures: false } });
    expect(storedItem).toMatchObject({ bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { passGeneration: false } });
    expect(storedItem.hashedSub).toBeTruthy();
  });

  test("PUT keeps the settings it does not name", async () => {
    storedItem = { bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { passGeneration: false, kept: "yes" } };

    const response = await accountSettingsPutHandler(putEvent({ passGeneration: true }));

    expect(response.statusCode).toBe(200);
    expect(storedItem.settings).toEqual({ passGeneration: true, kept: "yes" });
  });

  test("PUT adds a company to the watch list and answers the list as stored", async () => {
    storedItem = { bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { passGeneration: false, watchedCompanies: ["00000001"] } };

    const response = await accountSettingsPutHandler(putEvent({ watchList: { add: "SC000000" } }));

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).settings).toEqual({
      passGeneration: false,
      watchedCompanies: ["00000001", "SC000000"],
      previewFeatures: false,
    });
  });

  test("PUT adds to a watch list stored before any other setting, creating the settings item", async () => {
    const response = await accountSettingsPutHandler(putEvent({ watchList: { add: "00000001" } }));

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).settings.watchedCompanies).toEqual(["00000001"]);
  });

  test("PUT of an add of a company already on the list, or a remove of one not on it, answers the list unchanged", async () => {
    storedItem = { bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { watchedCompanies: ["00000001"] } };

    const added = await accountSettingsPutHandler(putEvent({ watchList: { add: "00000001" } }));
    const removed = await accountSettingsPutHandler(putEvent({ watchList: { remove: "SC000000" } }));

    expect(added.statusCode).toBe(200);
    expect(parseResponseBody(added).settings.watchedCompanies).toEqual(["00000001"]);
    expect(removed.statusCode).toBe(200);
    expect(parseResponseBody(removed).settings.watchedCompanies).toEqual(["00000001"]);
    expect(storedItem.settings.watchedCompanies).toEqual(["00000001"]);
  });

  test("PUT of an add to a full watch list answers 409 watch_list_full and stores nothing more", async () => {
    const full = Array.from({ length: 50 }, (_, index) => String(index + 1).padStart(8, "0"));
    storedItem = { bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { watchedCompanies: full } };

    const response = await accountSettingsPutHandler(putEvent({ watchList: { add: "SC000000" } }));

    expect(response.statusCode).toBe(409);
    expect(parseResponseBody(response)).toMatchObject({ reason: "watch_list_full" });
    expect(storedItem.settings.watchedCompanies).toEqual(full);
  });

  test("PUT removes a company from the watch list", async () => {
    storedItem = { bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { watchedCompanies: ["00000001", "SC000000"] } };

    const response = await accountSettingsPutHandler(putEvent({ watchList: { remove: "00000001" } }));

    expect(parseResponseBody(response).settings.watchedCompanies).toEqual(["SC000000"]);
  });

  test("a watch list stored before operations existed keeps working", async () => {
    storedItem = { bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { passGeneration: true, watchedCompanies: ["00000001", "00000003"] } };

    const response = await bundleGetHandler(buildEventWithToken(makeIdToken("settings-user"), {}));
    expect(parseResponseBody(response).settings.watchedCompanies).toEqual(["00000001", "00000003"]);
    const removed = await accountSettingsPutHandler(putEvent({ watchList: { remove: "00000003" } }));
    expect(parseResponseBody(removed).settings.watchedCompanies).toEqual(["00000001"]);
  });

  test("PUT of a watch list operation from an account without the company watch list activity answers 403 and writes nothing", async () => {
    watchListBundles = ["resident-ltd"];
    storedItem = { bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { watchedCompanies: ["00000001"] } };

    const response = await accountSettingsPutHandler(putEvent({ watchList: { add: "SC000000" } }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe("Forbidden - missing or insufficient bundle entitlement");
    expect(writes).toBe(0);
    expect(storedItem.settings.watchedCompanies).toEqual(["00000001"]);
  });

  test("PUT of pass generation needs no watch list activity", async () => {
    watchListBundles = ["resident-ltd"];

    const response = await accountSettingsPutHandler(putEvent({ passGeneration: false }));

    expect(response.statusCode).toBe(200);
  });

  test.each([
    [{ passGeneration: "off" }],
    [{ colour: true }],
    [{}],
    [{ watchedCompanies: ["00000001"] }],
    [{ watchList: { add: "not-a-number" } }],
    [{ watchList: { add: "00000001", remove: "00000002" } }],
    [{ watchList: ["00000001"] }],
    [{ watchList: { add: "SC000000" }, passGeneration: false }],
  ])("PUT of %j answers 400 and writes nothing", async (body) => {
    const response = await accountSettingsPutHandler(putEvent(body));

    expect(response.statusCode).toBe(400);
    expect(writes).toBe(0);
  });

  test("PUT of a watch list change with another setting answers 400 saying the change is sent on its own", async () => {
    storedItem = { bundleId: ACCOUNT_SETTINGS_ITEM_ID, settings: { passGeneration: true, watchedCompanies: ["00000001"] } };

    const response = await accountSettingsPutHandler(putEvent({ passGeneration: false, watchList: { add: "SC000000" } }));

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("A watch list change is sent on its own, with no other setting");
    expect(writes).toBe(0);
    expect(storedItem.settings).toEqual({ passGeneration: true, watchedCompanies: ["00000001"] });
  });

  test("PUT without a signed-in user answers 401", async () => {
    const response = await accountSettingsPutHandler(buildLambdaEvent({ method: "PUT", path: "/api/v1/account/settings", authorizer: {} }));

    expect(response.statusCode).toBe(401);
  });

  test("GET /api/v1/bundle returns pass generation on for a user with no stored settings", async () => {
    const response = await bundleGetHandler(buildEventWithToken(makeIdToken("settings-user"), {}));

    expect(parseResponseBody(response).settings).toEqual({ passGeneration: true, watchedCompanies: [], previewFeatures: false });
  });

  test("GET /api/v1/bundle returns the stored setting and leaves the settings item out of the bundles", async () => {
    await accountSettingsPutHandler(putEvent({ passGeneration: false }));

    const response = await bundleGetHandler(buildEventWithToken(makeIdToken("settings-user"), {}));

    const body = parseResponseBody(response);
    expect(body.settings).toEqual({ passGeneration: false, watchedCompanies: [], previewFeatures: false });
    expect(body.bundles.map((bundle) => bundle.bundleId)).not.toContain(ACCOUNT_SETTINGS_ITEM_ID);
  });
});
