#!/usr/bin/env bash
# test-fixture.sh — shared temp-dir + stub-PATH harness for deploy/*.test.sh.
# Sourced (never executed): `source deploy/test-fixture.sh` from the repo
# root. Every case gets a fresh CASE_DIR, a fake HOME, and stubbed
# docker/curl/systemctl binaries first on PATH, so install/uninstall flows
# are exercised without touching the host, the network, or systemd.
#
# Usage in a test file:
#   source deploy/test-fixture.sh
#   kb_setup_case            # fresh CASE_DIR/HOME/PATH/SHIM_LOG
#   kb_add_docker_shim       # + kb_add_curl_shim / kb_add_systemctl_shim as needed
#   kb_write_manifest        # $CASE_DIR/manifest.json with a matching tarball sha
#   ... run the script under test ...
#   kb_finish "install.test.sh"
#
# Shell-only helper: `shellcheck deploy/test-fixture.sh` if available.
# shellcheck shell=bash

# --- Result collection (same `check` contract every test file used) -----------
KB_FAIL=0
check() { local desc="$1"; shift; if "$@"; then echo "ok - $desc"; else echo "FAIL - $desc"; KB_FAIL=1; fi; }
kb_finish() {
  local name="${1:-test}"; local fails="${KB_FAIL:-0}"
  # Clean up every case dir minted through kb_setup_case.
  for d in ${KB_CASE_DIRS:-}; do rm -rf "$d"; done
  KB_CASE_DIRS=""
  if [ "$fails" = 0 ]; then echo "$name: ALL PASS"; else echo "$name: FAILURES"; fi
  return "$fails"
}

# --- Case setup ---------------------------------------------------------------
kb_setup_case() {
  CASE_DIR="$(mktemp -d)"; mkdir -p "$CASE_DIR/bin" "$CASE_DIR/home"
  KB_CASE_DIRS="${KB_CASE_DIRS:-} $CASE_DIR"
  export SHIM_LOG="$CASE_DIR/calls.log" CASE_DIR; : > "$SHIM_LOG"
  export PATH="$CASE_DIR/bin:$PATH" HOME="$CASE_DIR/home"
  unset KB_DOCKER_ARGS KB_CURL_ARGS
}

# --- Stubs --------------------------------------------------------------------
kb_add_docker_shim() {
  cat > "$CASE_DIR/bin/docker" <<'SHIM'
#!/usr/bin/env bash
echo "docker $*" >> "$SHIM_LOG"
[ "$1 $2" = "compose version" ] && echo "Docker Compose version v2"
exit 0
SHIM
  chmod +x "$CASE_DIR/bin/docker"
}

# Curl stub: serves $CASE_DIR/manifest.json for release-manifest.json
# fetches, a fixed tarball payload for runner artifacts, success for
# /status probes, and records every invocation in $SHIM_LOG. Backend API
# POSTs (adoption) succeed and are logged for assertion.
kb_add_curl_shim() {
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
  chmod +x "$CASE_DIR/bin/curl"
}

# Systemctl stub: records user-unit operations; --user daemon-reload and
# enable/start/stop/disable/is-active all succeed silently.
kb_add_systemctl_shim() {
  cat > "$CASE_DIR/bin/systemctl" <<'SHIM'
#!/usr/bin/env bash
echo "systemctl $*" >> "$SHIM_LOG"
exit 0
SHIM
  chmod +x "$CASE_DIR/bin/systemctl"
}

# --- Manifest -----------------------------------------------------------------
# Writes $CASE_DIR/manifest.json whose runner sha256 matches the curl
# stub's tarball payload (the stub writes "fake-tarball\n").
kb_write_manifest() {
  local sha
  sha="$(printf 'fake-tarball\n' | sha256sum | awk '{print $1}')"
  export SHA_OF_TAR="$sha"
  cat > "$CASE_DIR/manifest.json" <<JSON
{"commit":"abc","components":{"backend":{"image":"docker.io/ns/kainbain-backend:1.0.0-abc","tag":"1.0.0-abc"},"frontend":{"image":"docker.io/ns/kainbain-frontend:1.0.0-abc","tag":"1.0.0-abc","requiresBackendApi":">=1.0.0 <2.0.0"},"runner":{"artifact":"kainbain-runner-abc.tar.gz","sha256":"$SHA_OF_TAR","requiresBackendApi":">=1.0.0 <2.0.0"}}}
JSON
}
