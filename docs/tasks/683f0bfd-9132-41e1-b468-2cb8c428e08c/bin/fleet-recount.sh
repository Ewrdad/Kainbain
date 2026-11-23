#!/usr/bin/env bash
# fleet-recount.sh <label> — GUIDE-07 §5 fleet script + WIDE_NET_ANALYSIS.md §2 table.
#
# Read-only against the backend API (PROD-READ-ONLY, approved by SURVEY.md q2).
# Scope pinned to project 0fd41821 (full UUID) per SURVEY.md q4, so the output
# compares directly with the 2026-11-21 baseline in WIDE_NET_ANALYSIS.md §2.
#
# Outputs (relative to the task folder, pass TASK_DIR env or run from there):
#   raw/<label>/<taskId>.json      raw GET /tasks/<id> payloads (evidence)
#   recount-<label>.jsonl          one aggregated row per task (GUIDE-07 §5 shape)
#   stdout                         the WIDE_NET §2 table + E5 worklist
#
# Usage: cd docs/tasks/683f0bfd-... && bin/fleet-recount.sh before > RECOUNT-BEFORE-raw.txt
set -euo pipefail
API_BASE="${KAINBAIN_API_BASE:-http://192.168.1.206:3100}"
PROJECT_ID="${KAINBAIN_PROJECT_ID:-0fd41821-d8a5-4e49-bc2e-28ce8c739a0a}"
LABEL="${1:?usage: fleet-recount.sh <before|after> [task-dir]}"
TASK_DIR="${2:-$(pwd)}"
RAW_DIR="$TASK_DIR/raw/$LABEL"
mkdir -p "$RAW_DIR"

PER_TASK_JQ='
def ts: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
. as $t |
([$t.history[]? | select(.action | test("interrupted execution"))]) as $ints |
{
  task: $t.id,
  status: $t.status,
  runner_interrupts: ($ints | length),
  with_reason: ([$ints[] | select(.action | test("Reason:"))] | length),
  bare: ([$ints[] | select(.action | test("Reason:") | not)] | length),
  per_runner: ($ints | map(.action | capture("Runner (?<r>[^ ]+) interrupted execution").r)
                   | group_by(.) | map({runner: .[0], n: length})),
  reasons: ([$ints[] | select(.action | test("Reason:"))
              | .action | capture("Reason: (?<x>.*)$").x] | unique),
  auto_resumed: ([$t.history[]? | select(.action | test("Auto-resumed after server restart"))] | length),
  server_restart: ([$t.history[]? | select(.action | test("interrupted by server restart"))] | length),
  recovered_server_restart: ([$t.history[]? | select(.action | test("Execution recovered after server restart"))] | length),
  escalated: ([$t.history[]? | select(.action | test("Runner deaths escalated"))] | length),
  failed_stage: ([$t.history[]? | select(.action | test("Stage failed in|Failed back to stage"))] | length),
  git_failure_streak: ($t.gitFailureStreak.count // 0),
  last_error_git_kind: ($t.lastError.gitDiagnostics.kind // null),
  interrupt_details: [
    $t.history | to_entries[] | select(.value.action | test("interrupted execution")) |
    .key as $i | .value |
    ($t.history[0:$i] | map(select(.action | test(": started$"))) | last) as $s |
    ($t.history[0:$i] | map(select(.action | test(": (started|prompted|finished)$"))) | last) as $p |
    {
      ts: .timestamp,
      runner: (.action | capture("Runner (?<r>[^ ]+) interrupted execution").r),
      reason: (if .action | test("Reason:") then (.action | capture("Reason: (?<x>.*)$").x) else null end),
      delta_s_from_started: (if $s then ((.timestamp | ts) - ($s.timestamp | ts)) else null end),
      prev_progress_event: ($p.action // null)
    }
  ]
}'

AGG_JQ='
{
  tasks_total: length,
  tasks_with_interrupts: ([.[] | select(.runner_interrupts > 0)] | length),
  runner_interrupts: ([.[].runner_interrupts] | add // 0),
  with_reason: ([.[].with_reason] | add // 0),
  bare: ([.[].bare] | add // 0),
  per_runner: ([.[].per_runner[]?] | group_by(.runner) | map({runner: .[0].runner, n: (map(.n) | add)}) | sort_by(.runner)),
  le15s_after_started: ([.[].interrupt_details[]? | select(.delta_s_from_started != null and .delta_s_from_started <= 15)] | length),
  ge120s_after_started: ([.[].interrupt_details[]? | select(.delta_s_from_started != null and .delta_s_from_started >= 120)] | length),
  post_finished_interrupts: ([.[].interrupt_details[]? | select(.prev_progress_event != null and (.prev_progress_event | test(": finished$")))] | length),
  median_delta_s: ([.[].interrupt_details[]? | select(.delta_s_from_started != null) | .delta_s_from_started] | sort as $d | (if ($d|length) > 0 then $d[($d|length)/2] else null end)),
  auto_resumed: ([.[].auto_resumed] | add // 0),
  server_restart: ([.[].server_restart] | add // 0),
  recovered_server_restart: ([.[].recovered_server_restart] | add // 0),
  escalated: ([.[].escalated] | add // 0),
  failed_stage_actions: ([.[].failed_stage] | add // 0),
  tasks_with_git_failure_streak: ([.[] | select(.git_failure_streak > 0)] | length),
  reason_vocabulary: ([.[].reasons[]?] | unique)
}'

echo "# fleet-recount label=$LABEL api=$API_BASE project=$PROJECT_ID at $(date -u +%FT%TZ)" >&2
IDS=$(curl -s -m 60 "$API_BASE/tasks?projectId=$PROJECT_ID" | jq -r '.[].id')
echo "tasks: $(echo "$IDS" | wc -l)" >&2
: > "$TASK_DIR/recount-$LABEL.jsonl"
for t in $IDS; do
  curl -s -m 60 "$API_BASE/tasks/$t?projectId=$PROJECT_ID" > "$RAW_DIR/$t.json"
  jq -c "$PER_TASK_JQ" "$RAW_DIR/$t.json" >> "$TASK_DIR/recount-$LABEL.jsonl"
done

echo "## WIDE_NET_ANALYSIS.md §2 table — label=$LABEL, project $PROJECT_ID, $(date -u +%FT%TZ)"
jq -s "$AGG_JQ" "$TASK_DIR/recount-$LABEL.jsonl" | tee "$TASK_DIR/recount-$LABEL-table.json"
echo
echo "## E5 worklist — post-finished interrupts (GUIDE-05 §4 scope), label=$LABEL"
jq -s '[.[] | {task, interrupt_details: [.interrupt_details[] | select(.prev_progress_event != null and (.prev_progress_event | test(": finished$")))]} | select(.interrupt_details | length > 0)]' \
  "$TASK_DIR/recount-$LABEL.jsonl" | tee "$TASK_DIR/recount-$LABEL-e5worklist.json"
