# Authentication & Access Control

Organisation-level sign-in for KainBain: OpenID Connect (OIDC) login plus
role-based access control (RBAC), behind a master switch that is **off by
default**. When the switch is off, everything behaves exactly as before —
every request runs as the shared built-in `admin` user and there is no login
screen.

This guide is the operator manual. The decision record behind it is
`docs/adr/0015-oidc-rbac-access-control.md`. The in-app short version is
Authentication (`#/docs/authentication`); the variable table also appears in
Ports & Environment (`#/docs/ports-env`).

## Concepts

- **Single tenant.** One organisation per installation. There are no
  organisations, teams, or tenants inside the data model.
- **No local passwords, ever.** Users sign in at your identity provider
  (IdP). KainBain verifies the provider's ID token server-side and then
  issues its own browser session. The provider's tokens are never stored
  long-term and the browser never presents raw JWTs to the API.
- **Just-in-time (JIT) provisioning.** The first successful sign-in creates
  the user record automatically. There is no invite flow and no signup form.
- **Roles, two ways.** A user gets roles directly assigned by an admin, or
  through their IdP groups mapped to roles. Both union together. Roles can
  also be scoped to one project.
- **Proof-of-concept catalogue.** Three built-in roles prove the model;
  adding more later is data plus one line (see Extending roles below).
- **Server-side sessions.** After sign-in the browser holds an opaque
  session id in an `HttpOnly; SameSite=Lax` cookie (`Secure` on https and
  loopback). Sessions expire absolutely (default 12h) and idly (default
  30m), and can be revoked by signing out or disabling the user.
- **Runner channel untouched.** Machine runners keep authenticating with
  `x-runner-credential` on `/runners/*`, which never requires user sign-in.

## Architecture

```text
Browser                    KainBain API                 Identity provider
   |                           |                                |
   |  GET /auth/login          |                                |
   |-------------------------->|  discovery + PKCE + state      |
   |                           |  authorize URL                 |
   |  302 to provider          |------------------------------->|
   |<--------------------------|                                |
   |  sign in at provider       |                                |
   |----------------------------------------------------------->|
   |  302 /api/auth/callback?code=...&state=...                 |
   |<-----------------------------------------------------------|
   |  GET /api/auth/callback   |                                |
   |-------------------------->|  token exchange (code+verifier)|
   |                           |------------------------------->|
   |                           |  ID token; verify via JWKS     |
   |                           |<-------------------------------|
   |                           |  JIT user, refresh groups,     |
   |                           |  create session                |
   |  302 / + kb_session cookie|                                |
   |<--------------------------|                                |
   |  API calls (cookie)       |  hook: cookie -> session ->    |
   |-------------------------->|  user -> effective roles;      |
   |                           |  requireRole guards admin APIs |
```

Code map:

| Piece | Home |
| --- | --- |
| Role catalogue + effective-role resolver | `api/auth/roles.js` |
| OIDC client (discovery, authorize URL, token exchange, ID-token verify) | `api/auth/oidcClient.js` |
| User store (JIT provisioning, role assignment) | `api/auth/userStore.js` |
| Session store (opaque ids, TTL, cookies) | `api/auth/sessionStore.js` |
| Config merge (env + settings-page overrides) | `api/auth/accessConfig.js` |
| Request hook (attaches `request.user` / `request.auth`) | `api/auth/middleware.js` |
| Route guards (`requireRole`) | `api/auth/rbac.js` |
| HTTP endpoints (`/auth/*`) | `api/auth/routes.js`, registered from `api/routes/auth.js` |
| Service wiring (`createAuthService`) | `api/auth/service.js`, wired in `api/index.js` |
| Audit log (`auth/audit.jsonl`) | `api/auth/auditLog.js` |
| Frontend client + login page + guard + settings UI | `frontend/src/services/auth/`, `frontend/src/components/auth/`, `frontend/src/components/settings/AccessControlSection.jsx`, `frontend/src/components/settings/AccessUserList.jsx` |

