#!/usr/bin/env bash
# uninstall.sh — remove a KainBain install created by deploy/install.sh.
# Canonical copy: deploy/uninstall.sh in the repo. The ad-site serves the same
# file at https://kainbain.ewrdad.uk/uninstall.sh (scripts/sync-adsite.sh copies
# it into the site's public/ folder), so a botched install can be recovered
# without a working checkout:
#   curl -fsSL https://kainbain.ewrdad.uk/uninstall.sh | bash -s -- --install-dir ~/apps/kainbain
# or from beside the install:
#   ./uninstall.sh [--images] [--purge --yes] [--dry-run]
# Self-contained by design: install.sh is served standalone (curl | bash), so
# there is no shared lib to source. The Runner unit/env/credential filename
# patterns below deliberately mirror startRunner.sh (unit:
# ~/.config/systemd/user/kainbain-runner-<short>.service,
# WorkingDirectory=<install>/runner/runner, EnvironmentFile=<env>) and
# runner/credentialFile.js (sibling runner-<short>.credential); the
# deploy/uninstall.test.sh parity case proves they still match.
# Default is state-preserving: the compose stack, this install's Runner units
# (+ their env/credential files), and the install bookkeeping (compose file,
# .env, manifests, helper scripts, runner files, downloaded tarball) are
# removed, while user state is kept: projects/, data/, notes/ under the
# install dir, the shared ~/.kainbain/runner-join.token, task workdirs, and
# any state dir outside the install dir. --purge deletes that state too
# (external dirs are still kept — remove them by hand).
set -uo pipefail

INSTALL_DIR="$HOME/apps/kainbain"
IMAGES=0; PURGE=0; YES=0; DRY_RUN=0; ALL_RUNNERS=0

usage() { sed -n '2,20p' "$0" 2>/dev/null; cat <<'EOF'
Usage: uninstall.sh [options]
  --install-dir DIR     Install folder to remove (default ~/apps/kainbain)
  --images              Also remove the pulled backend/frontend images
  --purge               Also delete user state under the install dir
                        (projects/, data/, notes/) and the shared join token.
                        Requires confirmation: answer the prompt or pass --yes.
                        State dirs OUTSIDE the install dir are always kept.
  --yes, -y             Confirm --purge without prompting (non-interactive)
  --all-runners         Remove ALL kainbain-runner-* units and runner env/
                        credential files, not just this install's own
  --dry-run             Print every action, change nothing
  -h, --help            This help
Exit codes: 0 removed (or nothing to remove), 1 failed or declined, 2 usage error.
EOF
}
while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) shift; INSTALL_DIR="${1:?--install-dir needs a value}" ;;
    --install-dir=*) INSTALL_DIR="${1#--install-dir=}" ;;
    --images) IMAGES=1 ;;
    --purge) PURGE=1 ;;
    --yes|-y) YES=1 ;;
    --all-runners) ALL_RUNNERS=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "uninstall.sh: unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "uninstall: $*"; }
run() { if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi; }
remove_file() { if [ "$DRY_RUN" = "1" ]; then echo "would remove: $1"; else echo "removing $1"; rm -f "$1"; fi; }
remove_dir() { if [ "$DRY_RUN" = "1" ]; then echo "would remove: $1/"; else echo "removing $1/"; rm -rf "$1"; fi; }

# --- Guards (before anything destructive) --------------------------------------
[ -n "$INSTALL_DIR" ] || { echo "uninstall.sh: --install-dir must not be empty" >&2; exit 2; }
case "$INSTALL_DIR" in "/"|"$HOME") echo "uninstall.sh: refusing to uninstall $INSTALL_DIR itself" >&2; exit 2 ;; esac
if [ "$PURGE" = "1" ] && [ "$YES" != "1" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    echo "would ask: type PURGE to confirm deleting user state under $INSTALL_DIR"
  elif [ -t 0 ]; then
    printf 'uninstall: --purge deletes projects/, data/, notes/ under %s and the shared join token. Type PURGE to confirm: ' "$INSTALL_DIR" >&2
    read -r answer || answer=""
    [ "$answer" = "PURGE" ] || { echo "uninstall.sh: purge declined — nothing removed (re-run with --yes to confirm)" >&2; exit 1; }
  else
    echo "uninstall.sh: --purge deletes user state; re-run with --yes to confirm (or run interactively and type PURGE). Nothing removed." >&2
    exit 1
  fi
fi
if [ "$PURGE" = "1" ] && [ "$DRY_RUN" != "1" ]; then
  if [ ! -f "$INSTALL_DIR/docker-compose.yml" ] && [ ! -f "$INSTALL_DIR/.env" ] && [ ! -f "$INSTALL_DIR/release-manifest.json" ]; then
    echo "uninstall.sh: $INSTALL_DIR has no docker-compose.yml, .env, or release-manifest.json — refusing --purge there (wrong --install-dir?)" >&2
    exit 1
  fi
fi

# State-dir locations follow install.sh: .env overrides win, else the
# install-dir defaults.
PROJECTS_DIR="$INSTALL_DIR/projects"; STATE_DIR="$INSTALL_DIR/data"; NOTES_DIR="$INSTALL_DIR/notes"
if [ -f "$INSTALL_DIR/.env" ]; then
  val_of() { grep -E "^$1=" "$INSTALL_DIR/.env" | tail -1 | cut -d= -f2-; }
  v="$(val_of KAINBAIN_PROJECTS_HOST)"; [ -n "$v" ] && PROJECTS_DIR="$v"
  v="$(val_of KAINBAIN_STATE_HOST)"; [ -n "$v" ] && STATE_DIR="$v"
  v="$(val_of KAINBAIN_NOTES_HOST)"; [ -n "$v" ] && NOTES_DIR="$v"
fi
under_install() { case "$1/" in "$INSTALL_DIR/"*) return 0 ;; *) return 1 ;; esac; }

