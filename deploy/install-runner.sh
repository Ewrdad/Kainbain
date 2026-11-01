#!/usr/bin/env bash
# install-runner.sh — add one native local Runner to an existing (or new) install.
# Canonical copy: deploy/install-runner.sh in the repo. The ad-site serves the
# same file at https://kainbain.ewrdad.uk/install-runner.sh
# (scripts/sync-adsite.sh copies it into the site's public/ folder), so:
#   curl -fsSL https://kainbain.ewrdad.uk/install-runner.sh | bash -s -- --id local-pi-2
#   curl -fsSL https://kainbain.ewrdad.uk/install-runner.sh | bash -s -- --id remote-1 --backend https://kainbain.home --manual --harness opencode
# Harnesses auto-detect by default (pi, muse, antigravity, vibe probed on
# PATH); pass --manual with --harness/--harnesses to pin instead.
# It downloads the published runner tarball named in release-manifest.json,
# verifies its sha256, extracts runner/ + startRunner.sh into the install
# folder (leaving docker-compose.yml and .env alone), then starts the Runner
# via startRunner.sh. Re-running is safe: an existing runner env file is
# never overwritten (startRunner.sh only writes it when missing).
set -uo pipefail

# --- Defaults (every one overridable from the command line) ------------------
INSTALL_DIR="$HOME/apps/kainbain"
RUNNER_ID="local-pi-2"; HARNESS="auto"; HARNESSES=""; MANUAL=0; HARNESS_SET=0; BACKEND=""
RELEASE_URL="https://kainbain.ewrdad.uk"; MANIFEST_URL=""; MANIFEST_FILE=""
CREDENTIAL=""
DRY_RUN=0; FORCE=0

usage() { sed -n '2,13p' "$0" 2>/dev/null; cat <<'EOF'
Usage: install-runner.sh [options]
  --install-dir DIR     Install folder holding startRunner.sh (default ~/apps/kainbain)
  --id ID               Runner id (default local-pi-2)
  --harness NAME        Pin one harness (implies --manual): pi|muse|opencode|codex|vibe|custom|antigravity|mock
  --harnesses CSV       Pin a harness list (implies --manual, e.g. pi,muse)
  --manual              Pin harnesses instead of auto-detecting (requires --harness/--harnesses)
  --auto                Auto-detect harnesses on PATH (default)
  --backend URL         Backend URL (default http://localhost:<port> from .env, else http://localhost:3100)
  --release-url URL     Base URL hosting release-manifest.json + runner tarball
                        (default https://kainbain.ewrdad.uk)
  --manifest-url URL    Full URL of release-manifest.json (default <release-url>/release-manifest.json)
  --manifest FILE       Use a local release-manifest.json instead of downloading
  --credential TOKEN    Runner credential if you already approved one (written to the runner env)
  --dry-run             Print every action, change nothing
  --force               Re-extract runner files even when they look current
  -h, --help            This help
Exit codes: 0 installed (or already installed), 1 failed, 2 usage/prerequisite error.
EOF
}
while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) shift; INSTALL_DIR="${1:?--install-dir needs a value}" ;;
    --install-dir=*) INSTALL_DIR="${1#--install-dir=}" ;;
    --id) shift; RUNNER_ID="${1:?--id needs a value}" ;;
    --id=*) RUNNER_ID="${1#--id=}" ;;
    --runner-id) shift; RUNNER_ID="${1:?--runner-id needs a value}" ;;
    --runner-id=*) RUNNER_ID="${1#--runner-id=}" ;;
    --harness) shift; HARNESS="${1:?--harness needs a value}"; HARNESS_SET=1 ;;
    --harness=*) HARNESS="${1#--harness=}"; HARNESS_SET=1 ;;
    --harnesses) shift; HARNESSES="${1:?--harnesses needs a value}"; HARNESS_SET=1 ;;
    --harnesses=*) HARNESSES="${1#--harnesses=}"; HARNESS_SET=1 ;;
    --manual) MANUAL=1 ;; --auto) MANUAL=0; HARNESS="auto"; HARNESSES=""; HARNESS_SET=0 ;;
    --backend) shift; BACKEND="${1:?--backend needs a value}" ;;
    --backend=*) BACKEND="${1#--backend=}" ;;
    --release-url) shift; RELEASE_URL="${1:?--release-url needs a value}" ;;
    --release-url=*) RELEASE_URL="${1#--release-url=}" ;;
    --manifest-url) shift; MANIFEST_URL="${1:?--manifest-url needs a value}" ;;
    --manifest-url=*) MANIFEST_URL="${1#--manifest-url=}" ;;
    --manifest) shift; MANIFEST_FILE="${1:?--manifest needs a file}" ;;
    --manifest=*) MANIFEST_FILE="${1#--manifest=}" ;;
    --credential) shift; CREDENTIAL="${1:?--credential needs a value}" ;;
    --credential=*) CREDENTIAL="${1#--credential=}" ;;
    --dry-run) DRY_RUN=1 ;; --force) FORCE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install-runner.sh: unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done
