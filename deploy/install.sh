#!/usr/bin/env bash
# install.sh — install KainBain from scratch (new users; not run on the dev host).
# Canonical copy: deploy/install.sh in the repo. The ad-site serves the same
# file at https://kainbain.ewrdad.uk/install.sh (scripts/sync-adsite.sh copies
# it into the site's public/ folder), so:
#   curl -fsSL https://kainbain.ewrdad.uk/install.sh | bash
#   curl -fsSL https://kainbain.ewrdad.uk/install.sh | bash -s -- --port 8080 --runners 2
# It installs: a minimal docker compose stack (backend + frontend, prebuilt
# images only — no source checkout) plus one native local Runner.
# Re-running is safe: an existing .env / runner credential is never
# overwritten unless --force is given.
set -uo pipefail

# --- Defaults (every one overridable from the command line) ------------------
INSTALL_DIR="$HOME/apps/kainbain"
PORT="3100"; FRONTEND_PORT=""; BACKEND_PORT="3100"
RUNNERS=1; RUNNER_ID="local-pi"; HARNESS="auto"; HARNESSES=""; MANUAL=0; HARNESS_SET=0; NO_RUNNER=0
NAMESPACE="${KAINBAIN_DOCKERHUB_NAMESPACE:-ewrdad}"
BACKEND_TAG=""; FRONTEND_TAG=""; IMAGE_TAG=""
RELEASE_URL="https://kainbain.ewrdad.uk"; MANIFEST_URL=""; MANIFEST_FILE=""
PROJECTS_DIR=""; STATE_DIR=""; NOTES_DIR=""
JOIN_TOKEN="${KAINBAIN_RUNNER_JOIN_TOKEN:-}"; CREDENTIAL=""
ADOPT_FROM=""; SEED_DEMO=1
DRY_RUN=0; FORCE=0; NO_START=0; SKIP_PULL=0

