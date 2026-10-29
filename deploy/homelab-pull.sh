#!/usr/bin/env bash
# homelab-pull.sh — pipeline-side updater for a prod host (e.g. homelab).
# Fetches the published release-manifest.json (+ the runner tarball it names)
# from the dev box (or any manifest source) into the local prod dir, then
# rolls forward via that dir's redeploy.sh --all (pull pinned images, compat
# check, restart, health poll). Pull only, never builds, never runs tests.
#
# Typical pipeline usage (runs ON the target host):
#   ./homelab-pull.sh --from user@devbox:/home/server/projects/kainbain/dist --dir ~/apps/kainbain
#   ./homelab-pull.sh --from user@devbox:/home/server/projects/kainbain/dist --dir ~/apps/homelab
#   ./homelab-pull.sh --manifest ./release-manifest.json --dir ~/apps/kainbain
#   ./homelab-pull.sh --check --dir ~/apps/kainbain   # exit 0 current, 3 update available
set -uo pipefail

DIR="$HOME/apps/kainbain"
FROM=""; MANIFEST_FILE=""; MANIFEST_URL=""
DRY_RUN=0; CHECK=0; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) shift; DIR="${1:?--dir needs a path}" ;;
    --dir=*) DIR="${1#--dir=}" ;;
    --from) shift; FROM="${1:?--from needs a source}" ;;
    --from=*) FROM="${1#--from=}" ;;
    --manifest) shift; MANIFEST_FILE="${1:?--manifest needs a file}" ;;
    --manifest=*) MANIFEST_FILE="${1#--manifest=}" ;;
    --url) shift; MANIFEST_URL="${1:?--url needs a URL}" ;;
    --url=*) MANIFEST_URL="${1#--url=}" ;;
    --dry-run) DRY_RUN=1 ;;
    --check) CHECK=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "homelab-pull.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "homelab-pull: $*"; }
run() { if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi; }
manifest_field() { # file, jq-ish path -> value (empty when absent)
  node -e 'try{const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((o,k)=>(o||{})[k],m);if(v!==undefined&&v!==null)console.log(v)}catch{}' "$1" "$2"
}

if [ -z "$FROM$MANIFEST_FILE$MANIFEST_URL" ]; then
  echo "homelab-pull.sh: give a manifest source: --from user@host:/path/to/dist | --manifest FILE | --url URL" >&2
  exit 2
fi
if [ ! -x "$DIR/redeploy.sh" ]; then
  echo "homelab-pull.sh: no executable redeploy.sh in $DIR (expected the prod install dir)" >&2
  exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. Fetch the manifest.
if [ -n "$MANIFEST_FILE" ]; then
  cp "$MANIFEST_FILE" "$WORK/release-manifest.json"
elif [ -n "$MANIFEST_URL" ]; then
  run curl -sfL "$MANIFEST_URL" -o "$WORK/release-manifest.json" || exit 1
elif [[ "$FROM" == *:* ]]; then
  run scp "$FROM/release-manifest.json" "$WORK/release-manifest.json" || exit 1
else
  cp "$FROM/release-manifest.json" "$WORK/release-manifest.json"
fi
NEW_COMMIT="$(manifest_field "$WORK/release-manifest.json" commit)"
[ -n "$NEW_COMMIT" ] || { echo "homelab-pull.sh: fetched manifest has no commit field" >&2; exit 1; }

# 2. Compare with the installed manifest.
OLD_COMMIT=""
[ -f "$DIR/release-manifest.json" ] && OLD_COMMIT="$(manifest_field "$DIR/release-manifest.json" commit)"
if [ -n "$OLD_COMMIT" ] && [ "$OLD_COMMIT" = "$NEW_COMMIT" ] && [ "$FORCE" != "1" ]; then
  log "already current ($NEW_COMMIT) — nothing to do."
  exit 0
fi
if [ "$CHECK" = "1" ]; then
  log "UPDATE_AVAILABLE (installed: ${OLD_COMMIT:-none} -> published: $NEW_COMMIT)."
  exit 3
fi
NEW_BT="$(manifest_field "$WORK/release-manifest.json" components.backend.tag)"
NEW_FT="$(manifest_field "$WORK/release-manifest.json" components.frontend.tag)"
log "rolling forward (installed: ${OLD_COMMIT:-none} -> published: $NEW_COMMIT, backend: ${NEW_BT:-?}, frontend: ${NEW_FT:-?})."

# 3. Fetch the runner tarball when the manifest names one and we have a remote/dir source.
ARTIFACT="$(manifest_field "$WORK/release-manifest.json" components.runner.artifact)"
if [ -n "$ARTIFACT" ] && [ ! -f "$DIR/$ARTIFACT" ]; then
  if [[ "${FROM:-}" == *:* ]]; then
    run scp "$FROM/$ARTIFACT" "$WORK/$ARTIFACT" && cp "$WORK/$ARTIFACT" "$DIR/" || log "WARN: runner tarball $ARTIFACT not fetched — --runner updates will need it."
  elif [ -n "${FROM:-}" ] && [ -f "$FROM/$ARTIFACT" ]; then
    cp "$FROM/$ARTIFACT" "$DIR/"
  else
    log "WARN: runner tarball $ARTIFACT not beside the manifest source — leaving $DIR tarballs as-is."
  fi
fi

# 4. Install the manifest and roll forward.
if [ "$DRY_RUN" = "1" ]; then
  echo "would run: cp $WORK/release-manifest.json $DIR/release-manifest.json"
  echo "would run: (cd $DIR && ./redeploy.sh --all)"
  exit 0
fi
cp "$WORK/release-manifest.json" "$DIR/release-manifest.json"
(cd "$DIR" && ./redeploy.sh --all)
