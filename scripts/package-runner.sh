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
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
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
echo "Runner distributable: $OUT"
