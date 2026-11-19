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
#   new-cloud-session.sh creds <codename> [--dry-run]
#   new-cloud-session.sh relay-key | relay-url | relay-register <codename> | relay-send <codename|coordinator> <file>
#   new-cloud-session.sh relay-open [frame-file] | relay-ack <id>...
#
# --dry-run runs every read and prints every write (repository create, push, clone, file append, workflow dispatch)
# in its place.

set -euo pipefail

ORG=diy-accounting-uk
PREFIX=submit-cloud-
MAIN_REPO=$ORG/submit.diyaccounting.co.uk
CREDS_WORKFLOW=cloud-credentials.yml
LEASE_MAX_AGE=86400
SKILL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(git -C "$SKILL_DIR" rev-parse --show-toplevel)
MAIN_CHECKOUT=$(dirname "$(git -C "$SKILL_DIR" rev-parse --path-format=absolute --git-common-dir)")
SESSIONS_DIR=${CLOUD_SESSIONS_DIR:-$(dirname "$MAIN_CHECKOUT")/cloud-sessions}
POOL_FILE=$SKILL_DIR/pool.txt
ENV_FILE=$SKILL_DIR/environment.txt
CODENAMES=$REPO_ROOT/CODENAMES.txt
# The relay: ci-env-CollabRelayStack, ../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_CLOUD_COLLABORATION.md "Signed and encrypted messages without polling".
RELAY_STACK=ci-env-CollabRelayStack
RELAY_PROFILE=${RELAY_AWS_PROFILE:-diya-submit-ci}
RELAY_NAMESPACE=submit-collab
COORDINATOR_KEY=${COLLAB_COORDINATOR_KEY:-$HOME/.ssh/submit-collab-coordinator}
COORDINATOR_PUB=$REPO_ROOT/.collab/coordinator.pub

DRY=0
NEW=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

die() {
  echo "new-cloud-session: $*" >&2
  exit 1
}

