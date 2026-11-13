#!/usr/bin/env bash
# Start (or ensure) a native KainBain Runner from this install folder.
# Runners stay native (harness CLIs live on the host); only backend/frontend are Dockerised.
#   ./startRunner.sh --id local-pi [--backend http://localhost:3100]
#   ./startRunner.sh --id local-pi --manual --harness pi [--backend http://localhost:3100]
#   ./startRunner.sh --id local-pi --manual --harnesses pi,muse [--backend http://localhost:3100]
#   ./startRunner.sh --ensure    # (re)create units for existing ~/.kainbain/runner-*.env, restart them
#   ./startRunner.sh --restart   # restart all kainbain-runner-* units onto the files in ./runner
# Harness selection defaults to auto-detect: the installer probes PATH plus
# the standard install dirs (~/.local/bin, ~/bin), each harness's own
# install dir (pi: ~/.pi/agent/bin, $PI_AGENT_DIR/bin), and the
# KAINBAIN_*_BIN overrides — the same probe set the daemon uses
# (runner/daemon.js detectAvailableHarnesses); a configured
# ~/.pi/agent/models.json snapshot also counts for pi. The probe only
# validates (fail-fast when nothing is found): the env file keeps
# KAINBAIN_RUNNER_HARNESSES=auto so every boot re-detects and a harness
# installed later is picked up on restart. Pass --manual with --harness or
# --harnesses to pin a list instead (mock has no CLI, so it is manual-only;
# use it to deliberately exclude an installed harness).
set -euo pipefail
cd "$(dirname "$0")"
ID="" HARNESS="auto" HARNESSES="" MANUAL=0 HARNESS_SET=0 BACKEND="http://localhost:3100" MODE="create"
while [ $# -gt 0 ]; do case "$1" in
  --id) ID="${2:?}"; shift 2;; --harness) HARNESS="${2:?}"; HARNESS_SET=1; shift 2;;
  --harness=*) HARNESS="${1#--harness=}"; HARNESS_SET=1; shift;;
  --harnesses) HARNESSES="${2:?}"; HARNESS_SET=1; shift 2;;
  --harnesses=*) HARNESSES="${1#--harnesses=}"; HARNESS_SET=1; shift;;
  --manual) MANUAL=1; shift;; --auto) MANUAL=0; HARNESS="auto"; HARNESSES=""; HARNESS_SET=0; shift;;
  --backend) BACKEND="${2:?}"; shift 2;; --backend=*) BACKEND="${1#--backend=}"; shift;;
  --ensure) MODE="ensure"; shift;;
  --restart) MODE="restart"; shift;; -h|--help) sed -n '2,17p' "$0"; exit 0;;
  *) echo "Unknown arg: $1" >&2; exit 2;; esac; done
NODE_BIN="$(command -v node || true)"; [ -n "$NODE_BIN" ] || { echo "node not found" >&2; exit 1; }
RUNNER_MAIN="$PWD/runner/runner/main.js"
[ -f "$RUNNER_MAIN" ] || { echo "Runner files missing: $RUNNER_MAIN (re-run deploy.sh --prod)" >&2; exit 1; }
if [ ! -d "$PWD/runner/api/node_modules" ]; then
  echo "Installing runner dependencies (first start)..."
  npm ci --prefix "$PWD/runner/api" --omit=dev
