<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Cognito Hosted UI Native Auth Toggle

## Goal

Remove the native login form (email/password + "Forgot your password?") from the Cognito Hosted UI by default, so production users only see social providers (Google). Enable it dynamically during behaviour tests via AWS SDK, and disable it afterwards.

Additionally, switch `cognito-native` test auth from the custom login page (`login-native-addon.js` + `/api/v1/cognito/native-auth`) to the actual Cognito Hosted UI native form.

---

## Architecture

### Default State (Production)

- `supportedIdentityProviders` on UserPoolClient: `[Google, cognito]` (no `COGNITO`)
- Hosted UI at `prod-auth.submit.diyaccounting.co.uk/login` shows only:
  - "Sign in with your social account" (Google)
  - "Sign in with your corporate ID" (cognito OIDC)
- No native email/password form visible
- No "Forgot your password?" link
- `AccountRecovery.NONE` already applied (separate change)

### During Tests

- `supportedIdentityProviders` updated to include `COGNITO` via AWS SDK
- Hosted UI now also shows the native email/password form
- Test user created via `adminCreateUser`
- Playwright fills in the Hosted UI native form directly
- After test: `COGNITO` removed, test user deleted (unless `skip-cleanup`)

### Manual Debugging ("The Hatch")

- `skip-cleanup: true` parameter on `synthetic-test.yml` or `deploy.yml`
- Leaves test user alive and `COGNITO` enabled on the Hosted UI
- You can log in manually at the Hosted UI with the test credentials
- Clean up manually later or let the next test run clean up

---

## Changes

### 1. `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`

Remove `UserPoolClientIdentityProvider.COGNITO` from the default `supportedIdentityProviders`.

**Current (lines 215-216):**
```java
var allProviders = new java.util.ArrayList<>(this.identityProviders.keySet());
allProviders.add(UserPoolClientIdentityProvider.COGNITO); // Enable native Cognito users
```

**Change to:**
```java
var allProviders = new java.util.ArrayList<>(this.identityProviders.keySet());
// Native Cognito login (COGNITO) is NOT included by default.
// It is enabled dynamically during behaviour tests via toggle-cognito-native-auth.js
// and disabled afterwards. See PLAN_COGNITO_HOSTED_UI_NATIVE_AUTH_TOGGLE.md
```

**Note:** The `authFlows` (`userPassword`, `userSrp`) remain unchanged — these control programmatic SDK auth and are independent of the Hosted UI. The toggle script uses `UpdateUserPoolClient` at runtime, not CloudFormation.

**CloudFormation drift consideration:** After the toggle script adds/removes COGNITO at runtime, the UserPoolClient will drift from the CloudFormation-declared state. This is acceptable because:
- The next CDK deploy will reset it to the default (no COGNITO) — which is the desired production state
- The toggle is designed to be temporary and short-lived
- deploy.yml always runs disable-native-auth after tests, before `set-last-known-good-deployment`

---

### 2. New script: `scripts/toggle-cognito-native-auth.js`

**Usage:**
```bash
node scripts/toggle-cognito-native-auth.js enable <environment-name>
node scripts/toggle-cognito-native-auth.js disable <environment-name>
```

**What it does:**

1. Looks up `UserPoolId` and `UserPoolClientId` from CloudFormation stack outputs (`{env}-env-IdentityStack`)
2. Calls `DescribeUserPoolClient` to get the current full configuration
3. Modifies `SupportedIdentityProviders` to add or remove `COGNITO`
4. Calls `UpdateUserPoolClient` with the full configuration (required — this API replaces, not patches)

**Key implementation details:**
- `UpdateUserPoolClient` requires ALL parameters to be passed, not just the changed ones. Omitting a parameter resets it to default. The script must read the current config and replay it with only `SupportedIdentityProviders` modified.
- The script is idempotent: enabling when already enabled is a no-op, disabling when already disabled is a no-op.
- Uses the same AWS SDK packages already in `package.json` (`@aws-sdk/client-cognito-identity-provider`, `@aws-sdk/client-cloudformation`).

---

### 3. `behaviour-tests/steps/behaviour-login-steps.js`

Change the `cognito-native` flow to go through the Cognito Hosted UI instead of the custom login page.

**Current `cognito-native` flow (lines 46-52):**
```javascript
} else if (testAuthProvider === "cognito-native") {
    await fillInNativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath);
    await submitNativeAuth(page, screenshotPath);
}
```

