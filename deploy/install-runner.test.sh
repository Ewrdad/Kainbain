#!/usr/bin/env bash
# Shim-driven tests for deploy/install-runner.sh. Fake curl on PATH.
#   bash deploy/install-runner.test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
FAIL=0
check() { local desc="$1"; shift; if "$@"; then echo "ok - $desc"; else echo "FAIL - $desc"; FAIL=1; fi; }
setup_case() {
  CASE_DIR="$(mktemp -d)"; mkdir -p "$CASE_DIR/bin" "$CASE_DIR/src"
  cat > "$CASE_DIR/bin/curl" <<'SHIM'
#!/usr/bin/env bash
echo "curl $*" >> "$SHIM_LOG"
out=""; prev=""; for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
case "$*" in *release-manifest.json*) cat "$CASE_DIR/manifest.json" > "$out" ;;
  *kainbain-runner-*) echo fake-tarball > "$out" ;; esac
exit 0
SHIM
  chmod +x "$CASE_DIR/bin/curl"
  SHA_OF_TAR="$(printf 'fake-tarball\n' | sha256sum | awk '{print $1}')"
  cat > "$CASE_DIR/manifest.json" <<JSON
{"commit":"abc","components":{"runner":{"artifact":"kainbain-runner-abc.tar.gz","sha256":"$SHA_OF_TAR","requiresBackendApi":">=1.0.0 <2.0.0"}}}
JSON
  export SHIM_LOG="$CASE_DIR/calls.log" CASE_DIR; : > "$SHIM_LOG"
  export PATH="$CASE_DIR/bin:$PATH" HOME="$CASE_DIR/home"; mkdir -p "$HOME"
}
# 1. Help lists the runner-installer flags.
bash deploy/install-runner.sh --help > /tmp/ir-help.txt 2>&1
for f in --install-dir --id --harness --harnesses --manual --auto --backend --release-url --manifest-url --credential --dry-run --force; do
  check "help: $f documented" grep -q -- "$f" /tmp/ir-help.txt
done
# 2. Unknown arg exits 2.
bash deploy/install-runner.sh --bogus >/dev/null 2>&1; check "usage: unknown arg exit 2" test "$?" = 2
# 3. Dry-run prints the plan, writes nothing.
setup_case
bash deploy/install-runner.sh --dry-run --install-dir "$CASE_DIR/app" --id local-pi-9 --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "dry-run: exit 0" test "$rc" = 0
check "dry-run: no install dir created" test ! -e "$CASE_DIR/app"
check "dry-run: plan mentions runner id" grep -q "local-pi-9" "$CASE_DIR/out.txt"
check "dry-run: nothing downloaded" bash -c "! grep -q 'curl.*kainbain-runner' '$SHIM_LOG'"
# 4. Backend normalization: bare hosts gain scheme + default port.
setup_case
bash deploy/install-runner.sh --dry-run --install-dir "$CASE_DIR/app" --id b1 --manifest "$CASE_DIR/manifest.json" --backend 192.168.1.206 > "$CASE_DIR/b1.txt" 2>&1
check "backend: bare IP gains http + :3100" grep -q "backend http://192.168.1.206:3100" "$CASE_DIR/b1.txt"
bash deploy/install-runner.sh --dry-run --install-dir "$CASE_DIR/app" --id b2 --manifest "$CASE_DIR/manifest.json" --backend 192.168.1.206:8080 > "$CASE_DIR/b2.txt" 2>&1
check "backend: host:port gains http only" grep -q "backend http://192.168.1.206:8080" "$CASE_DIR/b2.txt"
bash deploy/install-runner.sh --dry-run --install-dir "$CASE_DIR/app" --id b3 --manifest "$CASE_DIR/manifest.json" --backend https://kainbain.home/custom > "$CASE_DIR/b3.txt" 2>&1
check "backend: port-less URL gains :3100, keeps scheme+path" grep -q "backend https://kainbain.home:3100/custom" "$CASE_DIR/b3.txt"
bash deploy/install-runner.sh --dry-run --install-dir "$CASE_DIR/app" --id b5 --manifest "$CASE_DIR/manifest.json" --backend http://example.com:9000/custom > "$CASE_DIR/b5.txt" 2>&1
check "backend: explicit port+path passes through" grep -q "backend http://example.com:9000/custom" "$CASE_DIR/b5.txt"
bash deploy/install-runner.sh --dry-run --install-dir "$CASE_DIR/app" --id b4 --manifest "$CASE_DIR/manifest.json" > "$CASE_DIR/b4.txt" 2>&1
check "backend: default stays localhost:3100" grep -q "backend http://localhost:3100" "$CASE_DIR/b4.txt"
[ "$FAIL" = 0 ] && echo "install-runner.test.sh: ALL PASS" || echo "install-runner.test.sh: FAILURES"
exit $FAIL
