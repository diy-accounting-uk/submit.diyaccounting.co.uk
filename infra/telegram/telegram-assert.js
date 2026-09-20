#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Assert infra/telegram/telegram.toml against live Telegram state. BotFather's chat flows
 * publish no provisioning API, so a bot and a group can only be made by hand - but the Bot
 * API reads everything back: getMe confirms the bot behind the token, getChat confirms each
 * declared group still resolves with the bot in it, getWebhookInfo confirms none is set
 * (this repository only ever sends, never receives).
 *
 * Usage: node infra/telegram/telegram-assert.js --environment ci
 *        node infra/telegram/telegram-assert.js --environment prod
 *
 * Credentials: the bot token is read from Secrets Manager at the name
 * infra/telegram/telegram.toml's [secrets].bot_token template resolves to for this
 * environment. Never printed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import dotenv from "dotenv";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export const CONFIG_PATH = "infra/telegram/telegram.toml";

/**
 * Parse infra/telegram/telegram.toml's bot, secret template and groups.
 *
 * @param {string} tomlString
 * @returns {{bot: {username: string}, botTokenTemplate: string, groups: object[]}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  if (!parsed.bot?.username) {
    throw new Error("telegram.toml is missing [bot].username");
  }
  if (!parsed.secrets?.bot_token) {
    throw new Error("telegram.toml is missing [secrets].bot_token");
  }
  const groups = (parsed.group ?? []).map((entry) => {
    if (!entry.name || !entry.environment || !entry.purpose || entry.chat_id === undefined) {
      throw new Error(`[[group]] entry is missing name, environment, purpose or chat_id: ${JSON.stringify(entry)}`);
    }
    return { name: entry.name, environment: entry.environment, purpose: entry.purpose, chatId: entry.chat_id };
  });
  if (groups.length === 0) {
    throw new Error("telegram.toml has no [[group]] entries");
  }
  return { bot: { username: parsed.bot.username }, botTokenTemplate: parsed.secrets.bot_token, groups };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Resolve the [secrets].bot_token template's "{env}" placeholder for one environment.
 *
 * @param {string} template
 * @param {string} environmentName
 * @returns {string}
 */
export function resolveBotTokenSecretName(template, environmentName) {
  return template.replace("{env}", environmentName);
}

/**
 * The groups belonging to one environment, in the order telegram.toml declares them.
 *
 * @param {object[]} groups
 * @param {string} environmentName
 * @returns {object[]}
 */
export function groupsForEnvironment(groups, environmentName) {
  return groups.filter((group) => group.environment === environmentName);
}

/**
 * @param {{username: string}} config
 * @param {{username?: string}} liveMe
 * @returns {string|null} a mismatch message, or null when it matches
 */
export function assertBot(config, liveMe) {
  if (liveMe.username !== config.username) {
    return `getMe returned username "${liveMe.username}" but telegram.toml records "${config.username}"`;
  }
  return null;
}

/**
 * @param {{name: string, chatId: number}} group
 * @param {{id?: number, title?: string}} liveChat
 * @returns {string|null} a mismatch message, or null when it matches
 */
export function assertChat(group, liveChat) {
  if (liveChat.id !== group.chatId) {
    return `${group.name}: getChat returned id ${liveChat.id} but telegram.toml records ${group.chatId}`;
  }
  if (liveChat.title !== group.name) {
    return `${group.name}: getChat returned title "${liveChat.title}"`;
  }
  return null;
}

/**
 * @param {{url?: string}} liveWebhookInfo
 * @returns {string|null} a mismatch message, or null when no webhook is set
 */
export function assertNoWebhook(liveWebhookInfo) {
  if (liveWebhookInfo.url) {
    return `getWebhookInfo reports a webhook set (${liveWebhookInfo.url}) but this bot is send-only`;
  }
  return null;
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network). ---

async function getSecretValue(secretId) {
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return SecretString;
}

async function callBotApi(token, method) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`${method} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.result;
}

async function callBotApiWithParams(token, method, params) {
  const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString());
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`${method} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.result;
}

function checkChatIdMatchesEnvFile(environmentName, group, failures) {
  const envFile = path.join(process.cwd(), `.env.${environmentName}`);
  if (!fs.existsSync(envFile)) {
    return;
  }
  const parsed = dotenv.parse(fs.readFileSync(envFile, "utf-8"));
  const envVarName = `TELEGRAM_${group.purpose.toUpperCase()}_CHAT_ID`;
  const liveChatId = parsed[envVarName];
  if (liveChatId !== undefined && Number(liveChatId) !== group.chatId) {
    failures.push(
      `${group.name}: telegram.toml records chat_id ${group.chatId} but .env.${environmentName}'s ${envVarName} is ${liveChatId}`,
    );
  }
}

export async function main(argv = process.argv.slice(2)) {
  const environmentIndex = argv.indexOf("--environment");
  const environmentName = environmentIndex >= 0 ? argv[environmentIndex + 1] : null;
  if (!environmentName) {
    throw new Error("Usage: telegram-assert.js --environment <ci|prod>");
  }

  const config = loadConfigFromRoot();
  console.log(`\n=== telegram (${environmentName}) ===`);
  const failures = [];

  const token = await getSecretValue(resolveBotTokenSecretName(config.botTokenTemplate, environmentName));

  try {
    const liveMe = await callBotApi(token, "getMe");
    const mismatch = assertBot(config.bot, liveMe);
    if (mismatch) {
      failures.push(mismatch);
      console.error(`  getMe: ${mismatch}`);
    } else {
      console.log(`  getMe: @${liveMe.username} matches`);
    }
  } catch (err) {
    failures.push(`getMe: ${err.message}`);
    console.error(`  getMe: ${err.message}`);
  }

  for (const group of groupsForEnvironment(config.groups, environmentName)) {
    try {
      const liveChat = await callBotApiWithParams(token, "getChat", { chat_id: group.chatId });
      const mismatch = assertChat(group, liveChat);
      if (mismatch) {
        failures.push(mismatch);
        console.error(`  ${group.name}: ${mismatch}`);
      } else {
        console.log(`  ${group.name}: getChat matches (${group.chatId})`);
      }
      checkChatIdMatchesEnvFile(environmentName, group, failures);
    } catch (err) {
      failures.push(`${group.name}: ${err.message}`);
      console.error(`  ${group.name}: ${err.message}`);
    }
  }

  try {
    const liveWebhookInfo = await callBotApi(token, "getWebhookInfo");
    const mismatch = assertNoWebhook(liveWebhookInfo);
    if (mismatch) {
      failures.push(mismatch);
      console.error(`  getWebhookInfo: ${mismatch}`);
    } else {
      console.log("  getWebhookInfo: none set");
    }
  } catch (err) {
    failures.push(`getWebhookInfo: ${err.message}`);
    console.error(`  getWebhookInfo: ${err.message}`);
  }

  if (failures.length > 0) {
    throw new Error(`telegram-assert had ${failures.length} failing check(s): ${failures.join("; ")}`);
  }
  console.log("\nAll checks passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("telegram-assert failed:", err.message);
    process.exit(1);
  });
}
