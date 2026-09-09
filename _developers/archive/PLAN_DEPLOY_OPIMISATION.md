<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Deploy Pipeline Optimisation

**Created**: 26 February 2026
**Status**: In progress — 2.2 (Docker layer caching), 1.1 (JAR as artifact), 1.2 (QEMU removal) implemented

---

## User Question (original)

> Examine where we are running `./mvnw --errors clean verify` after we just had a step for `Cache Maven build output` using `actions/cache@v4` — can we rely on the cache more for maven artefacts? (Also similarly in `deploy-cdk-stack.yml`)

---

## Current State: What Takes So Long?

A full `deploy.yml` run typically takes **15-25 minutes**. The critical path is:

```
params (10s) → names (30s) → docker-build (5-10min)
  → push-images (1-3min) → deploy stacks (3-5min each, partially parallel)
    → deploy-api → deploy-edge → deploy-publish
      → set-origins → 13 parallel synthetic tests → disable-native-auth → set-last-known-good
```

The **longest single step** is usually the Docker ARM64 cross-compile (~5-10min), followed by CDK stack deployments (~3-5min each with CloudFormation waits).

### Existing Optimisations Already In Place

| Optimisation | Where | Effect |
|-------------|-------|--------|
| npm cache | `setup-node` with `cache: 'npm'` | Saves ~30s per job |
| Maven dependency cache | `setup-java` with `cache: 'maven'` | Saves ~1min per job |
| `target/` directory cache | `actions/cache@v4` in deploy-cdk-stack, deploy-api, deploy-publish | Avoids re-compilation when source unchanged |
| ECR image existence check | docker push jobs | Skips push if sha-tagged image exists |
| Web asset hash comparison | PublishStack | Skips CDK deploy if web assets unchanged |
| Stack existence check | deploy-cdk-stack.yml | Skips CDK deploy if stack already at target state |
| Docker multi-stage builder | Dockerfile | Builder runs natively (no QEMU for npm install) |
| `$BUILDPLATFORM` in Dockerfile | Stage 1 | npm install runs on x86_64, only final stage is ARM64 |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | Jobs that don't need browsers | Saves ~30s per job |
| CDK `--concurrency 4 --asset-parallelism` | deploy-cdk-stack.yml | Parallel CDK operations |

---

## Analysis: Where Maven Runs Today

### The core question: redundant `./mvnw clean verify`

The `target/` directory cache is keyed by:
```
maven-target-${{ hashFiles('infra/main/java/**', 'infra/main/resources/**', 'pom.xml') }}
```

In `deploy-cdk-stack.yml`, the cache is restored and then:
```bash
if [ ! -f target/submit-application.jar ]; then
  ./mvnw --errors clean verify -DskipTests -P cdk-application
fi
```

This means: if the cache hit restored the JAR, **Maven is skipped**. The cache works correctly.

**However**, there are two inefficiencies:

1. **Each parallel CDK stack job gets its own runner** — AuthStack, HmrcStack, AccountStack, BillingStack all invoke `deploy-cdk-stack.yml` as separate `workflow_call` jobs. Each must:
   - Checkout the repo (~10s)
   - Set up Node + Java (~20s)
   - Download + restore the `target/` cache (~15-30s)
   - Check if JAR exists (cache hit → skip Maven; cache miss → 3-5min Maven)

   The cache download overhead per job is ~15-30s. With 4-5 parallel CDK stack jobs, that's 4-5 runners each spending 30-60s on setup before they even start CDK.

2. **`mvn-package` in deploy.yml runs Maven separately from Docker build** — `mvn-package` produces the CDK JAR, but the Docker build only needs `npm ci` (no Java). These run in parallel which is correct, but `mvn-package` is a separate job whose output goes into the cache, creating a dependency: CDK stack jobs wait for the cache to be populated.

3. **`deploy-api` and `deploy-publish` are inline jobs** (not using `deploy-cdk-stack.yml`) — they have their own Maven cache restore + conditional build, duplicating the pattern.

### Where `./mvnw` runs in the full pipeline

