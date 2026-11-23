#!/usr/bin/env bash
# run-tests.sh — offline test suite for the S5 ops scripts in bin/.
#
# Nothing here touches prod: the suite uses the recorded evidence fixtures
# (raw/before/*.json, runners-before/*.json), synthetic fixtures it builds
# itself, and a local mock API (bin/tests/mock-api.py) on 127.0.0.1.
#
# What is pinned:
#   - jq/per-task.jq + jq/aggregate.jq over all raw/before fixtures must
#     reproduce recount-before-table.json exactly (regression guard for the
#     before/after comparison)
#   - edge cases: reasoned interrupts, gitFailureStreak/lastError.gitDiagnostics,
#     post-finished interrupts, missing history, non-object payloads
#   - jq/runner-verdict.jq convergence rules + the git ancestry check
#   - the E5 probe classification (present / absent / evidence-gap / probe-failed),
#     incl. the cross-task false-positive pin: a stage-output commit from ANOTHER
#     task's branch in merged history must NOT count (grep is scoped to
#     ^kb/$PREFIX.*stage output)
#   - fleet-recount.sh end-to-end against the mock API: success, partial
#     failure (exit 2, errors file, table still written), empty list (exit 1)
#   - runners-snapshot.sh end-to-end against the mock API, incl.
#     --require-converged exit 3
#   - lib.sh api_get_json failure modes (HTTP 500, invalid JSON, connection
#     refused) and the e5-sweep task-id injection guard
#
# Run: bin/tests/run-tests.sh   (exit 0 = all pass)
set -euo pipefail
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$(cd "$TESTS_DIR/.." && pwd)"
TASK_DIR="$(cd "$BIN_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$TASK_DIR" rev-parse --show-toplevel)"
FIXTURE_RAW="$TASK_DIR/raw/before"
FIXTURE_RUNNERS="$(ls "$TASK_DIR"/runners-before/runners-*.json | head -1)"
FIXTURE_DEPLOY="$(ls "$TASK_DIR"/runners-before/deploy-status-*.json | head -1)"
FIX_COMMIT="046a63917d52181d00efbd4a6624bd1c53131fa4"

