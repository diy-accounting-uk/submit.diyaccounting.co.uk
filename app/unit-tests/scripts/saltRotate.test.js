// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/saltRotate.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { gunzipSync } from "node:zlib";
import {
  CACHE_WAIT_MS,
  buildAliases,
  buildIdentityMap,
  clearRotation,
  cutOverRegistry,
  hashValue,
  loadManifest,
  nextVersionLabel,
  parseArgs,
  planRow,
  rewriteHashes,
  runRotation,
  stageRegistry,
} from "../../../scripts/salt-rotate.js";
import { isSaltRotationWrite } from "@app/functions/analytics/dynamoStreamToFirehose.js";

const OLD_SALT = "old-salt";
const SUB_A = "sub-a";
const SUB_B = "sub-b";
const ORPHAN_HASH = hashValue(OLD_SALT, "deleted-sub");
const hashA = hashValue(OLD_SALT, SUB_A);
const hashB = hashValue(OLD_SALT, SUB_B);

function conditionFailure() {
  return Object.assign(new Error("condition"), { name: "ConditionalCheckFailedException" });
}

/** An in-memory DynamoDB that answers the commands the rotation sends. */
function createFakeDynamo() {
  const tables = new Map();
  const keyNames = (tableName) => {
    if (tableName.endsWith("-passes") || tableName.endsWith("-subscriptions")) return ["pk"];
    if (tableName.endsWith("-commissions")) return ["pk", "sk"];
    const entry = loadManifest().partitionTables.find(({ table }) => tableName.endsWith(`-env-${table}`));
    return ["hashedSub", entry.sortKey];
  };
  const keyOf = (tableName, item) =>
    keyNames(tableName)
      .map((name) => item[name])
      .join("|");
  const tableOf = (tableName) => {
    if (!tables.has(tableName)) tables.set(tableName, new Map());
    return tables.get(tableName);
  };

  const fake = {
    writesBeforeFailure: Infinity,
    writes: 0,
    tableOf,
    seed: (tableName, item) => tableOf(tableName).set(keyOf(tableName, item), item),
    items: (tableName) => [...tableOf(tableName).values()],
    countWrite() {
      fake.writes += 1;
      if (fake.writes > fake.writesBeforeFailure) throw new Error("Stopped halfway");
    },
    async send(command) {
      const input = command.input;
      switch (command.constructor.name) {
        case "QueryCommand": {
          const hash = input.ExpressionAttributeValues[":hashedSub"];
          const items = fake.items(input.TableName).filter((item) => item.hashedSub === hash);
          return input.Select === "COUNT" ? { Count: items.length } : { Items: items };
        }
        case "ScanCommand":
          return { Items: fake.items(input.TableName).map((item) => ({ ...item })) };
        case "GetCommand":
          return { Item: tableOf(input.TableName).get(keyOf(input.TableName, input.Key)) };
        case "PutCommand":
          fake.countWrite();
          fake.seed(input.TableName, input.Item);
          return {};
        case "UpdateCommand": {
          fake.countWrite();
          const table = tableOf(input.TableName);
          const key = keyOf(input.TableName, input.Key);
          const item = table.get(key);
          if (!item) throw conditionFailure();
          const values = input.ExpressionAttributeValues;
          if (values[":mark"]?.startsWith("to:")) {
            table.set(key, { ...item, saltRotation: values[":mark"] });
          } else {
            const updated = { ...item, saltRotation: values[":mark"], saltVersion: values[":version"] };
            for (const [alias, name] of Object.entries(input.ExpressionAttributeNames)) {
              const index = alias.slice(2);
              if (item[name] !== values[`:old${index}`]) throw conditionFailure();
              updated[name] = values[`:new${index}`];
            }
            table.set(key, updated);
          }
          return { Attributes: table.get(key) };
        }
        case "TransactWriteCommand": {
          fake.countWrite();
          const [{ Put }, { Delete }] = input.TransactItems;
          if (Put.ConditionExpression && tableOf(Put.TableName).has(keyOf(Put.TableName, Put.Item))) {
            throw Object.assign(new Error("cancelled"), {
              name: "TransactionCanceledException",
              CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }],
            });
          }
          fake.seed(Put.TableName, Put.Item);
          tableOf(Delete.TableName).delete(keyOf(Delete.TableName, Delete.Key));
          return {};
        }
        default:
          throw new Error(`Unexpected command ${command.constructor.name}`);
      }
    },
  };
  return fake;
}

