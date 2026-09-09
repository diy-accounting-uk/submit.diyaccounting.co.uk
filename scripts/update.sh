#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/update.sh
# Usage: ./scripts/update.sh
#
# This file is part of the Example Suite for `agentic-lib` see: https://github.com/xn-intenton-z2a/agentic-lib
# This file is licensed under the MIT License. For details, see LICENSE-MIT
#

rm -f package-lock.json
rm -rf node-modules
rm -rf cdk-submit-environment.out
rm -rf cdk-submit-application.out
npm install
npm run update-to-greatest
npm update
npm upgrade
npm install
npm run build
npm link
git restore web/public/submit.deployment-name.txt web/public/submit.environment-name.txt || true
