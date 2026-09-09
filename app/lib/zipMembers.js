// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/zipMembers.js
//
// Reads the member names out of a zip's central directory without unzipping anything, so a
// books PUT can validate the package shape before ever inflating a member.

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_RECORD_SIZE = 22;
const CENTRAL_DIRECTORY_HEADER_SIZE = 46;
const MAX_END_OF_CENTRAL_DIRECTORY_SCAN_BYTES = 65557; // 22-byte record + max 65535-byte comment

const REQUIRED_MEMBER_NAMES = ["book.toml", "lines.jsonl", "report.json"];
const ALLOWED_MEMBER_NAMES = new Set(["book.toml", "lines.jsonl", "report.json", "bookchecks.json", "overtyped.json"]);

export class NotAZipError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotAZipError";
  }
}

/**
 * Scans backward from the end of the buffer for the end-of-central-directory signature and
 * returns its offset.
 *
 * @param {Buffer} buffer
 * @returns {number}
 * @throws {NotAZipError} if the signature isn't found within the last 65557 bytes
 */
function findEndOfCentralDirectory(buffer) {
  const scanStart = Math.max(0, buffer.length - MAX_END_OF_CENTRAL_DIRECTORY_SCAN_BYTES);
  for (let offset = buffer.length - END_OF_CENTRAL_DIRECTORY_RECORD_SIZE; offset >= scanStart; offset--) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new NotAZipError("End of central directory signature not found");
}

/**
 * Reads the member names from a zip file's central directory without inflating any member.
 *
 * @param {Buffer} buffer
 * @returns {string[]} member names in central-directory order
 * @throws {NotAZipError} if the buffer is too short, has no end-of-central-directory record, or a
 *   central directory header is malformed
 */
export function listZipMemberNames(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < END_OF_CENTRAL_DIRECTORY_RECORD_SIZE) {
    throw new NotAZipError("Buffer too short to contain a zip end of central directory record");
  }

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (centralDirectoryOffset > eocdOffset) {
    throw new NotAZipError("Central directory offset points past the end of central directory record");
  }

  const names = [];
  let cursor = centralDirectoryOffset;
  for (let i = 0; i < entryCount; i++) {
    if (cursor + CENTRAL_DIRECTORY_HEADER_SIZE > eocdOffset) {
      throw new NotAZipError(`Truncated central directory header for entry ${i}`);
    }
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      throw new NotAZipError(`Central directory header signature mismatch for entry ${i}`);
    }
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nameStart = cursor + CENTRAL_DIRECTORY_HEADER_SIZE;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > eocdOffset) {
      throw new NotAZipError(`Truncated file name for entry ${i}`);
    }
    names.push(buffer.toString("utf8", nameStart, nameEnd));
    cursor = nameEnd + extraLength + commentLength;
  }

  return names;
}

/**
 * True when the given member names are exactly a diya-gl package: every required member present,
 * every name from the allowed set, no directories and no nesting.
 *
 * @param {string[]} names
 * @returns {boolean}
 */
export function isDiyaGlPackage(names) {
  if (!Array.isArray(names) || names.length === 0) {
    return false;
  }
  if (!names.every((name) => ALLOWED_MEMBER_NAMES.has(name))) {
    return false;
  }
  const nameSet = new Set(names);
  return REQUIRED_MEMBER_NAMES.every((required) => nameSet.has(required));
}
