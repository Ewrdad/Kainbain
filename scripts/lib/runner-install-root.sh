# Shared helper for wrapper-based Runner installs (sourced, not executed).
# Lays a release-layout tree down from a source checkout into a versioned
# install root and refreshes the stable wrapper shim. Both installers
# (scripts/install-local-runner.sh, startRunner.sh) and the migration flow
# build the same layout through this one function, so new installs and
# migrated installs cannot drift apart.
#
# Usage from an installer:
#   . "$LIB_DIR/runner-install-root.sh"
#   VERSION="$(lay_down_runner_install_root "$TREE_ROOT" "$INSTALL_ROOT")"

# Copies a release-layout tree (runner/, api/, shared/, version.json) from
# a source checkout ($1) into $2/releases/<version>/unpacked, installs the
# stable wrapper shim at $2/bin/kainbain-runner, and points $2/current at
# the new tree when current does not exist yet (a host shared by several
# runners keeps its existing current — self-update advances it on idle).
# Prints the laid-down version. Fails without touching the unit files when
# the source tree has no runnable runner (callers lay down BEFORE writing
# units, so a bad tree aborts the install instead of stranding a unit).
lay_down_runner_install_root() {
	_tree="$1"
	_root="$2"
	if [ ! -f "$_tree/runner/main.js" ]; then
		echo "runner-install-root.sh: no runner/main.js under source tree $_tree" >&2
		return 1
	fi
	if [ ! -f "$_tree/runner/bin/kainbain-runner" ]; then
		echo "runner-install-root.sh: no runner/bin/kainbain-runner under source tree $_tree" >&2
		return 1
	fi
	_ver="$(node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).runnerVersion;if(typeof v!=="string"||!v)process.exit(1);console.log(v);' "$_tree/runner/version.json")" || {
		echo "runner-install-root.sh: cannot read runnerVersion from $_tree/runner/version.json" >&2
		return 1
	}
	_unpacked="$_root/releases/$_ver/unpacked"
	mkdir -p "$_unpacked" "$_root/bin"
	cp -a "$_tree/runner/." "$_unpacked/runner/"
	if [ -d "$_tree/api" ]; then cp -a "$_tree/api/." "$_unpacked/api/"; fi
	if [ -d "$_tree/shared" ]; then cp -a "$_tree/shared/." "$_unpacked/shared/"; fi
	cp -a "$_tree/runner/version.json" "$_unpacked/version.json"
	cp -a "$_tree/runner/bin/kainbain-runner" "$_root/bin/kainbain-runner"
	chmod +x "$_root/bin/kainbain-runner"
	if [ ! -e "$_root/current" ] && [ ! -L "$_root/current" ]; then
		ln -s "$_unpacked" "$_root/current"
	fi
	printf '%s' "$_ver"
}