usage() { sed -n '2,12p' "$0" 2>/dev/null; cat <<'EOF'
Usage: install.sh [options]
  --install-dir DIR     Install folder (default ~/apps/kainbain)
  --port N              Host port for the web UI (default 3100)
  --frontend-port N     Alias of --port when given (site installer field)
  --backend-port N      Backend container port (default 3100, internal only)
  --runners N           Number of local Runner units to create (default 1; 0 = none)
  --runner-id ID        First Runner id (default local-pi; extras get -2, -3…)
  --harness NAME        Pin one harness (implies --manual)
  --harnesses CSV       Pin a harness list (implies --manual)
  --manual              Pin harnesses instead of auto-detecting
  --auto                Auto-detect harnesses on PATH (default)
  --no-runner           Skip the Runner entirely
  --namespace NS        Docker Hub namespace for images (default ewrdad)
  --tag TAG             Pin both image tags (default: from the release manifest)
  --backend-tag TAG     Pin only the backend tag
  --frontend-tag TAG    Pin only the frontend tag
  --release-url URL     Base URL hosting release-manifest.json + runner tarball
                        (default https://kainbain.ewrdad.uk)
  --manifest-url URL    Full URL of release-manifest.json (default <release-url>/release-manifest.json)
  --manifest FILE       Use a local release-manifest.json instead of downloading
  --projects-dir DIR    Host folder mapped to your projects (default <install>/projects)
  --state-dir DIR       Host folder for KainBain state (default <install>/data)
  --notes-dir DIR       Host folder for notes (default <install>/notes)
  --adopt-from DIR      After the stack is up, adopt git checkouts found one
                        level under DIR (cap 20) as projects. DIR must live
                        under --projects-dir so the backend can see it.
  --seed-demo           Seed a starter project when the store is empty
                        (default; disable with --no-seed)
  --no-seed             Do not seed a starter project
  --join-token TOKEN    Runner join token (default: read ~/.kainbain/runner-join.token, else generated note)
  --credential TOKEN    Runner credential if you already approved one (written to the runner env)
  --no-start            Write files and pull images, but do not start anything
  --skip-pull           Do not docker pull (use images already present)
  --dry-run             Print every action, change nothing
  --force               Overwrite an existing .env / compose file / runner env
  -h, --help            This help
Exit codes: 0 installed (or already installed), 1 failed, 2 usage/prerequisite error.
EOF
}
while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) shift; INSTALL_DIR="${1:?--install-dir needs a value}" ;;
    --install-dir=*) INSTALL_DIR="${1#--install-dir=}" ;;
    --port) shift; PORT="${1:?--port needs a value}" ;;
    --port=*) PORT="${1#--port=}" ;;
    --frontend-port) shift; FRONTEND_PORT="${1:?--frontend-port needs a value}" ;;
    --frontend-port=*) FRONTEND_PORT="${1#--frontend-port=}" ;;
    --backend-port) shift; BACKEND_PORT="${1:?--backend-port needs a value}" ;;
    --backend-port=*) BACKEND_PORT="${1#--backend-port=}" ;;
    --runners) shift; RUNNERS="${1:?--runners needs a value}" ;;
    --runners=*) RUNNERS="${1#--runners=}" ;;
    --runner-id) shift; RUNNER_ID="${1:?--runner-id needs a value}" ;;
    --runner-id=*) RUNNER_ID="${1#--runner-id=}" ;;
    --harness) shift; HARNESS="${1:?--harness needs a value}"; HARNESS_SET=1 ;;
    --harness=*) HARNESS="${1#--harness=}"; HARNESS_SET=1 ;;
    --harnesses) shift; HARNESSES="${1:?--harnesses needs a value}"; HARNESS_SET=1 ;;
    --harnesses=*) HARNESSES="${1#--harnesses=}"; HARNESS_SET=1 ;;
    --manual) MANUAL=1 ;; --auto) MANUAL=0; HARNESS="auto"; HARNESSES=""; HARNESS_SET=0 ;;
    --no-runner) NO_RUNNER=1 ;;
    --namespace) shift; NAMESPACE="${1:?--namespace needs a value}" ;;
    --namespace=*) NAMESPACE="${1#--namespace=}" ;;
    --tag) shift; IMAGE_TAG="${1:?--tag needs a value}" ;;
    --tag=*) IMAGE_TAG="${1#--tag=}" ;;
    --backend-tag) shift; BACKEND_TAG="${1:?--backend-tag needs a value}" ;;
    --backend-tag=*) BACKEND_TAG="${1#--backend-tag=}" ;;
    --frontend-tag) shift; FRONTEND_TAG="${1:?--frontend-tag needs a value}" ;;
    --frontend-tag=*) FRONTEND_TAG="${1#--frontend-tag=}" ;;
    --release-url) shift; RELEASE_URL="${1:?--release-url needs a value}" ;;
    --release-url=*) RELEASE_URL="${1#--release-url=}" ;;
    --manifest-url) shift; MANIFEST_URL="${1:?--manifest-url needs a value}" ;;
    --manifest-url=*) MANIFEST_URL="${1#--manifest-url=}" ;;
    --manifest) shift; MANIFEST_FILE="${1:?--manifest needs a file}" ;;
    --manifest=*) MANIFEST_FILE="${1#--manifest=}" ;;
    --projects-dir) shift; PROJECTS_DIR="${1:?--projects-dir needs a value}" ;;
    --projects-dir=*) PROJECTS_DIR="${1#--projects-dir=}" ;;
    --state-dir) shift; STATE_DIR="${1:?--state-dir needs a value}" ;;
    --state-dir=*) STATE_DIR="${1#--state-dir=}" ;;
    --notes-dir) shift; NOTES_DIR="${1:?--notes-dir needs a value}" ;;
    --notes-dir=*) NOTES_DIR="${1#--notes-dir=}" ;;
    --adopt-from) shift; ADOPT_FROM="${1:?--adopt-from needs a value}" ;;
    --adopt-from=*) ADOPT_FROM="${1#--adopt-from=}" ;;
    --seed-demo) SEED_DEMO=1 ;;
    --no-seed) SEED_DEMO=0 ;;
    --join-token) shift; JOIN_TOKEN="${1:?--join-token needs a value}" ;;
    --join-token=*) JOIN_TOKEN="${1#--join-token=}" ;;
    --credential) shift; CREDENTIAL="${1:?--credential needs a value}" ;;
    --credential=*) CREDENTIAL="${1#--credential=}" ;;
    --no-start) NO_START=1 ;; --skip-pull) SKIP_PULL=1 ;;
    --dry-run) DRY_RUN=1 ;; --force) FORCE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install.sh: unknown argument: $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$FRONTEND_PORT" ] && PORT="$FRONTEND_PORT"
