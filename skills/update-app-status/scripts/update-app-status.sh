#!/usr/bin/env bash
# Point a KainBain project's "Go to App" link at a running dev server.
# Same PATCH endpoint the update-app-status skill uses — for plain scripts/CI.
#
#   ./update-app-status.sh --project my-app --port 5173
#   ./update-app-status.sh --project my-app --port 5173 --network-host lan-host.example --health /health --status starting
#   ./update-app-status.sh --project my-app --clear
set -euo pipefail

API_BASE="${KAINBAIN_API_BASE:-http://localhost:3100}"
PROJECT=""
PORT=""
HOST="localhost"
NETWORK_HOST=""
HEALTH=""
STATUS="running"
CLEAR=0

usage() {
  cat <<EOF
Usage: update-app-status.sh --project <name|slug|id> [options]

Options:
  --port <n>            Dev server port (required unless --url or --clear)
  --url <url>           Full app URL (overrides --port/--host)
  --host <h>            App bind host (default: localhost)
  --network-host <h>    LAN override for loopback (e.g. lan-host.example); blank clears
  --health <path>       Health endpoint (e.g. /health); blank clears
  --status <s>          running|starting|degraded|stopped (default: running)
  --clear               Remove the project's app link and exit
  --api-base <url>      KainBain API base (default: \$KAINBAIN_API_BASE or http://localhost:3100)
  -h, --help            Show this help
EOF
}

URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --url) URL="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --network-host) NETWORK_HOST="$2"; shift 2 ;;
    --health) HEALTH="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --clear) CLEAR=1; shift ;;
    --api-base) API_BASE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ -z "$PROJECT" ]; then echo "Missing --project" >&2; usage >&2; exit 2; fi
case "$STATUS" in
  running|starting|degraded|stopped) ;;
  *) echo "Invalid --status: $STATUS" >&2; exit 2 ;;
esac

# Resolve a name/slug to a project id (ids pass through untouched).
resolve_id() {
  if command -v node >/dev/null 2>&1; then
    curl -fsS "$API_BASE/projects" | node -e "
      let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{
        const want=process.argv[1].toLowerCase();
        const list=JSON.parse(s);
        const hit=list.find(p=>p.id===process.argv[1])
          ||list.find(p=>String(p.name||'').toLowerCase()===want)
          ||list.find(p=>String(p.slug||'').toLowerCase()===want);
        if(!hit){console.error('Project not found: '+process.argv[1]);process.exit(1);}
        process.stdout.write(hit.id);
      });" "$PROJECT"
  else
    # No node: assume an id was given.
    printf '%s' "$PROJECT"
  fi
}

PROJECT_ID="$(resolve_id)"

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

if [ "$CLEAR" -eq 1 ]; then
  BODY='{"url":null}'
else
  if [ -z "$URL" ]; then
    if [ -z "$PORT" ]; then echo "Missing --port (or --url)" >&2; usage >&2; exit 2; fi
    URL="http://${HOST}:${PORT}"
  fi
  BODY="{\"url\":\"$(json_escape "$URL")\",\"status\":\"$(json_escape "$STATUS")\""
  if [ -n "$NETWORK_HOST" ]; then BODY="$BODY,\"networkHost\":\"$(json_escape "$NETWORK_HOST")\""; fi
  if [ -n "$HEALTH" ]; then BODY="$BODY,\"healthEndpoint\":\"$(json_escape "$HEALTH")\""; fi
  BODY="$BODY}"
fi

curl -fsS -X PATCH "$API_BASE/projects/$PROJECT_ID/app-status" \
  -H "Content-Type: application/json" \
  -d "$BODY" | (command -v node >/dev/null 2>&1 \
    && node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(s).appStatus??null)));" \
    || cat)
echo "App link updated for project $PROJECT_ID"
