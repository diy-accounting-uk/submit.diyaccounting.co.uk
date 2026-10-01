#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Runs the gates CI runs, in a clean detached worktree of one ref, so a local pass means a CI pass.
#
#   scripts/batch-check.sh <ref> [--docker]
#
# Gates, serially, all run even after a failure: bundle, maven verify, npm test, mcp test, browser tests,
# prettier, spotless, the two eslint ratchets, eslint on added files, and the docker build.
# The docker build runs when the ref changes Dockerfile, .dockerignore or a path the Dockerfile
# COPYs from the build context, or when --docker is given.
# Output: one PASS/FAIL/SKIP line per gate on stdout; each gate's full output in the log directory.

# shellcheck disable=SC2329
set -u

usage() {
  echo "usage: scripts/batch-check.sh <ref> [--docker]" >&2
  exit 2
}

ref=""
force_docker=0
for arg in "$@"; do
  case "$arg" in
    --docker) force_docker=1 ;;
    -*) usage ;;
    *)
      [ -z "$ref" ] || usage
      ref="$arg"
      ;;
  esac
done
[ -n "$ref" ] || usage

sha=$(git rev-parse --verify "${ref}^{commit}") || exit 2
short=$(git rev-parse --short "$sha")
common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
main_checkout=$(dirname "$common_dir")
if [ ! -d "$main_checkout/node_modules" ]; then
  echo "no node_modules in the main checkout ($main_checkout); run npm ci there first" >&2
  exit 2
fi

tmp_root=${TMPDIR:-/tmp}
tmp_root=${tmp_root%/}
work="$tmp_root/batch-check-$short"
suffix=1
while [ -e "$work" ]; do
  suffix=$((suffix + 1))
  work="$tmp_root/batch-check-$short-$suffix"
done
logdir="$work-logs"
mkdir -p "$logdir"

git worktree add --detach "$work" "$sha" >"$logdir/setup.log" 2>&1 || {
  echo "FAIL setup (0s) log=$logdir/setup.log"
  exit 1
}
ln -sfn "$main_checkout/node_modules" "$work/node_modules"
if [ -d "$main_checkout/mcp/node_modules" ]; then
  ln -sfn "$main_checkout/mcp/node_modules" "$work/mcp/node_modules"
fi

echo "ref=$ref sha=$sha"
echo "worktree=$work"
echo "logs=$logdir"

failed=0

run_gate() {
  gate_name=$1
  shift
  gate_log="$logdir/$gate_name.log"
  gate_start=$(date +%s)
  (cd "$work" && "$@") >"$gate_log" 2>&1
  gate_status=$?
  if [ "$gate_status" -eq 0 ]; then
    echo "PASS $gate_name ($(($(date +%s) - gate_start))s)"
  else
    echo "FAIL $gate_name ($(($(date +%s) - gate_start))s) log=$gate_log"
    failed=1
  fi
}

skip_gate() {
  echo "SKIP $1 ($2)"
}

gate_eslint_repo_ratchet() {
  npx eslint . --format json >"$logdir/eslint.json"
  eslint_exit=$?
  if [ "$eslint_exit" -ge 2 ]; then
    echo "eslint could not run (exit $eslint_exit)"
    return 1
  fi
  current_errors=$(jq '[.[].messages[] | select(.severity == 2) | select(.ruleId | startswith("no-unsanitized/") | not)] | length' "$logdir/eslint.json")
  baseline_errors=$(jq '.errors' .eslint-baseline.json)
  echo "baseline errors=$baseline_errors current errors=$current_errors"
  [ "$current_errors" -le "$baseline_errors" ]
}

gate_eslint_unsanitized_ratchet() {
  current_errors=$(jq '[.[].messages[] | select(.severity == 2) | select(.ruleId | startswith("no-unsanitized/"))] | length' "$logdir/eslint.json")
  baseline_errors=$(jq '.unsanitizedErrors' .eslint-baseline.json)
  echo "baseline unsanitized errors=$baseline_errors current unsanitized errors=$current_errors"
  [ "$current_errors" -le "$baseline_errors" ]
}

gate_eslint_added_files() {
  base=$(git merge-base origin/main HEAD || true)
  if [ -z "$base" ]; then
    echo "no merge base against origin/main; nothing to gate"
    return 0
  fi
  added=$(git diff --name-only --diff-filter=A "$base" HEAD -- '*.js' '*.mjs' '*.cjs')
  if [ -z "$added" ]; then
    echo "no JavaScript file added; nothing to gate"
    return 0
  fi
  echo "$added"
  echo "$added" | xargs npx eslint
}

gate_docker_build() {
  docker buildx build \
    --platform linux/arm64 \
    --provenance=false \
    --load \
    -t "batch-check:$short" \
    -f Dockerfile .
}

docker_trigger() {
  if [ "$force_docker" -eq 1 ]; then
    echo "--docker given"
    return 0
  fi
  changed=$(git diff --name-only "origin/main...$sha")
  [ -n "$changed" ] || return 1
  copy_sources=$(git show "$sha:Dockerfile" | awk '
    toupper($1) == "COPY" {
      if ($0 ~ /--from=/) next
      n = 0
      for (i = 2; i <= NF; i++) if ($i !~ /^--/) { n++; args[n] = $i }
      for (i = 1; i < n; i++) print args[i]
    }')
  watched=$(printf 'Dockerfile\n.dockerignore\n%s\n' "$copy_sources")
  for path in $watched; do
    path=${path%/}
    [ "$path" = "." ] && {
      echo "Dockerfile copies the whole context"
      return 0
    }
    if echo "$changed" | grep -q -x -F "$path" || echo "$changed" | grep -q -F "$path/"; then
      echo "change touches $path"
      return 0
    fi
  done
  return 1
}

run_gate bundle npm run bundle
run_gate maven-verify ./mvnw clean verify
run_gate npm-test npm test
if [ -d "$work/mcp/node_modules" ]; then
  run_gate mcp-test sh -c 'cd mcp && npx vitest run'
else
  echo "FAIL mcp-test (0s) log=none, no mcp/node_modules in the main checkout; run npm ci in mcp/ there"
  failed=1
fi
run_gate browser-tests npm run test:browser
run_gate prettier npx prettier --check .
run_gate spotless ./mvnw spotless:check
run_gate eslint-repo-ratchet gate_eslint_repo_ratchet
run_gate eslint-unsanitized-ratchet gate_eslint_unsanitized_ratchet
run_gate eslint-added-files gate_eslint_added_files

if docker_reason=$(docker_trigger); then
  if docker info >/dev/null 2>&1; then
    echo "docker build: $docker_reason"
    run_gate docker-build gate_docker_build
  else
    echo "FAIL docker-build (0s) log=none, docker is not running"
    failed=1
  fi
else
  skip_gate docker-build "Dockerfile, .dockerignore and its COPY sources are unchanged against origin/main"
fi

echo "logs: $logdir"
echo "remove the worktree: git worktree remove --force $work"
exit "$failed"
