<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Sub Hash Versioning and Salt Lifecycle

**Created**: 15 February 2026
**Status**: Discussion / Assessment
**Branch**: `sub-hash-versioning`

---

## User Assertions (verbatim)

> Introducing versioning to the user sub hash. Discuss scenarios such as: Rotating the salt under a BAU scenario. Restoring data from a backup and applying an exported salt as the secret to make the data usable. Recovering from a scenario where the salt was lost (e.g. restoring a backup without an exported salt). Rotating the salt after it has been disclosed. Also wonder about having the salt material as the 4-words concept we use for passes — the idea is that it's easier to print and store in physical form then re-key.

> Right now we have a few signed up users that I backed up the emails for but nobody has been given access to any features or signed up for packages. Cognito is disposable at this point, customers would sign in with Google just the same. Could we also iterate through all tables and add the explicit version v1 to the table items? Also generally what should we do where a backup store is worthless without the hash salt, but then storing the salt elsewhere creates two places to lose it.

> No raw-string fallback in subHasher.js — apply a data migration to convert the Secrets Manager format. Suggest a CDK-variant of EF migrations for managing data migrations on deploy. Option B (migrate) for Step 4. KMS key in submit-prod for now, update AWS docs to note it must move to submit-backup later. CI and prod use different salts. Add saltVersion to async request tables alongside anything salted. No annual rotation schedule — comprehensive runbook scenarios instead.

> Multi-version salt registry in Secrets Manager so rotation never requires a custom dual-salt code deployment. Read-path version fallback in data repositories so lookups work during migration windows without breaking. Normal deployments recycle Lambda containers to pick up the new current version. Scenarios for: partial/failed migration recovery, stale Lambda cache, GDPR erasure/DSAR, salt tampering detection.

---

## 1. Current State Assessment

### Pre-launch window

We are **before launch**. The current data is entirely test activity:

| Environment | Users (Cognito) | Bundles | Receipts | HMRC Requests | Passes |
|-------------|-----------------|---------|----------|---------------|--------|
| **prod** | 5 (3 Google, 2 test) | 778 | 911 | 15,616 | 831 |
| **ci** | transient test users | 885 | 864 | — | — |

No user has active subscriptions or production HMRC submissions. All data is disposable. Cognito profiles are disposable — Google-federated users re-create automatically on next sign-in.

**This is the ideal moment to introduce versioning**, change salt format, and backfill existing data — before any of it matters.

### How it works today

```
Cognito sub (e.g. "f6e2d2f4-60e1-7021-a866-6244e2ac173a")
    │
    ▼
HMAC-SHA256(salt, sub) → 64-char hex hash
    │
    ▼
DynamoDB partition key: hashedSub
```

- **Salt**: 32 bytes cryptographic random, base64-encoded (~44 chars)
- **Storage**: AWS Secrets Manager at `{env}/submit/user-sub-hash-salt` — raw string (no JSON wrapper)
- **Versioning**: None — no version field on any DynamoDB item
- **14 Lambda handlers** call `initializeSalt()` on cold start
- **4 data repositories** call `hashSub(userId)` to build DynamoDB keys

### All 8 DynamoDB tables using hashedSub

| Table | Sort Key | TTL | PITR | Notes |
|-------|----------|-----|------|-------|
| bundles | `bundleId` | 1 month post-expiry | Yes | User subscriptions |
| receipts | `receiptId` | — | Yes | 7-year HMRC retention |
| hmrc-api-requests | `id` | 90 days | Yes | HMRC interaction audit trail |
| bundle-post-async-requests | `requestId` | 1 hour | No | Transient |
| bundle-delete-async-requests | `requestId` | 1 hour | No | Transient |
| hmrc-vat-return-post-async-requests | `requestId` | 1 hour | No | Transient |
| hmrc-vat-return-get-async-requests | `requestId` | 1 hour | No | Transient |
| hmrc-vat-obligation-get-async-requests | `requestId` | 1 hour | No | Transient |

All 8 tables will receive `saltVersion` — consistency matters more than the low value on transient tables.

### Cognito username vs sub

Cognito Username is **NOT** the unhashed sub for Google-federated users:

| User Type | Username | Sub |
|-----------|----------|-----|
| Google federated | `Google_109498926136624044663` | `c6f222d4-40a1-70bf-...` |
| Native (test) | `f6e2d2f4-60e1-7021-...` | `f6e2d2f4-60e1-7021-...` (same) |

The `sub` attribute is always available via `aws cognito-idp list-users`, regardless of provider.

### Existing precedent: emailHash.js already has versioning

The `emailHash.js` module stores `emailHashSecretVersion` alongside each email hash on pass records:

```javascript
// emailHash.js returns { hash, secretVersion }
// Pass record stores: { restrictedToEmailHash: "...", emailHashSecretVersion: "v1" }
```

This is the pattern to follow for sub hashing. The email hash secret should eventually adopt the same multi-version registry format described in Section 2.

---

## 2. Proposed Change: Multi-Version Salt Registry

### Schema change (DynamoDB items)

Before:
```json
{ "hashedSub": "a1b2c3...", "bundleId": "day-guest", ... }
```

After:
```json
{ "hashedSub": "a1b2c3...", "saltVersion": "v1", "bundleId": "day-guest", ... }
```

### Salt registry format (Secrets Manager)

**No raw-string format. No single-version JSON.** The Secrets Manager value is a multi-version registry:

```json
{
  "current": "v1",
  "versions": {
    "v1": "base64-encoded-salt-value"
  }
}
```

After a rotation:

```json
{
  "current": "v2",
  "versions": {
    "v1": "base64-encoded-salt-value",
    "v2": "tiger-happy-castle-river-noble-frost-plume-brave"
  }
}
```

**Why a registry instead of a single `{ salt, version }` pair?**

With a single-version secret, every rotation requires three deployments:
1. Deploy custom dual-salt code (reads both old and new)
2. Run migration
3. Deploy again to remove dual-salt code

With a registry, rotation is:
1. Update the registry (add new version, set `current`)
2. Run migration
3. Done — no code deployment needed for the rotation itself

The system permanently knows how to read all versions. This eliminates the painful "deploy dual-salt code / remove dual-salt code" dance from every future rotation.

Old versions can be pruned from the registry after all items have been migrated and verified.

### Read-path version fallback

During a migration window, some items are still keyed by an old salt version. Rather than requiring the migration to complete before the system works, data repository read operations fall back through previous versions:

```javascript
// In each data repository's query/get function:
async function getUserItems(userId) {
  // Try current version first
  let items = await query(hashSub(userId));
  if (items.length > 0) return items;

  // Fall back to previous versions (during migration window)
  for (const version of getPreviousVersions()) {
    items = await query(hashSubWithVersion(userId, version));
    if (items.length > 0) {
      logger.warn({ message: "Found items at old salt version", version });
      return items;
    }
  }
  return [];
}
```

This means:
- Users see their data throughout the migration — no downtime, no broken lookups
- Warm Lambda containers using an old `current` version still write valid items (the old version is in the registry, the read-path fallback finds them)
- After a normal deployment, new containers pick up the latest `current`
- The migration runner re-keys old items to the new version in the background
- Small latency cost during migration window (extra DynamoDB queries for un-migrated users) — negligible since rotation is rare

### Code changes

1. **`subHasher.js`** — Parse multi-version registry format. Expose:
   - `hashSub(sub)` — hash with `current` version (for writes)
   - `hashSubWithVersion(sub, version)` — hash with a specific version (for fallback reads and migrations)
   - `getSaltVersion()` — returns `current` version string
   - `getPreviousVersions()` — returns list of non-current versions (for fallback reads)
   - Throw if the secret is not valid JSON or missing required fields.
2. **4 data repositories** — Add `saltVersion: getSaltVersion()` to every PutItem/UpdateItem. Add read-path version fallback to query/get functions.
3. **1 async request repository** — Add `saltVersion` to `putAsyncRequest()`. Add fallback to `getAsyncRequest()`.
4. **Secrets Manager format** — Migrate from raw string to registry via migration script.
5. **`manage-secrets.yml`** — Update backup/restore to handle registry format.
6. **Unit tests** — Registry parsing, version fallback, non-JSON rejection.

### Impact

| Component | Change | Risk |
|-----------|--------|------|
| `subHasher.js` | Registry parsing + multi-version hashing | Low — strict, no fallback to raw format |
| 4 data repositories | Add `saltVersion` to writes, version fallback to reads | Low — additive writes, graceful read fallback |
| 1 async request repository | Add `saltVersion` to writes, fallback to reads | Low — additive |
| 14 Lambda handlers | None | None |
| DynamoDB tables (8) | Backfill `saltVersion` on existing items | Low — additive |
| Secrets Manager secret | Format change (raw → registry) | **Migration required** |
| Backup/restore workflows | Updated validation for registry format | Low |

---

## 3. Data Migration Framework

### Design: CDK-variant of EF Migrations

EF Migrations track schema changes with numbered scripts and a database tracking table. Our equivalent for DynamoDB:

```
scripts/migrations/
├── runner.js                            # Migration runner
├── 001-convert-salt-to-registry.js      # Secrets Manager format migration
├── 002-backfill-salt-version-v1.js      # Add saltVersion to all existing items
└── 003-rotate-salt-to-passphrase.js     # Migrate from v1 random salt to v2 passphrase
```

**Tracking**: A special partition key `system#migrations` in the bundles table:

```json
{ "hashedSub": "system#migrations", "bundleId": "001-convert-salt-to-registry", "appliedAt": "2026-02-16T10:30:00Z", "environment": "ci" }
{ "hashedSub": "system#migrations", "bundleId": "002-backfill-salt-version-v1", "appliedAt": "2026-02-16T10:30:05Z", "environment": "ci" }
```

### Migration runner (`scripts/migrations/runner.js`)

