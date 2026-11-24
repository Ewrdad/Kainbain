#!/usr/bin/env bash
# fleet-recount.sh <label> [task-dir] — GUIDE-07 §5 fleet recount +
# WIDE_NET_ANALYSIS.md §2 table, over one project, read-only against the
# backend API (approved: this task's SURVEY.md q2). Scope is pinned to project
# 0fd41821-... so results compare directly with the 2026-11-21 baseline.
#
# Outputs (under task-dir, default: current directory):
#   raw/<label>/<taskId>.json        raw GET /tasks/<id> payloads (evidence)
#   recount-<label>.jsonl            one aggregated row per task  (jq/per-task.jq)
#   recount-<label>-table.json       WIDE_NET §2 aggregate         (jq/aggregate.jq)
#   recount-<label>-e5worklist.json  post-finished interrupts      (jq/e5-worklist.jq, GUIDE-05 §4 scope)
#   recount-<label>-errors.jsonl     tasks that failed to fetch/parse (always created; empty when nothing failed)
#   recount-<label>-meta.json        run metadata (api, project, window, counts)
#   stdout                           the §2 table + E5 worklist, for the run log
#
# Crash safety: per-task rows accumulate in temp staging files and are moved
# into place only after the fetch loop finishes, so killing the script
# mid-run can never leave a truncated recount-<label>.jsonl beside a
# meta/table from an older run of the same label.
#
# Failure behaviour (deliberate, so a partial run is loud, never silent):
#   - the task list itself unreachable/invalid/empty -> exit 1, no outputs written
#   - one task fails to download or parse -> recorded in -errors.jsonl, the
#     loop continues, the table is still written, and the script exits 2 at
#     the end so the gap cannot be missed
#   - API base / project overridable via KAINBAIN_API_BASE / KAINBAIN_PROJECT_ID
#     (the test suite drives this script against a local mock API)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

main() {
  require_commands curl jq date mktemp
  local label="${1:-}"
  [ -n "$label" ] || die "usage: fleet-recount.sh <before|after|...> [task-dir]"
  [ $# -le 2 ] || die "usage: fleet-recount.sh <before|after|...> [task-dir] — unexpected extra argument '$3'"
  validate_label "$label"
  local task_dir="${2:-$(pwd)}"
  local api_base="${KAINBAIN_API_BASE:-http://192.168.1.206:3100}"
  local project_id="${KAINBAIN_PROJECT_ID:-0fd41821-d8a5-4e49-bc2e-28ce8c739a0a}"
  local raw_dir="$task_dir/raw/$label"
  mkdir -p "$raw_dir"
  local started; started="$(date -u +%FT%TZ)"
  log "fleet-recount label=$label api=$api_base project=$project_id task_dir=$task_dir started=$started"

  # 1. task list — must be a non-empty array of well-formed ids, otherwise the
  #    API is down, the project id is wrong, or we got an error page.
  local list_tmp; list_tmp="$(mktemp)"
  if ! api_get_json "$api_base/tasks?projectId=$project_id" "$list_tmp.list"; then
    rm -f "$list_tmp" "$list_tmp.list"
    die "cannot list tasks at $api_base/tasks?projectId=$project_id — API down or wrong project; nothing written"
  fi
  local ids; ids="$(jq -r 'if type == "array" then (.[].id // empty) else empty end' "$list_tmp.list")"
  rm -f "$list_tmp" "$list_tmp.list"
  local n; n="$(printf '%s\n' "$ids" | grep -c . || true)"
  [ "$n" -gt 0 ] || die "GET /tasks returned zero tasks for project $project_id — refusing to write an empty baseline"
  if printf '%s\n' "$ids" | grep -qvE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
    die "task list contains a malformed id — refusing to continue (got: $(printf '%s\n' "$ids" | grep -vE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' | head -3 | tr '\n' ' '))"
  fi
  log "task list ok: $n tasks"

  # 2. per-task fetch + aggregate row. One bad task never aborts the loop.
  # Rows accumulate in staging files first (see header: crash safety).
  local jsonl="$task_dir/recount-$label.jsonl" errors="$task_dir/recount-$label-errors.jsonl"
  local table="$task_dir/recount-$label-table.json" worklist="$task_dir/recount-$label-e5worklist.json"
  local jsonl_stage errors_stage row_tmp
  jsonl_stage="$(mktemp)"; errors_stage="$(mktemp)"; row_tmp="$(mktemp)"
  : > "$jsonl_stage"
  : > "$errors_stage"
  local ok=0 failed=0 t raw
  # ids are validated UUIDs above, so unquoted splitting here is safe.
  # shellcheck disable=SC2086
  for t in $ids; do
    raw="$raw_dir/$t.json"
    if api_get_json "$api_base/tasks/$t?projectId=$project_id" "$raw" \
       && jq -e 'type == "object" and ((.history // []) | type == "array")' "$raw" >/dev/null 2>&1 \
       && jq -c -f "$SCRIPT_DIR/jq/per-task.jq" "$raw" > "$row_tmp" 2>/dev/null; then
      cat "$row_tmp" >> "$jsonl_stage"
      ok=$((ok + 1))
    else
      failed=$((failed + 1))
      rm -f "$raw"
      printf '{"task":"%s","error":"fetch or parse failed"}\n' "$t" >> "$errors_stage"
      log "WARN: task $t failed to fetch/parse — recorded in recount-$label-errors.jsonl, continuing"
    fi
  done
  rm -f "$row_tmp"
  write_atomic "$jsonl" "$jsonl_stage" || die "cannot publish $jsonl — previous file (if any) left untouched"
  write_atomic "$errors" "$errors_stage" || die "cannot publish $errors — $jsonl was published, rerun to regenerate"
  rm -f "$jsonl_stage" "$errors_stage"
  log "fetched $ok tasks, $failed failed"

  # 3. aggregates (atomic writes), printed to stdout for the run log too.
  jq -s -f "$SCRIPT_DIR/jq/aggregate.jq" "$jsonl" > "$table.tmp.$$" && mv "$table.tmp.$$" "$table"
  jq -s -f "$SCRIPT_DIR/jq/e5-worklist.jq" "$jsonl" > "$worklist.tmp.$$" && mv "$worklist.tmp.$$" "$worklist"
  jq -n --arg label "$label" --arg api "$api_base" --arg project "$project_id" \
      --arg started "$started" --arg finished "$(date -u +%FT%TZ)" \
      --argjson ok "$ok" --argjson failed "$failed" \
      '{label: $label, api: $api, project: $project, startedAt: $started, finishedAt: $finished, tasksFetched: $ok, tasksFailed: $failed}' \
    > "$task_dir/recount-$label-meta.json"

  echo "## WIDE_NET_ANALYSIS.md §2 table — label=$label, project $project_id, $(date -u +%FT%TZ)"
  jq . "$table"
  echo
  echo "## E5 worklist — post-finished interrupts (GUIDE-05 §4 scope), label=$label"
  jq . "$worklist"
  echo
  if [ "$failed" -gt 0 ]; then
    echo "## ERRORS — $failed task(s) failed, see recount-$label-errors.jsonl" >&2
    cat "$errors" >&2
    log "exiting 2: $failed of $n tasks failed"
    exit 2
  fi
  log "done: label=$label ok=$ok failed=$failed"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
