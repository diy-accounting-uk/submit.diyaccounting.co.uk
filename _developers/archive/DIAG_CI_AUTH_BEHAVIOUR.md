# CI Auth Behaviour Test Diagnostic

**Date**: 2026-01-27
**Branch**: `cleanlogin`
**Status**: Cognito user creation fixed, auth flow failing

---

## Summary

The CI behaviour tests (`authBehaviour-ci`, `submitVatBehaviour-ci`) were failing. We fixed the Cognito test user creation issue, but the authentication flow itself is still failing.

---

## What Was Fixed

### Issue 1: CloudFormation Query Method
- **Symptom**: `Could not find Cognito User Pool ID for environment: ci`
- **Root cause**: Script used `aws cloudformation list-exports` but IdentityStack only creates **outputs**, not **exports**
- **Fix**: Changed to `aws cloudformation describe-stacks` with correct stack name pattern

### Issue 2: AWS CLI Not Available in Playwright Container
- **Symptom**: `aws: command not found` in CI
- **Root cause**: The Playwright Docker container (`mcr.microsoft.com/playwright:v1.59.1-jammy`) doesn't include AWS CLI, pip3, or unzip
- **Fix**: Created `scripts/create-cognito-test-user.js` using AWS SDK (already in npm dependencies)
- **Workflow updated**: `.github/workflows/synthetic-test.yml` now calls Node.js script instead of bash

---

## Current State

### Working
- ✅ Cognito test user creation succeeds in CI
- ✅ User Pool ID correctly retrieved from `ci-env-IdentityStack`
- ✅ Test user created with unique email and password
- ✅ Credentials passed to behaviour test via `$GITHUB_OUTPUT`

### Failing
- ❌ `authBehaviour-ci` test fails at: "The user returns to the home page and sees their logged-in status"
- ❌ Error: `expect(locator).toBeVisible() failed - element(s) not found`

---

## Diagnostic Information

### CloudFormation Stack Outputs (verified working)
```
Stack: ci-env-IdentityStack
Outputs:
  UserPoolId: eu-west-2_XEUH4UnM4
  UserPoolClientId: 655gucii50tuqn4617gm0fd18h
  UserPoolDomainName: ci-auth.submit.diyaccounting.co.uk
  CognitoGoogleIdpId: Google
  CognitoAntonyccIdpId: cognito
```

### Test User Creation (verified working)
```
=== Creating Cognito Test User ===
Environment: ci
AWS Region: eu-west-2
Looking up stack: ci-env-IdentityStack
User Pool ID: eu-west-2_XEUH4UnM4
Creating test user: test-1769481047246-7635f754@test.diyaccounting.co.uk
Setting permanent password...
=== Test User Created Successfully ===
```

### Test Failure Details
```
Test: [authBehaviour] › behaviour-tests/auth.behaviour.test.js:124:1
      › Click through: Cognito Auth
      › The user returns to the home page and sees their logged-in status

Error: expect(locator).toBeVisible() failed
       element(s) not found

Screenshots available in artifacts:
  - test-failed-2.png
  - error-context.md
```

### Environment Configuration
```
.env.ci:
  TEST_AUTH_PROVIDER=cognito-native
  DIY_SUBMIT_BASE_URL=https://ci-submit.diyaccounting.co.uk/
```

---

## Ruled Out

1. **CloudFormation exports vs outputs** - Fixed, using describe-stacks now
2. **AWS CLI availability** - Fixed, using Node.js SDK
3. **ES module syntax** - Fixed, script uses `import` not `require`
4. **Credential passing** - Verified, TEST_AUTH_USERNAME and TEST_AUTH_PASSWORD visible in logs
5. **User Pool existence** - Verified, stack exists with correct outputs
6. **User creation** - Verified, user created successfully with permanent password

---

## Possibilities to Investigate

1. **Cognito User Pool configuration issue**
   - User pool client settings (allowed OAuth flows, callback URLs)
   - App client secret configuration
   - Hosted UI settings

2. **Cognito domain/certificate issue**
   - Domain `ci-auth.submit.diyaccounting.co.uk` SSL certificate status
   - DNS propagation

3. **Test timing issue**
   - Login redirect may not complete in expected time
   - Session cookie not being set

4. **Browser/cookie handling in Playwright container**
   - Third-party cookie blocking
   - Secure cookie requirements

5. **IdentityStack state**
   - User noted they will delete and redeploy ci-env-IdentityStack
   - Fresh deployment may resolve state issues

---

## Next Steps (Planned)

1. Delete `ci-env-IdentityStack`
2. Redeploy environment stacks
3. Run behaviour tests again
4. If still failing, download test artifacts (screenshots, error-context.md) for analysis

---

## Relevant Files

### Scripts
- `scripts/create-cognito-test-user.js` - Node.js version for CI (uses AWS SDK)
- `scripts/create-cognito-test-user.sh` - Bash version for local use (requires AWS CLI)

### Workflow
- `.github/workflows/synthetic-test.yml` - Lines 244-255 (Create Cognito test user step)

### Test
- `behaviour-tests/auth.behaviour.test.js` - Line 124 (failing test)

### Environment
- `.env.ci` - Contains `TEST_AUTH_PROVIDER=cognito-native`

---

## GitHub Actions Runs Referenced

| Run ID | Description | Result |
|--------|-------------|--------|
| 21380992530 | Original failing run | ❌ Cognito user creation failed |
| 21381633097 | Deploy with debug logging | ❌ `aws: command not found` |
| 21381990664 | With pip install attempt | ❌ `pip3: not found` |
| 21382063182 | With apt-get attempt | ❌ Permission issues |
| 21382143787 | With Node.js script (require) | ❌ ES module error |
| 21382207185 | With Node.js script (import) | ✅ User created, ❌ Auth flow failed |

---

## Commands for Debugging

```bash
# Assume deployment role locally
. ./scripts/aws-assume-submit-deployment-role.sh

# Check IdentityStack outputs
aws cloudformation describe-stacks \
  --stack-name ci-env-IdentityStack \
  --query "Stacks[0].Outputs" \
  --output table

# List Cognito users in pool
aws cognito-idp list-users \
  --user-pool-id eu-west-2_XEUH4UnM4 \
  --limit 10

# Check domain status
aws cognito-idp describe-user-pool-domain \
  --domain ci-auth.submit.diyaccounting.co.uk

# Delete IdentityStack (user's planned action)
aws cloudformation delete-stack --stack-name ci-env-IdentityStack
```

---

*Last updated: 2026-01-27 ~02:35 UTC*
