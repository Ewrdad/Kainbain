#!/usr/bin/env bash
# Migrate one systemd Runner install from direct `node main.js` to the
# self-updating wrapper entrypoint (`runner/bin/kainbain-runner`).
#
# A direct unit re-execs the same old directory on every restart, so staged
# updates can never boot there (task 82e49a05 D3). This script lays down a
# versioned install root from the currently running tree, points the unit
# at a stable wrapper shim, and restarts it onto the SAME version — no
# update is staged here, so the fleet version does not change; later
# releases then propagate on idle through the normal channel.
#
# Safe to re-run (a wrapper unit exits 0 unchanged). Snapshots the unit +
# env file before rewriting and prints the revert commands.
#
# Usage:
#   scripts/migrate-runner-to-wrapper.sh --id server2-alpha [--install-root PATH]
#     [--version V] [--source DIR] [--unit NAME] [--no-restart] [--dry-run]
# Id derivation mirrors the installers: --id local-alpha matches
# kainbain-runner-local-alpha.service (install-local-runner.sh) or
# kainbain-runner-alpha.service; any other id matches
# kainbain-runner-<id>.service (startRunner.sh). Pass --unit for the exact
# unit file name when both templates could match.
set -euo pipefail

ID=""; UNIT_NAME=""; INSTALL_ROOT=""; VERSION=""; SOURCE=""; NO_RESTART=0; DRY_RUN=0
while [ $# -gt 0 ]; do
	case "$1" in
		--id) ID="${2:?--id needs a value}"; shift 2 ;;
		--id=*) ID="${1#--id=}"; shift ;;
		--unit) UNIT_NAME="${2:?--unit needs a value}"; shift 2 ;;
		--unit=*) UNIT_NAME="${1#--unit=}"; shift ;;
		--install-root) INSTALL_ROOT="${2:?--install-root needs a value}"; shift 2 ;;
		--install-root=*) INSTALL_ROOT="${1#--install-root=}"; shift ;;
		--version) VERSION="${2:?--version needs a value}"; shift 2 ;;
		--version=*) VERSION="${1#--version=}"; shift ;;
		--source) SOURCE="${2:?--source needs a value}"; shift 2 ;;
		--source=*) SOURCE="${1#--source=}"; shift ;;
		--no-restart) NO_RESTART=1; shift ;;
		--dry-run) DRY_RUN=1; shift ;;
		-h|--help) sed -n '2,22p' "$0"; exit 0 ;;
		*) echo "migrate-runner-to-wrapper.sh: unknown arg: $1 (see --help)" >&2; exit 2 ;;
	esac
done

UNIT_DIR="$HOME/.config/systemd/user"
find_unit() {
	if [ -n "$UNIT_NAME" ]; then
		case "$UNIT_NAME" in *.service) printf '%s' "$UNIT_NAME" ;; *) printf '%s.service' "$UNIT_NAME" ;; esac
		return 0
	fi
	if [ -z "$ID" ]; then echo "migrate-runner-to-wrapper.sh: pass --id or --unit" >&2; exit 2; fi
	case "$ID" in
		local-*)
			short="${ID#local-}"
			if [ -f "$UNIT_DIR/kainbain-runner-local-${short}.service" ]; then printf '%s' "kainbain-runner-local-${short}.service"; return 0; fi
			printf '%s' "kainbain-runner-${short}.service"; return 0 ;;
		*) printf '%s' "kainbain-runner-${ID}.service"; return 0 ;;
	esac
}
UNIT_FILE="$UNIT_DIR/$(find_unit)"
[ -f "$UNIT_FILE" ] || { echo "migrate-runner-to-wrapper.sh: no such unit file: $UNIT_FILE" >&2; exit 1; }

EXEC="$(grep -m1 '^ExecStart=' "$UNIT_FILE" | cut -d= -f2-)"
case "$EXEC" in
	*kainbain-runner*)
		echo "Already migrated: $(basename "$UNIT_FILE") runs the wrapper ($EXEC). Nothing to do."
		exit 0 ;;
esac
WORKDIR="$(grep -m1 '^WorkingDirectory=' "$UNIT_FILE" | cut -d= -f2-)"
ENV_FILE="$(grep -m1 '^EnvironmentFile=' "$UNIT_FILE" | cut -d= -f2- | cut -d' ' -f1)"
ENV_FILE="${ENV_FILE#-}"
[ -n "$SOURCE" ] && WORKDIR="$SOURCE"
[ -n "$WORKDIR" ] || { echo "migrate-runner-to-wrapper.sh: unit has no WorkingDirectory (pass --source DIR)" >&2; exit 1; }
[ -f "$WORKDIR/main.js" ] || { echo "migrate-runner-to-wrapper.sh: no main.js under source dir $WORKDIR" >&2; exit 1; }
[ -f "$WORKDIR/version.json" ] || { echo "migrate-runner-to-wrapper.sh: no version.json under source dir $WORKDIR" >&2; exit 1; }

if [ -z "$VERSION" ]; then
	command -v node >/dev/null 2>&1 || { echo "migrate-runner-to-wrapper.sh: node not on PATH (pass --version V)" >&2; exit 1; }
	VERSION="$(node -e 'const v=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).runnerVersion;if(typeof v!=="string"||!v)process.exit(1);console.log(v);' "$WORKDIR/version.json")"
	[ -n "$VERSION" ] || { echo "migrate-runner-to-wrapper.sh: cannot read runnerVersion from $WORKDIR/version.json" >&2; exit 1; }
