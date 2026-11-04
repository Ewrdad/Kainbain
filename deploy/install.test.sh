#!/usr/bin/env bash
# Shim-driven tests for deploy/install.sh. Fake docker/curl on PATH.
#   bash deploy/install.test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=test-fixture.sh
source deploy/test-fixture.sh
setup_case() {
  kb_setup_case
  kb_add_docker_shim
  kb_add_curl_shim
  kb_write_manifest
  # startRunner.sh shim inside the fake tarball is complex; dry-run cases avoid extraction.
}
# 1. Dry-run with site-installer flags: prints plan, writes nothing.
setup_case
bash deploy/install.sh --dry-run --install-dir "$CASE_DIR/app" --frontend-port 8080 --backend-port 3100 --runners 4 --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "dry-run: exit 0" test "$rc" = 0
check "dry-run: no install dir created" test ! -e "$CASE_DIR/app/docker-compose.yml"
check "dry-run: plan mentions runners" grep -q "runners: 4" "$CASE_DIR/out.txt"
# 2. Help lists the site-installer flags.
bash deploy/install.sh --help > "$CASE_DIR/help.txt" 2>&1
for f in --install-dir --port --frontend-port --backend-port --runners --harness --harnesses --manual --auto --namespace --tag --release-url --manifest-url --projects-dir --adopt-from --seed-demo --no-seed --no-runner --dry-run --force; do
  check "help: $f documented" grep -q -- "$f" "$CASE_DIR/help.txt"