usage() {
  sed -n '8,14p' "${BASH_SOURCE[0]}" | sed 's/^# *//' >&2
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

# The worker's public key: the one ssh-ed25519 line of .collab/<codename>.pub on its collab branch.
worker_key() {
  local cn=$1 g=$TMP/worker-key-$1 key
  git init -q "$g"
  git -C "$g" fetch -q --depth 1 "https://github.com/$(repo_of "$cn").git" refs/heads/collab ||
    die "$(repo_of "$cn") has no collab branch"
  key=$(git -C "$g" show "FETCH_HEAD:.collab/$cn.pub" 2>/dev/null) ||
    die "no .collab/$cn.pub on the collab branch of $(repo_of "$cn"); the worker pushes it by the collaborate skill"
  [ "$(printf '%s\n' "$key" | grep -c .)" = 1 ] || die ".collab/$cn.pub is not one line"
  [[ $key =~ ^ssh-ed25519\ [A-Za-z0-9+/]+={0,2}(\ .*)?$ ]] || die ".collab/$cn.pub is not an ssh-ed25519 public key"
  printf '%s\n' "$key"
}

# Gives a worker one-hour ci credentials that only it can read. Reads the worker's public key from .collab/<codename>.pub
# on its collab branch, dispatches cloud-credentials.yml on main with it, waits for the run, downloads the age
# ciphertext and pushes it to .collab/<codename>.aws.age on collab. The plaintext never reaches this machine.
cmd_creds() {
  local cn="" key before run_id="" title tries
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

  key=$(worker_key "$cn")
  echo "worker key: $(printf '%s\n' "$key" | ssh-keygen -l -f -)"

  title="cloud credentials for $cn"
  before=$(gh run list --repo "$MAIN_REPO" --workflow "$CREDS_WORKFLOW" --limit 20 --json databaseId --jq '.[].databaseId')
  run gh workflow run "$CREDS_WORKFLOW" --repo "$MAIN_REPO" --ref main -f "codename=$cn" -f "public_key=$key"
  if [ "$DRY" = 1 ]; then
    echo "dry-run: wait for the run, download $cn.aws.age, and push it to .collab/$cn.aws.age on the collab branch of $(repo_of "$cn")"
    return
  fi

  for tries in $(seq 1 30); do
    run_id=$(gh run list --repo "$MAIN_REPO" --workflow "$CREDS_WORKFLOW" --branch main --event workflow_dispatch --limit 20 \
      --json databaseId,displayTitle --jq ".[] | select(.displayTitle == \"$title\") | .databaseId" |
      grep -vxF -f <(printf '%s\n' "$before") | head -1 || true)
    [ -z "$run_id" ] || break
    [ "$tries" -lt 30 ] || die "no new '$title' run appeared on $MAIN_REPO within 150 seconds"
    sleep 5
  done
  echo "run: https://github.com/$MAIN_REPO/actions/runs/$run_id"
  gh run watch "$run_id" --repo "$MAIN_REPO" --exit-status --interval 10 >/dev/null ||
    die "run $run_id failed: gh run view $run_id --repo $MAIN_REPO --log-failed"
  gh run download "$run_id" --repo "$MAIN_REPO" -n "$cn.aws.age" -D "$TMP/artifact"
  [ "$(head -c 21 "$TMP/artifact/$cn.aws.age")" = "age-encryption.org/v1" ] || die "the artifact of run $run_id is not an age file"
  collab_commit "$cn" "AWS credentials for $cn from run $run_id (age ciphertext)" ".collab/$cn.aws.age" "$TMP/artifact/$cn.aws.age"
  echo "pushed: .collab/$cn.aws.age on the collab branch of $(repo_of "$cn"); the credentials expire within the hour"
}

need_tool() {
  command -v "$1" >/dev/null || die "$1 is not installed: $2"
}

# Stops unless the coordinator's private key exists and matches .collab/coordinator.pub.
coordinator_key_ready() {
  need_tool ssh-keygen "it comes with OpenSSH"
  [ -f "$COORDINATOR_KEY" ] || die "no coordinator key at $COORDINATOR_KEY; run: bash $SKILL_DIR/new-cloud-session.sh relay-key"
  [ -f "$COORDINATOR_PUB" ] || die "no $COORDINATOR_PUB; run: bash $SKILL_DIR/new-cloud-session.sh relay-key"
  [ "$(ssh-keygen -y -f "$COORDINATOR_KEY" | awk '{ print $2 }')" = "$(awk 'NF { print $2; exit }' "$COORDINATOR_PUB")" ] ||
    die "$COORDINATOR_KEY does not match $COORDINATOR_PUB"
}

# The base64 body of an SSHSIG over standard input, made with the coordinator's key.
relay_sign() {
  ssh-keygen -Y sign -n "$RELAY_NAMESPACE" -f "$COORDINATOR_KEY" - 2>/dev/null | sed '1d;$d' | tr -d '\n'
}

# One output of the relay stack (read-only AWS call with the ci SSO profile).
relay_output() {
  local value
  value=$(aws --profile "$RELAY_PROFILE" --region eu-west-2 cloudformation describe-stacks --stack-name "$RELAY_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>"$TMP/relay-output.err") ||
    die "cannot read $RELAY_STACK (deploy-environment.yml deploys it on ci; an expired SSO session needs aws sso login --sso-session diyaccounting): $(cat "$TMP/relay-output.err")"
  [ -n "$value" ] && [ "$value" != None ] || die "$RELAY_STACK has no output $1"
  printf '%s' "$value"
}

# POSTs the JSON on standard input to one relay route and prints the answer.
relay_post() {
  local url
  url=$(relay_output CollabRelayHttpUrl)
  curl -sS --fail-with-body -X POST -H 'content-type: application/json' --data-binary @- "$url$1"
  echo
}

uri_encode() { jq -rn --arg s "$1" '$s|@uri'; }
epoch_ms() { perl -MTime::HiRes=time -e 'printf "%d", time * 1000'; }

# Makes the coordinator's key pair once and writes its public half to .collab/coordinator.pub for a commit to main.
cmd_relay_key() {
  [ "${1:-}" != --dry-run ] || DRY=1
  need_tool ssh-keygen "it comes with OpenSSH"
  if [ -f "$COORDINATOR_KEY" ]; then
    echo "coordinator key: $COORDINATOR_KEY (kept)"
  else
    run ssh-keygen -q -t ed25519 -N '' -C submit-collab-coordinator -f "$COORDINATOR_KEY"
  fi
  if [ "$DRY" = 1 ]; then
    echo "dry-run: write the public key of $COORDINATOR_KEY to $COORDINATOR_PUB"
    return
  fi
  mkdir -p "$(dirname "$COORDINATOR_PUB")"
  printf '%s coordinator\n' "$(ssh-keygen -y -f "$COORDINATOR_KEY" | awk '{ print $1, $2 }')" >"$COORDINATOR_PUB"
  echo "wrote $COORDINATOR_PUB ($(ssh-keygen -l -f "$COORDINATOR_PUB"))"
  echo "commit it to main through a pull request: deploy-environment.yml then redeploys $RELAY_STACK with the key,"
  echo "and the next re-sync gives every work repository the key that workers encrypt to."
}

# Prints the signed wss:// URL of the coordinator's connection, for a Monitor WebSocket source. It is valid for 5 minutes.
cmd_relay_url() {
  local ts sig ws
  coordinator_key_ready
  need_tool jq "brew install jq"
  ts=$(date -u +%s)
  sig=$(printf 'connect|coordinator|%s' "$ts" | relay_sign)
  ws=$(relay_output CollabRelayWebSocketUrl)
  printf '%s?party=coordinator&ts=%s&sig=%s\n' "$ws" "$ts" "$(uri_encode "$sig")"
}

# Registers a worker's public key with the relay and writes the relay's send URL to .collab/relay on its collab branch.
cmd_relay_register() {
  local cn="" key ts sig url
  while [ $# -gt 0 ]; do
    case $1 in
      --dry-run) DRY=1; shift ;;
      -*) usage ;;
      *) [ -z "$cn" ] || usage; cn=$1; shift ;;
    esac
  done
  [ -n "$cn" ] || usage
  valid_codename "$cn"
  coordinator_key_ready
  need_tool jq "brew install jq"
  key=$(worker_key "$cn")
  echo "worker key: $(printf '%s\n' "$key" | ssh-keygen -l -f -)"
  url=$(relay_output CollabRelayHttpUrl)
  printf '%s\n' "$url" >"$TMP/relay"
  if [ "$DRY" = 1 ]; then
    echo "dry-run: POST $url/register for $cn, and write $url to .collab/relay on the collab branch of $(repo_of "$cn")"
    return
  fi
  ts=$(date -u +%s)
  sig=$(printf 'register|%s|%s|%s' "$cn" "$key" "$ts" | relay_sign)
  jq -n --arg party "$cn" --arg publicKey "$key" --argjson ts "$ts" --arg sig "$sig" \
    '{party: $party, publicKey: $publicKey, ts: $ts, sig: $sig}' | relay_post /register
  collab_commit "$cn" "Relay send URL for $cn" .collab/relay "$TMP/relay"
}