/** An in-memory S3, with one bucket's objects as key to ETag and body. */
function createFakeS3() {
  const objects = new Map();
  return {
    objects,
    copies: [],
    async send(command) {
      const input = command.input;
      switch (command.constructor.name) {
        case "ListObjectsV2Command":
          return { Contents: [...objects].filter(([key]) => key.startsWith(input.Prefix)).map(([Key, { ETag }]) => ({ Key, ETag })) };
        case "HeadObjectCommand": {
          const object = objects.get(input.Key);
          if (!object) throw Object.assign(new Error("missing"), { name: "NotFound" });
          return { ETag: object.ETag };
        }
        case "CopyObjectCommand": {
          const source = objects.get(input.CopySource.slice(input.Bucket.length + 1));
          objects.set(input.Key, source);
          this.copies.push(input.Key);
          return { CopyObjectResult: { ETag: source.ETag } };
        }
        case "DeleteObjectsCommand":
          for (const { Key } of input.Delete.Objects) objects.delete(Key);
          return {};
        case "GetObjectCommand": {
          const object = objects.get(input.Key);
          if (!object) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
          return { Body: { transformToByteArray: async () => object.Body } };
        }
        case "PutObjectCommand":
          objects.set(input.Key, { ETag: "written", Body: input.Body });
          return {};
        default:
          throw new Error(`Unexpected command ${command.constructor.name}`);
      }
    },
  };
}

function createContext(state) {
  return {
    envName: "ci",
    doc: state.dynamo,
    s3: state.s3,
    booksBucket: "books",
    lakeBucket: "lake",
    log: (line) => state.logs.push(line),
    now: () => new Date(state.clock).toISOString(),
    sleep: async (ms) => {
      state.slept.push(ms);
      state.clock += ms;
    },
    readRegistry: async () => JSON.parse(state.secret),
    writeRegistry: async (registry) => {
      state.secret = JSON.stringify(registry);
      state.registryWrites.push(registry);
    },
    listUsers: async () => [
      { sub: SUB_A, email: "A@Example.com " },
      { sub: SUB_B, email: "b@example.com" },
    ],
    readLakeHashes: async () => [hashA, ORPHAN_HASH],
  };
}

function seedStores(dynamo, s3) {
  dynamo.seed("ci-env-bundles", { hashedSub: hashA, bundleId: "day-guest", tokensConsumed: 3, saltVersion: "v1" });
  dynamo.seed("ci-env-bundles", { hashedSub: hashB, bundleId: "resident-pro", saltVersion: "v1" });
  dynamo.seed("ci-env-receipts", { hashedSub: hashA, receiptId: "r1", saltVersion: "v1" });
  dynamo.seed("ci-env-receipts", { hashedSub: ORPHAN_HASH, receiptId: "r-orphan", saltVersion: "v1" });
  dynamo.seed("ci-env-practice-clients", { hashedSub: hashB, clientId: "c1" });
  dynamo.seed("ci-env-activity-charges", { hashedSub: hashB, chargeKey: "charge#x#y", status: "paid" });
  dynamo.seed("ci-env-passes", { pk: "pass#some-code", issuedBy: hashA });
  dynamo.seed("ci-env-passes", { pk: `redemption#some-code#${hashB}`, redeemedBy: hashB, issuedBy: hashA });
  dynamo.seed("ci-env-passes", { pk: `referral#${hashB}`, code: "some-code" });
  dynamo.seed("ci-env-passes", { pk: `familyemail#${hashValue(OLD_SALT, "a@example.com")}`, hashedSub: hashA });
  dynamo.seed("ci-env-commissions", { pk: `commission#${hashA}`, sk: `redeemer#${hashB}`, redeemerHash: hashB });
  dynamo.seed("ci-env-commissions", { pk: "held", sk: `2026-12-01#${hashA}#in_1`, linePk: `commission#${hashA}`, lineSk: "line#in_1" });
  dynamo.seed("ci-env-subscriptions", { pk: "stripe#sub_1", hashedSub: hashB, stripeCustomerId: "cus_1" });
  s3.objects.set(`users/${hashA}/books/b1/v1.zip`, { ETag: '"zip"' });
  s3.objects.set(`users/${hashA}/books/b1/metadata.json`, { ETag: '"meta"' });
}