fi
detect_harnesses() {
  local out=""
  add_h() { if [ -z "$out" ]; then out="$1"; else out="$out,$1"; fi; }
  # Same probe set as the daemon (runner/daemon.js detectAvailableHarnesses):
  # PATH, the standard install dirs, each harness's own install dir, and the
  # KAINBAIN_*_BIN overrides. SDK-style pi installs under ~/.pi/agent are
  # often not on the service PATH, so probe those dirs explicitly (and accept
  # the models.json snapshot as proof of a configured pi stack, like the
  # backend does). Detection names only the binary each harness spawns
  # (antigravity: `agy`), so a detected harness can always run stages.
  local dirs="$PATH:$HOME/.local/bin:$HOME/bin"
  [ -n "${PI_AGENT_DIR:-}" ] && dirs="$dirs:$PI_AGENT_DIR/bin"
  dirs="$dirs:$HOME/.pi/agent/bin"
  # Colon-split without word-splitting the entries, so directories containing
  # spaces still resolve (the old `for d in $(... | tr ':' ' ')` broke them).
  find_bin() {
    local rest="$dirs" d
    while [ -n "$rest" ]; do
      d="${rest%%:*}"
      if [ "$rest" = "$d" ]; then rest=""; else rest="${rest#*:}"; fi
      [ -n "$d" ] && [ -x "$d/$1" ] && return 0
    done
    return 1
  }
  # Env override (KAINBAIN_MUSE_BIN etc.): a value with a slash names the file
  # directly; a bare name is searched like a PATH binary. Empty reads as unset.
  override_hit() {
    case "${1:-}" in
      "") return 1;;
      */*) [ -x "$1" ] && return 0 || return 1;;
      *) find_bin "$1" && return 0 || return 1;;
    esac
  }
  # One CLI harness: a set override replaces the default name (backend
  # parity — a typo'd override reads as missing, never falls back).
  detect_one() {
    if [ -n "${1:-}" ]; then
      override_hit "$1" && add_h "$3"
    elif find_bin "$2"; then
      add_h "$3"
    fi
  }
  if find_bin pi; then add_h "pi"; else
    [ -f "${PI_AGENT_DIR:-$HOME/.pi/agent}/models.json" ] && add_h "pi"
  fi
  detect_one "${KAINBAIN_MUSE_BIN:-}" muse muse
  detect_one "${KAINBAIN_AGY_BIN:-}" agy antigravity
  detect_one "${KAINBAIN_VIBE_BIN:-}" vibe vibe
  printf '%s' "$out"
}
is_auto_token() { [ "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" = "auto" ]; }
resolve_harness_selection() {
  # Explicit --harness/--harnesses implies manual for back-compat.
  if [ "$HARNESS_SET" = "1" ] && [ "$MANUAL" = "0" ]; then
    if [ -n "$HARNESSES" ]; then
      case "$HARNESSES" in *[aA][uU][tT][oO]*) MANUAL=0;; *) MANUAL=1;; esac
    elif ! is_auto_token "$HARNESS"; then
      MANUAL=1
    fi
  fi
  if [ "$MANUAL" = "1" ]; then
    if [ -z "$HARNESSES" ]; then
      if [ "$HARNESS_SET" = "0" ] || is_auto_token "$HARNESS"; then
        echo "--manual requires --harness NAME or --harnesses CSV (e.g. --manual --harness pi)" >&2; exit 2
      fi
      HARNESSES="$HARNESS"
    fi
    case "$HARNESSES" in *[aA][uU][tT][oO]*)
      echo "--manual cannot be combined with auto (remove --manual or replace the auto value)" >&2; exit 2;;
    esac
    HARNESS="$(printf '%s' "$HARNESSES" | cut -d, -f1 | tr -d ' ')"
    [ -n "$HARNESS" ] || { echo "--manual requires a non-empty harness list" >&2; exit 2; }
  else
    if [ -z "$HARNESSES" ] || is_auto_token "$HARNESSES"; then
      DETECTED="$(detect_harnesses)"
      if [ -z "$DETECTED" ]; then
        echo "Runner auto-detect found no harnesses (probed pi, muse, agy, vibe on PATH, ~/.local/bin, ~/bin, and pi via ~/.pi/agent); install one or re-run with --manual --harness NAME." >&2; exit 1
      fi
      # The probe only validates: the env file keeps `auto` so every boot
      # re-detects and a harness installed later is picked up on restart —
      # a frozen csv would hide it from discovery until edited by hand.
      echo "Auto-detected harnesses: $DETECTED (recorded as auto: every boot re-detects)"
      HARNESS="auto"; HARNESSES="auto"
    else
      MANUAL=1
    fi
    if [ "$MANUAL" = "1" ]; then
      HARNESS="$(printf '%s' "$HARNESSES" | cut -d, -f1 | tr -d ' ')"
    fi
  fi
}
restart_units() { for u in "$HOME"/.config/systemd/user/kainbain-runner-*.service; do [ -e "$u" ] || continue; systemctl --user restart "$(basename "$u")" 2>/dev/null && echo "Restarted $(basename "$u")" || echo "WARN: restart failed: $u"; done; }
if [ "$MODE" = "restart" ]; then restart_units; exit 0; fi
if [ "$MODE" = "ensure" ]; then
  # Point every DIRECT runner unit at this install's runner files, then
  # restart all units. Wrapper units are skipped (their WorkingDirectory is
  # the versioned install root, which a deploy must never rewrite — wrapper
  # runners advance through releases, not through deploy copies).
  for u in "$HOME"/.config/systemd/user/kainbain-runner-*.service; do [ -e "$u" ] || continue
    if grep -q 'kainbain-runner' "$u"; then echo "ensure: $(basename "$u") is on the wrapper (left alone)"; continue; fi
    sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$PWD/runner/runner|" "$u"; done
  systemctl --user daemon-reload 2>/dev/null || true; restart_units; exit 0
fi
[ -n "$ID" ] || { echo "--id is required (e.g. --id local-pi)" >&2; exit 2; }
resolve_harness_selection
SHORT="${ID#local-}"; ENV_FILE="$HOME/.kainbain/runner-${SHORT}.env"; [ "$SHORT" = "$ID" ] && ENV_FILE="$HOME/.kainbain/runner-${ID}.env"
UNIT="$HOME/.config/systemd/user/kainbain-runner-${SHORT}.service"; [ "$SHORT" = "$ID" ] && UNIT="$HOME/.config/systemd/user/kainbain-runner-${ID}.service"
INSTALL_ROOT="${KAINBAIN_RUNNER_INSTALL_ROOT:-$HOME/.kainbain/runner-install}"
mkdir -p "$HOME/.kainbain" "$HOME/.config/systemd/user"
if [ ! -f "$ENV_FILE" ]; then
  JOIN=""; [ -f "$HOME/.kainbain/runner-join.token" ] && JOIN="$(cat "$HOME/.kainbain/runner-join.token")"
  { echo "PATH=$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin"; echo "HOME=$HOME"
    echo "KAINBAIN_RUNNER_BACKEND=$BACKEND"; echo "KAINBAIN_RUNNER_JOIN_TOKEN=$JOIN"
    echo "KAINBAIN_RUNNER_ID=$ID"; echo "KAINBAIN_RUNNER_HARNESS=$HARNESS"; echo "KAINBAIN_RUNNER_HARNESSES=$HARNESSES"
    echo "KAINBAIN_RUNNER_DISPATCH=1"; echo "KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT=0"
    echo "KAINBAIN_RUNNER_WORK_ROOT=$HOME/.kainbain/runner-work"
    echo "KAINBAIN_RUNNER_INSTALL_ROOT=$INSTALL_ROOT"; } > "$ENV_FILE"; chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE (harnesses $HARNESSES) — approve in Settings > Harness > Runners; the Runner collects its own credential (paste KAINBAIN_RUNNER_CREDENTIAL only if it asks for it)."
fi
if [ -f "$UNIT" ] && grep -q 'kainbain-runner' "$UNIT"; then
  echo "Unit $(basename "$UNIT") is already on the wrapper (left alone)."
else
  # New (or direct-entrypoint) units boot through the self-update wrapper:
  # lay the versioned tree down FIRST so a bad tree aborts the install.
  . "$PWD/scripts/lib/runner-install-root.sh"
  LAID_VERSION="$(lay_down_runner_install_root "$PWD/runner" "$INSTALL_ROOT")" || exit 1
  echo "Laid down $INSTALL_ROOT/releases/$LAID_VERSION/unpacked (+ wrapper shim)"
  cat > "$UNIT" <<EOF
[Unit]
Description=KainBain Runner $ID
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=$INSTALL_ROOT
EnvironmentFile=$ENV_FILE
ExecStart=$INSTALL_ROOT/bin/kainbain-runner
Restart=always
RestartSec=5
[Install]
WantedBy=default.target
EOF
fi
systemctl --user daemon-reload; systemctl --user enable --now "$(basename "$UNIT")"
echo "Runner $ID running via $(basename "$UNIT") (backend $BACKEND, harnesses $HARNESSES)"