# Encrypts a file to one party (a worker, or the coordinator itself for a test), signs it and posts it to the relay.
cmd_relay_send() {
  local to="" file="" key seq ts
  while [ $# -gt 0 ]; do
    case $1 in
      -*) usage ;;
      *)
        if [ -z "$to" ]; then to=$1; elif [ -z "$file" ]; then file=$1; else usage; fi
        shift
        ;;
    esac
  done
  [ -n "$to" ] && [ -n "$file" ] || usage
  [ -f "$file" ] || die "no message file at $file"
  coordinator_key_ready
  need_tool age "brew install age"
  need_tool jq "brew install jq"
  if [ "$to" = coordinator ]; then
    key=$(awk 'NF { print; exit }' "$COORDINATOR_PUB")
  else
    valid_codename "$to"
    key=$(worker_key "$to")
  fi
  printf '%s\n' "$key" >"$TMP/recipient.pub"
  age -a -R "$TMP/recipient.pub" -o "$TMP/body.age" "$file"
  seq=$(epoch_ms)
  ts=$(date -u +%s)
  { printf 'send|coordinator|%s|%s|%s|' "$to" "$seq" "$ts"; cat "$TMP/body.age"; } | relay_sign >"$TMP/sig"
  jq -n --arg to "$to" --argjson seq "$seq" --argjson ts "$ts" --rawfile sig "$TMP/sig" --rawfile body "$TMP/body.age" \
    '{from: "coordinator", to: $to, seq: $seq, ts: $ts, sig: $sig, body: $body}' | relay_post /send
}

# Decrypts one relay frame (the text of a Monitor event) from a file or standard input, and prints its id and message.
cmd_relay_open() {
  local frame type
  coordinator_key_ready
  need_tool age "brew install age"
  need_tool jq "brew install jq"
  frame=$(cat "${1:-/dev/stdin}")
  type=$(jq -r .type <<<"$frame")
  if [ "$type" != message ]; then
    echo "$type frame; nothing to open"
    return
  fi
  jq -r '"id: \(.id)\nfrom: \(.from)\nseq: \(.seq)\nts: \(.ts)"' <<<"$frame"
  jq -j .body <<<"$frame" | age -d -i "$COORDINATOR_KEY"
  echo "acknowledge it with: bash $SKILL_DIR/new-cloud-session.sh relay-ack $(jq -r .id <<<"$frame")"
}

# Removes messages from the coordinator's inbox on the relay, so they are not sent again on the next connection.
cmd_relay_ack() {
  local ts sig ids id
  [ $# -gt 0 ] || usage
  for id in "$@"; do
    [[ $id =~ ^[0-9]{16}\.[a-z]+$ ]] || die "'$id' is not a relay message id"
  done
  coordinator_key_ready
  need_tool jq "brew install jq"
  ts=$(date -u +%s)
  ids=$(IFS=,; printf '%s' "$*")
  sig=$(printf 'ack|coordinator|%s|%s' "$ts" "$ids" | relay_sign)
  printf '%s\n' "$@" | jq -R . | jq -s --argjson ts "$ts" --arg sig "$sig" \
    '{party: "coordinator", ts: $ts, ids: ., sig: $sig}' | relay_post /ack
}

case ${1:-} in
  release) shift; cmd_release "$@" ;;
  creds) shift; cmd_creds "$@" ;;
  relay-key) shift; cmd_relay_key "$@" ;;
  relay-url) shift; cmd_relay_url "$@" ;;
  relay-register) shift; cmd_relay_register "$@" ;;
  relay-send) shift; cmd_relay_send "$@" ;;
  relay-open) shift; cmd_relay_open "$@" ;;
  relay-ack) shift; cmd_relay_ack "$@" ;;
  post) shift; cmd_post "$@" ;;
  watch) shift; cmd_watch "$@" ;;
  -h | --help) usage ;;
  *) cmd_start "$@" ;;
esac
