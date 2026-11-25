# per-task.jq — turn one raw GET /tasks/<id> payload into one aggregated row.
# Consumed by bin/fleet-recount.sh. The output shape is pinned by
# bin/tests/run-tests.sh against the recorded before-fixtures — change it
# only together with the tests and the before/after tables.
#
# Defensive notes: every .action access goes through (// "") and runner/reason
# extraction uses match() (which yields no output on no-match) instead of
# capture() (which hard-errors), so one odd history row can never abort the
# whole recount. Timestamp parsing is wrapped in try/catch for the same
# reason: fromdateiso8601 hard-errors on anything outside %Y-%m-%dT%H:%M:%SZ
# (e.g. a +00:00 offset), and that must cost us one delta, not the whole row.
def ts: try (if type == "string" then sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 else null end) catch null;
def runnerOf($action): [$action | match("Runner (?<r>[^ ]+) interrupted execution") | .captures[0].string] | first // "unknown";
def reasonOf($action): if ($action | test("Reason:")) then [$action | match("Reason: (?<x>.*)$") | .captures[0].string] | first else null end;

. as $t |
# history may be missing or not an array on a malformed payload — treat as
# empty rather than aborting the whole recount.
def hist: ($t.history // []) | if type == "array" then . else [] end;
([hist[]? | select((.action // "") | test("interrupted execution"))]) as $ints |
{
  task: $t.id,
  status: $t.status,
  runner_interrupts: ($ints | length),
  with_reason: ([$ints[] | select((.action // "") | test("Reason:"))] | length),
  bare: ([$ints[] | select((.action // "") | test("Reason:") | not)] | length),
  per_runner: ($ints | map(runnerOf(.action)) | group_by(.) | map({runner: .[0], n: length})),
  reasons: ([$ints[] | reasonOf(.action) | select(. != null)] | unique),
  auto_resumed: ([hist[]? | select((.action // "") | test("Auto-resumed after server restart"))] | length),
  server_restart: ([hist[]? | select((.action // "") | test("interrupted by server restart"))] | length),
  recovered_server_restart: ([hist[]? | select((.action // "") | test("Execution recovered after server restart"))] | length),
  escalated: ([hist[]? | select((.action // "") | test("Runner deaths escalated"))] | length),
  failed_stage: ([hist[]? | select((.action // "") | test("Stage failed in|Failed back to stage"))] | length),
  git_failure_streak: (($t.gitFailureStreak // {}).count // 0),
  last_error_git_kind: ((($t.lastError // {}).gitDiagnostics // {}).kind // null),
  interrupt_details: [
    hist | to_entries[] | select((.value.action // "") | test("interrupted execution")) |
    .key as $i | .value |
    (hist[0:$i] | map(select((.action // "") | test(": started$"))) | last) as $s |
    (hist[0:$i] | map(select((.action // "") | test(": (started|prompted|finished)$"))) | last) as $p |
    {
      ts: .timestamp,
      runner: runnerOf(.action),
      reason: reasonOf(.action),
      delta_s_from_started: (if $s and ((.timestamp | ts) != null) and (($s.timestamp | ts) != null) then ((.timestamp | ts) - ($s.timestamp | ts)) else null end),
      prev_progress_event: ($p.action // null)
    }
  ]
}
