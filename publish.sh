#!/usr/bin/env bash
# publish.sh — build, tag, push, and write dist/ for changed components.
# Publish never deploys: it never touches ~/apps/kainbain and never restarts
# anything (AsymmetricUpdatesPlan DA5). Deploy is redeploy.sh on the target.
#
#   ./publish.sh [--detect [--base <ref>]] [--backend|--frontend|--runner|--all]
#                [--dry-run] [--fast]
# Exit codes: 0 published (or nothing to publish), 1 gate/build/push failed,
# 2 usage/config error (including a missing KAINBAIN_DOCKERHUB_NAMESPACE),
# 78 refused from a task worktree (kb/* branch).
set -uo pipefail
cd "$(dirname "$0")"
ORIG_ARGS=("$@")

MODE="detect"; BASE=""; DRY_RUN=0; FAST=0
COMPONENTS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --detect) MODE="detect" ;;
    --backend) COMPONENTS="backend" ;;
    --frontend) COMPONENTS="frontend" ;;
    --runner) COMPONENTS="runner" ;;
    --all) COMPONENTS="backend frontend runner" ;;
    --base) shift; BASE="${1:-}" ;;
    --dry-run) DRY_RUN=1 ;;
    --fast) FAST=1 ;;
    *) echo "publish.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "publish: $*"; }
# run echoes every external command in dry-run mode and executes none of them.
run() {
  if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi
}

