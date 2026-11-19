#!/bin/bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited
#
# The state of the cloud workers, read from git and GitHub only, so a coordinator can rebuild it after a
# compaction or a restart. The skill is .claude/skills/collab-loop/SKILL.md.
#
#   collab-loop.sh state [--base <branch>]   one line per worker: setup, task, branch, status, landed
#   collab-loop.sh setup-needed <codename>   exit 0 and name the changed files when the worker needs a setup task
#   collab-loop.sh sync <codename> [<base>]  push origin/main and the base to the work repository, fast-forward only
#   collab-loop.sh fetch <codename> <row>    fetch claude/<codename>-<row> into refs/remotes/cloud-<codename>/
#   collab-loop.sh load                      the laptop's load, thermal limit and free memory, one line
#
# Bash 3.2 (macOS): no associative arrays. Reads only, except sync and fetch, which write no remote config.

set -uo pipefail

ORG=diy-accounting-uk
PREFIX=submit-cloud-
REPO_ROOT=$(git rev-parse --show-toplevel)
POOL_FILE="$REPO_ROOT/.claude/skills/new-cloud-session/pool.txt"
# A change to any of these after a worker's last setup means the worker runs an older skill or VM setup.
SETUP_PATHS=".claude/skills/collaborate .claude/skills/new-cloud-session/environment-setup.sh CLAUDE.md .claude/settings.json"
STALE_MINUTES=${COLLAB_STALE_MINUTES:-60}

