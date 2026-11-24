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
# no tarball written — a previous tarball at the same path is left alone);
# transfer-receipt failure (exit 1 AFTER the tarball is written — the
# bundle exists but could not prove its own sha256/build.sha readback, so
# do not publish it).
set -euo pipefail
cd "$(dirname "$0")/.."
. "$(dirname "$0")/lib/bundle-receipt.sh"
ALLOW_MISMATCH=0
if [ "${1:-}" = "--allow-ref-mismatch" ]; then ALLOW_MISMATCH=1; shift; fi
REF="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
# The REF lands in the tarball path (dist/kainbain-runner-<REF>.tar.gz), so
# it must be a safe filename component — no '/', no '.', no '..' — or a
# crafted REF could write outside dist/. Always enforced, even with
# --allow-ref-mismatch (that flag only bypasses the sha-mismatch guard).
case "$REF" in
  ""|"."|".."|*[!A-Za-z0-9._-]*)
    echo "package-runner.sh: REF '$REF' is not a safe tarball-name component (allowed: letters, digits, '.', '_', '-')." >&2
    exit 1 ;;
esac
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
# print_bundle_receipt hashes and parses through node, so this works on
# macOS too (sha256sum does not exist there) and never depends on tar's
# entry order. It returns 1 when the bundle cannot be read back, which
# fails this script loudly after the tarball was written.
echo "Runner distributable: $OUT"
print_bundle_receipt "$OUT"
