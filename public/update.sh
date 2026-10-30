#!/usr/bin/env bash
# update.sh — pull the latest published KainBain and restart only what changed.
# Lives in ~/apps/kainbain/ beside docker-compose.yml + redeploy.sh (template
# committed at deploy/update.sh; copies also ship on the ad-site as
# /update.sh). It never builds and never runs tests; publishing is
# publish.sh's job, per-component restart is redeploy.sh's job — this script
# only decides WHAT changed and hands those components to redeploy.sh.
#
# Source of truth, per component (asymmetric — a UI-only release restarts
# only the frontend, a runner-only release restarts only the Runner):
#   backend/frontend: the published release manifest. Fetched from
#     --manifest-url / $KAINBAIN_MANIFEST_URL when set (the ad-site / S3
#     copy, e.g. https://kainbain.ewrdad.uk/release-manifest.json); the
#     images it names are pulled from the registry by redeploy.sh, so the
#     remote manifest + registry are the truth, never a local build.
#     With no URL configured it falls back to the local publishing
#     checkout's dist/ ($KAINBAIN_DIST_DIR, default
#     ~/projects/kainbain/dist on this host layout: <repo>/dist).
#   runner: for now the tarball in that same local dist/ folder (copied
#     beside this script and sha256-verified by redeploy.sh). Once the
#     ad-site hosts releases, --runner-url / $KAINBAIN_RUNNER_URL (or the
#     manifest URL's directory) is used to download it instead — the
#     switch is one flag, the verification path is unchanged.
#
#   ./update.sh [--backend|--frontend|--runner|--all] [--check] [--force]
#               [--dry-run] [--manifest-url URL] [--manifest FILE]
#               [--dist-dir DIR] [--runner-url URL] [--dir DIR]
# Default --all = every component whose published tag/artifact differs
# from the installed ./release-manifest.json. --check changes nothing:
# exit 0 = already current, 3 = update available, 1 = error.
set -uo pipefail
cd "$(dirname "$0")"
DIR="$(pwd -P)"

ONLY="all"; CHECK=0; FORCE=0; DRY_RUN=0
MANIFEST_URL="${KAINBAIN_MANIFEST_URL:-}"; MANIFEST_FILE=""; RUNNER_URL="${KAINBAIN_RUNNER_URL:-}"
DIST_DIR="${KAINBAIN_DIST_DIR:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --backend) ONLY="backend" ;; --frontend) ONLY="frontend" ;;
    --runner) ONLY="runner" ;; --all) ONLY="all" ;;
    --check) CHECK=1 ;; --force) FORCE=1 ;; --dry-run) DRY_RUN=1 ;;
    --manifest-url) shift; MANIFEST_URL="${1:?--manifest-url needs a URL}" ;;
    --manifest-url=*) MANIFEST_URL="${1#--manifest-url=}" ;;
    --manifest) shift; MANIFEST_FILE="${1:?--manifest needs a file}" ;;
    --manifest=*) MANIFEST_FILE="${1#--manifest=}" ;;
    --runner-url) shift; RUNNER_URL="${1:?--runner-url needs a URL}" ;;
    --runner-url=*) RUNNER_URL="${1#--runner-url=}" ;;
    --dist-dir) shift; DIST_DIR="${1:?--dist-dir needs a path}" ;;
    --dist-dir=*) DIST_DIR="${1#--dist-dir=}" ;;
    --dir) shift; DIR="${1:?--dir needs a path}" ;;
    --dir=*) DIR="${1#--dir=}" ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "update.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
# --dir re-targets after the initial cd (redeploy.sh is resolved in $DIR).
cd "$DIR" 2>/dev/null || { echo "update.sh: cannot cd to $DIR" >&2; exit 2; }
DIR="$(pwd -P)"
[ -z "$DIST_DIR" ] && DIST_DIR="$HOME/projects/kainbain/dist"

log() { echo "update: $*"; }
run() { if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi; }
field() { # manifest-file component field
  node -e 'try{const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=m?.components?.[process.argv[2]]?.[process.argv[3]];if(v!==undefined&&v!==null)console.log(v)}catch{}' "$1" "$2" "$3"
}
commit_of() { node -e 'try{const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(m.commit)console.log(m.commit)}catch{}' "$1"; }

