// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/data/s3DiyaGlRepository.js
//
// S3-backed store for the paid diya-gl book storage tier: one metadata.json sidecar and a
// sequence of never-overwritten v{n}.zip objects per book, keyed under the caller's hashed sub.

import { createLogger } from "../lib/logger.js";
import { hashSub, hashSubWithVersion, getPreviousVersions } from "../services/subHasher.js";
import { getResourceName } from "../lib/dynamoDbClient.js";

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
      new GetObjectCommand({ Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true), Key: metadataKey(ownerPrefix, bookId) }),
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
 * @param {string} params.retention - "sandbox" or "resident", written as the object's `retention` tag
 * @param {string} [params.ifMatch]
 * @param {string} [params.ifNoneMatch]
 * @returns {Promise<string>} the new object's ETag, quotes and multipart suffix stripped
 */
export async function writeMetadata({ ownerPrefix, bookId, metadata, retention, ifMatch, ifNoneMatch }) {
  const client = await getS3Client();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const response = await client.send(
    new PutObjectCommand({
      Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true),
      Key: metadataKey(ownerPrefix, bookId),
      Body: JSON.stringify(metadata),
      ContentType: "application/json",
      Tagging: "retention=" + retention,
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
 * @param {string} params.retention - "sandbox" or "resident", written as the object's `retention` tag
 * @returns {Promise<string>} the new object's ETag, quotes and multipart suffix stripped
 */
export async function putVersion({ ownerPrefix, bookId, version, bytes, retention }) {
  const client = await getS3Client();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const response = await client.send(
    new PutObjectCommand({
      Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true),
      Key: versionKey(ownerPrefix, bookId, version),
      Body: bytes,
      ContentType: "application/zip",
      Tagging: "retention=" + retention,
      IfNoneMatch: "*",
    }),
  );
  return normaliseETag(response.ETag);
}

/**
 * Re-tags an existing object's `retention` tag, for when a book's retention changes at a save and
 * its already-written version objects and sidecar need to carry the new value.
 *
 * @param {string} key
 * @param {string} retention - "sandbox" or "resident"
 */
export async function tagObject(key, retention) {
  const client = await getS3Client();
  const { PutObjectTaggingCommand } = await import("@aws-sdk/client-s3");
  await client.send(
    new PutObjectTaggingCommand({
      Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true),
      Key: key,
      Tagging: { TagSet: [{ Key: "retention", Value: retention }] },
    }),
  );
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
    new GetObjectCommand({ Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true), Key: versionKey(ownerPrefix, bookId, version) }),
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
    new DeleteObjectCommand({ Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true), Key: versionKey(ownerPrefix, bookId, version) }),
  );
}

/**
 * True when a book is still visible to its owner. A resident book never disappears on its own; a
 * sandbox book disappears once its `expiresAt` passes, even though its S3 objects live on until
 * the bucket's own lifecycle rule catches up. Callers that count or list a user's books must
 * apply this so a book nobody can see any more doesn't still occupy a slot against the per-user
 * book limit.
 *
 * @param {object} book - a book metadata object, as returned by `readMetadata`/`listBooks`
 * @param {number} [now] - epoch ms, defaults to `Date.now()`
 * @returns {boolean}
 */
export function isBookVisible(book, now = Date.now()) {
  return book.retention !== "sandbox" || !book.expiresAt || Date.parse(book.expiresAt) > now;
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
    new ListObjectsV2Command({ Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true), Prefix: prefix, Delimiter: "/" }),
  );
  const bookIds = (listResponse.CommonPrefixes || [])
    .map((entry) => entry.Prefix)
    .map((entryPrefix) => entryPrefix.slice(prefix.length, -1))
    .filter(Boolean);

  const books = [];
  for (const bookId of bookIds) {
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true), Key: metadataKey(ownerPrefix, bookId) }),
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
  const bucket = getResourceName("DIYA_GL_BUCKET_NAME", true);

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
      Bucket: getResourceName("DIYA_GL_BUCKET_NAME", true),
      Prefix: `users/${ownerPrefix}/books/`,
      Delimiter: "/",
      MaxKeys: 1,
    }),
  );
  return (response.CommonPrefixes || []).length > 0;
}

export class BookNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "BookNotFoundError";
  }
}

export class DestinationBookExistsError extends Error {
  constructor(message) {
    super(message);
    this.name = "DestinationBookExistsError";
  }
}

