#!/usr/bin/env bash
# Shim-driven tests for deploy/uninstall.sh. Fake HOME + stubbed
# docker/systemctl on PATH; nothing touches the host, network, or systemd.
#   bash deploy/uninstall.test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=test-fixture.sh
source deploy/test-fixture.sh

# Builds a fake install at $CASE_DIR/app with the bookkeeping install.sh
# writes, state dirs with markers, one owned Runner unit (+ env/credential),
# one foreign unit (another install), the shared join token, and an external
# state dir wired through .env. The unit file uses startRunner.sh's exact
# WorkingDirectory=/EnvironmentFile= line shapes.
setup_install() {
  kb_setup_case
  kb_add_docker_shim
  kb_add_systemctl_shim
  kb_write_manifest
  APP="$CASE_DIR/app"
  mkdir -p "$APP/runner" "$APP/projects" "$APP/data" "$APP/notes" "$CASE_DIR/external-repos"
  touch "$APP/docker-compose.yml" "$APP/release-manifest.json" "$APP/update.sh" "$APP/redeploy.sh" "$APP/startRunner.sh" "$APP/kainbain-runner-abc.tar.gz"
  printf 'KAINBAIN_PORT=3100\nKAINBAIN_PROJECTS_HOST=%s\nKAINBAIN_STATE_HOST=%s\nKAINBAIN_NOTES_HOST=%s\n' \
    "$CASE_DIR/external-repos" "$APP/data" "$APP/notes" > "$APP/.env"
  echo keep > "$APP/projects/marker.txt"; echo keep > "$APP/data/marker.txt"; echo keep > "$APP/notes/marker.txt"
  echo keep > "$CASE_DIR/external-repos/marker.txt"
  mkdir -p "$HOME/.kainbain" "$HOME/.config/systemd/user"
  printf '%s' "join-token" > "$HOME/.kainbain/runner-join.token"
  cat > "$HOME/.config/systemd/user/kainbain-runner-pi.service" <<EOF
[Unit]
Description=KainBain Runner local-pi
[Service]
Type=simple
WorkingDirectory=$APP/runner/runner
EnvironmentFile=$HOME/.kainbain/runner-pi.env
ExecStart=/usr/bin/node main.js
Restart=always
[Install]
WantedBy=default.target
EOF
  echo "KAINBAIN_RUNNER_ID=local-pi" > "$HOME/.kainbain/runner-pi.env"
  echo "credential-bytes" > "$HOME/.kainbain/runner-pi.credential"
  cat > "$HOME/.config/systemd/user/kainbain-runner-other.service" <<EOF
[Unit]
Description=KainBain Runner other
[Service]
WorkingDirectory=/elsewhere/runner/runner
EnvironmentFile=$HOME/.kainbain/runner-other.env
ExecStart=/usr/bin/node main.js
EOF
  echo "KAINBAIN_RUNNER_ID=other" > "$HOME/.kainbain/runner-other.env"
}

# 1. Help lists every flag; unknown args exit 2.
setup_install
bash deploy/uninstall.sh --help > "$CASE_DIR/help.txt" 2>&1
for f in --install-dir --images --purge --yes --all-runners --dry-run; do
  check "help: $f documented" grep -q -- "$f" "$CASE_DIR/help.txt"
done
bash deploy/uninstall.sh --bogus >/dev/null 2>&1; check "usage: unknown arg exit 2" test "$?" = 2
bash deploy/uninstall.sh --install-dir / >/dev/null 2>&1; check "usage: refusing / exit 2" test "$?" = 2

# 2. Dry-run plans every action and changes nothing.
setup_install
bash deploy/uninstall.sh --dry-run --install-dir "$APP" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "dry-run: exit 0" test "$rc" = 0
check "dry-run: plans stack down" grep -q "would run: docker compose down" "$CASE_DIR/out.txt"
check "dry-run: plans unit disable" grep -q "would run: systemctl --user disable --now kainbain-runner-pi.service" "$CASE_DIR/out.txt"
check "dry-run: plans daemon-reload" grep -q "would run: systemctl --user daemon-reload" "$CASE_DIR/out.txt"
check "dry-run: plans unit removal" grep -q "would remove: .*/kainbain-runner-pi.service" "$CASE_DIR/out.txt"
check "dry-run: plans env removal" grep -q "would remove: .*/runner-pi.env" "$CASE_DIR/out.txt"
check "dry-run: plans credential removal" grep -q "would remove: .*/runner-pi.credential" "$CASE_DIR/out.txt"
check "dry-run: keeps foreign unit" grep -q "keeping unit for another install" "$CASE_DIR/out.txt"
check "dry-run: keeps state" grep -q "keeping user state" "$CASE_DIR/out.txt"
check "dry-run: unit still there" test -f "$HOME/.config/systemd/user/kainbain-runner-pi.service"
check "dry-run: env still there" test -f "$HOME/.kainbain/runner-pi.env"
check "dry-run: compose still there" test -f "$APP/docker-compose.yml"
check "dry-run: no docker calls" bash -c "! grep -q '^docker ' '$SHIM_LOG'"
check "dry-run: no systemctl calls" bash -c "! grep -q '^systemctl ' '$SHIM_LOG'"