```
1. Read all migration files from scripts/migrations/ (sorted by number prefix)
2. Query bundles table for pk=system#migrations to get applied set
3. For each unapplied migration (in order):
   a. Run the migration's up() function
   b. Write tracking record to bundles table
   c. Log completion
4. Report summary: X applied, Y already done, Z total
```

### Integration with deployment

**GitHub Actions step** — after CDK deploy, before behaviour tests:

```yaml
# In deploy.yml, after CDK deploy step:
- name: Run data migrations
  run: node scripts/migrations/runner.js
  env:
    ENVIRONMENT_NAME: ${{ env.ENV_NAME }}
    AWS_REGION: eu-west-2
```

**Local execution** — for dev/testing:

```bash
# After assuming role
. ./scripts/aws-assume-submit-deployment-role.sh
ENVIRONMENT_NAME=ci node scripts/migrations/runner.js
```

### Why this approach over CDK Custom Resources

| Approach | Pros | Cons |
|----------|------|------|
| **GitHub Actions step** | Visible in logs, testable locally, runs with deployment role, no Lambda packaging needed | Separate from CDK lifecycle |
| CDK Custom Resource Lambda | Tightly coupled to deploy | Must package as Lambda, harder to test, harder to debug, opaque in CloudFormation |
| CDK AwsCustomResource | Simple for single API calls | Can't orchestrate multi-step logic |

GitHub Actions step is the right fit: migrations need access to multiple tables and Secrets Manager, involve multi-step logic, and benefit from being visible and debuggable. CDK Custom Resources are better suited for single AWS API calls (like the Route53 upsert pattern already in the codebase).

### Idempotency

Every migration's `up()` function must be idempotent — safe to re-run if a previous run was interrupted. The tracking record is written AFTER success, so a crash mid-migration means it will be re-attempted on next deploy.

---

## 4. The Backup/Salt Coupling Problem

### The dilemma

A DynamoDB backup without the corresponding salt is a locked box without a key. But storing the salt alongside the backup means a single breach exposes both.

```
 DynamoDB backup alone  →  worthless (can't compute partition keys)
 Salt alone             →  worthless (no data to de-anonymise)
 Both together          →  attacker wins (can link users to data)
```

This is fundamentally the **key escrow problem**: you need redundancy to prevent loss, but each copy is an attack surface.

### Proposed solution: Three independent recovery paths

The goal is that **any ONE surviving path** can recover the salt, while an attacker must compromise **all paths** to gain the salt:

```
┌─────────────────────────────────────────────────────────┐
│                    RECOVERY PATHS                        │
│                                                         │
│  Path 1: AWS Secrets Manager (runtime, automated)       │
│    └─ Live registry, available to Lambdas               │
│    └─ Soft-delete has 7-30 day recovery window          │
│                                                         │
│  Path 2: Physical passphrase (disaster recovery)        │
│    └─ 8-word passphrase printed on card                 │
│    └─ Stored in fire safe / bank deposit box            │
│    └─ Independent of any digital system                 │
│    └─ Can be read aloud, typed manually to restore      │
│                                                         │
│  Path 3: Encrypted in DynamoDB itself (self-contained)  │
│    └─ Special item: pk="system#config", sk="salt"       │
│    └─ Salt encrypted with KMS (CMK in submit-prod*)     │
│    └─ Every DynamoDB backup automatically includes it   │
│    └─ Useless without KMS key access                    │
│                                                         │
│  Bonus: Password manager (digital backup)               │
│    └─ 1Password / equivalent                            │
│    └─ Redundant with Path 2 but more convenient         │
│                                                         │
│  * KMS key starts in submit-prod. Must move to          │
│    submit-backup during account separation (see          │
│    PLAN_AWS_ACCOUNTS.md / AWS_ARCHITECTURE.md).          │
└─────────────────────────────────────────────────────────┘
```

**Path 3 is the key insight**: By storing the salt (KMS-encrypted) inside the DynamoDB tables themselves, every backup is self-contained. Initially the KMS key is in submit-prod (simpler, no cross-account setup needed). When the account separation happens (PLAN_PRODUCTION_AND_SEPARATION.md Phase 2), the KMS key moves to submit-backup for proper isolation.

**Path 2 is the fallback of last resort**: If AWS, Secrets Manager, DynamoDB, and KMS are all lost, the physical passphrase card still works. This is why the human-friendly format matters.

### Recovery matrix

| Scenario | Path 1 (Secrets Mgr) | Path 2 (Physical) | Path 3 (KMS in DynamoDB) | Outcome |
|----------|----------------------|--------------------|--------------------------|---------|
| Normal operation | Available | Not needed | Not needed | Works |
| Secret accidentally deleted (within 30d) | Restore soft-delete | Not needed | Not needed | Works |
| Secret deleted (past 30d) | Gone | Type passphrase | Or decrypt from backup | Works |
| AWS account compromised | Rotate | Type passphrase for new env | Encrypted copy safe (after KMS moves to backup account) | Works |
| DynamoDB backup restored to new env | Create from passphrase | Available | Decrypt from restored data | Works |
| All digital systems lost | Gone | **Available** | Gone | Works (passphrase) |
| Attacker has DynamoDB dump only | N/A | N/A | Encrypted, needs KMS | Data still anonymised |
| Attacker has DynamoDB + KMS | N/A | N/A | N/A | Salt exposed — rotate |

---

## 5. Operational Scenarios

### Scenario A: BAU Salt Rotation (Planned, No Compromise)

**When**: Moving to a new salt format, responding to a policy review, or proactive rotation after infrastructure changes. No fixed annual schedule — rotation is event-driven with thorough runbook procedures.

**Pre-launch shortcut** (available now): Since all data is disposable, the simplest rotation is:

1. Add new version to the salt registry: `versions.v2 = "passphrase..."`, `current = "v2"`
2. Deploy (containers pick up new current on next cold start)
3. Run migration 003 (re-keys all items from v1→v2)
4. Verify, then prune v1 from the registry

**Post-launch procedure** (once real data exists):

1. Add new version to the salt registry in Secrets Manager: `versions.v_next = "new-passphrase"`, set `current = "v_next"`
2. Deploy (new containers write with v_next; warm containers continue writing with old version — both are valid, read-path fallback finds either)
3. Run re-key migration via the migration framework:
   ```
   For each user in Cognito (list-users API):
     oldHash = HMAC-SHA256(v_old_salt, user.sub)
     newHash = HMAC-SHA256(v_next_salt, user.sub)
     For each table:
       items = query(pk = oldHash)
       For each item:
         write item with pk = newHash, saltVersion = "v_next"
         delete item with pk = oldHash
   ```
4. Verify representative users can access data
5. Prune old version from the registry (optional — safe to keep for read-path fallback of any stragglers)
6. Update physical backup card — print new passphrase, destroy old one
7. Update Path 3 KMS-encrypted item in DynamoDB

**Duration**: With ~5 users and ~18,000 items, seconds. At scale (~10,000 users), minutes.

**Rollback**: Old version stays in the registry. Read-path fallback still resolves items at either version. To roll back, set `current` back to the old version and re-deploy.

### Scenario B: Restore Data from Backup with Exported Salt

**When**: DynamoDB table restored from AWS Backup or PITR. Salt is available (Secrets Manager still intact, or restored from physical backup).

**Procedure**:

1. Restore DynamoDB table(s) from backup
2. Check `saltVersion` on restored items — the version they need must exist in the salt registry
3. If it exists: done — read-path fallback will find items at that version automatically
4. If it doesn't exist: retrieve the salt that matches the data's `saltVersion`:
   - Check Path 3 (KMS-encrypted salt item in the restored backup itself)
   - Check physical backup / password manager for the correct version
   - Add it to the registry's `versions` map
5. Run `node scripts/migrations/runner.js` to apply any pending migrations to the restored data

**Why versioning helps**: Without `saltVersion` on items, you can't tell which salt era the data belongs to. With it, the data self-describes which salt it needs — and the multi-version registry can hold all of them.

### Scenario C: Salt Lost — Recovery and Re-Key

**When**: Secrets Manager secret gone, and you need to recover.

**Pre-launch** (now): Not a problem. Generate new salt, start fresh. No real data to lose.

**Post-launch recovery sequence** (try each path in order):

1. **Path 1**: Check Secrets Manager soft-delete recovery (7-30 day window)
2. **Path 3**: Decrypt the KMS-encrypted salt item from the DynamoDB table itself
3. **Path 2**: Type the physical passphrase from the printed card
4. **Bonus**: Check password manager

If **any one** of these succeeds, recreate the registry in Secrets Manager and you're back to normal.

**If ALL paths fail — total salt loss**:

This is the worst case. Without the salt, the HMAC is irreversible by design:

```
Cognito sub ──HMAC(salt, sub)──► hashedSub
                   ▲
              salt is gone
              can't reverse
```

**Why Cognito can't help**: Even though Cognito has every user's `sub`, and DynamoDB has every `hashedSub`, you cannot reconnect them without the salt. The hash is one-way — `HMAC-SHA256(unknown_salt, known_sub) = known_hash` cannot be solved for `unknown_salt` when the salt has ~82 bits of entropy (8-word passphrase). This is the security property working as intended: if an attacker can't reverse it, neither can we.

**Recovery options in total salt loss**:

| Option | Viable? | Notes |
|--------|---------|-------|
| Brute-force the salt from a known sub+hash pair | No (8 words = ~82 bits) | Would take ~20 million years at 10B HMAC/s |
| Match users to data via content clues | Partial | Some items may contain identifiable data (e.g., UTR numbers in HMRC requests) that could be manually matched |
| Accept data loss and start fresh | Yes | Generate new salt, existing hashedSub items become unreachable orphans (TTLs will clean them up over time) |