# --- Preflight (a): primary checkout only --------------------------------
# A Runner executes publish.sh as an ordinary ci stage inside the per-task
# worktree (branch kb/*). Publishing must ship merged main, so from a task
# worktree we re-exec ourselves in the primary checkout (first worktree).
# "Task worktree" is decided by PATH (linked worktree != primary), never by
# branch name alone: the primary checkout legitimately sits on a kb/* branch
# while the harness operates on a task there, and a runOnBranch=primary stage
# correctly runs in the primary — refusing there (exit 78) blocked publishes
# (e3b2624a-bc24-4698-9c78-86af7f6f3b5b, 2026-10-30). The default-branch
# check below still enforces what a publish actually ships.
_branch="$(git branch --show-current 2>/dev/null || true)"
case "$_branch" in
  kb/*)
    _primary="$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')"
    _here="$(pwd -P 2>/dev/null || echo "$PWD")"
    if [ -n "$_primary" ] && [ "$_here" != "$_primary" ]; then
      echo "publish: running from task worktree (branch $_branch at $_here) — re-exec in primary checkout $_primary"
      cd "$_primary"
      exec ./publish.sh "${ORIG_ARGS[@]}"
    elif [ -n "$_primary" ]; then
      log "primary checkout is on task branch '$_branch' (not a task worktree) — continuing here; the default-branch check below still applies"
    else
      echo "publish.sh: refusing to run from a task worktree (branch $_branch) — could not identify the primary worktree" >&2
      exit 78
    fi
    unset _primary _here ;;
esac
# Copied from deploy.sh require_default_branch_tree (do not source deploy.sh).
require_default_branch_tree() {
  if [ "${KAINBAIN_ALLOW_BRANCH_DEPLOY:-}" = "1" ]; then
    log "KAINBAIN_ALLOW_BRANCH_DEPLOY=1 — publishing from a non-default branch (emergency opt-out)."
    return 0
  fi
  local current default_branch
  current="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  default_branch="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')"
  if [ -z "$default_branch" ]; then
    if git show-ref --verify --quiet refs/heads/main 2>/dev/null; then default_branch="main"
    elif git show-ref --verify --quiet refs/heads/master 2>/dev/null; then default_branch="master"; fi
  fi
  if [ "$current" = "HEAD" ] || [ "$current" = "unknown" ] || [ -z "$default_branch" ]; then
    log "default-branch check skipped (current='$current') — proceeding."
    return 0
  fi
  if [ "$current" != "$default_branch" ]; then
    log "refusing to publish: checkout is on '$current', not the default branch '$default_branch'."
    return 1
  fi
  return 0
}
require_default_branch_tree || exit 1

# --- Component selection ---------------------------------------------------
if [ -z "$COMPONENTS" ]; then
  if [ -n "$BASE" ]; then DETECT_OUT="$(node scripts/detect-changed-components.mjs --base "$BASE" --json)"
  else DETECT_OUT="$(node scripts/detect-changed-components.mjs --json)"; fi
  COMPONENTS="$(printf '%s' "$DETECT_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).components.join(" "))}catch{console.log("")}})')"
fi
if [ -z "$COMPONENTS" ]; then log "nothing to publish"; exit 0; fi
log "components: $COMPONENTS"

has_image=0
for c in $COMPONENTS; do case "$c" in backend|frontend) has_image=1 ;; esac; done

# --- Preflight (b/c): namespace, compat, clean tree ------------------------
if [ "$has_image" = "1" ] && [ -z "${KAINBAIN_DOCKERHUB_NAMESPACE:-}" ]; then
  echo "publish.sh: KAINBAIN_DOCKERHUB_NAMESPACE is not set — set it to your Docker Hub namespace before publishing images" >&2
  exit 2
fi
if ! node scripts/check-component-compat.mjs; then
  echo "publish.sh: compatibility check failed — nothing published" >&2
  exit 1
fi
component_paths() {
  case "$1" in
    backend) echo "api shared Dockerfile docker-entrypoint.sh" ;;
    frontend) echo "frontend shared" ;;
    runner) echo "runner shared api startRunner.sh scripts/package-runner.sh" ;;
  esac
}
for c in $COMPONENTS; do
  dirty="$(git status --porcelain -- $(component_paths "$c"))"
  if [ -n "$dirty" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      log "warning (dry-run): $c has uncommitted changes, a real publish would refuse:"; printf '%s\n' "$dirty"
    else
      echo "publish.sh: refusing to publish $c — uncommitted changes would make its tag lie:" >&2
      printf '%s\n' "$dirty" >&2
      exit 1
    fi
  fi
done

SHORTSHA="$(git rev-parse --short HEAD)"
FULLSHA="$(git rev-parse HEAD)"
api_version_of() {
  node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).apiVersion)' "$1/version.json"
}

# --- Gates + builds for every flagged component first (atomicity, step 5) --
gate_for() {
  case "$1" in
    backend) run npm run test:api && run npm run lint:api ;;
    frontend) run npm run test:frontend && run npm run lint:frontend && run npm run build:frontend ;;
    runner) run node --test runner/daemon.test.js runner/config.test.js runner/project.test.js runner/gitOps.test.js runner/harness.test.js runner/client.test.js ;;
  esac
}
if [ "$COMPONENTS" = "backend frontend runner" ] && [ "$FAST" != "1" ]; then
  run npm run test:canary || exit 1
fi
for c in $COMPONENTS; do
  if [ "$FAST" = "1" ]; then log "skipping unit gates for $c (--fast; compat check above still ran)";
  else gate_for "$c" || { echo "publish.sh: gate failed for $c — nothing published" >&2; exit 1; }; fi
done
# --fast still builds the frontend (a publish must prove it compiles).
if [ "$FAST" = "1" ]; then
  case " $COMPONENTS " in *" frontend "*) run npm run build:frontend || exit 1 ;; esac
fi

for c in $COMPONENTS; do
  case "$c" in
    backend)
      TAG="$(api_version_of api)-$SHORTSHA"
      run docker build -f Dockerfile \
        --build-arg KAINBAIN_BUILD_REF="$SHORTSHA" \
        --build-arg KAINBAIN_BUILD_NUMBER="${KAINBAIN_BUILD_NUMBER:-0}" \
        -t "kainbain-backend:$TAG" . || exit 1
      ;;
    frontend)
      TAG="$(api_version_of frontend)-$SHORTSHA"
      RANGE="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("frontend/version.json","utf8")).requires.backendApi)')"
      run docker build -f frontend/Dockerfile \
        --build-arg VITE_BUILD_REF="$SHORTSHA" \
        --build-arg VITE_BACKEND_API_RANGE="$RANGE" \
        -t "kainbain-frontend:$TAG" . || exit 1
      ;;
    runner)
      run bash scripts/package-runner.sh "$SHORTSHA" || exit 1
      ;;
  esac
done
if [ "$DRY_RUN" = "1" ]; then
  for c in $COMPONENTS; do
    case "$c" in
      backend|frontend)
        TAG="$(api_version_of "$([ "$c" = backend ] && echo api || echo frontend)")-$SHORTSHA"
        echo "would run: docker tag kainbain-$c:$TAG docker.io/$KAINBAIN_DOCKERHUB_NAMESPACE/kainbain-$c:$TAG"
        echo "would run: docker push docker.io/$KAINBAIN_DOCKERHUB_NAMESPACE/kainbain-$c:$TAG"
        echo "would run: docker tag kainbain-$c:$TAG docker.io/$KAINBAIN_DOCKERHUB_NAMESPACE/kainbain-$c:latest"
        echo "would run: docker push docker.io/$KAINBAIN_DOCKERHUB_NAMESPACE/kainbain-$c:latest"
        ;;
    esac
  done
  log "dry-run: nothing built, pushed, or written"
  exit 0
fi

# --- Push only now that every flagged component is green --------------------
PUBLISHED=""
for c in $COMPONENTS; do
  case "$c" in
    backend|frontend)
      TAG="$(api_version_of "$([ "$c" = backend ] && echo api || echo frontend)")-$SHORTSHA"
      IMAGE="docker.io/$KAINBAIN_DOCKERHUB_NAMESPACE/kainbain-$c:$TAG"
      docker tag "kainbain-$c:$TAG" "$IMAGE" && docker push "$IMAGE" || exit 1
      docker tag "kainbain-$c:$TAG" "docker.io/$KAINBAIN_DOCKERHUB_NAMESPACE/kainbain-$c:latest" \
        && docker push "docker.io/$KAINBAIN_DOCKERHUB_NAMESPACE/kainbain-$c:latest" || exit 1
      echo "pushed: $IMAGE"
      echo "pushed: docker.io/$KAINBAIN_DOCKERHUB_NAMESPACE/kainbain-$c:latest"
      PUBLISHED="$PUBLISHED $c"
      ;;
    runner) PUBLISHED="$PUBLISHED runner" ;;
  esac
done

# --- Release manifest (carried forward) + history ---------------------------
mkdir -p dist
PUBLISHED="$PUBLISHED" SHORTSHA="$SHORTSHA" FULLSHA="$FULLSHA" NS="${KAINBAIN_DOCKERHUB_NAMESPACE:-}" node <<'NODE'
const fs = require("fs");
const published = process.env.PUBLISHED.trim().split(/\s+/).filter(Boolean);
let manifest = { components: {} };
try { manifest = JSON.parse(fs.readFileSync("dist/release-manifest.json", "utf8")); } catch {}
if (!manifest.components) manifest.components = {};
const now = new Date().toISOString();
const ver = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const short = process.env.SHORTSHA, ns = process.env.NS;
for (const c of published) {
  if (c === "backend") {
    const v = ver("api/version.json");
    manifest.components.backend = { apiVersion: v.apiVersion, image: `docker.io/${ns}/kainbain-backend:${v.apiVersion}-${short}`, tag: `${v.apiVersion}-${short}` };
  } else if (c === "frontend") {
    const v = ver("frontend/version.json");
    manifest.components.frontend = { apiVersion: v.apiVersion, image: `docker.io/${ns}/kainbain-frontend:${v.apiVersion}-${short}`, tag: `${v.apiVersion}-${short}`, requiresBackendApi: v.requires.backendApi };
  } else if (c === "runner") {
    const v = ver("runner/version.json");
    const artifact = `kainbain-runner-${short}.tar.gz`;
    const crypto = require("crypto");
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(`dist/${artifact}`)).digest("hex");
    manifest.components.runner = { apiVersion: v.apiVersion, artifact, sha256, requiresBackendApi: v.requires.backendApi };
  }
}
manifest.publishedAt = now;
manifest.commit = process.env.FULLSHA;
fs.writeFileSync("dist/release-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const line = JSON.stringify({ publishedAt: now, commit: manifest.commit, components: Object.fromEntries(published.map((c) => [c, manifest.components[c]])) });
fs.appendFileSync("dist/release-history.jsonl", line + "\n");
console.log("wrote dist/release-manifest.json");
NODE
log "published:$PUBLISHED"