# 3. Default uninstall removes the stack, owned units, and bookkeeping; keeps state.
setup_install
bash deploy/uninstall.sh --install-dir "$APP" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "default: exit 0" test "$rc" = 0
check "default: compose down called" grep -q "docker compose down$" "$SHIM_LOG"
check "default: rmi not passed" bash -c "! grep -q -- '--rmi' '$SHIM_LOG'"
check "default: unit disabled" grep -q "systemctl --user disable --now kainbain-runner-pi.service" "$SHIM_LOG"
check "default: daemon reloaded" grep -q "systemctl --user daemon-reload" "$SHIM_LOG"
check "default: unit gone" test ! -e "$HOME/.config/systemd/user/kainbain-runner-pi.service"
check "default: env gone" test ! -e "$HOME/.kainbain/runner-pi.env"
check "default: credential gone" test ! -e "$HOME/.kainbain/runner-pi.credential"
check "default: foreign unit kept" test -f "$HOME/.config/systemd/user/kainbain-runner-other.service"
check "default: foreign env kept" test -f "$HOME/.kainbain/runner-other.env"
check "default: compose gone" test ! -e "$APP/docker-compose.yml"
check "default: .env gone" test ! -e "$APP/.env"
check "default: manifest gone" test ! -e "$APP/release-manifest.json"
check "default: helpers gone" bash -c "[ ! -e '$APP/update.sh' ] && [ ! -e '$APP/redeploy.sh' ] && [ ! -e '$APP/startRunner.sh' ]"
check "default: runner dir gone" test ! -e "$APP/runner"
check "default: tarball gone" bash -c "[ -z \"\$(ls '$APP'/kainbain-runner-*.tar.gz 2>/dev/null)\" ]"
check "default: projects kept" test -f "$APP/projects/marker.txt"
check "default: data kept" test -f "$APP/data/marker.txt"
check "default: notes kept" test -f "$APP/notes/marker.txt"
check "default: external state kept" test -f "$CASE_DIR/external-repos/marker.txt"
check "default: join token kept" test -f "$HOME/.kainbain/runner-join.token"
check "default: install dir kept" test -d "$APP"

# 4. --images removes the pulled images too.
setup_install
bash deploy/uninstall.sh --images --install-dir "$APP" >/dev/null 2>&1
check "images: rmi passed" grep -q "docker compose down --rmi all" "$SHIM_LOG"

# 5. --purge without --yes refuses and deletes nothing.
setup_install
bash deploy/uninstall.sh --purge --install-dir "$APP" < /dev/null > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "purge: exit non-zero without --yes" test "$rc" != 0
check "purge: says nothing removed" grep -q "Nothing removed" "$CASE_DIR/out.txt"
check "purge: compose still there" test -f "$APP/docker-compose.yml"
check "purge: unit still there" test -f "$HOME/.config/systemd/user/kainbain-runner-pi.service"
check "purge: state still there" test -f "$APP/data/marker.txt"
check "purge: no docker calls" bash -c "! grep -q '^docker ' '$SHIM_LOG'"

# 6. --purge --yes deletes the whole install dir and the token; external state survives.
setup_install
bash deploy/uninstall.sh --purge --yes --install-dir "$APP" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "purge-yes: exit 0" test "$rc" = 0
check "purge-yes: install dir gone" test ! -e "$APP"
check "purge-yes: token gone" test ! -e "$HOME/.kainbain/runner-join.token"
check "purge-yes: external state kept" test -f "$CASE_DIR/external-repos/marker.txt"
check "purge-yes: names the kept external dir" grep -q "keeping external state dir" "$CASE_DIR/out.txt"
check "purge-yes: foreign unit kept" test -f "$HOME/.config/systemd/user/kainbain-runner-other.service"

# 7. --purge refuses a directory with no install markers.
setup_install
mkdir -p "$CASE_DIR/not-an-install" && echo precious > "$CASE_DIR/not-an-install/file.txt"
bash deploy/uninstall.sh --purge --yes --install-dir "$CASE_DIR/not-an-install" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "purge-guard: exit non-zero" test "$rc" != 0
check "purge-guard: dir untouched" test -f "$CASE_DIR/not-an-install/file.txt"

# 7b. --purge refuses a directory holding only ONE marker (e.g. a source
# checkout with just docker-compose.yml) — compose plus .env/manifest required.
setup_install
mkdir -p "$CASE_DIR/half-install" && touch "$CASE_DIR/half-install/docker-compose.yml" && echo precious > "$CASE_DIR/half-install/file.txt"
bash deploy/uninstall.sh --purge --yes --install-dir "$CASE_DIR/half-install" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "purge-guard: single marker not enough" test "$rc" != 0
check "purge-guard: half-install untouched" test -f "$CASE_DIR/half-install/file.txt"