[ "$NO_RUNNER" = "1" ] && RUNNERS=0
if [ "$HARNESS_SET" = "1" ] && [ "$MANUAL" = "0" ]; then
  if [ -n "$HARNESSES" ]; then case "$HARNESSES" in *[aA][uU][tT][oO]*) ;; *) MANUAL=1;; esac
  elif [ "$(printf '%s' "$HARNESS" | tr '[:upper:]' '[:lower:]')" != "auto" ]; then MANUAL=1; fi
fi
if [ "$MANUAL" = "1" ]; then
  if [ -z "$HARNESSES" ]; then
    if [ "$HARNESS_SET" = "0" ] || [ "$(printf '%s' "$HARNESS" | tr '[:upper:]' '[:lower:]')" = "auto" ]; then
      echo "install.sh: --manual requires --harness NAME or --harnesses CSV" >&2; exit 2
    fi
    HARNESSES="$HARNESS"
  fi
  case "$HARNESSES" in *[aA][uU][tT][oO]*) echo "install.sh: --manual cannot be combined with auto" >&2; exit 2;; esac
  HARNESS_DESC="$HARNESSES (manual)"
else
  HARNESS_DESC="auto-detect"
fi
STARTER_HARNESS_ARGS=()
if [ "$MANUAL" = "1" ]; then STARTER_HARNESS_ARGS=(--manual --harnesses "$HARNESSES"); fi
case "$RUNNERS" in *[!0-9]*|'') echo "install.sh: --runners must be a non-negative integer" >&2; exit 2 ;; esac
[ -z "$MANIFEST_URL" ] && MANIFEST_URL="${RELEASE_URL%/}/release-manifest.json"
PROJECTS_DIR="${PROJECTS_DIR:-$INSTALL_DIR/projects}"; STATE_DIR="${STATE_DIR:-$INSTALL_DIR/data}"; NOTES_DIR="${NOTES_DIR:-$INSTALL_DIR/notes}"

log() { echo "install: $*"; }
run() { if [ "$DRY_RUN" = "1" ]; then echo "would run: $*"; else echo "+ $*"; "$@"; fi; }
field() { node -e 'try{const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=m?.components?.[process.argv[2]]?.[process.argv[3]];if(v!==undefined&&v!==null)console.log(v)}catch{}' "$1" "$2" "$3"; }