**This scenario is why three independent recovery paths exist** — the probability of losing all three simultaneously (Secrets Manager + physical card + KMS-encrypted DynamoDB item + password manager) is vanishingly small.

### Scenario D: Salt Disclosed — Emergency Rotation

**When**: Salt value exposed (leaked in logs, committed to git, shared insecurely).

**Threat assessment**:
- Salt alone doesn't grant API access — attacker also needs DynamoDB access (requires separate IAM compromise)
- Real risk: if attacker has BOTH salt AND DynamoDB data, they can de-anonymise users
- Severity: **Medium** (requires compound breach), not **Critical** (no direct data access)

**Pre-launch** (now): Generate new salt, clear tables, done in minutes.

**Post-launch response**:

1. **Assess scope** — Was it public? For how long? Who saw it?
2. **Revoke access** — If the leak vector is still active (e.g., public git commit), remove it immediately
3. **Add new version to registry** — Generate new salt, add as `v_next`, set `current = "v_next"`. The compromised version remains in the registry temporarily so the read-path fallback continues to find existing items.
4. **Deploy** — New containers pick up the new `current`. Warm containers still write at the old version — this is safe because the read-path fallback finds items at any version in the registry.
5. **Run re-key migration** — Same as Scenario A post-launch procedure. Re-keys all items from the compromised version to the new one.
6. **Verify and prune** — After migration, remove the compromised version from the registry
7. **Update physical backup** — Print new passphrase card, destroy old one
8. **Update Path 3** — Re-encrypt new salt and store in DynamoDB
9. **Incident report** — Document timeline, scope, and remediation

**Timeline**: Days, not hours. The compound-breach requirement gives breathing room. The read-path fallback means users experience no disruption during the migration.

### Scenario E: Environment Rebuild (New AWS Account)

**When**: Standing up a fresh environment from scratch (e.g., creating the separate submit-ci account from PLAN_PRODUCTION_AND_SEPARATION.md).

**Procedure**:

1. Deploy CDK stacks (creates empty DynamoDB tables)
2. Generate a new 8-word passphrase salt for this environment
3. Create salt registry in Secrets Manager: `{ "current": "v1", "versions": { "v1": "passphrase..." } }`
4. Print physical backup card, store in password manager
5. Store KMS-encrypted copy in DynamoDB (Path 3)
6. Run `node scripts/migrations/runner.js` — only the format/schema migrations apply (no data to backfill)
7. CI and prod environments use **independent salts** — a compromise of one doesn't affect the other

### Scenario F: Cognito User Pool Replacement

**When**: Cognito user pool is destroyed or replaced (e.g., during account migration).

**Impact**: Google-federated users get **new** `sub` UUIDs when they sign in to a new user pool. Their old hashedSub values become orphaned.

**Procedure**:

1. Before destroying the old pool: export the `sub` → `hashedSub` mapping for all users (using Cognito `list-users` + the current salt)
2. After users sign in to the new pool: they get new subs
3. Run a re-key migration using the exported mapping to move data from old hashedSub to new hashedSub
4. Or, if pre-launch: accept data loss, users start fresh

### Scenario G: Migrating Salt and Data to a New AWS Account

**When**: Moving production from submit-prod (887764105431) to a new account as part of account separation (PLAN_PRODUCTION_AND_SEPARATION.md Phase 2), or merging/splitting environments.

**What must move together**:

| Component | Source | Destination | Method |
|-----------|--------|-------------|--------|
| DynamoDB tables (8) | submit-prod | New account | AWS Backup cross-account restore, or DynamoDB export/import to S3 |
| Salt registry | Secrets Manager | New Secrets Manager | Physical passphrase (Path 2) — recreate registry from card, don't copy programmatically |
| KMS key for Path 3 | submit-prod | submit-backup (or new account) | Create new KMS key in destination, re-encrypt the salt item |
| Cognito user pool | submit-prod | New account | See Scenario F — federated users get new subs |
| Migration tracking | `system#migrations` items | Comes with DynamoDB restore | Automatic |

**Procedure**:

1. **Export data**: Use DynamoDB export-to-S3 (full table export, no impact on live traffic) or AWS Backup cross-account copy
2. **Stand up new account**: Deploy CDK stacks (creates empty tables)
3. **Restore data**: Import DynamoDB data into new account's tables
4. **Recreate salt registry**: Type the 8-word passphrase from the physical backup card into a new Secrets Manager registry: `{ "current": "v2", "versions": { "v2": "passphrase..." } }`. Do NOT copy the secret programmatically between accounts — the physical card is the transfer medium, ensuring the old account can be fully decommissioned.
5. **Re-encrypt Path 3**: Create a new KMS key in the destination account, decrypt the salt item using the old KMS key (requires temporary cross-account access), re-encrypt with the new key, write back
6. **Handle Cognito**: If the user pool is recreated (new account = new pool), follow Scenario F to re-key hashedSub values for users who get new subs
7. **Run migrations**: `node scripts/migrations/runner.js` — tracking items came with the data, so only genuinely new migrations will run
8. **Verify**: Confirm representative users can sign in and access their data
9. **Decommission old account**: Only after verification period. Revoke old account's access to the KMS key.

**Key principle**: The physical passphrase card is the bridge between accounts. It's the one artefact that exists outside AWS entirely, making it the natural transfer medium when moving between accounts.

**Duration**: Hours (mostly waiting for DynamoDB export/import). The actual salt recreation takes minutes.

### Scenario H: Creating a Prod-Seeded Test Environment

**When**: Need a test/staging environment with realistic data volumes and patterns, seeded from production, but fully isolated — no writes back to prod backups, no shared secrets.

**Why not just use the prod salt?** If the test environment shares the prod salt, a breach of the test environment (which has weaker access controls) exposes the prod salt. The test environment must use its **own independent salt**, with all data re-keyed during seeding.

**Procedure**:

1. **Export prod data**: DynamoDB export-to-S3 (or backup restore to a staging table set)
2. **Generate a test-environment salt**: New 8-word passphrase, stored in the test account's Secrets Manager as its own registry
3. **Re-key all items**: Using both the prod salt (for reading) and the test salt (for writing):
   ```
   For each user in prod Cognito (list-users API):
     prodHash = HMAC-SHA256(prod_salt, user.sub)
     testHash = HMAC-SHA256(test_salt, user.sub)
     For each table:
       items = query(pk = prodHash)
       For each item:
         write item with pk = testHash, saltVersion = "v1" (test env's own v1)
   ```
4. **Isolate backups**: The test environment's AWS Backup vault must be **separate** from prod's vault. Configure the test account's backup plan to write to its own vault only — never to the prod or cross-account backup vault.
5. **Isolate Cognito**: The test environment should use its own Cognito user pool. If sharing the prod pool (read-only), ensure no test operations can modify prod user records.
6. **Scrub the prod salt**: After seeding, the prod salt must not remain in the test environment. The re-keying script should load it transiently (from the physical card or a temporary secret) and discard it after use.
7. **Mark as test**: Add a `system#config` item: `{ "hashedSub": "system#config", "bundleId": "environment-type", "type": "test-replica", "seededFrom": "prod", "seededAt": "2026-..." }`

**Ongoing isolation**:

| Concern | Mitigation |
|---------|------------|
| Test backups overwriting prod | Separate backup vault, no cross-account copy to prod vault |
| Test salt leaking to prod | Independent salt, prod salt used transiently during seed only |
| Test data drifting from prod | Re-seed periodically by repeating this procedure |
| HMRC API calls from test | Test environment uses HMRC sandbox credentials, not production |

### Scenario I: Creating an Anonymised Prod Replica (PII-Scrubbed)

**When**: Need a dataset with production-like volume and structure for load testing, debugging, or development — but with **all PII removed** and all user linkage destroyed. No real user should be identifiable from this data.

**Difference from Scenario H**: Scenario H preserves user identity (same users, different hashes). Scenario I **destroys** user identity — every user becomes a synthetic placeholder, and no mapping back to real users exists.

**What counts as PII in our tables**:

| Table | PII Fields | Treatment |
|-------|-----------|-----------|
| bundles | `hashedSub` (pseudonymous) | Replace with synthetic hash |
| bundles | `qualifiers.*` (may contain email) | Scrub or replace with synthetic |
| receipts | `hashedSub` | Replace with synthetic hash |
| receipts | HMRC response data (UTR, VRN) | Replace with synthetic values |
| hmrc-api-requests | `hashedSub` | Replace with synthetic hash |
| hmrc-api-requests | Request/response bodies | Replace HMRC identifiers with synthetic |
| async-requests (5) | `hashedSub` | Replace with synthetic hash |
| passes | `restrictedToEmailHash` | Replace with synthetic hash |
| passes | `createdBy` (email) | Replace with synthetic email |

**Procedure**:

1. **Export prod data**: DynamoDB export-to-S3
2. **Generate synthetic users**: Create N synthetic Cognito sub UUIDs (matching the number of distinct `hashedSub` values in the export). No real Cognito users are involved.
3. **Generate an anonymised-env salt**: New 8-word passphrase, used only for this replica
4. **Build the hashedSub mapping**:
   ```
   For each distinct hashedSub in the exported data:
     syntheticSub = generate random UUID
     newHash = HMAC-SHA256(anon_salt, syntheticSub)
     mapping[oldHash] = newHash
   ```
   This mapping is **one-way and random** — you cannot get from `newHash` back to the original user, even with both salts, because the synthetic sub has no relationship to the real sub.
5. **Transform all items**:
   ```
   For each item in each table:
     Replace hashedSub with mapping[item.hashedSub]
     Replace saltVersion with "v1" (anon env's own version)
     Scrub PII fields:
       - UTR/VRN numbers → synthetic (e.g., "1234567890")
       - Email addresses → synthetic (e.g., "user-001@anon.test")
       - Email hashes → re-hash synthetic emails
       - HMRC request/response bodies → redact or replace identifiers
   ```