**New `cognito-native` flow:**
```javascript
} else if (testAuthProvider === "cognito-native") {
    // Navigate to Cognito Hosted UI (same as Google flow)
    await initCognitoAuth(page, screenshotPath);
    // Fill in the native email/password form on the Hosted UI
    await fillInHostedUINativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath);
    // Submit the Hosted UI form
    await submitHostedUINativeAuth(page, screenshotPath);
}
```

**New functions to add:**

`fillInHostedUINativeAuth` — Fills in the email and password fields on the Cognito Managed Login page:
- Locates the email input field
- Locates the password input field
- Fills in the test credentials
- Takes screenshots at each step

`submitHostedUINativeAuth` — Clicks the sign-in button on the Managed Login page:
- Clicks the submit/sign-in button
- Waits for the OAuth redirect back to the callback URL
- The existing callback handler (`loginWithCognitoCallback.html`) processes the auth code exchange

**Hosted UI form selectors:** These need to be determined by inspecting the actual Cognito Managed Login page. The form structure from the user's observation is:
```
Sign in with your email and password
Email: <input>
Password: <input>
Forgot your password? (hidden by AccountRecovery.NONE)
[Sign in button]
```

The exact selectors (input names, button text) should be captured from the live Hosted UI during implementation.

**What happens to the old functions:**
- `fillInNativeAuth` and `submitNativeAuth` — can be removed (they interact with `login-native-addon.js` which is no longer used for this flow)
- `login-native-addon.js` and `/api/v1/cognito/native-auth` — can be cleaned up in a follow-up. Not urgent since they're harmless dead code once `cognito-native` goes through the Hosted UI.

---

### 4. `synthetic-test.yml` — Standalone mode changes

**New inputs:**

```yaml
workflow_dispatch:
  inputs:
    skip-cleanup:
      type: boolean
      description: 'Keep test user and native auth enabled after test (for manual debugging)'
      required: false
      default: false
    skip-native-auth-toggle:
      type: boolean
      description: 'Skip enabling/disabling native auth (caller manages lifecycle)'
      required: false
      default: false

workflow_call:
  inputs:
    skip-cleanup:
      type: string
      description: 'Keep test user and native auth enabled after test'
      required: false
    skip-native-auth-toggle:
      type: string
      description: 'Skip enabling/disabling native auth (caller manages lifecycle)'
      required: false
```

**New step before "Create Cognito test user" (in `behaviour-test` job):**

```yaml
- name: Enable native auth on Cognito Hosted UI
  if: ${{ inputs.skip-native-auth-toggle != 'true' }}
  run: node scripts/toggle-cognito-native-auth.js enable ${{ needs.names.outputs.environment-name }}
```

**New step after test run (always runs, in `behaviour-test` job):**

```yaml
- name: Disable native auth on Cognito Hosted UI
  if: ${{ !cancelled() && inputs.skip-native-auth-toggle != 'true' && inputs.skip-cleanup != 'true' }}
  run: node scripts/toggle-cognito-native-auth.js disable ${{ needs.names.outputs.environment-name }}
```

**Test user cleanup (existing "Create Cognito test user" step):**

The test user deletion should also respect `skip-cleanup`. Currently there is no explicit user deletion step — the test user persists until manually cleaned up or overwritten. A deletion step should be added:

```yaml
- name: Delete Cognito test user
  if: ${{ !cancelled() && inputs.skip-cleanup != 'true' }}
  run: node scripts/delete-cognito-test-user.js ${{ needs.names.outputs.environment-name }} ${{ steps.cognito-test-user.outputs.test-auth-username }}
```

**Concurrency group (uncomment and adjust):**

```yaml
concurrency:
  group: synthetic-test-${{ inputs.environment-name || (github.ref == 'refs/heads/main' && 'prod' || 'ci') }}
  cancel-in-progress: false
```

This prevents overlapping standalone synthetic-test runs against the same environment.

**When called from `deploy.yml`:** The `skip-native-auth-toggle: 'true'` input means synthetic-test.yml does NOT call the toggle script — deploy.yml's wrapper jobs handle it.

---

### 5. `deploy.yml` — Wrapper jobs for enable/disable

**New job: `enable-native-auth`**

Positioned after `verify-api`, before all synthetic test jobs.

