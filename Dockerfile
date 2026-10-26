# KainBain production image (WP-8).
# Turnkey local deployment: `docker compose up -d` -> http://localhost:3100
#
# Mirrors the `deploy.sh --prod` packaging contract (pruned api/,
# frontend/dist, shared/ minus tests, site-docs/) with two deliberate
# deviations, both documented:
#   - skills/ is shipped read-only so the container boots self-contained
#     (deploy.sh omits it; the host prod path is untouched).
#   - The root dependency tree (Playwright, test-only) is NOT installed;
#     only the api + frontend trees the server needs at run time.
#   - changelog.json is NOT baked (no .git in context); the API reports
#     its handled `not-baked` state.

# --- Build stage: install api + frontend deps, build the frontend ----------
FROM node:24-alpine AS build
WORKDIR /build

# Manifests first for layer caching. The root .npmrc (legacy-peer-deps) must
# sit next to EACH manifest: the frontend tree only resolves in legacy peer
# mode. The opencode tarball resolves via api/package.json's
# `file:../opencode-ai-sdk-1.18.34.tgz` reference, so it must sit next to api/.
COPY .npmrc ./
COPY opencode-ai-sdk-1.18.34.tgz ./
COPY api/package.json api/package-lock.json ./api/
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY .npmrc ./api/.npmrc
COPY .npmrc ./frontend/.npmrc
RUN npm ci --prefix ./api && npm ci --prefix ./frontend

# Sources needed for the frontend production build (it imports ../shared).
# Explicit per-directory COPY only — never `COPY . .` (the root `docs`
# symlink and host state must not enter the image).
COPY api/ ./api/
COPY frontend/ ./frontend/
COPY shared/ ./shared/

# Empty VITE_* means "same origin" (mirrors `deploy.sh --prod`); the API
# serves frontend/dist from the same port, so no absolute URL is baked in.
# Overridable per build with --build-arg when the UI must point elsewhere.
ARG VITE_API_BASE=
ARG VITE_WS_URL=
RUN VITE_API_BASE="$VITE_API_BASE" VITE_WS_URL="$VITE_WS_URL" npm run build --prefix ./frontend

# --- Production stage: pruned runtime + prod deps, non-root server ---------
FROM node:24-alpine

# git: ProjectStore runs `git init` for seeded projects; su-exec: the
# entrypoint fixes bind-mount ownership as root, then drops to `node`.
RUN apk add --no-cache git su-exec

WORKDIR /app

# Prod deps first (layer cache): the tarball must be present during install
# and is removed right after — never shipped with the code.
COPY .npmrc ./
COPY opencode-ai-sdk-1.18.34.tgz ./
COPY api/package.json api/package-lock.json ./api/
COPY .npmrc ./api/.npmrc
RUN npm ci --prefix ./api --omit=dev \
	&& rm -f ./opencode-ai-sdk-1.18.34.tgz ./.npmrc ./api/.npmrc

# Runtime sources, pruned like `deploy.sh --prod` (no tests, docs, coverage).
# The /app/api + /app/shared sibling layout preserves the `../shared/*`
# runtime imports and the KAINBAIN_DIST / KAINBAIN_SITE_DOCS /
# KAINBAIN_SKILLS_DIR default relative resolution.
COPY api/ ./api/
COPY shared/ ./shared/
COPY site-docs/ ./site-docs/
COPY skills/ ./skills/
COPY --from=build /build/frontend/dist ./frontend/dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN find ./api ./shared -not -path "*/node_modules/*" -name "*.test.js" -delete \
	&& rm -rf ./api/docs ./api/coverage ./shared/coverage \
	&& chmod +x ./docker-entrypoint.sh \
	&& mkdir -p /workspace/projects /home/node/.kainbain \
	&& chown -R node:node /app /workspace/projects /home/node/.kainbain

ENV NODE_ENV=production \
	PORT=3100 \
	PROJECTS_ROOT=/workspace/projects \
	NOTES_SPACE_ROOT=/home/node/.kainbain/notes \
	KAINBAIN_DIST=/app/frontend/dist

EXPOSE 3100
# NOTE: 127.0.0.1, NOT localhost — the server binds IPv4-only and BusyBox wget resolves localhost to ::1 without fallback, so a localhost probe always fails. Do not "fix" this back to the ticket-literal localhost.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT:-3100}/status || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "api/index.js"]