6. **Import into anonymised environment**: Write transformed items to the anonymised environment's DynamoDB tables
7. **Verify structural equivalence**: Confirm item counts per table match, sort key distributions are preserved, token counts and bundle structures are intact
8. **Destroy intermediate artefacts**: Delete the export files, the oldHash→newHash mapping, and any temporary access to prod data

**What is preserved** (useful for load testing / debugging):

- Item counts per user (same number of bundles, receipts, HMRC requests per synthetic user)
- Sort key patterns (same bundleIds, same receipt structures)
- Timestamps and TTL values
- Token consumption patterns
- Table size and query patterns

**What is destroyed** (PII protection):

- Any link between DynamoDB items and real Cognito users
- Real HMRC identifiers (UTR, VRN, tax data)
- Real email addresses and email hashes
- The ability to re-identify users even if both the prod and anon salts are compromised (because synthetic subs are random, not derived from real subs)

**Key property**: Unlike a salt rotation (where `newHash = HMAC(new_salt, same_sub)`), anonymisation uses `newHash = HMAC(anon_salt, random_sub)`. This means even someone with access to both salts AND both datasets cannot correlate records between them.

### Scenario J: Partial or Failed Migration Recovery

**When**: A re-key migration (e.g., Migration 003, or a post-launch Scenario A rotation) crashes partway through. Some users have been migrated to the new salt version, some haven't. Concurrent Lambda writes during the migration may also create items at the old version.

**Why this is safe with the registry + fallback architecture**:

The multi-version salt registry and read-path version fallback mean the system handles mixed-version data gracefully:

- Items at the old version → found by fallback read at old version
- Items at the new version → found by primary read at current version
- Items written by warm Lambdas during migration (at whichever version their container cached) → found by one of the fallback paths

**No user experiences data loss during a partial migration.** The system is always consistent, just not fully migrated.

**Recovery procedure**:

1. **Investigate the failure** — Check migration runner logs for the error. Common causes: throttling (DynamoDB capacity), permission issues, network timeout.
2. **Fix the underlying issue** — Increase capacity, fix permissions, etc.
3. **Re-run the migration** — The runner checks the tracking table and skips completed migrations. Within a re-key migration, idempotency means:
   - For each user: query old hash → if no items, this user is already migrated → skip
   - For each user: query new hash → if items exist with new saltVersion, this user is done → skip
   - The migration makes forward progress from where it left off
4. **Verify** — Spot-check that users can access their data. The read-path fallback covers any edge cases.

**Concurrent write hazard**:

During migration, a Lambda might write a NEW item (e.g., a new HMRC API request) under the old hash while the migration is moving that user's items to the new hash. This item would be "left behind" at the old version.

**Mitigation**: The read-path fallback finds it. On the next request, the fallback retrieves it from the old version. Eventually, a follow-up migration pass or TTL expiry cleans it up. For the 1-hour-TTL async tables, this is a non-issue — the item expires before anyone notices.

For long-lived tables (bundles, receipts), a second migration pass after the deployment (when all containers are on the new version) catches any stragglers.

### Scenario K: Stale Lambda Salt Cache After Rotation

**When**: The salt registry `current` is updated (e.g., from v1 to v2), but warm Lambda containers still have v1 cached from their cold start. New writes from these containers use the old salt version.

**⚠️ THIS SCENARIO OCCURRED IN PROD (17 Feb 2026)**

The original assessment below was **wrong** — this was NOT a non-issue. After migration 003 set `current=v2` in prod, warm Lambda containers still had `current=v1` cached. The read-path fallback failed because:

- A v1-cached `bundle-get` Lambda queried hash `e7618802...` (v1) and found 0 items
- A v2-cached `pass-post` Lambda wrote bundles at hash `63f906e6...` (v2)
- The v1-cached Lambda's registry only had `{current: "v1", versions: {v1: "..."}}` — it had NO knowledge of v2, so `getPreviousVersions()` returned `[]` (no fallback available)
- Result: bundles written by v2 Lambdas were invisible to v1 Lambdas

**Root cause**: The salt cache had no TTL — once fetched on cold start, it was cached forever. A warm container could never discover that a new version existed.

**Fix applied (commit `af2ec076`)**:

Added a 5-minute TTL to the salt cache in `subHasher.js`. After TTL expires, `initializeSalt()` re-fetches from Secrets Manager. This means warm containers pick up registry changes within 5 minutes instead of never.

**Immediate prod restoration**: Forced cold starts on all 26 Docker Lambda functions via `aws lambda update-function-configuration --description "Force cold start"`. All containers re-fetched the registry with `current=v2`.

**Updated assessment with TTL fix**:

1. **Old version is still in the registry** — Items written at the old version are findable via read-path fallback, but ONLY if the reading Lambda's cached registry includes the old version.
2. **TTL ensures convergence** — Within 5 minutes of a registry update, all warm containers re-fetch and converge on the same `current` version.
3. **Normal deployment also recycles containers** — A deployment triggers new container creation, providing immediate convergence.
4. **Worst case (with TTL)** — A 5-minute window where some containers use the old version. The read-path fallback handles this IF the reading Lambda's registry includes both versions (which it will after TTL refresh).

**Operational procedure for future rotations**: After updating the registry, either (a) wait 5 minutes for TTL-based convergence, or (b) deploy/lean-deploy to force immediate convergence.

### Scenario L: GDPR Right to Erasure and Data Subject Access Requests

**When**: A user exercises their GDPR Article 17 (right to erasure) or Article 15 (data subject access request) rights.

**Dependency on salt**: Both operations require computing `hashedSub = HMAC(salt, user.sub)` to locate the user's data across all 8 tables. Without the salt, you cannot find the data.

**Right to Erasure procedure**:

1. **Identify the user's sub**: Look up the user in Cognito by email (`aws cognito-idp list-users --filter "email = \"user@example.com\""`)
2. **Compute hashedSub**: Use the current salt (or try all versions if uncertain which era the data belongs to)
3. **Delete from all 8 tables**: Query each table by hashedSub and delete all items
4. **Delete from Cognito**: Remove the user from the user pool
5. **Verify**: Confirm no items remain at any salt version (use read-path fallback logic to check all versions)
6. **Audit trail**: Log the erasure request and completion (required by GDPR Article 17(2))

**Data Subject Access Request procedure**:

1. **Identify the user's sub**: Same as above
2. **Compute hashedSub**: Try all salt versions in the registry
3. **Export from all tables**: Query each table by hashedSub, collect all items
4. **Format for the user**: Present in a portable format (JSON/CSV)
5. **Scrub internal identifiers**: Remove hashedSub values and internal IDs before providing to the user — they don't need our partition keys

**Risk: user deleted from Cognito before erasure request**:

If the user has already been deleted from Cognito, their `sub` is lost. Without the sub, you cannot compute the hashedSub, and their data becomes unfindable (by design — the hash is irreversible).

**Mitigation**: Before deleting a user from Cognito, always complete the data erasure across all DynamoDB tables first. The order must be: delete data → delete Cognito user. Never the reverse.

**Future consideration**: If this ordering is hard to guarantee operationally, consider storing a `hashedSub → email-hash` mapping in a dedicated index table. This creates a reverse-lookup path that doesn't depend on Cognito, but adds another table to maintain and another PII surface. Evaluate once GDPR requests start occurring.

### Scenario M: Salt Tampering Detection

**When**: The Secrets Manager value is accidentally or maliciously modified. Unlike salt loss (which causes immediate Lambda failures), salt tampering is **silent** — Lambdas start using the wrong salt, writing items to unreachable partition keys. Users gradually lose access to their data as new writes go to the wrong location.

**Why this is dangerous**: Salt loss is noisy (Lambdas throw errors, monitoring triggers). Salt tampering is quiet — the system appears to work, but new items are invisible to lookups using the correct salt.

**Detection: salt health canary**

Store a canary item alongside the migration tracking:

```json
{
  "hashedSub": "system#canary",
  "bundleId": "salt-health-check",
  "expectedHash": "abc123def456...",
  "canaryInput": "salt-canary-verification-string",
  "saltVersion": "v2"
}
```

**Verification** (can run as a periodic check in the migration runner, or a dedicated health check):

```javascript
const expected = canaryItem.expectedHash;
const actual = hashSubWithVersion(canaryItem.canaryInput, canaryItem.saltVersion);
if (expected !== actual) {
  // ALERT: salt has been tampered with
  // The salt for version canaryItem.saltVersion no longer produces the expected hash
}
```

**When to update the canary**: After every successful salt rotation migration, write a new canary item with the new version's expected hash.

**Response to detected tampering**:

1. **Do NOT write any more data** — Every new write goes to the wrong partition key
2. **Restore the salt** — Use Path 2 (physical card) or Path 3 (KMS-encrypted DynamoDB item) to recover the correct salt
3. **Identify tampered items** — Items written after the tampering have hashedSub values that don't match any known sub. These can be identified by scanning tables for items where no Cognito user resolves to that hashedSub.
4. **Assess scope** — How long was the salt wrong? How many items were written with the wrong salt?
5. **Investigate cause** — Was it accidental (e.g., a script that overwrote the secret) or malicious?

---

## 6. Eight-Word Passphrase as Salt

### Entropy analysis (1260-word list)

| Words | Entropy (bits) | Brute Force at 10B HMAC/s | Physical Format |
|-------|---------------|--------------------------|-----------------|
| 4 | ~41 bits | **4 minutes** | Fits on a stamp |
| 6 | ~62 bits | **15 years** | Fits on a business card |
| 8 | ~82 bits | **20 million years** | Fits on a business card |
| 32 bytes random | 256 bits | Heat death of universe | 44-char base64 blob |

### When would brute-force matter?

Only if an attacker has:
1. A dump of DynamoDB data (hashedSub values), AND
2. At least one known Cognito sub → hashedSub mapping

