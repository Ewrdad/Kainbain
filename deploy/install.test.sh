#!/usr/bin/env bash
# Shim-driven tests for deploy/install.sh. Fake docker/curl on PATH.
#   bash deploy/install.test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
check() { local desc="$1"; shift; if "$@"; then echo "ok - $desc"; else echo "FAIL - $desc"; FAIL=1; fi; }
setup_case() {
  CASE_DIR="$(mktemp -d)"; mkdir -p "$CASE_DIR/bin" "$CASE_DIR/src"
  cat > "$CASE_DIR/bin/docker" <<'SHIM'
#!/usr/bin/env bash
echo "docker $*" >> "$SHIM_LOG"
[ "$1 $2" = "compose version" ] && echo "Docker Compose version v2"
exit 0
SHIM
  cat > "$CASE_DIR/bin/curl" <<'SHIM'
#!/usr/bin/env bash
echo "curl $*" >> "$SHIM_LOG"
out=""; prev=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
case "$*" in *release-manifest.json*) cat "$CASE_DIR/manifest.json" > "$out" ;;
  *kainbain-runner-*) echo fake-tarball > "$out" ;;
  */status) exit 0 ;;
  *) [ -n "$out" ] && echo x > "$out" ;; esac
exit 0
SHIM
  chmod +x "$CASE_DIR/bin/docker" "$CASE_DIR/bin/curl"
  sha="$(printf fake-tarball | sha256sum | awk '{print $1}')"; SHA_OF_TAR="$sha"
  # curl shim writes "fake-tarball\n"; hash that exact payload instead.
  SHA_OF_TAR="$(printf 'fake-tarball\n' | sha256sum | awk '{print $1}')"
  cat > "$CASE_DIR/manifest.json" <<JSON
{"commit":"abc","components":{"backend":{"image":"docker.io/ns/kainbain-backend:1.0.0-abc","tag":"1.0.0-abc"},"frontend":{"image":"docker.io/ns/kainbain-frontend:1.0.0-abc","tag":"1.0.0-abc","requiresBackendApi":">=1.0.0 <2.0.0"},"runner":{"artifact":"kainbain-runner-abc.tar.gz","sha256":"$SHA_OF_TAR","requiresBackendApi":">=1.0.0 <2.0.0"}}}
JSON
  export SHIM_LOG="$CASE_DIR/calls.log" CASE_DIR; : > "$SHIM_LOG"
  export PATH="$CASE_DIR/bin:$PATH" HOME="$CASE_DIR/home"; mkdir -p "$HOME"
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
for f in --install-dir --port --frontend-port --backend-port --runners --harness --namespace --tag --release-url --manifest-url --projects-dir --no-runner --dry-run --force; do
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
check "no-start: compose up never called" bash -c "! grep -q 'compose up' '$SHIM_LOG'"
check "no-start: env is 600" bash -c "[ \"\$(stat -c %a '$CASE_DIR/app/.env')\" = 600 ]"
# 5. Re-run without --force leaves .env untouched.
echo "MARKER=1" >> "$CASE_DIR/app/.env"
bash deploy/install.sh --no-start --skip-pull --runners 0 --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" >/dev/null 2>&1
check "idempotent: marker kept" grep -q "^MARKER=1$" "$CASE_DIR/app/.env"
[ "$FAIL" = 0 ] && echo "install.test.sh: ALL PASS" || echo "install.test.sh: FAILURES"
exit $FAIL