# --- Prerequisites ------------------------------------------------------------
for t in docker curl node; do command -v "$t" >/dev/null 2>&1 || { echo "install.sh: required tool '$t' not found — install it first (Docker Engine + compose plugin, curl, Node 20+)" >&2; exit 2; }; done
docker compose version >/dev/null 2>&1 || { echo "install.sh: 'docker compose' plugin not found" >&2; exit 2; }
log "installing to $INSTALL_DIR (UI port $PORT, runners: $RUNNERS x $HARNESS_DESC, namespace $NAMESPACE)"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
MANIFEST="$WORK/release-manifest.json"
if [ -n "$MANIFEST_FILE" ]; then cp "$MANIFEST_FILE" "$MANIFEST" || { echo "install.sh: cannot read --manifest $MANIFEST_FILE" >&2; exit 1; }
else run curl -fsSL "$MANIFEST_URL" -o "$MANIFEST" || { echo "install.sh: failed to fetch $MANIFEST_URL — check --release-url/--manifest-url, or pass --manifest FILE" >&2; exit 1; }; fi
if [ "$DRY_RUN" != "1" ]; then
  BIMG="$(field "$MANIFEST" backend image)"; BTAG="$(field "$MANIFEST" backend tag)"
  FIMG="$(field "$MANIFEST" frontend image)"; FTAG="$(field "$MANIFEST" frontend tag)"
  ARTIFACT="$(field "$MANIFEST" runner artifact)"; RSHA="$(field "$MANIFEST" runner sha256)"
else BIMG=""; BTAG=""; FIMG=""; FTAG=""; ARTIFACT="kainbain-runner-<sha>.tar.gz"; RSHA=""; fi
# --namespace/--tag overrides beat the manifest's recorded images.
[ -n "$IMAGE_TAG" ] && { BTAG="$IMAGE_TAG"; FTAG="$IMAGE_TAG"; }
[ -n "$BACKEND_TAG" ] && BTAG="$BACKEND_TAG"; [ -n "$FRONTEND_TAG" ] && FTAG="$FRONTEND_TAG"
BREPO="docker.io/$NAMESPACE/kainbain-backend"; FREPO="docker.io/$NAMESPACE/kainbain-frontend"
[ -n "$BIMG" ] && BREPO="${BIMG%:*}"; [ -n "$FIMG" ] && FREPO="${FIMG%:*}"
BTAG="${BTAG:-latest}"; FTAG="${FTAG:-latest}"
log "backend $BREPO:$BTAG / frontend $FREPO:$FTAG / runner ${ARTIFACT:-none}"

# --- Install folder: compose + .env + helper scripts --------------------------
run mkdir -p "$INSTALL_DIR" "$PROJECTS_DIR" "$STATE_DIR" "$NOTES_DIR"
if [ -f "$INSTALL_DIR/docker-compose.yml" ] && [ "$FORCE" != "1" ] && [ "$DRY_RUN" != "1" ]; then
  log "docker-compose.yml already exists — leaving it (use --force to overwrite; use update.sh to upgrade)"
else
  if [ "$DRY_RUN" = "1" ]; then echo "would write: $INSTALL_DIR/docker-compose.yml (backend+frontend, prebuilt images)";
  else cat > "$INSTALL_DIR/docker-compose.yml" <<'YAML'
# KainBain production install (written by install.sh). Prebuilt images only.
services:
  backend:
    image: ${KAINBAIN_BACKEND_IMAGE:-kainbain-backend}:${KAINBAIN_BACKEND_TAG:-${KAINBAIN_IMAGE_TAG:-latest}}
    expose: ["3100"]
    env_file: [{ path: .env, required: false }]
    environment:
      NODE_ENV: production
      PORT: "3100"
      PROJECTS_ROOT: ${KAINBAIN_PROJECTS_CONTAINER_PATH:-/workspace/projects}
      NOTES_SPACE_ROOT: ${KAINBAIN_NOTES_CONTAINER_PATH:-/home/node/.kainbain/notes}
      KAINBAIN_DIST: /app/frontend/dist
      KAINBAIN_BUILD_REF: ${KAINBAIN_IMAGE_TAG:-latest}
    volumes:
      - ${KAINBAIN_PROJECTS_HOST:-./projects}:${KAINBAIN_PROJECTS_CONTAINER_PATH:-/workspace/projects}
      - ${KAINBAIN_STATE_HOST:-./data}:/home/node/.kainbain
      - ${KAINBAIN_NOTES_HOST:-./notes}:${KAINBAIN_NOTES_CONTAINER_PATH:-/home/node/.kainbain/notes}
    restart: unless-stopped
  frontend:
    image: ${KAINBAIN_FRONTEND_IMAGE:-kainbain-frontend}:${KAINBAIN_FRONTEND_TAG:-${KAINBAIN_IMAGE_TAG:-latest}}
    ports: ["${KAINBAIN_PORT:-3100}:80"]
    depends_on: [backend]
    restart: unless-stopped
