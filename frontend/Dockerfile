# KainBain frontend image. Independently versioned (AsymmetricUpdatesPlan):
# this image may deploy against any backend inside the API range declared
# in frontend/version.json (baked in as VITE_BACKEND_API_RANGE by the
# publish build). The UI banner names both versions when /status reports a
# backend apiVersion outside that range; commits are diagnostics only.

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

# Empty VITE_API_BASE/VITE_WS_URL = "same origin": the UI talks to the
# origin nginx serves it from, which proxies /api + /ws to the backend.
# VITE_BUILD_REF is a diagnostics stamp; VITE_BACKEND_API_RANGE carries the
# compatibility contract checked against /status build.apiVersion.
ARG VITE_API_BASE=
ARG VITE_WS_URL=
ARG VITE_BUILD_REF=dev
ARG VITE_BACKEND_API_RANGE=
ARG VITE_NOTES_VIEWER_URL=
RUN VITE_API_BASE="$VITE_API_BASE" VITE_WS_URL="$VITE_WS_URL" VITE_BUILD_REF="$VITE_BUILD_REF" VITE_BACKEND_API_RANGE="$VITE_BACKEND_API_RANGE" VITE_NOTES_VIEWER_URL="$VITE_NOTES_VIEWER_URL" npm run build --prefix ./frontend

# --- Serve stage: nginx statics + same-origin API proxy --------------------
FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/frontend/dist /usr/share/nginx/html
EXPOSE 80
