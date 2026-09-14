#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited
# Poll GitHub Actions for main plus every open PR's head branch. Emit each red once, each
# PR's merge-readiness once per head, and one tally when everything in scope is terminal.
# bash 3.2: no associative arrays; state lives in files under $1.
set -uo pipefail
STATE_DIR="${1:-target/watch-ci}"
mkdir -p "$STATE_DIR"
SEEN="$STATE_DIR/seen"          # one "<runid> <conclusion>" per line already reported
READY="$STATE_DIR/ready"        # one "<pr> <headsha>" per line already reported
touch "$SEEN" "$READY"

scope() {
  { echo main; gh pr list --state open --limit 50 --json headRefName --jq '.[].headRefName' 2>/dev/null; } | sort -u
}

latest_runs() { # branch -> json array of latest run per workflow
  gh run list --branch "$1" --limit 60 --json workflowName,status,conclusion,databaseId,headSha 2>/dev/null \
    | jq -c 'group_by(.workflowName) | map(max_by(.databaseId))' 2>/dev/null
}

cycle=0
empty=0
while true; do
  cycle=$((cycle + 1))
  total=0; running=0; red=0
  for branch in $(scope); do
    runs=$(latest_runs "$branch")
    [ -z "$runs" ] && continue
    n=$(echo "$runs" | jq 'length')
    total=$((total + n))
    running=$((running + $(echo "$runs" | jq '[.[] | select(.status != "completed")] | length')))
    echo "$runs" | jq -r '.[] | select(.status == "completed" and (.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "action_required" or .conclusion == "startup_failure")) | "\(.databaseId) \(.conclusion) \(.workflowName)"' \
    | while read -r id concl wf; do
        [ -z "$id" ] && continue

        if ! grep -q "^$id " "$SEEN"; then
          echo "$id $concl" >> "$SEEN"
          [ "$cycle" -gt 1 ] && echo "RED $branch $wf run $id ($concl)"
        fi
      done
    red=$((red + $(echo "$runs" | jq '[.[] | select(.status == "completed" and (.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "action_required" or .conclusion == "startup_failure"))] | length')))
  done
  if [ "$total" -eq 0 ]; then
    empty=$((empty + 1))
    [ "$empty" -ge 3 ] && { echo "NO DATA after $empty cycles"; exit 1; }
  else
    empty=0
  fi
  # merge-readiness, once per PR per head sha
  gh pr list --state open --limit 50 --json number,headRefName,headRefOid,isDraft --jq '.[] | select(.isDraft | not) | "\(.number) \(.headRefName) \(.headRefOid)"' 2>/dev/null \
  | while read -r num br sha; do
      [ -z "$num" ] && continue
      runs=$(latest_runs "$br")
      [ -z "$runs" ] && continue
      ok=$(echo "$runs" | jq '[.[] | select(.status != "completed" or .conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "action_required" or .conclusion == "startup_failure")] | length')
      if [ "$ok" -eq 0 ] && ! grep -q "^$num $sha$" "$READY"; then
        echo "$num $sha" >> "$READY"
        echo "MERGEABLE #$num $br ($sha)"
      fi
    done
  if [ "$cycle" -eq 1 ]; then
    echo "SEEDED: $total latest runs in scope, $running in flight, $red red already"
  fi
  if [ "$running" -eq 0 ]; then
    echo "TALLY: all terminal, $total latest runs, $red red"
    exit 0
  fi
  sleep 75
done
