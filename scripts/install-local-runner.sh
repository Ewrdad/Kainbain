#!/usr/bin/env bash
# Install (or ensure) the default local Runner service.
#
# The Runner binary is identical for local and remote hosts — only the
# environment points elsewhere:
#   local:  KAINBAIN_RUNNER_BACKEND=http://localhost:3100 (default)
#   remote: KAINBAIN_RUNNER_BACKEND=https://kainbain.home (or the backend URL)
# plus the per-Runner credential issued at approval time.
#
# Idempotent: never overwrites an existing env file or credential. Safe to
# re-run after every deploy (deploy.sh calls it in ensure mode).
#
# Usage:
#   scripts/install-local-runner.sh [--id local-pi] [--harness pi]
#     [--backend http://localhost:3100] [--ensure] [--dry-run]
#
# After install: approve the Runner once in Settings > Harness > Runners
# (or POST /runners/:id/approve), paste the shown credential into
# ~/.kainbain/runner-local-<id>.env as KAINBAIN_RUNNER_CREDENTIAL, and
# restart the unit. The daemon exits with instructions until then (D4).
set -euo pipefail

ID="local-alpha"
HARNESS="pi"
BACKEND="http://localhost:3100"
ENSURE=0
DRY_RUN=0

while [ $# -gt 0 ]; do
	case "$1" in
		--id) ID="${2:?--id needs a value}"; shift 2 ;;
		--harness) HARNESS="${2:?--harness needs a value}"; shift 2 ;;
		--backend) BACKEND="${2:?--backend needs a value}"; shift 2 ;;
		--ensure) ENSURE=1; shift ;;
		--dry-run) DRY_RUN=1; shift ;;
		-h|--help) sed -n '1,20p' "$0"; exit 0 ;;
		*) echo "Unknown arg: $1 (see --help)" >&2; exit 2 ;;
	esac
done

SHORT="${ID#local-}"
UNIT="kainbain-runner-local-${SHORT}.service"
ENV_FILE="$HOME/.kainbain/runner-local-${SHORT}.env"
UNIT_FILE="$HOME/.config/systemd/user/${UNIT}"
# Production checkout first (version-locked with the backend after deploy),
# repo checkout as a dev fallback.
RUNNER_DIR="$HOME/apps/kainbain/runner"
[ -d "$RUNNER_DIR" ] || RUNNER_DIR="$(cd "$(dirname "$0")/../runner" && pwd)"
NODE_BIN="$(command -v node)"

if [ "$DRY_RUN" -eq 1 ]; then
	echo "UNIT=$UNIT_FILE"
	echo "ENV=$ENV_FILE"
	echo "RUNNER_DIR=$RUNNER_DIR"
	echo "BACKEND=$BACKEND"
	exit 0
fi

mkdir -p "$HOME/.kainbain" "$HOME/.config/systemd/user" "$(dirname "$RUNNER_DIR")"

if [ ! -f "$ENV_FILE" ]; then
	JOIN_TOKEN="${KAINBAIN_RUNNER_JOIN_TOKEN:-}"
	if [ -f "$HOME/.kainbain/runner-join.token" ] && [ -z "$JOIN_TOKEN" ]; then
		JOIN_TOKEN="$(cat "$HOME/.kainbain/runner-join.token")"
	fi
	{
		echo "PATH=$HOME/.nvm/versions/node/v26.4.0/bin:/usr/local/bin:/usr/bin:/bin"
		echo "HOME=$HOME"
		echo "KAINBAIN_RUNNER_BACKEND=$BACKEND"
		echo "KAINBAIN_RUNNER_JOIN_TOKEN=$JOIN_TOKEN"
		echo "KAINBAIN_RUNNER_ID=$ID"
		echo "KAINBAIN_RUNNER_HARNESS=$HARNESS"
		echo "KAINBAIN_RUNNER_DISPATCH=1"
		echo "KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT=0"
		echo "KAINBAIN_RUNNER_DISPATCH_POLL_MS=5000"
		echo "KAINBAIN_RUNNER_WORK_ROOT=$HOME/.kainbain/runner-work"
	} >"$ENV_FILE"
	chmod 600 "$ENV_FILE"
	if [ -n "$JOIN_TOKEN" ]; then
		echo "Wrote $ENV_FILE (join token present; approve in Settings)."
	else
		echo "Wrote $ENV_FILE (join token MISSING — set KAINBAIN_RUNNER_JOIN_TOKEN)."
	fi
elif [ "$ENSURE" -eq 0 ]; then
	echo "Exists (left alone): $ENV_FILE"
fi

if [ ! -f "$UNIT_FILE" ]; then
	cat >"$UNIT_FILE" <<EOF
[Unit]
Description=KainBain local Runner $ID (wire executor, runner-only)
After=network-online.target kainbain.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$RUNNER_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN main.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
	echo "Wrote $UNIT_FILE"
elif [ "$ENSURE" -eq 0 ]; then
	echo "Exists (left alone): $UNIT_FILE"
fi

if command -v systemctl >/dev/null 2>&1; then
	systemctl --user daemon-reload 2>/dev/null || true
	systemctl --user enable "$UNIT" 2>/dev/null || true
	if [ "$ENSURE" -eq 0 ]; then
		systemctl --user restart "$UNIT" 2>/dev/null \
			&& echo "Restarted $UNIT." \
			|| echo "Enable done; start it with: systemctl --user start $UNIT"
	fi
else
	echo "systemctl not found — unit + env files are in place; start manually."
fi

echo "Runner env uses SHORT id '$SHORT' ($ENV_FILE) with full runner id '$ID'."
echo "Next: approve '$ID' in Settings > Harness > Runners, put the credential"
echo "in $ENV_FILE as KAINBAIN_RUNNER_CREDENTIAL, then restart $UNIT."
