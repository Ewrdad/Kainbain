#!/usr/bin/env bash
# sync-adsite.sh — stage the current release onto the ad-site and upload it to
# S3 (https://kainbain.ewrdad.uk) ONLY when something actually changed.
#
# Budget design (S3 PUTs + storage cost money, rebuilds cost time):
#   1. Staging into the site's public/ folder is local and always runs.
#   2. `npm run build` runs only when the web src changed (content hash in
#      dist/.adsite-src-hash), dist/ is missing, or --force. A release-only
#      change (new manifest/tarball/scripts, same site) just copies the
#      staged files into the existing dist/ — no vite rebuild.
#   3. The S3 upload is skipped entirely when the bucket's releases.json
#      already names the same commit with identical file hashes.
#   4. Larger assets are handled separately from the small site files: the
#      small sync never touches *.tar.gz, the large sync uses --size-only
#      (same byte size = already there, no re-upload on rebuild), and stale
#      remote keys are pruned explicitly to what dist/ holds.
#
#   ./scripts/sync-adsite.sh [--adsite DIR] [--dry-run] [--force] [--check]
#                            [--skip-large] [--base REF]
# Env: KAINBAIN_ADSITE_DIR (default kainbain-addsite/Kainbain-adsite),
#      KAINBAIN_ADSITE_S3_BUCKET (default s3://kainbain.ewrdad.uk — set empty
#        to disable the S3 upload and keep this a local staging step),
#      KAINBAIN_ADSITE_S3_PROFILE (optional aws --profile).
# Exit codes: 0 staged (and uploaded, or already current), 1 failed,
# 2 usage/config error, 3 with --check only: an upload is available.
set -uo pipefail
cd "$(dirname "$0")/.."
ADSITE="${KAINBAIN_ADSITE_DIR:-kainbain-addsite/Kainbain-adsite}"
# Default bucket, but an explicitly empty KAINBAIN_ADSITE_S3_BUCKET stays
# empty (local staging only) — plain :- would re-fill it.
if [ -z "${KAINBAIN_ADSITE_S3_BUCKET+x}" ]; then BUCKET="s3://kainbain.ewrdad.uk"; else BUCKET="$KAINBAIN_ADSITE_S3_BUCKET"; fi
DRY_RUN=0; FORCE=0; CHECK=0; SKIP_LARGE=0; BASE=""
while [ $# -gt 0 ]; do case "$1" in
  --adsite) shift; ADSITE="${1:?--adsite needs a dir}" ;;
  --adsite=*) ADSITE="${1#--adsite=}" ;;
  --dry-run) DRY_RUN=1 ;;
  --force) FORCE=1 ;;
  --check) CHECK=1 ;;
  --skip-large) SKIP_LARGE=1 ;;
  --base) shift; BASE="${1:?--base needs a ref}" ;;
  --base=*) BASE="${1#--base=}" ;;
  -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
  *) echo "sync-adsite.sh: unknown argument: $1" >&2; exit 2 ;;
esac; shift; done
log() { echo "sync-adsite: $*"; }
run() { if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi; }
aws_args() { [ -n "${KAINBAIN_ADSITE_S3_PROFILE:-}" ] && printf '%s' "--profile $KAINBAIN_ADSITE_S3_PROFILE"; }
[ -f dist/release-manifest.json ] || { echo "sync-adsite.sh: dist/release-manifest.json missing — run ./publish.sh first" >&2; exit 1; }
[ -d "$ADSITE/public" ] || { echo "sync-adsite.sh: $ADSITE/public not found (set --adsite/KAINBAIN_ADSITE_DIR)" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "sync-adsite.sh: node not found" >&2; exit 1; }

ARTIFACT="$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("dist/release-manifest.json","utf8"))?.components?.runner?.artifact||"")}catch{}')"

