#!/usr/bin/env bash
# redeploy.sh — pull and restart one component, per component, on this host.
# Lives in ~/apps/kainbain/ beside docker-compose.yml (template committed at
# deploy/redeploy.sh; install once by hand). It never builds and never runs
# tests; publishing is publish.sh's job (AsymmetricUpdatesPlan DA5).
#
# Runner transport is deliberately boring: redeploy.sh --runner expects
# ./kainbain-runner-<shortsha>.tar.gz beside it (copy it from the publishing
# checkout's dist/ by whatever means you already use). Its sha256 is verified
# against ./release-manifest.json before anything changes.
#
#   ./redeploy.sh [--backend|--frontend|--runner|--all] [--tag <tag>]
#                 [--dry-run] [--check] [--init]
# Default is --all. --tag pins one component's tag (single-component only).
set -uo pipefail
cd "$(dirname "$0")"

COMPONENT="all"; TAG=""; DRY_RUN=0; CHECK=0; INIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --backend) COMPONENT="backend" ;;
    --frontend) COMPONENT="frontend" ;;
    --runner) COMPONENT="runner" ;;
    --all) COMPONENT="all" ;;
    --tag) shift; TAG="${1:-}" ;;
    --dry-run) DRY_RUN=1 ;;
    --check) CHECK=1 ;;
    --init) INIT=1 ;;
    *) echo "redeploy.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
if [ -n "$TAG" ] && [ "$COMPONENT" != "backend" ] && [ "$COMPONENT" != "frontend" ]; then
  echo "redeploy.sh: --tag is only valid with a single --backend or --frontend flag" >&2; exit 2
fi

log() { echo "redeploy: $*"; }
# run echoes in dry-run, executes otherwise.
run() { if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi; }
record() { # component old new result
  [ "$DRY_RUN" = "1" ] && return 0
  printf '%s %s %s -> %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "$3" "$4" >> ./redeploy.log
}

get_env() { # key -> value (empty when absent)
  [ -f ./.env ] || return 0
  grep -E "^$1=" ./.env 2>/dev/null | head -1 | cut -d= -f2-
}
set_env() { # key value — targeted edit, preserves every other line byte-for-byte
  local key="$1" value="$2"
  if grep -qE "^${key}=" ./.env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" ./.env
  else
    printf '%s=%s\n' "$key" "$value" >> ./.env
  fi
}
unset_env() { sed -i "/^$1=/d" ./.env; }

manifest_get() { # component field
  node -e '
const fs = require("fs");
try {
  const m = JSON.parse(fs.readFileSync("./release-manifest.json", "utf8"));
  const v = m?.components?.[process.argv[1]]?.[process.argv[2]];
  if (v !== undefined && v !== null) console.log(v);
} catch {}' "$1" "$2"
}
manifest_commit() {
  node -e '
const fs = require("fs");
try { const m = JSON.parse(fs.readFileSync("./release-manifest.json", "utf8")); if (m.commit) console.log(m.commit); } catch {}'
}

compat_check() { # returns 0 ok/warned, 1 incompatible-when-checker-found
  local checker=""
  if [ -n "${KAINBAIN_REPO_DIR:-}" ] && [ -f "$KAINBAIN_REPO_DIR/scripts/check-component-compat.mjs" ]; then
    checker="$KAINBAIN_REPO_DIR/scripts/check-component-compat.mjs"
  fi
  if [ -z "$checker" ]; then
    echo "WARN: compat check skipped (checker not found)" >&2
    return 0
  fi
  if [ ! -f ./release-manifest.json ]; then
    echo "WARN: compat check skipped (no release-manifest.json)" >&2
    return 0
  fi
  node "$checker" --manifest ./release-manifest.json
}

health_poll() { # deploy.sh health_check budget: 30 attempts, 2s apart
  local attempts="${KAINBAIN_HEALTH_ATTEMPTS:-30}" delay="${KAINBAIN_HEALTH_DELAY:-2}"
  local port; port="$(get_env KAINBAIN_PORT | grep -E '^[0-9]+$' || true)"; port="${port:-3100}"
  local url="${KAINBAIN_HEALTH_URL:-http://localhost:$port/status}"
  local i
  for i in $(seq 1 "$attempts"); do
    if curl -sf "$url" >/dev/null 2>&1; then return 0; fi
    sleep "$delay"
  done
  return 1
}

