#!/usr/bin/env bash
#
# lint-agents-md.sh — lint-checkable done-gate for agents.md (AUDIT R2).
#
# Assertions:
#   1. No adjacent duplicate non-empty lines (the R2 dedupe finding).
#   2. The vendored KB pages exist in-repo and are linked from agents.md.
#   3. Every relative .md link in agents.md resolves to a repo file, except the
#      two allowlisted forward links created by later tickets:
#        AGENTS-MAP.md              (R1 — repo map for agents)
#        agent-docs/GitGuidance.md  (R10 — git guidance for agents)
#      The allowlist means "expected missing", not "must be missing": once R1/R10
#      land, the links resolve normally and keep passing.
#   4. The test/lint/build command strings are listed and their targets exist
#      verbatim in root package.json.
#   5. Read-budget rule present: prefer GET /tasks/:id/logs?feed= over task.md
#      process logs; never ls -R.
#
# Intentionally does NOT depend on the SilverBullet notes store (unreachable on
# a fresh checkout): verbatim-vendor fidelity is a one-time diff at vendor time,
# not a lint here. See agent-docs/*.md provenance headers.
#
# Usage: bash scripts/lint-agents-md.sh   (exit 0 = pass, 1 = fail)

set -u
cd "$(dirname "$0")/.." || exit 1

AGENTS=agents.md
FORWARD_R1="AGENTS-MAP.md"
FORWARD_R10="agent-docs/GitGuidance.md"
total=0
fails=0

ok() {
	total=$((total + 1))
	printf 'ok:   %s\n' "$1"
}
fail() {
	total=$((total + 1))
	fails=$((fails + 1))
	printf 'FAIL: %s\n' "$1"
}
expect() { # expect <description> <test command...>
	local desc="$1"
	shift
	if "$@"; then ok "$desc"; else fail "$desc"; fi
}

[ -f "$AGENTS" ] || {
	printf 'FAIL: %s not found (run from the repo root or via scripts/)\n' "$AGENTS"
	exit 1
}

# --- 1. no adjacent duplicate non-empty lines (R2 finding: old lines 14-15) ---
dups=$(awk 'NR > 1 && $0 == prev && $0 != "" { print NR ": " $0 } { prev = $0 }' "$AGENTS")
if [ -z "$dups" ]; then
	ok "no adjacent duplicate lines"
else
	fail "adjacent duplicate lines in agents.md: $(printf '%s' "$dups" | head -3)"
fi

# --- 2. vendored KB pages exist in-repo and are linked ------------------------
for vendored in agent-docs/KB-Architecture.md agent-docs/KB-Code-Standards.md; do
	expect "vendored KB page exists: $vendored" test -f "$vendored"
	expect "agents.md links $vendored" grep -qF "($vendored)" "$AGENTS"
done

# --- 3. relative .md links resolve, except allowlisted forward links ----------
# (link targets are whitespace-split; agents.md paths must not contain spaces)
md_targets=$(grep -oE '\]\([^)]+\.md[^)]*\)' "$AGENTS" | sed -E 's/^\]\(//; s/\)$//; s/#.*//' | sort -u)
for t in $md_targets; do
	case "$t" in
	http://* | https://* | mailto:* | /*) continue ;; # not repo-relative
	esac
	if [ -f "$t" ]; then
		ok "link resolves: $t"
	elif [ "$t" = "$FORWARD_R1" ] || [ "$t" = "$FORWARD_R10" ]; then
		ok "forward link, expected-missing until R1/R10: $t"
	else
		fail "relative .md link does not resolve: $t (create the file, or allowlist it as an expected-missing forward link in scripts/lint-agents-md.sh)"
	fi
done
expect "forward link (R1) wired: $FORWARD_R1" grep -qF "($FORWARD_R1)" "$AGENTS"
expect "forward link (R10) wired: $FORWARD_R10" grep -qF "($FORWARD_R10)" "$AGENTS"

# --- 4. commands listed in agents.md, targets verbatim in root package.json ---
# Word-boundary match, so a typo like `npm run buildd` is not satisfied by the
# substring `npm run build`.
for cmd in "npm run test:unit" "npm run lint" "npm run build" "npm test"; do
	esc=$(printf '%s' "$cmd" | sed 's/[.[\*^$]/\\&/g')
	expect "command listed: $cmd" grep -qE "(^|[^a-zA-Z0-9:_-])${esc}([^a-zA-Z0-9:_-]|$)" "$AGENTS"
done
# Every `npm run <script>` referenced anywhere in agents.md must name a real
# root package.json script (so listed commands can never drift from it).
npm_refs=$(grep -oE 'npm run [a-zA-Z0-9:_-]+' "$AGENTS" | awk '{print $3}' | sort -u)
if [ -n "$npm_refs" ]; then
	for ref in $npm_refs; do
		expect "package.json defines script: $ref" node -e 'const p = require("./package.json"); process.exit(p.scripts && p.scripts[process.argv[1]] ? 0 : 1)' "$ref"
	done
else
	fail "no 'npm run' commands found in agents.md"
fi
expect "package.json test runs scripts/run-tests.mjs" grep -qF "scripts/run-tests.mjs" package.json
expect "scripts/run-tests.mjs exists" test -f scripts/run-tests.mjs
expect "run-tests.sh shim exists and is executable" test -x run-tests.sh

# --- 5. read-budget rule ------------------------------------------------------
expect "read-budget: prefer the logs feed over task.md process logs" grep -qE 'feed=.*task\.md|task\.md.*feed=' "$AGENTS"
expect "read-budget: ls -R forbidden" grep -qiE 'never.*ls -R|ls -R.*never' "$AGENTS"
expect "read-budget: feed= endpoint mentioned" grep -qF 'feed=' "$AGENTS"
expect "read-budget: ls -R mentioned" grep -qF 'ls -R' "$AGENTS"

echo
if [ "$fails" -eq 0 ]; then
	printf 'lint-agents-md: PASS (%s checks)\n' "$total"
	exit 0
fi
printf 'lint-agents-md: FAIL (%s of %s checks failing)\n' "$fails" "$total"
exit 1