## Setup: generic OIDC provider

1. **Register KainBain at your provider.** Create an OAuth/OIDC client
   (application) of the confidential web-app type. Note the client id and
   client secret. Register the redirect URI exactly:
   `https://<your-host>/api/auth/callback` (or
   `http://localhost:3100/api/auth/callback` for a local trial). The match
   is character-for-character, including the scheme and trailing slash.
2. **Find the issuer URL.** This is the base URL whose discovery document
   lives at `<issuer>/.well-known/openid-configuration`. Open that URL in a
   browser — if it does not return JSON with `authorization_endpoint`,
   `token_endpoint`, and `jwks_uri`, the issuer URL is wrong.
3. **Configure KainBain.** Either set environment variables and restart, or
   save the same values on the System Settings Access tab (no restart
   needed; the page writes `access.json`, which wins over env per knob):

   ```bash
   KAINBAIN_OIDC_ISSUER_URL=https://id.example.com/realms/company
   KAINBAIN_OIDC_CLIENT_ID=kainbain
   KAINBAIN_OIDC_CLIENT_SECRET=<secret>
   KAINBAIN_OIDC_REDIRECT_URI=https://kainbain.example.com/api/auth/callback
   KAINBAIN_AUTH_ENABLED=true
   ```

   Leave `KAINBAIN_OIDC_REDIRECT_URI` empty only when `PUBLIC_KB_URL` is the
   exact public origin users visit — the fallback is
   `<PUBLIC_KB_URL>/api/auth/callback`.
4. **Seed the first admin** (do this before enabling, or you will lock
   yourself out): set `KAINBAIN_AUTH_BOOTSTRAP_ADMINS` to your IdP subject
   id or email, e.g. `KAINBAIN_AUTH_BOOTSTRAP_ADMINS=ada@example.com`.
   Bootstrap admins always sign in as `admin`, even with no stored roles.
5. **Sign in.** Open the app: it bounces to `#/login`. Choose "Sign in with
   your organisation account", approve at the provider, and you land back
   on the board as your IdP identity. Your admin will see you in
   System Settings Access Users.
6. **Map groups to roles** (optional but recommended): on the Access tab,
   add rows such as `engineering` to `member`, `platform-admins` to
   `admin`. Group membership refreshes from the ID token on every sign-in.

### Auth0

- Issuer URL: `https://<tenant>.<region>.auth0.com` (or your custom
  domain). Client type: Regular Web Application.
- Groups: Auth0 does not emit a `groups` claim by default. Either add a
  Login Flow Action that sets a namespaced claim from `event.user.groups`
  (or roles) and point `KAINBAIN_AUTH_GROUPS_CLAIM` at it, or skip group
  mapping and assign roles directly on users.
- Scopes: `openid profile email` is enough unless your Action needs more.

### Microsoft Entra ID (Azure AD)

- Issuer URL: `https://login.microsoftonline.com/<tenant-id>/v2.0`.
  Register a Web app, add the redirect URI, and create a client secret.
- Groups: Entra emits group object ids in the `groups` claim only after
  you opt the app manifest into `groupMembershipClaims` (SecurityGroup or
  ApplicationGroup), and large memberships overage to a separate Graph
  call, which this PoC does not make. Map using the raw object ids, or use
  direct roles plus `KAINBAIN_AUTH_ADMIN_GROUP` with one admin group's id.
- If users hit "AADSTS50011: redirect URI mismatch", the registered URI
  differs from the sent one — compare scheme, host, port, and path.

### Keycloak

- Issuer URL: `https://<host>/realms/<realm>`. Create a confidential
  client with Standard Flow enabled and the redirect URI registered.
- Groups: add a Group Membership mapper to the client (or client scope)
  with Token Claim Name `groups`, and KainBain reads it with the default
  `KAINBAIN_AUTH_GROUPS_CLAIM=groups`.