[ -x ./redeploy.sh ] || { echo "update.sh: no executable ./redeploy.sh in $DIR — install deploy/redeploy.sh beside this script first" >&2; exit 2; }

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
NEW="$WORK/release-manifest.json"
# 1. Fetch the published manifest (remote truth first, local dist fallback).
if [ -n "$MANIFEST_FILE" ]; then
  cp "$MANIFEST_FILE" "$NEW" || { echo "update.sh: cannot read --manifest $MANIFEST_FILE" >&2; exit 1; }
elif [ -n "$MANIFEST_URL" ]; then
  curl -fsSL "$MANIFEST_URL" -o "$NEW" || { echo "update.sh: failed to fetch $MANIFEST_URL" >&2; exit 1; }
  log "manifest: $MANIFEST_URL"
elif [ -f "$DIST_DIR/release-manifest.json" ]; then
  cp "$DIST_DIR/release-manifest.json" "$NEW"; log "manifest: $DIST_DIR/release-manifest.json (local dist; set --manifest-url for the remote source of truth)"
else
  echo "update.sh: no manifest source — pass --manifest-url URL, --manifest FILE, or --dist-dir DIR (none found in $DIST_DIR)" >&2; exit 2
fi
[ -n "$(commit_of "$NEW")" ] || { echo "update.sh: fetched manifest has no commit field" >&2; exit 1; }

# 2. Per-component diff against the installed manifest (asymmetric update set).
changed=""
for c in backend frontend runner; do
  [ "$ONLY" != "all" ] && [ "$ONLY" != "$c" ] && continue
  if [ "$c" = "runner" ]; then old="$(field ./release-manifest.json runner sha256 2>/dev/null)"; new="$(field "$NEW" runner sha256)"
  else old="$(field ./release-manifest.json "$c" tag 2>/dev/null)"; new="$(field "$NEW" "$c" tag)"; fi
  if [ "$FORCE" = "1" ]; then [ -n "$new" ] && changed="$changed $c";
  elif [ "$old" != "$new" ]; then changed="$changed $c"; fi
done
# Trim leading space.
changed="${changed# }"
if [ -z "$changed" ]; then log "already current (commit $(commit_of "$NEW")) — nothing to do."; exit 0; fi
log "changed:$changed (installed $(commit_of ./release-manifest.json 2>/dev/null || echo none) -> published $(commit_of "$NEW"))"
if [ "$CHECK" = "1" ]; then log "UPDATE_AVAILABLE:$changed"; exit 3; fi

# 3. Stage the runner tarball for a runner update (local dist now, URL later).
case " $changed " in *" runner "*)
  artifact="$(field "$NEW" runner artifact)"
  if [ -n "$artifact" ] && [ ! -f "./$artifact" ]; then
    if [ -n "$RUNNER_URL" ]; then run curl -fsSL "$RUNNER_URL" -o "./$artifact" || { echo "update.sh: failed to fetch runner from $RUNNER_URL" >&2; exit 1; }
    elif [ -n "$MANIFEST_URL" ]; then run curl -fsSL "${MANIFEST_URL%/*}/$artifact" -o "./$artifact" || { echo "update.sh: failed to fetch ${MANIFEST_URL%/*}/$artifact" >&2; exit 1; }
    elif [ -f "$DIST_DIR/$artifact" ]; then run cp "$DIST_DIR/$artifact" "./$artifact";
    else echo "update.sh: runner tarball $artifact not in $DIST_DIR and no --runner-url/--manifest-url to fetch it" >&2; exit 1; fi
  fi ;;
esac

# 4. Install the new manifest, then redeploy only the changed components.
if [ "$DRY_RUN" = "1" ]; then
  echo "would run: cp $NEW ./release-manifest.json"
  for c in $changed; do echo "would run: ./redeploy.sh --$c"; done
  exit 0
fi
cp "$NEW" ./release-manifest.json
rc=0
for c in $changed; do ./redeploy.sh "--$c" || rc=1; done
[ "$rc" = "0" ] && log "updated:$changed" || echo "update.sh: one or more components failed (see redeploy output above)" >&2
exit $rc