die() { echo "collab-loop: $*" >&2; exit 1; }
repo_of() { printf '%s/%s%s' "$ORG" "$PREFIX" "$1"; }
url_of() { printf 'git@github.com:%s.git' "$(repo_of "$1")"; }
pool() { grep -v '^#' "$POOL_FILE" | awk 'NF { print $1 }'; }
iso_to_epoch() { date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$1" +%s 2>/dev/null || date -u -d "$1" +%s; }
raw() { gh api -H 'Accept: application/vnd.github.raw+json' "repos/$(repo_of "$1")/contents/$2?ref=$3" 2>/dev/null; }

# The claude/<codename>-* branch names of a work repository, newest commit first is not needed: names only.
branches() {
  gh api --paginate "repos/$(repo_of "$1")/branches?per_page=100" --jq '.[].name' 2>/dev/null | grep "^claude/$1-" || true
}

# The task id in .collab/<codename>.md on the collab branch ("task: <row>"), or nothing.
current_task() { raw "$1" ".collab/$1.md" collab | sed -n 's/^task: *//p' | head -1 | tr 'A-Z' 'a-z' | tr -d ' '; }

# When the task file was last written, as epoch seconds, or 0.
task_time() {
  local iso
  iso=$(gh api "repos/$(repo_of "$1")/commits?sha=collab&path=.collab/$1.md&per_page=1" --jq '.[0].commit.committer.date // empty' 2>/dev/null)
  [ -n "$iso" ] && iso_to_epoch "$iso" || echo 0
}

# "<sha7> <Collab-Status>" of a branch tip, or nothing when the branch is absent.
tip_status() {
  local out
  # gh api prints an error body on standard output when the branch is absent, so only a success counts.
  out=$(gh api "repos/$(repo_of "$1")/commits/$2" --jq '(.sha[0:9]) + " " + ((.commit.message | capture("Collab-Status: *(?<s>[a-z-]+)").s) // "none")' 2>/dev/null) || return 0
  printf '%s\n' "$out"
}

# The main SHA the newest setup branch recorded (claude/<codename>-setup-<sha7>), or nothing.
last_setup_sha() { branches "$1" | sed -n "s|^claude/$1-setup-||p" | while read -r s; do
  t=$(git -C "$REPO_ROOT" log -1 --format=%ct "$s" 2>/dev/null) && echo "$t $s"; done | sort -n | tail -1 | awk '{print $2}'; }

cmd_setup_needed() {
  local cn=${1:?codename} s changed
  git -C "$REPO_ROOT" fetch -q origin main 2>/dev/null
  s=$(last_setup_sha "$cn")
  if [ -z "$s" ]; then echo "$cn: no setup branch yet"; return 0; fi
  # shellcheck disable=SC2086
  changed=$(git -C "$REPO_ROOT" diff --name-only "$s" origin/main -- $SETUP_PATHS)
  if [ -n "$changed" ]; then echo "$cn: changed since setup at $s:"; echo "$changed" | sed 's/^/  /'; return 0; fi
  return 1
}

# Whether a fetched worker branch's files equal the base's, .collab/ excluded: landed, partly, or not.
landed() {
  local cn=$1 br=$2 base=$3 ref files
  ref="refs/remotes/cloud-$cn/$br"
  git -C "$REPO_ROOT" fetch -q "$(url_of "$cn")" "+refs/heads/$br:$ref" 2>/dev/null || { echo "?"; return; }
  files=$(git -C "$REPO_ROOT" diff --name-only "$(git -C "$REPO_ROOT" merge-base "$ref" "$base")" "$ref" -- . ':!.collab' 2>/dev/null)
  [ -z "$files" ] && { echo "empty"; return; }
  # shellcheck disable=SC2086
  if git -C "$REPO_ROOT" diff --quiet "$ref" "$base" -- $files; then echo "yes"; else echo "no"; fi
}

cmd_state() {
  local base="" cn task br ts now st setup age land
  while [ $# -gt 0 ]; do case $1 in --base) base=$2; shift 2 ;; *) die "unknown argument $1" ;; esac; done
  now=$(date +%s)
  git -C "$REPO_ROOT" fetch -q origin main 2>/dev/null
  printf '%-8s %-14s %-22s %-18s %-9s %s\n' worker setup task branch status landed
  for cn in $(pool); do
    if cmd_setup_needed "$cn" >/dev/null; then setup="needed"; else setup="current"; fi
    task=$(current_task "$cn")
    if [ -z "$task" ]; then printf '%-8s %-14s %-22s %-18s %-9s %s\n' "$cn" "$setup" "-" "-" "idle" "-"; continue; fi
    br="claude/$cn-$task"
    st=$(tip_status "$cn" "$br")
    ts=$(task_time "$cn"); age=$(( (now - ts) / 60 ))
    if [ -z "$st" ]; then
      if [ "$age" -ge "$STALE_MINUTES" ]; then st="- stale(${age}m)"; else st="- busy(${age}m)"; fi
      land="-"
    else
      land="-"; [ -n "$base" ] && land=$(landed "$cn" "$br" "$base")
    fi
    printf '%-8s %-14s %-22s %-18s %-9s %s\n' "$cn" "$setup" "$task" "${st%% *}" "${st#* }" "$land"
  done
}

cmd_sync() {
  local cn=${1:?codename} base=${2:-} url
  url=$(url_of "$cn")
  git -C "$REPO_ROOT" fetch -q origin main || die "fetch of origin main failed"
  git -C "$REPO_ROOT" push -q "$url" "refs/remotes/origin/main:refs/heads/main" || die "push of main to $cn refused (not a fast-forward?)"
  if [ -n "$base" ] && [ "$base" != main ]; then
    git -C "$REPO_ROOT" push -q "$url" "refs/heads/$base:refs/heads/$base" || die "push of $base to $cn refused (not a fast-forward?)"
  fi
  echo "synced $cn: main $(git -C "$REPO_ROOT" rev-parse --short origin/main)${base:+, $base $(git -C "$REPO_ROOT" rev-parse --short "$base")}"
}

cmd_fetch() {
  local cn=${1:?codename} row=${2:?row} br
  br="claude/$cn-$(echo "$row" | tr 'A-Z' 'a-z')"
  git -C "$REPO_ROOT" fetch -q "$(url_of "$cn")" "+refs/heads/$br:refs/remotes/cloud-$cn/$br" || die "no branch $br in $(repo_of "$cn")"
  echo "refs/remotes/cloud-$cn/$br $(git -C "$REPO_ROOT" rev-parse --short "refs/remotes/cloud-$cn/$br")"
}

cmd_load() {
  local la th mem
  la=$(uptime | sed 's/.*load averages*: *//')
  th=$(pmset -g therm 2>/dev/null | sed -n 's/.*CPU_Speed_Limit *= *//p' | head -1)
  mem=$(memory_pressure -Q 2>/dev/null | tail -1 | sed 's/.*: *//')
  echo "load ${la} (16 cores); CPU_Speed_Limit ${th:-100}; free memory ${mem:-?}"
}

case ${1:-} in
  state) shift; cmd_state "$@" ;;
  setup-needed) shift; cmd_setup_needed "$@" ;;
  sync) shift; cmd_sync "$@" ;;
  fetch) shift; cmd_fetch "$@" ;;
  load) shift; cmd_load "$@" ;;
  *) sed -n '8,13p' "${BASH_SOURCE[0]}" | sed 's/^# *//' >&2; exit 2 ;;
esac