[ -z "$MANIFEST_URL" ] && MANIFEST_URL="${RELEASE_URL%/}/release-manifest.json"
[ -z "$RUNNER_ID" ] && { echo "install-runner.sh: --id must not be empty" >&2; exit 2; }

log() { echo "install-runner: $*"; }
run() { if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi; }
field() { # manifest-file component field
  node -e 'try{const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=m?.components?.[process.argv[2]]?.[process.argv[3]];if(v!==undefined&&v!==null)console.log(v)}catch{}' "$1" "$2" "$3";
}

# --- Harness mode: auto by default, explicit --harness/--harnesses implies --manual.
if [ "$HARNESS_SET" = "1" ] && [ "$MANUAL" = "0" ]; then
  if [ -n "$HARNESSES" ]; then case "$HARNESSES" in *[aA][uU][tT][oO]*) ;; *) MANUAL=1;; esac
  elif [ "$(printf '%s' "$HARNESS" | tr '[:upper:]' '[:lower:]')" != "auto" ]; then MANUAL=1; fi
fi
if [ "$MANUAL" = "1" ]; then
  if [ -z "$HARNESSES" ]; then
    if [ "$HARNESS_SET" = "0" ] || [ "$(printf '%s' "$HARNESS" | tr '[:upper:]' '[:lower:]')" = "auto" ]; then
      echo "install-runner.sh: --manual requires --harness NAME or --harnesses CSV" >&2; exit 2
    fi
    HARNESSES="$HARNESS"
  fi
  case "$HARNESSES" in *[aA][uU][tT][oO]*) echo "install-runner.sh: --manual cannot be combined with auto" >&2; exit 2;; esac
  HARNESS_DESC="$HARNESSES (manual)"
else
  HARNESS_DESC="auto-detect"
fi
STARTER_HARNESS_ARGS=()
if [ "$MANUAL" = "1" ]; then STARTER_HARNESS_ARGS=(--manual --harnesses "$HARNESSES"); fi

# --- Prerequisites ------------------------------------------------------------
for t in curl node tar; do command -v "$t" >/dev/null 2>&1 || { echo "install-runner.sh: required tool '$t' not found" >&2; exit 2; }; done
log "installing runner '$RUNNER_ID' (harness $HARNESS_DESC) into $INSTALL_DIR"

# Default backend: the installed stack's port when present, else localhost:3100.
if [ -z "$BACKEND" ] && [ -f "$INSTALL_DIR/.env" ]; then
  _port="$(grep -E '^KAINBAIN_PORT=' "$INSTALL_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2-)"
  [ -n "$_port" ] && BACKEND="http://localhost:$_port"
