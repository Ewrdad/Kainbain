# e5-worklist.jq — GUIDE-05 §4 scope: tasks with at least one post-`finished`
# interrupt (input: `jq -s` over recount-<label>.jsonl). Each entry keeps only
# the post-finished interrupt details.
[.[] | {
  task,
  interrupt_details: [.interrupt_details[] | select(.prev_progress_event != null and (.prev_progress_event | test(": finished$")))]
} | select(.interrupt_details | length > 0)]
