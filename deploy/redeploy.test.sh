#!/usr/bin/env bash
# Shim-driven tests for deploy/redeploy.sh: fake docker/curl on PATH record
# every invocation; no real containers are touched.
#   bash deploy/redeploy.test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
check() { # description condition...
  local desc="$1"; shift
  if "$@"; then echo "ok - $desc"; else echo "FAIL - $desc"; FAIL=1; fi
}

setup_case() {
  CASE_DIR="$(mktemp -d)"
  mkdir -p "$CASE_DIR/bin" "$CASE_DIR/install"
  cat > "$CASE_DIR/bin/docker" <<'SHIM'
#!/usr/bin/env bash
echo "docker $*" >> "$SHIM_LOG"
# `docker compose images <svc>` (used by --init) prints a fake table.
if [ "$1 $2" = "compose images" ]; then
  printf 'CONTAINER REPOSITORY TAG\nkainbain-%s-1 kainbain-%s build-1\n' "$3" "$3"
fi
exit 0
SHIM
  cat > "$CASE_DIR/bin/curl" <<'SHIM'
#!/usr/bin/env bash
echo "curl $*" >> "$SHIM_LOG"
[ "${CURL_FAIL:-0}" = "1" ] && exit 1
exit 0
SHIM
  cat > "$CASE_DIR/install/startRunner.sh" <<'SHIM'
#!/usr/bin/env bash
echo "startRunner $*" >> "$SHIM_LOG"
SHIM
  chmod +x "$CASE_DIR/bin/docker" "$CASE_DIR/bin/curl" "$CASE_DIR/install/startRunner.sh"
  mkdir -p "$CASE_DIR/install/runner"
  printf 'KAINBAIN_IMAGE_TAG=oldtag\nKAINBAIN_PORT=3100\nOTHER=keepme\n' > "$CASE_DIR/install/.env"
  cp deploy/redeploy.sh docker-compose.prod.yml "$CASE_DIR/install/"
  mv "$CASE_DIR/install/docker-compose.prod.yml" "$CASE_DIR/install/docker-compose.yml"
  chmod +x "$CASE_DIR/install/redeploy.sh"
  export SHIM_LOG="$CASE_DIR/calls.log"; : > "$SHIM_LOG"
  export PATH="$CASE_DIR/bin:$PATH"
}
write_manifest() { # frontend tag, runner sha
  cat > "$CASE_DIR/install/release-manifest.json" <<JSON
{ "publishedAt": "2026-01-01T00:00:00Z", "commit": "abc123",
  "components": {
    "backend":  { "apiVersion": "1.0.0", "image": "docker.io/ns/kainbain-backend:1.0.0-abc", "tag": "1.0.0-abc" },
    "frontend": { "apiVersion": "1.0.0", "image": "docker.io/ns/kainbain-frontend:$1", "tag": "$1", "requiresBackendApi": ">=1.0.0 <2.0.0" },
    "runner":   { "apiVersion": "1.0.0", "artifact": "kainbain-runner-abc.tar.gz", "sha256": "$2", "requiresBackendApi": ">=1.0.0 <2.0.0" } } }
JSON
}

# Case 1: single-service frontend restart issues exactly pull+up for frontend.
setup_case; write_manifest "1.0.0-abc" "deadbeef"
(cd "$CASE_DIR/install" && ./redeploy.sh --frontend >/dev/null)
check "frontend: pull called" grep -q "docker compose pull frontend" "$SHIM_LOG"
check "frontend: up --no-deps called" grep -q "docker compose up -d --no-deps frontend" "$SHIM_LOG"
check "frontend: backend never touched" bash -c "! grep -q 'backend' '$SHIM_LOG'"
check "frontend: env tag updated" grep -q "^KAINBAIN_FRONTEND_TAG=1.0.0-abc$" "$CASE_DIR/install/.env"
check "frontend: other env lines preserved" grep -q "^OTHER=keepme$" "$CASE_DIR/install/.env"

# Case 2: health failure restores the old tag.
setup_case; write_manifest "1.0.0-abc" "deadbeef"
printf 'KAINBAIN_FRONTEND_TAG=oldtag\n' >> "$CASE_DIR/install/.env"
(cd "$CASE_DIR/install" && CURL_FAIL=1 KAINBAIN_HEALTH_ATTEMPTS=2 KAINBAIN_HEALTH_DELAY=0 ./redeploy.sh --frontend >/dev/null 2>"$CASE_DIR/err")
rc=$?
check "health-fail: exit non-zero" [ "$rc" != "0" ]
check "health-fail: old tag restored" grep -q "^KAINBAIN_FRONTEND_TAG=oldtag$" "$CASE_DIR/install/.env"
check "health-fail: ROLLED BACK reported" grep -q "ROLLED BACK" "$CASE_DIR/err"