YAML
  fi
fi
if [ -f "$INSTALL_DIR/.env" ] && [ "$FORCE" != "1" ] && [ "$DRY_RUN" != "1" ]; then
  log ".env already exists — leaving it untouched"
elif [ "$DRY_RUN" = "1" ]; then
  echo "would write: $INSTALL_DIR/.env (mode 600, no secrets printed)"
  if [ -z "$JOIN_TOKEN" ] && [ ! -f "$HOME/.kainbain/runner-join.token" ]; then
    echo "would generate: a runner join token into $HOME/.kainbain/runner-join.token (mode 600) so the Runner self-registers"
  fi
  [ "$RUNNERS" -gt 0 ] && echo "would write: KAINBAIN_EXPECTED_RUNNER_ID=$RUNNER_ID into $INSTALL_DIR/.env so first-run UI waits for it by name"
else
  [ -z "$JOIN_TOKEN" ] && [ -f "$HOME/.kainbain/runner-join.token" ] && JOIN_TOKEN="$(cat "$HOME/.kainbain/runner-join.token")"
  if [ -z "$JOIN_TOKEN" ]; then
    # Fresh box, no token anywhere: mint one and persist it where both
    # sides read it — .env for the backend, the token file for
    # startRunner.sh — so the Runner registers as pending with zero
    # manual steps (never printed: it is a secret).
    JOIN_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
    mkdir -p "$HOME/.kainbain"; printf '%s' "$JOIN_TOKEN" > "$HOME/.kainbain/runner-join.token"; chmod 600 "$HOME/.kainbain/runner-join.token"
    log "generated a runner join token into $HOME/.kainbain/runner-join.token (mode 600)"
  elif [ ! -f "$HOME/.kainbain/runner-join.token" ]; then
    # Explicit --join-token (or env): share it with startRunner.sh via
    # the token file so both sides agree (never overwrite an existing
    # file — warn instead, below).
    mkdir -p "$HOME/.kainbain"; printf '%s' "$JOIN_TOKEN" > "$HOME/.kainbain/runner-join.token"; chmod 600 "$HOME/.kainbain/runner-join.token"
    log "shared the provided join token with $HOME/.kainbain/runner-join.token (mode 600)"
  elif [ "$(cat "$HOME/.kainbain/runner-join.token")" != "$JOIN_TOKEN" ]; then
    echo "install.sh: WARN --join-token differs from $HOME/.kainbain/runner-join.token (backend uses --join-token; the Runner reads the file) — align them or the Runner cannot register" >&2
  fi
  { echo "KAINBAIN_PORT=$PORT"; echo "KAINBAIN_BACKEND_IMAGE=$BREPO"; echo "KAINBAIN_BACKEND_TAG=$BTAG"
    echo "KAINBAIN_FRONTEND_IMAGE=$FREPO"; echo "KAINBAIN_FRONTEND_TAG=$FTAG"
    echo "KAINBAIN_PROJECTS_HOST=$PROJECTS_DIR"; echo "KAINBAIN_STATE_HOST=$STATE_DIR"; echo "KAINBAIN_NOTES_HOST=$NOTES_DIR"
    echo "KAINBAIN_SEED_DEMO=$SEED_DEMO"
    [ -n "$JOIN_TOKEN" ] && echo "KAINBAIN_RUNNER_JOIN_TOKEN=$JOIN_TOKEN"
    [ "$RUNNERS" -gt 0 ] && echo "KAINBAIN_EXPECTED_RUNNER_ID=$RUNNER_ID"; } > "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"; log "wrote $INSTALL_DIR/.env"
