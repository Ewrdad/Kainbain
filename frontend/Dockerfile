# KainBain frontend image (MigrationPlan Phase 1 WP-1.1).
#
# Lockstep rule: this image and the backend image are ALWAYS built together
# from the same checkout (`docker compose up --build`). Never mix a
# frontend tag with a backend tag from another commit — the UI shows an
# explicit mismatch banner (VersionMismatchBanner) instead of failing
# obscurely when KAINBAIN_BUILD_REF/VITE_BUILD_REF disagree, but mixed
# tags are unsupported, not merely warned about.

# --- Build stage: install frontend deps, build the SPA ---------------------
FROM node:24-alpine AS build
WORKDIR /build

# The frontend imports ../shared (modelAliases grammar), so shared/ must be
# in context beside frontend/ (same pattern as the root Dockerfile).
COPY .npmrc ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY shared/ ./shared/
COPY frontend/ ./frontend/
COPY .npmrc ./frontend/.npmrc
RUN npm ci --prefix ./frontend

# Empty VITE_API_BASE/VITE_WS_URL = "same origin" (mirrors deploy.sh --prod):
# the UI talks to the origin nginx serves it from, which proxies /api + /ws
# to the backend. VITE_BUILD_REF stamps the frontend side of the
# frontend<->backend lockstep check (backend side is build.json via /status).
ARG VITE_API_BASE=
ARG VITE_WS_URL=
ARG VITE_BUILD_REF=dev
ARG VITE_NOTES_VIEWER_URL=
RUN VITE_API_BASE="$VITE_API_BASE" VITE_WS_URL="$VITE_WS_URL" VITE_BUILD_REF="$VITE_BUILD_REF" VITE_NOTES_VIEWER_URL="$VITE_NOTES_VIEWER_URL" npm run build --prefix ./frontend

# --- Serve stage: nginx statics + same-origin API proxy --------------------
FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/frontend/dist /usr/share/nginx/html
EXPOSE 80