pass=0 fail=0
ok()  { pass=$((pass + 1)); echo "PASS: $1"; }
bad() { fail=$((fail + 1)); echo "FAIL: $1"; }
# check_eq <name> <expected> <actual>
check_eq() {
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 — expected [$2], got [$3]"; fi
}
# check_file_eq <name> <fileA> <fileB> — compares after canonical jq -S (JSON) or plain diff
check_json_eq() {
  if diff -q <(jq -S . "$2") <(jq -S . "$3") >/dev/null 2>&1; then ok "$1"; else bad "$1 — $2 != $3"; diff <(jq -S . "$2") <(jq -S . "$3") | head -10 || true; fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# shellcheck source=../lib.sh
source "$BIN_DIR/lib.sh"

echo "== T1: per-task.jq + aggregate.jq over recorded before-fixtures reproduce the pinned table"
: > "$WORK/rows.jsonl"
for f in "$FIXTURE_RAW"/*.json; do
  jq -c -f "$BIN_DIR/jq/per-task.jq" "$f" >> "$WORK/rows.jsonl"
done
check_eq "T1 row count" "$(ls "$FIXTURE_RAW"/*.json | wc -l)" "$(wc -l < "$WORK/rows.jsonl" | tr -d ' ')"
jq -s -f "$BIN_DIR/jq/aggregate.jq" "$WORK/rows.jsonl" > "$WORK/table.json"
check_json_eq "T1 aggregate == recount-before-table.json" "$WORK/table.json" "$TASK_DIR/recount-before-table.json"

echo "== T2: per-task.jq edge cases (synthetic payloads)"
mkdir -p "$WORK/fix"
jq -n '{
  id: "aaaaaaaa-1111-2222-3333-444444444444", status: "in_stage",
  gitFailureStreak: {count: 2}, lastError: {gitDiagnostics: {kind: "hook_rejected"}},
  history: [
    {timestamp: "2026-11-22T10:00:00Z", action: "Runner local-alpha stage 1: started"},
    {timestamp: "2026-11-22T10:00:04.500Z", action: "Runner local-alpha interrupted execution e1 — lease dropped, re-queues as interrupted. Reason: Runner workdir unavailable: cap reached"},
    {timestamp: "2026-11-22T10:05:00Z", action: "Runner local-alpha stage 1: finished"},
    {timestamp: "2026-11-22T10:06:30Z", action: "Runner server2-alpha interrupted execution e2 — lease dropped, re-queues as interrupted."},
    {timestamp: "2026-11-22T10:07:00Z", action: "Runner deaths escalated to runner-death-loop"},
    {timestamp: "2026-11-22T10:07:01Z", action: "Auto-resumed after server restart"},
    {timestamp: "2026-11-22T10:07:02Z", action: "Stage failed in stage 1"}
  ]
}' > "$WORK/fix/edge1.json"
jq -n '{id: "bbbbbbbb-1111-2222-3333-444444444444", status: "done"}' > "$WORK/fix/edge2-nohistory.json"
jq -c -f "$BIN_DIR/jq/per-task.jq" "$WORK/fix/edge1.json" > "$WORK/edge1.row"
check_eq "T2 reasoned interrupt counted" "1" "$(jq -r '.with_reason' "$WORK/edge1.row")"
check_eq "T2 bare interrupt counted" "1" "$(jq -r '.bare' "$WORK/edge1.row")"
check_eq "T2 reason text" "Runner workdir unavailable: cap reached" "$(jq -r '.reasons[0]' "$WORK/edge1.row")"
check_eq "T2 git_failure_streak" "2" "$(jq -r '.git_failure_streak' "$WORK/edge1.row")"
check_eq "T2 last_error_git_kind" "hook_rejected" "$(jq -r '.last_error_git_kind' "$WORK/edge1.row")"
check_eq "T2 escalated" "1" "$(jq -r '.escalated' "$WORK/edge1.row")"
check_eq "T2 auto_resumed" "1" "$(jq -r '.auto_resumed' "$WORK/edge1.row")"
check_eq "T2 post-finished interrupt detail present" "1" "$(jq -r '[.interrupt_details[] | select(.prev_progress_event | test(": finished$"))] | length' "$WORK/edge1.row")"
# deltas are whole seconds: fromdateiso8601 truncates the fractional part
check_eq "T2 fractional-second delta computed (whole seconds)" "4" "$(jq -r '[.interrupt_details[] | select(.runner == "local-alpha")] | .[0].delta_s_from_started' "$WORK/edge1.row")"
check_eq "T2 no-fraction timestamp delta (10:06:30 - 10:00:00)" "390" "$(jq -r '[.interrupt_details[] | select(.runner == "server2-alpha")] | .[0].delta_s_from_started' "$WORK/edge1.row")"
jq -c -f "$BIN_DIR/jq/per-task.jq" "$WORK/fix/edge2-nohistory.json" > "$WORK/edge2.row"
check_eq "T2 missing history does not crash" "0" "$(jq -r '.runner_interrupts' "$WORK/edge2.row")"
if echo '"just a string"' | jq -c -f "$BIN_DIR/jq/per-task.jq" >/dev/null 2>&1; then
  bad "T2 non-object payload should fail loudly"
else
  ok "T2 non-object payload fails loudly (non-zero), not silently"
fi

echo "== T3: aggregate.jq arithmetic on hand-built rows"
cat > "$WORK/agg-rows.jsonl" <<'EOF'
{"task":"t1","runner_interrupts":2,"with_reason":1,"bare":1,"per_runner":[{"runner":"local-alpha","n":2}],"interrupt_details":[{"delta_s_from_started":3,"prev_progress_event":"x: finished"},{"delta_s_from_started":200,"prev_progress_event":"y: started"}],"auto_resumed":1,"server_restart":0,"recovered_server_restart":0,"escalated":1,"failed_stage":0,"git_failure_streak":0,"reasons":["r1"],"last_error_git_kind":null}
{"task":"t2","runner_interrupts":1,"with_reason":0,"bare":1,"per_runner":[{"runner":"server2-alpha","n":1}],"interrupt_details":[{"delta_s_from_started":10,"prev_progress_event":"z: finished"}],"auto_resumed":0,"server_restart":0,"recovered_server_restart":0,"escalated":0,"failed_stage":2,"git_failure_streak":3,"reasons":[],"last_error_git_kind":"push_rejected"}
EOF
jq -s -f "$BIN_DIR/jq/aggregate.jq" "$WORK/agg-rows.jsonl" > "$WORK/agg.json"
check_eq "T3 totals" "3" "$(jq -r '.runner_interrupts' "$WORK/agg.json")"
check_eq "T3 bare" "2" "$(jq -r '.bare' "$WORK/agg.json")"
check_eq "T3 le15s" "2" "$(jq -r '.le15s_after_started' "$WORK/agg.json")"
check_eq "T3 ge120s" "1" "$(jq -r '.ge120s_after_started' "$WORK/agg.json")"
check_eq "T3 post_finished" "2" "$(jq -r '.post_finished_interrupts' "$WORK/agg.json")"
check_eq "T3 git streak tasks" "1" "$(jq -r '.tasks_with_git_failure_streak' "$WORK/agg.json")"
check_eq "T3 per_runner merge" "local-alpha:2,server2-alpha:1" "$(jq -r '.per_runner | map("\(.runner):\(.n)") | join(",")' "$WORK/agg.json")"

echo "== T4: e5-worklist.jq scope"
jq -s -f "$BIN_DIR/jq/e5-worklist.jq" "$WORK/agg-rows.jsonl" > "$WORK/e5.json"
check_eq "T4 both tasks in worklist" "2" "$(jq -r 'length' "$WORK/e5.json")"
check_eq "T4 only post-finished details kept" "1" "$(jq -r '.[0].interrupt_details | length' "$WORK/e5.json")"

echo "== T5: runners-tsv.jq over the recorded runners fixture"
jq -r -f "$BIN_DIR/jq/runners-tsv.jq" "$FIXTURE_RUNNERS" > "$WORK/runners.tsv"
check_eq "T5 header + one line per runner" "10" "$(wc -l < "$WORK/runners.tsv" | tr -d ' ')"
check_eq "T5 header first column" "runnerId" "$(head -1 "$WORK/runners.tsv" | cut -f1)"
check_eq "T5 local-alpha version column" "0.1.0" "$(awk -F'\t' '$1=="local-alpha"{print $3}' "$WORK/runners.tsv")"
check_eq "T5 local-alpha build sha column" "fbcf8442ee031e2edbc9f0b30195afa410296cf3" "$(awk -F'\t' '$1=="local-alpha"{print $4}' "$WORK/runners.tsv")"

echo "== T6: convergence verdict (jq rule + git ancestry check)"
# shellcheck source=../runners-snapshot.sh
source "$BIN_DIR/runners-snapshot.sh"
check_eq "T6 HEAD build contains fix -> true" "true" "$(fix_in_build "$(git -C "$REPO_ROOT" rev-parse HEAD)" "$REPO_ROOT" "$FIX_COMMIT")"
check_eq "T6 runner-v0.2.0 tag build lacks fix -> false" "false" "$(fix_in_build "$(git -C "$REPO_ROOT" rev-parse runner-v0.2.0^{commit})" "$REPO_ROOT" "$FIX_COMMIT")"
check_eq "T6 unknown sha -> null" "null" "$(fix_in_build "0000000000000000000000000000000000000000" "$REPO_ROOT" "$FIX_COMMIT")"
check_eq "T6 empty sha -> null" "null" "$(fix_in_build "" "$REPO_ROOT" "$FIX_COMMIT")"
# NOTE: exactly three closing braces after `end)` — versions, facts, outer object.
mk_runner() { jq -n --arg id "$1" --arg v "$2" --arg sha "$3" '{runnerId: $id, status: "active", runnerVersion: $v, recommendedVersion: "0.1.0", updateAvailable: false, facts: {versions: {runner: $v, build: (if $sha == "" then null else {sha: $sha} end)}}}'; }
head_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
tag_sha="$(git -C "$REPO_ROOT" rev-parse 'runner-v0.2.0^{commit}')"
check_eq "T6 verdict: 0.2.0 build WITH fix converges" "true" "$(jq -n -f "$BIN_DIR/jq/runner-verdict.jq" --argjson runner "$(mk_runner local-alpha 0.2.0 "$head_sha")" --argjson fixInBuild true | jq -r .converged)"
check_eq "T6 verdict: 0.2.0 build WITHOUT fix does not converge" "false" "$(jq -n -f "$BIN_DIR/jq/runner-verdict.jq" --argjson runner "$(mk_runner local-alpha 0.2.0 "$tag_sha")" --argjson fixInBuild false | jq -r .converged)"
check_eq "T6 verdict: 0.1.0 never converges" "false" "$(jq -n -f "$BIN_DIR/jq/runner-verdict.jq" --argjson runner "$(mk_runner local-alpha 0.1.0 "$head_sha")" --argjson fixInBuild true | jq -r .converged)"
check_eq "T6 verdict: no build sha -> not converged, reason says cannot verify" "cannot verify" "$(jq -n -f "$BIN_DIR/jq/runner-verdict.jq" --argjson runner "$(mk_runner local-alpha 0.2.0 '')" --argjson fixInBuild null | jq -r '.reasons[0] | if test("cannot verify") then "cannot verify" else . end')"
check_eq "T6 verdict_for missing runner" "false" "$(verdict_for "$FIXTURE_RUNNERS" no-such-runner "$REPO_ROOT" "$FIX_COMMIT" | jq -r .converged)"

echo "== T7: E5 probe classification on a synthetic work root + origin repo"
# shellcheck source=../e5-sweep.sh
source "$BIN_DIR/e5-sweep.sh"
E5W="$WORK/e5"; mkdir -p "$E5W/wr" "$E5W/origin"
git init -q "$E5W/wr/kb-aaaaaaaa-1111-2222-3333-444444444444"
# filler commits first, stage-output commit LAST => it is the newest commit and
# appears FIRST in `git log` output. With `grep -q` + pipefail the early exit
# would SIGPIPE git and flip a true PRESENT to absent (real bug found on the
# 2026-11-23 before-sweep) — this fixture pins the fix.
for i in 1 2 3 4 5 6 7 8; do
  git -C "$E5W/wr/kb-aaaaaaaa-1111-2222-3333-444444444444" -c user.email=t@t -c user.name=t commit -q --allow-empty -m "docs: filler $i"
done
git -C "$E5W/wr/kb-aaaaaaaa-1111-2222-3333-444444444444" -c user.email=t@t -c user.name=t commit -q --allow-empty -m "kb/aaaaaaaa-1111-2222-3333-444444444444 stage-1: Runner local-alpha stage output"
git init -q "$E5W/wr/kb-bbbbbbbb-1111-2222-3333-444444444444"
git -C "$E5W/wr/kb-bbbbbbbb-1111-2222-3333-444444444444" -c user.email=t@t -c user.name=t commit -q --allow-empty -m "docs: something else"
# cross-task trap: kb-dddddddd's history contains ANOTHER task's stage-output
# commit (merged/mirrored history) — must NOT count as PRESENT for dddddddd
git init -q "$E5W/wr/kb-dddddddd-1111-2222-3333-444444444444"
git -C "$E5W/wr/kb-dddddddd-1111-2222-3333-444444444444" -c user.email=t@t -c user.name=t commit -q --allow-empty -m "kb/aaaaaaaa-1111-2222-3333-444444444444 stage-9: Runner local-alpha stage output"
git init -q --bare "$E5W/origin/kb-repo.git"
git -C "$E5W/wr/kb-aaaaaaaa-1111-2222-3333-444444444444" branch -M "kb/aaaaaaaa-1111-2222-3333-444444444444"
git -C "$E5W/wr/kb-aaaaaaaa-1111-2222-3333-444444444444" remote add origin "$E5W/origin/kb-repo.git"
git -C "$E5W/wr/kb-aaaaaaaa-1111-2222-3333-444444444444" push -q origin "kb/aaaaaaaa-1111-2222-3333-444444444444"
git -C "$E5W/wr/kb-aaaaaaaa-1111-2222-3333-444444444444" fetch -q origin 2>/dev/null || true
run_probe local "$E5W/wr" "test-unit" "$E5W/origin/kb-repo.git" aaaaaaaa 2026-11-19 > "$WORK/e5-aaa.txt" 2>&1 || true
run_probe local "$E5W/wr" "test-unit" "$E5W/origin/kb-repo.git" bbbbbbbb 2026-11-19 > "$WORK/e5-bbb.txt" 2>&1 || true
run_probe local "$E5W/wr" "test-unit" "$E5W/origin/kb-repo.git" cccccccc 2026-11-19 > "$WORK/e5-ccc.txt" 2>&1 || true
run_probe local "$E5W/wr" "test-unit" "$E5W/origin/kb-repo.git" dddddddd 2026-11-19 > "$WORK/e5-ddd.txt" 2>&1 || true
if grep -q "VERDICT kb-aaaaaaaa: stage-output commit PRESENT -> Cause 2/4 territory" "$WORK/e5-aaa.txt"; then ok "T7 present -> Cause 2/4"; else bad "T7 present verdict — got: $(grep VERDICT "$WORK/e5-aaa.txt")"; fi
if grep -q "VERDICT kb-bbbbbbbb: evidence found but no stage-output commit -> Cause 5 suspect" "$WORK/e5-bbb.txt"; then ok "T7 absent -> Cause 5 suspect"; else bad "T7 absent verdict — got: $(grep VERDICT "$WORK/e5-bbb.txt")"; fi
if grep -q "VERDICT kb-cccccccc: no worktree and no origin branch -> evidence gap" "$WORK/e5-ccc.txt"; then ok "T7 no evidence -> gap"; else bad "T7 gap verdict — got: $(grep VERDICT "$WORK/e5-ccc.txt")"; fi
if grep -q "stage-output-commit: PRESENT on refs/remotes/origin/kb/aaaaaaaa" "$WORK/e5-aaa.txt"; then ok "T7 origin ref evidence used"; else bad "T7 origin ref evidence missing"; fi
if grep -q "VERDICT kb-dddddddd: evidence found but no stage-output commit -> Cause 5 suspect" "$WORK/e5-ddd.txt" \
   && ! grep -q "stage-output-commit: PRESENT" "$WORK/e5-ddd.txt"; then
  ok "T7 cross-task stage-output commit NOT counted (scoped to ^kb/\$PREFIX)"
else
  bad "T7 cross-task false-positive — got: $(grep -E 'VERDICT|PRESENT' "$WORK/e5-ddd.txt")"
fi

echo "== T8: e5-sweep.sh argument validation (injection guard)"
if "$BIN_DIR/e5-sweep.sh" local 'bad;id' >/dev/null 2>"$WORK/inj.txt"; then
  bad "T8 injection attempt should be rejected"
else
  if grep -q "bad task id prefix" "$WORK/inj.txt"; then ok "T8 injection attempt rejected with clear message"; else bad "T8 rejection message unclear: $(cat "$WORK/inj.txt")"; fi
fi
if "$BIN_DIR/e5-sweep.sh" bogushost 7f6220c3 >/dev/null 2>"$WORK/host.txt"; then
  bad "T8 bad host should be rejected"
else
  grep -q "host must be" "$WORK/host.txt" && ok "T8 bad host rejected" || bad "T8 bad host message unclear"
fi

echo "== T9: lib.sh api_get_json failure modes (against mock API / dead port)"
start_mock() { # <name> [extra env via environment] -> sets MOCK_PORT
  local port_file="$WORK/$1.port"
  MOCK_PORT_FILE="$port_file" python3 "$TESTS_DIR/mock-api.py" \
    --tasks-dir "$FIXTURE_RAW" --runners-file "$FIXTURE_RUNNERS" --deploy-file "$FIXTURE_DEPLOY" \
    --port 0 --port-file "$port_file" &
  local pid=$!
  for _ in $(seq 1 50); do [ -s "$port_file" ] && break; sleep 0.1; done
  MOCK_PORT="$(cat "$port_file")"
  MOCK_PIDS+=("$pid")
}
MOCK_PIDS=()
start_mock ok
if api_get_json "http://127.0.0.1:$MOCK_PORT/tasks?projectId=x" "$WORK/api-ok.json" 2>"$WORK/api-ok.err"; then ok "T9 api_get_json 200 JSON ok"; else bad "T9 api_get_json 200 failed: $(cat "$WORK/api-ok.err")"; fi
if api_get_json "http://127.0.0.1:$MOCK_PORT/tasks/does-not-exist?projectId=x" "$WORK/api-404.json" 2>/dev/null; then bad "T9 HTTP 404 should fail"; else ok "T9 HTTP 404 fails (curl -f), nothing stored"; fi
[ -e "$WORK/api-404.json" ] && bad "T9 404 body was stored" || ok "T9 no file left behind on failure"
if api_get_json "http://127.0.0.1:1/tasks" "$WORK/api-dead.json" 2>"$WORK/api-dead.err"; then bad "T9 dead port should fail"; else grep -q "ERROR: GET" "$WORK/api-dead.err" && ok "T9 dead port fails with clear message" || bad "T9 dead port message unclear"; fi
# NOTE: mock-driving vars are plain exported shell assignments, NOT `VAR=x
# start_mock` prefix assignments — under bash 5.3 + set -u a prefix assignment
# on a function call does not leave the variable bound for later lines.
MOCK_BADJSON_ID="$(ls "$FIXTURE_RAW" | head -1 | sed 's/.json//')"
export MOCK_BADJSON_ID
start_mock badjson
if api_get_json "http://127.0.0.1:$MOCK_PORT/tasks/$MOCK_BADJSON_ID?projectId=x" "$WORK/api-bad.json" 2>"$WORK/api-bad.err"; then bad "T9 invalid JSON body should fail"; else grep -q "not valid JSON" "$WORK/api-bad.err" && ok "T9 invalid JSON body refused" || bad "T9 invalid JSON message unclear"; fi
unset MOCK_BADJSON_ID

echo "== T10: fleet-recount.sh end-to-end against the mock API"
start_mock recount
t10rc=0
KAINBAIN_API_BASE="http://127.0.0.1:$MOCK_PORT" "$BIN_DIR/fleet-recount.sh" mock "$WORK/mockdir" > "$WORK/recount.out" 2> "$WORK/recount.err" || t10rc=$?
check_eq "T10 exit code on full success" "0" "$t10rc"
check_json_eq "T10 table matches pinned before-table" "$WORK/mockdir/recount-mock-table.json" "$TASK_DIR/recount-before-table.json"
check_eq "T10 rows written" "$(ls "$FIXTURE_RAW"/*.json | wc -l)" "$(wc -l < "$WORK/mockdir/recount-mock.jsonl" | tr -d ' ')"
check_eq "T10 raw evidence kept" "$(ls "$FIXTURE_RAW"/*.json | wc -l)" "$(ls "$WORK/mockdir/raw/mock"/*.json | wc -l)"
check_eq "T10 meta ok count" "$(ls "$FIXTURE_RAW"/*.json | wc -l)" "$(jq -r .tasksFetched "$WORK/mockdir/recount-mock-meta.json")"
# partial failure: one task 500s -> exit 2, errors file, table still written
first_id="$(ls "$FIXTURE_RAW" | head -1 | sed 's/.json//')"
kill "${MOCK_PIDS[-1]}" 2>/dev/null || true
MOCK_FAIL_IDS="$first_id"
export MOCK_FAIL_IDS
start_mock recountfail
if KAINBAIN_API_BASE="http://127.0.0.1:$MOCK_PORT" "$BIN_DIR/fleet-recount.sh" mockfail "$WORK/mockdir2" > "$WORK/recount2.out" 2> "$WORK/recount2.err"; then
  bad "T10 partial failure should exit 2"
else
  check_eq "T10 partial failure exit code" "2" "$?"
fi
check_eq "T10 errors file lists the failed task" "$first_id" "$(jq -r .task "$WORK/mockdir2/recount-mockfail-errors.jsonl")"
check_eq "T10 table still written with remaining tasks" "$(( $(ls "$FIXTURE_RAW"/*.json | wc -l) - 1 ))" "$(jq -r .tasks_total "$WORK/mockdir2/recount-mockfail-table.json")"
unset MOCK_FAIL_IDS
# empty list -> exit 1, no outputs
kill "${MOCK_PIDS[-1]}" 2>/dev/null || true
MOCK_EMPTY=1
export MOCK_EMPTY
start_mock empty
if KAINBAIN_API_BASE="http://127.0.0.1:$MOCK_PORT" "$BIN_DIR/fleet-recount.sh" mockempty "$WORK/mockdir3" > /dev/null 2> "$WORK/recount3.err"; then
  bad "T10 empty task list should exit 1"
else
  check_eq "T10 empty list exit code" "1" "$?"
  grep -q "zero tasks" "$WORK/recount3.err" && ok "T10 empty list has clear message" || bad "T10 empty list message unclear: $(cat "$WORK/recount3.err")"
fi
[ -e "$WORK/mockdir3/recount-mockempty.jsonl" ] && bad "T10 empty list wrote outputs anyway" || ok "T10 empty list wrote no outputs"
unset MOCK_EMPTY

echo "== T11: runners-snapshot.sh end-to-end against the mock API"
start_mock snap
t11rc=0
KAINBAIN_API_BASE="http://127.0.0.1:$MOCK_PORT" "$BIN_DIR/runners-snapshot.sh" "$WORK/snap" > "$WORK/snap.out" 2> "$WORK/snap.err" || t11rc=$?
check_eq "T11 exit 0 without --require-converged" "0" "$t11rc"
snap_json="$(ls "$WORK/snap"/runners-*.json | head -1)"
check_json_eq "T11 raw runners payload preserved" "$snap_json" "$FIXTURE_RUNNERS"
check_eq "T11 tsv lines" "10" "$(wc -l < "$(ls "$WORK/snap"/runners-*.tsv | head -1)" | tr -d ' ')"
verdict_txt="$(ls "$WORK/snap"/verdict-*.txt | head -1)"
grep -q "NOT-CONVERGED local-alpha" "$verdict_txt" && ok "T11 local-alpha NOT-CONVERGED (0.1.0)" || bad "T11 verdict missing: $(cat "$verdict_txt")"
grep -q "NOT-CONVERGED server2-alpha" "$verdict_txt" && ok "T11 server2-alpha NOT-CONVERGED" || bad "T11 verdict missing server2: $(cat "$verdict_txt")"
if KAINBAIN_API_BASE="http://127.0.0.1:$MOCK_PORT" "$BIN_DIR/runners-snapshot.sh" "$WORK/snap2" --require-converged > /dev/null 2>&1; then
  bad "T11 --require-converged should exit 3 when not converged"
else
  check_eq "T11 --require-converged exit code" "3" "$?"
fi
# converged case: synthetic runners on 0.2.0 with a build sha containing the fix
jq -n --arg sha "$(git -C "$REPO_ROOT" rev-parse HEAD)" '
  [{runnerId: "local-alpha", status: "active", runnerVersion: "0.2.0", recommendedVersion: "0.2.0", minimumVersion: "0.1.0", desiredVersion: "latest", availableVersions: ["0.1.0","0.2.0"], updateAvailable: false, belowMinimum: false, updateStatus: null, pendingCommands: [], lastSeenAt: "2026-11-23T10:00:00Z", facts: {versions: {runner: "0.2.0", build: {sha: $sha, builtAt: "2026-11-23T09:00:00Z"}}}},
   {runnerId: "server2-alpha", status: "active", runnerVersion: "0.2.0", recommendedVersion: "0.2.0", minimumVersion: "0.1.0", desiredVersion: "latest", availableVersions: ["0.1.0","0.2.0"], updateAvailable: false, belowMinimum: false, updateStatus: null, pendingCommands: [], lastSeenAt: "2026-11-23T10:00:00Z", facts: {versions: {runner: "0.2.0", build: {sha: $sha, builtAt: "2026-11-23T09:00:00Z"}}}}]
' > "$WORK/runners-converged.json"
kill "${MOCK_PIDS[-1]}" 2>/dev/null || true
R_FILE="$WORK/runners-converged.json"
start_mock snapok
# restart mock with the converged runners file
kill "${MOCK_PIDS[-1]}" 2>/dev/null || true
port_file="$WORK/snapok2.port"
python3 "$TESTS_DIR/mock-api.py" --tasks-dir "$FIXTURE_RAW" --runners-file "$R_FILE" --deploy-file "$FIXTURE_DEPLOY" --port 0 --port-file "$port_file" &
MOCK_PIDS+=($!)
for _ in $(seq 1 50); do [ -s "$port_file" ] && break; sleep 0.1; done
t11crc=0
KAINBAIN_API_BASE="http://127.0.0.1:$(cat "$port_file")" "$BIN_DIR/runners-snapshot.sh" "$WORK/snap3" --require-converged > "$WORK/snap3.out" 2>&1 || t11crc=$?
check_eq "T11 converged fleet exits 0 with --require-converged" "0" "$t11crc"
grep -q "CONVERGED    local-alpha 0.2.0" "$(ls "$WORK/snap3"/verdict-*.txt | head -1)" && ok "T11 converged verdict line" || bad "T11 converged verdict: $(cat "$(ls "$WORK/snap3"/verdict-*.txt | head -1)")"

echo "== T12: server2-ssh.sh guards (no network)"
empty_home="$WORK/nohome"; mkdir -p "$empty_home"
if HOME="$empty_home" "$BIN_DIR/server2-ssh.sh" "echo hi" > /dev/null 2> "$WORK/ssh.txt"; then
  bad "T12 missing password file should fail"
else
  check_eq "T12 missing password file exit code" "66" "$?"
  grep -q "password file" "$WORK/ssh.txt" && ok "T12 clear message, password never printed" || bad "T12 message unclear: $(cat "$WORK/ssh.txt")"
fi
if grep -qE "$(head -c 4 "$HOME/.passwrd" 2>/dev/null)" "$WORK/ssh.txt" 2>/dev/null; then bad "T12 output contains password material"; else ok "T12 no password material in output"; fi
if "$BIN_DIR/server2-ssh.sh" > /dev/null 2>&1; then bad "T12 no-args should fail"; else check_eq "T12 no-args exit code" "64" "$?"; fi

# cleanup mock servers
for pid in "${MOCK_PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
