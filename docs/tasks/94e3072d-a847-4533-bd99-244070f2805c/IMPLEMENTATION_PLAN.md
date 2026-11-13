# IMPLEMENTATION PLAN — OpenID/OAuth organisational access control (RBAC, togglable)

**Task:** `94e3072d-a847-4533-bd99-244070f2805c`
**Stage:** Plan (this document). No production code changes in this stage.
**Inputs:** task brief + `SURVEY.md` (grill-me survey, round 1 answers incorporated below).

---

## 1. Goal and non-goals

**Goal:** add a togglable, organisation-level user-control layer to KainBain built on
OpenID Connect (OIDC) sign-in and role-based access control (RBAC), so a small/medium
company can integrate KainBain with its existing account infrastructure (IdP).

- **Default OFF.** When disabled, behaviour is byte-identical to today: every request
  is attributed to a shared built-in `admin` user, no login screen exists (survey q1).
- **Single tenant.** One organisation per installation (survey q2).
- **Proof-of-concept scope only.** Generic OIDC provider sign-in (survey q3), JIT
  auto-provisioning of user records on first sign-in with **no local password
  accounts** — we process the IdP's JWTs directly (survey q4 note), roles assignable
  **directly on users and via IdP groups** (survey q5, q6: groups come from IdP
  claims), project-level role assignments supported in the model (survey q8), and a
  minimal built-in role catalogue to prove RBAC (survey q7 mandates `admin`; we ship
  a tiny data-driven set — `admin` + `member` + `viewer` — so the model is
  demonstrable and trivially expanded later).
- **Non-goals (later stages):** native LDAP bind (covered via OIDC fronts — see §2.1),
  multi-tenancy, SCIM provisioning, per-route permission matrix beyond the PoC
  surface, SSO logout (front-channel), hardware keys/WebAuthn.

## 2. Research decisions to close FIRST (big pieces early)

Per "make the change easy, then make the change": these decisions change file layout,
so they are settled (as a spike + ADR) **before** any code lands.

### 2.1 Spike: OIDC library + LDAP/AD coverage (Phase 0, timeboxed)

