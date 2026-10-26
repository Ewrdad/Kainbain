#!/bin/bash

# Hermetic tests for Security_scans.sh
#
# Runs the scan script against a sandboxed environment: fake curl/trivy/semgrep
# binaries on PATH (real binaries are shadowed), a fake SecObserve API served
# from fixtures, and a fake API key file. No network access, no live systems.
#
# Covered behavior:
#   1. Fresh findings are uploaded exactly once (dedupe against existing titles).
#   2. Findings whose title already exists in SecObserve are NOT re-uploaded.
#   3. --close-stale marks Open observations absent from fresh scan results as
#      Resolved via the bulk_assessment endpoint (correct API contract).
#   4. Re-running with --close-stale is idempotent (no repeated closures/uploads).
#   5. Missing scanner binaries produce loud warnings and a graceful exit.

set -u

SCRIPT_UNDER_TEST="$(cd "$(dirname "$0")/.." && pwd)/Security_scans.sh"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

assert_eq() {
	if [[ "$1" == "$2" ]]; then pass "$3"; else fail "$3 (expected '$2', got '$1')"; fi
}
assert_contains() {
	if grep -Fq -- "$1" "$2"; then pass "$3"; else fail "$3 (file does not contain '$1')"; fi
}
assert_not_contains() {
	if grep -Fq -- "$1" "$2"; then fail "$3 (file unexpectedly contains '$1')"; else pass "$3"; fi
}

# --- Fake binaries ----------------------------------------------------------

make_fake_curl() {
	local bin_dir="$1"
	mkdir -p "$bin_dir"
	cat >"$bin_dir/curl" <<'EOF'
#!/bin/bash
# Fake curl: routes SecObserve requests to fixtures, logs every request.
STATE_DIR="${FAKE_STATE:?FAKE_STATE not set}"
LOG="$STATE_DIR/request.log"
method="GET"
url=""
outfile="/dev/stdout"
wfmt=""
body=""
args=("$@")
i=0
while [[ $i -lt ${#args[@]} ]]; do
	a="${args[$i]}"
	case "$a" in
	-X) method="${args[$((i + 1))]}"; i=$((i + 2)); continue ;;
	-o) outfile="${args[$((i + 1))]}"; i=$((i + 2)); continue ;;
	-w) wfmt="${args[$((i + 1))]}"; i=$((i + 2)); continue ;;
	-d | --data | --data-raw | --data-binary) body="${args[$((i + 1))]}"; i=$((i + 2)); continue ;;
	-H | --header | --max-time) i=$((i + 2)); continue ;;
	-*) i=$((i + 1)) ;;
	*) url="$a"; i=$((i + 1)); continue ;;
	esac
	i=$((i + 1))
done

status=200
out=""
case "$url" in
*/api/products/)
	if [[ -n "${FAKE_CURL_FAIL_PRODUCTS:-}" ]]; then
		out=''
		status=500
	else
		out='{"count": 1, "next": null, "results": [{"id": 22, "name": "kainbain"}]}'
	fi
	;;
*/api/observations/bulk_assessment/)
	echo "POST $url" >>"$LOG"
	echo "$body" >>"$LOG"
	status=204
	out=""
	;;
