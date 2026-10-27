#!/bin/bash
# Deployment script for KainBain.
#
#   ./deploy.sh --dev       Start local dev servers (API + Vite frontend).
#   ./deploy.sh --prod      Full production deploy: tests + security scans +
#                           build + deploy to ~/apps/kainbain, restart the
#                           systemd service, reload nginx.
#   ./deploy.sh --prod --fast   Production deploy WITHOUT tests/security scans
#                           (rapid self-iteration; the health-check + rollback
#                           gate below is the safety net).
#   ./deploy.sh --rollback  Restore the last known-good deployment (.prev) and
#                           restart the service.
#   ./deploy.sh             Build-only (tests + build, no deploy).
#
# Self-deploy hardening (safe to run many times a day, even overlapping):
#   - `cd`s to its own directory so it works regardless of how it is invoked
#     (e.g. spawned detached by the API's DeployManager).
#   - A flock-based lock serializes concurrent deploys instead of corrupting
#     the production dir.
#   - The current production dir is backed up to <PROD_DIR>.prev before the new
#     build is swapped in, so a bad deploy can be rolled back atomically.
#   - After restarting the service, a health check polls /status. If the new
#     instance fails to come up, the deploy AUTO-ROLLS BACK to .prev and
#     restarts, so a small bug never leaves the app down.
#   - A deploy log + machine-readable result/state/history files are written
#     under ~/.kainbain/deploy so the API can report status and trigger
#     rollback even though the triggering process is restarted mid-deploy.
#   - One deploy per engine stage attempt: when the engine stamps
#     KAINBAIN_DEPLOY_ATTEMPT_ID, the script writes a durable per-attempt
#     checkpoint (~/.kainbain/deploy/attempt-<id>.json). A re-dispatched
#     "Merge and deploy" stage ADOPTS the recorded outcome (or waits for a
#     still-running deploy) instead of running a second full deploy +
#     service restart — the resume loop. The attempt id is re-pinned through
#     the systemd-run re-exec because transient units do NOT inherit the
#     caller's environment.
#   - A heartbeat ticker keeps the deploy provably alive from the first gate
#     to the terminal result: every HEARTBEAT_INTERVAL seconds it appends a
#     progress line to deploy.log (the watchdog's mtime proxy) and refreshes
#     the attempt checkpoint's updatedAt (the watchdog/reconcile freshness
#     probes), and the checkpoint records the owning pid (the in-flight
#     probe). The transient unit's stdio goes to the journal by design (no
#     --pipe, see above), so the engine never sees gate stdout — these three
#     channels plus the foreground pump in the re-exec block are the liveness
#     signal instead. Long quiet gates (tests,
#     canary, installs) used to go silent past the 15-minute merge stall
#     threshold, so the watchdog killed a healthy deploy mid-gates and the
#     retry started a second full deploy — the resume loop. The ticker is
#     stopped inside write_result BEFORE any terminal outcome is recorded, so
#     it can never overwrite a terminal checkpoint back to "running".

set -e

# Prevent re-running if this script resumes after a successful deploy
if [ -n "${KAINBAIN_DEPLOYED_ALREADY:-}" ]; then
    log "⚠️ Deploy script already completed in this session – exiting to avoid repeat."
    exit 0
fi

# Always run from the repo root so relative paths (tests, frontend build) work
# no matter how this script is invoked.
cd "$(dirname "$0")"

# systemd --user tooling (systemd-run below, systemctl --user in restart_service)
# needs the user session bus. Some callers spawn this script with a sanitized
# environment that drops both vars (e.g. TaskStore command stages), which made
# systemd-run fail instantly with "Failed to connect to user scope bus".
# Derive the standard per-uid defaults instead of depending on the caller env.
if [ -z "$XDG_RUNTIME_DIR" ]; then
	XDG_RUNTIME_DIR="/run/user/$(id -u)"
	export XDG_RUNTIME_DIR
fi
if [ -z "$DBUS_SESSION_BUS_ADDRESS" ]; then
	DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
	export DBUS_SESSION_BUS_ADDRESS
fi

