#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Leases a work repository from the pool, re-syncs it from origin/main, and starts or links a Claude Code
# cloud session on it that runs /collaborate. The skill is .claude/skills/new-cloud-session/SKILL.md.
#
#   new-cloud-session.sh [codename] [--base <branch>] [--coordinator <url>] [--no-launch] [--dry-run]
#   new-cloud-session.sh release <codename> [--dry-run]
#   new-cloud-session.sh post <codename> <task-file> [--dry-run]
#   new-cloud-session.sh watch <codename> [--interval <seconds>]
#
# --dry-run runs every read and prints every write (repository create, push, clone, file append) in its place.

set -euo pipefail

ORG=diy-accounting-uk
PREFIX=submit-cloud-
LEASE_MAX_AGE=86400
SKILL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
MAIN_CHECKOUT=$(dirname "$(git -C "$SKILL_DIR" rev-parse --path-format=absolute --git-common-dir)")
SESSIONS_DIR=${CLOUD_SESSIONS_DIR:-$(dirname "$MAIN_CHECKOUT")/cloud-sessions}
POOL_FILE=$SKILL_DIR/pool.txt
ENV_FILE=$SKILL_DIR/environment.txt
CODENAMES=$REPO_ROOT/CODENAMES.txt

DRY=0
NEW=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

die() {
  echo "new-cloud-session: $*" >&2
  exit 1
}

usage() {
  sed -n '8,11p' "${BASH_SOURCE[0]}" | sed 's/^# *//' >&2
  exit 2
}

