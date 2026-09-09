#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

echo '.github/workflows/deploy.yml' > repository-contents.txt
echo '.github/workflows/deploy-environment.yml' >> repository-contents.txt
echo '.github/workflows/set-origins.yml' >> repository-contents.txt
echo '.github/workflows/test.yml' >> repository-contents.txt
echo '.github/actions/scale-to/action.yml' >> repository-contents.txt
echo '.github/actions/set-origins/action.yml' >> repository-contents.txt
echo '.github/actions/get-names/action.yml' >> repository-contents.txt
find . -type f | grep -v '.env\|.DS_Store\|.git\|.idea\|.junie\|.mvn\|.run\|target\|_developers\|coverage\|node_modules\|prompts\|.png\|web.iml\|hmrc-test-user.json\|package-lock.json' \
  >> repository-contents.txt \
;