- Keycloak fronts LDAP/Active Directory: attach your existing LDAP user
  federation to the realm and the same OIDC client covers AD accounts with
  no extra KainBain configuration (native LDAP bind is out of PoC scope;
  the OIDC bridge is the supported path).

## Environment reference

Boot-time source of truth is `api/config/schema.js` (group `auth`); the
table below mirrors it. Every knob can also be set from the Access tab at
runtime, except `PUBLIC_KB_URL`, which stays boot-time only. Precedence per
knob: **runtime override (`access.json`) > env var > schema default.**

| Variable | Default | Effect |
| --- | --- | --- |
| `KAINBAIN_AUTH_ENABLED` | `false` | Master switch. Off keeps today's behaviour; on requires a signed-in session with a sufficient role on the guarded routes |
| `KAINBAIN_OIDC_ISSUER_URL` | _(unset)_ | OIDC provider base URL (discovery lives at `<issuer>/.well-known/openid-configuration`) |
| `KAINBAIN_OIDC_CLIENT_ID` / `KAINBAIN_OIDC_CLIENT_SECRET` | _(unset)_ | Client registration at your provider; the secret is redacted in `GET /status/config` |
| `KAINBAIN_OIDC_REDIRECT_URI` | _(unset)_ | Exact callback URI registered at the provider; empty falls back to `<PUBLIC_KB_URL>/api/auth/callback` |
| `KAINBAIN_OIDC_SCOPES` | `openid profile email groups` | Space-separated scopes requested at sign-in |
| `KAINBAIN_AUTH_GROUPS_CLAIM` | `groups` | ID-token claim carrying the user's groups |
| `KAINBAIN_AUTH_ADMIN_GROUP` | _(unset)_ | IdP group whose members always sign in as `admin` (lockout recovery) |
| `KAINBAIN_AUTH_BOOTSTRAP_ADMINS` | _(unset)_ | Comma-separated subject ids or emails that always sign in as `admin` |
| `KAINBAIN_AUTH_SESSION_TTL_MS` | 43200000 (12h) | Absolute browser-session lifetime |
| `KAINBAIN_AUTH_SESSION_IDLE_MS` | 1800000 (30m) | Idle session timeout (each request slides the window) |
| `KAINBAIN_AUTH_COOKIE_NAME` | `kb_session` | Cookie carrying the opaque session id |
| `KAINBAIN_AUTH_ROLE_MANAGER_ROLES` | `admin` | Roles allowed to change assignments and access settings |
| `KAINBAIN_AUTH_STATE_PATH` | _(unset)_ | Override dir for auth state files; empty resolves to `~/.kainbain/engine/auth/` |

`.env.example` is generated from the schema (`node
scripts/generate-env-example.mjs`) — never hand-edit it.

## The Access tab (settings page)

System Settings Access is visible to role managers (default: `admin`
only) and every write is enforced server-side too. It has three parts:

- **Settings form.** The enable toggle, provider fields (issuer, client
  id, client secret — the secret is write-only and never echoed back),
  redirect URI, scopes, groups-claim name, admin group, bootstrap admins,
  session TTL/idle minutes, cookie name, and role-manager roles. Saving
  writes `access.json` and takes effect on the next request — no restart.
  While access control is off, the same form explains the default and
  offers the on-switch.
- **Group mappings.** Rows of IdP group to role list, e.g. `finance` to
  `viewer`. Stored in `access.json` under `groupRoleMappings` (there is no
  env var for mappings — they are runtime data).
- **Users list.** Every JIT-provisioned account with direct-role
  checkboxes, per-project role editors, and a disabled switch. You cannot
  disable your own account. Disabling bites immediately: the next request
  resolves no user.

## Role model

Built-in catalogue (`api/auth/roles.js`):