| Job | Maven command | Cache? | When needed? |
|-----|-------------|--------|-------------|
| `test.yml` → `mvn-test` | `./mvnw clean test` | setup-java cache | Always (tests) |
| `test.yml` → `npm-test-cdk-ci` | `./mvnw clean verify -DskipTests` | setup-java cache | Always (CDK synth) |
| `test.yml` → `npm-test-cdk-prod` | `./mvnw clean verify -DskipTests` | setup-java cache | Always (CDK synth) |
| `deploy.yml` → `mvn-package` | `./mvnw clean verify -DskipTests -P cdk-all` | target/ cache (save) | Once per deploy |
| `deploy-cdk-stack.yml` (×5) | `./mvnw clean verify -DskipTests -P cdk-application` | target/ cache (restore) | Only on cache miss |
| `deploy.yml` → `deploy-api` | `./mvnw clean verify -DskipTests -P cdk-application` | target/ cache (restore) | Only on cache miss |
| `deploy.yml` → `deploy-publish` | `./mvnw clean verify -DskipTests -P cdk-application` | target/ cache (restore) | Only on cache miss |
| `deploy-environment.yml` (×9) | `./mvnw clean verify -DskipTests -P cdk-environment` | target/ cache (restore) | Only on cache miss |

**On cache hit**: Maven runs 3 times total (test, cdk-ci synth, cdk-prod synth). CDK stacks skip Maven.
**On cache miss**: Maven runs 3 + 7 = 10 times (test + mvn-package + 5 CDK stacks + deploy-api + deploy-publish). Each cache-miss run takes 3-5min.

---

## Proposed Optimisations

### Phase 1: Quick Wins (Low Risk)

#### 1.1 Upload Maven JAR as artifact instead of cache — DONE

**Problem**: Each CDK stack job downloads the full `target/` cache independently.
**Solution**: `mvn-package` job saves only `target/submit-application.jar` as a GitHub Actions artifact. CDK stack jobs download this small artifact (~20MB) instead of the full `target/` cache (~100MB+).

**Benefit**: Faster artifact download, no cache miss risk, explicit dependency chain.
**Risk**: Low — artifact upload/download is a well-established pattern.

```yaml
# In mvn-package job
- uses: actions/upload-artifact@v4
  with:
    name: cdk-jars
    path: |
      target/submit-application.jar
      target/submit-environment.jar

# In deploy-cdk-stack.yml
- uses: actions/download-artifact@v4
  with:
    name: cdk-jars
    path: target/
# Remove the conditional Maven build entirely
```

#### 1.2 Skip QEMU setup in deploy.yml docker-build — DONE

**Problem**: `docker/setup-qemu-action@v3` takes ~30s and is only needed if running the ARM64 image locally.
**Current usage**: `docker buildx build --platform linux/arm64 --load` — this uses QEMU for the final stage (the Lambda base image is ARM64), but the builder stage uses `$BUILDPLATFORM`.
**Check needed**: Verify if `--load` actually requires QEMU or if buildx can do cross-compile without it. If QEMU is required for `--load`, this optimisation doesn't apply.

**Benefit**: ~30s saved on docker-build job.
**Risk**: Low — test by removing and verifying build still succeeds.

#### 1.3 Combine deploy-api and deploy-publish Maven restore

**Problem**: Both inline jobs independently restore the Maven cache and conditionally run Maven.
**Solution**: These run sequentially (publish depends on api). Pass the JAR via the same artifact mechanism as 1.1.

**Benefit**: Eliminates one redundant cache restore (~15-30s).

### Phase 2: Structural Improvements (Medium Risk)

#### 2.1 Shared CDK deploy job with matrix strategy

**Problem**: 5 separate CDK stack deploy jobs each invoke `deploy-cdk-stack.yml`, creating 5 runners with identical setup overhead.
**Solution**: Use a matrix strategy in a single job that deploys stacks sequentially within one runner, or group independent stacks.

```yaml
deploy-parallel-stacks:
  strategy:
    matrix:
      stack: [AuthStack, HmrcStack, AccountStack, BillingStack]
  steps:
    - uses: actions/download-artifact@v4  # JAR from mvn-package
    - run: cdk deploy ${{ matrix.stack }}
```

**Trade-off**: Matrix still creates separate runners (same as today). The real gain would be deploying multiple stacks from one runner, but CDK already handles this with `--concurrency`.

**Alternative**: Single job that deploys all 4 independent stacks with `cdk deploy AuthStack HmrcStack AccountStack BillingStack --concurrency 4`. This uses one runner instead of four.

**Benefit**: Saves 3 runner setup costs (~3 × 45s = ~2min).
**Risk**: Medium — if one stack fails, the whole job fails (need error handling per stack).

#### 2.2 Docker layer caching — DONE

**Problem**: Docker ARM64 build takes 5-10min, even when only application code changed.
**Solution**: Added `--cache-from type=gha --cache-to type=gha,mode=max` to `docker buildx build` in both `deploy.yml` and `deploy-app.yml`.