# --- --init: one-time, idempotent migration ---------------------------------
if [ "$INIT" = "1" ]; then
  changed=0
  if [ ! -f ./release-manifest.json ]; then
    legacy_tag="$(get_env KAINBAIN_IMAGE_TAG)"; legacy_tag="${legacy_tag:-latest}"
    backend_image="$(docker compose images backend 2>/dev/null | awk 'NR==2{print $2":"$3}')"
    frontend_image="$(docker compose images frontend 2>/dev/null | awk 'NR==2{print $2":"$3}')"
    BACKEND_IMAGE="${backend_image:-kainbain-backend:$legacy_tag}" \
    FRONTEND_IMAGE="${frontend_image:-kainbain-frontend:$legacy_tag}" \
    node <<'NODE'
const fs = require("fs");
const split = (img) => {
  const i = img.lastIndexOf(":");
  return i > img.lastIndexOf("/") ? { image: img, tag: img.slice(i + 1) } : { image: `${img}:latest`, tag: "latest" };
};
const b = split(process.env.BACKEND_IMAGE), f = split(process.env.FRONTEND_IMAGE);
const manifest = {
  publishedAt: new Date().toISOString(),
  commit: null,
  components: {
    backend: { apiVersion: "1.0.0", image: b.image, tag: b.tag },
    frontend: { apiVersion: "1.0.0", image: f.image, tag: f.tag, requiresBackendApi: ">=1.0.0 <2.0.0" },
    runner: { apiVersion: "1.0.0", requiresBackendApi: ">=1.0.0 <2.0.0" },
  },
};
fs.writeFileSync("./release-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`seeded release-manifest.json: backend ${b.image}, frontend ${f.image}`);
NODE
    changed=1
  fi
  legacy_tag="$(get_env KAINBAIN_IMAGE_TAG)"; legacy_tag="${legacy_tag:-latest}"
  for key in KAINBAIN_BACKEND_TAG KAINBAIN_FRONTEND_TAG; do
    if [ -z "$(get_env "$key")" ]; then
      if [ "$DRY_RUN" = "1" ]; then echo "would set: $key=$legacy_tag";
      else set_env "$key" "$legacy_tag"; echo "added: $key=$legacy_tag"; fi
      changed=1
    fi
  done
  [ "$changed" = "0" ] && log "init: nothing to do (already initialised)"
  exit 0
fi

# --- --check: compat-check the recorded manifest, change nothing ------------
if [ "$CHECK" = "1" ]; then
  compat_check
  exit $?
fi

if [ ! -f ./release-manifest.json ]; then
  echo "redeploy.sh: ./release-manifest.json not found — run ./redeploy.sh --init once, then copy the manifest from the publishing checkout" >&2
  exit 1
fi
if ! compat_check; then
  echo "redeploy.sh: recorded component combination is incompatible — refusing to change anything" >&2
  exit 1
fi

deploy_service() { # backend|frontend
  local c="$1" upper image tag repo old_image old_tag
  upper="$(printf '%s' "$c" | tr 'a-z' 'A-Z')"
  image="$(manifest_get "$c" image)"
  tag="$(manifest_get "$c" tag)"
  if [ -z "$image" ] || [ -z "$tag" ]; then
    echo "redeploy.sh: manifest has no $c image/tag recorded" >&2; return 1
  fi
  repo="${image%:*}"
  [ -n "$TAG" ] && tag="$TAG"
  old_image="$(get_env "KAINBAIN_${upper}_IMAGE")"
  old_tag="$(get_env "KAINBAIN_${upper}_TAG")"
  log "$c: ${old_image:-kainbain-$c}:${old_tag:-$(get_env KAINBAIN_IMAGE_TAG)} -> $repo:$tag"
  if [ "$DRY_RUN" != "1" ]; then
    set_env "KAINBAIN_${upper}_IMAGE" "$repo"
    set_env "KAINBAIN_${upper}_TAG" "$tag"
  else
    echo "would set: KAINBAIN_${upper}_IMAGE=$repo"
    echo "would set: KAINBAIN_${upper}_TAG=$tag"
  fi
  if ! run docker compose pull "$c"; then record "$c" "${old_tag:-?}" "$tag" "PULL_FAILED"; return 1; fi
  if ! run docker compose up -d --no-deps "$c"; then record "$c" "${old_tag:-?}" "$tag" "UP_FAILED"; return 1; fi
  if [ "$DRY_RUN" = "1" ]; then record "$c" "${old_tag:-?}" "$tag" "DRY_RUN"; return 0; fi
  if health_poll; then
    record "$c" "${old_tag:-?}" "$tag" "OK"
    if [ "$c" = "backend" ]; then
      COMMIT="$(manifest_commit)" node <<'NODE'
const fs = require("fs");
let build = {};
try { build = JSON.parse(fs.readFileSync("./build.json", "utf8")); } catch {}
build.deployedAt = new Date().toISOString();
if (process.env.COMMIT) build.commit = process.env.COMMIT;
fs.writeFileSync("./build.json", JSON.stringify(build, null, 2) + "\n");
NODE
    fi
    log "$c redeployed: $tag"
    return 0
  fi
  echo "redeploy.sh: $c health check failed — rolling back to ${old_tag:-previous tag}" >&2
  if [ -n "$old_image" ]; then set_env "KAINBAIN_${upper}_IMAGE" "$old_image"; else unset_env "KAINBAIN_${upper}_IMAGE"; fi
  if [ -n "$old_tag" ]; then set_env "KAINBAIN_${upper}_TAG" "$old_tag"; else unset_env "KAINBAIN_${upper}_TAG"; fi
  docker compose up -d --no-deps "$c" || true
  record "$c" "$tag" "${old_tag:-?}" "ROLLED_BACK"
  echo "ROLLED BACK to ${old_tag:-previous tag}" >&2
  return 1
}

deploy_runner() {
  local artifact expected actual
  artifact="$(manifest_get runner artifact)"
  expected="$(manifest_get runner sha256)"
  if [ -z "$artifact" ] || [ -z "$expected" ]; then
    echo "redeploy.sh: manifest has no runner artifact/sha256 recorded" >&2; return 1
  fi
  if [ ! -f "./$artifact" ]; then
    echo "redeploy.sh: ./$artifact not found — copy it from the publishing checkout's dist/ first" >&2; return 1
  fi
  actual="$(sha256sum "./$artifact" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "redeploy.sh: sha256 mismatch for $artifact (manifest $expected, file $actual) — changing nothing" >&2
    return 1
  fi
  log "runner: verified $artifact sha256"
  if [ "$DRY_RUN" = "1" ]; then
    echo "would run: replace ./runner + ./startRunner.sh from $artifact (backup to ./runner.prev/)"
    echo "would run: ./startRunner.sh --restart"
    return 0
  fi
  local tmp; tmp="$(mktemp -d)"
  tar -xzf "./$artifact" -C "$tmp" || { rm -rf "$tmp"; return 1; }
  rm -rf ./runner.prev
  [ -d ./runner ] && mv ./runner ./runner.prev
  mv "$tmp/runner" ./runner
  cp "$tmp/startRunner.sh" ./startRunner.sh && chmod +x ./startRunner.sh
  rm -rf "$tmp"
  ./startRunner.sh --restart
  record runner "-" "$artifact" "OK"
  log "runner redeployed from $artifact"
}

rc=0
case "$COMPONENT" in
  backend) deploy_service backend || rc=1 ;;
  frontend) deploy_service frontend || rc=1 ;;
  runner) deploy_runner || rc=1 ;;
  all)
    deploy_service backend || rc=1
    deploy_service frontend || rc=1
    deploy_runner || rc=1
    ;;
esac
exit $rc