```yaml
enable-native-auth:
  if: ${{ !cancelled() }}
  name: 'enable native auth for behaviour tests'
  needs:
    - names
    - verify-api
  runs-on: ubuntu-24.04
  environment: ${{ github.ref == 'refs/heads/main' && 'prod' || 'ci' }}
  steps:
    - name: Checkout
      uses: actions/checkout@v6

    - name: Setup Node
      uses: actions/setup-node@v6
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci --ignore-scripts
      env:
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 1

    - name: Configure AWS role via GitHub OIDC
      uses: aws-actions/configure-aws-credentials@v5
      with:
        role-to-assume: ${{ env.ACTIONS_ROLE_ARN }}
        aws-region: ${{ env.AWS_REGION }}
        # ... (standard credential config)

    - name: Assume AWS deployment role
      uses: aws-actions/configure-aws-credentials@v5
      with:
        role-to-assume: ${{ env.DEPLOY_ROLE_ARN }}
        aws-region: ${{ env.AWS_REGION }}
        # ... (standard credential config)

    - name: Enable native auth on Cognito Hosted UI
      run: node scripts/toggle-cognito-native-auth.js enable ${{ needs.names.outputs.environment-name }}
```

**Update all synthetic test job dependencies:**

All `web-test-*` jobs add `enable-native-auth` to their `needs` and pass `skip-native-auth-toggle: 'true'`:

```yaml
web-test-auth:
  needs:
    - names
    - set-origins
    - deploy-publish
    - verify-api
    - enable-native-auth        # ← NEW
  uses: ./.github/workflows/synthetic-test.yml
  with:
    # ... existing inputs ...
    skip-native-auth-toggle: 'true'   # ← NEW: deploy.yml manages the toggle
```

Same for `web-test`, `web-test-post-vat-return-sandbox`, etc.

**New job: `disable-native-auth`**

Positioned after ALL synthetic test jobs, runs even on failure/cancellation.

```yaml
disable-native-auth:
  if: ${{ !cancelled() }}
  name: 'disable native auth after behaviour tests'
  needs:
    - names
    - enable-native-auth
    - web-test-auth
    - web-test
    - web-test-post-vat-return-sandbox
    - web-test-get-vat-return-sandbox
    - web-test-obligation-sandbox
    - web-test-fraud-prevention-headers-vat-sandbox
    - web-test-compliance-sandbox
    - web-test-help-sandbox
    - web-test-vatValidation-sandbox
    - web-test-vatSchemes-sandbox
  runs-on: ubuntu-24.04
  environment: ${{ github.ref == 'refs/heads/main' && 'prod' || 'ci' }}
  steps:
    - name: Checkout
      uses: actions/checkout@v6

    - name: Setup Node
      uses: actions/setup-node@v6
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci --ignore-scripts
      env:
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 1

    - name: Configure AWS role via GitHub OIDC
      uses: aws-actions/configure-aws-credentials@v5
      with:
        role-to-assume: ${{ env.ACTIONS_ROLE_ARN }}
        aws-region: ${{ env.AWS_REGION }}
        # ... (standard credential config)

    - name: Assume AWS deployment role
      uses: aws-actions/configure-aws-credentials@v5
      with:
        role-to-assume: ${{ env.DEPLOY_ROLE_ARN }}
        aws-region: ${{ env.AWS_REGION }}
        # ... (standard credential config)

    - name: Disable native auth on Cognito Hosted UI
      if: ${{ inputs.skipCleanup != 'true' }}
      run: node scripts/toggle-cognito-native-auth.js disable ${{ needs.names.outputs.environment-name }}
```

**`disable-native-auth` must run before `set-last-known-good-deployment`:**

Update `set-last-known-good-deployment` to also depend on `disable-native-auth`:

```yaml
set-last-known-good-deployment:
  needs:
    - names
    - web-test
    - disable-native-auth    # ← NEW: ensure cleanup before marking good
```

**New deploy.yml input for skip-cleanup:**

```yaml
workflow_dispatch:
  inputs:
    skipCleanup:
      description: 'Keep test users and native auth enabled after tests (for debugging)'
      type: choice
      options:
        - 'true'
        - 'false'
      required: false
      default: 'false'
```

---

### 6. New script: `scripts/delete-cognito-test-user.js`

**Usage:**
```bash
node scripts/delete-cognito-test-user.js <environment-name> <username>
```

