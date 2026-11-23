#!/usr/bin/env bash
# e5-sweep.sh <host> <taskId-prefix>... — GUIDE-05 §4 E5 forensics sweep, read-only.
#
# host = local  → local-alpha host (this machine, 192.168.1.206, work root
#                  ~/.kainbain/runner-work, unit kainbain-runner-local-alpha)
# host = server2 → server2-alpha host (192.168.1.172 via bin/server2-ssh.sh,
#                  work root /home/server2/.kainbain/runner-work,
#                  unit kainbain-runner-server2-alpha)
#
# For each kb-<taskId>* worktree: git log -3 (stage-output-commit presence:
# present → Cause 2/4 territory, absent → Cause 5 suspect), plus a journal grep
# for the task id (Runner failed: line, Backend 413, 502/fetch failed, hook lines).
# NEVER reaps, deletes, or modifies anything — observation only (q9).
set -euo pipefail
TASK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${1:?usage: e5-sweep.sh <local|server2> <taskId-prefix>...}"; shift

run() { # run <cmd...> — dispatch to the selected host
  if [ "$HOST" = "server2" ]; then
    "$TASK_DIR/bin/server2-ssh.sh" "$*"
  else
    bash -c "$*"
  fi
}

if [ "$HOST" = "server2" ]; then
  WORK_ROOT="/home/server2/.kainbain/runner-work"
  UNIT="kainbain-runner-server2-alpha"
else
  WORK_ROOT="$HOME/.kainbain/runner-work"
  UNIT="kainbain-runner-local-alpha"
fi

echo "## E5 sweep host=$HOST work_root=$WORK_ROOT unit=$UNIT at $(date -u +%FT%TZ)"
for t in "$@"; do
  echo "== task kb-$t"
  run "ls -d $WORK_ROOT/kb-$t* 2>/dev/null || echo '(no worktree on $HOST)'"
  run "for d in $WORK_ROOT/kb-$t*; do [ -d \"\$d\" ] || continue; echo \"-- \$d\"; git -C \"\$d\" log --oneline -5 2>&1; git -C \"\$d\" branch -a 2>&1 | head -5; done"
  echo "-- journal grep ($UNIT, task id $t, since 2026-11-19)"
  run "journalctl --user -u $UNIT --since '2026-11-19' --no-pager 2>/dev/null | grep -i '$t' | grep -iE 'Runner failed|commit|hook|413|502|fetch failed|interrupt' | tail -15 || echo '(no journal lines)'"
  echo
done
