# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# remove Maven's build outputs and cached resolution
rm -rf target
rm -rf cdk-submit-environment.out
rm -rf cdk-submit-application.out
rm -rf ~/.m2/repository/

# clean + resolve dependencies fresh
mvn clean
mvn versions:display-dependency-updates

# update to latest *minor* versions allowed by your pom
mvn versions:use-latest-releases -DprocessPlugins=true -DprocessDependencies=false -DprocessParent=false -DallowMajorUpdates=true -DgenerateBackupPoms=false
mvn versions:use-latest-releases -DprocessPlugins=false -DprocessDependencies=true -DprocessParent=false -DallowMajorUpdates=true -DgenerateBackupPoms=false
mvn versions:use-latest-releases -DprocessPlugins=false -DprocessDependencies=false -DprocessParent=true -DallowMajorUpdates=true -DgenerateBackupPoms=false

# update transitive dependencies
mvn versions:use-latest-releases -DgenerateBackupPoms=false

# install dependencies freshly
mvn dependency:resolve

# build the project
mvn install

# "npm link" equivalent = install to local repo so other projects can depend on it
mvn install

# display any remaining updates
mvn versions:display-dependency-updates -DincludeSnapshots=false | grep -Ev 'alpha|beta|rc|cr|M[0-9]+' || true

git restore web/public/submit.deployment-name.txt web/public/submit.environment-name.txt || true
