#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Writes target/chatgpt-plugin/<name>.zip from plugins/diya-submit-chatgpt/, the package the OpenAI Platform takes.
// Usage: node scripts/build-chatgpt-plugin.mjs   (npm run build:chatgpt-plugin)
// The entries are sorted and carry a fixed time, so the same folder always gives the same bytes.
// The writer is local because no ZIP library is a dependency of this repository.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PLUGIN_DIR = join(ROOT, "plugins", "diya-submit-chatgpt");
export const OUT_DIR = join(ROOT, "target", "chatgpt-plugin");

// The README and the review test cases are for people; the platform reads the rest.
const LEFT_OUT = new Set(["README.md", "review"]);
// MS-DOS date and time for 2026-01-01 00:00:00, so the bytes do not depend on file times.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

function listFiles(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? listFiles(full) : [full];
    });
}

export function packageEntries(pluginDir = PLUGIN_DIR) {
  return listFiles(pluginDir)
    .map((full) => relative(pluginDir, full).split(sep).join("/"))
    .filter((path) => !LEFT_OUT.has(path.split("/")[0]));
}

// A ZIP of deflated regular files: local headers, then the central directory, then its end record.
export function buildPluginZip(pluginDir = PLUGIN_DIR) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const path of packageEntries(pluginDir)) {
    const name = Buffer.from(path, "utf8");
    const data = readFileSync(join(pluginDir, path));
    const packed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { name } = JSON.parse(readFileSync(join(PLUGIN_DIR, "plugin.json"), "utf8"));
  mkdirSync(OUT_DIR, { recursive: true });
  const zipPath = join(OUT_DIR, `${name}.zip`);
  writeFileSync(zipPath, buildPluginZip());
  console.log(`${zipPath}\n${packageEntries().join("\n")}`);
}