| Role | Permissions | Meaning in this PoC |
| --- | --- | --- |
| `admin` | `*` | Full control: role administration, access settings, settings mutations |
| `member` | `read`, `write` | Ordinary signed-in user (reserved for future route checks) |
| `viewer` | `read` | Read-only user (reserved for future route checks) |

Effective roles for a request are:

```text
effective = directRoles(user)
        ∪ groupRoleMappings[g] for each g in user.groups
        ∪ projectRoles[projectId] when the route carries a project id
```

Rules: bootstrap admins (subject/email allowlist) and members of
`KAINBAIN_AUTH_ADMIN_GROUP` always include `admin`; a disabled user gets no
roles at all; unknown role names in stored data are ignored (fail closed to
known roles); an empty role-manager list fails safe back to `admin`-only.

PoC enforcement surface: the settings and user-administration routes carry
`requireRole(["admin"])` (or the configured manager roles for `/auth/*`
admin APIs). The mechanism is one line per route, so extending it later is
mechanical. Everything else stays open to any signed-in user while the
catalogue grows. The WebSocket upgrade (`/ws`) requires a signed-in user
when access control is on, and closes the socket with `4401` otherwise.

Always-public routes (never need sign-in): `/status/*`, `/health*`,
`/docs/*`, `/agent*`, `/documentation*`, `/runners/*` (separate runner
credential channel), `/ws` handshake path (guarded inside the route), and
`/auth/login` + `/auth/callback`.

## API reference (`/auth/*`)

| Endpoint | Auth | Behaviour |
| --- | --- | --- |
| `GET /auth/login` | public (404 `auth_disabled` when off) | 302 to the provider's authorize page (PKCE + `state` + `nonce`; 10-minute pending cookie) |
| `GET /auth/callback` | public | Exchanges the code, verifies the ID token, JIT-provisions the user, refreshes groups, sets the session cookie, redirects to `/` |
| `POST /auth/logout` | cookie | Destroys the session, clears the cookie, returns `{ ok: true }` |
| `GET /auth/me` | public | `{ authEnabled, user, roles }` — the frontend gate; when off, `user` is the built-in admin |
| `GET /auth/users` | manager roles | Lists provisioned users |
| `PUT /auth/users/:id/roles` | manager roles | Replaces installation-wide direct roles (`{ roles: [...] }`) |
| `PUT /auth/users/:id/projects/:projectId/roles` | manager roles | Replaces one project's roles |
| `PUT /auth/users/:id/disabled` | manager roles | Sets `{ disabled: true | false }` (cannot target self) |
| `GET /auth/group-mappings` | manager roles | Returns `{ mappings }` |
| `PUT /auth/group-mappings` | manager roles | Replaces mappings (`{ mappings: { group: [role] } }`) |
| `GET /auth/settings` | manager roles | Effective settings view (secret returned only as `hasClientSecret`) |
| `PUT /auth/settings` | manager roles | Stores one partial change to `access.json` |

Guard failures answer `401 { error: "Sign-in required", code:
"unauthenticated" }` (no session) or `403 { error: "Insufficient role",
code: "forbidden", requiredRoles }` (wrong role). The frontend bounces any
401 to `#/login`.

