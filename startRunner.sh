#!/usr/bin/env bash
# Start (or ensure) a native KainBain Runner from this install folder.
# Runners stay native (harness CLIs live on the host); only backend/frontend are Dockerised.
#   ./startRunner.sh --id local-pi --harness pi [--backend http://localhost:3100]
#   ./startRunner.sh --ensure    # (re)create units for existing ~/.kainbain/runner-*.env, restart them
#   ./startRunner.sh --restart   # restart all kainbain-runner-* units onto the files in ./runner
set -euo pipefail
cd "$(dirname "$0")"
ID="" HARNESS="pi" BACKEND="http://localhost:3100" MODE="create"
while [ $# -gt 0 ]; do case "$1" in
  --id) ID="${2:?}"; shift 2;; --harness) HARNESS="${2:?}"; shift 2;;
  --backend) BACKEND="${2:?}"; shift 2;; --ensure) MODE="ensure"; shift;;
  --restart) MODE="restart"; shift;; -h|--help) sed -n '2,8p' "$0"; exit 0;;
  *) echo "Unknown arg: $1" >&2; exit 2;; esac; done
NODE_BIN="$(command -v node || true)"; [ -n "$NODE_BIN" ] || { echo "node not found" >&2; exit 1; }
RUNNER_MAIN="$PWD/runner/runner/main.js"
[ -f "$RUNNER_MAIN" ] || { echo "Runner files missing: $RUNNER_MAIN (re-run deploy.sh --prod)" >&2; exit 1; }
if [ ! -d "$PWD/runner/api/node_modules" ]; then
  echo "Installing runner dependencies (first start)..."
  npm ci --prefix "$PWD/runner/api" --omit=dev
fi
restart_units() { for u in "$HOME"/.config/systemd/user/kainbain-runner-*.service; do [ -e "$u" ] || continue; systemctl --user restart "$(basename "$u")" 2>/dev/null && echo "Restarted $(basename "$u")" || echo "WARN: restart failed: $u"; done; }
if [ "$MODE" = "restart" ]; then restart_units; exit 0; fi
if [ "$MODE" = "ensure" ]; then
  # Point every existing runner unit at this install's runner files, then restart.
  for u in "$HOME"/.config/systemd/user/kainbain-runner-*.service; do [ -e "$u" ] || continue
    sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$PWD/runner/runner|" "$u"; done
  systemctl --user daemon-reload 2>/dev/null || true; restart_units; exit 0
fi
[ -n "$ID" ] || { echo "--id is required (e.g. --id local-pi)" >&2; exit 2; }
SHORT="${ID#local-}"; ENV_FILE="$HOME/.kainbain/runner-${SHORT}.env"; [ "$SHORT" = "$ID" ] && ENV_FILE="$HOME/.kainbain/runner-${ID}.env"
UNIT="$HOME/.config/systemd/user/kainbain-runner-${SHORT}.service"; [ "$SHORT" = "$ID" ] && UNIT="$HOME/.config/systemd/user/kainbain-runner-${ID}.service"
mkdir -p "$HOME/.kainbain" "$HOME/.config/systemd/user"
if [ ! -f "$ENV_FILE" ]; then
  JOIN=""; [ -f "$HOME/.kainbain/runner-join.token" ] && JOIN="$(cat "$HOME/.kainbain/runner-join.token")"
  { echo "PATH=$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin"; echo "HOME=$HOME"
    echo "KAINBAIN_RUNNER_BACKEND=$BACKEND"; echo "KAINBAIN_RUNNER_JOIN_TOKEN=$JOIN"
    echo "KAINBAIN_RUNNER_ID=$ID"; echo "KAINBAIN_RUNNER_HARNESS=$HARNESS"
    echo "KAINBAIN_RUNNER_DISPATCH=1"; echo "KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT=0"
    echo "KAINBAIN_RUNNER_WORK_ROOT=$HOME/.kainbain/runner-work"; } > "$ENV_FILE"; chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE — approve in Settings > Harness > Runners, paste credential as KAINBAIN_RUNNER_CREDENTIAL, re-run."
fi
cat > "$UNIT" <<EOF
[Unit]
Description=KainBain Runner $ID
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=$PWD/runner/runner
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN main.js
Restart=always
RestartSec=5
[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload; systemctl --user enable --now "$(basename "$UNIT")"
echo "Runner $ID running via $(basename "$UNIT") (backend $BACKEND)"