run() {
  if [ "$DRY" = 1 ]; then
    printf 'dry-run:'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

repo_of() { printf '%s/%s%s' "$ORG" "$PREFIX" "$1"; }
url_of() { printf 'git@github.com:%s.git' "$(repo_of "$1")"; }
now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

iso_to_epoch() {
  date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$1" +%s 2>/dev/null || date -u -d "$1" +%s
}

valid_codename() {
  [[ $1 =~ ^[a-z]+$ ]] || die "code name '$1' is not one lowercase word"
  tr ' ' '\n' <"$CODENAMES" | grep -qx "$1" || die "code name '$1' is not in CODENAMES.txt"
}

read_pool() {
  [ -f "$POOL_FILE" ] || die "no pool file at $POOL_FILE"
  grep -v '^#' "$POOL_FILE" | awk 'NF { print $1 }'
}

repo_exists() {
  gh api "repos/$(repo_of "$1")" --jq .name >/dev/null 2>&1
}

# The text of .collab/lease on the collab branch, or nothing when the branch or the file is absent.
lease_text() {
  local text
  if text=$(gh api -H 'Accept: application/vnd.github.raw+json' "repos/$(repo_of "$1")/contents/.collab/lease?ref=collab" 2>"$TMP/lease.err"); then
    printf '%s\n' "$text"
    return 0
  fi
  grep -q 'HTTP 404' "$TMP/lease.err" && return 0
  die "cannot read the lease of $(repo_of "$1"): $(cat "$TMP/lease.err")"
}

lease_field() { sed -n "s/^$2: //p" <<<"$1" | head -1; }

# The newest committer time (epoch seconds) of the claude/* branch tips, or 0 when there are none.
newest_claude_epoch() {
  local newest=0 sha date epoch
  while read -r sha _; do
    [ -n "$sha" ] || continue
    date=$(gh api "repos/$(repo_of "$1")/commits/$sha" --jq .commit.committer.date)
    epoch=$(iso_to_epoch "$date")
    if [ "$epoch" -gt "$newest" ]; then newest=$epoch; fi
  done < <(git ls-remote "$(url_of "$1")" 'refs/heads/claude/*')
  echo "$newest"
}

# Prints "free", "stale <leased> <coordinator>" or "busy <leased> <coordinator>".
lease_state() {
  local text leased coordinator age
  text=$(lease_text "$1")
  if [ -z "$text" ]; then
    echo free
    return
  fi
  leased=$(lease_field "$text" leased)
  coordinator=$(lease_field "$text" coordinator)
  [ -n "$leased" ] || die "the lease of $(repo_of "$1") has no 'leased:' line"
  age=$(($(date -u +%s) - $(iso_to_epoch "$leased")))
  if [ "$age" -gt "$LEASE_MAX_AGE" ] && [ $(($(date -u +%s) - $(newest_claude_epoch "$1"))) -gt "$LEASE_MAX_AGE" ]; then
    echo "stale $leased $coordinator"
  else
    echo "busy $leased $coordinator"
  fi
}

# The next code name: a random unused name from the CODENAMES.txt line after the last pool name's letter.
next_codename() {
  local last letter start step line name
  local -a names
  last=$(read_pool | tail -1)
  letter=${last:0:1}
  letter=${letter:-z}
  start=$((($(printf '%d' "'$letter") - 96) % 26))
  for step in $(seq 0 25); do
    line=$(((start + step) % 26 + 1))
    names=()
    for name in $(sed -n "${line}p" "$CODENAMES" | tr ' ' '\n'); do
      read_pool | grep -qx "$name" && continue
      repo_exists "$name" && continue
      names+=("$name")
    done
    if [ "${#names[@]}" -gt 0 ]; then
      echo "${names[RANDOM % ${#names[@]}]}"
      return
    fi
  done
  die "every name in CODENAMES.txt is in the pool"
}

# Commits one change to the collab branch of a work repository and pushes it, without a fast-forward override,
# so two coordinators that lease at once cannot both win. With a source file the path is written, without one it
# is removed. Uses a scratch repository, so no checkout and no remote of the operator changes.
collab_commit() {
  local cn=$1 message=$2 path=$3 src=${4:-} url g parent="" blob tree commit
  url=$(url_of "$cn")
  if [ "$DRY" = 1 ] && [ "$NEW" = 1 ]; then
    echo "dry-run: commit '$message' to the collab branch of $(repo_of "$cn") and push it"
    return
  fi
  g=$TMP/collab
  rm -rf "$g" "$TMP/collab.index"
  git init -q "$g"
  if git ls-remote --exit-code "$url" refs/heads/collab >/dev/null; then
    git -C "$g" fetch -q --depth 1 "$url" refs/heads/collab
    parent=$(git -C "$g" rev-parse FETCH_HEAD)
    GIT_INDEX_FILE=$TMP/collab.index git -C "$g" read-tree "$parent"
  fi
  if [ -n "$src" ]; then
    blob=$(git -C "$g" hash-object -w "$src")
    GIT_INDEX_FILE=$TMP/collab.index git -C "$g" update-index --add --cacheinfo "100644,$blob,$path"
  else
    if [ -z "$parent" ] || ! git -C "$g" cat-file -e "$parent:$path" 2>/dev/null; then
      echo "$(repo_of "$cn") has no $path on collab; nothing to remove"
      return
    fi
    GIT_INDEX_FILE=$TMP/collab.index git -C "$g" update-index --force-remove "$path"
  fi
  tree=$(GIT_INDEX_FILE=$TMP/collab.index git -C "$g" write-tree)
  commit=$(git -C "$g" commit-tree "$tree" ${parent:+-p "$parent"} -m "$message" \
    -m "Co-Authored-By: Claude <noreply@anthropic.com>")
  run git -C "$g" push -q "$url" "$commit:refs/heads/collab"
}

create_repository() {
  local cn=$1 repo
  repo=$(repo_of "$cn")
  echo "creating $repo (Actions off before the first push)"
  run gh repo create "$repo" --private --disable-wiki --description "Work repository for one Claude Code cloud session on submit.diyaccounting.co.uk"
  run gh api -X PUT "repos/$repo/actions/permissions" -F enabled=false
  if [ "$DRY" = 0 ]; then
    [ "$(gh api "repos/$repo/actions/permissions" --jq .enabled)" = false ] || die "Actions is still on in $repo; nothing pushed"
    printf '%s\n' "$cn" >>"$POOL_FILE"
  else
    echo "dry-run: append $cn to $POOL_FILE"
  fi
  NEW=1
}

sync_repository() {
  local cn=$1 base=$2 url
  url=$(url_of "$cn")
  run git -C "$REPO_ROOT" push -q "$url" "refs/remotes/origin/main:refs/heads/main" || return 1
  if [ "$base" != main ]; then
    run git -C "$REPO_ROOT" push -q "$url" "refs/heads/$base:refs/heads/$base" || return 1
  fi
}

prepare_clone() {
  local cn=$1 url dir
  url=$(url_of "$cn")
  dir=$SESSIONS_DIR/$cn
  if git -C "$SESSIONS_DIR" rev-parse --git-dir >/dev/null 2>&1 && [ ! -d "$dir/.git" ]; then
    die "$SESSIONS_DIR is inside a git repository; set CLOUD_SESSIONS_DIR to a folder outside every repository"
  fi
  if [ ! -d "$dir/.git" ]; then
    run mkdir -p "$SESSIONS_DIR"
    run git clone -q --depth 50 "$url" "$dir"
    return
  fi
  [ "$(git -C "$dir" remote)" = origin ] || die "$dir has remotes other than origin: $(git -C "$dir" remote | tr '\n' ' ')"
  [ "$(git -C "$dir" remote get-url origin)" = "$url" ] || die "$dir origin is $(git -C "$dir" remote get-url origin), expected $url"
  [ -z "$(git -C "$dir" status --porcelain)" ] || die "$dir has uncommitted changes; the clone only follows the work repository's main"
  run git -C "$dir" fetch -q --depth 50 origin main
  run git -C "$dir" checkout -q main
  run git -C "$dir" merge -q --ff-only origin/main
}

claude_app_page() {
  gh api "orgs/$ORG/installations" --jq '.installations[] | select(.app_slug == "claude") | .html_url' 2>/dev/null |
    head -1 | grep . || echo "https://github.com/organizations/$ORG/settings/installations"
}

cmd_start() {
  local cn="" base=main coordinator="" no_launch=0 state env_id="" env_note prompt deep_link dir repo url
  while [ $# -gt 0 ]; do
    case $1 in
      --base) base=${2:?--base needs a branch}; shift 2 ;;
      --coordinator) coordinator=${2:?--coordinator needs a url}; shift 2 ;;
      --no-launch) no_launch=1; shift ;;
      --dry-run) DRY=1; shift ;;
      -*) usage ;;
      *) [ -z "$cn" ] || usage; cn=$1; shift ;;
    esac
  done
  if [ -z "$coordinator" ]; then
    coordinator=${CLAUDE_CODE_BRIDGE_SESSION_ID:+https://claude.ai/code/$CLAUDE_CODE_BRIDGE_SESSION_ID}
    coordinator=${coordinator:-unknown}
  fi
  [ "$base" != collab ] || die "collab is the channel branch, not a base"
  if [ "$base" != main ]; then
    git -C "$REPO_ROOT" rev-parse --verify -q "refs/heads/$base" >/dev/null || die "no local branch $base to push as the base"
  fi

  if [ "$DRY" = 0 ]; then
    git -C "$REPO_ROOT" fetch -q origin main
  fi
  echo "origin/main is $(git -C "$REPO_ROOT" rev-parse --short refs/remotes/origin/main)"

  echo "pool ($POOL_FILE):"
  if [ -n "$cn" ]; then
    valid_codename "$cn"
    if read_pool | grep -qx "$cn"; then
      repo_exists "$cn" || die "$(repo_of "$cn") is in the pool but not on GitHub"
      state=$(lease_state "$cn")
      echo "  $cn: $state"
      case $state in
        busy*) die "$cn is leased (${state#busy }); release it with: bash $SKILL_DIR/new-cloud-session.sh release $cn" ;;
      esac
    else
      repo_exists "$cn" && die "$(repo_of "$cn") exists but is not in the pool; add it to $POOL_FILE first"
      create_repository "$cn"
    fi
  else
    for name in $(read_pool); do
      repo_exists "$name" || die "$(repo_of "$name") is in the pool but not on GitHub"
      state=$(lease_state "$name")
      echo "  $name: $state"
      if [ -z "$cn" ] && [[ $state == free || $state == stale* ]]; then
        cn=$name
      fi
    done
    if [ -z "$cn" ]; then
      cn=$(next_codename)
      echo "no pool repository is free; the next code name is $cn"
      create_repository "$cn"
    fi
  fi
  repo=$(repo_of "$cn")
  url=$(url_of "$cn")
  dir=$SESSIONS_DIR/$cn

  printf 'worker: %s\nleased: %s\ncoordinator: %s\nbase: %s\n' "$cn" "$(now_iso)" "$coordinator" "$base" >"$TMP/lease"
  if [ "$NEW" = 1 ]; then
    sync_repository "$cn" "$base"
    collab_commit "$cn" "Lease $cn for $coordinator" .collab/lease "$TMP/lease"
  else
    collab_commit "$cn" "Lease $cn for $coordinator" .collab/lease "$TMP/lease"
    sync_repository "$cn" "$base" || die "the re-sync of $repo failed; the lease is held; release it with: bash $SKILL_DIR/new-cloud-session.sh release $cn"
  fi
  prepare_clone "$cn"

  if [ -f "$ENV_FILE" ]; then
    env_id=$(awk 'NF && !/^#/ { print $1; exit }' "$ENV_FILE")
    [[ $env_id =~ ^env_ ]] || die "$ENV_FILE does not hold an env_ environment id"
    env_note="$env_id (from environment.txt, passed with --settings)"
  else
    env_note=$(jq -r '.remote.defaultEnvironmentId // empty' "$HOME/.claude/settings.json" 2>/dev/null || true)
    env_note=${env_note:+$env_note (the /remote-env pick in ~/.claude/settings.json)}
    env_note=${env_note:-the CLI fallback, the Anthropic-hosted Default environment (no environment.txt, no /remote-env pick)}
  fi
  prompt="/collaborate $cn"
  local -a launch=(claude)
  [ -z "$env_id" ] || launch+=(--settings "{\"remote\":{\"defaultEnvironmentId\":\"$env_id\"}}")
  launch+=(--cloud "$prompt")
  deep_link="https://claude.ai/code/new?q=%2Fcollaborate%20$cn&repo=$ORG%2F$PREFIX$cn&branch=main"

  echo
  echo "worker:       $cn"
  echo "repository:   https://github.com/$repo"
  echo "base branch:  $base"
  echo "coordinator:  $coordinator"
  echo "clone:        $dir"
  echo "environment:  $env_note"
  echo "monitor:      bash $SKILL_DIR/new-cloud-session.sh watch $cn"
  echo "task file:    bash $SKILL_DIR/new-cloud-session.sh post $cn <file>"
  echo "land a row:   git fetch $url claude/$cn-<row> && git merge --squash FETCH_HEAD"
  echo "release:      bash $SKILL_DIR/new-cloud-session.sh release $cn"
  if [ "$NEW" = 1 ]; then
    echo
    echo "one-time steps for the operator, before the first session on $repo:"
    echo "  1. Open $(claude_app_page), under 'Repository access' add $PREFIX$cn, and click Save."
    echo "  2. Run in a terminal:"
    echo "     ! git -C $MAIN_CHECKOUT remote add cloud-$cn $url"
    echo "the coordinator commits $POOL_FILE to main (a docs commit)."
  fi
  echo
  if [ "$DRY" = 0 ] && [ "$no_launch" = 0 ] && [ -t 0 ] && [ -t 1 ]; then
    echo "session: starting with claude --cloud from $dir (method a)"
    cd "$dir"
    exec "${launch[@]}"
  fi
  echo "session: no terminal here, so the link is the start (method b)"
  echo "  b. Open this link, check that the environment is the work environment, and press send:"
  echo "     $deep_link"
  echo "  a. Or, in a terminal:"
  printf '     cd %q &&' "$dir"
  printf ' %q' "${launch[@]}"
  printf '\n'
  echo "  c. Or open https://claude.ai/code, choose $repo and branch main, choose the work environment, and type: $prompt"
  echo "the session URL is the address of the new session in the browser, and in the claude.ai/code sidebar."
}