Calls `AdminDeleteUser` to remove the test user. Mirrors `create-cognito-test-user.js`.

---

## Dependency Graph (deploy.yml after changes)

```
deploy stacks...
    └─→ verify-api
            └─→ enable-native-auth
                    └─→ web-test-auth
                            └─→ web-test (submitVat)
                                    ├─→ web-test-post-vat-return-sandbox
                                    ├─→ web-test-get-vat-return-sandbox
                                    ├─→ web-test-obligation-sandbox
                                    ├─→ web-test-fraud-prevention-headers
                                    ├─→ web-test-compliance-sandbox
                                    ├─→ web-test-help-sandbox
                                    ├─→ web-test-vatValidation-sandbox
                                    └─→ web-test-vatSchemes-sandbox
                                            └─→ disable-native-auth
                                                    └─→ set-last-known-good-deployment
                                                            └─→ destroy-previous
```

---

## Concurrency Model

| Scenario | How it's handled |
|----------|-----------------|
| Concurrent deploy.yml runs (same branch) | `concurrency: deploy-${{ github.ref_name }}` serializes them |
| Concurrent synthetic-test.yml standalone runs | New concurrency group `synthetic-test-{env}` serializes them |
| deploy.yml vs standalone synthetic-test.yml | Low probability overlap; worst case is a single failed test that self-heals. The enable is idempotent, and the disable only removes COGNITO — if a concurrent run needs it, its own enable step will re-add it. |

---

## Test Scenarios

### Scenario 1: Normal deploy (deploy.yml)
1. `enable-native-auth` adds COGNITO to Hosted UI
2. `synthetic-test.yml` calls create test user, runs Playwright against Hosted UI native form
3. `synthetic-test.yml` deletes test user (toggle skipped because `skip-native-auth-toggle: true`)
4. `disable-native-auth` removes COGNITO from Hosted UI
5. Production Hosted UI shows only Google

### Scenario 2: Standalone synthetic test (schedule/manual)
1. `synthetic-test.yml` enables COGNITO, creates test user
2. Runs Playwright against Hosted UI native form
3. Deletes test user, disables COGNITO

### Scenario 3: Manual debugging (the hatch)
1. Run `synthetic-test.yml` with `skip-cleanup: true`
2. Test user remains, COGNITO remains on Hosted UI
3. You log in at `prod-auth.submit.diyaccounting.co.uk/login` with test credentials
4. Next normal test run will clean up (disable COGNITO, the old user persists but is harmless with `AccountRecovery.NONE` and `selfSignUpEnabled: false`)

### Scenario 4: deploy.yml with skip-cleanup
1. Same as Scenario 1 but `disable-native-auth` is skipped
2. You can log in manually after the deploy completes

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `infra/.../IdentityStack.java` | Modify | Remove `COGNITO` from default `supportedIdentityProviders` |
| `scripts/toggle-cognito-native-auth.js` | Create | Enable/disable COGNITO on UserPoolClient via AWS SDK |
| `scripts/delete-cognito-test-user.js` | Create | Delete test user via `AdminDeleteUser` |
| `behaviour-tests/steps/behaviour-login-steps.js` | Modify | `cognito-native` flow goes through Hosted UI |
| `.github/workflows/synthetic-test.yml` | Modify | Add `skip-cleanup`, `skip-native-auth-toggle` inputs; add enable/disable steps; uncomment concurrency group |
| `.github/workflows/deploy.yml` | Modify | Add `enable-native-auth` and `disable-native-auth` jobs; add `skipCleanup` input; pass `skip-native-auth-toggle` to synthetic-test calls |

---

## Verification

```bash
# CDK builds with COGNITO removed from default providers
./mvnw clean verify

# Unit tests still pass
npm test

# Behaviour tests work locally (proxy/simulator use mock auth, unaffected)
npm run test:submitVatBehaviour-proxy
```

After deployment:
- Visit `prod-auth.submit.diyaccounting.co.uk/login` — should show only social providers
- Run `synthetic-test.yml` with `skip-cleanup: true` — should show native form, login works
- Run `synthetic-test.yml` normally — native form appears during test, disappears after

---

## 7. Remove redundant custom native auth code

The custom native login form (`login-native-addon.js` + `/api/v1/cognito/native-auth`) was a client-side workaround that bypassed the Hosted UI. Now that `cognito-native` goes through the Hosted UI directly, this code is dead.

