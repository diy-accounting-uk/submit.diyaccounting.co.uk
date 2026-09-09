// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/s3DiyaGlRepository.js
//
// S3-backed store for the paid diya-gl book storage tier: one metadata.json sidecar and a
// sequence of never-overwritten v{n}.zip objects per book, keyed under the caller's hashed sub.

import { createLogger } from "../lib/logger.js";
import { hashSub, hashSubWithVersion, getPreviousVersions } from "../services/subHasher.js";

const logger = createLogger({ source: "app/data/s3DiyaGlRepository.js" });

let __s3Client = null;

const BOOK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * True when the given bookId is a valid v4 UUID. Rejecting anything else closes path traversal
 * through the S3 key, since a bookId becomes a key segment directly.
 *
 * @param {string} bookId
 * @returns {boolean}
 */
export function isValidBookId(bookId) {
  return typeof bookId === "string" && BOOK_ID_PATTERN.test(bookId);
}

function getTableName() {
  const bucketName = process.env.BOOKS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("BOOKS_BUCKET_NAME environment variable is required");
  }
  return bucketName;
}

async function getS3Client() {
  if (!__s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const endpoint = process.env.AWS_ENDPOINT_URL_S3 || process.env.AWS_ENDPOINT_URL;
    __s3Client = new S3Client({
      region: process.env.AWS_REGION || "eu-west-2",
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }
  return __s3Client;
}

/**
 * Reset the cached client. Test-only.
 */
export function _resetS3Client() {
  __s3Client = null;
}

export function bookPrefix(ownerPrefix, bookId) {
  return `users/${ownerPrefix}/books/${bookId}/`;
}

export function metadataKey(ownerPrefix, bookId) {
  return `${bookPrefix(ownerPrefix, bookId)}metadata.json`;
}

export function versionKey(ownerPrefix, bookId, version) {
  return `${bookPrefix(ownerPrefix, bookId)}v${version}.zip`;
}

/**
 * Strips the surrounding quotes S3 puts on every ETag, and the "-N" multipart-upload suffix, so
 * an ETag can be compared and stored as a plain token throughout the handlers.
 *
 * @param {string} etag
 * @returns {string}
 */
export function normaliseETag(etag) {
  if (!etag) return etag;
  return etag.replace(/^"|"$/g, "").replace(/-\d+$/, "");
}

/**
 * Reads metadata.json for a book.
 *
 * @param {string} ownerPrefix
 * @param {string} bookId
 * @returns {Promise<{metadata: object, metaETag: string} | null>} null when the object doesn't exist
 */
export async function readMetadata(ownerPrefix, bookId) {
  const client = await getS3Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: getTableName(), Key: metadataKey(ownerPrefix, bookId) }),
    );
    const body = await response.Body.transformToString("utf8");
    return { metadata: JSON.parse(body), metaETag: normaliseETag(response.ETag) };
  } catch (error) {
    if (error.name === "NoSuchKey") {
      return null;
    }
    logger.error({ message: "Error reading book metadata", error: error.message, ownerPrefix, bookId });
    throw error;
  }
}

/**
 * Writes metadata.json with an optimistic-concurrency guard: pass exactly one of `ifMatch` (the
 * S3 ETag it must currently carry) or `ifNoneMatch` (pass "*" for "must not exist yet").
 *
 * @param {object} params
 * @param {string} params.ownerPrefix
 * @param {string} params.bookId
 * @param {object} params.metadata
 * @param {string} [params.ifMatch]
 * @param {string} [params.ifNoneMatch]
 * @returns {Promise<string>} the new object's ETag, quotes and multipart suffix stripped
 */
export async function writeMetadata({ ownerPrefix, bookId, metadata, ifMatch, ifNoneMatch }) {
  const client = await getS3Client();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const response = await client.send(
    new PutObjectCommand({
      Bucket: getTableName(),
      Key: metadataKey(ownerPrefix, bookId),
      Body: JSON.stringify(metadata),
      ContentType: "application/json",
      ...(ifMatch ? { IfMatch: ifMatch } : {}),
      ...(ifNoneMatch ? { IfNoneMatch: ifNoneMatch } : {}),
    }),
  );
  return normaliseETag(response.ETag);
}

/**
 * Writes a version's zip bytes. Every version object is written once and never overwritten, so
 * this always carries `IfNoneMatch: "*"`.
 *
 * @param {object} params
 * @param {string} params.ownerPrefix
 * @param {string} params.bookId
 * @param {number} params.version
 * @param {Buffer} params.bytes
 * @returns {Promise<string>} the new object's ETag, quotes and multipart suffix stripped
 */
export async function putVersion({ ownerPrefix, bookId, version, bytes }) {
  const client = await getS3Client();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const response = await client.send(
    new PutObjectCommand({
      Bucket: getTableName(),
      Key: versionKey(ownerPrefix, bookId, version),
      Body: bytes,
      ContentType: "application/zip",
      IfNoneMatch: "*",
    }),
  );
  return normaliseETag(response.ETag);
}

