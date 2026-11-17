#!/usr/bin/env bash
# Build the distributable Runner bundle: dist/kainbain-runner-<ref>.tar.gz
#
# Thin wrapper only: the canonical bundle builder is
# scripts/package-runner.mjs (one packager, one layout — the layout the
# self-update channel boots: version.json at the archive root next to
# runner/, api/, shared/). This script keeps the legacy short-sha tarball
# NAME that publish.sh records in dist/release-manifest.json, but the bytes
# inside are exactly what the .mjs builder emits for this host's platform,
# stamped with runner/version.json's runnerVersion.
#
# The tarball NAME carries the REF arg, but the build identity stamped
# INSIDE (version.json build.sha) always comes from the build-time git HEAD
# — never from the filename. Passing a REF that differs from HEAD names a
# bundle that claims to be one commit while reporting another (the WP-F
# fbcf8442-vs-de62122c confusion), so a sha-looking REF that matches
# neither HEAD nor its short form fails here. Override only when you mean
# it: `package-runner.sh --allow-ref-mismatch <REF>`.
#
# Failure modes: missing git / not a checkout (REF defaults to `dev` and
# the stamp is null — the bundle still builds, but runners report an
# unknown build); unknown platform/arch (exit 1); packager error (exit 1,
# no tarball written — a previous tarball at the same path is left alone).
set -euo pipefail
cd "$(dirname "$0")/.."
ALLOW_MISMATCH=0
if [ "${1:-}" = "--allow-ref-mismatch" ]; then ALLOW_MISMATCH=1; shift; fi
REF="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
if [ "$ALLOW_MISMATCH" -eq 0 ] && printf '%s' "$REF" | grep -Eq '^[0-9a-f]{7,40}$'; then
	HEAD_FULL="$(git rev-parse HEAD 2>/dev/null || echo "")"
	HEAD_SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo "")"
	if [ -n "$HEAD_FULL" ] && [ "$REF" != "$HEAD_FULL" ] && [ "$REF" != "$HEAD_SHORT" ]; then
		echo "package-runner.sh: REF '$REF' matches neither HEAD ($HEAD_SHORT / $HEAD_FULL)." >&2
		echo "The tarball NAME would claim '$REF' while the stamped build.sha reports HEAD." >&2
		echo "Either check out $REF first, pass $HEAD_SHORT, or re-run with --allow-ref-mismatch." >&2
		exit 1
	fi
fi
VERSION="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("runner/version.json","utf8")).runnerVersion)')"
case "$(uname -s)" in
  Linux) PLATFORM="linux" ;;
  Darwin) PLATFORM="darwin" ;;
  *) echo "package-runner.sh: unsupported host platform '$(uname -s)' (v1: Linux, macOS)." >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "package-runner.sh: unsupported host arch '$(uname -m)' (v1: x64, arm64)." >&2; exit 1 ;;
esac
OUT="dist/kainbain-runner-${REF}.tar.gz"; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p dist
node scripts/package-runner.mjs --platform "$PLATFORM" --arch "$ARCH" --version "$VERSION" --out "$TMP"
cp "$TMP/kainbain-runner-${VERSION#v}-${PLATFORM}-${ARCH}.tar.gz" "$OUT"
# Transfer receipt: the sha256 below is what the installer re-hashes before
# use, and the stamped build.sha is the ONLY identity that matters — it is
# what runners report as versions.build.sha, never the REF in the filename.
echo "Runner distributable: $OUT"
sha256sum "$OUT" | awk '{print "sha256: " $1}'
TOP="$(tar tzf "$OUT" | head -n 1)"
tar xzOf "$OUT" "${TOP}version.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s);console.log("stamped build.sha: "+(v?.build?.sha??"(unknown — no git checkout at build time)"));}catch(e){console.log("stamped build.sha: (unreadable version.json)");}})'