/**
 * Moves a book from the practice's own book set to a client's. Copies every object under the
 * source prefix (metadata.json and every kept version) to the destination prefix, verifying each
 * copy's ETag against the source before any delete, then deletes the source keys. Refuses when
 * the destination already holds a book with this id, or when the source book doesn't exist.
 *
 * @param {string} practiceSub - the practice's raw Cognito sub
 * @param {string} clientId
 * @param {string} bookId
 * @returns {Promise<{bookId: string, clientId: string, movedObjectCount: number}>}
 * @throws {BookNotFoundError} when the practice has no such book of its own
 * @throws {DestinationBookExistsError} when the client already has a book with this id
 */
export async function moveBookToClient(practiceSub, clientId, bookId) {
  const client = await getS3Client();
  const { ListObjectsV2Command, CopyObjectCommand, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");
  const bucket = getResourceName("DIYA_GL_BUCKET_NAME", true);

  const sourceOwnerPrefix = await resolveOwnerPrefix(practiceSub, bookId);
  const destinationOwnerPrefix = `${hashSub(practiceSub)}/clients/${clientId}`;

  if (await metadataExists(destinationOwnerPrefix, bookId)) {
    throw new DestinationBookExistsError(`Client ${clientId} already has a book ${bookId}`);
  }

  const sourcePrefix = bookPrefix(sourceOwnerPrefix, bookId);
  const destinationPrefix = bookPrefix(destinationOwnerPrefix, bookId);

  const sourceObjects = [];
  let continuationToken;
  do {
    const listResponse = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: sourcePrefix, ContinuationToken: continuationToken }),
    );
    sourceObjects.push(...(listResponse.Contents || []));
    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  if (sourceObjects.length === 0) {
    throw new BookNotFoundError(`No book ${bookId} found under the practice's own books`);
  }

  // Copy every object first, verifying each copy's ETag against the source. Nothing is deleted
  // until every copy has been proven, so a failure partway through leaves the source untouched.
  const movedKeys = [];
  for (const sourceObject of sourceObjects) {
    const sourceKey = sourceObject.Key;
    const destinationKey = destinationPrefix + sourceKey.slice(sourcePrefix.length);
    const copyResponse = await client.send(
      new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${sourceKey}`, Key: destinationKey }),
    );
    const copiedETag = normaliseETag(copyResponse.CopyObjectResult?.ETag);
    const sourceETag = normaliseETag(sourceObject.ETag);
    if (!copiedETag || copiedETag !== sourceETag) {
      throw new Error(`Copy verification failed for ${sourceKey}: expected ETag ${sourceETag}, got ${copiedETag}`);
    }
    movedKeys.push(sourceKey);
  }

  await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: movedKeys.map((Key) => ({ Key })) } }));

  logger.info({ message: "Moved book to client", clientId, bookId, movedObjectCount: movedKeys.length });
  return { bookId, clientId, movedObjectCount: movedKeys.length };
}

/**
 * Copies every object under a book's prefix onto itself, replacing its `retention` tag: the
 * metadata sidecar and every kept zip version. A copy gets a new creation date, so the bucket's
 * lifecycle clock (which counts an object's age from its creation, not from a tag change)
 * restarts under the new tag. Objects in one listing page are copied concurrently, since a book
 * carries at most DIYA_GL_VERSIONS_KEPT + 1 objects and S3 sets no meaningful per-object limit
 * on that.
 *
 * @param {string} ownerPrefix
 * @param {string} bookId
 * @param {string} retention - "sandbox" or "resident"
 * @returns {Promise<number>} the number of objects retagged
 */
export async function retagBookObjects(ownerPrefix, bookId, retention) {
  const client = await getS3Client();
  const { ListObjectsV2Command, CopyObjectCommand } = await import("@aws-sdk/client-s3");
  const bucket = getResourceName("DIYA_GL_BUCKET_NAME", true);
  const prefix = bookPrefix(ownerPrefix, bookId);

  let retaggedCount = 0;
  let continuationToken;
  do {
    const listResponse = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    const objects = listResponse.Contents || [];
    await Promise.all(
      objects.map((object) =>
        client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${object.Key}`,
            Key: object.Key,
            MetadataDirective: "COPY",
            TaggingDirective: "REPLACE",
            Tagging: "retention=" + retention,
          }),
        ),
      ),
    );
    retaggedCount += objects.length;
    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return retaggedCount;
}