/**
 * Reads a version's zip bytes.
 *
 * @param {string} ownerPrefix
 * @param {string} bookId
 * @param {number} version
 * @returns {Promise<{bytes: Buffer, etag: string}>}
 * @throws {Error} with `name === "NoSuchKey"` when the version doesn't exist
 */
export async function getVersion(ownerPrefix, bookId, version) {
  const client = await getS3Client();
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const response = await client.send(
    new GetObjectCommand({ Bucket: getTableName(), Key: versionKey(ownerPrefix, bookId, version) }),
  );
  const bytes = Buffer.from(await response.Body.transformToByteArray());
  return { bytes, etag: normaliseETag(response.ETag) };
}

/**
 * Deletes a version's zip object. Used when pruning beyond the kept-version limit.
 *
 * @param {string} ownerPrefix
 * @param {string} bookId
 * @param {number} version
 */
export async function deleteVersion(ownerPrefix, bookId, version) {
  const client = await getS3Client();
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await client.send(
    new DeleteObjectCommand({ Bucket: getTableName(), Key: versionKey(ownerPrefix, bookId, version) }),
  );
}

/**
 * Lists every book's metadata under an owner prefix, at most 20 books (the per-user book limit).
 * An unreadable metadata.json is logged and skipped rather than failing the whole list.
 *
 * @param {string} ownerPrefix
 * @returns {Promise<object[]>} metadata objects, in no particular order
 */
export async function listBooks(ownerPrefix) {
  const client = await getS3Client();
  const { ListObjectsV2Command, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const prefix = `users/${ownerPrefix}/books/`;

  const listResponse = await client.send(
    new ListObjectsV2Command({ Bucket: getTableName(), Prefix: prefix, Delimiter: "/" }),
  );
  const bookIds = (listResponse.CommonPrefixes || [])
    .map((entry) => entry.Prefix)
    .map((entryPrefix) => entryPrefix.slice(prefix.length, -1))
    .filter(Boolean);

  const books = [];
  for (const bookId of bookIds) {
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: getTableName(), Key: metadataKey(ownerPrefix, bookId) }),
      );
      const body = await response.Body.transformToString("utf8");
      books.push(JSON.parse(body));
    } catch (error) {
      logger.warn({ message: "Skipping unreadable book metadata", ownerPrefix, bookId, error: error.message });
    }
  }
  return books;
}

/**
 * Deletes every object under a book's prefix, in pages of 1000.
 *
 * @param {string} ownerPrefix
 * @param {string} bookId
 * @returns {Promise<number>} the number of objects deleted
 */
export async function deleteBook(ownerPrefix, bookId) {
  const client = await getS3Client();
  const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  const prefix = bookPrefix(ownerPrefix, bookId);
  const bucket = getTableName();

  let deletedCount = 0;
  let continuationToken;
  do {
    const listResponse = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    const objects = listResponse.Contents || [];
    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects.map((object) => ({ Key: object.Key })) },
        }),
      );
      deletedCount += objects.length;
    }
    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return deletedCount;
}

/**
 * True when a book's metadata.json exists under the given owner prefix.
 */
async function metadataExists(ownerPrefix, bookId) {
  return (await readMetadata(ownerPrefix, bookId)) !== null;
}

/**
 * True when any book exists under the given owner prefix.
 */
async function anyBookExists(ownerPrefix) {
  const client = await getS3Client();
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: getTableName(),
      Prefix: `users/${ownerPrefix}/books/`,
      Delimiter: "/",
      MaxKeys: 1,
    }),
  );
  return (response.CommonPrefixes || []).length > 0;
}

/**
 * Resolves the S3 key prefix for a caller's books, following the same salt-rotation fallback as
 * `getUserBundles`: the current salt version first, then each previous version in turn. Writes
 * always use the current version directly via `hashSub` and never call this.
 *
 * @param {string} sub - the raw Cognito sub
 * @param {string} [bookId] - when given, resolves by checking that book's own metadata; when
 *   omitted, resolves by checking whether any book exists under the candidate prefix
 * @returns {Promise<string>} the hashed sub to use as the owner prefix
 */
export async function resolveOwnerPrefix(sub, bookId) {
  const currentPrefix = hashSub(sub);
  const exists = bookId ? await metadataExists(currentPrefix, bookId) : await anyBookExists(currentPrefix);
  if (exists) {
    return currentPrefix;
  }

  for (const version of getPreviousVersions()) {
    const candidatePrefix = hashSubWithVersion(sub, version);
    const candidateExists = bookId ? await metadataExists(candidatePrefix, bookId) : await anyBookExists(candidatePrefix);
    if (candidateExists) {
      logger.warn({ message: "Found books at old salt version", version, bookId });
      return candidatePrefix;
    }
  }

  return currentPrefix;
}