*/api/products/*/sbom/)
	echo "POST $url" >>"$LOG"
	status=204
	out=""
	;;
*/api/observations/*)
	if [[ "$method" == "POST" ]]; then
		echo "POST $url" >>"$LOG"
		echo "$body" >>"$LOG"
		status=200
		out='{"id": 9999}'
	else
		out="$(cat "$STATE_DIR/observations_fixture.json")"
	fi
	;;
*)
	echo "UNROUTED $method $url" >>"$LOG"
	status=404
	;;
esac

if [[ "$outfile" != "/dev/stdout" ]]; then
	printf '%s' "$out" >"$outfile"
elif [[ -n "$out" ]]; then
	printf '%s' "$out"
fi
if [[ -n "$wfmt" ]]; then
	printf '%s' "${wfmt//%{http_code}/$status}"
fi
exit 0
EOF
	chmod +x "$bin_dir/curl"
}

make_fake_scanners() {
	local bin_dir="$1"
	cat >"$bin_dir/trivy" <<'EOF'
#!/bin/bash
if [[ "$3" == "cyclonedx" ]]; then
	echo '{"bomFormat": "CycloneDX"}'
else
	cat "$FAKE_STATE/trivy_fixture.json"
fi
exit 0
EOF
	chmod +x "$bin_dir/trivy"
	cat >"$bin_dir/semgrep" <<'EOF'
#!/bin/bash
cat "$FAKE_STATE/semgrep_fixture.json"
exit 0
EOF
	chmod +x "$bin_dir/semgrep"
}

write_fixtures() {
	local state="$1"
	cat >"$state/trivy_fixture.json" <<'EOF'
{"Results": [{"Vulnerabilities": [
	{"VulnerabilityID": "CVE-3333-0001", "Severity": "HIGH", "Title": "pkg-c: advisory CCC", "Description": "desc c", "PkgName": "pkg-c", "InstalledVersion": "1.0.0", "CVSS": {"nvd": {"V3Score": 7.5}}},
	{"VulnerabilityID": "CVE-2222-0002", "Severity": "MEDIUM", "Title": "pkg-b: advisory BBB", "Description": "desc b", "PkgName": "pkg-b", "InstalledVersion": "2.0.0", "CVSS": {"nvd": {"V3Score": 5.0}}}
]}]}
EOF
	cat >"$state/semgrep_fixture.json" <<'EOF'
{"results": [{"check": {"id": "rule-b"}, "path": "src/b.js", "start": {"line": 3}, "extra": {"severity": "WARNING", "message": "pkg-b: advisory BBB"}}]}
EOF
}

# observations fixture for run 1: two Open observations.
#  - id 1 "pkg-old: removed advisory ZZZ" — NOT in fresh scan -> stale candidate
#  - id 2 "pkg-b: advisory BBB"           — matched by trivy+semgrep -> not stale
write_obs_fixture_1() {
	cat >"$1" <<'EOF'
{"count": 2, "next": null, "results": [
	{"id": 1, "title": "pkg-old: removed advisory ZZZ", "current_status": "Open", "current_severity": "High", "external_id": "", "vulnerability_id": "", "scanner_observation_id": ""},
	{"id": 2, "title": "pkg-b: advisory BBB", "current_status": "Open", "current_severity": "Medium", "external_id": "", "vulnerability_id": "", "scanner_observation_id": ""}
]}
EOF
}

# observations fixture for the final idempotency run: everything closed.
write_obs_fixture_3() {
	cat >"$1" <<'EOF'
{"count": 3, "next": null, "results": [
	{"id": 1, "title": "pkg-old: removed advisory ZZZ", "current_status": "Resolved", "current_severity": "High", "external_id": "", "vulnerability_id": "", "scanner_observation_id": ""},
	{"id": 2, "title": "pkg-b: advisory BBB", "current_status": "Resolved", "current_severity": "Medium", "external_id": "", "vulnerability_id": "", "scanner_observation_id": ""},
	{"id": 3, "title": "pkg-c: advisory CCC", "current_status": "Open", "current_severity": "High", "external_id": "CVE-3333-0001", "vulnerability_id": "CVE-3333-0001", "scanner_observation_id": "x"}
]}
EOF
}

# run_scan <state_dir> <cwd> [extra args...]
# Returns: stderr in $RUN_STDERR, exit code in $RUN_EXIT
run_scan() {
	local state="$1"
	local cwd="$2"
	shift 2
	(
		cd "$cwd" && FAKE_STATE="$state" \
			API_KEY_FILE="$state/apikey" \
			TRIVY_FALLBACK_DIR="$state/empty-fallback" \
			SEMGREP_FALLBACK_DIR="$state/empty-fallback" \
			PATH="$BIN_DIR:/usr/bin:/bin" \
			bash "$SCRIPT_UNDER_TEST" "$@"
	) >"$state/run.out" 2>"$state/run.err"
	RUN_EXIT=$?
	RUN_STDERR="$state/run.err"
}

requests() { # <state> — count logged POST /observations/ (dedupe uploads)
	local n
	n=$(grep -c "^POST .*/api/observations/$" "$1/request.log" 2>/dev/null)
	echo "${n:-0}"
}
bulk_calls() { # <state>
	local n
	n=$(grep -c "^POST .*/api/observations/bulk_assessment/$" "$1/request.log" 2>/dev/null)
	echo "${n:-0}"
}

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
BIN_DIR="$SANDBOX/bin"
mkdir -p "$BIN_DIR" "$SANDBOX/empty-fallback"
make_fake_curl "$BIN_DIR"
make_fake_scanners "$BIN_DIR"

echo "Security_scans.sh test suite"
echo "Script: $SCRIPT_UNDER_TEST"

