#!/usr/bin/env bash
# e5-sweep.sh <local|server2> <taskId-prefix>... — GUIDE-05 §4 E5 forensics
# sweep. READ-ONLY: it never reaps, deletes, restarts, updates, or modifies
# anything on either host (survey q9: observe only). For each kb-<taskId>
# it records, per host:
#   - worktrees under the work root: existence + git log + whether a
#     stage-output commit is present in HEAD history
#   - origin branch refs (refs/remotes/origin/kb/<id>* and kb-<id>*): the
#     durable evidence that survives worktree reaping, with git log
#
# Stage-output detection is scoped to the task's OWN branch: a commit counts
# only if its subject matches ^kb/$PREFIX.*stage output. Merged/mirrored
# history regularly contains OTHER tasks' stage-output commits (observed in
# the 2026-11-23 before-sweep: kb/1cae113f commits inside kb/7f6220c3 refs),
# and an unscoped grep would flip the verdict to a false Cause 2/4.
#   - journal lines for the task id (Runner failed / commit / hook / 413 /
#     502 / fetch failed / interrupt)
# and prints one VERDICT line per task:
#   stage-output commit PRESENT  -> Cause 2/4 territory (GUIDE-05 §4)
#   evidence found, commit ABSENT -> Cause 5 suspect (commit/push loop with no landed output)
#   no worktree and no origin ref -> evidence gap (reaped/branch deleted)
#
# Safety: task-id arguments are validated (hex/dashes only — injection guard,
# see lib.sh) and the remote probe is sent base64-encoded, so no argument can
# break out of the remote shell. The probe itself runs only ls/git
# log/for-each-ref/journalctl — all read-only.
#
# Usage:
#   bin/e5-sweep.sh local   7f6220c3 db49d6c6 ...
#   bin/e5-sweep.sh server2 158394ab ...
# Env overrides (used by the test suite, harmless in prod):
#   E5_WORK_ROOT  E5_UNIT  E5_ORIGIN_REPO  E5_JOURNAL_SINCE
# Exit codes: 0 all probed; 1 usage/setup error; 2 some probes failed (output
# still written — the summary says which).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

# The probe body. Fixed text — the only variables are its five positional
# arguments, all validated or script-controlled before this runs anywhere.
PROBE_SCRIPT='
set -uo pipefail
WORK_ROOT="$1"; UNIT="$2"; ORIGIN_REPO="$3"; PREFIX="$4"; SINCE="$5"
stage_present=0; any_evidence=0

echo "== task kb-$PREFIX"
echo "-- worktrees under $WORK_ROOT:"
found=0
for d in "$WORK_ROOT"/kb-"$PREFIX"*; do
  [ -d "$d" ] || continue
  found=1; any_evidence=1
  echo "   worktree: $d (branch: $(git -C "$d" branch --show-current 2>/dev/null || echo "?"))"
  git -C "$d" log --format="     %h %ci %s" -5 2>&1 | head -6 || true
  # NB: grep WITHOUT -q on purpose — under `set -o pipefail`, `grep -q` exits on
  # the first match, git log gets SIGPIPE (rc 141), and the pipeline reports
  # failure even when a match existed. Plain grep reads all input: rc 0 = match.
  if git -C "$d" log --format=%s -20 2>/dev/null | grep -E "^kb/$PREFIX.*stage output" >/dev/null; then
    stage_present=1
    echo "     stage-output-commit: PRESENT in worktree HEAD history (subject ^kb/$PREFIX.*stage output)"
  else
    echo "     stage-output-commit: absent in worktree HEAD history"
  fi
  for ref in $(git -C "$d" for-each-ref --format="%(refname)" "refs/remotes/origin/kb/$PREFIX"* "refs/remotes/origin/kb-$PREFIX"* 2>/dev/null); do
    echo "   origin ref: $ref"
    git -C "$d" log --format="     %h %ci %s" -5 "$ref" 2>&1 | head -6 || true
    if git -C "$d" log --format=%s -20 "$ref" 2>/dev/null | grep -E "^kb/$PREFIX.*stage output" >/dev/null; then
      stage_present=1
      echo "     stage-output-commit: PRESENT on $ref (subject ^kb/$PREFIX.*stage output)"
    else
      echo "     stage-output-commit: absent on $ref"
    fi
  done
done
[ "$found" = 1 ] || echo "   (no worktree on this host)"

