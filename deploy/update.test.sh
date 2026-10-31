#!/usr/bin/env bash
# Shim-driven tests for deploy/update.sh. Fake redeploy.sh records calls.
#   bash deploy/update.test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
check() { local desc="$1"; shift; if "$@"; then echo "ok - $desc"; else echo "FAIL - $desc"; FAIL=1; fi; }
setup_case() {
  CASE_DIR="$(mktemp -d)"; mkdir -p "$CASE_DIR/install" "$CASE_DIR/dist"
  cat > "$CASE_DIR/install/redeploy.sh" <<'SHIM'
#!/usr/bin/env bash
echo "redeploy $*" >> "$SHIM_LOG"; exit "${REDEPLOY_FAIL:-0}"
SHIM
  chmod +x "$CASE_DIR/install/redeploy.sh"
  cp deploy/update.sh "$CASE_DIR/install/"; chmod +x "$CASE_DIR/install/update.sh"
  export SHIM_LOG="$CASE_DIR/calls.log"; : > "$SHIM_LOG"
  cat > "$CASE_DIR/install/release-manifest.json" <<'JSON'
{"commit":"old","components":{"backend":{"tag":"1.0.0-old"},"frontend":{"tag":"1.0.0-old"},"runner":{"artifact":"kainbain-runner-old.tar.gz","sha256":"aaa"}}}
JSON
  cat > "$CASE_DIR/dist/release-manifest.json" <<'JSON'
{"commit":"new","components":{"backend":{"tag":"1.0.0-old"},"frontend":{"tag":"1.0.0-new"},"runner":{"artifact":"kainbain-runner-old.tar.gz","sha256":"aaa"}}}
JSON
}
# 1. Only frontend changed -> only --frontend redeployed, manifest installed.
setup_case
(cd "$CASE_DIR/install" && ./update.sh --dist-dir "$CASE_DIR/dist" >/dev/null); rc=$?
check "asymmetric: exit 0" test "$rc" = 0
check "asymmetric: frontend redeployed" grep -q "redeploy --frontend" "$SHIM_LOG"
check "asymmetric: backend untouched" bash -c "! grep -q 'redeploy --backend' '$SHIM_LOG'"
check "asymmetric: runner untouched" bash -c "! grep -q 'redeploy --runner' '$SHIM_LOG'"
check "asymmetric: manifest updated" grep -q '"commit":"new"' "$CASE_DIR/install/release-manifest.json"
# 2. --check exits 3 and changes nothing.
setup_case
(cd "$CASE_DIR/install" && ./update.sh --check --dist-dir "$CASE_DIR/dist" >/dev/null); rc=$?
check "check: exit 3" test "$rc" = 3
check "check: redeploy never called" test ! -s "$SHIM_LOG"
check "check: manifest untouched" grep -q '"commit":"old"' "$CASE_DIR/install/release-manifest.json"
# 3. Already current exits 0.
setup_case; cp "$CASE_DIR/dist/release-manifest.json" "$CASE_DIR/install/release-manifest.json"
(cd "$CASE_DIR/install" && ./update.sh --dist-dir "$CASE_DIR/dist" >/dev/null); rc=$?
check "current: exit 0" test "$rc" = 0
check "current: redeploy never called" test ! -s "$SHIM_LOG"
# 4. Dry-run changes nothing.
setup_case
(cd "$CASE_DIR/install" && ./update.sh --dry-run --dist-dir "$CASE_DIR/dist" >/dev/null); rc=$?
check "dry-run: exit 0" test "$rc" = 0
check "dry-run: manifest untouched" grep -q '"commit":"old"' "$CASE_DIR/install/release-manifest.json"
# 5. Runner-only change stages tarball from dist.
setup_case
cat > "$CASE_DIR/dist/release-manifest.json" <<'JSON'
{"commit":"new2","components":{"backend":{"tag":"1.0.0-old"},"frontend":{"tag":"1.0.0-old"},"runner":{"artifact":"kainbain-runner-new.tar.gz","sha256":"bbb"}}}
JSON
echo tarball > "$CASE_DIR/dist/kainbain-runner-new.tar.gz"
(cd "$CASE_DIR/install" && ./update.sh --dist-dir "$CASE_DIR/dist" >/dev/null); rc=$?
check "runner: exit 0" test "$rc" = 0
check "runner: only runner redeployed" bash -c "grep -q 'redeploy --runner' '$SHIM_LOG' && ! grep -q 'redeploy --frontend' '$SHIM_LOG'"
check "runner: tarball staged" test -f "$CASE_DIR/install/kainbain-runner-new.tar.gz"

# 6. Component absent from the published manifest is unchanged, not an update.
setup_case
cat > "$CASE_DIR/dist/release-manifest.json" <<'JSON'
{"commit":"new3","components":{"backend":{"tag":"1.0.0-new"}}}
JSON
(cd "$CASE_DIR/install" && ./update.sh --dist-dir "$CASE_DIR/dist" >/dev/null); rc=$?
check "absent: exit 0" test "$rc" = 0
check "absent: only backend redeployed" bash -c "grep -q 'redeploy --backend' '$SHIM_LOG' && ! grep -q 'redeploy --frontend' '$SHIM_LOG' && ! grep -q 'redeploy --runner' '$SHIM_LOG'"
[ "$FAIL" = 0 ] && echo "update.test.sh: ALL PASS" || echo "update.test.sh: FAILURES"
exit $FAIL