# 0. Syntax sanity
if bash -n "$SCRIPT_UNDER_TEST"; then pass "script passes bash -n"; else fail "bash -n"; fi

# --- Run 1: fresh scans, no --close-stale ------------------------------------
echo "[run 1] dedupe: only new findings uploaded"
S1="$SANDBOX/run1"
mkdir -p "$S1" "$S1/cwd"
echo "fake-key" >"$S1/apikey"
: >"$S1/request.log"
write_fixtures "$S1"
write_obs_fixture_1 "$S1/observations_fixture.json"
run_scan "$S1" "$S1/cwd"
[[ $RUN_EXIT -eq 0 ]] && pass "exit code 0" || fail "exit code (got $RUN_EXIT)"
[[ "$(requests "$S1")" -eq 1 ]] && pass "exactly 1 observation POST (2 scanned, 1 deduped)" || fail "observation POSTs (got $(requests "$S1"))"
assert_contains "pkg-c: advisory CCC" "$S1/request.log" "POST payload contains the NEW finding (pkg-c)"
assert_not_contains "pkg-b: advisory BBB" "$S1/request.log" "POST payload does NOT contain the EXISTING finding (pkg-b)"
[[ "$(bulk_calls "$S1")" -eq 0 ]] && pass "no bulk_assessment without --close-stale" || fail "unexpected bulk_assessment calls"
grep -q "Security scan complete (existing titles: 2, new uploads: 1, closed stale: 0)" "$S1/run.out" &&
	pass "summary line correct" || fail "summary line incorrect: $(grep 'Security scan complete' "$S1/run.out" || echo MISSING)"

# --- Run 2: --close-stale ----------------------------------------------------
echo "[run 2] --close-stale closes stale Open observation"
S2="$SANDBOX/run2"
mkdir -p "$S2" "$S2/cwd"
echo "fake-key" >"$S2/apikey"
: >"$S2/request.log"
write_fixtures "$S2"
write_obs_fixture_1 "$S2/observations_fixture.json"
run_scan "$S2" "$S2/cwd" --close-stale
[[ $RUN_EXIT -eq 0 ]] && pass "exit code 0" || fail "exit code (got $RUN_EXIT)"
[[ "$(requests "$S2")" -eq 1 ]] && pass "1 new upload (pkg-c)" || fail "observation POSTs (got $(requests "$S2"))"
[[ "$(bulk_calls "$S2")" -eq 1 ]] && pass "exactly 1 bulk_assessment call" || fail "bulk_assessment calls (got $(bulk_calls "$S2"))"
grep -q '"observations": \[1\]' "$S2/request.log" && pass "bulk_assessment targeted exactly the stale observation (id 1)" || fail "bulk payload ids"
grep -q '"status": "Resolved"' "$S2/request.log" && pass "bulk_assessment status is Resolved" || fail "bulk status not Resolved"

# --- Run 3: idempotency (same inputs again) ----------------------------------
echo "[run 3] idempotency — second --close-stale run changes nothing"
S3="$SANDBOX/run3"
mkdir -p "$S3" "$S3/cwd"
echo "fake-key" >"$S3/apikey"
: >"$S3/request.log"
write_fixtures "$S3"
write_obs_fixture_3 "$S3/observations_fixture.json" # only pkg-c still Open (its title is freshly scanned)
run_scan "$S3" "$S3/cwd" --close-stale
[[ $RUN_EXIT -eq 0 ]] && pass "exit code 0" || fail "exit code (got $RUN_EXIT)"
[[ "$(requests "$S3")" -eq 0 ]] && pass "0 new uploads (all titles already known)" || fail "observation POSTs (got $(requests "$S3"))"
[[ "$(bulk_calls "$S3")" -eq 0 ]] && pass "0 bulk_assessment calls (nothing stale left)" || fail "bulk_assessment calls (got $(bulk_calls "$S3"))"
grep -q "closed stale: 0" "$S3/run.out" && pass "summary reports closed stale: 0" || fail "summary closure count"

# --- Run 4: missing scanner binaries ----------------------------------------
echo "[run 4] missing scanner binaries -> loud warning, graceful completion"
S4="$SANDBOX/run4"
mkdir -p "$S4" "$S4/cwd" "$S4/curl-only"
cp "$BIN_DIR/curl" "$S4/curl-only/curl"
echo "fake-key" >"$S4/apikey"
: >"$S4/request.log"
FAKE_STATE="$S4" \
	API_KEY_FILE="$S4/apikey" \
	TRIVY_FALLBACK_DIR="$S4/empty-fallback" \
	SEMGREP_FALLBACK_DIR="$S4/empty-fallback" \
	PATH="$S4/curl-only:/usr/bin:/bin" \
	bash "$SCRIPT_UNDER_TEST" >"$S4/run.out" 2>"$S4/run.err"
