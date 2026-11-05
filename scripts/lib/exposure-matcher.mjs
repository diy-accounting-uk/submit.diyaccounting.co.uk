// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/exposure-matcher.mjs
//
// The in-memory matcher behind scripts/exposure-check.mjs. A secret value enters as a needle and
// leaves only as a boolean hit with the key's name. Nothing here prints, logs or returns a value.

import { createHmac } from "node:crypto";
import { gunzipSync, inflateRawSync } from "node:zlib";

// Shorter values match ordinary text, the same limit as the video secret scan.
export const MIN_NEEDLE_LENGTH = 6;
// A value below this length is reported as weak: a hit needs a person to read the location.
export const WEAK_NEEDLE_LENGTH = 12;

const PREFIX_BYTES = 4;
const MIN_BASE64_NEEDLE_LENGTH = 12;
const PEM_LINES_PER_KEY = 3;
const MAX_INFLATED_BYTES = 256 * 1024 * 1024;

// Fields of a stored JSON secret that are identifiers or addresses, and so are not secret.
const PUBLIC_JSON_FIELD =
  /^(client_id|client_email|project_id|auth_uri|token_uri|type|current|universe_domain|.*_url|.*_uris?|.*origins?|cert.*|fullchain|chain)$/i;

const PLACEHOLDER_BODY = /x{5,}|\.{3}|example|placeholder|dummy|fake|your|redacted|changeme|sample|0{6,}|1{6,}|123456|abcdef|abcabc/i;

/** One-way digest of a value under a key that exists only for this run. */
export function digest(runKey, value) {
  return createHmac("sha256", runKey).update(value).digest("hex");
}

