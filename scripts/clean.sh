#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# @capability DEV-22 Clean and update local build state
# - **Use when:** local build artefacts, node_modules or dependency versions are stale, or a commit's author needs checking.
# - **Does:** clean.sh removes build output, coverage, CDK synth output and node_modules, then rebuilds the Maven compile and reinstalls npm packages. deep-clean.sh runs clean.sh and then the full npm test suite, and clean-node.sh resets only the Node dependency state. update.sh and update-java.sh refresh npm and Maven dependencies, and check-commit-identities.sh checks a commit author's email against the allow-list.
# - **Run:** `npm run clean`; `bash scripts/deep-clean.sh`; `bash scripts/clean-node.sh`; `bash scripts/update.sh`; `npm run update:java`; `bash scripts/check-commit-identities.sh <base-sha> <head-sha> [allowlist-file]`; `bash scripts/create-favicon.sh <path-to-image>`; `bash scripts/export-files.sh`
# - **Entry:** `scripts/clean.sh`; `scripts/deep-clean.sh`; `scripts/clean-node.sh`; `scripts/update.sh`
# - **Files:** scripts/clean.sh, scripts/deep-clean.sh, scripts/clean-node.sh, scripts/update.sh, scripts/update-java.sh, scripts/check-commit-identities.sh, scripts/create-favicon.sh, scripts/export-files.sh
# - **Keywords:** clean build, deep clean, node_modules reset, dependency update, npm-check-updates, commit identity allowlist, favicon, repository contents
# - **Related:** DEV-26
# @end-capability

rm -rf target ;
rm -rf coverage ;
rm -rvf cdk-submit-environment.out ;
rm -rvf cdk-submit-application.out ;
rm -rvf dependency-reduced-pom.xml ;
rm -rvf hmrc-test-user.json ;
rm -rvf .output.txt
rm -rvf node_modules
./mvnw clean compile -DskipTests ;
npm install ;
git restore web/public/submit.deployment-name.txt web/public/submit.environment-name.txt || true ;
