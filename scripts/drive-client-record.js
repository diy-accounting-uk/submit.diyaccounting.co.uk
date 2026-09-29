#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/drive-client-record.js
//
// Reads the JSON the console downloads for the Drive browser OAuth client, checks it is the client
// infra/google/gcp/oauth.toml declares (type "web", the recorded JavaScript origins exactly, no
// redirect URIs, in the recorded project), writes its client id into that file's drive_browser
// entry and prints the id and the cloud-config.js line that takes it. The client secret in the
// download is never read into the output or stored.
//
// Usage: node scripts/drive-client-record.js <downloaded-client.json>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";

export const OAUTH_TOML_PATH = "infra/google/gcp/oauth.toml";
const PURPOSE = "drive_browser";

/**
 * Validate the downloaded client JSON against the declared drive_browser client.
 *
 * @param {object} downloaded - parsed client JSON as the console writes it
 * @param {{project_number: string, javascript_origins: string[]}} declared - the oauth.toml entry
 * @returns {string} the client id
 */
export function checkDownloadedClient(downloaded, declared) {
  const types = Object.keys(downloaded ?? {});
  if (types.length !== 1 || types[0] !== "web") {
    throw new Error(`Refusing a client of type "${types.join(",") || "unknown"}": the Drive browser client is type "web"`);
  }
  const web = downloaded.web;
  if (!web.client_id) {
    throw new Error("The downloaded JSON has no client_id");
  }
  const projectNumber = web.client_id.split("-")[0];
  if (projectNumber !== String(declared.project_number)) {
    throw new Error(`The client belongs to project ${projectNumber}; oauth.toml records project_number ${declared.project_number}`);
  }
  if ((web.redirect_uris ?? []).length > 0) {
    throw new Error(`Refusing a client with redirect URIs (${web.redirect_uris.join(", ")}): the Drive browser client has none`);
  }
  const wanted = [...declared.javascript_origins].sort();
  const got = [...(web.javascript_origins ?? [])].sort();
  if (JSON.stringify(wanted) !== JSON.stringify(got)) {
    const missing = wanted.filter((origin) => !got.includes(origin));
    const extra = got.filter((origin) => !wanted.includes(origin));
    throw new Error(`JavaScript origins differ from oauth.toml. Missing: [${missing.join(", ")}]. Extra: [${extra.join(", ")}]`);
  }
  return web.client_id;
}

/**
 * The declared drive_browser entry of an oauth.toml document.
 *
 * @param {string} tomlString
 */
export function findDriveClient(tomlString) {
  const entry = (TOML.parse(tomlString).client ?? []).find((client) => client.purpose === PURPOSE);
  if (!entry) {
    throw new Error(`oauth.toml has no [[client]] with purpose "${PURPOSE}"`);
  }
  return entry;
}

/**
 * Return the oauth.toml text with the drive_browser entry's `id` line set to clientId, leaving
 * every other line, comments included, untouched.
 *
 * @param {string} tomlString
 * @param {string} clientId
 */
export function writeClientId(tomlString, clientId) {
  const lines = tomlString.split("\n");
  const purposeLine = lines.findIndex((line) => line.trim() === `purpose = "${PURPOSE}"`);
  if (purposeLine === -1) {
    throw new Error(`oauth.toml has no [[client]] with purpose "${PURPOSE}"`);
  }
  const nextEntry = lines.findIndex((line, index) => index > purposeLine && line.startsWith("[[client]]"));
  const end = nextEntry === -1 ? lines.length : nextEntry;
  for (let index = purposeLine + 1; index < end; index++) {
    if (/^id = /.test(lines[index])) {
      lines[index] = `id = "${clientId}"`;
      return lines.join("\n");
    }
  }
  throw new Error(`The ${PURPOSE} entry has no id line to replace`);
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) {
    throw new Error("Usage: node scripts/drive-client-record.js <downloaded-client.json>");
  }
  const tomlPath = path.join(process.cwd(), OAUTH_TOML_PATH);
  const tomlString = fs.readFileSync(tomlPath, "utf-8");
  const clientId = checkDownloadedClient(JSON.parse(fs.readFileSync(argv[0], "utf-8")), findDriveClient(tomlString));
  fs.writeFileSync(tomlPath, writeClientId(tomlString, clientId));
  console.log(`Recorded ${clientId} in ${OAUTH_TOML_PATH}`);
  console.log(`cloud-config.js: googleClientId: "${clientId}",`);
  return clientId;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`drive-client-record failed: ${err.message}`);
    process.exit(1);
  }
}