done
# 3. Unknown arg exits 2.
bash deploy/install.sh --bogus >/dev/null 2>&1; check "usage: unknown arg exit 2" test "$?" = 2
# 4. No-start install writes compose+.env+manifest, pulls, never ups.
setup_case
bash deploy/install.sh --no-start --skip-pull --runners 0 --install-dir "$CASE_DIR/app" --port 8080 --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "no-start: exit 0" test "$rc" = 0
check "no-start: compose written" test -f "$CASE_DIR/app/docker-compose.yml"
check "no-start: env has port" grep -q "^KAINBAIN_PORT=8080$" "$CASE_DIR/app/.env"
check "no-start: env has backend tag" grep -q "^KAINBAIN_BACKEND_TAG=1.0.0-abc$" "$CASE_DIR/app/.env"
check "no-start: manifest copied" grep -q '"commit":"abc"' "$CASE_DIR/app/release-manifest.json"
check "no-start: uninstall helper fetched" test -f "$CASE_DIR/app/uninstall.sh"
check "no-start: output links uninstall" grep -q "uninstall.sh" "$CASE_DIR/out.txt"
check "no-start: compose up never called" bash -c "! grep -q 'compose up' '$SHIM_LOG'"
check "no-start: env is 600" bash -c "[ \"\$(stat -c %a '$CASE_DIR/app/.env')\" = 600 ]"
# 5. Re-run without --force leaves .env untouched.
echo "MARKER=1" >> "$CASE_DIR/app/.env"
bash deploy/install.sh --no-start --skip-pull --runners 0 --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" >/dev/null 2>&1
check "idempotent: marker kept" grep -q "^MARKER=1$" "$CASE_DIR/app/.env"
# 6. Fresh HOME: a join token is generated once and shared with the Runner.
setup_case
bash deploy/install.sh --no-start --skip-pull --runners 1 --runner-id local-pi --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "token: exit 0" test "$rc" = 0
check "token: file created at 600" bash -c "[ \"\$(stat -c %a '$CASE_DIR/home/.kainbain/runner-join.token')\" = 600 ]"
check "token: .env carries the same token" bash -c "[ \"\$(grep '^KAINBAIN_RUNNER_JOIN_TOKEN=' '$CASE_DIR/app/.env' | cut -d= -f2)\" = \"\$(cat '$CASE_DIR/home/.kainbain/runner-join.token')\" ]"
check "token: value never printed" bash -c "! grep -q \"\$(cat '$CASE_DIR/home/.kainbain/runner-join.token')\" '$CASE_DIR/out.txt'"
check "token: expected runner id recorded" grep -q "^KAINBAIN_EXPECTED_RUNNER_ID=local-pi$" "$CASE_DIR/app/.env"
# 7. Explicit --join-token is shared with the Runner side (no generation).
setup_case
bash deploy/install.sh --no-start --skip-pull --runners 1 --join-token provided-token --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" >/dev/null 2>&1
check "provided: file holds the provided token" bash -c "[ \"\$(cat '$CASE_DIR/home/.kainbain/runner-join.token')\" = provided-token ]"
check "provided: .env holds the provided token" grep -q "^KAINBAIN_RUNNER_JOIN_TOKEN=provided-token$" "$CASE_DIR/app/.env"
# 8. Conflicting token file is never overwritten (warns instead).
setup_case
mkdir -p "$CASE_DIR/home/.kainbain"; printf '%s' "file-token" > "$CASE_DIR/home/.kainbain/runner-join.token"
bash deploy/install.sh --no-start --skip-pull --runners 0 --join-token flag-token --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1
check "conflict: file untouched" bash -c "[ \"\$(cat '$CASE_DIR/home/.kainbain/runner-join.token')\" = file-token ]"
check "conflict: warns" grep -q "WARN --join-token differs" "$CASE_DIR/out.txt"
# 9. Dry-run announces token generation without writing anything.
setup_case
bash deploy/install.sh --dry-run --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1
check "dry-run: announces token generation" grep -q "would generate: a runner join token" "$CASE_DIR/out.txt"
check "dry-run: announces expected runner" grep -q "would write: KAINBAIN_EXPECTED_RUNNER_ID=local-pi" "$CASE_DIR/out.txt"
check "dry-run: token file untouched" test ! -e "$CASE_DIR/home/.kainbain/runner-join.token"
# 10. Demo seed defaults on, --no-seed opts out.
setup_case
bash deploy/install.sh --no-start --skip-pull --runners 0 --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" >/dev/null 2>&1
check "seed: defaults on" grep -q "^KAINBAIN_SEED_DEMO=1$" "$CASE_DIR/app/.env"
setup_case
bash deploy/install.sh --no-start --skip-pull --runners 0 --no-seed --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" >/dev/null 2>&1
check "seed: --no-seed opts out" grep -q "^KAINBAIN_SEED_DEMO=0$" "$CASE_DIR/app/.env"
# 11. --adopt-from dry-run plans each checkout with its container path.
setup_case
mkdir -p "$CASE_DIR/repos/repo-a/.git" "$CASE_DIR/repos/repo-b/.git" "$CASE_DIR/repos/plain"
bash deploy/install.sh --dry-run --install-dir "$CASE_DIR/app" --projects-dir "$CASE_DIR/repos" --adopt-from "$CASE_DIR/repos" --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "adopt dry-run: exit 0" test "$rc" = 0
check "adopt dry-run: plans both checkouts" grep -q "would adopt: 2 checkout(s)" "$CASE_DIR/out.txt"
check "adopt dry-run: translates to container paths" grep -q "(as /workspace/projects/repo-a)" "$CASE_DIR/out.txt"
check "adopt dry-run: posts nothing" bash -c "! grep -q 'projects/register' '$SHIM_LOG'"
# 12. --adopt-from registers each checkout once the stack is up.
setup_case
mkdir -p "$CASE_DIR/repos/repo-a/.git" "$CASE_DIR/repos/repo-b/.git" "$CASE_DIR/repos/plain"
bash deploy/install.sh --skip-pull --runners 0 --install-dir "$CASE_DIR/app" --projects-dir "$CASE_DIR/repos" --adopt-from "$CASE_DIR/repos" --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "adopt: exit 0" test "$rc" = 0
check "adopt: two register posts" bash -c "[ \"\$(grep -c 'projects/register' '$SHIM_LOG')\" = 2 ]"
check "adopt: logs each adoption" bash -c "grep -q 'adopted .*/repo-a/' '$CASE_DIR/out.txt' && grep -q 'adopted .*/repo-b/' '$CASE_DIR/out.txt'"
# 13. --adopt-from outside --projects-dir warns and posts nothing.
setup_case
mkdir -p "$CASE_DIR/elsewhere/repo-a/.git"
bash deploy/install.sh --skip-pull --runners 0 --install-dir "$CASE_DIR/app" --adopt-from "$CASE_DIR/elsewhere" --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "adopt outside: exit 0" test "$rc" = 0
check "adopt outside: warns" grep -q "outside --projects-dir" "$CASE_DIR/out.txt"
check "adopt outside: posts nothing" bash -c "! grep -q 'projects/register' '$SHIM_LOG'"
# 14. --adopt-from defers under --no-start.
setup_case
mkdir -p "$CASE_DIR/repos/repo-a/.git"
bash deploy/install.sh --no-start --skip-pull --runners 0 --install-dir "$CASE_DIR/app" --projects-dir "$CASE_DIR/repos" --adopt-from "$CASE_DIR/repos" --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1
check "adopt no-start: defers" grep -q "adopt-from skipped with --no-start" "$CASE_DIR/out.txt"
kb_finish "install.test.sh"
