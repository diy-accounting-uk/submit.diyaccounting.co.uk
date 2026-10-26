#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Usage: ./scripts/publish-web-test-local.sh <sourceReport> <targetTest>
# e.g. ./scripts/publish-web-test-local.sh target/behaviour-test-results/test-report-submitVatBehaviour.json 'web-test-local'
sourceReport="${1?Missing sourceReport argument}"
sourceTestName=$(jq -r '.testName' "${sourceReport?}")
reportDir=$(dirname "${sourceReport?}")
targetTest="${2-'web-test-local'}"

# Determine sed in-place flag: macOS (BSD) requires -i '', GNU sed (Linux) uses -i
if sed --version >/dev/null 2>&1; then
  sedInPlace=(-i)
else
  sedInPlace=(-i '')
fi

targetTestDir="web/public/tests/behaviour-test-results/${targetTest?}/"
mkdir -p "${targetTestDir?}"
cp -v "${sourceReport?}" "web/public/tests/test-report-${targetTest?}.json"
targetReport="web/public/tests/test-report-${targetTest?}.json"
# Each screenshot and video the report names is copied under a flat name into the target directory,
# and the report is rewritten to those names. A file that cannot be found is dropped from the
# report, so the page lists only files that are published.
# The report names a screenshot as a flat file name or as a path below the report directory,
# e.g. screenshots/behaviour-helpers/2026-01-04_17-54-34-236753738-10-fill-in-submission-pagedown.png.
# The published name joins the directories with "-" and drops the volatile timestamp:
# screenshots-behaviour-helpers-10-fill-in-submission-pagedown.png
renameMap='{}'
missing='[]'
publish_artifact() {
  local reportedName="${1?}"
  local sourcePath="${reportDir?}/${reportedName?}"
  if [[ ! -f "${sourcePath?}" ]]; then
    sourcePath=$(find "${reportDir?}" -name "$(basename "${reportedName?}")" | head -1)
  fi
  if [[ -z "${sourcePath}" || ! -f "${sourcePath?}" ]]; then
    echo "Not found, dropped from the report: ${reportedName?}"
    missing=$(jq -c --arg n "${reportedName?}" '. + [$n]' <<<"${missing?}")
    return
  fi
  local publishedName
  publishedName=$(echo "${reportedName?}" | tr '/' '-' | sed -E 's/(^|-)[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]+-/\1/')
  if [[ -e "${targetTestDir?}${publishedName?}" ]]; then
    publishedName=$(echo "${reportedName?}" | tr '/' '-')
  fi
  echo "Published ${reportedName?} as ${publishedName?}"
  cp -v "${sourcePath?}" "${targetTestDir?}${publishedName?}"
  renameMap=$(jq -c --arg o "${reportedName?}" --arg n "${publishedName?}" '. + {($o): $n}' <<<"${renameMap?}")
}
while read -r artifactName; do
  publish_artifact "${artifactName?}"
done < <(jq -r '(.artifacts.screenshots // [])[], (.artifacts.videos // [])[]' "${targetReport?}")
jq --argjson map "${renameMap?}" --argjson missing "${missing?}" '
  def renamed: if type == "string" and $map[.] != null then $map[.] else . end;
  if .artifacts == null then . else
    .artifacts.screenshots = [(.artifacts.screenshots // [])[] | select(. as $n | $missing | index($n) | not) | renamed]
    | .artifacts.videos = [(.artifacts.videos // [])[] | select(. as $n | $missing | index($n) | not) | renamed]
    | (if .artifacts.figures then .artifacts.figures |= [.[] | select(.filename as $n | $missing | index($n) | not) | (.filename |= renamed)] else . end)
  end' "${targetReport?}" >"${targetReport?}.tmp" && mv "${targetReport?}.tmp" "${targetReport?}"
# The fraud-prevention headers carry the machine's real public IP; the report is published, so
# swap every IPv4 on those header lines for a documentation address (RFC 5737).
sed -E "${sedInPlace[@]}" '/Public-IP|Forwarded/ s/([0-9]{1,3}\.){3}[0-9]{1,3}/198.51.100.10/g' "web/public/tests/test-report-${targetTest?}.json"
# If sourceTestName is not the same as targetTest, then replace occurrences of sourceTestName in web/public/tests/test-report-web-test-local.json with targetTest
if [[ "${sourceTestName?}" != "${targetTest?}" ]]; then
  # Replace occurrences of sourceTestName in web/public/tests/test-report-web-test-local.json with targetTest
  sed "${sedInPlace[@]}" "s/${sourceTestName?}/${targetTest?}/g" "web/public/tests/test-report-${targetTest?}.json"
fi
# The tests index page lists the published reports from this file, one report file name per line.
(cd web/public/tests && ls test-report-*.json | sort) > web/public/tests/test-reports-index.txt