/**
 * Moves every one of an owner's currently visible books off its current retention tier onto a
 * new one: retags the book's own S3 objects (`retagBookObjects`, so the bucket's lifecycle clock
 * restarts under the new tag) and rewrites the book's own metadata content, since `listBooks` and
 * the version GET read `retention`/`expiresAt` from that content, never from the S3 tag alone.
 *
 * Called from the billing webhook when a Resident (or a practice's resident-pro) subscription
 * lapses or is reactivated: moving to "sandbox" with an `expiresAt` set puts a book onto the
 * bucket's existing sandbox lifecycle rule; moving to "resident" with no `expiresAt` takes it off.
 * Every currently visible book not already on the target tier is moved — a sandbox book that
 * predates any subscription is picked up by a reactivation exactly as a lapsed one is, which
 * matches what the book's next save would set anyway.
 *
 * A book whose metadata changes concurrently (its ETag no longer matches after the retag) is left
 * retagged at the S3 level but with its old metadata content: logged and skipped rather than
 * clobbering the concurrent write, since the next save through `diyaGlPut.js` corrects its
 * retention from the caller's live entitlement regardless.
 *
 * @param {string} ownerPrefix
 * @param {string} retention - "sandbox" or "resident"
 * @param {object} [options]
 * @param {string|null} [options.expiresAt] - written into each changed book's metadata
 * @returns {Promise<{bookId: string, objectCount: number}[]>} one entry per book actually changed
 */
export async function setOwnerBooksRetention(ownerPrefix, retention, { expiresAt = null } = {}) {
  const books = (await listBooks(ownerPrefix)).filter((book) => isBookVisible(book) && book.retention !== retention);

  const changed = [];
  for (const book of books) {
    const objectCount = await retagBookObjects(ownerPrefix, book.bookId, retention);

    const metadataResult = await readMetadata(ownerPrefix, book.bookId);
    if (!metadataResult) {
      logger.warn({ message: "Book metadata vanished mid-retag", ownerPrefix, bookId: book.bookId });
      continue;
    }
    try {
      await writeMetadata({
        ownerPrefix,
        bookId: book.bookId,
        metadata: { ...metadataResult.metadata, retention, expiresAt },
        retention,
        ifMatch: metadataResult.metaETag,
      });
    } catch (error) {
      if (error?.name !== "PreconditionFailed") {
        throw error;
      }
      logger.warn({
        message: "Book metadata changed concurrently during a retention move, leaving it to the next save",
        ownerPrefix,
        bookId: book.bookId,
      });
      continue;
    }

    changed.push({ bookId: book.bookId, objectCount });
  }
  return changed;
}

/**
 * Resolves the S3 key prefix for a caller's books, following the same salt-rotation fallback as
 * `getUserBundles`: the current salt version first, then each previous version in turn. Writes
 * always use the current version directly via `hashSub` and never call this.
 *
 * When `clientId` is given, the prefix is the practice's own hashed sub plus a client segment
 * (`{hashedSub}/clients/{clientId}`): a client's book set lives under
 * `users/{hashedSub}/clients/{clientId}/books/{bookId}/`, so passing the extended prefix
 * through unchanged to `bookPrefix`/`metadataKey`/`listBooks` is enough. The caller is
 * responsible for checking the client belongs to the signed-in practice before calling this.
 *
 * @param {string} sub - the raw Cognito sub
 * @param {string} [bookId] - when given, resolves by checking that book's own metadata; when
 *   omitted, resolves by checking whether any book exists under the candidate prefix
 * @param {string} [clientId] - when given, resolves the practice's client book set instead of its
 *   own
 * @returns {Promise<string>} the owner prefix, a hashed sub with an optional client segment
 */
export async function resolveOwnerPrefix(sub, bookId, clientId) {
  const withClientSegment = (hashedSub) => (clientId ? `${hashedSub}/clients/${clientId}` : hashedSub);

  const currentPrefix = withClientSegment(hashSub(sub));
  const exists = bookId ? await metadataExists(currentPrefix, bookId) : await anyBookExists(currentPrefix);
  if (exists) {
    return currentPrefix;
  }

  for (const version of getPreviousVersions()) {
    const candidatePrefix = withClientSegment(hashSubWithVersion(sub, version));
    const candidateExists = bookId ? await metadataExists(candidatePrefix, bookId) : await anyBookExists(candidatePrefix);
    if (candidateExists) {
      logger.warn({ message: "Found books at old salt version", version, bookId, clientId });
      return candidatePrefix;
    }
  }

  return currentPrefix;
}
