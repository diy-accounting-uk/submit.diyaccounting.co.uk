#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

set -euo pipefail

# Bash 3.2 compatibility guard
if [[ "${BASH_VERSINFO[0]}" -lt 3 || ("${BASH_VERSINFO[0]}" -eq 3 && "${BASH_VERSINFO[1]}" -lt 2) ]]; then
  echo "error: bash 3.2 or later required" >&2
  exit 2
fi

STATE_DIR="${1:-target/watch-ci}"
mkdir -p "$STATE_DIR"

# Get the scope: main plus all open PR head branches
get_scope() {
  {
    echo "main"
    gh pr list --state open --limit 50 --json headRefName --jq '.[].headRefName' 2>/dev/null || true
  } | sort -u
}

# Poll runs for a given branch
poll_branch() {
  local branch="$1"

  # Get latest run per workflow for this branch
  gh run list --branch "$branch" --limit 60 --json workflowName,status,conclusion,databaseId \
    --jq 'group_by(.workflowName) | map(max_by(.databaseId) | {id:.databaseId, workflow:.workflowName, status:.status, conclusion:.conclusion})' 2>/dev/null || echo '[]'
}

# Emit changes since last poll
emit_changes() {
  local branch="$1"
  local current_file="$STATE_DIR/${branch}.current"
  local previous_file="$STATE_DIR/${branch}.previous"

  local current_state
  current_state=$(poll_branch "$branch")

  # Check if this is the first poll for this branch (no previous state)
  if [[ ! -f "$previous_file" ]]; then
    # Seed silently on first poll
    echo "$current_state" > "$current_file"
    return
  fi

  # Compare current to previous
  local previous_state
  previous_state=$(cat "$previous_file")

  # Emit failures (completion != success and status is completed)
  echo "$current_state" | jq -r '.[] | select(.status == "completed" and .conclusion != "success" and .conclusion != "skipped" and .conclusion != "neutral" and .conclusion != "cancelled") | "RED \(.workflow) \(.id)"' | while read -r line; do
    [[ -n "$line" ]] && echo "$line"
  done

  # Move current to previous for next poll
  cp "$current_file" "$previous_file" 2>/dev/null || echo "$current_state" > "$previous_file"
  echo "$current_state" > "$current_file"
}

# Check if all runs in scope are terminal (no queued or in_progress)
check_terminal() {
  local all_terminal=true

  get_scope | while read -r branch; do
    local current_file="$STATE_DIR/${branch}.current"
    if [[ ! -f "$current_file" ]]; then
      return
    fi

    local incomplete
    incomplete=$(jq -r '[.[] | select(.status == "in_progress" or .status == "queued")] | length' < "$current_file")
    if [[ "$incomplete" -gt 0 ]]; then
      echo "1"
      return
    fi
  done | grep -q "1" && echo "1" || echo "0"
}

# Check if scope has any red (failed/timed_out/action_required)
check_red() {
  local has_red=false

  get_scope | while read -r branch; do
    local current_file="$STATE_DIR/${branch}.current"
    if [[ ! -f "$current_file" ]]; then
      return
    fi

    local red_count
    red_count=$(jq -r '[.[] | select(.status == "completed" and (.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "action_required"))] | length' < "$current_file")
    if [[ "$red_count" -gt 0 ]]; then
      echo "1"
      return
    fi
  done | grep -q "1" && echo "1" || echo "0"
}

# Check PRs for merge-readiness
check_mergeable() {
  gh pr list --state open --limit 50 --json number,headRefName,isDraft --jq '.[] | select(.isDraft == false)' 2>/dev/null | while read -r pr_line; do
    local pr_num
    local pr_branch

    pr_num=$(echo "$pr_line" | jq -r '.number')
    pr_branch=$(echo "$pr_line" | jq -r '.headRefName')

    local current_file="$STATE_DIR/${pr_branch}.current"
    if [[ ! -f "$current_file" ]]; then
      continue
    fi

    # Check if all latest runs per workflow are not incomplete and not failed
    local mergeable=true
    local incomplete_count
    local failed_count

    incomplete_count=$(jq -r '[.[] | select(.status == "in_progress" or .status == "queued")] | length' < "$current_file")
    failed_count=$(jq -r '[.[] | select(.status == "completed" and (.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "action_required"))] | length' < "$current_file")

    if [[ "$incomplete_count" -eq 0 && "$failed_count" -eq 0 ]]; then
      # Check if we have any data
      local run_count
      run_count=$(jq -r 'length' < "$current_file")
      if [[ "$run_count" -gt 0 ]]; then
        # Emit mergeable marker once per PR per state
        local mergeable_marker="$STATE_DIR/${pr_branch}.mergeable"
        if [[ ! -f "$mergeable_marker" ]]; then
          echo "MERGEABLE #$pr_num $pr_branch"
          touch "$mergeable_marker"
        fi
      fi
    else
      # PR is not mergeable, remove marker if it exists
      rm -f "$STATE_DIR/${pr_branch}.mergeable"
    fi
  done
}

# Main loop
main() {
  local empty_cycles=0

  # Initial scope
  get_scope | while read -r branch; do
    poll_branch "$branch" > "$STATE_DIR/${branch}.current" 2>/dev/null || echo '[]' > "$STATE_DIR/${branch}.current"
  done

  while true; do
    # Poll each branch
    local data_count=0
    get_scope | while read -r branch; do
      emit_changes "$branch"

      if [[ -f "$STATE_DIR/${branch}.current" ]]; then
        local count
        count=$(jq -r 'length' < "$STATE_DIR/${branch}.current")
        [[ "$count" -gt 0 ]] && ((data_count+=count))
      fi
    done

    # Count total data across all branches
    local total_data=0
    for f in "$STATE_DIR"/*.current; do
      [[ -f "$f" ]] && total_data=$((total_data + $(jq 'length' < "$f" 2>/dev/null || echo 0)))
    done

    # Check for empty result set
    if [[ $total_data -eq 0 ]]; then
      ((empty_cycles++))
      if [[ $empty_cycles -gt 3 ]]; then
        echo "NO DATA" >&2
        return 1
      fi
    else
      empty_cycles=0
    fi

    # Check merge-readiness
    check_mergeable

    # Check terminal state
    local is_red
    is_red=$(check_red)
    local is_terminal
    is_terminal=$(check_terminal)

    if [[ "$is_red" == "1" ]]; then
      return 1
    fi

    if [[ "$is_terminal" == "0" ]]; then
      # All terminal, not red
      return 0
    fi

    # Still running, wait and loop
    sleep 60
  done
}

main
