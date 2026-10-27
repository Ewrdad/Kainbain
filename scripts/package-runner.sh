#!/usr/bin/env bash
# Build the distributable Runner bundle: dist/kainbain-runner-<ref>.tar.gz
# Layout inside: runner/{runner,api,shared}/ + startRunner.sh (api pruned of tests).
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${1:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
OUT="dist/kainbain-runner-${REF}.tar.gz"; STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p dist "$STAGE/runner/runner" "$STAGE/runner/api" "$STAGE/runner/shared"
tar -C runner --exclude='*.test.js' -cf - . | tar -C "$STAGE/runner/runner" -xf -
tar -C api --exclude=node_modules --exclude=docs --exclude='*.test.js' -cf - . | tar -C "$STAGE/runner/api" -xf -
tar -C shared --exclude='*.test.js' -cf - . | tar -C "$STAGE/runner/shared" -xf -
cp startRunner.sh "$STAGE/"; cp opencode-ai-sdk-1.18.34.tgz "$STAGE/runner/" 2>/dev/null || true
cp .npmrc "$STAGE/runner/api/.npmrc" 2>/dev/null || true
tar -czf "$OUT" -C "$STAGE" runner startRunner.sh
echo "Runner distributable: $OUT"
