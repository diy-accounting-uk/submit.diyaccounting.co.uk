// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/telegramAssert.test.js

import { describe, test, expect } from "vitest";

import {
  parseConfig,
  resolveBotTokenSecretName,
  groupsForEnvironment,
  assertBot,
  assertChat,
  assertNoWebhook,
} from "../../../infra/telegram/telegram-assert.js";

const SAMPLE_TOML = `
[bot]
username = "diyaccounting_bot"

[secrets]
bot_token = "{env}/submit/telegram/bot_token"

[[group]]
name = "diy-ci-test"
environment = "ci"
purpose = "test"
chat_id = -5250521947

[[group]]
name = "diy-ci-live"
environment = "ci"
purpose = "live"
chat_id = -5278650420

[[group]]
name = "diy-prod-test"
environment = "prod"
purpose = "test"
chat_id = -5144319944
`;

describe("parseConfig", () => {
  test("reads the bot, secret template and every group", () => {
    const config = parseConfig(SAMPLE_TOML);
    expect(config.bot).toEqual({ username: "diyaccounting_bot" });
    expect(config.botTokenTemplate).toBe("{env}/submit/telegram/bot_token");
    expect(config.groups).toEqual([
      { name: "diy-ci-test", environment: "ci", purpose: "test", chatId: -5250521947 },
      { name: "diy-ci-live", environment: "ci", purpose: "live", chatId: -5278650420 },
      { name: "diy-prod-test", environment: "prod", purpose: "test", chatId: -5144319944 },
    ]);
  });

  test("throws when [bot].username is missing", () => {
    expect(() => parseConfig('[secrets]\nbot_token = "x"\n')).toThrow(/bot.*username/i);
  });

  test("throws when [secrets].bot_token is missing", () => {
    expect(() => parseConfig('[bot]\nusername = "x"\n')).toThrow(/bot_token/);
  });

  test("throws when there are no [[group]] entries", () => {
    expect(() => parseConfig('[bot]\nusername = "x"\n[secrets]\nbot_token = "y"\n')).toThrow(/group/);
  });

  test("throws when a group is missing a required field", () => {
    const toml = `
[bot]
username = "x"
[secrets]
bot_token = "y"
[[group]]
name = "g"
environment = "ci"
`;
    expect(() => parseConfig(toml)).toThrow(/purpose|chat_id/);
  });
});

describe("resolveBotTokenSecretName", () => {
  test("substitutes the environment into the template", () => {
    expect(resolveBotTokenSecretName("{env}/submit/telegram/bot_token", "ci")).toBe("ci/submit/telegram/bot_token");
    expect(resolveBotTokenSecretName("{env}/submit/telegram/bot_token", "prod")).toBe("prod/submit/telegram/bot_token");
  });
});

describe("groupsForEnvironment", () => {
  const { groups } = parseConfig(SAMPLE_TOML);

  test("filters to ci's groups, in declared order", () => {
    expect(groupsForEnvironment(groups, "ci").map((g) => g.name)).toEqual(["diy-ci-test", "diy-ci-live"]);
  });

  test("filters to prod's groups", () => {
    expect(groupsForEnvironment(groups, "prod").map((g) => g.name)).toEqual(["diy-prod-test"]);
  });

  test("returns an empty list for an environment with no groups", () => {
    expect(groupsForEnvironment(groups, "staging")).toEqual([]);
  });
});

describe("assertBot", () => {
  test("passes silently when the username matches", () => {
    expect(assertBot({ username: "diyaccounting_bot" }, { username: "diyaccounting_bot" })).toBeNull();
  });

  test("reports a mismatch when the username differs", () => {
    expect(assertBot({ username: "diyaccounting_bot" }, { username: "someone_else_bot" })).toMatch(/someone_else_bot/);
  });
});

describe("assertChat", () => {
  const group = { name: "diy-ci-test", chatId: -5250521947 };

  test("passes silently when id and title both match", () => {
    expect(assertChat(group, { id: -5250521947, title: "diy-ci-test" })).toBeNull();
  });

  test("reports a mismatch when the chat id differs", () => {
    expect(assertChat(group, { id: -1, title: "diy-ci-test" })).toMatch(/-1/);
  });

  test("reports a mismatch when the title differs", () => {
    expect(assertChat(group, { id: -5250521947, title: "renamed-group" })).toMatch(/renamed-group/);
  });
});

describe("assertNoWebhook", () => {
  test("passes silently when no webhook url is set", () => {
    expect(assertNoWebhook({ url: "" })).toBeNull();
  });

  test("reports a mismatch when a webhook is set", () => {
    expect(assertNoWebhook({ url: "https://example.com/hook" })).toMatch(/example\.com/);
  });
});