Then they can test candidate salts: `does HMAC(candidate, known_sub) == known_hash?`

With 4 words: they recover the salt in minutes and de-anonymise all users.
With 8 words: computationally infeasible for decades.

### Decision

**Use 8 words.** The format `tiger-happy-castle-river-noble-frost-plume-brave`:
- ~82 bits of entropy (brute-force resistant for decades)
- Easy to print on a card, read aloud, dictate over phone
- Easy to type manually into the `restore-salt` workflow
- No KDF needed — the passphrase is the HMAC key directly
- Clearly distinct from the 4-word pass invitation codes (different length = different purpose)

**Do NOT use 4 words** — the operational convenience doesn't justify the entropy reduction. An 8-word passphrase is still very human-friendly, and the security difference is catastrophic (4 minutes vs 20 million years).

---

## 7. Pre-Launch Action Plan

Since we're before launch, we can do everything cleanly. The migration framework (Section 3) manages all data changes.

### Step 1: Build the migration framework

Create `scripts/migrations/runner.js` and the tracking mechanism (`system#migrations` items in bundles table).

### Step 2: Code changes (multi-version salt support)

1. **`subHasher.js`** — Parse multi-version registry format. Expose `hashSub()`, `hashSubWithVersion()`, `getSaltVersion()`, `getPreviousVersions()`. **No raw-string fallback** — throw if the secret is not valid JSON. The secret format migration (Migration 001) must run first.
2. **4 data repositories** — Add `saltVersion: getSaltVersion()` to every PutItem call. Add read-path version fallback to query/get functions:
   - `dynamoDbBundleRepository.js` — `putBundle()`, `putBundleByHashedSub()`, `getUserBundles()`
   - `dynamoDbReceiptRepository.js` — `putReceipt()`, `getUserReceipts()`
   - `dynamoDbHmrcApiRequestRepository.js` — `putHmrcApiRequest()`, `getUserHmrcApiRequests()`
   - `dynamoDbAsyncRequestRepository.js` — `putAsyncRequest()`, `getAsyncRequest()`
3. **`manage-secrets.yml`** — Update backup/restore to handle registry format.
4. **Unit tests** — Registry parsing, multi-version hashing, read-path fallback, non-JSON rejection.

### Step 3: Migration 001 — Convert salt to registry format

```javascript
// scripts/migrations/001-convert-salt-to-registry.js
// Reads current raw-string salt from Secrets Manager
// Wraps it as { "current": "v1", "versions": { "v1": "<raw-value>" } }
// Writes back to Secrets Manager
// Idempotent: if already valid registry JSON, no-op
```

Run per environment (ci, prod). After this migration, the new `subHasher.js` code can deploy.

### Step 4: Migration 002 — Backfill saltVersion on all items

```javascript
// scripts/migrations/002-backfill-salt-version-v1.js
// For each of the 8 tables with hashedSub:
//   Scan all items (skip system# partition keys)
//   For each item without saltVersion:
//     UpdateItem SET saltVersion = "v1"
// Write salt health canary item to bundles table
```

With ~800-15,000 items per table, this takes seconds.

### Step 5: Generate 8-word passphrase salt

1. Generate passphrase using `generatePassphrase(8)` from `app/lib/passphrase.js`
2. Print it on a card, store in fire safe
3. Store in password manager
4. Both ci and prod get their own independent 8-word passphrases

### Step 6: Migration 003 — Rotate salt from v1 to v2 (passphrase)

Using **Option B (migrate)** as a dry run — proves the migration tooling works while stakes are zero:

```javascript
// scripts/migrations/003-rotate-salt-to-passphrase.js
// 1. Add v2 to registry: versions.v2 = passphrase, current = "v2"
// 2. Enumerate all users from Cognito (list-users API)
// 3. For each user:
//    oldHash = hashSubWithVersion(user.sub, "v1")
//    newHash = hashSubWithVersion(user.sub, "v2")
//    For each table:
//      items = query(pk = oldHash)
//      For each item:
//        write item with pk = newHash, saltVersion = "v2"
//        delete item with pk = oldHash
// 4. Prune v1 from registry (optional)
// 5. Update salt health canary with v2 expected hash
```

### Step 7: Add encrypted salt item to DynamoDB (Path 3)

Store KMS-encrypted salt as a special item in the bundles table:
```json
{ "hashedSub": "system#config", "bundleId": "salt-v2", "encryptedSalt": "<KMS ciphertext>", "kmsKeyArn": "arn:..." }
```

The KMS key is created in **submit-prod** for now. When account separation happens (PLAN_PRODUCTION_AND_SEPARATION.md Phase 2), the key moves to submit-backup.

Every future DynamoDB backup automatically includes this item.

### Step 8: Update documentation

1. **RUNBOOK_INFORMATION_SECURITY.md** — Rewrite Section 4 with:
   - Multi-version salt registry schema
   - Three recovery paths
   - All thirteen operational scenarios (A-M) as runbook procedures
   - Physical backup format and verification procedure
   - Recovery matrix
   - Salt health canary verification
   - GDPR erasure/DSAR procedures
2. **AWS_ARCHITECTURE.md** — Add note about KMS key for salt encryption (Section 3.4 Data Layer), note that it must move to submit-backup during account separation
3. **PLAN_AWS_ACCOUNTS.md** — Add KMS key migration to the account separation checklist

---

## 8. Deployment Order

The migration framework means deployment order matters:

```
1. Deploy migration framework code (runner.js, migration scripts)
2. Run Migration 001 (convert salt to registry) — must happen BEFORE new subHasher.js deploys
3. Deploy new subHasher.js + repository code (requires registry format)
4. Run Migration 002 (backfill saltVersion on existing items + canary)
5. Generate v2 passphrase salt, store in password manager / print card
6. Run Migration 003 (add v2 to registry, re-key from v1 → v2)
7. Store KMS-encrypted salt in DynamoDB (Path 3)
8. Update documentation
```

In the GitHub Actions workflow, this translates to:

```yaml
# Phase 1: Pre-deploy migrations (run before CDK deploy)
- name: Run pre-deploy migrations
  run: node scripts/migrations/runner.js --phase pre-deploy

# Phase 2: CDK deploy (deploys new Lambda code)
- name: Deploy CDK stacks
  run: ...

# Phase 3: Post-deploy migrations (run after CDK deploy)
- name: Run post-deploy migrations
  run: node scripts/migrations/runner.js --phase post-deploy
```

Migration 001 is `pre-deploy` (must run before new code). Migrations 002+ are `post-deploy`.

---

## 9. Files to Change

| File | Change |
|------|--------|
| `scripts/migrations/runner.js` | **New** — Migration framework runner |
| `scripts/migrations/001-convert-salt-to-registry.js` | **New** — Secrets Manager format migration (raw → registry) |
| `scripts/migrations/002-backfill-salt-version-v1.js` | **New** — Backfill saltVersion on all items + canary |
| `scripts/migrations/003-rotate-salt-to-passphrase.js` | **New** — Re-key from v1 random salt to v2 passphrase |
| `app/services/subHasher.js` | Parse registry format, expose `hashSub()`, `hashSubWithVersion()`, `getSaltVersion()`, `getPreviousVersions()` |
| `app/data/dynamoDbBundleRepository.js` | Add `saltVersion` to writes, read-path version fallback to `getUserBundles()` |
| `app/data/dynamoDbReceiptRepository.js` | Add `saltVersion` to writes, read-path version fallback to reads |
| `app/data/dynamoDbHmrcApiRequestRepository.js` | Add `saltVersion` to writes (write-only repo — no read-path fallback needed) |
| `app/data/dynamoDbAsyncRequestRepository.js` | Add `saltVersion` to writes, read-path version fallback to `getAsyncRequest()` |
| `.github/workflows/manage-secrets.yml` | Update backup/restore for registry format |
| `.github/workflows/run-migrations.yml` | **New** — Standalone migration workflow (callable from deploy.yml later) |
| `app/unit-tests/services/subHasher.test.js` | Registry parsing, multi-version hashing, fallback version list |
| `app/unit-tests/data/*.test.js` | Read-path version fallback tests |
| `RUNBOOK_INFORMATION_SECURITY.md` | Rewrite Section 4 with scenarios A-M |
| `AWS_ARCHITECTURE.md` | Add KMS key note, account separation reminder |
| `PLAN_AWS_ACCOUNTS.md` | Add KMS key migration to checklist |
| `.env.test` | Change `USER_SUB_HASH_SALT` from plain string to JSON registry |
| `.env.simulator` | Change `USER_SUB_HASH_SALT` from plain string to JSON registry |
| `.env.proxy` | Change `USER_SUB_HASH_SALT` from plain string to JSON registry |
| `app/system-tests/*.system.test.js` | Update `USER_SUB_HASH_SALT` assignments to JSON registry format (5+ files) |
| `.github/workflows/deploy-environment.yml` | Update salt creation to write JSON registry format |

---

## 10. Decisions from Q&A (15 Feb 2026)

| Question | Decision |
|----------|----------|
| **Env var format** | `USER_SUB_HASH_SALT` env var MUST be JSON registry format everywhere — `.env.*` files, system tests, all test helpers |
| **Migration 003 passphrase** | Auto-generate 8-word passphrase and print to stdout for operator to record |
| **KMS key for Path 3** | Create KMS CMK via CDK in this PR and implement the encrypted DynamoDB item |
| **deploy.yml integration** | Create a **separate** `run-migrations.yml` workflow. Add a commented-out call from `deploy.yml`. Manual invocation for now. |
| **manage-secrets.yml** | Update backup/restore for registry format — in scope for this PR |

---

## 11. Cross-Check Corrections

Corrections from comparing the plan against actual code (15 Feb 2026):

### 11.1 Function name mismatches