RUN_EXIT=$?
[[ $RUN_EXIT -eq 0 ]] && pass "exit code 0 despite missing scanners" || fail "exit code (got $RUN_EXIT)"
assert_contains "WARNING: trivy not found" "$S4/run.err" "trivy missing warning emitted"
assert_contains "semgrep not found" "$S4/run.err" "semgrep missing warning emitted"
[[ "$(requests "$S4")" -eq 0 ]] && pass "no uploads attempted without scanners" || fail "unexpected uploads"
grep -q "Security scan complete" "$S4/run.out" && pass "script still completes" || fail "script did not complete"

# --- Run 5: missing API key -> local scans run, upload skipped ---------------
echo "[run 5] missing API key file -> local-only mode, exit 0"
S5="$SANDBOX/run5"
mkdir -p "$S5" "$S5/cwd"
# NOTE: no apikey file created — API_KEY_FILE points at nothing.
: >"$S5/request.log"
write_fixtures "$S5"
write_obs_fixture_1 "$S5/observations_fixture.json"
run_scan "$S5" "$S5/cwd"
[[ $RUN_EXIT -eq 0 ]] && pass "exit code 0 without a key file" || fail "exit code (got $RUN_EXIT)"
assert_contains "SecObserve upload skipped (not configured)" "$S5/run.out" "clear skip message printed"
assert_contains "Running Trivy filesystem scan..." "$S5/run.out" "trivy scan still ran"
assert_contains "Running Semgrep scan..." "$S5/run.out" "semgrep scan still ran"
assert_contains "Trivy scan complete: 2 finding(s)" "$S5/run.out" "local trivy finding count reported"
assert_contains "Semgrep scan complete: 1 finding(s)" "$S5/run.out" "local semgrep finding count reported"
[[ "$(requests "$S5")" -eq 0 ]] && pass "no uploads attempted without a key" || fail "unexpected uploads"
[[ -f "$S5/cwd/sbom.cyclonedx.json" ]] && pass "SBOM still generated locally" || fail "SBOM not generated"
grep -q "Security scan complete" "$S5/run.out" && pass "script completes with summary" || fail "script did not complete"

# --- Run 6: unreachable endpoint -> local scans run, upload skipped --------
echo "[run 6] unreachable SecObserve endpoint -> local-only mode, exit 0"
S6="$SANDBOX/run6"
mkdir -p "$S6" "$S6/cwd"
echo "fake-key" >"$S6/apikey"
: >"$S6/request.log"
write_fixtures "$S6"
write_obs_fixture_1 "$S6/observations_fixture.json"
(
	cd "$S6/cwd" && FAKE_STATE="$S6" \
		FAKE_CURL_FAIL_PRODUCTS=1 \
		API_KEY_FILE="$S6/apikey" \
		TRIVY_FALLBACK_DIR="$S6/empty-fallback" \
		SEMGREP_FALLBACK_DIR="$S6/empty-fallback" \
		PATH="$BIN_DIR:/usr/bin:/bin" \
		bash "$SCRIPT_UNDER_TEST" --close-stale
) >"$S6/run.out" 2>"$S6/run.err"
RUN_EXIT=$?
[[ $RUN_EXIT -eq 0 ]] && pass "exit code 0 with unreachable endpoint" || fail "exit code (got $RUN_EXIT)"
assert_contains "SecObserve upload skipped (not configured)" "$S6/run.out" "clear skip message printed"
assert_contains "Running Trivy filesystem scan..." "$S6/run.out" "trivy scan still ran"
assert_contains "Skipping stale closure (upload skipped" "$S6/run.out" "stale closure skipped without API"
[[ "$(requests "$S6")" -eq 0 ]] && pass "no uploads attempted" || fail "unexpected uploads"
[[ "$(bulk_calls "$S6")" -eq 0 ]] && pass "no bulk_assessment without API" || fail "unexpected bulk calls"

# --- Summary -----------------------------------------------------------------
echo
echo "Results: $PASS passed, $FAIL failed"
if [[ $FAIL -eq 0 ]]; then
	echo "ALL TESTS PASSED"
	exit 0
fi
exit 1