fi
if [ -z "$INSTALL_ROOT" ] && [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
	INSTALL_ROOT="$(grep -m1 '^KAINBAIN_RUNNER_INSTALL_ROOT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
fi
[ -n "$INSTALL_ROOT" ] || INSTALL_ROOT="$HOME/.kainbain/runner-install"
UNPACKED="$INSTALL_ROOT/releases/$VERSION/unpacked"

echo "Unit:    $UNIT_FILE"
echo "Source:  $WORKDIR (version $VERSION)"
echo "Root:    $INSTALL_ROOT"
echo "Target:  $UNPACKED"
if [ "$DRY_RUN" = "1" ]; then
	echo "dry-run: nothing laid down, rewritten, reloaded, or restarted."
	[ -L "$INSTALL_ROOT/current" ] && echo "dry-run: note: $INSTALL_ROOT/current already points at $(readlink "$INSTALL_ROOT/current") (a real run would refuse to overwrite it)."
	exit 0
fi

if [ -e "$INSTALL_ROOT/current" ] || [ -L "$INSTALL_ROOT/current" ]; then
	echo "migrate-runner-to-wrapper.sh: refusing to overwrite existing $INSTALL_ROOT/current ($(readlink "$INSTALL_ROOT/current" 2>/dev/null || echo not-a-link)) — migrate by hand or remove it first." >&2
	exit 1
fi
if [ ! -f "$WORKDIR/bin/kainbain-runner" ]; then
	echo "migrate-runner-to-wrapper.sh: no wrapper at $WORKDIR/bin/kainbain-runner — the source tree predates the wrapper; deploy first, then migrate." >&2
	exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
cp -a "$UNIT_FILE" "$UNIT_FILE.bak-$TS"
echo "Snapshot: $UNIT_FILE.bak-$TS"
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
	cp -a "$ENV_FILE" "$ENV_FILE.bak-$TS"
	echo "Snapshot: $ENV_FILE.bak-$TS"
fi

mkdir -p "$UNPACKED" "$INSTALL_ROOT/bin"
cp -a "$WORKDIR/." "$UNPACKED/runner/"
if [ -d "$WORKDIR/../api" ]; then cp -a "$WORKDIR/../api/." "$UNPACKED/api/"; fi
if [ -d "$WORKDIR/../shared" ]; then cp -a "$WORKDIR/../shared/." "$UNPACKED/shared/"; fi
cp -a "$WORKDIR/version.json" "$UNPACKED/version.json"
cp -a "$WORKDIR/bin/kainbain-runner" "$INSTALL_ROOT/bin/kainbain-runner"
chmod +x "$INSTALL_ROOT/bin/kainbain-runner"
ln -s "$UNPACKED" "$INSTALL_ROOT/current"
echo "Laid down $UNPACKED + shim $INSTALL_ROOT/bin/kainbain-runner"

# Rewrite the unit in place (keeps Description, EnvironmentFile, Restart):
# stable shim path + install-root working dir.
ESCAPED_ROOT="$(printf '%s' "$INSTALL_ROOT" | sed 's/[&|]/\\&/g')"
sed -i "s|^ExecStart=.*|ExecStart=$ESCAPED_ROOT/bin/kainbain-runner|" "$UNIT_FILE"
if grep -q '^WorkingDirectory=' "$UNIT_FILE"; then
	sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$ESCAPED_ROOT|" "$UNIT_FILE"
else
	sed -i "/^\\[Service\\]/a WorkingDirectory=$INSTALL_ROOT" "$UNIT_FILE"
fi
echo "Rewrote ExecStart/WorkingDirectory in $(basename "$UNIT_FILE")"
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
	if grep -q '^KAINBAIN_RUNNER_INSTALL_ROOT=' "$ENV_FILE"; then
		echo "Env already sets KAINBAIN_RUNNER_INSTALL_ROOT (left alone)."
	else
		printf '%s\n' "KAINBAIN_RUNNER_INSTALL_ROOT=$INSTALL_ROOT" >>"$ENV_FILE"
		echo "Appended KAINBAIN_RUNNER_INSTALL_ROOT to $ENV_FILE"
	fi
fi

if [ "$NO_RESTART" = "1" ]; then
	echo "--no-restart: files are in place; reload + restart when ready:"
	echo "  systemctl --user daemon-reload && systemctl --user restart $(basename "$UNIT_FILE")"
	exit 0
fi
if ! command -v systemctl >/dev/null 2>&1; then
	echo "systemctl not found — unit + install root are in place; reload and restart by hand, then run:"
	echo "  $INSTALL_ROOT/bin/kainbain-runner doctor --unit $(basename "$UNIT_FILE")"
	exit 0
fi
systemctl --user daemon-reload
systemctl --user restart "$(basename "$UNIT_FILE")"
echo "Restarted $(basename "$UNIT_FILE"). Verifying:"
"$INSTALL_ROOT/bin/kainbain-runner" doctor --unit "$(basename "$UNIT_FILE")" || true
echo "Revert (same version, direct entrypoint): copy the .bak-$TS files back over the unit + env, then:"
echo "  systemctl --user daemon-reload && systemctl --user restart $(basename "$UNIT_FILE")"