fi
if [ "$DRY_RUN" = "1" ]; then echo "would copy: release-manifest.json into $INSTALL_DIR; would download update.sh + redeploy.sh from ${RELEASE_URL%/}/";
else cp "$MANIFEST" "$INSTALL_DIR/release-manifest.json"; log "wrote release-manifest.json"
  for h in update.sh redeploy.sh; do curl -fsSL "${RELEASE_URL%/}/$h" -o "$INSTALL_DIR/$h" && chmod +x "$INSTALL_DIR/$h" && log "installed $h" || echo "install.sh: WARN could not fetch $h from ${RELEASE_URL%/}/ (upgrade later with update.sh once it is in place)" >&2; done; fi

# --- Pull + start the stack ----------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then [ "$SKIP_PULL" != "1" ] && echo "would run: (cd $INSTALL_DIR && docker compose pull)"; [ "$NO_START" != "1" ] && echo "would run: (cd $INSTALL_DIR && docker compose up -d)";
elif [ "$SKIP_PULL" != "1" ]; then (cd "$INSTALL_DIR" && run docker compose pull) || { echo "install.sh: image pull failed — check --namespace/--tag and your Docker Hub login" >&2; exit 1; }; fi
if [ "$DRY_RUN" = "1" ]; then :;
elif [ "$NO_START" = "1" ]; then log "--no-start: stack not started. Start it with: (cd $INSTALL_DIR && docker compose up -d)";
else (cd "$INSTALL_DIR" && run docker compose up -d) || { echo "install.sh: docker compose up failed" >&2; exit 1; }
  if [ "$DRY_RUN" != "1" ]; then
    ok=0; for _ in $(seq 1 30); do curl -sf "http://localhost:$PORT/status" >/dev/null 2>&1 && { ok=1; break; }; sleep 2; done
    [ "$ok" = "1" ] && log "healthy: http://localhost:$PORT/status" || { echo "install.sh: stack started but /status did not answer on port $PORT within 60s — check: (cd $INSTALL_DIR && docker compose logs)" >&2; exit 1; }
  fi
fi

