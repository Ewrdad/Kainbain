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
# The optional third arg overrides the staging dir (tests only); it is
# removed again on failure, so pass a scratch path you own.

# Copies a release-layout tree (runner/, api/, shared/, version.json) from
# a source checkout ($1) into $2/releases/<version>/unpacked, installs the
# stable wrapper shim at $2/bin/kainbain-runner, and points $2/current at
# the new tree when current does not exist yet (a host shared by several
# runners keeps its existing current — self-update advances it on idle).
# Prints the laid-down version.
#
# Transfer/continuation safety (the WP-F silent-old-boot class):
#   * The tree is copied into a STAGING dir next to the target and only
#     swapped into place (rename) after post-copy asserts pass, so `current`
#     never points at a partial tree and a failed re-lay leaves the
#     previously laid-down tree bootable (the old dir is restored if the
#     final rename fails).
#   * A re-lay of the same version replaces the tree wholesale — no stale
#     files from an earlier lay-down survive in unpacked/.
#   * Every mutating command is guarded, so the function fails cleanly with
#     or without `set -e` in the caller: it prints the failing path to
#     stderr, removes the staging dir, and returns 1 BEFORE any unit file
#     is written (callers lay down BEFORE writing units, so a bad tree
#     aborts the install instead of stranding a unit).
#   * runnerVersion is validated as a safe path component (no '/', '..'),
#     because it becomes part of the releases/<version>/ path.
# The pi discovery dependency is warn-only, not fatal: hosts that never
# serve the pi harness run fine without it, but a pi-serving runner laid
# down from a tree without api/node_modules will report LEG_MODULE_MISSING
# until it is reinstalled from a real bundle (scripts/package-runner.sh).
lay_down_runner_install_root() {
	_ld_tree="${1:-}"
	_ld_root="${2:-}"
	_ld_stage="${3:-}"
	if [ -z "$_ld_tree" ] || [ -z "$_ld_root" ]; then
		echo "runner-install-root.sh: usage: lay_down_runner_install_root <source-tree> <install-root> [staging-dir]" >&2
		return 1
	fi
	if [ ! -f "$_ld_tree/runner/main.js" ]; then
		echo "runner-install-root.sh: no runner/main.js under source tree $_ld_tree" >&2
		return 1
	fi
	if [ ! -f "$_ld_tree/runner/bin/kainbain-runner" ]; then
		echo "runner-install-root.sh: no runner/bin/kainbain-runner under source tree $_ld_tree" >&2
		return 1
	fi
	_ld_ver="$(node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).runnerVersion;if(typeof v!=="string"||!v)process.exit(1);console.log(v);' "$_ld_tree/runner/version.json")" || {
		echo "runner-install-root.sh: cannot read runnerVersion from $_ld_tree/runner/version.json" >&2
		return 1
	}
	case "$_ld_ver" in
		""|"."|".."|*[!A-Za-z0-9._-]*)
			echo "runner-install-root.sh: refusing unsafe runnerVersion '$_ld_ver' in $_ld_tree/runner/version.json (allowed: letters, digits, '.', '_', '-'; it becomes releases/<version>/...)" >&2
			return 1
			;;
	esac
	_ld_unpacked="$_ld_root/releases/$_ld_ver/unpacked"
	_ld_old="$_ld_unpacked.old.$$"
	if [ -z "$_ld_stage" ]; then
		_ld_stage="$_ld_unpacked.incoming.$$"
	fi
	_ld_shim="$_ld_root/bin/.kainbain-runner.incoming.$$"
	# Clean slate for the staging dir: it must not exist, so a leftover from
	# a crashed earlier run can never mix into this lay-down. The staging dir
	# is created FIRST and alone, so a staging failure leaves nothing behind;
	# the release dir (releases/<version>/) and bin/ follow only once staging
	# exists, so the final rename has its parent even when the staging dir
	# lives elsewhere (test override).
	rm -rf "$_ld_stage"
	if ! mkdir -p "$_ld_stage/runner"; then
		echo "runner-install-root.sh: cannot create staging dir $_ld_stage (permissions?)" >&2
		return 1
	fi
	if ! mkdir -p "$(dirname "$_ld_unpacked")" "$_ld_root/bin"; then
		echo "runner-install-root.sh: cannot create $_ld_root/releases/$_ld_ver or $_ld_root/bin (permissions?)" >&2
		rm -rf "$_ld_stage"
		return 1
	fi
	if ! cp -a "$_ld_tree/runner/." "$_ld_stage/runner/"; then
		echo "runner-install-root.sh: copy of runner/ from $_ld_tree failed — nothing installed" >&2
		rm -rf "$_ld_stage"
		return 1
	fi
	if [ -d "$_ld_tree/api" ]; then
		mkdir -p "$_ld_stage/api"
		if ! cp -a "$_ld_tree/api/." "$_ld_stage/api/"; then
			echo "runner-install-root.sh: copy of api/ from $_ld_tree failed — nothing installed" >&2
			rm -rf "$_ld_stage"
			return 1
		fi
	fi
	if [ -d "$_ld_tree/shared" ]; then
		mkdir -p "$_ld_stage/shared"
		if ! cp -a "$_ld_tree/shared/." "$_ld_stage/shared/"; then
			echo "runner-install-root.sh: copy of shared/ from $_ld_tree failed — nothing installed" >&2
			rm -rf "$_ld_stage"
			return 1
		fi
	fi
	if ! cp -a "$_ld_tree/runner/version.json" "$_ld_stage/version.json"; then
		echo "runner-install-root.sh: copy of root version.json from $_ld_tree failed — nothing installed" >&2
		rm -rf "$_ld_stage"
		return 1
	fi
	if ! cp -a "$_ld_tree/runner/bin/kainbain-runner" "$_ld_shim"; then
		echo "runner-install-root.sh: copy of the wrapper shim from $_ld_tree failed — nothing installed" >&2
		rm -rf "$_ld_stage" "$_ld_shim"
		return 1
	fi
	# Post-copy asserts catch an extract that landed one level down (missing
	# --strip-components=1) or any partial copy: the staging dir must hold
	# every file the boot needs, named explicitly, before the swap happens.
	for _ld_need in "$_ld_stage/runner/main.js" "$_ld_stage/version.json" "$_ld_stage/runner/version.json" "$_ld_shim"; do
		if [ ! -f "$_ld_need" ]; then
			echo "runner-install-root.sh: lay-down incomplete, missing $_ld_need (source tree $_ld_tree) — not swapping it in" >&2
			rm -rf "$_ld_stage" "$_ld_shim"
			return 1
		fi
	done
	if [ ! -f "$_ld_stage/api/node_modules/@earendil-works/pi-coding-agent/dist/utils/child-process.js" ]; then
		echo "runner-install-root.sh: warning: no pi discovery dependency under the laid-down api/node_modules — a pi-serving runner will report LEG_MODULE_MISSING until reinstalled from a bundle (scripts/package-runner.sh); muse/antigravity/vibe-only hosts are unaffected." >&2
	fi
	# Swap the staged tree into place. Rename-only, so `current` (which points
	# at the unpacked path) never sees a half-written tree; if the second
	# rename fails, the previous tree is restored.
	if [ -e "$_ld_unpacked" ] || [ -L "$_ld_unpacked" ]; then
		if ! mv "$_ld_unpacked" "$_ld_old"; then
			echo "runner-install-root.sh: cannot move the existing $_ld_unpacked aside — leaving it in place" >&2
			rm -rf "$_ld_stage" "$_ld_shim"
			return 1
		fi
		if mv "$_ld_stage" "$_ld_unpacked"; then
			rm -rf "$_ld_old"
		else
			echo "runner-install-root.sh: swap of the new tree into $_ld_unpacked failed — restoring the previous tree" >&2
			mv "$_ld_old" "$_ld_unpacked"
			rm -rf "$_ld_stage" "$_ld_shim"
			return 1
		fi
	else
		if ! mv "$_ld_stage" "$_ld_unpacked"; then
			echo "runner-install-root.sh: cannot move the staged tree into $_ld_unpacked" >&2
			rm -rf "$_ld_stage" "$_ld_shim"
			return 1
		fi
	fi
	# Shim goes live last, by rename (atomic): a unit starting mid-install
	# either sees the old shim or the new one, never a half-written file.
	if ! mv "$_ld_shim" "$_ld_root/bin/kainbain-runner"; then
		echo "runner-install-root.sh: cannot install the wrapper shim at $_ld_root/bin/kainbain-runner" >&2
		return 1
	fi
	chmod +x "$_ld_root/bin/kainbain-runner"
	if [ ! -e "$_ld_root/current" ] && [ ! -L "$_ld_root/current" ]; then
		ln -s "$_ld_unpacked" "$_ld_root/current"
	fi
	printf '%s' "$_ld_ver"
}