# If invoked from within kainbain.service's cgroup (e.g. spawned by the API's DeployManager),
# `systemctl --user restart kainbain.service` would kill this script when systemd terminates
# the service's cgroup (default KillMode=control-group). Re-exec under a dedicated
# TRANSIENT SERVICE unit — a fully independent unit with its own cgroup, outside the
# service slice — so the script survives the restart to perform the health check and
# auto-rollback. (A transient *scope* was tried before and still died with the restart;
# only a real service unit is decoupled from the restarted unit's lifetime.)
#
# Two contract details are load-bearing (regression: deep-review-20261007-235152
# and the 2026-10-12 merge/deploy resume loop):
#   - `--wait`: without it systemd-run exits 0 the moment the unit *starts*, so the
#     "Merge and deploy" stage would PASS before any test/build/deploy ran while the
#     real deploy failed invisibly in the journal. With --wait the unit's real exit
#     code propagates to the engine. When the deploy later restarts the service, only
#     this --wait watcher (a child of the old cgroup) is killed; the transient unit
#     itself survives, and the durable pre-restart "deploying" marker plus
#     reconcileInterruptedDeploys advance the task on boot.
#   - NO `--pipe` (deliberately): the transient unit's stdout/stderr go to the
#     JOURNAL, so routing gate output through the engine's pipe is avoided.
#     `--pipe` was tried (2026-10-12) to stream gate output to the engine, but
#     it is a fatal regression: the re-exec hands the engine's pipe descriptors
#     to the unit as-is, and `restart_service` kills the API together with the
#     `systemd-run --wait` watcher, so the reader side vanishes. The unit's next
#     stdout write then hits EPIPE / SIGPIPE and the deploy dies BEFORE
#     `write_result "success"` and BEFORE the health gate / auto-rollback — the
#     Deployment UI sticks at "deploying" and a broken build is left live with no
#     rollback. The same fate hits any mid-gate watcher death (watchdog kill,
#     concurrent deploy's restart). The journal never has a dead reader, so
#     journal stdio cannot abort the deploy; per-gate progress stays in
#     gate-*.log and deploy.log.
#   - Foreground engine heartbeat (this shell): because the unit is silent to
#     the engine, this shell stays alive in the BACKGROUND while the unit runs
#     and prints one short progress line to its own stdout every
#     KAINBAIN_ENGINE_HEARTBEAT_SECONDS (default 30). That stdout IS the
#     engine's pipe, so the engine's stage watchdog stays fed for the whole gate
#     run — the fix works even on an engine build that only proxies liveness
#     for `deploy`-typed stages (a merge stage's `running_merge` status would
#     otherwise stall at 900s). The pump is a disposable child: a dead engine
#     pipe only kills the pump, never the deploy, and it exits as soon as the
#     unit does. The shell then propagates the unit's real exit code (`exec`
#     would replace the shell and drop the pump).
#   - `--setenv=PATH=...`: transient units inherit the systemd user manager's minimal
#     PATH (no nvm bin), so without a node-aware PATH the deploy dies at step 1 with
#     `node: not found`. Resolve node's bin dir BEFORE re-exec and inject it.
#   - `--setenv=KAINBAIN_OUTSIDE_CGROUP=1`: the unit must never re-enter this
#     branch (re-exec loop). The manager normally inherits our exported env,
#     but that is an assumption — pin it explicitly so a dropped env cannot
#     fork-bomb transient units.
# KAINBAIN_CGROUP_FILE overrides the cgroup membership probe (tests only).
if [ -z "$KAINBAIN_OUTSIDE_CGROUP" ] && grep -q "kainbain.service" "${KAINBAIN_CGROUP_FILE:-/proc/self/cgroup}" 2>/dev/null && command -v systemd-run >/dev/null 2>&1; then
	export KAINBAIN_OUTSIDE_CGROUP=1
	_NODE_BIN="$(command -v node 2>/dev/null || true)"
	if [ -n "$_NODE_BIN" ]; then
		NODE_BINDIR="$(dirname "$_NODE_BIN")"
	else
		NODE_BINDIR=""
		for _nvm_node in "$HOME"/.nvm/versions/node/*/bin/node; do
			if [ -x "$_nvm_node" ]; then
				NODE_BINDIR="$(dirname "$_nvm_node")"
			fi
		done
	fi
	if [ -n "$NODE_BINDIR" ] && [ "$NODE_BINDIR" != "." ]; then
		DEPLOY_PATH="$NODE_BINDIR:$PATH"
	else
		DEPLOY_PATH="$PATH"
	fi
	# systemd-run does NOT inherit the caller's environment (a transient unit
	# started from this shell sees none of our exported vars — only the
	# explicit --setenv entries). The engine stamps KAINBAIN_DEPLOY_ATTEMPT_ID
	# onto the deploy/merge stage; without re-pinning it here the durable
	# result loses `deployAttemptId`, so post-restart reconciliation can no
	# longer attribute the deploy to its stage attempt — exactly the
	# merge/deploy resume loop fixed in this change.
	_DEPLOY_ENV_ARGS=()
	if [ -n "${KAINBAIN_DEPLOY_ATTEMPT_ID:-}" ]; then
		_DEPLOY_ENV_ARGS+=("--setenv=KAINBAIN_DEPLOY_ATTEMPT_ID=$KAINBAIN_DEPLOY_ATTEMPT_ID")
	fi
	if [ -n "${KAINBAIN_DEPLOY_OPERATION_KEY:-}" ]; then
		_DEPLOY_ENV_ARGS+=("--setenv=KAINBAIN_DEPLOY_OPERATION_KEY=$KAINBAIN_DEPLOY_OPERATION_KEY")
	fi
	if [ -n "${KAINBAIN_ATTEMPT_WAIT_SECONDS:-}" ]; then
		_DEPLOY_ENV_ARGS+=("--setenv=KAINBAIN_ATTEMPT_WAIT_SECONDS=$KAINBAIN_ATTEMPT_WAIT_SECONDS")
	fi
	if [ -n "${KAINBAIN_HEARTBEAT_SECONDS:-}" ]; then
		_DEPLOY_ENV_ARGS+=("--setenv=KAINBAIN_HEARTBEAT_SECONDS=$KAINBAIN_HEARTBEAT_SECONDS")
	fi
	# Keep the ENGINE's stage watchdog fed while the detached unit runs.
	# The unit's stdio goes to the journal (no --pipe), so the process that
	# spawned this script — and watches its stdout for heartbeats — would
	# otherwise see total silence for the whole gate run and declare the
	# merge/deploy stage stalled, retrying it into a second full deploy (the
	# resume loop). A short foreground heartbeat line every
	# ENGINE_HEARTBEAT_SECONDS keeps that watchdog fed WITHOUT routing the
	# unit's stdio through the engine pipe (the pipe dead-reader trap: the
	# pipe's reader dies with the API at restart_service and the next write
	# aborts the deploy before its terminal result). The pump is a
	# disposable child of this shell: a dead engine pipe only kills the
	# pump, never the deploy, and the pump exits as soon as the unit does.
	ENGINE_HEARTBEAT_SECONDS="${KAINBAIN_ENGINE_HEARTBEAT_SECONDS:-30}"
	case "$ENGINE_HEARTBEAT_SECONDS" in
	'' | *[!0-9]*) ENGINE_HEARTBEAT_SECONDS=30 ;;
	esac
	if [ "$ENGINE_HEARTBEAT_SECONDS" -lt 1 ]; then
		ENGINE_HEARTBEAT_SECONDS=1
	fi
	if [ "$ENGINE_HEARTBEAT_SECONDS" -gt 120 ]; then
		ENGINE_HEARTBEAT_SECONDS=120
	fi
	# Run the unit in the BACKGROUND so this shell survives to pump
	# heartbeats and then propagate the unit's real exit code (the engine
	# trusts only that code). `exec` would replace this shell and drop the
	# pump.
	systemd-run --user --quiet \
		--wait \
		--unit="kainbain-deploy-$$" \
		--collect \
		--setenv="PATH=$DEPLOY_PATH" \
		--setenv="KAINBAIN_OUTSIDE_CGROUP=1" \
		"${_DEPLOY_ENV_ARGS[@]}" \
		--description="KainBain production deploy (detached from kainbain.service)" \
		"$(readlink -f "$0")" "$@" &
	_DEPLOY_UNIT_PID=$!
	# Tick at 1s so the pump reacts (and dies) promptly; emit only every
	# ENGINE_HEARTBEAT_SECONDS. Checking `$$` (this shell) as well as the
	# unit pid means the pump stops the moment the unit finishes OR this
	# shell dies, so it can never outlive the deploy as an orphan writer.
	(
		_ticks=0
		while kill -0 "$$" 2>/dev/null && kill -0 "$_DEPLOY_UNIT_PID" 2>/dev/null; do
			sleep 1 2>/dev/null || break
			_ticks=$((_ticks + 1))
			if [ "$_ticks" -lt "$ENGINE_HEARTBEAT_SECONDS" ]; then
				continue
			fi
			_ticks=0
			printf '%s\n' "⏳ Deploy running in detached unit $_DEPLOY_UNIT_PID — progress in ~/.kainbain/deploy/deploy.log" || break
		done
	) &
	_DEPLOY_PUMP_PID=$!
	_DEPLOY_UNIT_STATUS=0
	wait "$_DEPLOY_UNIT_PID" || _DEPLOY_UNIT_STATUS=$?
	kill "$_DEPLOY_PUMP_PID" 2>/dev/null || true
	wait "$_DEPLOY_PUMP_PID" 2>/dev/null || true
	exit "$_DEPLOY_UNIT_STATUS"
fi

# --- Config ---------------------------------------------------------------
PROD_DIR="$HOME/apps/kainbain"
# The production service always listens on this port (see the systemd unit's
# Environment=PORT=3100). We use a fixed constant here rather than inheriting
# PORT from the triggering process so the health check and port-freeing target
# the real production instance even when the deploy is triggered by an API
# running on a different port (e.g. a dev instance).
PROD_API_PORT="${KAINBAIN_PROD_PORT:-3100}"
SERVICE_NAME="kainbain.service"
HEALTH_URL="${KAINBAIN_HEALTH_URL:-http://localhost:${PROD_API_PORT}/status}"
DEPLOY_DIR="$HOME/.kainbain/deploy"
LOCK_FILE="$DEPLOY_DIR/deploy.lock"
LOG_FILE="$DEPLOY_DIR/deploy.log"
STATE_FILE="$DEPLOY_DIR/state.json"
RESULT_FILE="$DEPLOY_DIR/last-result.json"
HISTORY_FILE="$DEPLOY_DIR/history.jsonl"
# Lock-contention evidence lives here — NEVER in last-result.json/state.json.
# A waiter that cannot acquire the flock must not clobber the real holder's
# outcome (2026-10-08 incident: waiter "Another deployment is already in
# progress" records overwrote the holder's result and misled
# reconcileInterruptedDeploys). Agents and the engine read this sidecar plus
# history.jsonl; last-result.json always describes a real deploy attempt.
LOCK_BUSY_FILE="$DEPLOY_DIR/lock-busy.json"
# Disk-backed staging for temp work (2026-10-25 incident: bare `mktemp -d`
# stages under /tmp, which here is a small tmpfs — a heavy `npm install`
# filled it and failed the deploy with ENOSPC while production stayed on
# the old build. Pointing temp work at the disk-backed deploy dir keeps a
# full disk-tmpfs from blocking releases). An explicit TMPDIR still wins.
DEPLOY_TMP_DIR="$DEPLOY_DIR/tmp"
mkdir -p "$DEPLOY_TMP_DIR" 2>/dev/null || true
if [ -z "${TMPDIR:-}" ] && [ -d "$DEPLOY_TMP_DIR" ]; then
  export TMPDIR="$DEPLOY_TMP_DIR"
fi
# Reap our own stale staging dirs (killed runs skip the EXIT trap): only
# our `tmp.*` pattern, only older than 7 days, never anything else.
find "$DEPLOY_TMP_DIR" -maxdepth 1 -name 'tmp.*' -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
# Lines of failing-gate output captured into write_result `details` so the
# merge stage can report WHICH gate failed plus a log tail (not just a static
# string like "Test suite execution failed").
GATE_TAIL_LINES="${KAINBAIN_GATE_TAIL_LINES:-40}"
# Per-attempt checkpoint (WP: one deploy per stage attempt). The engine
# stamps KAINBAIN_DEPLOY_ATTEMPT_ID onto every deploy-like stage attempt; the
# script writes `attempt-<id>.json` at entry and on every terminal result so
# a re-dispatched "Merge and deploy" stage can ADOPT the recorded outcome
# instead of running a second full deploy (gates + swap + service restart),
# which is what turned a restart mid-deploy into an endless resume loop.
# Empty for manual runs (no attempt id): behavior is then unchanged.
ATTEMPT_ID="${KAINBAIN_DEPLOY_ATTEMPT_ID:-}"
ATTEMPT_CHECKPOINT=""
if [ -n "$ATTEMPT_ID" ]; then
	ATTEMPT_CHECKPOINT="$DEPLOY_DIR/attempt-$ATTEMPT_ID.json"
fi
# Stable merge/deploy operation identity (multi-deploy loop backstop). The
# per-dispatch attempt id is minted fresh whenever the engine's marker is
# lost, so a re-dispatch cannot address its own checkpoint by filename — but
# the operation key (task + branch + base SHA + command) is stable across
# re-dispatches, so the still-running (or already-settled) deploy for THIS
# operation is found by key and adopted instead of duplicated. Empty for
# manual runs (no key): behavior is then unchanged.
OPERATION_KEY="${KAINBAIN_DEPLOY_OPERATION_KEY:-}"
# Full git HEAD this deploy runs its gates against, captured once at start
# (before any staging/build work). Every durable record (last-result.json,
# state.json, history.jsonl) stamps it as `headSha`, so the engine can prove
# whether a shared gate was ALREADY red on a given tree: the pre-merge base
# of the next task's merge equals this HEAD, so a failed record whose
# `headSha` matches a task's pre-merge base names a gate that was red before
# that task merged onto it (see sharedGateAttribution.js). Empty outside a
# git repository (manual runs, non-repo dirs) — the field is then omitted.
DEPLOY_HEAD_SHA="$(git rev-parse HEAD 2>/dev/null || echo "")"
# How long a duplicate invocation of the SAME attempt waits for the in-flight
# deploy to settle before giving up (exit 75) rather than starting a second
# deploy. Only reached when the stage was re-dispatched while its deploy was
# still running; 0 disables the wait (immediate EX_TEMPFAIL). Sanitized to
# digits-only: a non-numeric value would abort the `[ -lt ]` comparison under
# `set -e` and fail the deploy for an env typo, so it falls back to the default.
ATTEMPT_WAIT_SECONDS="${KAINBAIN_ATTEMPT_WAIT_SECONDS:-1200}"
case "$ATTEMPT_WAIT_SECONDS" in
'' | *[!0-9]*)
	# `log` is defined below; plain stderr here so this can never fail.
	echo "⚠️  Ignoring non-numeric KAINBAIN_ATTEMPT_WAIT_SECONDS (${KAINBAIN_ATTEMPT_WAIT_SECONDS:-unset}) — using 1200s." >&2
	ATTEMPT_WAIT_SECONDS=1200
	;;
esac
# Liveness cadence for the deploy heartbeat ticker (see start_deploy_heartbeat).
# Bounds are load-bearing: below ~15s the ticker spams deploy.log and the
# stage event stream; above ~120s two missed beats already approach the 600s
# deploy stall threshold, so the watchdog could fire on a merely slow tick.
# Sanitized exactly like ATTEMPT_WAIT_SECONDS: non-numeric input falls back
# to the default instead of aborting the deploy under `set -e`.
HEARTBEAT_INTERVAL="${KAINBAIN_HEARTBEAT_SECONDS:-60}"
case "$HEARTBEAT_INTERVAL" in
'' | *[!0-9]*)
	echo "⚠️  Ignoring non-numeric KAINBAIN_HEARTBEAT_SECONDS (${KAINBAIN_HEARTBEAT_SECONDS:-unset}) — using 60s." >&2
	HEARTBEAT_INTERVAL=60
	;;
esac
if [ "$HEARTBEAT_INTERVAL" -lt 15 ]; then
	HEARTBEAT_INTERVAL=15
fi
if [ "$HEARTBEAT_INTERVAL" -gt 120 ]; then
	HEARTBEAT_INTERVAL=120
fi
# Pid of the background heartbeat ticker (empty when not running).
HEARTBEAT_PID=""
# Autoincrementing build counter persisted in ~/.kainbain/deploy/build.txt so
# it survives service restarts. Each production deploy consumes the next number.
BUILD_COUNTER="$DEPLOY_DIR/build.txt"
# The build number is also stamped into a build.json inside the deployed app
# dir so the running instance (and a .prev rollback) carries the exact build
# that is live.
BUILD_JSON="$PROD_DIR/build.json"
PREV_DIR="${PROD_DIR}.prev"
LOCK_TIMEOUT="${KAINBAIN_LOCK_TIMEOUT:-600}" # seconds to wait for a concurrent deploy
HEALTH_ATTEMPTS="${KAINBAIN_HEALTH_ATTEMPTS:-30}"
HEALTH_DELAY="${KAINBAIN_HEALTH_DELAY:-2}"
# Self-published "Go to App" link: after a healthy prod deploy, KainBain points
# its own project link back at the live instance (a live self-test of
# PATCH /projects/:id/app-status). Override or skip with env when needed.
APP_LINK_URL="${KAINBAIN_APP_LINK_URL:-https://kainbain.home}"
APP_LINK_HEALTH="${KAINBAIN_APP_LINK_HEALTH:-/status}"
APP_LINK_PROJECT="${KAINBAIN_APP_LINK_PROJECT:-}"

# --- Arg parsing ----------------------------------------------------------
MODE="build"
FAST="false"
while [[ "$#" -gt 0 ]]; do
	case $1 in
	--dev) MODE="dev" ;;
	--prod) MODE="prod" ;;
	--fast) FAST="true" ;;
	--rollback) MODE="rollback" ;;
	*)
		echo "Unknown parameter passed: $1"
		exit 1
		;;
	esac
	shift
done

# --- Platform guard (prod/rollback are Linux-only) --------------------------
# The production path needs Linux-only tooling (flock, systemd user units,
# the nginx-proxy docker container). Fail fast with a clear message instead
# of cryptic command-not-found errors halfway through. `--dev` and the
# build-only mode stay cross-platform (the dev servers run under Node).
if [ "$MODE" = "prod" ] || [ "$MODE" = "rollback" ]; then
	if [ "$(uname -s)" != "Linux" ]; then
		echo "❌ deploy.sh --$MODE is only supported on Linux (detected $(uname -s))." >&2
		echo "   Production deploys need systemd user units, flock, and docker;" >&2
		echo "   use 'npm run dev' for local development on any OS." >&2
		exit 2
	fi
fi

# --- Logging helpers ------------------------------------------------------
log() {
	local line
	line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
	echo "$line"
	mkdir -p "$DEPLOY_DIR"
	echo "$line" >>"$LOG_FILE"
}

# --- Build number ---------------------------------------------------------
# Autoincrementing build counter persisted in ~/.kainbain/deploy/build.txt so
# it survives service restarts (the deploy restarts the very service that may
# have triggered it). Each production deploy consumes the next number.
current_build() {
	local n=0
	if [ -f "$BUILD_COUNTER" ]; then
		n="$(cat "$BUILD_COUNTER" 2>/dev/null || echo 0)"
	fi
	case "$n" in
	'' | *[!0-9]*) n=0 ;;
	esac
	echo "$n"
}

# Returns the next build number and persists it as the new counter.
next_build() {
	local n
	n="$(current_build)"
	echo $((n + 1))
}

# Write build.json into the deployment directory so the running app (and a
# .prev rollback copy) carries the exact build number that is live.
stamp_build_json() {
	mkdir -p "$(dirname "$BUILD_JSON")"
	cat >"$BUILD_JSON" <<EOF
{
  "buildNumber": ${BUILD_NUMBER:-0},
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit": "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
}
EOF
}

# Track whether the live production directory has been swapped into place.
SWAPPED="false"

# Write the machine-readable result + state + history for the API. Because the
# deploy restarts the service that may have triggered it, these files are the
# only durable record of what happened.
write_result() {
	local status="$1"
	local message="$2"
	local rolled_back="${3:-false}"
	local exit_code="${4:-}"
	local failed_command="${5:-}"
	local details="${6:-}"
	# Stop the heartbeat ticker BEFORE recording anything: a tick that fires
	# between the terminal write below and process exit would flip the
	# attempt checkpoint back to "running" and a later re-dispatch would
	# wait on (or mis-adopt) a deploy that is already over. Stopping is
	# idempotent and total, so this is safe on every path including the ERR
	# trap and the pre-restart "deploying" marker.
	stop_deploy_heartbeat 2>/dev/null || true
	local finished_at
	finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	local build_number="${BUILD_NUMBER:-$(current_build)}"
	# Lazy fallback: the global is captured at startup in a git repo; the
	# `+x` test distinguishes "set but empty" (outside a repo — the field is
	# omitted) from "unset" (executed standalone in tests), where a best-effort
	# `git rev-parse` keeps the function total and well-defined.
	local head_sha
	if [ -n "${DEPLOY_HEAD_SHA+x}" ]; then
		head_sha="$DEPLOY_HEAD_SHA"
	else
		head_sha="$(git rev-parse HEAD 2>/dev/null || echo "")"
	fi
	mkdir -p "$DEPLOY_DIR"

	# Build JSON safely with jq to ensure valid quoting and multi-line escapes
	jq -n \
		--arg status "$status" \
		--argjson buildNumber "$build_number" \
		--arg startedAt "${STARTED_AT:-$finished_at}" \
		--arg finishedAt "$finished_at" \
		--arg message "$message" \
		--argjson rolledBack "$rolled_back" \
		--arg mode "$MODE" \
		--arg exitCode "$exit_code" \
		--arg failedCommand "$failed_command" \
		--arg details "$details" \
		--arg headSha "$head_sha" \
		'{
			status: $status,
			buildNumber: $buildNumber,
			startedAt: $startedAt,
			finishedAt: $finishedAt,
			message: $message,
			rolledBack: $rolledBack,
			mode: $mode
		}
		+ (if $exitCode != "" then { exitCode: ($exitCode | tonumber? // $exitCode) } else {} end)
		+ (if $failedCommand != "" then { failedCommand: $failedCommand } else {} end)
		+ (if $details != "" then { details: $details } else {} end)
		+ (if $headSha != "" then { headSha: $headSha } else {} end)' >"$RESULT_FILE"

	jq -n \
		--arg status "$status" \
		--argjson buildNumber "$build_number" \
		--arg startedAt "${STARTED_AT:-$finished_at}" \
		--arg finishedAt "$finished_at" \
		--arg message "$message" \
		--argjson rolledBack "$rolled_back" \
		--arg exitCode "$exit_code" \
		--arg failedCommand "$failed_command" \
		--arg details "$details" \
		--arg headSha "$head_sha" \
		'{
			status: $status,
			buildNumber: $buildNumber,
			startedAt: $startedAt,
			finishedAt: $finishedAt,
			message: $message,
			rolledBack: $rolledBack
		}
		+ (if $exitCode != "" then { exitCode: ($exitCode | tonumber? // $exitCode) } else {} end)
		+ (if $failedCommand != "" then { failedCommand: $failedCommand } else {} end)
		+ (if $details != "" then { details: $details } else {} end)
		+ (if $headSha != "" then { headSha: $headSha } else {} end)' >"$STATE_FILE"

	# Append to the append-only history (JSONL — one record per line).
	jq -c -n \
		--arg status "$status" \
		--argjson buildNumber "$build_number" \
		--arg startedAt "${STARTED_AT:-$finished_at}" \
		--arg finishedAt "$finished_at" \
		--arg message "$message" \
		--argjson rolledBack "$rolled_back" \
		--arg mode "$MODE" \
		--arg exitCode "$exit_code" \
		--arg failedCommand "$failed_command" \
		--arg details "$details" \
		--arg headSha "$head_sha" \
		'{
			status: $status,
			buildNumber: $buildNumber,
			startedAt: $startedAt,
			finishedAt: $finishedAt,
			message: $message,
			rolledBack: $rolledBack,
			mode: $mode
		}
		+ (if $exitCode != "" then { exitCode: ($exitCode | tonumber? // $exitCode) } else {} end)
		+ (if $failedCommand != "" then { failedCommand: $failedCommand } else {} end)
		+ (if $details != "" then { details: $details } else {} end)
		+ (if $headSha != "" then { headSha: $headSha } else {} end)' >>"$HISTORY_FILE"

	# WP6: stamp the engine-supplied deploy attempt id onto the durable result
	# and state so a post-restart reconcile can prove the record belongs to THIS
	# stage attempt (not merely "newer than entry"). Absent the env var (older
	# script, manual run) the files are left byte-identical.
	if [ -n "${KAINBAIN_DEPLOY_ATTEMPT_ID:-}" ]; then
		for attempt_file in "$RESULT_FILE" "$STATE_FILE"; do
			if [ ! -f "$attempt_file" ]; then
				continue
			fi
			attempt_tmp="$(mktemp "${attempt_file}.XXXXXX")" || continue
			if jq --arg attemptId "$KAINBAIN_DEPLOY_ATTEMPT_ID" \
				'. + {deployAttemptId: $attemptId}' "$attempt_file" >"$attempt_tmp"; then
				mv "$attempt_tmp" "$attempt_file"
			else
				rm -f "$attempt_tmp"
			fi
		done
	fi

	# Mirror the durable outcome into the per-attempt checkpoint so a later
	# invocation of the SAME attempt (stage re-dispatch, manual resume) can
	# adopt it instead of re-running gates. No-op without an attempt id.
	if [ -n "$ATTEMPT_CHECKPOINT" ]; then
		case "$status" in
		deploying | success | failed | rolled-back | rolled_back)
			write_attempt_checkpoint "$status" "$message" "$exit_code"
			;;
		esac
	fi
}

# --- Deploy attempt checkpoint ---------------------------------------------
# Durable per-attempt record under $DEPLOY_DIR/attempt-<id>.json. It is the
# fact `last-result.json` cannot express: whether THIS attempt's deploy has
# already executed (terminal status) or is still running (status=running +
# live pid). reconcileInterruptedDeploys reads it to WAIT for the in-flight
# deploy instead of re-dispatching the merge stage, and the entry guard below
# uses it to avoid starting a second full deploy for the same attempt.
# Every helper is best-effort (never fails the deploy) and a no-op when no
# attempt id is present (manual runs keep today's behavior byte-identical).

# Print the recorded status for this attempt ("" when absent/unreadable).
attempt_checkpoint_status() {
	if [ -z "$ATTEMPT_CHECKPOINT" ] || [ ! -f "$ATTEMPT_CHECKPOINT" ]; then
		echo ""
		return 0
	fi
	jq -r '.status // ""' "$ATTEMPT_CHECKPOINT" 2>/dev/null || echo ""
}

# Read one field from the checkpoint ("" when absent/unreadable).
attempt_checkpoint_field() {
	local field="$1"
	if [ -z "$ATTEMPT_CHECKPOINT" ] || [ ! -f "$ATTEMPT_CHECKPOINT" ]; then
		echo ""
		return 0
	fi
	jq -r --arg f "$field" '.[$f] // ""' "$ATTEMPT_CHECKPOINT" 2>/dev/null || echo ""
}

# Whether a pid is still alive. /proc is authoritative on Linux (the only
# platform prod deploys run on); kill -0 is the portable fallback.
attempt_pid_alive() {
	local pid="${1:-}"
	case "$pid" in
	'' | *[!0-9]*) return 1 ;;
	esac
	if [ -d "/proc/$pid" ]; then
		return 0
	fi
	kill -0 "$pid" 2>/dev/null
}

# Write/refresh the checkpoint. Preserves the original startedAt across
# refreshes so the file timestamps the attempt, while `updatedAt` moves with
# each write and `pid` always tracks the process that owns the run. Records
# BUILD_NUMBER once allocated (terminal writes) so post-restart reconciliation
# can attribute the attempt's build without depending on last-result.json; the
# entry write happens before allocation and omits it. Never fails the deploy.
write_attempt_checkpoint() {
	local status="$1"
	local message="${2:-}"
	local exit_code="${3:-}"
	if [ -z "$ATTEMPT_CHECKPOINT" ]; then
		return 0
	fi
	mkdir -p "$DEPLOY_DIR" 2>/dev/null || true
	local now started_at prev_started pid build_number
	now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	started_at="$now"
	prev_started="$(attempt_checkpoint_field startedAt)"
	if [ -n "$prev_started" ]; then
		started_at="$prev_started"
	fi
	# $$ (not BASHPID): the long-lived script process inside the transient
	# unit, whose liveness proves the deploy is still in flight.
	pid="$$"
	# Only a digits-only build number is recorded; anything else (unset at
	# entry time, or an unexpected value) omits the field.
	build_number="${BUILD_NUMBER:-}"
	case "$build_number" in
	'' | *[!0-9]*) build_number="" ;;
	esac
	local tmp
	tmp="${ATTEMPT_CHECKPOINT}.tmp.$$"
	if jq -n \
		--arg attemptId "$ATTEMPT_ID" \
		--arg status "$status" \
		--argjson pid "$pid" \
		--arg startedAt "$started_at" \
		--arg updatedAt "$now" \
		--arg message "$message" \
		--arg exitCode "$exit_code" \
		--arg resultFile "$RESULT_FILE" \
		--arg logFile "$LOG_FILE" \
		--arg buildNumber "$build_number" \
		--arg operationKey "${OPERATION_KEY:-}" \
		'{
			attemptId: $attemptId,
			status: $status,
			pid: $pid,
			startedAt: $startedAt,
			updatedAt: $updatedAt,
			message: $message,
			resultFile: $resultFile,
			deployLog: $logFile
		}
		+ (if $exitCode != "" then { exitCode: ($exitCode | tonumber? // $exitCode) } else {} end)
		+ (if $buildNumber != "" then { buildNumber: ($buildNumber | tonumber) } else {} end)
		+ (if $operationKey != "" then { operationKey: $operationKey } else {} end)' >"$tmp" 2>/dev/null; then
		mv "$tmp" "$ATTEMPT_CHECKPOINT" 2>/dev/null || rm -f "$tmp"
	else
		rm -f "$tmp"
	fi
	return 0
}

# Newest attempt-*.json (by mtime) whose .operationKey equals
# $OPERATION_KEY. Empty when none matches. Best-effort, never fails.
newest_attempt_checkpoint_for_operation_key() {
	if [ -z "${OPERATION_KEY:-}" ] || [ -z "${DEPLOY_DIR:-}" ]; then
		echo ""
		return 0
	fi
	local candidate key
	candidate=""
	for candidate in $(ls -t "$DEPLOY_DIR"/attempt-*.json 2>/dev/null); do
		[ -f "$candidate" ] || continue
		key="$(jq -r '.operationKey // ""' "$candidate" 2>/dev/null || echo "")"
		if [ "$key" = "$OPERATION_KEY" ]; then
			echo "$candidate"
			return 0
		fi
	done
	echo ""
	return 0
}

# Operation-key adoption: a re-dispatch that lost its per-dispatch attempt id
# mints a fresh one addressing no checkpoint — but the operation key is stable
# across re-dispatches, so the recorded attempt for THIS operation is joined
# instead of duplicated. On a match this re-points ATTEMPT_ID /
# ATTEMPT_CHECKPOINT at the recorded attempt (returns 0); otherwise it leaves
# them alone (returns 1) and the caller proceeds as a first invocation.
# Policy mirrors the same-id table: a recorded FAILURE is never adopted (the
# caller re-runs as a genuine retry), and terminal SUCCESS is only adopted
# for a known-base key (an unknown-base key cannot prove the tree is the same
# code the checkpoint deployed). Kept as a function so the decision table is
# testable in isolation (api/deploy.attemptCheckpoint.test.js).
adopt_attempt_by_operation_key() {
	if [ -z "${OPERATION_KEY:-}" ]; then
		return 1
	fi
	local match_file match_status match_id
	match_file="$(newest_attempt_checkpoint_for_operation_key)"
	if [ -z "$match_file" ]; then
		return 1
	fi
	match_status="$(jq -r '.status // ""' "$match_file" 2>/dev/null || echo "")"
	case "$match_status" in
	failed | rolled-back | rolled_back | "")
		log "♻️  Operation ${OPERATION_KEY} previously recorded '${match_status:-none}' — re-running the deploy (genuine retry)."
		return 1
		;;
	success)
		case "$OPERATION_KEY" in
		*:unknown-base:*)
			log "♻️  Operation ${OPERATION_KEY} recorded success, but the key carries no base SHA — re-running the deploy."
			return 1
			;;
		esac
		;;
	running | deploying)
		;;
	*)
		return 1
		;;
	esac
	match_id="$(jq -r '.attemptId // ""' "$match_file" 2>/dev/null || echo "")"
	if [ -z "$match_id" ]; then
		return 1
	fi
	log "[DEPLOY] Adopted attempt $match_id (status '$match_status') for operation ${OPERATION_KEY} — this re-dispatch joins the recorded attempt instead of starting a second deploy."
	ATTEMPT_ID="$match_id"
	ATTEMPT_CHECKPOINT="$match_file"
	return 0
}

# Entry guard for the prod path: adopt an already-executed attempt instead of
# re-running the whole deploy, wait for a still-running one, and let a
# recorded FAILURE fall through as a genuine retry. See the call site in the
# prod block; kept as a function so the checkpoint decision table is testable
# in isolation (api/deploy.attemptCheckpoint.test.js).
maybe_adopt_attempt_entry() {
	if [ -z "$ATTEMPT_CHECKPOINT" ]; then
		return 0
	fi
	local state pid waited wait_seconds
	state="$(attempt_checkpoint_status)"
	# Defense-in-depth: the top level already sanitizes this, but the function
	# is also executed standalone in tests — never let a non-numeric value
	# reach `[ -lt ]` (it would abort under `set -e`).
	wait_seconds="$ATTEMPT_WAIT_SECONDS"
	case "$wait_seconds" in
	'' | *[!0-9]*) wait_seconds=0 ;;
	esac
	case "$state" in
	success | deploying)
		adopt_attempt_outcome "$state"
		;;
	running)
		pid="$(attempt_checkpoint_field pid)"
		if attempt_pid_alive "$pid"; then
			log "⏳ Deploy attempt $ATTEMPT_ID is still in flight (pid $pid) — waiting up to ${wait_seconds}s for it to settle instead of starting a second deploy."
			waited=0
			# Heartbeat cadence: the engine's stage watchdog declares a stall
			# when no heartbeat arrives within the stage threshold (merge: 900s).
			# This wait loop can run for up to ATTEMPT_WAIT_SECONDS (default
			# 1200s), so emit a log line every ~30s. `log` writes to deploy.log
			# (which the watchdog's mtime proxy reads); the waited-on
			# checkpoint's live pid is the watchdog's in-flight proof for the
			# same window. Without these heartbeats the watchdog fires
			# mid-wait, kills this process, and the retry starts a second
			# deploy — the resume loop.
			local heartbeat_interval=30
			local next_heartbeat=0
			while [ "$waited" -lt "$wait_seconds" ]; do
				sleep 5
				waited=$((waited + 5))
				state="$(attempt_checkpoint_status)"
				case "$state" in
				success | deploying | failed | rolled-back | rolled_back)
					adopt_attempt_outcome "$state"
					;;
				esac
				attempt_pid_alive "$pid" || break
				if [ "$waited" -ge "$next_heartbeat" ]; then
					log "⏳ Still waiting for deploy attempt $ATTEMPT_ID (pid $pid) — ${waited}s/${wait_seconds}s elapsed."
					next_heartbeat=$((waited + heartbeat_interval))
				fi
			done
			log "⏳ Deploy attempt $ATTEMPT_ID is still in flight after ${wait_seconds}s — not starting a duplicate deploy (exit 75: retry once it settles)."
			exit 75
		fi
		log "♻️  Deploy attempt $ATTEMPT_ID checkpoint is stale (pid ${pid:-none} not running) — re-running the deploy."
		;;
	failed | rolled-back | rolled_back)
		# A recorded FAILURE is a genuine retry: re-run rather than adopt, so
		# an operator's retry can succeed on a second attempt. (A failed deploy
		# never restarts the service, so this cannot recreate the resume loop —
		# that needs a SUCCESS/`deploying` restart.)
		log "♻️  Deploy attempt $ATTEMPT_ID previously recorded '$state' — re-running the deploy (genuine retry)."
		;;
	'')
		# No checkpoint for THIS attempt id: before concluding this is a
		# first invocation, try the stable operation key. A re-dispatch that
		# lost its attempt id mints a fresh one — but the operation key is
		# stable, so the recorded attempt for THIS operation is joined
		# (re-point + re-run this same table) instead of duplicated into a
		# second full deploy. A recorded failure (or no match) falls through
		# as a genuine retry under our own fresh attempt id.
		if [ -n "${OPERATION_KEY:-}" ] && adopt_attempt_by_operation_key; then
			maybe_adopt_attempt_entry
		fi
		;;
	esac
	return 0
}

# Adopts an already-executed attempt's recorded outcome: exits with it instead
# of re-running gates. Called by `maybe_adopt_attempt_entry` for a
# `success`/`deploying` checkpoint at entry and for any terminal status the
# in-flight wait observes. Returns (no adoption) for any other status.
adopt_attempt_outcome() {
	local status="$1"
	case "$status" in
	success | deploying)
		log "⏭️  Deploy attempt $ATTEMPT_ID already executed (checkpoint status '$status') — adopting recorded outcome, not re-running gates."
		exit 0
		;;
	failed | rolled-back | rolled_back)
		local code
		code="$(attempt_checkpoint_field exitCode)"
		case "$code" in
		'' | *[!0-9]*) code=1 ;;
		esac
		log "❌ Deploy attempt $ATTEMPT_ID already failed (checkpoint status '$status') — adopting recorded outcome (exit $code)."
		exit "$code"
		;;
	esac
	return 0
}

# --- Deploy heartbeat ticker -----------------------------------------------
# Proves the deploy is alive while long gates run. Individual gates
# (final-test-suite, canary-e2e, npm installs) can go silent for tens of
# minutes — and the transient unit's stdio goes to the journal by design
# (no --pipe), so the engine NEVER sees gate output — which means without
# this the stage goes heartbeat-silent and deploy.log's mtime goes stale
# until the gate finishes. Past the merge stall threshold (900s) the
# watchdog then kills a HEALTHY deploy mid-gates and the transient retry
# starts a second full deploy + service restart: the resume loop.
#
# The ticker closes all three silence channels at once, every
# HEARTBEAT_INTERVAL seconds: a `log` line refreshes deploy.log's mtime
# (watchdog mtime proxy), and the attempt checkpoint's updatedAt is
# refreshed (watchdog/reconcile freshness probe) while its pid field stays
# the deploy's own pid (watchdog in-flight probe).
#
# Lifecycle: started once in the prod block after the "running" checkpoint
# write, stopped FIRST inside write_result before any outcome is recorded —
# so a tick can never overwrite a terminal checkpoint back to "running",
# on ANY exit path (gate failure, ERR trap, success, rollback). Stopping is
# idempotent and never fails the deploy.
start_deploy_heartbeat() {
	if [ -n "$HEARTBEAT_PID" ]; then
		return 0
	fi
	(
		# Detach from every trap and from `set -e`: a ticker failure (full
		# disk, unwritable log) must degrade to silence, never abort the
		# deploy via the inherited ERR trap.
		trap - ERR EXIT
		set +e
		_parent="$$"
		while kill -0 "$_parent" 2>/dev/null; do
			sleep "$HEARTBEAT_INTERVAL" 2>/dev/null || sleep 60
			kill -0 "$_parent" 2>/dev/null || break
			log "💓 Deploy still running (build ${BUILD_NUMBER:-pending}, mode=$MODE fast=$FAST) — progress in gate-*.log, full log in $LOG_FILE." || true
			write_attempt_checkpoint "running" "Deploy in progress (heartbeat)" "" || true
		done
	) &
	HEARTBEAT_PID="$!"
	return 0
}

# Stops the heartbeat ticker started by start_deploy_heartbeat. Idempotent
# (no-op when never started or already stopped) and total: every failure is
# swallowed so calling it first inside write_result — including from the ERR
# trap — can never mask the real outcome. `wait` reaps the ticker so no
# orphan keeps refreshing the checkpoint after the deploy is terminal.
stop_deploy_heartbeat() {
	if [ -z "$HEARTBEAT_PID" ]; then
		return 0
	fi
	kill "$HEARTBEAT_PID" 2>/dev/null || true
	wait "$HEARTBEAT_PID" 2>/dev/null || true
	HEARTBEAT_PID=""
	return 0
}

# --- Lock-contention record -------------------------------------------------
# A deploy that cannot acquire the flock is a WAITER, not a deploy attempt:
# it must leave last-result.json/state.json byte-identical so the real
# holder's outcome (and reconcileInterruptedDeploys, which reads exactly that
# file) is never clobbered by contention noise. Evidence goes to the
# lock-busy sidecar plus the append-only history. Exits 75 (EX_TEMPFAIL: a
# transient contention failure — safe to retry once the holder finishes) so
# callers can distinguish "another deploy holds the lock" from a real gate
# failure. Retrying agents should poll last-result.json / the sidecar, or
# simply re-run after the holder's build finishes (see deploy.log).
write_lock_busy() {
	local holder_info="${1:-unknown holder}"
	local started_at
	started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	mkdir -p "$DEPLOY_DIR"
	jq -c -n \
		--arg status "lock-busy" \
		--arg startedAt "$started_at" \
		--arg message "Another deployment is already in progress ($holder_info) — this attempt did not run; retry after the holder finishes" \
		--arg mode "$MODE" \
		--arg holderInfo "$holder_info" \
		--arg logFile "$LOG_FILE" \
		--arg resultFile "$RESULT_FILE" \
		'{
			status: $status,
			startedAt: $startedAt,
			message: $message,
			mode: $mode,
			holder: $holderInfo,
			deployLog: $logFile,
			lastResult: $resultFile
		}' >"$LOCK_BUSY_FILE"
	jq -c -n \
		--arg status "lock-busy" \
		--argjson buildNumber "$(current_build)" \
		--arg startedAt "$started_at" \
		--arg finishedAt "$started_at" \
		--arg message "Another deployment is already in progress ($holder_info) — waiter parked without running" \
		--argjson rolledBack false \
		--arg mode "$MODE" \
		'{
			status: $status,
			buildNumber: $buildNumber,
			startedAt: $startedAt,
			finishedAt: $finishedAt,
			message: $message,
			rolledBack: $rolledBack,
			mode: $mode
		}' >>"$HISTORY_FILE"
}

# --- Gate runner ------------------------------------------------------------
# Run one deploy gate with live output AND a captured log file, plus explicit
# start/finish timestamp lines so agents can see WHERE a slow deploy is stuck
# from deploy.log without waiting for a timeout.
# Usage: run_gate "<name>" "<failed-command-label>" <command> [args...]
# On success returns 0. On failure writes a result naming the gate with the
# gate's output tail in `details` and exits with the gate's exit code — the
# merge stage surfaces that record instead of a bare exit code.
run_gate() {
	local gate_name="$1"
	local failed_command="$2"
	shift 2
	local gate_log="$DEPLOY_DIR/gate-$(echo "$gate_name" | tr 'A-Z ' 'a-z-')-${BUILD_NUMBER:-pending}-$$.log"
	local gate_start
	gate_start="$(date +%s)"
	log "▶ Gate '$gate_name' starting (full output: $gate_log)..."
	# Tee keeps output live on stdout for the stage watcher while capturing
	# the file for the failure tail below. PIPESTATUS (not pipefail) reads
	# the gate's own exit code without changing global shell options.
	"$@" 2>&1 | tee "$gate_log"
	local gate_code="${PIPESTATUS[0]}"
	local gate_elapsed
	gate_elapsed="$(($(date +%s) - gate_start))"
	if [ "$gate_code" -eq 0 ]; then
		log "✅ Gate '$gate_name' passed in ${gate_elapsed}s."
		return 0
	fi
	log "❌ Gate '$gate_name' failed after ${gate_elapsed}s (exit $gate_code) — aborting deploy. Current app left untouched."
	local tail
	tail="$(tail -n "$GATE_TAIL_LINES" "$gate_log" 2>/dev/null || echo "(gate log unreadable: $gate_log)")"
	local details="Last $GATE_TAIL_LINES lines of $gate_log:"
	details="$details
$tail"
	write_result "failed" "Gate '$gate_name' failed (exit $gate_code)" "false" "$gate_code" "$failed_command" "$details"
	exit "$gate_code"
}

# Backwards-compatible tail reader for gates that keep their own `if ! ...`
# shape (non-fatal gates, pre-swap steps that need custom handling): prints
# the last N lines of a file, or a placeholder when unreadable.
gate_tail() {
	local file="$1"
	local lines="${2:-$GATE_TAIL_LINES}"
	tail -n "$lines" "$file" 2>/dev/null || echo "(gate log unreadable: $file)"
}

# --- Health check ---------------------------------------------------------
# Poll the health URL until the service responds or we exhaust attempts.
health_check() {
	local url="${1:-$HEALTH_URL}"
	local attempts="${2:-$HEALTH_ATTEMPTS}"
	local delay="${3:-$HEALTH_DELAY}"
	for _ in $(seq 1 "$attempts"); do
		if curl -sf "$url" >/dev/null 2>&1; then
			return 0
		fi
		sleep "$delay"
	done
	return 1
}

# --- Service restart ------------------------------------------------------
# Minimal-downtime handoff: everything heavy (tests, build, staging, swap)
# already happened BEFORE this point, so the outage window is just the
# service restart itself. The restart is graceful, not brutal: the old
# instance gets SIGTERM first so its shutdown hook drains in-flight requests
# and persists stage state (`interrupted`) for restart reconciliation — the
# "quick pause on compute". A bare `fuser -k` (SIGKILL) would bypass that
# hook and strand merge/deploy tasks, so SIGKILL is only the last resort for
# a lingering orphan.
restart_service() {
	log "Restarting $SERVICE_NAME ..."
	if ! command -v systemctl >/dev/null 2>&1; then
		log "❌ Cannot restart $SERVICE_NAME: systemctl not found (production deploys need a systemd user session)."
		return 1
	fi
	# Free the production API port first in case a manually-started instance
	# (e.g. an orphaned `node index.js`) is still bound to it — SIGTERM
	# first (graceful drain), then wait up to 10s for the port to release.
	if command -v fuser >/dev/null 2>&1; then
		fuser -k -TERM "${PROD_API_PORT}/tcp" 2>/dev/null || true
		for _drain_attempt in $(seq 1 10); do
			fuser "${PROD_API_PORT}/tcp" >/dev/null 2>&1 || break
			sleep 1
		done
		if fuser "${PROD_API_PORT}/tcp" >/dev/null 2>&1; then
			log "⚠️ Port ${PROD_API_PORT} still held after SIGTERM — SIGKILLing the orphan."
			fuser -k "${PROD_API_PORT}/tcp" 2>/dev/null || true
		fi
	else
		log "⚠️ fuser not found — skipping port drain (systemd restart still applies)."
	fi
	systemctl --user daemon-reload
	systemctl --user restart "$SERVICE_NAME"
}

# --- Service logs -----------------------------------------------------------
# journalctl wrapper: identical output on systemd hosts, honest fallback where
# the journal is unavailable (guarded so non-systemd hosts degrade gracefully).
service_logs() {
	if command -v journalctl >/dev/null 2>&1; then
		journalctl --user-unit "$SERVICE_NAME" -n 25 --no-pager 2>&1 || true
	else
		echo "(journalctl not available — cannot show $SERVICE_NAME logs)"
	fi
}

# --- Reload nginx ---------------------------------------------------------
reload_nginx() {
	log "Reloading nginx (kainbain.home) ..."
	if ! command -v docker >/dev/null 2>&1; then
		log "⚠️  docker not found — nginx reload skipped (production deploys expect the nginx-proxy container)."
		return 0
	fi
	if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^nginx-proxy$'; then
		docker exec nginx-proxy nginx -s reload
	else
		log "⚠️  nginx-proxy container not running — reload skipped. Start it to serve kainbain.home."
	fi
}

# --- Docs-link guard --------------------------------------------------------
# The kainbain project's own task storage resolves through a `<repo>/docs`
# symlink into the SilverBullet notes space (see ProjectStore.ensureDocsLink
# in api/projectStore.js). On 2026-10-02 the tracked symlink was removed from
# git and the engine grew a real `docs/` shadow directory holding a single
# task, so the UI silently showed 1 of 134 tasks. This check surfaces that
# state in the deploy log. Warn-only by design: it must never fail a deploy
# (fresh clones and WP-2's future local backend legitimately have no link),
# and it never modifies `docs/` — the shadow case needs an operator merge
# first (the API also logs merge guidance at startup).
check_docs_link() {
	local notes=""
	if [ -f ".kainbain/project.json" ] && command -v node >/dev/null 2>&1; then
		notes="$(node -e "try { const p = require('./.kainbain/project.json'); process.stdout.write(p.notesPath || p.notesDir || ''); } catch (e) {}" 2>/dev/null || true)"
	fi
	if [ -L "docs" ]; then
		if [ ! -e "docs" ]; then
			log "⚠️ ./docs is a dangling symlink (target missing) — the API repoints it at startup when the notes space exists."
		fi
		return 0
	fi
	if [ -n "$notes" ] && [ -d "$notes/tasks" ] && [ -d "docs/tasks" ]; then
		log "⚠️ ./docs is a REAL directory shadowing the notes space '$notes' — task lists read the shadow copy, so most tasks are hidden in the UI. Merge newer files from ./docs/tasks/ into the notes space, then replace ./docs with a symlink to '$notes'."
	elif [ -n "$notes" ] && [ -d "$notes" ] && [ ! -e "docs" ]; then
		log "⚠️ ./docs link is missing — the API recreates it at startup pointing at '$notes'."
	fi
	return 0
}

# --- App-link publish -----------------------------------------------------
# Points this repo's own "Go to App" link at the freshly deployed instance via
# PATCH /projects/:id/app-status (a live self-test of the endpoint — the link
# leads back to the page it is viewed on). Warn-only by design: it must never
# fail a deploy, so every failure path logs and returns 0. Set
# KAINBAIN_SKIP_APP_LINK=1 to skip (e.g. first deploy with no project yet).
publish_app_link() {
	local project_id="${APP_LINK_PROJECT:-}"
	if [ "${KAINBAIN_SKIP_APP_LINK:-}" = "1" ]; then
		return 0
	fi
	if [ -z "$project_id" ] && [ -f ".kainbain/project.json" ] && command -v node >/dev/null 2>&1; then
		project_id="$(node -e "try { process.stdout.write(require('./.kainbain/project.json').id || ''); } catch (e) {}" 2>/dev/null || true)"
	fi
	if [ -z "$project_id" ]; then
		log "⚠️  App-link publish skipped — no project id (.kainbain/project.json missing or node unavailable)."
		return 0
	fi
	local api_base="http://localhost:${PROD_API_PORT}"
	local payload=""
	if command -v jq >/dev/null 2>&1; then
		# `|| true`: a jq failure must degrade to the fallback payload, never
		# trip the ERR trap (which would auto-roll back a healthy deploy).
		payload="$(jq -n --arg url "$APP_LINK_URL" --arg health "$APP_LINK_HEALTH" \
			'{url: $url, status: "running", healthEndpoint: $health}' || true)"
	fi
	if [ -z "$payload" ]; then
		payload="{\"url\":\"$APP_LINK_URL\",\"status\":\"running\",\"healthEndpoint\":\"$APP_LINK_HEALTH\"}"
	fi
	if curl -fsS --max-time 10 -X PATCH "$api_base/projects/$project_id/app-status" \
		-H "Content-Type: application/json" -d "$payload" >/dev/null 2>&1; then
		log "🔗 App link published for project $project_id → $APP_LINK_URL"
	else
		log "⚠️  App-link publish failed (non-fatal) — PATCH $api_base/projects/$project_id/app-status"
	fi
	return 0
}

# --- Rollback -------------------------------------------------------------
# Restore the last known-good deployment from .prev and restart. Used both by
# `--rollback` and by the auto-rollback path after a failed health check or step.
do_rollback() {
	local reason="$1"
	local exit_code="${2:-1}"
	local failed_command="${3:-}"
	local details="${4:-}"

	log "Rolling back to previous deployment (.prev) — $reason"
	if [ ! -d "$PREV_DIR" ]; then
		log "❌ No previous deployment found at $PREV_DIR — cannot roll back."
		write_result "failed" "Rollback requested but no previous deployment exists ($reason)" "false" "$exit_code" "$failed_command" "$details"
		return 1
	fi
	# Atomically swap .prev back into place. Every step is guarded so a
	# rollback-mode failure (rollback mode arms no ERR trap) still leaves a
	# durable failed result instead of dying silently mid-swap.
	if ! rm -rf "$PROD_DIR" || ! mkdir -p "$PROD_DIR" || ! cp -r "$PREV_DIR/." "$PROD_DIR/"; then
		log "❌ Rollback copy failed — manual intervention required."
		write_result "failed" "Rollback copy failed ($reason)" "true" "$exit_code" "$failed_command" "${details:-copy from $PREV_DIR to $PROD_DIR failed}"
		return 1
	fi
	if ! restart_service; then
		log "❌ Rollback restart failed — manual intervention required."
		write_result "failed" "Rollback service restart failed ($reason)" "true" "$exit_code" "$failed_command" "${details:-$SERVICE_NAME restart failed}"
		return 1
	fi
	if health_check; then
		log "✅ Rollback successful — previous deployment is healthy."
		write_result "success" "Rolled back to previous deployment ($reason)" "true" "$exit_code" "$failed_command" "$details"
		return 0
	else
		log "❌ Rollback deployed but health check still failing — manual intervention required."
		local rollback_journal
		rollback_journal="$(service_logs)"
		write_result "failed" "Rollback deployed but health check still failing ($reason)" "true" "$exit_code" "$failed_command" "${details:-$rollback_journal}"
		return 1
	fi
}

# --- Dev mode -------------------------------------------------------------
# Local development is cross-platform: the Node supervisor clears the dev
# ports without OS-specific tooling and runs the API + Vite servers in the
# foreground (Ctrl-C stops both). This host runs Forgejo on :3000, so
# KainBain uses a dedicated API port (see frontend/.env —
# VITE_API_BASE/VITE_WS_URL default to :3100). `npm run dev` is the
# canonical form; this delegation keeps `./deploy.sh --dev` working.
# Note: dependencies are NOT installed here (the old body reinstalled on
# every start) — run `npm run setup` once after cloning.
if [ "$MODE" = "dev" ]; then
	exec node scripts/dev.mjs
fi

# --- Rollback mode --------------------------------------------------------
if [ "$MODE" = "rollback" ]; then
	STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	mkdir -p "$DEPLOY_DIR"
	# Acquire the lock so a rollback never races a deploy. The mkdir above
	# matters: on a first-ever run the deploy dir may not exist yet, and
	# without it the lock open fails with a bare redirection error.
	exec 9>"$LOCK_FILE"
	if ! flock -w "$LOCK_TIMEOUT" 9; then
		echo "❌ Another deployment is in progress — rollback aborted."
		exit 1
	fi
	do_rollback "manual rollback request"
	exit $?
fi

# --- Production deploy ----------------------------------------------------
if [ "$MODE" = "prod" ]; then
	STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	mkdir -p "$DEPLOY_DIR"

	# Fail fast on load-bearing tools: write_result/state/history need jq
	# (every result below would otherwise die inside jq with no durable
	# marker), and the post-restart health gate needs curl. A missing tool
	# aborts BEFORE the build counter is consumed, so a retry reuses the
	# same build number instead of skipping one.
	for _deploy_tool in jq curl; do
		if ! command -v "$_deploy_tool" >/dev/null 2>&1; then
			log "❌ Required tool '$_deploy_tool' not found — production deploys need jq (result/state files) and curl (health gate)."
			exit 1
		fi
	done

	on_error() {
		local exit_code="$1"
		local cmd="$2"
		local lineno="$3"
		trap - ERR EXIT
		[ -n "${STAGE:-}" ] && rm -rf "$STAGE"
		log "❌ Error on line $lineno: command '$cmd' failed with exit code $exit_code"
		local details=""
		if [ "$SWAPPED" = "true" ]; then
			log "Deployment was swapped — initiating auto-rollback..."
			details="$(service_logs)"
			do_rollback "command '$cmd' failed at line $lineno (exit $exit_code)" "$exit_code" "$cmd" "$details"
		else
			details="Deploy failed prior to directory swap at line $lineno"
			write_result "failed" "Deploy aborted: '$cmd' failed at line $lineno (exit $exit_code)" "false" "$exit_code" "$cmd" "$details"
		fi
		exit "$exit_code"
	}
	trap 'on_error $? "$BASH_COMMAND" $LINENO' ERR

	log "🚀 Starting deployment process (mode=$MODE fast=$FAST)..."

	# Warn-only: surface a shadowed/missing ./docs link in the deploy log
	# (see check_docs_link). Never fails the deploy.
	check_docs_link || true

	# ONE DEPLOY PER STAGE ATTEMPT (merge/deploy resume-loop fix). The engine
	# stamps KAINBAIN_DEPLOY_ATTEMPT_ID onto every deploy-like stage attempt.
	# If THIS attempt's checkpoint already records the deploy executing, adopt
	# that outcome instead of running the gates again — a re-dispatched
	# "Merge and deploy" stage used to start a second full deploy and restart
	# the service again, interrupting the stage again (the loop). A `running`
	# checkpoint whose process is still alive is waited on, never duplicated;
	# a recorded failure falls through as a genuine retry. Returns only when
	# this invocation should actually deploy.
	maybe_adopt_attempt_entry

    # Record the attempt as in flight BEFORE any gate runs so a duplicate
    # invocation (or a post-restart reconcile) can see it.
    write_attempt_checkpoint "running" "Deploy attempt started (gates running)" ""

    # Start the liveness ticker BEFORE the first gate: quiet gates must never
    # look stalled to the engine watchdog (see start_deploy_heartbeat). It is
    # stopped inside write_result on every terminal path, and the EXIT trap
    # below reaps it as a backstop.
    start_deploy_heartbeat

	# Prune old per-gate logs (each deploy writes several); keep the newest
	# 20 so a failing gate's full log is always on disk without unbounded
	# growth. Guarded: an empty glob must not fail the deploy under set -e.
	ls -t "$DEPLOY_DIR"/gate-*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null || true
	# Same for per-attempt checkpoints (one per deploy attempt).
	ls -t "$DEPLOY_DIR"/attempt-*.json 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null || true

	# The heavy gates below (tests, canary, scans, build, staging) run WITHOUT
	# the deploy lock. Holding flock across the whole suite used to serialize
	# every concurrent deploy into waiter aborts at exact 10-minute
	# (LOCK_TIMEOUT) intervals — the 2026-10-08 pileup. Only the
	# backup/swap/restart sequence below takes the lock. Record the tree
	# first: after acquiring the lock we re-verify HEAD is unchanged, so a
	# concurrent landing during our unlocked gates aborts loudly instead of
	# shipping code the gates never tested (TOCTOU guard).
	PRE_GATE_HEAD="$(git rev-parse HEAD 2>/dev/null || echo unknown)"

	# 1. Run all tests before deploying to ensure stability (skipped in --fast).
	#    --no-canary keeps parity WITHOUT duplication: `npm test` runs the
	#    same fast branches plus the canary suite in one gate, so here the
	#    fast branches run in this gate and the canary suite runs exactly
	#    once, below, as its own named gate.
	if [ "$FAST" != "true" ]; then
		run_gate "final-test-suite" "./run-tests.sh --no-canary" ./run-tests.sh --no-canary

		# 1b. Canary E2E gate (blocking): the Playwright suite runs on its
		#     auto-provisioned scratch stack (API :3399 + vite :5299), so it
		#     never touches live data — but it MUST pass before prod moves.
		#     Emergency opt-out only: KAINBAIN_SKIP_CANARY=1 (exactly "1",
		#     logged loudly). The exact-"1" contract matches resolveCanary()
		#     in scripts/run-tests.mjs, so `npm test` and `deploy.sh --prod`
		#     skip canary on the identical condition — a stray value (e.g. a
		#     typo) must never silently disable the gate in one entry point
		#     but not the other.
		if [ "${KAINBAIN_SKIP_CANARY:-}" = "1" ]; then
			log "⚠️ KAINBAIN_SKIP_CANARY=1 — canary E2E gate SKIPPED (emergency opt-out, not recommended)."
		else
			if [ -n "${KAINBAIN_SKIP_CANARY:-}" ]; then
				log "⚠️ KAINBAIN_SKIP_CANARY='${KAINBAIN_SKIP_CANARY}' is not exactly '1' — ignoring it and running the canary E2E gate (fail-safe: opt-out requires exactly '1')."
			fi
			# Drain scratch ports (3399, 5299) to prevent collisions
			log "🚦 Draining scratch ports (3399, 5299) before canary E2E..."
			scripts/drain-ports.sh 3399 5299
			run_gate "canary-e2e" "npm run test:canary" npm run test:canary
		fi

		# 2. Run security scans and publish to SecObserve (non-fatal: findings
		# never block a deploy, same as before — only the timing lines are new
		# so a hanging scanner is visible in deploy.log before any timeout).
		log "🛡️ Running security scans (Trivy, Semgrep, SBOM)..."
		if [ -f "./Security_scans.sh" ]; then
			_scan_start="$(date +%s)"
			if ./Security_scans.sh; then
				log "✅ Security scans finished in $(($(date +%s) - _scan_start))s."
			else
				log "⚠️ Security scans reported issues after $(($(date +%s) - _scan_start))s — continuing deploy (non-fatal)."
			fi
		fi
	else
		log "⚡ Fast mode — skipping tests and security scans."
	fi

	# 3. Build Frontend.
	# Production build talks to the same origin it is served from (relative
	# URLs), so it works behind the nginx proxy at https://kainbain.home.
	# An empty VITE_API_BASE/VITE_WS_URL means "same origin" (see api.js).
	# (`env`, not inline assignments: assignments preceding a shell function
	# persist after it returns — env keeps them scoped to the one command.)
	run_gate "frontend-build" "npm run build --prefix frontend" env VITE_API_BASE= VITE_WS_URL= npm run build --prefix frontend

	# 4. Prepare API.
	# The API is a plain Node app with no build step. We deliberately install the
	# full dependency set (including dev) rather than `--production`: stripping dev
	# deps here would remove vitest/eslint from api/node_modules, which breaks the
	# in-repo test suite and makes `npm run deploy` non-idempotent on the next run.
	# `--include=dev` forces dev deps even when NODE_ENV=production is set (which
	# would otherwise make npm skip them and break the deploy's own test suite).
	run_gate "api-install" "npm install --prefix api --include=dev" npm install --prefix api --include=dev

	# 5. Deploy production build to $PROD_DIR.
	log "📦 Deploying production build to $PROD_DIR ..."

	# Stage into a temp dir first so a failed copy never leaves a half-written
	# deployment behind. The guard matters: exits before this point (failed
	# tests, lock timeout) leave STAGE unset, and a bare `rm -rf ""` would
	# fail inside the trap and mask the real exit code.
	STAGE="$(mktemp -d)"
	# Backstop: reap the heartbeat ticker on ANY exit (including paths that
	# never reach write_result, e.g. the TOCTOU abort below) so no orphan
	# keeps refreshing the attempt checkpoint after this process is gone.
	trap 'stop_deploy_heartbeat 2>/dev/null || true; if [ -n "${STAGE:-}" ]; then rm -rf "$STAGE"; fi' EXIT

	# Copy the API source (excluding node_modules, docs, tests), the built
	# frontend, and shared modules. We reinstall node_modules in the staging
	# dir so the deployed copy is self-contained and matches the lockfile.
	mkdir -p "$STAGE/api" "$STAGE/frontend"
	tar -C api --exclude=node_modules --exclude=docs --exclude="*.test.js" -cf - . | tar -C "$STAGE/api" -xf -
	cp -r frontend/dist "$STAGE/frontend/dist"
	if [ -d "shared" ]; then
		mkdir -p "$STAGE/shared"
		tar -C shared --exclude="*.test.js" -cf - . | tar -C "$STAGE/shared" -xf -
	fi
	# NOTE (merge-conflict resolution, 2026-10-08): the "Stashed changes" side
	# (`cp -r shared`) shipped node_modules/test files into prod; the tar
	# pipeline above is the correct side (excludes tests, matches api/).
	# Ship the site-docs content next to the API: the backend resolves its
	# docs at <PROD_DIR>/site-docs (see defaultDocsDir in api/siteDocs.js).
	# Without this copy the deployed GET /docs index is empty and the Docs
	# tab renders "No docs articles yet."
	if [ -d "site-docs" ]; then
		mkdir -p "$STAGE/site-docs"
		cp -r site-docs/. "$STAGE/site-docs/"
	fi

	# Ship the default stage-skills library: the backend resolves global skills at
	# <PROD_DIR>/skills (see config.skillsDir). Without this copy the deployed
	# Skills tab shows no "KainBain defaults" and every shipped skill is
	# mislabelled as a custom project skill.
	if [ -d "skills" ]; then
		mkdir -p "$STAGE/skills"
		cp -r skills/. "$STAGE/skills/"
	fi

	# Ship the loopback Runner daemon next to the API: the cutover
	# local-Runner service runs `$PROD_DIR/runner/main.js`, importing
	# `../api/...` (pi harness, shared helpers) from the same build so the
	# Runner and the backend are always version-locked. Tests stay in the
	# repo (excluded here, like the api tar above).
	if [ -d "runner" ]; then
		mkdir -p "$STAGE/runner"
		tar -C runner --exclude="*.test.js" -cf - . | tar -C "$STAGE/runner" -xf -
	fi

	# Bake the Kainbain changelog for the header build badge: production is a
	# plain file copy without .git, so history is captured here at deploy time
	# and shipped as $PROD_DIR/changelog.json. Non-fatal (same precedent as
	# the security scans): a failed generation bakes a marker so the API
	# reports `generation-failed` distinctly from `not-baked`. The `if`
	# guard keeps a failing generator from tripping the ERR trap.
	log "📜 Baking Kainbain changelog..."
	if node scripts/generate-changelog.mjs --limit 200 --out "$STAGE/changelog.json"; then
		log "Changelog baked into $STAGE/changelog.json."
	else
		log "⚠️  Changelog generation failed — baking a failure marker (non-fatal)."
		cat >"$STAGE/changelog.json" <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "branch": null,
  "commit": null,
  "totalCount": null,
  "truncated": false,
  "limit": 200,
  "entries": [],
  "error": "changelog generation failed during deploy; see deploy.log"
}
EOF
	fi

	# Install production dependencies in the staged API (still unlocked: it
	# only touches the $STAGE temp dir). Same run_gate contract as the other
	# gates — `npm --prefix` avoids a subshell cd so PIPESTATUS stays exact.
	run_gate "staged-install" "npm install --omit=dev (staged api)" npm install --prefix "$STAGE/api" --omit=dev

	# Verify hermeticity: test that staged API can import its entrypoint and shared modules
	# before touching production or taking down the running service.
	_verify_log="$DEPLOY_DIR/gate-staged-verify-${BUILD_NUMBER:-pending}-$$.log"
	_verify_start="$(date +%s)"
	log "▶ Gate 'staged-verify' starting (full output: $_verify_log)..."
	(cd "$STAGE/api" && NODE_ENV=production node --input-type=module -e '
		try {
			await import("./index.js");
		} catch (err) {
			// If index.js tries to listen on port, that is expected or it will start;
			// but if an ERR_MODULE_NOT_FOUND or syntax error occurs, fail immediately.
			if (err.code === "ERR_MODULE_NOT_FOUND") {
				console.error("Missing module in staged deploy:", err);
				process.exit(1);
			}
		}
	') 2>&1 | tee "$_verify_log"
	_verify_code="${PIPESTATUS[0]}"
	if [ "$_verify_code" -eq 0 ]; then
		log "✅ Gate 'staged-verify' passed in $(($(date +%s) - _verify_start))s."
	else
		log "❌ Staged import verification failed after $(($(date +%s) - _verify_start))s — aborting deploy. Current app left untouched."
		_verify_details="Last $GATE_TAIL_LINES lines of $_verify_log:"
		_verify_details="$_verify_details
$(gate_tail "$_verify_log")"
		write_result "failed" "Gate 'staged-verify' failed (exit $_verify_code)" "false" "$_verify_code" "node staged verification" "$_verify_details"
		exit "$_verify_code"
	fi

	# 5b. Serialize the production swap. All gates above ran unlocked; the
	# lock is held ONLY for the backup/swap/restart sequence below (seconds,
	# not tens of minutes), so a concurrent deploy waits briefly instead of
	# aborting after LOCK_TIMEOUT. A waiter that still cannot acquire the
	# lock records lock-busy evidence WITHOUT touching last-result.json (see
	# write_lock_busy) and exits 75 (EX_TEMPFAIL — safe to retry).
	exec 9>"$LOCK_FILE"
	if ! flock -w "$LOCK_TIMEOUT" 9; then
		_holder_started="$(stat -c %y "$LOCK_FILE" 2>/dev/null || echo "unknown start time")"
		log "❌ Another deployment is already in progress (lock holder active since roughly $_holder_started) — this attempt did not run. Retry after the holder finishes; see $LOG_FILE and $LOCK_BUSY_FILE."
		write_lock_busy "holder active (lock file mtime: $_holder_started)"
		exit 75
	fi

	# Consume the next build number only AFTER acquiring the lock, so waiters
	# that abort (or TOCTOU aborts below) never burn a build number and leave
	# gaps in the build sequence.
	# Snapshot the live build BEFORE consuming the next number: the .prev
	# backup below holds the previous build's content, so the release
	# archive must be labelled with the previous number. Reading the
	# counter after the increment would mislabel the snapshot.
	PREV_BUILD="$(current_build)"
	BUILD_NUMBER="$(next_build)"
	echo "$BUILD_NUMBER" >"$BUILD_COUNTER"
	log "📦 Build number: $BUILD_NUMBER (previous: $PREV_BUILD)"

	# TOCTOU guard: the gates above ran unlocked, so another deploy may have
	# landed while we tested. Refuse to ship code the gates never saw.
	POST_LOCK_HEAD="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
	if [ "$PRE_GATE_HEAD" != "unknown" ] && [ "$POST_LOCK_HEAD" != "unknown" ] && [ "$PRE_GATE_HEAD" != "$POST_LOCK_HEAD" ]; then
		log "❌ Tree changed during unlocked gates ($PRE_GATE_HEAD → $POST_LOCK_HEAD) — aborting deploy. Re-run so the gates test the landed tree."
		write_result "failed" "Tree changed during unlocked gates ($PRE_GATE_HEAD → $POST_LOCK_HEAD)" "false" 1 "git rev-parse HEAD" "PRE_GATE_HEAD=$PRE_GATE_HEAD POST_LOCK_HEAD=$POST_LOCK_HEAD — another deploy landed mid-gates; re-run the deploy on the new tree"
		exit 1
	fi

	# Back up the current deployment (if any) to .prev so we can roll back.
	# This is the "last known-good" snapshot. Handles the asymmetric case where
	# PROD_DIR does not exist yet (first deploy) or .prev already exists.
	if [ -d "$PROD_DIR" ]; then
		log "Backing up current deployment to $PREV_DIR ..."
		rm -rf "$PREV_DIR"
		cp -r "$PROD_DIR" "$PREV_DIR"

		# Maintain multi-version release archive in ~/.kainbain/deploy/releases.
		# PREV_BUILD was captured before the counter increment above, so the
		# snapshot label matches the content (the .prev backup of the live
		# build we are replacing).
		mkdir -p "$DEPLOY_DIR/releases"
		if [ "$PREV_BUILD" -gt 0 ]; then
			RELEASE_SNAPSHOT="$DEPLOY_DIR/releases/build-$PREV_BUILD"
			rm -rf "$RELEASE_SNAPSHOT"
			cp -r "$PROD_DIR" "$RELEASE_SNAPSHOT"
			# Prune releases keeping only the most recent 5 snapshots
			ls -dt "$DEPLOY_DIR/releases/build-"* 2>/dev/null | tail -n +6 | xargs rm -rf 2>/dev/null || true
		fi
	else
		log "No existing deployment at $PROD_DIR — first deploy, no .prev backup."
	fi

	# Mark that we are now touching the live production directory.
	SWAPPED="true"

	# Atomically swap the staged build into place.
	rm -rf "$PROD_DIR"
	mkdir -p "$PROD_DIR"
	cp -r "$STAGE/api" "$PROD_DIR/api"
	cp -r "$STAGE/frontend" "$PROD_DIR/frontend"
	if [ -d "$STAGE/shared" ]; then
		cp -r "$STAGE/shared" "$PROD_DIR/shared"
	fi
	if [ -d "$STAGE/site-docs" ]; then
		cp -r "$STAGE/site-docs" "$PROD_DIR/site-docs"
	fi
	if [ -d "$STAGE/skills" ]; then
		cp -r "$STAGE/skills" "$PROD_DIR/skills"
	fi
	if [ -d "$STAGE/runner" ]; then
		cp -r "$STAGE/runner" "$PROD_DIR/runner"
	fi
	if [ -f "$STAGE/changelog.json" ]; then
		cp "$STAGE/changelog.json" "$PROD_DIR/changelog.json"
	fi

	# Stamp the build number into the live deployment so the running instance
	# (and the .prev backup taken BEFORE this swap, i.e. the previous build)
	# carries the exact build that is live.
	stamp_build_json

	# Record the deploy intent BEFORE restarting the service, so the result is on
	# disk before the cgroup kill (KillMode=control-group) at restart_service. The
	# engine's reconcileInterruptedDeploys reads this durable marker on the next
	# API start to advance/complete a task whose deploy stage was interrupted by
	# the restart. The final status is written after the health check below.
	write_result "deploying" "Deploying build $BUILD_NUMBER (pre-restart marker)" "false"

	# 6. Restart the production service (systemd user unit).
	# No stdio detach is needed here: the transient unit's stdout/stderr go
	# to the journal (no --pipe, see the re-exec contract above), and the
	# journal never has a dead reader — so the cgroup kill of the API and
	# its --wait watcher cannot EPIPE this script, and the health gate,
	# write_result "success", and auto-rollback below always run.
	restart_service

	# 7. Health-check the NEW instance. If it fails to come up, auto-roll back
	#    to .prev so a small bug never leaves the app down.
	if health_check; then
		log "✅ New deployment is healthy."
		# Warn-only: the new instance is already live and healthy, so an
		# nginx reload failure must never trip the ERR trap into rolling
		# back good work — it just needs a loud log line.
		if ! reload_nginx; then
			log "⚠️ nginx reload failed (non-fatal) — the new deployment is live; reload the proxy manually."
		fi
		# Self-test the "Go to App" API against the NEW instance. Warn-only:
		# must never fail a healthy deploy (see publish_app_link).
		publish_app_link || true
		# The cutover local-Runner service executes from PROD_DIR, which was
		# just swapped underneath it: restart it onto the new build so the
		# Runner and backend stay version-locked. Warn-only (never fail a
		# healthy deploy): a mid-assignment restart just lets the claim TTL
		# expire and the task re-queues by design. Skipped when the unit is
		# not installed yet (pre-cutover hosts).
		for unit_file in "$HOME/.config/systemd/user"/kainbain-runner-local-*.service; do
			[ -e "$unit_file" ] || continue
			unit_name="$(basename "$unit_file")"
			if systemctl --user restart "$unit_name" 2>/dev/null; then
				log "Restarted $unit_name onto the new build."
			else
				log "⚠️ $unit_name restart failed (non-fatal) — restart it manually."
			fi
		done
		write_result "success" "Deployment complete and healthy" "false"
		echo "--------------------------------------------------"
		echo "✅ Production deployment complete!"
		echo "   App:      https://kainbain.home"
		echo "   Location: $PROD_DIR"
		echo "   Service:  systemctl --user status $SERVICE_NAME"
		echo "--------------------------------------------------"
		export KAINBAIN_DEPLOYED_ALREADY=1
		exit 0
	else
		log "❌ Health check failed after deploy — auto-rolling back to previous deployment."
		HEALTH_JOURNAL="$(service_logs)"
		# `|| true`: do_rollback returns 1 when the rollback itself fails, and
		# a bare failing call would trip the ERR trap above into a SECOND
		# rollback (double rm -rf of PROD_DIR). The outcome is recorded in
		# last-result.json either way; the deploy failed, so exit 1.
		do_rollback "health check failed after deploy" 1 "health_check" "$HEALTH_JOURNAL" || true
		exit 1
	fi
fi

# --- Build-only mode ------------------------------------------------------
echo "✅ Deployment assets ready!"
echo "--------------------------------------------------"
echo "Frontend build location: ~/projects/kainbain/frontend/dist"
echo "API production ready in: ~/projects/kainbain/api"
echo "--------------------------------------------------"
echo "Ready to be served by Nginx or wrapped in Docker."