# Case 3: --tag pins an older tag for rollback.
setup_case; write_manifest "1.0.0-abc" "deadbeef"
(cd "$CASE_DIR/install" && ./redeploy.sh --frontend --tag 0.9.0-old >/dev/null)
check "--tag: env pinned to requested tag" grep -q "^KAINBAIN_FRONTEND_TAG=0.9.0-old$" "$CASE_DIR/install/.env"

# Case 4: checksum mismatch changes nothing.
setup_case
mkdir -p "$CASE_DIR/pkg/runner" && echo x > "$CASE_DIR/pkg/runner/main.js" && cp "$CASE_DIR/install/startRunner.sh" "$CASE_DIR/pkg/"
tar -czf "$CASE_DIR/install/kainbain-runner-abc.tar.gz" -C "$CASE_DIR/pkg" runner startRunner.sh
write_manifest "1.0.0-abc" "0000000000000000000000000000000000000000000000000000000000000000"
echo sentinel > "$CASE_DIR/install/runner/main.js"
(cd "$CASE_DIR/install" && ./redeploy.sh --runner >/dev/null 2>"$CASE_DIR/err"); rc=$?
check "checksum: exit non-zero" [ "$rc" != "0" ]
check "checksum: runner tree untouched" grep -q sentinel "$CASE_DIR/install/runner/main.js"
check "checksum: no restart" bash -c "! grep -q startRunner '$SHIM_LOG'"

# Case 5: matching checksum replaces the runner tree and restarts.
setup_case
mkdir -p "$CASE_DIR/pkg/runner" && echo new > "$CASE_DIR/pkg/runner/main.js" && cp "$CASE_DIR/install/startRunner.sh" "$CASE_DIR/pkg/"
tar -czf "$CASE_DIR/install/kainbain-runner-abc.tar.gz" -C "$CASE_DIR/pkg" runner startRunner.sh
SHA="$(sha256sum "$CASE_DIR/install/kainbain-runner-abc.tar.gz" | awk '{print $1}')"
write_manifest "1.0.0-abc" "$SHA"
echo old > "$CASE_DIR/install/runner/main.js"
(cd "$CASE_DIR/install" && ./redeploy.sh --runner >/dev/null)
check "runner: tree replaced" grep -q new "$CASE_DIR/install/runner/main.js"
check "runner: backup kept" test -f "$CASE_DIR/install/runner.prev/main.js"
check "runner: restarted" grep -q "startRunner --restart" "$SHIM_LOG"

# Case 6: --init twice is a no-op the second time.
setup_case
(cd "$CASE_DIR/install" && ./redeploy.sh --init >/dev/null && cp .env /tmp/init1.env && cp release-manifest.json /tmp/init1.json && ./redeploy.sh --init >/dev/null)
check "init: env idempotent" diff -q /tmp/init1.env "$CASE_DIR/install/.env"
check "init: manifest idempotent" diff -q /tmp/init1.json "$CASE_DIR/install/release-manifest.json"
check "init: per-component tags added" grep -q "^KAINBAIN_BACKEND_TAG=" "$CASE_DIR/install/.env"

# Case 7: --check warns (no checker) and exits 0; --dry-run mutates nothing.
setup_case; write_manifest "1.0.0-abc" "deadbeef"
(cd "$CASE_DIR/install" && ./redeploy.sh --check >/dev/null 2>"$CASE_DIR/err"); rc=$?
check "check: exit 0 without checker" [ "$rc" = "0" ]
check "check: warns loudly" grep -q "WARN: compat check skipped" "$CASE_DIR/err"
cp "$CASE_DIR/install/.env" /tmp/pre-dry.env
(cd "$CASE_DIR/install" && ./redeploy.sh --frontend --dry-run >/dev/null)
check "dry-run: env unchanged" diff -q /tmp/pre-dry.env "$CASE_DIR/install/.env"

[ "$FAIL" = "0" ] && echo "redeploy.test.sh: ALL PASS" || echo "redeploy.test.sh: FAILURES"
exit "$FAIL"