| Plan says | Actual code | File |
|-----------|-------------|------|
| `getUserHmrcApiRequests()` | **Does not exist** — write-only repo, no read function | `dynamoDbHmrcApiRequestRepository.js` |
| `getUserReceipts()` | `listUserReceipts(userSub)` and `getReceipt(userSub, receiptId)` | `dynamoDbReceiptRepository.js` |

**Consequence**: `dynamoDbHmrcApiRequestRepository.js` needs `saltVersion` on writes but **no read-path version fallback** (there's nothing to fall back on).

### 11.2 Lambda handler count

Plan says 14 handlers. Actual count from `grep`:

| Category | Handlers | Count |
|----------|----------|-------|
| Account | `bundleGet.js`, `bundlePost.js`, `bundleDelete.js`, `passPost.js` | 4 |
| Auth | `cognitoTokenPost.js`, `customAuthorizer.js` | 2 |
| Billing | `billingCheckoutPost.js`, `billingPortalGet.js` | 2 |
| HMRC | `hmrcTokenPost.js`, `hmrcReceiptGet.js`, `hmrcVatReturnPost.js`, `hmrcVatReturnGet.js`, `hmrcVatObligationGet.js` | 5 |
| **Total** | | **13** |

Plus `mockBilling.js` (non-Lambda mock, dynamic import). None of these handlers need code changes — they call `initializeSalt()` which parses the registry internally.

### 11.3 Bundle repository "byHashedSub" functions

Three functions accept a pre-hashed sub (not a userId):
- `putBundleByHashedSub(hashedSub, bundle)` — line 74
- `resetTokensByHashedSub(hashedSub, bundleId, tokensGranted, nextResetAt)` — line 231
- `updateBundleSubscriptionFields(hashedSub, bundleId, fields)` — line 326

These **can** add `saltVersion` to writes (using `getSaltVersion()`), but **cannot** do read-path fallback because they don't know the original userId. The callers of these functions must ensure they pass the correct hashedSub for the current version.

### 11.4 emailHash.js location and pattern

- Located at `app/lib/emailHash.js` (not `app/services/`)
- `_setTestEmailHashSecret(secret, version = "test-v1")` — takes secret + version separately
- This is the **model** for the updated `_setTestSalt(salt, version = "v1")` signature

### 11.5 Repositories NOT using hashSub (confirmed)

- `dynamoDbPassRepository.js` — uses pass codes as keys, not hashedSub
- `dynamoDbCapacityRepository.js` — global counters, not per-user
- `dynamoDbSubscriptionRepository.js` — Stripe subscription tracking, not per-hashedSub

These do NOT need saltVersion.

---

## 12. Refined Implementation Details

### 12.1 `subHasher.js` — Registry parsing

**Current internal state** (lines 11-12):
```javascript
let __cachedSalt = null;
let __initPromise = null;
```

**New internal state**:
```javascript
let __saltRegistry = null;  // { current: "v1", versions: { "v1": "salt..." } }
let __initPromise = null;
```

**`initializeSalt()` changes** — parse JSON from both env var and Secrets Manager:
```javascript
// Line 40-43: currently reads raw string from env
// CHANGE TO:
if (process.env.USER_SUB_HASH_SALT) {
  logger.info({ message: "Using USER_SUB_HASH_SALT from environment (local dev/test)" });
  __saltRegistry = parseSaltRegistry(process.env.USER_SUB_HASH_SALT);
  return;
}
// Line 69: currently stores raw string from Secrets Manager
// CHANGE TO:
__saltRegistry = parseSaltRegistry(response.SecretString);
```

**New helper function**:
```javascript
function parseSaltRegistry(raw) {
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch {
    throw new Error(
      "Salt secret is not valid JSON. Expected format: " +
      '{"current":"v1","versions":{"v1":"salt-value"}}. ' +
      "Run Migration 001 to convert from raw string format."
    );
  }
  if (!registry.current || !registry.versions || !registry.versions[registry.current]) {
    throw new Error(
      `Salt registry missing required fields. Got current="${registry.current}" ` +
      `but versions has keys: [${Object.keys(registry.versions || {})}]`
    );
  }
  return registry;
}
```

**New exported functions**:
```javascript
export function hashSub(sub) {
  // Same validation as before...
  if (!__saltRegistry) throw new Error("Salt not initialized...");
  const salt = __saltRegistry.versions[__saltRegistry.current];
  return crypto.createHmac("sha256", salt).update(sub).digest("hex");
}

export function hashSubWithVersion(sub, version) {
  if (!sub || typeof sub !== "string") throw new Error("Invalid sub");
  if (!__saltRegistry) throw new Error("Salt not initialized");
  const salt = __saltRegistry.versions[version];
  if (!salt) throw new Error(`Salt version "${version}" not found in registry`);
  return crypto.createHmac("sha256", salt).update(sub).digest("hex");
}

export function getSaltVersion() {
  if (!__saltRegistry) throw new Error("Salt not initialized");
  return __saltRegistry.current;
}

export function getPreviousVersions() {
  if (!__saltRegistry) throw new Error("Salt not initialized");
  return Object.keys(__saltRegistry.versions).filter(v => v !== __saltRegistry.current);
}

export function isSaltInitialized() {
  return __saltRegistry !== null;
}
```

**Updated test helpers** (following emailHash.js pattern):
```javascript
export function _setTestSalt(salt, version = "v1") {
  if (process.env.NODE_ENV !== "test") throw new Error("_setTestSalt can only be used in test environment");
  __saltRegistry = { current: version, versions: { [version]: salt } };
  __initPromise = null;
}

export function _clearSalt() {
  if (process.env.NODE_ENV !== "test") throw new Error("_clearSalt can only be used in test environment");
  __saltRegistry = null;
  __initPromise = null;
}
```

### 12.2 Repository changes — exact code locations

#### `dynamoDbBundleRepository.js` (401 lines)

**Import change** (line 7):
```javascript
// FROM:
import { hashSub } from "../services/subHasher.js";
// TO:
import { hashSub, hashSubWithVersion, getSaltVersion, getPreviousVersions } from "../services/subHasher.js";
```

**Write changes** — add `saltVersion: getSaltVersion()` to every item creation:

| Function | Line | Change |
|----------|------|--------|
| `putBundle()` | 31 | Add `saltVersion: getSaltVersion()` to `item` object |
| `putBundleByHashedSub()` | 84 | Add `saltVersion: getSaltVersion()` to `item` object |
| `resetTokens()` | 211-222 | Add `saltVersion` to UpdateExpression SET clause |
| `resetTokensByHashedSub()` | 238-249 | Add `saltVersion` to UpdateExpression SET clause |
| `consumeToken()` | 266-278 | Add `saltVersion` to UpdateExpression SET clause |
| `recordTokenEvent()` | 307-317 | Add `saltVersion` to UpdateExpression SET clause |
| `updateBundleSubscriptionFields()` | 345-353 | Add `saltVersion` to dynamic UpdateExpression |

**Read-path fallback** — `getUserBundles()` (line 362-400):
```javascript
export async function getUserBundles(userId) {
  // ... existing setup ...
  const hashedSub = hashSub(userId);
  // Try current version first
  let response = await docClient.send(new module.QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "hashedSub = :hashedSub",
    ExpressionAttributeValues: { ":hashedSub": hashedSub },
  }));
  if (response.Items && response.Items.length > 0) {
    return response.Items;
  }
  // Fall back to previous versions during migration window
  for (const version of getPreviousVersions()) {
    const oldHash = hashSubWithVersion(userId, version);
    response = await docClient.send(new module.QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "hashedSub = :hashedSub",
      ExpressionAttributeValues: { ":hashedSub": oldHash },
    }));
    if (response.Items && response.Items.length > 0) {
      logger.warn({ message: "Found bundles at old salt version", version });
      return response.Items;
    }
  }
  return [];
}
```

#### `dynamoDbReceiptRepository.js` (205 lines)

**Import change** (line 7): Same as bundle repo.

**Write changes**:

| Function | Line | Change |
|----------|------|--------|
| `putReceipt()` | 36 | Add `saltVersion: getSaltVersion()` to `item` object |

**Read-path fallback** — two functions:

| Function | Lines | Fallback needed |
|----------|-------|-----------------|
| `getReceipt(userSub, receiptId)` | 82-126 | Yes — try current hash, then fall back through previous versions with same receiptId |
| `listUserReceipts(userSub)` | 133-204 | Yes — query current hash, then fall back through previous versions |

#### `dynamoDbHmrcApiRequestRepository.js` (102 lines)

**Import change** (line 7):
```javascript
import { hashSub, getSaltVersion } from "../services/subHasher.js";
```
(No `hashSubWithVersion` or `getPreviousVersions` needed — write-only repo.)

**Write changes**:

| Function | Line | Change |
|----------|------|--------|
| `putHmrcApiRequest()` | 61 | Add `saltVersion: getSaltVersion()` to `item` object |

**No read-path fallback needed** — this is a write-only audit log.

#### `dynamoDbAsyncRequestRepository.js` (165 lines)

**Import change** (line 7):
```javascript
import { hashSub, hashSubWithVersion, getSaltVersion, getPreviousVersions } from "../services/subHasher.js";
```

**Write changes**:

| Function | Lines | Change |
|----------|-------|--------|
| `putAsyncRequest()` | 59-60 | Add `#saltVersion = :saltVersion` to UpdateExpression, add to names/values maps |

**Read-path fallback** — `getAsyncRequest()` (line 110-164):
Try current hash first, then fall back through previous versions.

### 12.3 Env var format changes

**`.env.test`** (line 30):
```
# FROM:
USER_SUB_HASH_SALT=test-salt-for-unit-tests
# TO:
USER_SUB_HASH_SALT={"current":"v1","versions":{"v1":"test-salt-for-unit-tests"}}
```

**`.env.simulator`** (line 36):
```
# FROM:
USER_SUB_HASH_SALT=local-development-salt-not-for-production
# TO:
USER_SUB_HASH_SALT={"current":"v1","versions":{"v1":"local-development-salt-not-for-production"}}
```

**`.env.proxy`** (line 33):
```
# FROM:
USER_SUB_HASH_SALT=local-development-salt-not-for-production
# TO:
USER_SUB_HASH_SALT={"current":"v1","versions":{"v1":"local-development-salt-not-for-production"}}
```

### 12.4 System tests needing `USER_SUB_HASH_SALT` update

These system tests set `USER_SUB_HASH_SALT` directly as a plain string:

| File | Line | Current value |
|------|------|---------------|
| `app/system-tests/passRedemption.system.test.js` | 105 | `"test-salt-for-pass-tests"` |
| `app/system-tests/bundleCapacity.system.test.js` | ~87 | Via env or direct set |
| `app/system-tests/dynamoDbBundleStore.system.test.js` | ~54 | Via env or direct set |
| `app/system-tests/dynamoDbReceiptStore.system.test.js` | ~57 | Via env or direct set |
| `app/system-tests/bundleManagement.system.test.js` | ~87 | Via env or direct set |
| `app/system-tests/bundleManagement.journeys.system.test.js` | ~104 | Via env or direct set |
| `app/system-tests/hmrcVatJourney.system.test.js` | ~124 | Via env or direct set |
| `app/system-tests/hmrcVatScenarios.system.test.js` | ~63 | Via env or direct set |
| `app/system-tests/hmrcVatObligationJourney.system.test.js` | ~63 | Via env or direct set |
| `app/system-tests/accountBundles.system.test.js` | ~33 | Via env or direct set |
| `app/system-tests/asyncRequestPersistence.system.test.js` | ~35 | Via env or direct set |
| `app/system-tests/tokenConsumption.system.test.js` | ~43 | Via env or direct set |

**Two patterns** in system tests:
1. **Direct env set**: `process.env.USER_SUB_HASH_SALT = "value"` then `initializeSalt()` — these need JSON format value
2. **Via `.env.test`**: `dotenvConfigIfNotBlank({ path: ".env.test" })` — these pick up the `.env.test` change automatically

Most system tests use pattern 2 (load from `.env.test`). Only `passRedemption.system.test.js` explicitly sets the env var to a custom value — that one needs direct update.

### 12.5 Unit test callers of `_setTestSalt`

These use `_setTestSalt(salt)` (will become `_setTestSalt(salt, version)`):

| File | Line | Current call |
|------|------|-------------|
| `app/unit-tests/services/subHasher.test.js` | 15, 75, 82, 94 | `_setTestSalt(TEST_SALT)` |
| `app/unit-tests/data/dynamoDbAsyncRequestRepository.test.js` | 7 | Import, called in beforeAll |
| `app/unit-tests/data/dynamoDbHmrcApiRequestStore.test.js` | 8 | Import, called in beforeAll |
| `app/unit-tests/lib/buildFraudHeaders.test.js` | 9 | Import, called in setup |

The new `_setTestSalt(salt, version = "v1")` has a default for `version`, so **existing callers remain compatible** — `_setTestSalt("test-salt")` still works (defaults to version "v1").

### 12.6 `deploy-environment.yml` salt creation update

Current salt creation (lines 234-250) generates raw base64 string.

**Change to**: Create JSON registry:
```bash
SALT=$(openssl rand -base64 32)
REGISTRY=$(printf '{"current":"v1","versions":{"v1":"%s"}}' "$SALT")
aws secretsmanager create-secret \
  --name "$SECRET_NAME" \
  --secret-string "$REGISTRY" \
  ...
```

**Idempotency**: Only runs when secret doesn't exist. Existing secrets (raw format) need Migration 001 to convert.

### 12.7 `manage-secrets.yml` changes

**`check-salt` action**: Update validation to:
- Parse as JSON
- Verify `current` and `versions` fields exist
- Verify `versions[current]` has a value
- Report number of versions in registry

**`backup-salt` action**: Display the full JSON registry (operator copies entire JSON).

**`restore-salt` action**: Accept JSON registry string. Validate format before writing.

### 12.8 Migration workflow (`run-migrations.yml`)

Standalone workflow that can be triggered manually or called by deploy.yml:

```yaml
name: Run data migrations
on:
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment (ci or prod)"
        required: true
        type: choice
        options: [ci, prod]
      phase:
        description: "Migration phase"
        required: true
        type: choice
        options: [pre-deploy, post-deploy, all]
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      phase:
        required: true
        type: string
```

In `deploy.yml`, add (commented out for now):
```yaml
# - name: Run pre-deploy migrations
#   uses: ./.github/workflows/run-migrations.yml
#   with:
#     environment: ${{ env.ENV_NAME }}
#     phase: pre-deploy
```

### 12.9 KMS key for Path 3 (CDK)

Create a KMS CMK in the environment stack for salt encryption:

**In `EnvironmentStack.java` (or `DataStack.java`)**:
```java
// KMS key for encrypting salt backup in DynamoDB (Path 3)
Key saltEncryptionKey = Key.Builder.create(this, "SaltEncryptionKey")
    .alias(envName + "-salt-encryption")
    .description("Encrypts salt backup stored in DynamoDB for disaster recovery")
    .enableKeyRotation(true)
    .removalPolicy(RemovalPolicy.RETAIN)  // Exception to DESTROY rule: losing this key = losing Path 3 backup
    .build();
```

Grant Lambda functions access to encrypt/decrypt with this key for the migration scripts. The key ARN is stored as a CDK output / SSM parameter for the migration runner to use.

---

## 13. Test Uplift Strategy

### Phase 1: Lock in current behaviour BEFORE code changes

These tests should be uplifted first to verify they pass with the current code, then re-run after each change to detect regressions.

**13.1 Unit tests that pin current `hashSub` behaviour:**
- `subHasher.test.js` — already comprehensive. Add one test for deterministic hash VALUE (not just format) so we can verify the hash output doesn't change when we refactor internals:
```javascript
test("should produce known hash for known input and salt", () => {
  _setTestSalt("test-salt-for-unit-tests");
  const hash = hashSub("user-12345");
  // Pin the exact expected hash value
  const expected = crypto.createHmac("sha256", "test-salt-for-unit-tests")
    .update("user-12345").digest("hex");
  expect(hash).toBe(expected);
});
```

**13.2 Unit tests that pin current repository write shapes:**
- `dynamoDbAsyncRequestRepository.test.js` — verify the DynamoDB `Item` shape in PutCommand/UpdateCommand mock calls. These tests already check the UpdateExpression; ensure they assert **no** `saltVersion` field is present initially, then flip to assert it IS present after the change.
- `dynamoDbHmrcApiRequestStore.test.js` — same approach for PutCommand Item shape.

**13.3 Run full test suite to establish baseline:**
```bash
npm test                              # Unit + system tests
./mvnw clean verify                   # CDK build
```

### Phase 2: Add new tests alongside code changes

| New test | What it verifies |
|----------|-----------------|
| `subHasher.test.js` — "should parse JSON registry from env var" | `initializeSalt()` with JSON `USER_SUB_HASH_SALT` |
| `subHasher.test.js` — "should reject non-JSON salt" | Throws meaningful error for raw string |
| `subHasher.test.js` — "should reject registry with missing current" | Validates registry structure |
| `subHasher.test.js` — "hashSubWithVersion returns correct hash" | Specific version hashing |
| `subHasher.test.js` — "getSaltVersion returns current" | Version accessor |
| `subHasher.test.js` — "getPreviousVersions excludes current" | Previous version list |
| `subHasher.test.js` — "hashSubWithVersion throws for unknown version" | Error for missing version |
| `dynamoDbBundleRepository.test.js` — "writes saltVersion on putBundle" | saltVersion in DynamoDB item |
| `dynamoDbBundleRepository.test.js` — "getUserBundles falls back to previous version" | Read-path fallback |
| `dynamoDbAsyncRequestRepository.test.js` — "writes saltVersion on putAsyncRequest" | saltVersion in UpdateExpression |
| `dynamoDbAsyncRequestRepository.test.js` — "getAsyncRequest falls back to previous version" | Read-path fallback |

---

## 14. Implementation Order (Refined)

Given the decisions above, the implementation order within this PR:

```
Phase A: Foundation (no behaviour change) ✅ DONE
  A1. Add pinning tests to lock current hash output values ✅
  A2. Run full test suite to confirm baseline passes ✅ (85 files, 914 tests)

Phase B: subHasher.js changes ✅ DONE
  B1. Rewrite subHasher.js with registry parsing + new functions ✅
  B2. Update _setTestSalt(salt, version) signature ✅
  B3. Update .env.test, .env.simulator, .env.proxy to JSON format ✅
  B4. Update system tests that set USER_SUB_HASH_SALT directly ✅ (8 system + 3 unit test files)
  B5. Add new subHasher unit tests (registry, versioning, errors) ✅
  B6. Run full test suite — all existing tests must still pass ✅ (86 files, 926 tests)

Phase C: Repository changes ✅ DONE
  C1. Add saltVersion to all write operations (4 repos) ✅
  C2. Add read-path version fallback (3 repos — not hmrcApiRequest) ✅
  C3. Add repository unit tests for saltVersion writes and fallback ✅
  C4. Run full test suite ✅ (926 tests passed)

Phase D: Migration framework ✅ DONE
  D1. Create scripts/migrations/runner.js ✅
  D2. Create 001-convert-salt-to-registry.js ✅
  D3. Create 002-backfill-salt-version-v1.js ✅
  D4. Create 003-rotate-salt-to-passphrase.js (auto-generates 8-word passphrase) ✅
  D5. Unit test the migration runner ✅ (6 tests in app/unit-tests/migrations/runner.test.js)

Phase E: Workflows and infrastructure ✅ DONE
  E1. Create run-migrations.yml workflow ✅
  E2. Update manage-secrets.yml for registry format ✅
  E3. Update deploy-environment.yml salt creation to JSON registry ✅
  E4. Add commented-out migration call in deploy.yml ✅
  E5. Add KMS key to CDK DataStack ✅
  E6. ./mvnw clean verify ✅ BUILD SUCCESS

Phase F: Documentation ✅ DONE
  F1. Update RUNBOOK_INFORMATION_SECURITY.md Section 4 ✅ (multi-version registry, 3 recovery paths, migration framework)
  F2. Update AWS_ARCHITECTURE.md ✅ (salt registry + KMS key in data layer diagram)
  F3. Update PLAN_AWS_ACCOUNTS.md ✅ (KMS key in security resources, planned move to submit-backup)

Phase G: Final verification ✅ DONE (committed, pushed, CI in progress)
  G1. npm test (unit + system) ✅ (86 files, 932 tests passed)
  G2. ./mvnw clean verify (CDK build) ✅ BUILD SUCCESS
  G3. npm run test:submitVatBehaviour-proxy (E2E locally) ✅ (1 passed)
  G4. Commit, push, monitor CI pipelines ✅
    - Branch: nvsubhash
    - Commit: 0bb4817b (main) + 36336b07 (actionlint fix)
    - deploy-environment: ✅ success
    - test: first run failed (actionlint on run-migrations.yml), fixed and re-pushed
    - test: second run in progress as of 15 Feb 2026
    - deploy: pending (waiting on deploy-environment)

Phase H: CI migrations ✅ DONE (16 Feb 2026, run locally)
  H1. Bug fix merged to main, branch caught up (1ad97acf) ✅
  H2. Clean redeploy of nvsubhash branch ✅
    - deploy-environment (run 22044130329): ✅ success
    - deploy (run 22044130350): ✅ success
  H3. Run migrations locally against CI ✅
    - 001-convert-salt-to-registry: converted raw salt (44 chars) to JSON registry (v1)
    - 002-backfill-salt-version-v1: 20,020 items backfilled across 8 tables + canary written
    - 003-rotate-salt-to-passphrase: generated v2 passphrase, re-keyed 110 items for 67 Cognito users
    - Note: ~19,910 items not re-keyed (belong to expired transient test users no longer in Cognito)
    - CI v2 passphrase: alert-court-super-stoke-tribe-plier-focus-throw (record in password manager)
  H4. Behaviour tests against CI ⏳ BLOCKED
    - CI app stacks self-destructed (2-hour TTL) before tests could run
    - ci-submit.diyaccounting.co.uk DNS not resolving (no app stacks)
    - Need fresh deploy to test — will retry after merge or redeploy
  H5. run-migrations.yml workflow cannot be dispatched from GitHub UI ⚠️
    - gh workflow run requires workflow file on default branch (main)
    - Workaround: run locally with assumed role until branch is merged

Phase I: Prod migrations ✅ DONE (16-17 Feb 2026)
  I1. Merged nvsubhash to main (PR #710) ✅
  I2. Migration 001 against prod ✅ (pre-deploy, via GitHub Actions)
    - Converted raw 44-char salt to JSON registry (v1)
  I3. Migration 002 against prod ✅ (post-deploy, via GitHub Actions run 22079622301)
    - Backfilled saltVersion=v1 on 21,975 items across 8 tables + canary
  I4. Migration 003 against prod ✅ (post-deploy, first via GitHub Actions then re-key locally)
    - GitHub Actions: generated v2 passphrase, set current=v2, but skipped re-key (COGNITO_USER_POOL_ID not set)
    - Local re-run: re-keyed 71 items for 10 Cognito users
    - Prod v2 passphrase: tribe-smear-knife-along-nurse-broth-essay-shark
    - Fix: PR #711 added lookup-resources action to run-migrations.yml
  I5. Prod deploy verified ✅ (run 22078976502 — all tests passed including paymentBehaviour-prod)
  I6. Scenario K incident ✅ RESOLVED (17 Feb 2026)
    - Stale Lambda cache caused hash mismatch: pass-post (v2) vs bundle-get (v1)
    - Immediate fix: forced cold starts on all 26 Docker Lambdas via config update
    - Permanent fix: salt cache TTL in subHasher.js (commit af2ec076, branch stability-fixes)
    - Service restored within minutes of diagnosis
```

---

## 15. Post-Merge to Main: Production Steps

After merging the `nvsubhash` branch to `main`, the following steps are required:

### Step 1: Verify CI deployment (automated)

Merging to main triggers `deploy-environment.yml` and `deploy.yml` for CI. Monitor:

```bash
gh run list --branch main --limit 5
```

The new `deploy-environment.yml` creates salt secrets in JSON registry format for **new** environments. Existing CI/prod secrets are still in the old raw format until Migration 001 runs.

### Step 2: Run Migration 001 against prod (CRITICAL — before Lambda cold starts)

The merged Lambda code expects JSON registry format from Secrets Manager. Existing prod salt is raw string. **Lambdas will fail on cold start until this runs.**

Option A — GitHub Actions (preferred, now that workflow is on main):
```bash
gh workflow run "run-migrations.yml" -f environment-name=prod -f phase=pre-deploy
```

Option B — Locally:
```bash
. ./scripts/aws-assume-submit-deployment-role.sh
ENVIRONMENT_NAME=prod node scripts/migrations/runner.js --phase pre-deploy
```

**Timing**: Run immediately after merge, before or during the deploy workflow. Migration 001 is pre-deploy and idempotent — safe to run even if Lambdas haven't deployed yet.

### Step 3: Run Migration 002 against prod (backfill saltVersion)

After the deploy completes and Lambdas are running the new code:

Option A — GitHub Actions:
```bash
gh workflow run "run-migrations.yml" -f environment-name=prod -f phase=post-deploy
```

Option B — Locally:
```bash
. ./scripts/aws-assume-submit-deployment-role.sh
ENVIRONMENT_NAME=prod node scripts/migrations/runner.js --phase post-deploy
```

This backfills `saltVersion=v1` on all existing prod items and writes the salt health canary.

### Step 4: Run Migration 003 against prod (rotate to passphrase — optional)

This generates an 8-word passphrase (v2), adds it to the registry, and re-keys all items from v1 to v2.

```bash
. ./scripts/aws-assume-submit-deployment-role.sh
ENVIRONMENT_NAME=prod COGNITO_USER_POOL_ID=eu-west-2_MJovvw6mL node scripts/migrations/runner.js
```

**Important**: Record the generated passphrase securely (password manager + physical card).

Since we're pre-launch with disposable data, this is safe to run immediately. Post-launch, this would follow the Scenario A (BAU rotation) runbook.

### Step 5: Run behaviour tests against prod

```bash
. ./scripts/aws-assume-submit-deployment-role.sh
npm run test:enableCognitoNative -- prod
# Use the printed credentials:
TEST_AUTH_USERNAME='...' TEST_AUTH_PASSWORD='...' npm run test:submitVatBehaviour-prod
npm run test:disableCognitoNative -- prod
```

### Step 6: Verify CI (after fresh deploy)

Once the merge triggers a CI app deployment:

```bash
. ./scripts/aws-assume-submit-deployment-role.sh
npm run test:enableCognitoNative
TEST_AUTH_USERNAME='...' TEST_AUTH_PASSWORD='...' npm run test:submitVatBehaviour-ci
npm run test:disableCognitoNative
```

### Step 7: Clean up GitHub environment variables (optional)

The prod-scoped Cognito variables in GitHub Settings are unused — all workflows resolve Cognito IDs from AWS infrastructure via the `lookup-resources` action or CDK outputs:

- `COGNITO_CLIENT_ID` (prod) — **safe to delete**
- `COGNITO_USER_POOL_ARN` (prod) — **safe to delete**
- `COGNITO_USER_POOL_ID` (prod) — **safe to delete**

### Step 8: Store KMS-encrypted salt in DynamoDB (Path 3 — future)

After Migration 003 runs against prod, store the v2 passphrase encrypted with the KMS key created in DataStack:

```json
{ "hashedSub": "system#config", "bundleId": "salt-v2", "encryptedSalt": "<KMS ciphertext>", "kmsKeyArn": "arn:..." }
```

This is not yet automated — needs a script or migration to encrypt and write the item. Low priority since Path 1 (Secrets Manager) and Path 2 (physical card) are already available.

---

## 16. Known Issues and Follow-ups

| Issue | Status | Notes |
|-------|--------|-------|
| CI behaviour tests not run post-migration | ⏳ Pending | App stacks self-destructed; need fresh deploy |
| run-migrations.yml not dispatchable until on main | ✅ Resolved on merge | Workflow dispatch requires file on default branch |
| Migration 003 re-key missed ~19,910 orphaned items in CI | ℹ️ Expected | Transient test users no longer in Cognito; items will expire via TTL |
| Path 3 (KMS-encrypted salt in DynamoDB) not implemented | ⏳ Future | Script/migration needed; lower priority than Path 1+2 |
| Prod Cognito GitHub variables are unused | ⏳ Clean up | Safe to delete after merge verification |
| Scenario K: stale Lambda salt cache | ✅ Fixed | Salt cache TTL (5 min) added in commit `af2ec076` on `stability-fixes` branch |
| run-migrations.yml missing COGNITO_USER_POOL_ID | ✅ Fixed | PR #711 added lookup-resources action |
| `.env.prod` has `DEPLOYMENT_NAME=prod` (wrong) | ⏳ Fix needed | Breaks lean deploy — should be removed so SSM lookup resolves `prod-cbf0475` |
| Delete GitHub Actions run 22079622301 | ⏳ Manual | Contains prod v2 passphrase in logs — delete from Actions history |