src_hash() { # adsite-dir -> content hash of the web src (no node_modules/dist)
  # Brand/favicon/manifest inputs are covered too, but NOT the staged
  # release files (install*.sh, manifests, tarballs): those change on every
  # publish and must never force a vite rebuild on their own.
  local dir="$1" inputs=""
  for p in src index.html package.json package-lock.json vite.config.ts components.json \
      public/brand public/favicon.svg public/favicon.ico \
      public/favicon-16x16.png public/favicon-32x32.png public/favicon-48x48.png \
      public/icon-192.png public/icon-512.png \
      public/apple-touch-icon.png public/site.webmanifest; do
    [ -e "$dir/$p" ] && inputs="$inputs $p"
  done
  # shellcheck disable=SC2086
  (cd "$dir" && find $inputs -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
}
src_hash_matches() { # adsite-dir -> exit 0 when dist hash matches src
  local dir="$1" cur=""
  [ -f "$dir/dist/.adsite-src-hash" ] || return 1
  cur="$(src_hash "$dir")" || return 1
  [ "$cur" = "$(cat "$dir/dist/.adsite-src-hash")" ]
}

# --- --check: read-only freshness probe (changes nothing) --------------------
if [ "$CHECK" = "1" ]; then
  if [ -z "$BUCKET" ]; then log "check: S3 upload disabled (empty bucket) — nothing to upload"; exit 0; fi
  command -v aws >/dev/null 2>&1 || { echo "sync-adsite.sh: aws CLI not installed" >&2; exit 1; }
  # shellcheck disable=SC2046
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  if ! aws $(aws_args) s3 cp "$BUCKET/releases.json" "$tmp/remote-releases.json" >/dev/null 2>&1; then
    log "check: UPDATE_AVAILABLE (no releases.json at $BUCKET yet)"; exit 3
  fi
  SRC_HASH="$(src_hash "$ADSITE")"
  if SRC_HASH="$SRC_HASH" node -e '
    const fs=require("fs"),crypto=require("crypto");
    const sha=(f)=>crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    const remote=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const manifest=JSON.parse(fs.readFileSync("dist/release-manifest.json","utf8"));
    const out={commit:manifest.commit,siteSrcHash:process.env.SRC_HASH,files:{}};
    for(const f of ["install.sh","install-runner.sh","update.sh","redeploy.sh"]){
      if(fs.existsSync("deploy/"+f)) out.files[f]=sha("deploy/"+f);
    }
    out.files["release-manifest.json"]=sha("dist/release-manifest.json");
    if(fs.existsSync("dist/build-info.json")) out.files["build-info.json"]=sha("dist/build-info.json");
    const art=manifest&&manifest.components&&manifest.components.runner&&manifest.components.runner.artifact;
    if(art&&fs.existsSync("dist/"+art)) out.files[art]=sha("dist/"+art);
    const rf=remote.files||{};
    const sameCommit=remote.commit&&remote.commit===out.commit;
    const sameFiles=Object.keys(out.files).length>0&&Object.keys(out.files).every((k)=>rf[k]===out.files[k]);
    const sameSrc=remote.siteSrcHash&&remote.siteSrcHash===out.siteSrcHash;
    if(!(sameCommit&&sameFiles&&sameSrc)) process.exit(3);
  ' "$tmp/remote-releases.json"; then
    # Site bundle itself changed since the last build?
    if [ ! -f "$ADSITE/dist/.adsite-src-hash" ] || ! src_hash_matches "$ADSITE" 2>/dev/null; then :; fi
    log "check: already current ($BUCKET matches this checkout)"; exit 0
  else
    log "check: UPDATE_AVAILABLE (staged files differ from $BUCKET)"; exit 3
  fi
fi

# --- 1. Stage release files into public/ (local, cheap — always runs) --------
run mkdir -p "$ADSITE/public"
for f in install.sh install-runner.sh update.sh redeploy.sh; do
  [ -f "deploy/$f" ] || continue
  run cp "deploy/$f" "$ADSITE/public/$f"
done
run cp dist/release-manifest.json "$ADSITE/public/release-manifest.json"
# build-info.json drives the ad-site's "latest build" section; publish.sh
# regenerates it on every publish. Missing only on pre-feature dist/.
if [ -f dist/build-info.json ]; then run cp dist/build-info.json "$ADSITE/public/build-info.json"; else log "note: dist/build-info.json missing (older publish?) — the build section will show its fallback"; fi
if [ -n "$ARTIFACT" ] && [ -f "dist/$ARTIFACT" ]; then run cp "dist/$ARTIFACT" "$ADSITE/public/$ARTIFACT"; fi
# Keep public/ lean: only the current runner tarball ships (older ones stay
# reproducible in dist/ up to its own retention, and S3 is pruned to match).
if [ "$DRY_RUN" != "1" ]; then
  for old in "$ADSITE"/public/kainbain-runner-*.tar.gz; do
    [ -e "$old" ] || break
    [ -n "$ARTIFACT" ] && [ "$(basename "$old")" = "$ARTIFACT" ] && continue
    # Keep one previous tarball so an in-flight install never 404s mid-roll.
    keep="$(ls -t "$ADSITE"/public/kainbain-runner-*.tar.gz 2>/dev/null | sed -n '2p')"
    [ "$old" = "$keep" ] && continue
    log "pruning old staged tarball: $old"; rm -f "$old"
  done
fi
if [ "$DRY_RUN" != "1" ]; then
  SRC_HASH="$(src_hash "$ADSITE")"
  ADSITE="$ADSITE" ARTIFACT="$ARTIFACT" SRC_HASH="$SRC_HASH" node <<'NODE'
const fs=require("fs"),crypto=require("crypto"),path=require("path");
const pub=path.join(process.env.ADSITE,"public");
const manifest=JSON.parse(fs.readFileSync("dist/release-manifest.json","utf8"));
const files=["release-manifest.json","build-info.json","install.sh","install-runner.sh","update.sh","redeploy.sh",process.env.ARTIFACT].filter(Boolean);
const hashes={}; for(const f of files){const p=path.join(pub,f); if(fs.existsSync(p)) hashes[f]=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");}
fs.writeFileSync(path.join(pub,"releases.json"), JSON.stringify({publishedAt:manifest.publishedAt,commit:manifest.commit,siteSrcHash:process.env.SRC_HASH,components:manifest.components,files:hashes},null,2)+"\n");
console.log("sync-adsite: wrote releases.json ("+Object.keys(hashes).join(", ")+")");
NODE
fi

if [ -z "$BUCKET" ]; then
  log "staged into $ADSITE/public/ (KAINBAIN_ADSITE_S3_BUCKET is empty — S3 sync disabled; build the site with: cd $ADSITE && npm run build)"
  exit 0
fi
command -v aws >/dev/null 2>&1 || { echo "sync-adsite.sh: aws CLI is not installed — staged locally only" >&2; exit 1; }
if [ -n "$BASE" ]; then
  log "changes since $BASE (informational):"
  git diff --name-only "$BASE"...HEAD -- kainbain-addsite deploy/install.sh deploy/install-runner.sh deploy/update.sh deploy/redeploy.sh scripts/sync-adsite.sh 2>/dev/null | sed 's/^/  /' || true
fi

# --- 2. Build only when the web src changed (else copy staged files over) ---
NEEDS_BUILD=0
if [ "$FORCE" = "1" ] || [ ! -f "$ADSITE/dist/index.html" ]; then NEEDS_BUILD=1
elif ! src_hash_matches "$ADSITE"; then NEEDS_BUILD=1; fi
if [ "$DRY_RUN" = "1" ]; then
  if [ "$NEEDS_BUILD" = "1" ]; then echo "would run: (cd $ADSITE && npm run build)  [web src changed]"
  else echo "would run: cp $ADSITE/public/{releases.json,release-manifest.json,build-info.json,install*.sh,update.sh,redeploy.sh,$ARTIFACT} $ADSITE/dist/  [no rebuild: site unchanged]"; fi
elif [ "$NEEDS_BUILD" = "1" ]; then
  log "web src changed — rebuilding the site"
  if [ ! -d "$ADSITE/node_modules" ]; then log "installing site dependencies (clean checkout)..."; (cd "$ADSITE" && npm install --include=dev) || exit 1; fi
  (cd "$ADSITE" && npm run build) || exit 1
  src_hash "$ADSITE" > "$ADSITE/dist/.adsite-src-hash"
  log "recorded site src hash in dist/.adsite-src-hash"
else
  log "site unchanged — skipping vite rebuild (copying staged files into dist/)"
  for f in releases.json release-manifest.json build-info.json install.sh install-runner.sh update.sh redeploy.sh "$ARTIFACT"; do
    [ -n "$f" ] && [ -f "$ADSITE/public/$f" ] && cp "$ADSITE/public/$f" "$ADSITE/dist/$f"
  done
fi
[ "$DRY_RUN" = "1" ] && { log "dry-run: nothing staged, built, or uploaded"; exit 0; }

# --- 3. Skip the upload when the bucket is already current --------------------
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ "$FORCE" != "1" ] && aws $(aws_args) s3 cp "$BUCKET/releases.json" "$TMP/remote-releases.json" >/dev/null 2>&1; then
  if node -e '
    const fs=require("fs");
    const remote=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const local=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
    const sameCommit=remote.commit&&remote.commit===local.commit;
    const sameSrc=remote.siteSrcHash&&local.siteSrcHash&&remote.siteSrcHash===local.siteSrcHash;
    const lf=local.files||{}, rf=remote.files||{};
    const sameFiles=Object.keys(lf).length>0&&Object.keys(lf).every((k)=>rf[k]===lf[k]);
    process.exit(sameCommit&&sameSrc&&sameFiles?0:1);
  ' "$TMP/remote-releases.json" "$ADSITE/dist/releases.json"; then
    log "already current ($BUCKET matches commit $(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).commit)' "$ADSITE/dist/releases.json" | cut -c1-7)) — skipping S3 upload"
    exit 0
  fi
  log "bucket differs — uploading"
else
  log "no releases.json at $BUCKET yet (or --force) — full upload"
fi

# --- 4a. Small site files (never touches the large assets) --------------------
run aws $(aws_args) s3 sync "$ADSITE/dist/" "$BUCKET" --exclude "kainbain-runner-*.tar.gz" --exclude "brand/*.png" --exclude ".adsite-src-hash"
# --- 4b. Larger assets, separately: skip re-upload when the size matches ------
# (runner tarballs + premade brand PNGs/backgrounds: static bytes that must
# not be re-PUT just because a rebuild refreshed their mtime)
if [ "$SKIP_LARGE" = "1" ]; then log "--skip-large: leaving large assets as-is"
else run aws $(aws_args) s3 sync "$ADSITE/dist/" "$BUCKET" --size-only --exclude "*" --include "kainbain-runner-*.tar.gz" --include "brand/*.png"; fi
# --- 4c. Prune stale remote keys to exactly what dist/ holds ------------------
# (explicit instead of --delete: with include/exclude filters --delete would
# also drop the large assets the small pass excluded, forcing re-uploads.)
if [ "$DRY_RUN" != "1" ]; then
  # .adsite-src-hash is local build bookkeeping, never served.
  (cd "$ADSITE/dist" && find . -type f | sed 's|^\./||' | grep -v '^\.adsite-src-hash$' | sort) > "$TMP/local-keys.txt"
  aws $(aws_args) s3 ls "$BUCKET" --recursive | awk '{print $4}' | sort > "$TMP/remote-keys.txt" || { echo "sync-adsite.sh: cannot list $BUCKET" >&2; exit 1; }
  comm -23 "$TMP/remote-keys.txt" "$TMP/local-keys.txt" > "$TMP/stale.txt" || true
  if [ -s "$TMP/stale.txt" ] && [ "$SKIP_LARGE" != "1" ]; then
    while IFS= read -r key; do [ -n "$key" ] || continue; run aws $(aws_args) s3 rm "$BUCKET/$key"; done < "$TMP/stale.txt"
  elif [ -s "$TMP/stale.txt" ]; then
    grep -v '^kainbain-runner-.*\.tar\.gz$' "$TMP/stale.txt" > "$TMP/stale-small.txt" || true
    while IFS= read -r key; do [ -n "$key" ] || continue; run aws $(aws_args) s3 rm "$BUCKET/$key"; done < "$TMP/stale-small.txt"
  fi
fi
# --- 4d. Entry-point metadata: correct types, never cached --------------------
# (a handful of tiny PUTs, only on runs that already decided to upload)
for f in install.sh install-runner.sh update.sh redeploy.sh; do
  [ -f "$ADSITE/dist/$f" ] || continue
  run aws $(aws_args) s3 cp "$ADSITE/dist/$f" "$BUCKET/$f" --content-type "text/x-shellscript" --cache-control "no-cache" --metadata-directive REPLACE
done
for f in releases.json release-manifest.json build-info.json; do
  [ -f "$ADSITE/dist/$f" ] || continue
  run aws $(aws_args) s3 cp "$ADSITE/dist/$f" "$BUCKET/$f" --content-type "application/json" --cache-control "no-cache" --metadata-directive REPLACE
done
[ -f "$ADSITE/dist/index.html" ] && run aws $(aws_args) s3 cp "$ADSITE/dist/index.html" "$BUCKET/index.html" --content-type "text/html" --cache-control "no-cache" --metadata-directive REPLACE
log "synced $ADSITE/dist/ -> $BUCKET (small files + large assets separately)"