log "uninstalling $INSTALL_DIR (images: $IMAGES, purge: $PURGE, all-runners: $ALL_RUNNERS)"

# --- 1. Compose stack ------------------------------------------------------------
if [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
  if command -v docker >/dev/null 2>&1; then
    if [ "$IMAGES" = "1" ]; then (cd "$INSTALL_DIR" && run docker compose down --rmi all) || echo "uninstall.sh: WARN docker compose down --rmi all failed (continuing with file removal)" >&2
    else (cd "$INSTALL_DIR" && run docker compose down) || echo "uninstall.sh: WARN docker compose down failed (continuing with file removal)" >&2; fi
  else
    echo "uninstall.sh: WARN docker not found — stack containers (if any) are left running; stop them by hand" >&2
  fi
else
  log "no docker-compose.yml in $INSTALL_DIR — no stack to stop"
fi

# --- 2. Runner systemd units (+ their env/credential files) -----------------------
# A unit belongs to this install when startRunner.sh pointed its
# WorkingDirectory at this install's runner files; --all-runners takes every
# kainbain-runner-* unit instead (botched-install recovery).
removed_units=0
for unit in "$HOME"/.config/systemd/user/kainbain-runner-*.service; do
  [ -e "$unit" ] || continue
  if [ "$ALL_RUNNERS" != "1" ] && ! grep -qF "WorkingDirectory=$INSTALL_DIR/runner/runner" "$unit" 2>/dev/null; then
    log "keeping unit for another install: $unit"
    continue
  fi
  base="$(basename "$unit")"
  if command -v systemctl >/dev/null 2>&1; then
    if [ "$DRY_RUN" = "1" ]; then echo "would run: systemctl --user disable --now $base"
    else echo "+ systemctl --user disable --now $base"; systemctl --user disable --now "$base" 2>/dev/null || echo "uninstall.sh: WARN could not disable $base (already stopped?)" >&2; fi
  else
    echo "uninstall.sh: WARN systemctl not found — unit $base is left enabled; disable it by hand" >&2
  fi
  # The env file is whatever startRunner.sh recorded as EnvironmentFile=;
  # the credential is its .credential sibling (runner/credentialFile.js).
  env_file="$(grep -E '^EnvironmentFile=' "$unit" 2>/dev/null | tail -1 | cut -d= -f2-)"
  remove_file "$unit"
  removed_units=$((removed_units+1))
  if [ -n "$env_file" ]; then
    [ -e "$env_file" ] && remove_file "$env_file"
    cred="${env_file%.env}.credential"
    [ "$cred" != "$env_file" ] && [ -e "$cred" ] && remove_file "$cred"
  fi
done
if [ "$removed_units" -gt 0 ] && command -v systemctl >/dev/null 2>&1; then
  run systemctl --user daemon-reload || true
fi
[ "$removed_units" = "0" ] && log "no Runner units to remove"
if [ "$ALL_RUNNERS" = "1" ]; then
  # Orphaned env/credential files whose unit file is already gone (only the
  # runner- prefix startRunner.sh and credentialFile.js write — the shared
  # join-token file is purge-only, below).
  for f in "$HOME"/.kainbain/runner-*.env "$HOME"/.kainbain/runner-*.credential; do
    [ -e "$f" ] || continue
    remove_file "$f"
  done
fi

# --- 3. Install dir ---------------------------------------------------------------
if [ "$PURGE" = "1" ]; then
  for d in "$PROJECTS_DIR" "$STATE_DIR" "$NOTES_DIR"; do
    if ! under_install "$d" && [ -e "$d" ]; then
      log "keeping external state dir (outside the install dir): $d"
    fi
  done
  if [ -e "$INSTALL_DIR" ]; then remove_dir "$INSTALL_DIR"; else log "$INSTALL_DIR already gone"; fi
  token="$HOME/.kainbain/runner-join.token"
  [ -e "$token" ] && remove_file "$token"
  log "purged $INSTALL_DIR and the shared join token"
else
  for f in docker-compose.yml .env release-manifest.json update.sh redeploy.sh uninstall.sh startRunner.sh; do
    [ -e "$INSTALL_DIR/$f" ] && remove_file "$INSTALL_DIR/$f"
  done
  [ -e "$INSTALL_DIR/runner" ] && remove_dir "$INSTALL_DIR/runner"
  for t in "$INSTALL_DIR"/kainbain-runner-*.tar.gz; do [ -e "$t" ] && remove_file "$t"; done
  for d in "$PROJECTS_DIR" "$STATE_DIR" "$NOTES_DIR"; do
    if [ -e "$d" ]; then log "keeping user state: $d"; fi
  done
  log "removed the stack, Runner units, and install bookkeeping; user state kept (re-run with --purge --yes to delete it)"
fi
log "task workdirs under $HOME/.kainbain/runner-work (if any) are left alone — delete them by hand if the install truly starts over"
log "done."
