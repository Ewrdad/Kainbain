# aggregate.jq — WIDE_NET_ANALYSIS.md §2 table over an array of per-task rows
# (input: `jq -s` over recount-<label>.jsonl). Pinned by bin/tests/run-tests.sh
# against recount-before-table.json.
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
  median_delta_s: ([.[].interrupt_details[]? | select(.delta_s_from_started != null) | .delta_s_from_started] | sort as $d | (if ($d | length) > 0 then $d[($d | length) / 2] else null end)),
  auto_resumed: ([.[].auto_resumed] | add // 0),
  server_restart: ([.[].server_restart] | add // 0),
  recovered_server_restart: ([.[].recovered_server_restart] | add // 0),
  escalated: ([.[].escalated] | add // 0),
  failed_stage_actions: ([.[].failed_stage] | add // 0),
  tasks_with_git_failure_streak: ([.[] | select(.git_failure_streak > 0)] | length),
  reason_vocabulary: ([.[].reasons[]?] | unique)
}
