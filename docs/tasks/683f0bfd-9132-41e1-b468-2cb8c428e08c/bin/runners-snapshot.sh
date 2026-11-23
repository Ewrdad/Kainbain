#!/usr/bin/env bash
# runners-snapshot.sh <outdir> — save raw GET /runners JSON + a summary table.
# Read-only. Usage: bin/runners-snapshot.sh runners-before
set -euo pipefail
API_BASE="${KAINBAIN_API_BASE:-http://192.168.1.206:3100}"
OUTDIR="${1:?usage: runners-snapshot.sh <outdir>}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUTDIR"
curl -s -m 30 "$API_BASE/runners" > "$OUTDIR/runners-$STAMP.json"
curl -s -m 30 "$API_BASE/deploy/status" > "$OUTDIR/deploy-status-$STAMP.json"
jq -r '.[] | [.runnerId,.status,.runnerVersion,.recommendedVersion,.minimumVersion,
  (.updateAvailable|tostring),(.belowMinimum|tostring),(.desiredVersion|tostring),
  ([.availableVersions[]]|join(",")),(.updateStatus|tostring),
  ([.pendingCommands[]?]|join(",")),(.lastSeenAt|tostring)] | @tsv' \
  "$OUTDIR/runners-$STAMP.json" \
  | { echo -e "runnerId\tstatus\trunnerVersion\trecommended\tminimum\tupdateAvailable\tbelowMinimum\tdesired\tavailableVersions\tupdateStatus\tpendingCommands\tlastSeenAt"; cat; } \
  > "$OUTDIR/runners-$STAMP.tsv"
echo "wrote $OUTDIR/runners-$STAMP.json / .tsv / deploy-status-$STAMP.json"
cat "$OUTDIR/runners-$STAMP.tsv"
