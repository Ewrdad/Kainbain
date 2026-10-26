#!/bin/sh -e
# KainBain container entrypoint (WP-8): verify task-storage mounts BEFORE the
# server boots, fix bind-mount ownership, then drop to the non-root `node` user.
#
# Storage-mount safety (2026-10-02 incident: unreachable storage was served as
# a silent empty list, hiding tasks from the UI): an unreachable or unwritable
# PROJECTS_ROOT is a fatal boot error (exit 1 with an actionable message),
# never a silent empty scan. An empty-but-writable directory is a healthy
# fresh boot, not a failure. Per-project link verification keeps running
# in-app via ProjectStore.ensureDocsLink.

PROJECTS_ROOT="${PROJECTS_ROOT:-/workspace/projects}"
NOTES_SPACE_ROOT="${NOTES_SPACE_ROOT:-/home/node/.kainbain/notes}"
STATE_DIR="/home/node/.kainbain"

fail() {
	echo "kainbain-entrypoint: ERROR: $1" >&2
	exit 1
}

ensure_writable_dir() {
	# $1 = path, $2 = label for messages
	_dir="$1"
	_label="$2"
	if ! mkdir -p "$_dir" 2>/dev/null; then
		fail "$_label '$_dir' is unreachable (mkdir failed) - check the mount. Refusing to boot rather than serve an empty task list."
	fi
	_probe="$_dir/.kainbain-write-probe"
	if ! touch "$_probe" 2>/dev/null; then
		fail "$_label '$_dir' is not writable - check mount permissions. Refusing to boot rather than serve an empty task list."
	fi
	rm -f "$_probe"
	echo "kainbain-entrypoint: $_label '$_dir' OK"
}

ensure_writable_dir "$PROJECTS_ROOT" "projects root (PROJECTS_ROOT)"
ensure_writable_dir "$(dirname "$NOTES_SPACE_ROOT")" "notes space parent (NOTES_SPACE_ROOT)"
ensure_writable_dir "$STATE_DIR" "state dir"
if [ -e "$NOTES_SPACE_ROOT" ] && [ ! -d "$NOTES_SPACE_ROOT" ]; then
	fail "notes space (NOTES_SPACE_ROOT) '$NOTES_SPACE_ROOT' exists but is not a directory - refusing to boot."
fi

# Lockstep version stamp (MigrationPlan Phase 1 WP-1.1, D7): /status reports
# build.json from the production dir (see api/deployManager.js readBuild).
# deploy.sh stamps it on host deploys; in compose there is no deploy.sh, so
# the entrypoint stamps it from the image build args at every boot. Numbers
# and refs are sanitised so build.json is always valid JSON.
PROD_DIR="${KAINBAIN_PROD_DIR:-/home/node/apps/kainbain}"
case "${KAINBAIN_BUILD_NUMBER:-0}" in ''|*[!0-9]*) STAMP_NUMBER=0 ;; *) STAMP_NUMBER="$KAINBAIN_BUILD_NUMBER" ;; esac
STAMP_COMMIT="$(printf '%s' "${KAINBAIN_BUILD_REF:-unknown}" | tr -d '"\\')"
if mkdir -p "$PROD_DIR" 2>/dev/null; then
	cat >"$PROD_DIR/build.json" <<EOF
{
  "buildNumber": $STAMP_NUMBER,
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$STAMP_COMMIT"
}
EOF
	chown -R node:node "$PROD_DIR" || fail "cannot chown build stamp dir '$PROD_DIR' - check mount permissions."
	echo "kainbain-entrypoint: build stamp OK (buildNumber=$STAMP_NUMBER commit=$STAMP_COMMIT)"
fi

# Fresh clones bind-mount host dirs Docker auto-creates as root; hand them to
# the runtime user before dropping privileges.
chown -R node:node "$PROJECTS_ROOT" "$STATE_DIR" || fail "cannot chown storage to user 'node' - check mount permissions."
echo "kainbain-entrypoint: ownership OK, starting as 'node': $*"

exec su-exec node "$@"