| Question | Recommendation | Rationale |
| --- | --- | --- |
| JWT/JWKS + PKCE + state/nonce handling | Add **`jose`** as the single new dependency (small, audited, pure ESM; passes the repo's trivy/semgrep gate). Implement the OIDC Authorization Code flow ourselves with `fetch` (discovery doc → authorize redirect → token exchange → ID-token verification via JWKS). Alternative if full RP conformance is wanted later: `openid-client`. Avoid hand-rolled crypto. | Repo ethos is minimal deps (`api/config/schema.js` is deliberately "zero new dependencies"); one tiny JOSE lib beats a large RP framework for a PoC, and keeps the supply-chain scan surface small. |
| LDAP / Active Directory (survey q3) | **Out of PoC scope as a native protocol.** AD/Entra ID, AD FS and LDAP directories are all reachable through standard OIDC fronts (Entra ID, AD FS, Keycloak, etc.). The generic-OIDC PoC therefore covers LDAP/AD shops via their existing OIDC bridge. Record this in the ADR; revisit only if a customer has no OIDC-capable front. | Keeps PoC to one integration surface; avoids a second auth protocol and its own test matrix. |
| Session mechanism (survey q9: "follow standards") | **OIDC Authorization Code flow with PKCE** for sign-in; afterwards a **server-side session referenced by an opaque id in an `HttpOnly; Secure; SameSite=Lax` cookie** (rotated on login, sliding expiry, revocable server-side). The IdP ID token is verified once at callback (issuer, audience, expiry, nonce, signature via JWKS); we never store IdP tokens long-term and never accept raw JWTs from the browser (per survey q4 note, "just process their JWTs" = verify them server-side at the token endpoint/callback, not trust client-presented tokens). | Standard for browser SPAs; opaque cookie avoids token-in-localStorage XSS exposure; server-side store enables revocation + audit. |
| Where config lives (survey q10) | **Env vars are boot-time source of truth** via `api/config/schema.js` (new `auth` group); **runtime overrides via the in-app settings page**, persisted to `~/.kainbain/engine/auth/access.json`. Precedence: explicit runtime setting > env var > schema default. Secrets (client secret) are `secret: true` → redacted in `GET /status/config`. | Matches the existing schema-driven config engine; settings page writes go through a small admin-only API. |

Output of Phase 0: `docs/adr/0014-oidc-rbac-access-control.md` (context/decision/consequences,
following the `docs/adr/000N-*` format), plus a spike note proving `jose` + a mock
IdP work in this repo's Node version range (`^20.19.0 || >=22.12.0`).

### 2.2 Threat model (part of the ADR)

Cover: PKCE + `state` + `nonce` on the code flow; strict redirect-URI allowlist;
JWKS fetch with pinning-by-discovery and key rotation tolerance; clock-skew bound;
cookie flags (`Secure` when served over https, `HttpOnly`, `SameSite=Lax`);
CSRF-safe logout (POST only); session fixation (rotate id on login); session
expiry + idle timeout; revocation on logout/password-change at IdP via re-check on
session refresh; runner channel (`x-runner-credential`) explicitly **out of scope**
for user auth — runners keep their own credential mechanism; audit log of
sign-ins and role changes; secrets redacted in `/status/config`; `/docs` and
health endpoints stay unauthenticated by design (docs contain no secrets, per
`site-docs/README.md`).

## 3. Target design (summary)

### 3.1 Data model (persisted JSON under `~/.kainbain/engine/auth/`, via `resolveStatePath` + atomic writes from `api/house/fileWriting.js`)

- `users.json` — `{ users: [{ id, sub, email, name, provider, groups: [], directRoles: [], projectRoles: { [projectId]: [role] }, createdAt, lastLoginAt, disabled }] }`. JIT-created on first successful OIDC login (q4). No passwords, ever.
- `sessions.json` — `{ [sessionId]: { userId, createdAt, expiresAt, lastSeenAt, ip?, userAgent? } }`. Opaque random id (node:crypto), hashed at rest.
- `access.json` — runtime overrides: `{ groupRoleMappings: { [idpGroup]: [role] }, roleManagerRoles: ["admin"], bootstrapAdmins: [sub/email], authEnabled (mirror), ... }`.
- Role catalogue is **code-defined** in `api/auth/roles.js` (built-ins: `admin`,
  `member`, `viewer` with permission sets), so new roles later = data + one line.

### 3.2 Effective roles

For a request: `effectiveRoles = directRoles(user) ∪ roles(groupRoleMappings[g] for g in user.groups)`
(installation-wide). When the route carries a `projectId`, project-scoped
`projectRoles[projectId]` are unioned in for that check (q8). Precedence/deny
rules documented in the ADR; PoC enforcement surface per survey q11 = **settings &
user-administration routes**, with the mechanism built so extending to all routes is
a one-line change per route (see §4.3).

### 3.3 New backend domain: `api/auth/`

Follows the repo domain pattern (`api/crew/`, `api/watch/`): `index.js` barrel,
one function per file (enforced by `npm run check:one-function`), JSDoc `@example`
on every export (enforced by `npm run check:jsdoc-example`), `// Role:`/`// Domain:`
header in the top 3 lines, ≤400 LOC per subject file, co-located `*.test.js`.

| File | Responsibility |
| --- | --- |
| `api/auth/index.js` | Barrel + wiring factory `createAuthService(config, deps)`; no singletons in the index (per `ARCHITECTURE_DOMAINS.md`). |
| `api/auth/roles.js` | Built-in role catalogue + permission sets; `effectiveRoles(user, accessConfig, projectId?)` resolver (pure). |
| `api/auth/userStore.js` | JIT user provisioning, lookup by `sub`, role assignment (direct + per-project), group refresh on login, persistence via atomic write. |
| `api/auth/sessionStore.js` | Create/verify/rotate/revoke sessions; cookie name constant, cookie flags builder, hashing. |
| `api/auth/oidcClient.js` | Discovery (`/.well-known/openid-configuration`), authorize-URL builder (PKCE+state+nonce), token exchange, ID-token verification via JWKS (`jose`). Pure-ish, injectable `fetch` for tests. |
| `api/auth/accessConfig.js` | Loads/merges env schema config + `access.json` runtime overrides; who may manage roles (q12, default `admin` only, configurable). |
| `api/auth/middleware.js` | Fastify `onRequest` hook: if auth disabled → `request.user = BUILTIN_ADMIN`, `request.auth = { enabled:false }`; if enabled → resolve cookie → session → user → effective roles; public-route skip-list; 401/403 JSON shape; WS upgrade guard helper. |
| `api/auth/rbac.js` | `requireRole(roles, opts)` preHandler factory + `requireProjectRole` variant; also used declaratively via route config `{ auth: { role: [...] } }`. |
| `api/auth/routes.js` (registered from `api/routes/auth.js`) | `GET /auth/login` (302 to IdP), `GET /auth/callback` (code exchange, JIT user, session cookie), `POST /auth/logout`, `GET /auth/me`, admin-only: `GET /auth/users`, `PUT /auth/users/:id/roles`, `PUT /auth/users/:id/projects/:projectId/roles`, `GET/PUT /auth/group-mappings`, `GET/PUT /auth/settings`. |
| `api/config/schema.js` (+ new `CONFIG_GROUPS` entry `auth`) | Env knobs: `KAINBAIN_AUTH_ENABLED` (default `false`), `KAINBAIN_OIDC_ISSUER_URL`, `KAINBAIN_OIDC_CLIENT_ID`, `KAINBAIN_OIDC_CLIENT_SECRET` (secret), `KAINBAIN_OIDC_REDIRECT_URI`, `KAINBAIN_OIDC_SCOPES` (default `openid profile email groups`), `KAINBAIN_AUTH_GROUPS_CLAIM` (default `groups`), `KAINBAIN_AUTH_ADMIN_GROUP`, `KAINBAIN_AUTH_SESSION_TTL_MS`, `KAINBAIN_AUTH_COOKIE_NAME`, `KAINBAIN_AUTH_ROLE_MANAGER_ROLES`, `KAINBAIN_AUTH_STATE_PATH`. Regenerate `.env.example` with `node scripts/generate-env-example.mjs` (never hand-edit). |

### 3.4 Wiring in `api/index.js`

- Register the auth hook **first**, before business routes, so every route can
  rely on `request.user`/`request.auth`.
- Skip-list (never require user auth): `GET /health*`/status health, `GET /docs*`,
  `GET /agent*` guide, runner routes (`/runners/*` — separate `x-runner-credential`
  channel, untouched), auth routes themselves, and `GET /auth/login|callback`.
- `/ws` upgrade: when auth enabled, validate the session cookie on the upgrade
  request; reject with 401 otherwise.
- Built-in admin identity when disabled: `{ id: "admin", name: "admin", roles: ["admin"], builtin: true }` — so downstream code always has a user object ("all actions done by an admin user" per the brief).

### 3.5 Frontend

- `frontend/src/services/auth/index.js` — `me(), login(), logout(), listUsers(), setUserRoles(), get/setGroupMappings(), get/setAuthSettings()`; all fetches `credentials: 'include'` (cookie auth); central 401 handler in `apiBase`/interceptor → redirect `#/login`.
- `frontend/src/routes.jsx` — add `/login` route (public) + an `RequireAuth` guard
  wrapper used when `GET /auth/me` says auth is enabled.
- `frontend/src/components/auth/LoginPage.jsx` (+ test) — "Sign in with your
  organisation account" button → `GET /auth/login`; handles IdP error params.
- `frontend/src/components/settings/AccessControlSection.jsx` (+ test) — new System
  Settings tab `access` added to `settingsTabs.js`: enable/disable toggle, OIDC
  provider fields (issuer/client id/secret/redirect URI/scopes), groups-claim name,
  admin group, session TTL, users table with direct-role and per-project-role
  editors, group→role mapping editor, role-manager roles config. Shown only to
  users with `admin` role when auth is on (route also enforced server-side per q11).
- User menu chip in the app header showing `me` + logout.

### 3.6 Docs (survey q14: full guide; **do not touch `README.md`** — agents.md rule)

- `docs/adr/0014-oidc-rbac-access-control.md` — the decision record.
- `docs/authentication-and-access-control.md` — the full guide: concepts,
  architecture diagram (ASCII), step-by-step setup examples for a generic OIDC IdP
  plus Auth0 / Entra ID / Keycloak specifics, env-var reference (generated from
  schema), settings-page guide, role model, group mapping, troubleshooting table
  (discovery 404, redirect-URI mismatch, JWKS/clock skew, cookie blocked on plain
  http non-loopback, 401 loops, admin lockout recovery via env override), security
  notes, and how to extend roles.
- `site-docs/authentication.md` — in-app Docs article (frontmatter
  `title/section/order/slug`, section `working-with`), cross-linked with
  `` `#/docs/authentication` ``; must pass `siteDocs.integrity` tests.
- Update `AGENTS-MAP.md` (new `api/auth/` row + module locator) and
  `docs/ARCHITECTURE_DOMAINS.md` (new "Access" domain, House-adjacent reviewer).
- `site-docs/ports-env.md` / `api/config/docs.envCoverage.test.js` — add the auth
  env vars to the doc coverage so `npm run docs:check` stays green.

## 4. Step-by-step implementation plan

Ordered so each step leaves the tree green and the change stays easy to make
(toggle first, core next, flows last). Big/research pieces are Phases 0–1.

### Phase 0 — Research & decisions (no product code)
1. Spike: `jose` + PKCE + JWKS verify against a **mock OIDC provider** (fixture with
   discovery, jwks, token endpoints) on the repo's Node versions. Record timings
   and any gotchas.
2. Write `docs/adr/0014-oidc-rbac-access-control.md` (decisions in §2, data model
   §3.1, threat model §2.2, LDAP/AD deferral, session choice, config precedence).
3. Confirm scope with the survey answers (§1) — especially q7 (PoC roles), q8
   (project roles in model), q11 (PoC enforcement surface), q14 (docs, no README).

**Exit criteria:** ADR accepted; spike note shows a full code-flow against the mock
IdP; dependency addition (`jose`) passes `npm run sec` locally.

### Phase 1 — Config & the OFF toggle (make the change easy)
4. Add `auth` group to `CONFIG_GROUPS` and the env entries in
   `api/config/schema.js` (list in §3.3), all defaulting to **auth disabled**.
5. Regenerate `.env.example` (`node scripts/generate-env-example.mjs`); extend
   `site-docs/ports-env.md` coverage; keep `api/config/docs.envCoverage.test.js`
   green. Secrets marked `secret: true`.
6. Unit tests: schema parsing/validation of the new keys; `/status/config` redaction.

**Exit criteria:** `npm run test:api -- config` green; boot with no auth env set
behaves exactly as today.

### Phase 2 — Auth domain core, default OFF (pure logic, unit-tested)
7. `api/auth/roles.js` — role catalogue + `effectiveRoles()` (direct ∪ group-mapped
   ∪ project-scoped). Unit tests for precedence and unknown-role handling.
8. `api/auth/userStore.js` + `api/auth/accessConfig.js` — persistence under
   `~/.kainbain/engine/auth/` via `resolveStatePath` + `_atomicWriteFileSync`;
   JIT provisioning; group refresh on login; runtime override merge
   (runtime > env > default). Unit tests with tmp dirs (`api/test-helpers/tmpRepo.js`
   pattern).
9. `api/auth/sessionStore.js` — opaque id, hashing, TTL, rotation, revocation,
   cookie-flag builder (Secure only when https/loopback). Unit tests incl. expiry.
10. `api/auth/middleware.js` + `api/auth/rbac.js` — the hook and preHandlers.
    **When disabled: attach built-in admin, call next()** — zero behaviour change.
    Unit tests for both modes, skip-list, and 401/403 shapes.

**Exit criteria:** `npm run test:api -- auth` green; full `npm run test:api` still
green with auth off (regression proof of the toggle).

### Phase 3 — Wiring & PoC enforcement surface
11. `api/index.js`: register the auth hook first; add skip-list; guard `/ws`
    upgrade; pass `authService` via `deps` to route registrars.
12. `api/routes/auth.js` registering `api/auth/routes.js` (initially only
    `/auth/me`, `/auth/settings` GET, and the admin user/role/mapping endpoints —
    login/callback land in Phase 4).
13. Apply `requireRole(["admin"])` (or route config `{ auth: { role: ["admin"] } }`)
    to the **settings & user-administration** surface per survey q11: system
    settings mutation routes, user/role admin routes. One-line-per-route pattern
    documented so extending later is trivial.
14. Route tests with `app.inject`: auth off → all 200 as admin; auth on + no cookie
    → 401 JSON; + viewer cookie → 403 on admin routes; runner routes unaffected in
    both modes; `/ws` rejected when on without cookie.

**Exit criteria:** full `npm run test:api` green; new route tests green; no existing
test modified except where the hook contract requires it.

### Phase 4 — OIDC sign-in flow (make the change)
15. `api/auth/oidcClient.js` — discovery, authorize URL (PKCE+state+nonce), token
    exchange, ID-token verify (iss/aud/exp/nonce/signature via JWKS). Injectable
    fetch; unit tests with mock IdP fixtures (valid, expired, wrong nonce, bad
    signature, unknown kid).
16. `GET /auth/login` + `GET /auth/callback` + `POST /auth/logout`: state/nonce
    cookies (short-lived, `SameSite=Lax`), callback verifies code → tokens →
    ID token → JIT user (`userStore`) → refresh groups from claims claim →
    create session → set cookie → redirect to `/`. Bootstrap rule: the IdP group
    named by `KAINBAIN_AUTH_ADMIN_GROUP` (or `bootstrapAdmins`) maps to `admin`.
17. `GET /auth/me` returns `{ authEnabled, user, roles }` — the frontend gate.
18. Integration tests: full code flow against the mock IdP via `app.inject`
    (follow redirects manually), incl. replayed state, expired state, disabled
    user, and admin-group mapping. Mock IdP helper lives in `api/test-helpers/`.

**Exit criteria:** integration tests green; `npm run test:api` green.

### Phase 5 — Admin API for access control (settings page backend)
19. Users/roles/mappings/settings endpoints (list in §3.3), all `requireRole` of
    the configured role-manager roles (q12; default `admin`), with audit entries
    (who changed what, when) appended to `auth/audit.jsonl`.
20. Runtime settings PUT persists to `access.json`; env still wins at boot.
    Tests for precedence and validation errors.

### Phase 6 — Frontend
21. `services/auth/index.js` + 401 interceptor → `#/login`.
22. `LoginPage.jsx` + `/login` route + `RequireAuth` guard in `routes.jsx`.
23. `AccessControlSection.jsx` + new `access` tab in `settingsTabs.js` (admin-only
    rendering; server enforces too).
24. User chip + logout in the header; frontend tests (vitest + testing-library)
    for login page, guard redirects, and the settings section; `services/auth`
    client tests.
25. Visual check via `npm run capture:screenshot` (headless; no long-lived
    servers) for login page and the Access tab.

**Exit criteria:** `npm run test:frontend` green; screenshots reviewed.

### Phase 7 — Documentation (survey q14; no README changes)
26. `docs/authentication-and-access-control.md` full guide (§3.6).
27. `site-docs/authentication.md` in-app article; run `npm run docs:check` (link +
    integrity + env coverage).
28. Update `AGENTS-MAP.md` + `docs/ARCHITECTURE_DOMAINS.md` with the Access domain.
29. ADR 0014 finalised with implementation notes.

### Phase 8 — Verification & hardening gate (assurance plan)
30. Full gates, all from repo root:
    - `npm run test:unit` (api + frontend) — primary gate.
    - `npm test -- --no-canary` — full suite without canary E2E.
    - `npm run lint`, `npm run check:one-function`, `npm run check:jsdoc-example`.
    - `npm run docs:check` (doc links, site-docs integrity, env coverage).
    - `npm run sec` (semgrep + trivy) — must pass with the new `jose` dependency and
      the new auth code (no hardcoded secrets; `eslint-plugin-security` clean).
31. Manual E2E with the mock IdP (scripted): boot with auth on → redirected to
    login → sign in → admin settings visible → viewer role gets 403 on settings →
    logout → 401; then boot with auth **off** → existing behaviour unchanged
    (regression). Use `npm run capture:screenshot` for visual evidence.
32. Security review checklist against the ADR threat model (§2.2): PKCE/state/nonce,
    cookie flags, redirect allowlist, redaction in `/status/config`, session
    revocation, audit log, runner channel isolation.
33. Record results + any exceptions in the task directory (stage report).

## 5. How we assure the change was implemented

- **Automated tests as the primary gate** (per repo testing guidance): co-located
  unit tests per `api/auth/*` module; route tests via `app.inject` for both auth
  modes; an integration suite driving the full OIDC code flow against a mock IdP
  fixture; frontend tests for login/guard/settings; contract test that auth-OFF
  requests are attributed to the built-in admin and that runner routes still
  authenticate with `x-runner-credential` in both modes.
- **Regression proof of the toggle:** the entire existing `npm run test:unit` suite
  must pass unmodified with auth off (default) — that is the acceptance test for
  "default off, all actions by admin".
- **Docs checks:** `npm run docs:check` (env coverage + link integrity + JSDoc
  examples) plus `check:one-function`.
- **Security scans:** `npm run sec` (semgrep, trivy) on the new dependency and code.
- **Manual/visual:** scripted E2E against the mock IdP for both modes; headless
  screenshots via `npm run capture:screenshot` (no long-lived background servers).
- **Docs deliverables:** ADR + full guide + in-app article, all link-checked;
  `README.md` untouched (owner-maintained, per `agents.md`).

## 6. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Enabling auth breaks runners or health checks | Explicit skip-list + contract tests; runner `x-runner-credential` channel untouched; full suite green in both modes. |
| Admin lockout (no one has admin) | `KAINBAIN_AUTH_ADMIN_GROUP` / bootstrap admin sub config + env-level override to regain access; documented in troubleshooting. |
| Cookie blocked on plain-http non-loopback | `Secure` flag only when https or loopback; documented; SameSite=Lax keeps top-level OIDC redirect working. |
| IdP clock skew / JWKS rotation | Leeway bound on exp; JWKS refetch on unknown `kid`; troubleshooting table. |
| New dependency supply-chain risk | Single small audited lib (`jose`); `npm run sec` gate; lockfile updated. |
| Scope creep beyond PoC | §1 non-goals; ADR records deferrals (native LDAP, SCIM, per-route matrix). |

## 7. File touch list (summary)

- New: `api/auth/{index,roles,userStore,sessionStore,oidcClient,accessConfig,middleware,rbac,routes}.js` + co-located tests; `api/routes/auth.js`; `api/test-helpers/mockOidcProvider.js`; `frontend/src/services/auth/index.js` + tests; `frontend/src/components/auth/LoginPage.jsx` + test; `frontend/src/components/settings/AccessControlSection.jsx` + test; `docs/adr/0014-oidc-rbac-access-control.md`; `docs/authentication-and-access-control.md`; `site-docs/authentication.md`.
- Modified: `api/config/schema.js` (+ auth group), `.env.example` (regenerated), `api/index.js` (hook + registrations), `api/routes/ws.js` (upgrade guard), settings route(s) for `requireRole`, `frontend/src/routes.jsx`, `frontend/src/components/settings/settingsTabs.js` + `SystemSettingsContent.jsx`, `frontend/src/services/apiBase.js` or facade (401 interceptor), `AGENTS-MAP.md`, `docs/ARCHITECTURE_DOMAINS.md`, `site-docs/ports-env.md`, `api/package.json` (+ `jose`).
- **Not touched:** `README.md` (owner-maintained), runner auth flow, task/flow/watch business logic.
