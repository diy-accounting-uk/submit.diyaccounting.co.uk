<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Salt Secret Recovery Guide

This document describes the user sub hash salt secret, its critical importance, and procedures for backup, recovery, and troubleshooting.

## Overview

The salt secret is used to create HMAC-SHA256 hashes of user `sub` claims from OAuth/Cognito tokens. These hashes are used as partition keys in DynamoDB tables to associate data with users without storing their actual identity tokens.

**Secret Name Pattern**: `{envName}/submit/user-sub-hash-salt`

**Examples**:
- `ci/submit/user-sub-hash-salt`
- `prod/submit/user-sub-hash-salt`

## Why This Secret Is Critical

| If the salt is... | Impact |
|-------------------|--------|
| **Missing** | All Lambda functions fail immediately on cold start |
| **Wrong value** | All existing user data becomes orphaned (hashes don't match) |
| **Compromised** | Attacker could potentially correlate users across datasets |

**The salt value must remain constant** for the lifetime of user data. If it changes, all existing data becomes inaccessible because the hash function will produce different outputs.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Secrets Manager                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ci/submit/user-sub-hash-salt                            │    │
│  │ Value: "Abc123...base64..." (44 chars)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ GetSecretValue (on cold start)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Lambda Functions                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ cognitoTokenPost │  │ hmrcTokenPost    │  │ bundleGet     │  │
│  │ customAuthorizer │  │ vatObligations   │  │ bundlePost    │  │
│  │                  │  │ vatReturns       │  │ bundleDelete  │  │
│  │                  │  │ receiptGet       │  │               │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
│           AuthStack           HmrcStack         AccountStack    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ hashSub(userSub)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DynamoDB Tables                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ bundles          │  │ hmrc-api-requests│  │ receipts      │  │
│  │ PK: hashedSub    │  │ PK: hashedSub    │  │ PK: hashedSub │  │
│  └──────────────────┘  └──────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Secret Lifecycle

### Creation

The salt is created by `deploy-environment.yml` in the `create-secrets` job:

```yaml
- name: Create user sub hash salt (if not exists)
  run: |
    SECRET_NAME="${ENV_NAME}/submit/user-sub-hash-salt"
    if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" 2>/dev/null; then
      SALT=$(openssl rand -base64 32)  # 32-byte cryptographically secure
      aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --secret-string "$SALT" \
        --tags Key=Critical,Value=true
    fi
```

**Key behavior**: The workflow is idempotent - it only creates the secret if it doesn't exist. It never overwrites an existing secret.

### Validation

The salt is validated by `deploy.yml` in the `validate-secrets` job before deploying Lambda stacks. This prevents deployments that would fail at runtime.

### Usage

At Lambda cold start, `app/services/subHasher.js` calls `initializeSalt()`:

```javascript
const response = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
__cachedSalt = response.SecretString;
```

The salt is cached for the lifetime of the Lambda container (warm starts reuse the cached value).

## Workflows Reference

### deploy environment (`deploy-environment.yml`)

**Purpose**: Creates the salt secret (and other secrets) if they don't exist.

**When to use**:
- First-time environment setup
- After accidentally deleting secrets
- When setting up a new environment

### deploy (`deploy.yml`)

**Purpose**: Deploys application stacks. Includes `validate-secrets` job that fails fast if salt is missing.

**Behavior**: Will fail with clear error message if salt secret doesn't exist.

### manage secrets (`manage-secrets.yml`)

**Purpose**: Query, backup, and restore secrets.

| Action | Description |
|--------|-------------|
| `list` | List all secrets for the environment |
| `check` | Verify all required secrets exist and have values |
| `check-salt` | Detailed check of the salt secret |
| `backup-salt` | Display salt value for backup (delete run afterward!) |
| `restore-salt` | Restore a previously backed-up salt value |

## Backup Procedure

### Regular Backup (Recommended Monthly)

1. Go to **Actions** → **manage secrets**
2. Select **Action**: `backup-salt`
3. Select **Environment**: `prod` (or `ci`)
4. Click **Run workflow**
5. View the workflow run output
6. Copy the salt value displayed
7. Store in a secure location:
   - Password manager (1Password, Bitwarden, etc.)
   - Encrypted file with strong passphrase
   - Hardware security module (HSM) for high-security environments
8. **Delete the workflow run** from Actions history

### Verification

After backup, verify you can read the stored value by comparing lengths:
- Expected length: ~44 characters (32 bytes base64-encoded)

## Recovery Procedures

### Scenario 1: Salt Secret Accidentally Deleted

**Symptoms**:
- Lambdas fail with "ResourceNotFoundException" on cold start
- All authenticated API calls return 500 errors
- CloudWatch logs show "Failed to initialize salt"

**Recovery**:

If you have a backup:
1. Go to **Actions** → **manage secrets**
2. Select **Action**: `restore-salt`
3. Select **Environment**: (affected environment)
4. Enter the backed-up salt value in **salt-backup-value**
5. Click **Run workflow**
6. After success, **delete the workflow run**
7. Force a Lambda cold start (redeploy or wait for timeout)

If you don't have a backup:
1. **DATA WILL BE LOST** - proceed only if acceptable
2. Run **deploy environment** workflow to create a new salt
3. All existing user data will be orphaned
4. Users will appear as "new" and need to re-create their data

### Scenario 2: Wrong Salt Value

**Symptoms**:
- Users can't access their existing data
- New data is being created instead of updating existing
- No error messages (hashing works, just produces wrong values)

**Recovery**:
1. Identify the correct salt value from backup
2. Use `restore-salt` action to restore it
3. Force Lambda cold starts

### Scenario 3: Deployment Fails with "Missing secrets"

**Symptoms**:
- `validate-secrets` job fails
- Error message lists missing secrets

**Recovery**:
1. Run **deploy environment** workflow for the affected environment
2. Re-run the **deploy** workflow

### Scenario 4: Salt Created With Wrong Value (Fresh Environment)

If you just created a new environment and want to use an existing salt (e.g., migrating data):

1. Delete the automatically created salt:
   ```bash
   aws secretsmanager delete-secret \
     --secret-id "ci/submit/user-sub-hash-salt" \
     --force-delete-without-recovery
   ```
2. Use `restore-salt` action with the correct value

## Troubleshooting

### Lambda Error: "Salt not initialized"

**Cause**: `initializeSalt()` was not called before `hashSub()`.

**Fix**: Ensure every Lambda handler that uses `hashSub()` calls `await initializeSalt()` at the start.

### Lambda Error: "Failed to initialize salt: Access Denied"

**Cause**: Lambda IAM role doesn't have permission to read the secret.

**Fix**: Verify `SubHashSaltHelper.grantSaltAccess()` is called for the Lambda in CDK.

### Lambda Error: "Failed to initialize salt: ResourceNotFoundException"

**Cause**: Salt secret doesn't exist.

**Fix**: Run `deploy environment` workflow or use `restore-salt` if you have a backup.

### Hash Values Don't Match Expected

**Cause**: Different salt being used.

**Debug**:
```javascript
// Add temporary logging (remove after debugging!)
console.log('Salt length:', __cachedSalt?.length);
console.log('Salt prefix:', __cachedSalt?.substring(0, 4));
```

### Multiple Environments Produce Same Hashes

**Cause**: Same salt being used across environments (likely copy-paste error).

**Fix**: Each environment should have its own independently-generated salt.

## Security Considerations

### Access Control

- Only deployment roles should have `secretsmanager:GetSecretValue` permission
- Lambda execution roles are granted access via CDK
- Human access should be limited and audited

### Rotation

Salt rotation is **not recommended** because:
- All existing data would need to be re-hashed
- Would require application downtime
- Dual-hashing period would be complex

If rotation is required (e.g., salt compromised):
1. Implement dual-hashing in application code
2. Re-hash all existing data in DynamoDB
3. Remove old hash lookups after migration
4. Rotate the salt value
5. Remove dual-hashing code

### Audit Trail

CloudTrail logs all Secrets Manager API calls. Review periodically:
- `GetSecretValue` calls (should only be from Lambdas)
- `UpdateSecret` calls (should be rare/never)
- `DeleteSecret` calls (should never happen)

## Related Documentation

- [SALTED_HASH_IMPLEMENTATION.md](./_developers/SALTED_HASH_IMPLEMENTATION.md) - Implementation details
- [deploy-environment.yml](./.github/workflows/deploy-environment.yml) - Secret creation
- [manage-secrets.yml](./.github/workflows/manage-secrets.yml) - Secret management
- [subHasher.js](./app/services/subHasher.js) - Runtime implementation