function pemPrivateKeyLines(text) {
  const lines = [];
  for (const block of text.matchAll(/-----BEGIN[A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END/g)) {
    const body = block[1]
      .replace(/\\n/g, "\n")
      .split(/\s+/)
      .filter((line) => line.length >= 40);
    lines.push(...body.slice(0, PEM_LINES_PER_KEY));
  }
  return lines;
}

function jsonLeaves(node, field, leaves) {
  if (typeof node === "string") {
    if (!PUBLIC_JSON_FIELD.test(field) && !/^https?:\/\//.test(node)) leaves.push(node);
  } else if (Array.isArray(node)) {
    node.forEach((item) => jsonLeaves(item, field, leaves));
  } else if (node && typeof node === "object") {
    Object.entries(node).forEach(([childField, child]) => jsonLeaves(child, childField, leaves));
  }
}

function parsedJson(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** The searchable values inside one stored secret: JSON leaves, PEM body lines or the text. */
export function secretLeaves(secretString) {
  const text = secretString.trim();
  const parsed = text.startsWith("{") || text.startsWith("[") ? parsedJson(text) : null;
  const leaves = [];
  if (parsed) jsonLeaves(parsed, "", leaves);
  else leaves.push(text);
  const values = leaves.flatMap((leaf) => (leaf.includes("-----BEGIN") ? pemPrivateKeyLines(leaf) : [leaf.trim()]));
  return [...new Set(values)].filter((value) => value.length >= MIN_NEEDLE_LENGTH && !/-----BEGIN/.test(value));
}

function base64Alignments(value) {
  const bytes = Buffer.from(value, "utf8");
  return [0, 1, 2].map((offset) => {
    const encoded = Buffer.concat([Buffer.alloc(offset), bytes]).toString("base64");
    const firstFullCharacter = Math.ceil((offset * 8) / 6);
    const lastFullCharacter = Math.floor((offset + bytes.length) / 3) * 4;
    return encoded.slice(firstFullCharacter, lastFullCharacter);
  });
}

/** Each form a value takes on a public surface. Base64 covers a value inside a Basic header. */
export function needleVariants(value) {
  const forms = new Map([["raw", value]]);
  const urlEncoded = encodeURIComponent(value);
  if (urlEncoded !== value) forms.set("url-encoded", urlEncoded);
  const jsonEscaped = JSON.stringify(value).slice(1, -1);
  if (jsonEscaped !== value) forms.set("json-escaped", jsonEscaped);
  base64Alignments(value)
    .filter((encoded) => encoded.length >= MIN_BASE64_NEEDLE_LENGTH)
    .forEach((encoded, index) => forms.set(`base64-${index}`, encoded));
  return [...forms].map(([encoding, form]) => ({ encoding, bytes: Buffer.from(form, "utf8") }));
}

/** Multi-needle byte search: a two-byte table, a four-byte map, then a full compare. */
export class NeedleSet {
  constructor(needles) {
    this.table = new Uint8Array(65536);
    this.byPrefix = new Map();
    this.longest = 0;
    for (const needle of needles) {
      const { bytes } = needle;
      this.table[bytes[0] | (bytes[1] << 8)] = 1;
      const prefix = bytes.readUInt32LE(0);
      if (!this.byPrefix.has(prefix)) this.byPrefix.set(prefix, []);
      this.byPrefix.get(prefix).push(needle);
      this.longest = Math.max(this.longest, bytes.length);
    }
  }

  scan(buffer, onHit, firstEnd = 0) {
    const { table, byPrefix } = this;
    const last = buffer.length - PREFIX_BYTES;
    for (let index = 0; index <= last; index += 1) {
      if (table[buffer[index] | (buffer[index + 1] << 8)] === 0) continue;
      const candidates = byPrefix.get(buffer.readUInt32LE(index));
      if (!candidates) continue;
      for (const needle of candidates) {
        const end = index + needle.bytes.length;
        if (end > firstEnd && end <= buffer.length && buffer.compare(needle.bytes, 0, needle.bytes.length, index, end) === 0) {
          onHit(needle);
        }
      }
    }
  }

  /** A scanner for data that arrives in chunks. A value split across two chunks still matches. */
  stream(onHit) {
    let carry = Buffer.alloc(0);
    const keep = Math.max(this.longest - 1, 0);
    return (chunk) => {
      const joined = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
      this.scan(joined, onHit, carry.length);
      carry = joined.subarray(Math.max(joined.length - keep, 0));
    };
  }
}

function shannonEntropy(text) {
  const counts = new Map();
  for (const character of text) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const share = count / text.length;
    entropy -= share * Math.log2(share);
  }
  return entropy;
}

/** Facts about a format match that are safe to report. The match itself stays here. */
export function assessFormatMatch(matchedText) {
  return {
    length: matchedText.length,
    entropy: Number(shannonEntropy(matchedText).toFixed(2)),
    placeholder: PLACEHOLDER_BODY.test(matchedText),
  };
}

export function looksBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

export function isZip(buffer) {
  return buffer.length > 22 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

export function isGzip(buffer) {
  return buffer.length > 18 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

export function gunzipBounded(buffer) {
  return gunzipSync(buffer, { maxOutputLength: MAX_INFLATED_BYTES });
}

function endOfCentralDirectory(buffer) {
  const earliest = Math.max(buffer.length - 65557, 0);
  for (let index = buffer.length - 22; index >= earliest; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  return -1;
}

/** Reads a zip from memory, so an entry never touches the disk. Yields { name, data } or { name, skipped }. */
export function* readZipEntries(buffer) {
  const end = endOfCentralDirectory(buffer);
  if (end < 0) return;
  const entryCount = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  for (let entry = 0; entry < entryCount && cursor + 46 <= buffer.length; entry += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) return;
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeader = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if ((flags & 1) === 1 || (method !== 0 && method !== 8) || compressedSize === 0xffffffff) {
      yield { name, skipped: "unsupported-entry" };
      continue;
    }
    const dataStart = localHeader + 30 + buffer.readUInt16LE(localHeader + 26) + buffer.readUInt16LE(localHeader + 28);
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    try {
      yield { name, data: method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: MAX_INFLATED_BYTES }) };
    } catch {
      yield { name, skipped: "inflate-failed" };
    }
  }
}