echo "-- origin branch refs in $ORIGIN_REPO (durable, survives worktree reaping):"
if git -C "$ORIGIN_REPO" rev-parse --git-dir >/dev/null 2>&1; then
  refs=$(git -C "$ORIGIN_REPO" for-each-ref --format="%(refname)" "refs/remotes/origin/kb/$PREFIX"* "refs/remotes/origin/kb-$PREFIX"* "refs/heads/kb/$PREFIX"* "refs/heads/kb-$PREFIX"* 2>/dev/null || true)
  if [ -n "$refs" ]; then
    any_evidence=1
    while IFS= read -r ref; do
      echo "   $ref"
      git -C "$ORIGIN_REPO" log --format="     %h %ci %s" -8 "$ref" 2>&1 | head -9 || true
      if git -C "$ORIGIN_REPO" log --format=%s -20 "$ref" 2>/dev/null | grep -E "^kb/$PREFIX.*stage output" >/dev/null; then
        stage_present=1
        echo "     stage-output-commit: PRESENT on $ref (subject ^kb/$PREFIX.*stage output)"
      else
        echo "     stage-output-commit: absent on $ref"
      fi
    done <<EOF
$refs
EOF
  else
    echo "   (no origin branch kb/$PREFIX* or kb-$PREFIX*)"
  fi
else
  echo "   (origin repo $ORIGIN_REPO not available on this host — evidence gap note)"
fi

echo "-- journal ($UNIT, since $SINCE) lines matching $PREFIX:"
if command -v journalctl >/dev/null 2>&1; then
  journalctl --user -u "$UNIT" --since "$SINCE" --no-pager 2>/dev/null \
    | grep -i -- "$PREFIX" | grep -iE "Runner failed|commit|hook|413|502|fetch failed|interrupt" | tail -15 | sed "s/^/   /" \
    || echo "   (no matching journal lines)"
else
  echo "   (journalctl not available on this host)"
fi

if [ "$stage_present" = 1 ]; then
  echo "VERDICT kb-$PREFIX: stage-output commit PRESENT -> Cause 2/4 territory (GUIDE-05 §4)"
elif [ "$any_evidence" = 1 ]; then
  echo "VERDICT kb-$PREFIX: evidence found but no stage-output commit -> Cause 5 suspect (commit/push loop, no landed output)"
else
  echo "VERDICT kb-$PREFIX: no worktree and no origin branch -> evidence gap (worktree reaped and branch deleted)"
fi
echo
'

# run_probe <host> <work_root> <unit> <origin_repo> <prefix> <since>
# Local: pipe the probe into bash directly. server2: base64-encode the probe
# and decode it on the remote side, so argument quoting can never inject.
run_probe() {
  local host="$1"; shift
  local args; args="$(printf '%q ' "$@")"
  if [ "$host" = "server2" ]; then
    local b64
    b64="$(printf '%s' "$PROBE_SCRIPT" | base64 -w0)"
    "$SCRIPT_DIR/server2-ssh.sh" "echo $b64 | base64 -d | bash -s -- $args"
  else
    printf '%s' "$PROBE_SCRIPT" | bash -s -- "$@"
  fi
}

main() {
  require_commands bash base64 date
  local host="${1:-}"
  [ -n "$host" ] || die "usage: e5-sweep.sh <local|server2> <taskId-prefix>..."
  [ "$host" = "local" ] || [ "$host" = "server2" ] || die "host must be 'local' or 'server2', got '$host'"
  shift
  [ $# -ge 1 ] || die "usage: e5-sweep.sh <local|server2> <taskId-prefix>... (at least one task id)"
  validate_task_prefix "$@"

  local task_dir repo_root work_root unit origin_repo since
  task_dir="$(cd "$SCRIPT_DIR/.." && pwd)"
  repo_root="$(git -C "$task_dir" rev-parse --show-toplevel)"
  since="${E5_JOURNAL_SINCE:-2026-11-19}"
  if [ "$host" = "server2" ]; then
    work_root="${E5_WORK_ROOT:-/home/server2/.kainbain/runner-work}"
    unit="${E5_UNIT:-kainbain-runner-server2-alpha}"
    origin_repo="${E5_ORIGIN_REPO:-/home/server2/.kainbain/runner-work/mirrors/Kainbain}"
    require_commands git
  else
    work_root="${E5_WORK_ROOT:-$HOME/.kainbain/runner-work}"
    unit="${E5_UNIT:-kainbain-runner-local-alpha}"
    origin_repo="${E5_ORIGIN_REPO:-$repo_root}"
    require_commands git
  fi

  echo "## E5 sweep host=$host work_root=$work_root unit=$unit origin_repo=$origin_repo since=$since at $(date -u +%FT%TZ)"
  local failed=0 t
  for t in "$@"; do
    if ! run_probe "$host" "$work_root" "$unit" "$origin_repo" "$t" "$since"; then
      failed=$((failed + 1))
      log "WARN: probe for kb-$t on $host failed — recorded, continuing with the next task"
      echo "VERDICT kb-$t: PROBE FAILED on $host (see stderr) — treat as evidence gap"
      echo
    fi
  done
  echo "## E5 sweep done: $# task(s), $failed probe failure(s) at $(date -u +%FT%TZ)"
  if [ "$failed" -gt 0 ]; then
    log "exiting 2: $failed probe(s) failed"
    exit 2
  fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