cmd_release() {
  local cn=""
  while [ $# -gt 0 ]; do
    case $1 in
      --dry-run) DRY=1; shift ;;
      -*) usage ;;
      *) [ -z "$cn" ] || usage; cn=$1; shift ;;
    esac
  done
  [ -n "$cn" ] || usage
  valid_codename "$cn"
  repo_exists "$cn" || die "$(repo_of "$cn") is not on GitHub"
  collab_commit "$cn" "Release $cn" .collab/lease
  [ "$DRY" = 1 ] || echo "released: $(repo_of "$cn") is free; its branches are kept"
}

cmd_post() {
  local cn="" file=""
  while [ $# -gt 0 ]; do
    case $1 in
      --dry-run) DRY=1; shift ;;
      -*) usage ;;
      *)
        if [ -z "$cn" ]; then cn=$1; elif [ -z "$file" ]; then file=$1; else usage; fi
        shift
        ;;
    esac
  done
  [ -n "$cn" ] && [ -n "$file" ] || usage
  [ -f "$file" ] || die "no task file at $file"
  valid_codename "$cn"
  collab_commit "$cn" "Task for $cn" ".collab/$cn.md" "$file"
  [ "$DRY" = 1 ] || echo "posted: .collab/$cn.md on the collab branch of $(repo_of "$cn")"
}

