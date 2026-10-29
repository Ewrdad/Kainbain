#!/bin/bash
# Deployment script for KainBain.
#
#   ./deploy.sh --dev       Start local dev servers (API + Vite frontend).
#   ./deploy.sh --prod      Full production deploy: tests + security scans +
#                           build + publish (git push via dev-box ssh auth +
#                           Hub images via publish.sh) + deploy to
#                           ~/apps/kainbain, restart, reload nginx.
#                           This is the only publisher — no cron job needed.
#   ./deploy.sh --prod --fast   Production deploy WITHOUT tests/security scans
#                           (rapid self-iteration; the health-check + rollback
#                           gate below is the safety net).
#   ./deploy.sh --rollback  Restore the last known-good deployment (.prev) and
#                           restart the service.
#   ./deploy.sh             Build Docker images + runner distributable (no deploy).
#   ./deploy.sh --prod --prod-dir ~/apps/kainbain   Docker deploy to that folder (or $KAINBAIN_PROD_DIR).
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

# Host commands must never run inside a task worktree (branch kb/*): they
# publish/deploy the primary checkout only (AsymmetricUpdatesPlan DA9).
if [ -n "${KAINBAIN_TASK_ID:-}" ]; then
    _kb_branch="$(git branch --show-current 2>/dev/null || true)"
    case "$_kb_branch" in
        kb/*)
            echo "deploy.sh: refusing to run from a task worktree (branch kb/*) — deploy/publish stages must run on the primary checkout" >&2
            exit 78
            ;;
    esac
    unset _kb_branch
fi

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
PROD_DIR="${KAINBAIN_PROD_DIR:-$HOME/apps/kainbain}"
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
	--prod-dir) PROD_DIR="${2:?--prod-dir needs a path}"; shift ;;
	--prod-dir=*) PROD_DIR="${1#--prod-dir=}" ;;
	*)
		echo "Unknown parameter passed: $1"
		exit 1
		;;
	esac
	shift
done

BUILD_JSON="$PROD_DIR/build.json"
PREV_DIR="${PROD_DIR}.prev"
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
	log "Starting Docker Compose stack in $PROD_DIR ..."
	if [ -f "$PROD_DIR/docker-compose.yml" ]; then
		command -v docker >/dev/null 2>&1 || { log "❌ docker not found — cannot start Compose prod."; return 1; }
		systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
		if command -v fuser >/dev/null 2>&1; then fuser -k -TERM "${PROD_API_PORT}/tcp" 2>/dev/null || true; sleep 2; fi
		(cd "$PROD_DIR" && docker compose up -d)
	else
		log "No compose file in $PROD_DIR — falling back to systemd $SERVICE_NAME."
		systemctl --user daemon-reload; systemctl --user restart "$SERVICE_NAME"
	fi
}

# --- Service logs -----------------------------------------------------------
# journalctl wrapper: identical output on systemd hosts, honest fallback where
# the journal is unavailable (guarded so non-systemd hosts degrade gracefully).
service_logs() {
	if command -v journalctl >/dev/null 2>&1; then
		journalctl --user-unit "$SERVICE_NAME" -n 25 --no-pager 2>&1 || true; [ -f "$PROD_DIR/docker-compose.yml" ] && (cd "$PROD_DIR" && docker compose logs --tail=25 2>&1) || true
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

	# 0. Deploy-tree gate (blocking): deploy ships the live checkout, so a
	#    tree stranded on a task branch (kb/*) would ship unmerged task code
	#    with stale engine modules (the build-581 incident did exactly
	#    that). Refuses unless the checkout is on the default branch.
	#    Emergency opt-out only: KAINBAIN_ALLOW_BRANCH_DEPLOY=1 (exactly
	#    "1", logged loudly). Detached HEAD or an unresolvable default
	#    branch warns and proceeds (CI checkouts must keep working).
	require_default_branch_tree() {
		if [ "${KAINBAIN_ALLOW_BRANCH_DEPLOY:-}" = "1" ]; then
			log "⚠️ KAINBAIN_ALLOW_BRANCH_DEPLOY=1 — deploying from a non-default branch (emergency opt-out)."
			return 0
		fi
		local current default_branch
		current="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
		default_branch="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')"
		if [ -z "$default_branch" ]; then
			if git show-ref --verify --quiet refs/heads/main 2>/dev/null; then
				default_branch="main"
			elif git show-ref --verify --quiet refs/heads/master 2>/dev/null; then
				default_branch="master"
			fi
		fi
		if [ "$current" = "HEAD" ] || [ "$current" = "unknown" ] || [ -z "$default_branch" ]; then
			log "⚠️ Deploy-tree check skipped (current='$current', default='${default_branch:-unknown}') — proceeding."
			return 0
		fi
		if [ "$current" != "$default_branch" ]; then
			log "❌ Refusing deploy: checkout is on '$current', not the default branch '$default_branch'. Switch to '$default_branch' first (or set KAINBAIN_ALLOW_BRANCH_DEPLOY=1 to override)."
			return 1
		fi
		log "✅ Deploy tree is on the default branch '$current'."
		return 0
	}
	run_gate "deploy-tree" "require_default_branch_tree" require_default_branch_tree

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
			# Hermetic canary state: a fresh run tag per deploy so tasks left
			# behind by earlier runs can never leak into this run's boards or
			# queue-depth counts (see playwright.config.js).
			# Sharded 1/2 + 2/2 over two fresh stacks: one 135-test browser
			# process grows unbounded memory over ~10 minutes on the shared
			# 4-core gate host until the stack dies mid-run and cascades.
			# Two sequential shards run the identical 135 assertions with a
			# fresh browser, backend, and state dir each.
			export KB_CANARY_RUN_TAG="deploy-${BUILD_NUMBER:-0}-$(date +%s)-s1"
			run_gate "canary-e2e-shard-1" "npm run test:canary -- --shard=1/2" npm run test:canary -- --shard=1/2
			export KB_CANARY_RUN_TAG="deploy-${BUILD_NUMBER:-0}-$(date +%s)-s2"
			run_gate "canary-e2e-shard-2" "npm run test:canary -- --shard=2/2" npm run test:canary -- --shard=2/2
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

	# 5. Publish everything from this checkout (replaces the per-minute cron
	#    convergence job): push git refs with the dev box's ssh auth, then
	#    build + push Hub images via publish.sh. Prod serves the Hub images,
	#    so the registry publish is blocking; the git push is warn-only (a
	#    stale remote must never block a local prod deploy — the next deploy
	#    pushes again).
	publish_git_refs() {
		local pushed=0 failed=0 b out
		for b in $(git for-each-ref --format='%(refname:short)' refs/heads/ 2>/dev/null); do
			case "$b" in main|kb/*) ;; *) continue ;; esac
			if ! git rev-parse --verify --quiet "refs/remotes/origin/$b" >/dev/null; then
				log "⏭️ Skipping new local branch '$b' (no remote ref yet — publish it once by hand: git push -u origin $b)."
				continue
			fi
			if out="$(git push origin "$b" 2>&1 | head -n 2)"; then
				log "📤 Pushed '$b': $out"
				pushed=$((pushed + 1))
			else
				log "⚠️ Push of '$b' failed (warn-only — local deploy continues): $out"
				failed=$((failed + 1))
			fi
		done
		log "📤 Git publish: $pushed ref(s) pushed, $failed failed."
	}
	publish_git_refs || true
	if [ -z "${KAINBAIN_DOCKERHUB_NAMESPACE:-}" ]; then
		log "⚠️ KAINBAIN_DOCKERHUB_NAMESPACE unset — defaulting to 'ewrdad' (repo remote owner); override via env."
		export KAINBAIN_DOCKERHUB_NAMESPACE="ewrdad"
	fi
	if [ "$FAST" = "true" ]; then
		run_gate "registry-publish" "./publish.sh --detect --fast" ./publish.sh --detect --fast
	else
		run_gate "registry-publish" "./publish.sh --detect" ./publish.sh --detect
	fi

	# 6. Stage the minimal Docker install for $PROD_DIR (compose + .env +
	#    startRunner.sh + runner/ + release manifest). Prod runs the Hub
	#    images named in dist/release-manifest.json (written by the publish
	#    step above) — no separate local image build here.
	log "📦 Deploying Docker production build to $PROD_DIR ..."
	STAGE="$(mktemp -d)"
	trap 'stop_deploy_heartbeat 2>/dev/null || true; if [ -n "${STAGE:-}" ]; then rm -rf "$STAGE"; fi' EXIT
	# Stage the runner distributable (runner + pruned api + shared, version-locked).
	mkdir -p "$STAGE/runner/runner" "$STAGE/runner/api" "$STAGE/runner/shared"
	tar -C runner --exclude="*.test.js" -cf - . | tar -C "$STAGE/runner/runner" -xf -
	tar -C api --exclude=node_modules --exclude=docs --exclude="*.test.js" -cf - . | tar -C "$STAGE/runner/api" -xf -
	tar -C shared --exclude="*.test.js" -cf - . | tar -C "$STAGE/runner/shared" -xf -
	cp startRunner.sh "$STAGE/startRunner.sh"; cp docker-compose.prod.yml "$STAGE/docker-compose.yml"
	log "📜 Baking Kainbain changelog..."
	if node scripts/generate-changelog.mjs --limit 200 --out "$STAGE/changelog.json"; then log "Changelog baked into $STAGE/changelog.json."; else echo '{"entries":[],"error":"changelog generation failed during deploy"}' > "$STAGE/changelog.json"; fi
	# Backend manifest tag doubles as the deploy's image tag (legacy
	# KAINBAIN_IMAGE_TAG consumers fall back to it); purely informational
	# when the manifest is absent.
	IMAGE_TAG="$(node -e 'try{const m=JSON.parse(require("fs").readFileSync("dist/release-manifest.json","utf8"));console.log(m.components?.backend?.tag||"")}catch(e){}' 2>/dev/null)"
	if [ -z "$IMAGE_TAG" ]; then
		IMAGE_TAG="build-$(next_build)-$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
	fi
	log "🐳 Prod images pinned by release manifest (backend tag: $IMAGE_TAG)."
exec 9>"$LOCK_FILE"
	if ! flock -w "$LOCK_TIMEOUT" 9; then
		_holder_started="$(stat -c %y "$LOCK_FILE" 2>/dev/null || echo "unknown start time")"
		log "❌ Another deployment is already in progress (lock holder active since roughly $_holder_started) — this attempt did not run."
		write_lock_busy "holder active (lock file mtime: $_holder_started)"; exit 75
	fi
	PREV_BUILD="$(current_build)"; BUILD_NUMBER="$(next_build)"; echo "$BUILD_NUMBER" >"$BUILD_COUNTER"
	log "📦 Build number: $BUILD_NUMBER (previous: $PREV_BUILD)"
	POST_LOCK_HEAD="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
	if [ "$PRE_GATE_HEAD" != "unknown" ] && [ "$POST_LOCK_HEAD" != "unknown" ] && [ "$PRE_GATE_HEAD" != "$POST_LOCK_HEAD" ]; then
		log "❌ Tree changed during unlocked gates ($PRE_GATE_HEAD → $POST_LOCK_HEAD) — aborting deploy."
		write_result "failed" "Tree changed during unlocked gates ($PRE_GATE_HEAD → $POST_LOCK_HEAD)" "false" 1 "git rev-parse HEAD" "PRE_GATE_HEAD=$PRE_GATE_HEAD POST_LOCK_HEAD=$POST_LOCK_HEAD"; exit 1
	fi
	# Pull the published images now so a registry problem fails loudly before
	# touching prod (compose would otherwise fail mid-restart instead).
	_pull_images="$(node -e 'try{const m=JSON.parse(require("fs").readFileSync("dist/release-manifest.json","utf8"));const imgs=[m.components?.backend?.image,m.components?.frontend?.image].filter(Boolean);console.log(imgs.join(" "))}catch(e){}' 2>/dev/null)"
	if [ -n "$_pull_images" ]; then
		# One gate per image: `docker pull` takes a single reference, and
		# separate gates keep per-image logs (gate-image-pull-N-*.log).
		_pull_n=0
		for _pull_img in $_pull_images; do
			_pull_n=$((_pull_n + 1))
			run_gate "image-pull-$_pull_n" "docker pull $_pull_img" docker pull "$_pull_img"
		done
		unset _pull_n _pull_img
	else
		log "⚠️ No images in dist/release-manifest.json — skipping pull (compose falls back to local tags)."
	fi
	unset _pull_images
	# Back up the current deployment (if any) to .prev so we can roll back.
	if [ -d "$PROD_DIR" ]; then log "Backing up current deployment to $PREV_DIR ..."; rm -rf "$PREV_DIR"; cp -r "$PROD_DIR" "$PREV_DIR"; else log "No existing deployment at $PROD_DIR — first deploy, no .prev backup."; fi
	SWAPPED="true"
	mkdir -p "$PROD_DIR"
	rm -rf "$PROD_DIR/api" "$PROD_DIR/frontend" "$PROD_DIR/shared" "$PROD_DIR/site-docs" "$PROD_DIR/skills"
	cp "$STAGE/docker-compose.yml" "$PROD_DIR/docker-compose.yml"; cp "$STAGE/startRunner.sh" "$PROD_DIR/startRunner.sh"; chmod +x "$PROD_DIR/startRunner.sh"
	rm -rf "$PROD_DIR/runner"; cp -r "$STAGE/runner" "$PROD_DIR/runner"; cp "$STAGE/changelog.json" "$PROD_DIR/changelog.json"
	# Ship the release manifest + runner tarball so any host (or pipeline
	# step) can roll forward to exactly these bits with homelab-pull.sh.
	cp dist/release-manifest.json "$PROD_DIR/release-manifest.json"
	_manifest_runner="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("dist/release-manifest.json","utf8")).components?.runner?.artifact||"")}catch(e){}' 2>/dev/null)"
	if [ -n "$_manifest_runner" ] && [ -f "dist/$_manifest_runner" ]; then
		cp "dist/$_manifest_runner" "$PROD_DIR/"
	else
		log "⚠️ Runner artifact '${_manifest_runner:-none}' not in dist/ — leaving $PROD_DIR runner tarballs as-is."
	fi
	unset _manifest_runner
	# .env: preserve existing secrets; only update image tag/build and fill missing host paths.
	JOIN_TOKEN=""; [ -f "$HOME/.kainbain/runner-join.token" ] && JOIN_TOKEN="$(cat "$HOME/.kainbain/runner-join.token")"
	if [ ! -f "$PROD_DIR/.env" ]; then
		{ echo "KAINBAIN_IMAGE_TAG=$IMAGE_TAG"; echo "KAINBAIN_BUILD_NUMBER=$BUILD_NUMBER"; echo "KAINBAIN_PORT=${PROD_API_PORT}"; echo "KAINBAIN_PROJECTS_HOST=$HOME/projects"; echo "KAINBAIN_STATE_HOST=$HOME/.kainbain"; echo "KAINBAIN_NOTES_HOST=$HOME/apps/notes/silverbullet/space/Projects/Personal"; echo "NODE_ENV=production"; echo "PUBLIC_KB_URL=https://kainbain.home"; echo "CORS_ALLOWED_ORIGINS=https://kainbain.home"; echo "KAINBAIN_RUNNER_EXECUTION_ONLY=1"; echo "KAINBAIN_SELF_DEPLOY_CONTINUITY=1"; echo "KAINBAIN_RUNNER_JOIN_TOKEN=$JOIN_TOKEN"; } > "$PROD_DIR/.env"; chmod 600 "$PROD_DIR/.env"
	else
		sed -i "s/^KAINBAIN_IMAGE_TAG=.*/KAINBAIN_IMAGE_TAG=$IMAGE_TAG/; s/^KAINBAIN_BUILD_NUMBER=.*/KAINBAIN_BUILD_NUMBER=$BUILD_NUMBER/" "$PROD_DIR/.env"
		grep -q '^KAINBAIN_IMAGE_TAG=' "$PROD_DIR/.env" || echo "KAINBAIN_IMAGE_TAG=$IMAGE_TAG" >> "$PROD_DIR/.env"
		grep -q '^KAINBAIN_PROJECTS_CONTAINER_PATH=' "$PROD_DIR/.env" || { _ph="$(grep '^KAINBAIN_PROJECTS_HOST=' "$PROD_DIR/.env" | cut -d= -f2-)"; [ -n "$_ph" ] && echo "KAINBAIN_PROJECTS_CONTAINER_PATH=$_ph" >> "$PROD_DIR/.env" || true; }
		grep -q '^KAINBAIN_NOTES_CONTAINER_PATH=' "$PROD_DIR/.env" || { _nh="$(grep '^KAINBAIN_NOTES_HOST=' "$PROD_DIR/.env" | cut -d= -f2-)"; [ -n "$_nh" ] && echo "KAINBAIN_NOTES_CONTAINER_PATH=$_nh" >> "$PROD_DIR/.env" || true; }
		# Pin the just-published Hub images (prod serves these, not local
		# builds — without this the compose file keeps running stale tags).
		# IMAGE holds the repo only (no :tag); the compose file appends
		# :TAG itself — same split as redeploy.sh (repo="${image%:*}").
		if [ -f "dist/release-manifest.json" ]; then
			_manifest_tags="$(node -e 'try{const m=JSON.parse(require("fs").readFileSync("dist/release-manifest.json","utf8"));const b=m.components?.backend||{},f=m.components?.frontend||{};const repo=(i)=>(i||"").replace(/:[^/:]+$/,"");console.log([repo(b.image),b.tag||"",repo(f.image),f.tag||""].join("\n"))}catch(e){}' 2>/dev/null)"
			_mbi="$(printf '%s' "$_manifest_tags" | sed -n '1p')"; _mbt="$(printf '%s' "$_manifest_tags" | sed -n '2p')"
			_mfi="$(printf '%s' "$_manifest_tags" | sed -n '3p')"; _mft="$(printf '%s' "$_manifest_tags" | sed -n '4p')"
			for _kv in "KAINBAIN_BACKEND_IMAGE:$_mbi" "KAINBAIN_BACKEND_TAG:$_mbt" "KAINBAIN_FRONTEND_IMAGE:$_mfi" "KAINBAIN_FRONTEND_TAG:$_mft"; do
				_k="${_kv%%:*}"; _v="${_kv#*:}"
				if [ -n "$_v" ]; then
					if grep -q "^${_k}=" "$PROD_DIR/.env"; then
						sed -i "s|^${_k}=.*|${_k}=${_v}|" "$PROD_DIR/.env"
					else
						echo "${_k}=${_v}" >> "$PROD_DIR/.env"
					fi
				fi
			done
			unset _manifest_tags _mbi _mbt _mfi _mft _kv _k _v
		fi
	fi
	stamp_build_json
	write_result "deploying" "Deploying build $BUILD_NUMBER (pre-restart marker)" "false"

	# 7. Restart the production service (systemd user unit).
	# No stdio detach is needed here: the transient unit's stdout/stderr go
	# to the journal (no --pipe, see the re-exec contract above), and the
	# journal never has a dead reader — so the cgroup kill of the API and
	# its --wait watcher cannot EPIPE this script, and the health gate,
	# write_result "success", and auto-rollback below always run.
	restart_service

	# 8. Health-check the NEW instance. If it fails to come up, auto-roll back
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
		# Runner-only fleet: every host ships one local Runner by default
		# (same binary as a remote Runner — only KAINBAIN_RUNNER_BACKEND
		# differs). Ensure the default unit exists before restarting the
		# fleet onto the new build. Warn-only: approval stays manual (D4).
		if [ -x "$PROD_DIR/startRunner.sh" ]; then "$PROD_DIR/startRunner.sh" --ensure 2>/dev/null || true; else log "⚠️ startRunner.sh not found in $PROD_DIR — skipping Runner ensure."; fi
		./scripts/ensure-native-bindings.sh "$PWD" >/dev/null 2>&1 || true
		write_result "success" "Deployment complete and healthy" "false"
		echo "--------------------------------------------------"
		echo "✅ Production deployment complete!"
		echo "   App:      https://kainbain.home"
		echo "   Location: $PROD_DIR"
		echo "   Service:  docker compose -f $PROD_DIR/docker-compose.yml ps"
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
log "🐳 Building Docker images (default mode)..."
KAINBAIN_BUILD_REF="$(git rev-parse --short HEAD 2>/dev/null || echo dev)" docker compose -f docker-compose.yml build
./scripts/ensure-native-bindings.sh "$PWD" || true
./scripts/package-runner.sh
echo "✅ Images built (kainbain-backend/frontend:latest) + runner distributable in dist/. Deploy with: ./deploy.sh --prod [--prod-dir ~/apps/kainbain]"
