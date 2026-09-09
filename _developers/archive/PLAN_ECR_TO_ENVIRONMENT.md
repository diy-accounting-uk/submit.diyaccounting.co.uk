<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Move ECR to Environment Level

## User Request
Move the ECR stacks into the environment and consider any other stacks that could shift to environment level.

## Analysis: Which Stacks Can Move?

### Current Application Stacks (per-deployment)

| Stack | Resources | Move to Env? | Reason |
|-------|-----------|:---:|--------|
| **DevStack** (eu-west-2) | ECR repo, log group, IAM role | **YES** | ECR is shared infrastructure — all deployments use the same images tagged by commit SHA |
| **DevStack** (us-east-1) | ECR repo (edge), log group, IAM role | **YES** | Same rationale |
| AuthStack | Lambda functions (cognitoToken, customAuthorizer) | No | Per-deployment config (Cognito pool, client ID) |
| HmrcStack | Lambda functions (HMRC API) | No | Per-deployment config (HMRC credentials, base URI) |
| AccountStack | Lambda functions (bundle, pass, etc.) | No | Per-deployment config (Cognito pool ARN) |
| BillingStack | Lambda functions (Stripe) | No | Per-deployment config (Stripe keys, price IDs) |
| ApiStack | API Gateway v2, routes, authorizers | No | Per-deployment domain, references per-deployment Lambdas |
| OpsStack | Dashboards, alarms, Telegram forwarder | No | References per-deployment Lambdas and metrics |
| EdgeStack | CloudFront, S3 origin, Route53 | No | Per-deployment domain and certificate |
| PublishStack | BucketDeployment | No | Per-deployment content (commit hash, website hash) |
| SelfDestructStack | Scheduled self-destruct Lambda | No | Per-deployment by definition |

**Conclusion: Only DevStack (ECR) should move.** Every other application stack contains per-deployment Lambda functions or domain-specific configuration. ECR is the only genuinely shared resource — all deployments in an environment pull images from the same Docker registry, tagged by commit SHA.

### Why ECR Belongs at Environment Level

1. **Shared resource**: All deployments use images from the same git repo, tagged by SHA
2. **Survives deployment teardown**: Destroying a feature branch deployment shouldn't delete Docker images that other deployments might reference
3. **Reduces critical path**: Removes `deploy-dev` + `deploy-dev-ue1` (~3 min) from `deploy.yml` — ECR already exists from `deploy-environment.yml`
4. **Cleaner separation**: DevStack exists solely for ECR; moving it eliminates an otherwise-empty stack

## Naming Change

| | Current (per-deployment) | Proposed (per-environment) |
|---|---|---|
| Stack ID | `{deployment}-app-DevStack` | `{env}-env-EcrStack` |
| ECR repo (eu-west-2) | `{deployment}-app-ecr` | `{env}-env-ecr` |
| ECR repo (us-east-1) | `{deployment}-app-ecr-us-east-1` | `{env}-env-ecr-us-east-1` |
| Log group | `/aws/ecr/{deployment}-app` | `/aws/ecr/{env}-env` |
| IAM role | `{deployment}-app-ecr-publish-role` | `{env}-env-ecr-publish-role` |

Example: `ci-cleanlogin-app-ecr` → `ci-env-ecr`

## Implementation Steps

### Phase 1: CDK Code Changes

1. **Create `EcrStack.java`** — new environment-level stack (rename/move from DevStack)
   - Same resources as DevStack: ECR repo, log group, IAM role
   - Uses `envResourceNamePrefix` instead of `appResourceNamePrefix`
   - Two instances: eu-west-2 and us-east-1 (same dual-region pattern)

2. **Update `SubmitSharedNames.java`**
   - Move ECR naming fields from `appResourceNamePrefix` to `envResourceNamePrefix`
   - `ecrRepositoryName = "{env}-env-ecr"` (was `"{deployment}-app-ecr"`)
   - Add `ecrStackId` and `ue1EcrStackId` to env section