**No local dev impact:** proxy uses `TEST_AUTH_PROVIDER=mock`, simulator uses `TEST_AUTH_PROVIDER=simulator`, proxyRunning uses `mock`, test uses `test`. None reference `cognito-native` or any of the files below.

### 7.1 Delete files

| File | Reason |
|------|--------|
| `web/public/auth/login-native-addon.js` | Custom form that injected into login.html — replaced by Hosted UI native form |
| `app/functions/auth/cognitoNativeAuthPost.js` | Express-only endpoint (`POST /api/v1/cognito/native-auth`) that did programmatic `USER_PASSWORD_AUTH` — never deployed as a Lambda, only used locally when `TEST_AUTH_PROVIDER=cognito-native` |

### 7.2 `app/bin/server.js`

**Remove import (line 20):**
```javascript
import { apiEndpoint as cognitoNativeAuthPostApiEndpoint } from "../functions/auth/cognitoNativeAuthPost.js";
```

**Remove conditional addon serving (lines 140-153):**
```javascript
// Conditionally serve native Cognito auth addon script based on environment
app.get("/auth/login-native-addon.js", (req, res) => {
  const authProvider = process.env.TEST_AUTH_PROVIDER;
  if (authProvider === "cognito-native") {
    res.sendFile(path.join(__dirname, "../../web/public/auth/login-native-addon.js"));
  } else {
    res.setHeader("Content-Type", "application/javascript");
    res.send("// Native Cognito auth not available in this environment\n");
  }
});
```

**Remove conditional route registration (lines 172-176):**
```javascript
if (process.env.TEST_AUTH_PROVIDER === "cognito-native") {
  cognitoNativeAuthPostApiEndpoint(app);
  console.log("Native Cognito auth route registered (TEST_AUTH_PROVIDER=cognito-native)");
}
```

### 7.3 `web/public/auth/login.html`

**Remove container div (lines 67-68):**
```html
<!-- Native Cognito auth form injected by login-native-addon.js for behavior tests -->
<div id="native-auth-container"></div>
```

**Remove script tag (line 179):**
```html
<!-- Native Cognito auth addon - returns empty script unless TEST_AUTH_PROVIDER=cognito-native -->
<script src="./login-native-addon.js"></script>
```

### 7.4 `behaviour-tests/steps/behaviour-login-steps.js`

**Remove `fillInNativeAuth` function (lines 203-229)** — interacts with the custom form's `#nativeLoginForm`, `#nativeUsername`, `#nativePassword`, `#showDevOptions` selectors.

**Remove `submitNativeAuth` function (lines 232-240)** — clicks `#loginWithNativeCognito` button on the custom form.

These are replaced by the new `fillInHostedUINativeAuth` and `submitHostedUINativeAuth` functions (see change 3 above).

### 7.5 `infra/main/java/co/uk/diyaccounting/submit/stacks/PublishStack.java`

**Add `login-native-addon.js` to the S3 deployment exclusion list (line 217):**

Current:
```java
.exclude(List.of("auth/loginWithMockCallback.html", "auth/login-mock-addon.js"))
```

Change to:
```java
.exclude(List.of(
    "auth/loginWithMockCallback.html",
    "auth/login-mock-addon.js",
    "auth/login-native-addon.js"))
```

This prevents the deleted file from causing a build error if it still exists locally, and documents that it's intentionally excluded from deployment.

### 7.6 What stays

| Component | Why it stays |
|-----------|-------------|
| `scripts/create-cognito-test-user.js` | Still needed — creates the test user that logs in via Hosted UI |
| `authFlows` (`userPassword`, `userSrp`) in `IdentityStack.java` | Cognito Hosted UI uses these server-side for native auth |
| `cognito-native` branch in `loginWithCognitoOrMockAuth()` | Rewritten (change 3) to go through Hosted UI, not removed |
| `login-mock-addon.js` | Used by proxy/simulator environments |

---

## What This Does NOT Change

- Google federated login — unaffected
- antonycc OIDC provider — unaffected (Phase 4 of PLAN_DISABLE_COGNITO_SIGNUP.md removes it separately)
- Local dev (proxy/simulator) — uses `mock`/`simulator` auth provider, completely unaffected
- `authFlows` on UserPoolClient — `userPassword` and `userSrp` remain enabled for the Hosted UI native form
