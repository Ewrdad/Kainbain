#!/usr/bin/env bash
# Shim-driven tests for deploy/homelab-pull.sh: fake redeploy.sh records
# invocations; no network, docker, or scp is touched.
#   bash deploy/homelab-pull.test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
check() { # description condition...
  local desc="$1"; shift
  if "$@"; then echo "ok - $desc"; else echo "FAIL - $desc"; FAIL=1; fi
}

setup_case() { # installed-commit -> sets CASE_DIR, SRC manifest commit always "new456"
  CASE_DIR="$(mktemp -d)"
  mkdir -p "$CASE_DIR/install" "$CASE_DIR/src"
  cat > "$CASE_DIR/install/redeploy.sh" <<'SHIM'
#!/usr/bin/env bash
echo "redeploy $*" >> "$SHIM_LOG"
SHIM
  chmod +x "$CASE_DIR/install/redeploy.sh"
  cat > "$CASE_DIR/install/release-manifest.json" <<JSON
{ "publishedAt": "2026-01-01T00:00:00Z", "commit": "$1",
  "components": {
    "backend":  { "apiVersion": "1.0.0", "image": "docker.io/ns/kainbain-backend:1.0.0-old", "tag": "1.0.0-old" },
    "frontend": { "apiVersion": "1.0.0", "image": "docker.io/ns/kainbain-frontend:1.0.0-old", "tag": "1.0.0-old", "requiresBackendApi": ">=1.0.0 <2.0.0" } } }
JSON
  cat > "$CASE_DIR/src/release-manifest.json" <<JSON
{ "publishedAt": "2026-01-02T00:00:00Z", "commit": "new456",
  "components": {
    "backend":  { "apiVersion": "1.0.0", "image": "docker.io/ns/kainbain-backend:1.0.0-new", "tag": "1.0.0-new" },
    "frontend": { "apiVersion": "1.0.0", "image": "docker.io/ns/kainbain-frontend:1.0.0-new", "tag": "1.0.0-new", "requiresBackendApi": ">=1.0.0 <2.0.0" } } }
JSON
  export SHIM_LOG="$CASE_DIR/calls.log"; : > "$SHIM_LOG"
}

# Case 1: same commit -> already current, redeploy never runs.
setup_case "new456"
./deploy/homelab-pull.sh --manifest "$CASE_DIR/src/release-manifest.json" --dir "$CASE_DIR/install" >/dev/null
check "current: exit 0" test $? -eq 0
check "current: redeploy never called" bash -c "! grep -q redeploy '$SHIM_LOG'"

# Case 2: new commit -> manifest installed, redeploy --all runs.
setup_case "old123"
./deploy/homelab-pull.sh --manifest "$CASE_DIR/src/release-manifest.json" --dir "$CASE_DIR/install" >/dev/null
check "update: exit 0" test $? -eq 0
check "update: redeploy --all called" grep -q "redeploy --all" "$SHIM_LOG"
check "update: manifest installed" grep -q '"commit": "new456"' "$CASE_DIR/install/release-manifest.json"

# Case 3: --dry-run changes nothing.
setup_case "old123"
./deploy/homelab-pull.sh --manifest "$CASE_DIR/src/release-manifest.json" --dir "$CASE_DIR/install" --dry-run >/dev/null
check "dry-run: exit 0" test $? -eq 0
check "dry-run: manifest untouched" grep -q '"commit": "old123"' "$CASE_DIR/install/release-manifest.json"
check "dry-run: redeploy never called" bash -c "! grep -q '^redeploy ' '$SHIM_LOG'"

# Case 4: --check reports behind without changing anything.
setup_case "old123"
./deploy/homelab-pull.sh --manifest "$CASE_DIR/src/release-manifest.json" --dir "$CASE_DIR/install" --check >/dev/null
check "check: exit 3 when behind" test $? -eq 3
check "check: redeploy never called" bash -c "! grep -q '^redeploy ' '$SHIM_LOG'"

if [ "$FAIL" = "0" ]; then echo "homelab-pull tests: all passed"; else echo "homelab-pull tests: FAILURES"; fi
exit "$FAIL"
