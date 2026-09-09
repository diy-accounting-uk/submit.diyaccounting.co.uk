<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Salted User Sub Hash - Implementation Summary

## Overview

User sub claims from OAuth/Cognito are now hashed using **HMAC-SHA256 with environment-specific salts** instead of plain SHA-256. This provides enhanced security through rainbow table resistance and environment isolation.

## Security Benefits

| Benefit | Description |
|---------|-------------|
| **Rainbow table resistance** | Salted hashes cannot be pre-computed |
| **Environment isolation** | Different salt per environment (ci ≠ prod) |
| **Breach containment** | Compromised hash from one env doesn't work in another |
| **Audit trail** | All salt access logged via CloudTrail |

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Lambda Handler │────▶│    subHasher.js      │────▶│ AWS Secrets Mgr │
│                 │     │  (HMAC-SHA256)       │     │ {env}/submit/   │
│ initializeSalt()│     │                      │     │ user-sub-hash-  │
│ hashSub(sub)    │     │ Cached after 1st call│     │ salt            │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
```

- **Algorithm**: HMAC-SHA256 (cryptographically stronger than plain SHA-256)
- **Salt size**: 256-bit (32 bytes base64-encoded)
- **Salt storage**: AWS Secrets Manager (persists across stack deletions)
- **Caching**: One-time fetch per Lambda cold start, then cached in memory

## Files Changed

### Core Implementation

| File | Change |
|------|--------|
| `app/services/subHasher.js` | Replaced SHA-256 with HMAC-SHA256 + salt initialization |

**Key features:**
- `initializeSalt()` - Async init, fetches salt from env var or Secrets Manager
- `hashSub(sub)` - Sync hash using cached salt
- Concurrent init protection (prevents race conditions on cold start)
- Clear error messages for troubleshooting

### Lambda Handlers (12 files)

Added `await initializeSalt()` at the start of each handler:

| File | Handlers Updated |
|------|------------------|
| `app/functions/account/bundleGet.js` | ingestHandler |
| `app/functions/account/bundlePost.js` | ingestHandler, workerHandler |
| `app/functions/account/bundleDelete.js` | ingestHandler, workerHandler |
| `app/functions/auth/cognitoTokenPost.js` | ingestHandler |
| `app/functions/auth/customAuthorizer.js` | ingestHandler |
| `app/functions/hmrc/hmrcTokenPost.js` | ingestHandler |
| `app/functions/hmrc/hmrcReceiptGet.js` | ingestHandler |
| `app/functions/hmrc/hmrcVatReturnPost.js` | ingestHandler, workerHandler |
| `app/functions/hmrc/hmrcVatObligationGet.js` | ingestHandler, workerHandler |
| `app/functions/hmrc/hmrcVatReturnGet.js` | ingestHandler, workerHandler |

### Infrastructure

| File | Change |
|------|--------|
| `.github/workflows/deploy-environment.yml` | Creates salt secret if not exists |
| `infra/.../utils/SubHashSaltHelper.java` | Helper to grant Lambda salt access |

**Salt creation (GitHub Actions):**
- Idempotent - only creates if secret doesn't exist
- 32-byte cryptographically secure random salt
- Tagged: `Critical=true`, `BackupRequired=true`
- Survives stack deletion (Secrets Manager is independent of CDK)

### Local Development

| File | Change |
|------|--------|
| `.env.proxy` | Added `USER_SUB_HASH_SALT` |
| `.env.test` | Added `USER_SUB_HASH_SALT` |

### Tests

| File | Change |
|------|--------|
| `app/unit-tests/services/subHasher.test.js` | Updated for salted hashing |

### Operational

| File | Change |
|------|--------|
| `scripts/backup-salts.sh` | Quarterly salt backup script |
| `.gitignore` | Excludes `salt-backup-*.json` |

## How It Works

### 1. Salt Creation (First Deployment)

GitHub Actions workflow creates salt in Secrets Manager:

```yaml
# In deploy-environment.yml, create-secrets job
- name: Create user sub hash salt (if not exists)
  run: |
    SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/user-sub-hash-salt"
    if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" ...; then
      SALT=$(openssl rand -base64 32)
      aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "$SALT" ...
    fi
```

### 2. Lambda Initialization (Cold Start)

Each Lambda calls `initializeSalt()` on first invocation:

```javascript
export async function ingestHandler(event) {
  await initializeSalt();  // Fetches salt from Secrets Manager, caches it
  // ... rest of handler
}
```

### 3. Hash Usage (Every Request)

After initialization, `hashSub()` is synchronous:

```javascript
const hashedSub = hashSub(userSub);  // Uses cached salt, no network call
```

## CDK Integration

The `SubHashSaltHelper.java` class grants Lambda functions access to the salt secret:

```java
// In each stack that creates Lambdas:
import static co.uk.diyaccounting.submit.utils.SubHashSaltHelper.grantSaltAccess;

// After creating Lambda:
grantSaltAccess(lambda, region, account, envName);
```

This adds the IAM policy:
```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:{region}:{account}:secret:{env}/submit/user-sub-hash-salt*"
}
```

## Backup & Recovery

### Quarterly Backup (Required)

```bash
./scripts/backup-salts.sh
```

Store output securely (1Password, not Git).

### Disaster Recovery

If salt is lost, all user data becomes inaccessible. To recover:

1. Restore salt from backup:
   ```bash
   aws secretsmanager create-secret \
     --name "{env}/submit/user-sub-hash-salt" \
     --secret-string "{salt-from-backup}"
   ```

2. Deploy stack (will use existing salt)

3. Restore DynamoDB from backup

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Salt not initialized" | Lambda can't read secret | Check IAM policy, verify secret exists |
| "Access Denied" from Secrets Manager | Missing IAM permission | Add `grantSaltAccess()` in CDK |
| All users appear as "new" | Wrong salt being used | Restore correct salt from backup |
| Hash mismatch after redeploy | Salt was recreated | Should not happen (workflow is idempotent) |

## Testing

### Unit Tests
```bash
npm test -- --grep subHasher
```

### Verify Salt Exists
```bash
aws secretsmanager describe-secret \
  --secret-id "{env}/submit/user-sub-hash-salt" \
  --region eu-west-2
```

### Check Lambda Logs
Look for:
- "Salt successfully fetched and cached" (success)
- "Using USER_SUB_HASH_SALT from environment" (local dev)
- No errors about "Salt not initialized"