**Benefit**: On code-only changes (no dependency changes), Docker build drops to ~1-2min.
**Risk**: Low — standard buildx cache pattern. GHA cache is limited to 10GB total.

#### 2.3 Skip test.yml CDK synth when only web/app changes

**Problem**: `npm-test-cdk-ci` and `npm-test-cdk-prod` run `./mvnw clean verify` + `cdk synth` on every push, even when only JavaScript changed.
**Solution**: Add path filtering to skip CDK synth jobs when `infra/**` and `pom.xml` are unchanged.

**Benefit**: Saves ~5-8min on test.yml for JS-only changes.
**Risk**: Low — CDK synth is already verified in the deploy pipeline.

### Phase 3: Lean Deploy for App-Only Changes (Higher Impact)

#### 3.1 Automatic lean deploy detection

**Problem**: Full CDK deploy takes 15-25min even when only `app/` or `web/public/` changed (no infrastructure changes).
**Solution**: In `deploy.yml`, detect if `infra/**` or `pom.xml` changed. If not, skip CDK entirely and use the lean deploy path (update Lambda images + S3 sync + CloudFront invalidation).

```yaml
detect-changes:
  outputs:
    infra-changed: ${{ steps.changes.outputs.infra }}
    app-changed: ${{ steps.changes.outputs.app }}
    web-changed: ${{ steps.changes.outputs.web }}
  steps:
    - uses: dorny/paths-filter@v3
      id: changes
      with:
        filters: |
          infra: ['infra/**', 'pom.xml', 'cdk-*/**']
          app: ['app/**', 'Dockerfile', 'package.json']
          web: ['web/public/**']
```

When only `app/` and/or `web/` changed:
1. Build Docker image + push to ECR (same as today)
2. Update Lambda image URIs directly (no CDK)
3. S3 sync web assets (no CDK)
4. CloudFront invalidation
5. Run synthetic tests

**Benefit**: ~5-8min for app-only changes (vs 15-25min full deploy).
**Risk**: Medium — creates CloudFormation drift (reconciled on next infra change). Already accepted pattern per `deploy-app.js` lean deploy script.

#### 3.2 Parallel ECR push (both regions in one job)

**Problem**: Two separate push jobs (eu-west-2 and us-east-1) each download the Docker artifact and push independently.
**Solution**: Single job that pushes to both regions in parallel using `&` background processes.

**Benefit**: Saves one artifact download (~30s) + one runner setup (~30s).
**Risk**: Low.

---

## Priority Matrix

| # | Optimisation | Effort | Benefit | Risk | Status |
|---|-------------|--------|---------|------|--------|
| 1.1 | JAR as artifact | Low | Medium (~1-2min per deploy) | Low | **DONE** |
| 1.2 | Skip QEMU | Low | Low (~30s) | Low | **DONE** |
| 2.2 | Docker layer caching | Low | High (~3-8min on code-only changes) | Low | **DONE** |
| 2.3 | Skip CDK synth for JS changes | Medium | Medium (~5min on test.yml) | Medium | Deferred (test.yml called from deploy.yml via workflow_call) |
| 3.1 | Auto lean deploy | Medium | High (~10min for app-only) | Medium | Open |
| 2.1 | Consolidated CDK deploy | Medium | Medium (~2min) | Medium | Open |
| 3.2 | Parallel ECR push | Low | Low (~1min) | Low | Open |
| 1.3 | Combine api/publish Maven | Low | Low (~30s) | Low | Superseded by 1.1 |

**Implemented**: 2.2 (Docker layer caching) + 1.1 (JAR as artifact) + 1.2 (QEMU removal)
**Next recommended**: 3.1 (auto lean deploy) → 2.1 (consolidated CDK deploy)

Docker layer caching (2.2) gives the highest ROI with lowest effort. The auto lean deploy (3.1) gives the most dramatic improvement for the most common case (app-only changes).

---

## Not Proposed (Considered and Rejected)

| Idea | Why rejected |
|------|-------------|
| Self-hosted runners | Maintenance burden, security risk, not worth it for this scale |
| Merge all CDK stacks into one | Architectural regression — separate stacks enable independent deployment |
| Skip CloudFront invalidation wait | Invalidation is fast (~30s) and needed for test correctness |
| Pre-built Docker base image | NPM dependencies change frequently enough that layer caching is sufficient |
| Nix/devbox build caching | Over-engineering for this project size |

---

*Created 26 February 2026. Based on analysis of all 24 GitHub Actions workflows, CDK infrastructure, Docker build process, and lean deploy script.*
