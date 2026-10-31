#!/usr/bin/env bash
# sync-adsite.sh — stage the current release onto the ad-site (and to S3 when configured).
# Copies dist/release-manifest.json, the runner tarball it names, and the
# install/update/redeploy scripts into the ad-site's public/ folder, writes
# public/releases.json with a sha256 for every staged file (quick client-side
# freshness check without downloading the tarball), then optionally syncs the
# built site to S3. Without a bucket this is a local staging step only.
#
#   ./scripts/sync-adsite.sh [--adsite DIR] [--dry-run]
# Env: KAINBAIN_ADSITE_DIR (default kainbain-addsite/Kainbain-adsite),
#      KAINBAIN_ADSITE_S3_BUCKET (e.g. s3://kainbain-adsite — unset = no S3),
#      KAINBAIN_ADSITE_S3_PROFILE (optional aws --profile).
set -uo pipefail
cd "$(dirname "$0")/.."
ADSITE="${KAINBAIN_ADSITE_DIR:-kainbain-addsite/Kainbain-adsite}"; DRY_RUN=0
while [ $# -gt 0 ]; do case "$1" in --adsite) shift; ADSITE="${1:?}" ;; --adsite=*) ADSITE="${1#--adsite=}" ;; --dry-run) DRY_RUN=1 ;; *) echo "sync-adsite.sh: unknown argument: $1" >&2; exit 2 ;; esac; shift; done
log() { echo "sync-adsite: $*"; }
run() { if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi; }
[ -f dist/release-manifest.json ] || { echo "sync-adsite.sh: dist/release-manifest.json missing — run ./publish.sh first" >&2; exit 1; }
[ -d "$ADSITE/public" ] || { echo "sync-adsite.sh: $ADSITE/public not found (set --adsite/KAINBAIN_ADSITE_DIR)" >&2; exit 1; }
ARTIFACT="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("dist/release-manifest.json","utf8"))?.components?.runner?.artifact||"")}catch{}')"
run mkdir -p "$ADSITE/public"
for f in dist/release-manifest.json deploy/install.sh deploy/update.sh deploy/redeploy.sh; do
  dest="$ADSITE/public/$(basename "$f")"; run cp "$f" "$dest"
done
[ -n "$ARTIFACT" ] && [ -f "dist/$ARTIFACT" ] && run cp "dist/$ARTIFACT" "$ADSITE/public/$ARTIFACT"
if [ "$DRY_RUN" != "1" ]; then
  ADSITE="$ADSITE" ARTIFACT="$ARTIFACT" node <<'NODE'
const fs=require("fs"),crypto=require("crypto"),path=require("path");
const pub=path.join(process.env.ADSITE,"public");
const manifest=JSON.parse(fs.readFileSync("dist/release-manifest.json","utf8"));
const files=["release-manifest.json","install.sh","update.sh","redeploy.sh",process.env.ARTIFACT].filter(Boolean);
const hashes={}; for(const f of files){const p=path.join(pub,f); if(fs.existsSync(p)) hashes[f]=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");}
fs.writeFileSync(path.join(pub,"releases.json"), JSON.stringify({publishedAt:manifest.publishedAt,commit:manifest.commit,components:manifest.components,files:hashes},null,2)+"\n");
console.log("sync-adsite: wrote releases.json ("+Object.keys(hashes).join(", ")+")");
NODE
fi
if [ -n "${KAINBAIN_ADSITE_S3_BUCKET:-}" ]; then
  command -v aws >/dev/null 2>&1 || { echo "sync-adsite.sh: KAINBAIN_ADSITE_S3_BUCKET is set but the aws CLI is not installed — staged locally only" >&2; exit 1; }
  (cd "$ADSITE" && run npm run build) || exit 1
  run aws s3 sync "$ADSITE/dist/" "$KAINBAIN_ADSITE_S3_BUCKET" --delete ${KAINBAIN_ADSITE_S3_PROFILE:+--profile "$KAINBAIN_ADSITE_S3_PROFILE"}
  log "synced $ADSITE/dist/ -> $KAINBAIN_ADSITE_S3_BUCKET"
else
  log "staged into $ADSITE/public/ (no KAINBAIN_ADSITE_S3_BUCKET set — S3 sync skipped; build the site with: cd $ADSITE && npm run build)"
fi