# --- Adopt existing checkouts (--adopt-from) -------------------------------------
adopt_checkouts() {
  # Scans $ADOPT_FROM one level deep for .git children (cap 20) and
  # registers each with the fresh backend. Best-effort: a failed
  # adoption warns but never fails the install (the UI offers the same
  # repos via one-click adoption). $1 = 1 for dry-run (plan only).
  local dry="$1" found=0 adopted=0 skipped=0
  local abs_adopt abs_projects
  abs_adopt="$(cd "$ADOPT_FROM" 2>/dev/null && pwd)" || { echo "install.sh: WARN --adopt-from $ADOPT_FROM is not a directory — skipping adoption" >&2; return 0; }
  abs_projects="$(cd "$PROJECTS_DIR" 2>/dev/null && pwd || printf '%s' "$PROJECTS_DIR")"
  case "$abs_adopt/" in
    "$abs_projects/"*)
      for child in "$abs_adopt"/*/; do
        [ -d "$child" ] || continue
        [ -e "${child}.git" ] || continue
        found=$((found+1))
        [ "$found" -gt 20 ] && { echo "install.sh: --adopt-from capped at 20 checkouts (skipping the rest)" >&2; break; }
        # The backend sees host $PROJECTS_DIR at /workspace/projects
        # (compose default); translate so the registered path resolves
        # inside the container.
        rel="${child#$abs_adopt/}"; rel="${rel%/}"
        middle="${abs_adopt#$abs_projects}"; middle="${middle#/}"
        [ -n "$middle" ] && middle="$middle/"
        cpath="/workspace/projects/$middle$rel"
        if [ "$dry" = "1" ]; then
          echo "would adopt: $child (as $cpath)"
          adopted=$((adopted+1))
        else
          payload="$(node -e 'console.log(JSON.stringify({path: process.argv[1]}))' "$cpath")"
          if curl -fsS -X POST "http://localhost:$PORT/projects/register" -H 'Content-Type: application/json' --data "$payload" >/dev/null 2>&1; then
            log "adopted $child"; adopted=$((adopted+1))
          else
            echo "install.sh: WARN could not adopt $child (backend refused it) — adopt it later from the UI" >&2; skipped=$((skipped+1))
          fi
        fi
      done
      ;;
    *)
      echo "install.sh: WARN --adopt-from $ADOPT_FROM is outside --projects-dir $PROJECTS_DIR, so the backend cannot see it — skipping adoption (point --projects-dir at it, or adopt from the UI later)" >&2
      return 0
      ;;
  esac
  [ "$found" = "0" ] && { [ "$dry" = "1" ] && echo "would adopt: nothing (no git checkouts under $ADOPT_FROM)"; return 0; }
  [ "$dry" = "1" ] && echo "would adopt: $adopted checkout(s) under $ADOPT_FROM via POST /projects/register"
  return 0
}
if [ -n "$ADOPT_FROM" ]; then
  if [ "$DRY_RUN" = "1" ]; then adopt_checkouts 1
  elif [ "$NO_START" = "1" ]; then log "--adopt-from skipped with --no-start (adopt from the UI once the stack is up)"
  else adopt_checkouts 0; fi
fi

# --- Runner(s): download the tarball, verify sha256, hand to startRunner.sh ---
if [ "$RUNNERS" -gt 0 ]; then
  if [ -z "$ARTIFACT" ] || [ -z "$RSHA" ]; then echo "install.sh: manifest names no runner artifact/sha256 — skipping Runner (re-run with a complete manifest)" >&2;
  elif [ "$DRY_RUN" = "1" ]; then echo "would download: ${RELEASE_URL%/}/$ARTIFACT (sha256 verified), extract to $INSTALL_DIR/runner, then start $RUNNERS runner(s) via startRunner.sh";
  else
    run curl -fsSL "${RELEASE_URL%/}/$ARTIFACT" -o "$INSTALL_DIR/$ARTIFACT" || { echo "install.sh: failed to download runner tarball ${RELEASE_URL%/}/$ARTIFACT" >&2; exit 1; }
    actual="$(sha256sum "$INSTALL_DIR/$ARTIFACT" | awk '{print $1}')"
    [ "$actual" = "$RSHA" ] || { echo "install.sh: runner sha256 mismatch (manifest $RSHA, file $actual) — refusing to install it" >&2; exit 1; }
    log "runner tarball verified (sha256)"
    tmp="$(mktemp -d)"; tar -xzf "$INSTALL_DIR/$ARTIFACT" -C "$tmp"
    rm -rf "$INSTALL_DIR/runner"; mv "$tmp/runner" "$INSTALL_DIR/runner"; cp "$tmp/startRunner.sh" "$INSTALL_DIR/startRunner.sh"; chmod +x "$INSTALL_DIR/startRunner.sh"; rm -rf "$tmp"
    i=1; while [ "$i" -le "$RUNNERS" ]; do
      id="$RUNNER_ID"; [ "$i" -gt 1 ] && id="$RUNNER_ID-$i"
      (cd "$INSTALL_DIR" && ./startRunner.sh --id "$id" "${STARTER_HARNESS_ARGS[@]}" --backend "http://localhost:$PORT") || echo "install.sh: WARN runner $id did not start (see output above)" >&2
      i=$((i+1))
    done
  fi
fi
log "done. Open http://localhost:$PORT — then approve the Runner in Settings > Harness > Runners (one click: it collects its own credential, no paste needed)."
log "Upgrades later: (cd $INSTALL_DIR && ./update.sh)  — get update.sh/redeploy.sh from ${RELEASE_URL%/}/update.sh if they are not beside this script."
