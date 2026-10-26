#!/usr/bin/env bash
# MARK: drain-ports.sh
# @description Best-effort reclamation of the canary suite's DEDICATED scratch
#   ports (API :3399, vite :5299) before `deploy.sh` runs the `canary-e2e`
#   gate. A scratch stack orphaned by an aborted/killed Playwright run
#   otherwise makes the gate fail with Playwright's opaque
#   "http://localhost:3399/status is already used" error and blocks the deploy
#   (2026-10-12 incident, task 04170d74 — 22:59:50 canary-e2e failure).
#
#   Safety:
#   - Only the ports passed on the command line are ever touched; `deploy.sh`
#     passes exactly the two scratch ports. Live services use :3100 / :5173 and
#     are never targeted.
#   - When the repository also ships `scripts/canary-preflight.mjs` (the
#     verified scratch-occupant guard) that path is preferred, so an occupant
#     that is NOT a canary scratch process is reported instead of killed and
#     this script still returns without touching it.
#
#   Best-effort by design: it never fails the caller (always exit 0), because a
#   port problem must surface as the gate's own error, not as a deploy-script
#   abort that would skip the gate's real diagnostics.
#   @example scripts/drain-ports.sh            # drains 3399 and 5299
#   @example scripts/drain-ports.sh 3399 5299  # explicit ports
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

default_ports=(3399 5299)
if [ "$#" -gt 0 ]; then
	ports=("$@")
else
	ports=("${default_ports[@]}")
fi

if ! command -v node >/dev/null 2>&1; then
	echo "drain-ports: node not found — cannot drain ports: ${ports[*]} (continuing)." >&2
	exit 0
fi

# Prefer the verified preflight when the repository ships it: it refuses to
# terminate an occupant that does not match the scratch-stack signature, which
# is strictly safer than the generic per-port free below.
if [ -f "$SCRIPT_DIR/canary-preflight.mjs" ]; then
	if out="$(node "$SCRIPT_DIR/canary-preflight.mjs" 2>&1)"; then
		printf '%s\n' "$out"
	else
		printf '%s\n' "$out" >&2
		echo "drain-ports: canary-preflight.mjs could not free the scratch ports safely — leaving its occupant alone (continuing)." >&2
	fi
	exit 0
fi

for port in "${ports[@]}"; do
	case "$port" in
	'' | *[!0-9]*)
		echo "drain-ports: skipping invalid port '$port'." >&2
		continue
		;;
	esac
	# `scripts/free-port.mjs` is the cross-platform, unit-tested reclaimer
	# (net-probe occupancy, per-OS PID lookup, SIGTERM → SIGKILL escalation).
	out="$(node "$SCRIPT_DIR/free-port.mjs" "$port" 2>&1)"
	status=$?
	printf '%s\n' "$out"
	if [ "$status" -ne 0 ]; then
		echo "drain-ports: warning: port $port was not freed (continuing; the canary gate will report the real error)." >&2
	fi
done

exit 0