3. **Update `SubmitEnvironment.java`**
   - Add `EcrStack` (eu-west-2) and `EcrStack` (us-east-1) instantiation
   - No new props needed — ECR doesn't need external configuration

4. **Update `SubmitApplication.java`**
   - Remove DevStack instantiation (both regions)
   - Remove DevStack fields and imports
   - Lambda stacks continue to reference ECR via `SubmitSharedNames` (no change needed — they use string ARNs, not cross-stack refs)

5. **Delete `DevStack.java`** — fully replaced by EcrStack

### Phase 2: Workflow Changes

6. **Update `deploy-environment.yml`**
   - Add `deploy-ecr` job (eu-west-2) — calls `deploy-cdk-stack.yml` with `cdk-application: 'environment'`
   - Add `deploy-ecr-ue1` job (us-east-1) — same pattern
   - Add `DevStack.java` → `EcrStack.java` to the `paths:` trigger list
   - Both can run in parallel with existing env stacks (no dependencies)

7. **Update `deploy.yml`**
   - Remove `deploy-dev` and `deploy-dev-ue1` jobs
   - `push-images` job: change ECR repo name from `{deployment}-app-ecr` to `{env}-env-ecr`
   - `push-images` no longer needs `deploy-dev` — ECR repo already exists from environment deploy
   - `push-images` may need to depend on `names` only (or a lightweight ECR existence check)

8. **Update `deploy-cdk-stack.yml`** (if needed)
   - No changes expected — it already handles both `application` and `environment` CDK apps

### Phase 3: Migration

9. **Existing ECR repos**: The old `{deployment}-app-ecr` repos will become orphaned CloudFormation resources when DevStack is removed from the application
   - Option A: Let CloudFormation delete them (since `RemovalPolicy.DESTROY` + `emptyOnDelete: true`)
   - Option B: Manually clean up after verifying new repos work
   - Recommendation: Option A — the removal policy handles it cleanly

10. **First deploy order**:
    - Deploy environment stacks first (creates new `{env}-env-ecr` repos)
    - Then deploy application stacks (DevStack deletion removes old repos)
    - Then push images to new repos
    - GitHub Actions natural ordering handles this: `deploy-environment.yml` runs on environment file changes, `deploy.yml` runs on application code changes

## Files Changed

| File | Change |
|------|--------|
| `infra/main/java/.../stacks/EcrStack.java` | **NEW** — environment-level ECR stack (from DevStack) |
| `infra/main/java/.../stacks/DevStack.java` | **DELETE** |
| `infra/main/java/.../SubmitSharedNames.java` | Move ECR names to env prefix section |
| `infra/main/java/.../SubmitEnvironment.java` | Add EcrStack instantiation (both regions) |
| `infra/main/java/.../SubmitApplication.java` | Remove DevStack instantiation |
| `.github/workflows/deploy-environment.yml` | Add deploy-ecr + deploy-ecr-ue1 jobs |
| `.github/workflows/deploy.yml` | Remove deploy-dev jobs, update push-images ECR names |
| `cdk-environment/cdk.json` | May need output file config (verify) |

## Risk Assessment

- **Low risk**: Lambda stacks reference ECR by string ARN from SubmitSharedNames, not cross-stack CloudFormation refs. Changing the naming pattern just changes the string.
- **Medium risk**: First deployment needs environment stacks deployed before application stacks. GitHub Actions workflow ordering handles this naturally, but manual intervention may be needed for the initial migration.
- **Rollback**: If the new ECR repos don't work, re-add DevStack to the application. The old repos will be recreated by CloudFormation.

## Verification

1. `./mvnw clean verify` — CDK synth succeeds for both apps
2. `npm test` — unit tests pass
3. Push to feature branch → `deploy-environment.yml` creates ECR repos
4. Push triggers `deploy.yml` → images push to new repos → Lambda stacks deploy
5. Behaviour tests pass against CI