cmd_watch() {
  local cn="" interval=120 url prev now
  while [ $# -gt 0 ]; do
    case $1 in
      --interval) interval=${2:?--interval needs seconds}; shift 2 ;;
      -*) usage ;;
      *) [ -z "$cn" ] || usage; cn=$1; shift ;;
    esac
  done
  [ -n "$cn" ] || usage
  url=$(url_of "$cn")
  prev=$(git ls-remote "$url" 'refs/heads/claude/*' | sort)
  echo "watching $(repo_of "$cn"): $(grep -c . <<<"$prev" || true) claude/* branches, every ${interval}s"
  while sleep "$interval"; do
    if ! now=$(git ls-remote "$url" 'refs/heads/claude/*' | sort); then
      echo "ls-remote failed for $(repo_of "$cn"); trying again in ${interval}s"
      continue
    fi
    comm -13 <(printf '%s\n' "$prev") <(printf '%s\n' "$now") | while read -r sha ref; do
      if [ -n "$sha" ]; then echo "new tip ${ref#refs/heads/} $sha on $(repo_of "$cn")"; fi
    done
    prev=$now
  done
}

case ${1:-} in
  release) shift; cmd_release "$@" ;;
  post) shift; cmd_post "$@" ;;
  watch) shift; cmd_watch "$@" ;;
  -h | --help) usage ;;
  *) cmd_start "$@" ;;
esac
