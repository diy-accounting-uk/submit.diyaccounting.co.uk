#!/usr/bin/env bash
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
targetTestReportDir="web/public/tests/test-reports/${targetTest?}/"
mkdir -p "${targetTestDir?}"
mkdir -p "${targetTestReportDir?}"
cp -v "${sourceReport?}" "web/public/tests/test-report-${targetTest?}.json"
cat "web/public/tests/test-report-${targetTest?}.json" | jq '.artifacts.screenshots.[]' --raw-output
# find the full path of each file in web/public/tests/test-report-web-test-local.json
# under the containing directory of sourceReport
# and copy each file to web/public/tests/behaviour-test-results/web-test-local/
cat "web/public/tests/test-report-${targetTest?}.json" \
| jq '.artifacts.screenshots.[]' --raw-output \
| while read -r screenshotFilename; do
  screenshotPath=$(find "${reportDir?}" -name "${screenshotFilename?}" | head -1)
  # fullPath="${reportDir?}/${screenshotPath?}"
  # Strip the volatile part of the file name from the screenshot filename,
  # e.g. 2026-01-04_17-54-34-236753738-10-fill-in-submission-pagedown.png -> 10-fill-in-submission-pagedown.png
  cleanScreenshotFilename=${screenshotFilename##*[0-9][0-9]-}
  echo "Cleaned from ${screenshotFilename?} to ${cleanScreenshotFilename?}"
  cp -v "${screenshotPath?}" "${targetTestDir?}${cleanScreenshotFilename?}"
  # Clean the screenshot name in the report
  sed "${sedInPlace[@]}" "s/${screenshotFilename?}/${cleanScreenshotFilename?}/g" "web/public/tests/test-report-${targetTest?}.json"
done
# If sourceTestName is not the same as targetTest, then replace occurrences of sourceTestName in web/public/tests/test-report-web-test-local.json with targetTest
if [[ "${sourceTestName?}" != "${targetTest?}" ]]; then
  # Replace occurrences of sourceTestName in web/public/tests/test-report-web-test-local.json with targetTest
  sed "${sedInPlace[@]}" "s/${sourceTestName?}/${targetTest?}/g" "web/public/tests/test-report-${targetTest?}.json"
fi
# [local run variant] Copy target/test-reports/html-report (if it exists) to web/public/tests/test-reports/web-test-local
if [[ -d "target/test-reports/html-report" ]]; then
  cp -rv "target/test-reports/html-report" "${targetTestReportDir?}"
# [GitHub Actions run variant] Copy "target/test-reports/${sourceTestName?}/html-report" (if it exists) to web/public/tests/test-reports/web-test-local
elif [[ -d "target/test-reports/${sourceTestName?}/html-report" ]]; then
  cp -rv "target/test-reports/${sourceTestName?}/html-report" "${targetTestReportDir?}"
else
  # The report's own testName (a test's internal testId, e.g. "getVatLiabilities") does not
  # always match the directory the workflow downloaded its html-report artifact into (the
  # matrix suite name, e.g. "getVatLiabilitiesBehaviour" - the basename of sourceReport's
  # directory). Fall back to that directory name.
  reportDirName=$(basename "${reportDir?}")
  if [[ -d "target/test-reports/${reportDirName?}/html-report" ]]; then
    cp -rv "target/test-reports/${reportDirName?}/html-report" "${targetTestReportDir?}"
  fi
fi