Sign-ins, sign-outs, and every role/mapping/settings change append to
`~/.kainbain/engine/auth/audit.jsonl` with actor, action, and detail.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Login button answers `502 oidc_unreachable` | Issuer URL wrong, provider down, or no network path | Open `<issuer>/.well-known/openid-configuration` yourself; fix the URL or the network |
| Login button answers `502 oidc_issuer_mismatch` | The discovery document's `issuer` differs from the configured URL | Use the exact issuer string the document advertises (trailing slash matters) |
| Provider shows redirect-URI / callback error | Registered URI differs from the sent one | Register the exact URI character-for-character; check scheme (`https` vs `http`), port, and path; or set `KAINBAIN_OIDC_REDIRECT_URI` explicitly instead of relying on `PUBLIC_KB_URL` |
| Callback answers `400 invalid_state` | Attempt expired (10 min), cookies blocked, or the URL was reused/refreshed | Sign in again from `#/login` without refreshing the callback; allow cookies for the site |
| Callback answers `401 sign_in_failed` | Code exchange or ID-token verify failed (secret wrong, clock skew, key rotation) | Re-enter the client secret; check the server clock (NTP); key rotation is tolerated via JWKS refetch — retry once |
| Provider cancels back to `#/login?error=access_denied` | The user (or a provider policy) refused the sign-in | Read the `message` param; approve the app or satisfy the policy, then retry |
| Signed in, but every page bounces to login (401 loop) | Cookie not sent: split-origin without cookie support, or the cookie name changed mid-session | Serve API + UI same-origin, or keep `credentials: 'include'` (the client sends it); sign out and in again after renaming the cookie |
| Cookie missing on plain-http LAN host | `Secure` cookies are only set on https and loopback; plain-http non-loopback still works but stays session-scoped | Prefer https (or loopback) in production; plain http keeps working, just without the `Secure` flag |
| `403 account_disabled` at callback | An admin disabled the account | An admin re-enables it on the Access Users list |
| `403 forbidden` on settings pages | Signed in without the `admin` role | An admin grants the role (direct or via group mapping) |
| Nobody has `admin` (lockout) | Bootstrap config missing and no admin mapping | Set `KAINBAIN_AUTH_BOOTSTRAP_ADMINS` to your subject/email and restart — unless `access.json` already stores those keys, in which case runtime wins: stop the server, edit or delete `~/.kainbain/engine/auth/access.json`, and restart |
| `GET /auth/login` answers `404 auth_disabled` | Access control is off | Turn on `KAINBAIN_AUTH_ENABLED` (env + restart, or the Access tab) |
| `GET /auth/login` answers `503 oidc_unconfigured` | Enabled but issuer/client id unset | Fill in the provider fields first, then enable |

## Security notes

- Authorization Code flow with PKCE, plus `state` (timing-safe compare)
  and `nonce` on every attempt; pending state lives 10 minutes in an
  `HttpOnly; SameSite=Lax` cookie and is cleared on every outcome.
- ID tokens are verified server-side (issuer, audience, expiry, nonce,
  JWKS signature); client-presented tokens are never trusted.
- Sessions are opaque random ids, hashed at rest, rotated on login, and
  revocable (logout, disable). Absolute + idle expiry bound the window.
- Logout is `POST`-only (CSRF-safe); the session cookie is `HttpOnly` and
  `SameSite=Lax`, `Secure` on https/loopback.
- The client secret is `secret: true` in the schema (redacted in
  `GET /status/config`) and write-only in the settings API.
- `/docs` and health endpoints stay unauthenticated by design (docs carry
  no secrets); runner routes keep their own credential channel.
- Threat model and deferrals (native LDAP, SCIM, per-route matrix, SSO
  logout, WebAuthn) live in `docs/adr/0015-oidc-rbac-access-control.md`.

## Extending roles

1. Add the role and its permission set to `ROLE_CATALOG` in
   `api/auth/roles.js` — `KNOWN_ROLES` derives from it, so the settings UI
   and validation pick it up with no further changes.
2. Guard routes with `requireRole(["new-role"])` (one line per route, via
   the `authService.guards` factory already passed to route registrars).
3. Cover the new role in `api/auth/roles.test.js` and, for guarded routes,
   in `api/auth/enforcement.test.js` following the existing
   off/401/403/200 matrix.

State files (all JSON, atomic writes, under
`~/.kainbain/engine/auth/` unless `KAINBAIN_AUTH_STATE_PATH` overrides):
`users.json` (JIT accounts, direct + project roles), `sessions.json`
(hashed session ids), `access.json` (runtime overrides + group mappings),
`audit.jsonl` (sign-in and role-change trail).
