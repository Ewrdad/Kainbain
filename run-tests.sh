#!/bin/bash
# Thin shim: the full-project verification gate lives in
# scripts/run-tests.mjs (cross-platform, `npm test` is canonical). Kept so
# `deploy.sh --prod` and older docs/paths keep working.
cd "$(dirname "$0")"
exec node scripts/run-tests.mjs "$@"