/** A stable picture of every store with the current salt's hashes in place of the raw values. */
function snapshot(state) {
  const tables = {};
  for (const name of ["bundles", "receipts", "practice-clients", "activity-charges", "passes", "commissions", "subscriptions"]) {
    tables[name] = state.dynamo.items(`ci-env-${name}`).map((item) => {
      const copy = { ...item };
      delete copy.saltRotation;
      return copy;
    });
    tables[name].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  const books = [...state.s3.objects.keys()].filter((key) => key.startsWith("users/")).sort();
  return { tables, books };
}

function newState() {
  const state = {
    dynamo: createFakeDynamo(),
    s3: createFakeS3(),
    secret: JSON.stringify({ current: "v1", versions: { v1: OLD_SALT } }),
    clock: Date.parse("2026-11-04T10:00:00.000Z"),
    logs: [],
    slept: [],
    registryWrites: [],
  };
  seedStores(state.dynamo, state.s3);
  return state;
}

const newSaltOf = (state) => JSON.parse(state.secret).versions.v2;

describe("salt-rotate registry steps", () => {
  test("the mode defaults to plan and an unknown mode is refused", () => {
    expect(parseArgs([]).mode).toBe("plan");
    expect(parseArgs(["--mode", "sweep"]).mode).toBe("sweep");
    expect(() => parseArgs(["--mode", "all"])).toThrow("Unknown mode");
  });

  test("the new version stays non-current until the cutover", () => {
    const registry = { current: "v2", versions: { v1: "a", v2: "b" } };
    expect(nextVersionLabel(registry)).toBe("v3");
    const staged = stageRegistry(registry, "v3", "c", "t1");
    expect(staged.current).toBe("v2");
    expect(staged.versions).toEqual({ v1: "a", v2: "b", v3: "c" });
    const cutOver = cutOverRegistry(staged, "t2");
    expect(cutOver.current).toBe("v3");
    expect(cutOver.rotation).toEqual({ from: "v2", to: "v3", state: "cutover", at: "t2" });
    expect(clearRotation(cutOver)).toEqual({ current: "v3", versions: { v1: "a", v2: "b", v3: "c" } });
  });
});

describe("salt-rotate row rewriting", () => {
  const registry = { current: "v2", versions: { v1: OLD_SALT, v2: "new-salt" } };
  const users = [{ sub: SUB_A, email: " A@Example.com" }];
  const identityMap = buildIdentityMap(registry, users);
  const newA = hashValue("new-salt", SUB_A);

  test("a known hash is replaced, a current hash is left, an unknown hash is counted", () => {
    expect(rewriteHashes(`commission#${hashA}`, identityMap)).toEqual({ rewritten: `commission#${newA}`, unmapped: 0 });
    expect(rewriteHashes(`commission#${newA}`, identityMap)).toEqual({ rewritten: `commission#${newA}`, unmapped: 0 });
    expect(rewriteHashes(ORPHAN_HASH, identityMap)).toEqual({ rewritten: ORPHAN_HASH, unmapped: 1 });
  });

  test("the family email key maps through the normalised email", () => {
    const key = `familyemail#${hashValue(OLD_SALT, "a@example.com")}`;
    expect(rewriteHashes(key, identityMap).rewritten).toBe(`familyemail#${hashValue("new-salt", "a@example.com")}`);
  });

  test("a row splits into a key change and attribute changes", () => {
    const table = { partitionKey: "pk", sortKey: "sk", attributes: ["linePk"] };
    const plan = planRow({ pk: "held", sk: `2026#${hashA}#in_1`, linePk: `commission#${hashA}` }, table, identityMap);
    expect(plan.keyChanged).toBe(true);
    expect(plan.newKey).toEqual({ pk: "held", sk: `2026#${newA}#in_1` });
    expect(plan.attributeChanges).toEqual({ linePk: `commission#${newA}` });
  });
});

describe("salt-rotate runs", () => {
  let state;

  beforeEach(() => {
    state = newState();
  });

  test("a plan writes nothing and reports the counts by version", async () => {
    const { before, after } = await runRotation(createContext(state), { mode: "plan" });
    expect(state.registryWrites).toEqual([]);
    expect(state.dynamo.writes).toBe(0);
    expect(after).toBeNull();
    expect(before.bundles).toEqual({ current: 2, earlier: 0 });
  });

  test("a rotation moves every store, waits out both cache windows and leaves the canary green", async () => {
    const { after } = await runRotation(createContext(state), { mode: "rotate" });
    const newSalt = newSaltOf(state);
    const newA = hashValue(newSalt, SUB_A);
    const newB = hashValue(newSalt, SUB_B);

    expect(state.slept).toEqual([CACHE_WAIT_MS, CACHE_WAIT_MS]);
    expect(state.registryWrites.map((registry) => registry.rotation?.state)).toEqual(["staged", "cutover", undefined]);
    expect(JSON.parse(state.secret).current).toBe("v2");
    expect(JSON.parse(state.secret).versions.v1).toBe(OLD_SALT);

    expect(state.dynamo.items("ci-env-bundles").find((item) => item.bundleId === "day-guest")).toMatchObject({
      hashedSub: newA,
      tokensConsumed: 3,
      saltVersion: "v2",
    });
    const passes = state.dynamo.items("ci-env-passes");
    expect(passes.find((item) => item.pk === "pass#some-code").issuedBy).toBe(newA);
    expect(passes.find((item) => item.pk === `redemption#some-code#${newB}`)).toMatchObject({ redeemedBy: newB, issuedBy: newA });
    expect(passes.find((item) => item.pk === `referral#${newB}`)).toBeDefined();
    expect(passes.find((item) => item.pk === `familyemail#${hashValue(newSalt, "a@example.com")}`).hashedSub).toBe(newA);

    const commissions = state.dynamo.items("ci-env-commissions");
    expect(commissions.find((item) => item.pk === `commission#${newA}`)).toMatchObject({ sk: `redeemer#${newB}`, redeemerHash: newB });
    expect(commissions.find((item) => item.pk === "held")).toMatchObject({ sk: `2026-12-01#${newA}#in_1`, linePk: `commission#${newA}` });
    expect(state.dynamo.items("ci-env-subscriptions")[0].hashedSub).toBe(newB);

    expect([...state.s3.objects.keys()].filter((key) => key.startsWith("users/")).sort()).toEqual([
      `users/${newA}/books/b1/metadata.json`,
      `users/${newA}/books/b1/v1.zip`,
    ]);
    expect(state.s3.copies.at(-1)).toContain("metadata.json");

    expect(after.bundles).toEqual({ current: 2, earlier: 0 });
    expect(after["diya-gl"]).toEqual({ current: 2, earlier: 0 });
    expect(state.logs).toContain("Salt canary: green");
    expect(state.dynamo.items("ci-env-bundles").find((item) => item.hashedSub === "system#canary").saltVersion).toBe("v2");
  });

  test("a hash with no Cognito user stays where it is and is counted", async () => {
    await runRotation(createContext(state), { mode: "rotate" });
    expect(state.dynamo.items("ci-env-receipts").find((item) => item.receiptId === "r-orphan")).toMatchObject({
      hashedSub: ORPHAN_HASH,
      saltVersion: "v1",
    });
    expect(state.logs).toContain("Lake hashes with no Cognito user: 1");
  });

  test("a re-run after a finished rotation by a sweep changes nothing", async () => {
    await runRotation(createContext(state), { mode: "rotate" });
    const finished = snapshot(state);
    const secretAfterRotation = state.secret;

    const { report } = await runRotation(createContext(state), { mode: "sweep" });

    expect(snapshot(state).books).toEqual(finished.books);
    expect(snapshot(state).tables.bundles.filter((item) => item.hashedSub !== "system#canary")).toEqual(
      finished.tables.bundles.filter((item) => item.hashedSub !== "system#canary"),
    );
    expect(snapshot(state).tables.passes).toEqual(finished.tables.passes);
    expect(state.secret).toBe(secretAfterRotation);
    expect(report).toEqual({});
  });

  test("a sweep moves an item written late under the earlier hash", async () => {
    await runRotation(createContext(state), { mode: "rotate" });
    state.dynamo.seed("ci-env-bundles", { hashedSub: hashA, bundleId: "late-webhook-grant", saltVersion: "v2" });

    await runRotation(createContext(state), { mode: "sweep" });

    const newA = hashValue(newSaltOf(state), SUB_A);
    expect(state.dynamo.items("ci-env-bundles").find((item) => item.bundleId === "late-webhook-grant").hashedSub).toBe(newA);
  });

  test.each([1, 2, 3, 7, 12, 20])("a stop after %i writes resumes to the same end state", async (writes) => {
    const clean = newState();
    await runRotation(createContext(clean), { mode: "rotate" });

    state.dynamo.writesBeforeFailure = writes;
    await expect(runRotation(createContext(state), { mode: "rotate" })).rejects.toThrow("Stopped halfway");

    const stoppedWith = JSON.parse(state.secret).rotation;
    expect(stoppedWith.state).toBe("cutover");

    state.dynamo.writesBeforeFailure = Infinity;
    await runRotation(createContext(state), { mode: "rotate" });

    const registry = JSON.parse(state.secret);
    expect(registry.current).toBe("v2");
    expect(registry.rotation).toBeUndefined();
    expect(Object.keys(registry.versions)).toEqual(["v1", "v2"]);

    const newA = hashValue(registry.versions.v2, SUB_A);
    expect(state.dynamo.items("ci-env-bundles").filter((item) => item.hashedSub === newA)).toHaveLength(1);
    expect(state.dynamo.items("ci-env-bundles").filter((item) => item.hashedSub === hashA)).toHaveLength(0);
    expect(state.dynamo.items("ci-env-passes")).toHaveLength(clean.dynamo.items("ci-env-passes").length);
    expect(state.dynamo.items("ci-env-commissions")).toHaveLength(clean.dynamo.items("ci-env-commissions").length);
  });

  test("a stop while staged keeps the staged version and does not add another", async () => {
    const context = createContext(state);
    const failingWrite = context.writeRegistry;
    let calls = 0;
    context.writeRegistry = async (registry) => {
      calls += 1;
      if (calls === 2) throw new Error("Stopped halfway");
      await failingWrite(registry);
    };
    await expect(runRotation(context, { mode: "rotate" })).rejects.toThrow("Stopped halfway");
    const stagedSalt = newSaltOf(state);
    expect(JSON.parse(state.secret).current).toBe("v1");

    await runRotation(createContext(state), { mode: "rotate" });

    expect(newSaltOf(state)).toBe(stagedSalt);
    expect(Object.keys(JSON.parse(state.secret).versions)).toEqual(["v1", "v2"]);
  });

  test("an item already at the new hash keeps its values and takes the gaps from the old item", async () => {
    const context = createContext(state);
    const writeRegistry = context.writeRegistry;
    context.writeRegistry = async (registry) => {
      await writeRegistry(registry);
      if (registry.rotation?.state === "cutover") {
        const newA = hashValue(registry.versions.v2, SUB_A);
        state.dynamo.seed("ci-env-bundles", { hashedSub: newA, bundleId: "day-guest", status: "active" });
      }
    };

    const { report } = await runRotation(context, { mode: "rotate" });

    expect(report.bundles.merged).toBe(1);
    expect(state.dynamo.items("ci-env-bundles").find((item) => item.bundleId === "day-guest")).toMatchObject({
      status: "active",
      tokensConsumed: 3,
      saltVersion: "v2",
    });
  });

  test("a sweep refuses while a rotation is in flight", async () => {
    state.secret = JSON.stringify(
      stageRegistry({ current: "v1", versions: { v1: OLD_SALT } }, "v2", "new-salt", "2026-11-04T10:00:00.000Z"),
    );
    await expect(runRotation(createContext(state), { mode: "sweep" })).rejects.toThrow("A rotation is in flight");
  });

  test("no log line holds a salt, a hash, a sub or an email", async () => {
    await runRotation(createContext(state), { mode: "rotate" });
    const log = state.logs.join("\n");
    expect(log).not.toMatch(/[0-9a-f]{64}/);
    expect(log).not.toContain(newSaltOf(state));
    expect(log).not.toContain(OLD_SALT);
    expect(log).not.toContain(SUB_A);
    expect(log).not.toContain("example.com");
  });

  test("the lake aliases map each earlier hash of a user, a pass and a customer", async () => {
    await runRotation(createContext(state), { mode: "rotate" });
    const newSalt = newSaltOf(state);
    const object = state.s3.objects.get("curated/hash-aliases/hash_aliases.json.gz");
    const rows = gunzipSync(object.Body)
      .toString("utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const aliases = new Map(rows.map((row) => [row.old_hash, row.current_hash]));

    expect(aliases.get(hashA)).toBe(hashValue(newSalt, SUB_A));
    expect(aliases.get(hashValue(OLD_SALT, "pass#some-code"))).toBe(hashValue(newSalt, "pass#some-code"));
    expect(aliases.get(hashValue(OLD_SALT, `redemption#some-code#${hashB}`))).toBe(
      hashValue(newSalt, `redemption#some-code#${hashValue(newSalt, SUB_B)}`),
    );
    expect(aliases.get(hashValue(OLD_SALT, "cus_1"))).toBe(hashValue(newSalt, "cus_1"));
  });
});

describe("salt-rotate retire", () => {
  let state;

  beforeEach(async () => {
    state = newState();
    await runRotation(createContext(state), { mode: "rotate" });
    state.registryWrites.length = 0;
    state.dynamo.writes = 0;
  });

  const aliasRows = () =>
    gunzipSync(state.s3.objects.get("curated/hash-aliases/hash_aliases.json.gz").Body).toString("utf-8").split("\n").filter(Boolean);

  test("retire drops the named version, logs the next step and writes nothing else", async () => {
    const aliasesBefore = aliasRows();
    await runRotation(createContext(state), { mode: "retire", version: "v1" });
    expect(state.registryWrites).toHaveLength(1);
    const registry = JSON.parse(state.secret);
    expect(Object.keys(registry.versions)).toEqual(["v2"]);
    expect(registry.current).toBe("v2");
    expect(state.dynamo.writes).toBe(0);
    expect(aliasRows()).toEqual(aliasesBefore);
    expect(state.logs.join("\n")).toContain("Next: run scripts/backup-salts.sh and print a new card");
  });

  test("retire refuses the current version", async () => {
    await expect(runRotation(createContext(state), { mode: "retire", version: "v2" })).rejects.toThrow("is the current version");
    expect(state.registryWrites).toEqual([]);
  });

  test("retire refuses a version that is not in the registry", async () => {
    await expect(runRotation(createContext(state), { mode: "retire", version: "v9" })).rejects.toThrow("is not in the registry");
    expect(state.registryWrites).toEqual([]);
  });

  test("retire refuses while a rotation is in flight", async () => {
    state.secret = JSON.stringify(stageRegistry(JSON.parse(state.secret), "v3", "third-salt", "2026-11-04T10:00:00.000Z"));
    await expect(runRotation(createContext(state), { mode: "retire", version: "v1" })).rejects.toThrow("A rotation is in flight");
    expect(state.registryWrites).toEqual([]);
  });

  test("retire refuses while an item still sits under the version", async () => {
    state.dynamo.seed("ci-env-bundles", { hashedSub: hashA, bundleId: "late-item" });
    await expect(runRotation(createContext(state), { mode: "retire", version: "v1" })).rejects.toThrow(
      "Items still sit under v1 in: bundles",
    );
    expect(state.registryWrites).toEqual([]);
    expect(Object.keys(JSON.parse(state.secret).versions)).toEqual(["v1", "v2"]);
  });

  test("a later rotation keeps the alias rows of a retired version", async () => {
    await runRotation(createContext(state), { mode: "retire", version: "v1" });
    await runRotation(createContext(state), { mode: "rotate" });
    const rows = aliasRows().map((line) => JSON.parse(line));
    const newest = JSON.parse(state.secret).versions.v3;
    expect(rows.find((row) => row.old_hash === hashA)?.current_hash).toBe(hashValue(newest, SUB_A));
  });

  test("the arguments need a version for retire and refuse one elsewhere", () => {
    expect(parseArgs(["--mode", "retire", "--version", "v2"])).toEqual({ mode: "retire", version: "v2" });
    expect(() => parseArgs(["--mode", "retire"])).toThrow("needs --version");
    expect(() => parseArgs(["--mode", "sweep", "--version", "v2"])).toThrow("mode retire only");
  });
});

describe("salt-rotate alias chains", () => {
  test("an alias from an earlier rotation follows on to the current hash", () => {
    const registry = { current: "v3", versions: { v2: "two", v3: "three" } };
    const aliases = buildAliases({
      registry,
      users: [{ sub: SUB_A }],
      passRows: [],
      subscriptionRows: [],
      previousAliases: [
        { old_hash: "hash-under-v1", current_hash: hashValue("two", SUB_A) },
        { old_hash: "deleted-account-v1", current_hash: "deleted-account-v2" },
      ],
    });
    const map = new Map(aliases.map((alias) => [alias.old_hash, alias.current_hash]));
    expect(map.get("hash-under-v1")).toBe(hashValue("three", SUB_A));
    expect(map.get("deleted-account-v1")).toBe("deleted-account-v2");
  });
});

describe("the stream consumer during a rotation", () => {
  test("the mark, the move and the delete stay out of the lake", () => {
    expect(isSaltRotationWrite("MODIFY", { saltRotation: "to:v3" }, {})).toBe(true);
    expect(isSaltRotationWrite("INSERT", { saltRotation: "from:v2" }, null)).toBe(true);
    expect(isSaltRotationWrite("REMOVE", null, { saltRotation: "to:v3" })).toBe(true);
  });

  test("a later write to a moved item reaches the lake", () => {
    const moved = { saltRotation: "from:v2" };
    expect(isSaltRotationWrite("MODIFY", { ...moved, status: "active" }, moved)).toBe(false);
    expect(isSaltRotationWrite("REMOVE", null, moved)).toBe(false);
    expect(isSaltRotationWrite("INSERT", { status: "active" }, null)).toBe(false);
  });
});
