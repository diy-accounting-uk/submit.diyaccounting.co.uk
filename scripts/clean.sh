#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

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