# 7c. Fail-safe path guards: home itself, a trailing-slash spelling of it,
# and any ancestor of home are refused before anything destructive runs.
setup_install
bash deploy/uninstall.sh --install-dir "$HOME" >/dev/null 2>&1; check "guard: \$HOME refused exit 2" test "$?" = 2
bash deploy/uninstall.sh --purge --yes --install-dir "$HOME/" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "guard: trailing-slash \$HOME/ refused exit 2" test "$rc" = 2
check "guard: \$HOME/ message" grep -q "refusing to uninstall" "$CASE_DIR/out.txt"
check "guard: home contents intact" test -f "$HOME/.kainbain/runner-join.token"
mkdir -p "$CASE_DIR/precious" && echo precious > "$CASE_DIR/precious/file.txt"
bash deploy/uninstall.sh --purge --yes --install-dir "$CASE_DIR" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "guard: ancestor of \$HOME refused exit 2" test "$rc" = 2
check "guard: ancestor message" grep -q "contains the home directory" "$CASE_DIR/out.txt"
check "guard: ancestor dir intact" test -f "$CASE_DIR/precious/file.txt"
# A symlink to home is resolved before the guard fires.
ln -s "$HOME" "$CASE_DIR/home-link"
bash deploy/uninstall.sh --purge --yes --install-dir "$CASE_DIR/home-link" >/dev/null 2>&1; rc=$?
check "guard: symlink to \$HOME refused" test "$rc" = 2
check "guard: symlink target intact" test -f "$HOME/.kainbain/runner-join.token"

# 7d. A trailing slash on a normal install dir is normalized, not a bypass.
setup_install
bash deploy/uninstall.sh --dry-run --install-dir "$APP/" > "$CASE_DIR/out.txt" 2>&1; rc=$?
APP_REAL="$(cd "$APP" && pwd -P)"
check "normalize: trailing slash dry-run exit 0" test "$rc" = 0
check "normalize: plans the real path" grep -q "would remove: $APP_REAL/docker-compose.yml" "$CASE_DIR/out.txt"
check "normalize: still nothing deleted" test -f "$APP/docker-compose.yml"

# 8. --all-runners also removes foreign units and orphaned env/credential files.
setup_install
echo orphan > "$HOME/.kainbain/runner-ghost.env"
bash deploy/uninstall.sh --all-runners --install-dir "$APP" >/dev/null 2>&1; rc=$?
check "all-runners: exit 0" test "$rc" = 0
check "all-runners: foreign unit gone" test ! -e "$HOME/.config/systemd/user/kainbain-runner-other.service"
check "all-runners: foreign env gone" test ! -e "$HOME/.kainbain/runner-other.env"
check "all-runners: orphan env gone" test ! -e "$HOME/.kainbain/runner-ghost.env"
check "all-runners: token still kept" test -f "$HOME/.kainbain/runner-join.token"

# 9. Naming parity with the sources of truth: the unit glob, the
# EnvironmentFile derivation, and the .credential sibling must match
# startRunner.sh and runner/credentialFile.js.
check "parity: unit glob matches startRunner.sh" bash -c "grep -q 'kainbain-runner-\*.service' startRunner.sh && grep -q 'kainbain-runner-\*.service' deploy/uninstall.sh"
check "parity: attribution via WorkingDirectory" grep -q "WorkingDirectory=\$INSTALL_DIR/runner/runner" deploy/uninstall.sh
check "parity: env via EnvironmentFile" grep -q "EnvironmentFile=" deploy/uninstall.sh
check "parity: credential sibling matches credentialFile.js" bash -c "grep -q 'runner-.*\.credential' runner/credentialFile.js && grep -q '\.credential' deploy/uninstall.sh"

# 10. Round-trip: a real (shimmed) install is fully removed by --purge --yes.
kb_setup_case
kb_add_docker_shim
kb_add_curl_shim
kb_add_systemctl_shim
kb_write_manifest
bash deploy/install.sh --no-start --skip-pull --runners 0 --install-dir "$CASE_DIR/app" --manifest "$CASE_DIR/manifest.json" >/dev/null 2>&1; rc=$?
check "round-trip: install exit 0" test "$rc" = 0
check "round-trip: install wrote compose" test -f "$CASE_DIR/app/docker-compose.yml"
bash deploy/uninstall.sh --purge --yes --install-dir "$CASE_DIR/app" > "$CASE_DIR/out.txt" 2>&1; rc=$?
check "round-trip: uninstall exit 0" test "$rc" = 0
check "round-trip: install dir gone" test ! -e "$CASE_DIR/app"
check "round-trip: token gone" test ! -e "$CASE_DIR/home/.kainbain/runner-join.token"

kb_finish "uninstall.test.sh"