fi
BACKEND="${BACKEND:-http://localhost:3100}"
log "backend $BACKEND"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
MANIFEST="$WORK/release-manifest.json"
if [ -n "$MANIFEST_FILE" ]; then cp "$MANIFEST_FILE" "$MANIFEST" || { echo "install-runner.sh: cannot read --manifest $MANIFEST_FILE" >&2; exit 1; }
else run curl -fsSL "$MANIFEST_URL" -o "$MANIFEST" || { echo "install-runner.sh: failed to fetch $MANIFEST_URL — check --release-url/--manifest-url, or pass --manifest FILE" >&2; exit 1; }; fi
if [ "$DRY_RUN" = "1" ]; then ARTIFACT="kainbain-runner-<sha>.tar.gz"; RSHA="dry-run";
else ARTIFACT="$(field "$MANIFEST" runner artifact)"; RSHA="$(field "$MANIFEST" runner sha256)"
  [ -n "$ARTIFACT" ] && [ -n "$RSHA" ] || { echo "install-runner.sh: manifest names no runner artifact/sha256 — re-run with a complete manifest" >&2; exit 1; }; fi
log "runner $ARTIFACT (sha256 verified)"

if [ "$DRY_RUN" = "1" ]; then
  echo "would download: ${RELEASE_URL%/}/$ARTIFACT (sha256 verified), extract runner/ + startRunner.sh into $INSTALL_DIR"
  echo "would run: (cd $INSTALL_DIR && ./startRunner.sh --id $RUNNER_ID ${STARTER_HARNESS_ARGS[*]:-} --backend $BACKEND) [harness $HARNESS_DESC]"
  exit 0
fi
run mkdir -p "$INSTALL_DIR"
run curl -fsSL "${RELEASE_URL%/}/$ARTIFACT" -o "$INSTALL_DIR/$ARTIFACT" || { echo "install-runner.sh: failed to download runner tarball ${RELEASE_URL%/}/$ARTIFACT" >&2; exit 1; }
actual="$(sha256sum "$INSTALL_DIR/$ARTIFACT" | awk '{print $1}')"
[ "$actual" = "$RSHA" ] || { echo "install-runner.sh: runner sha256 mismatch (manifest $RSHA, file $actual) — refusing to install it" >&2; exit 1; }
log "runner tarball verified (sha256)"
if [ -f "$INSTALL_DIR/runner/runner/main.js" ] && [ "$FORCE" != "1" ]; then
  log "runner files already present — leaving them (use --force to re-extract)"
else
  tmp="$(mktemp -d)"; tar -xzf "$INSTALL_DIR/$ARTIFACT" -C "$tmp"
  rm -rf "$INSTALL_DIR/runner"; mv "$tmp/runner" "$INSTALL_DIR/runner"; cp "$tmp/startRunner.sh" "$INSTALL_DIR/startRunner.sh"; chmod +x "$INSTALL_DIR/startRunner.sh"; rm -rf "$tmp"
  log "extracted runner files into $INSTALL_DIR"
fi
[ -x "$INSTALL_DIR/startRunner.sh" ] || { echo "install-runner.sh: $INSTALL_DIR/startRunner.sh missing and not in the tarball" >&2; exit 1; }
(cd "$INSTALL_DIR" && run ./startRunner.sh --id "$RUNNER_ID" "${STARTER_HARNESS_ARGS[@]}" --backend "$BACKEND") || { echo "install-runner.sh: runner $RUNNER_ID did not start (see output above)" >&2; exit 1; }
if [ -n "$CREDENTIAL" ]; then
  SHORT="${RUNNER_ID#local-}"; ENV_FILE="$HOME/.kainbain/runner-${SHORT}.env"; [ "$SHORT" = "$RUNNER_ID" ] && ENV_FILE="$HOME/.kainbain/runner-${RUNNER_ID}.env"
  if grep -q '^KAINBAIN_RUNNER_CREDENTIAL=' "$ENV_FILE" 2>/dev/null; then log "credential already set in $ENV_FILE — leaving it";
  else printf '%s=%s\n' "KAINBAIN_RUNNER_CREDENTIAL" "$CREDENTIAL" >> "$ENV_FILE"; log "wrote credential into $ENV_FILE (restarting runner)"; (cd "$INSTALL_DIR" && ./startRunner.sh --restart) >/dev/null 2>&1 || true; fi
fi
log "done. Approve '$RUNNER_ID' in Settings > Harness > Runners if it is not approved yet."
