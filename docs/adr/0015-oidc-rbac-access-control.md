# ADR 0015 — OIDC sign-in with role-based access control (togglable, single tenant)

**Status:** Accepted (proof of concept).
**Date:** 2026-11-09.
**Context:** Task `94e3072d-a847-4533-bd99-244070f2805c` — add OpenID/OAuth support
so a small/medium company can plug KainBain into its existing account
infrastructure. Survey answers: default OFF with a shared built-in `admin`
user (q1), one organisation per installation (q2), generic OIDC provider plus
LDAP/AD reachability (q3), just-in-time account creation with no local
passwords (q4), roles directly on users AND via groups (q5), groups mapped
from the identity provider (q6), PoC roles `admin` plus `member`/`viewer`
(q7 — survey mandates `admin`; the set is data-driven and expandable),
project-level roles supported in the model (q8), standards-based sign-in
persistence (q9), settings page with env overrides (q10), PoC enforcement on
the settings and user-administration surface (q11), configurable role
managers defaulting to `admin` (q12), tests included (q13), full guide with
setup examples and troubleshooting, README untouched (q14).

## Decision

1. **Generic OIDC Authorization Code flow with PKCE** for sign-in, using the
   **`jose`** library as the single new dependency (verified `^6.2.17`
   against a mock IdP on Node `^20.19.0 || >=22.12.0`; spike note in
   `docs/tasks/94e3072d-a847-4533-bd99-244070f2805c/`). Discovery document →
   authorize redirect → token exchange → ID-token verification via JWKS.
   No hand-rolled crypto.
2. **LDAP / Active Directory is out of PoC scope as a native protocol.**
   AD/Entra ID, AD FS, and LDAP directories are reachable through standard
   OIDC fronts (Entra ID, AD FS, Keycloak); the generic-OIDC PoC therefore
   covers LDAP/AD shops via their existing OIDC bridge. Revisit only if a
   customer has no OIDC-capable front.
3. **Server-side sessions referenced by an opaque id** in an
   `HttpOnly; Secure; SameSite=Lax` cookie (rotated on login, sliding expiry,
   revocable server-side). The IdP ID token is verified once at the callback
   (issuer, audience, expiry, nonce, signature via JWKS); IdP tokens are
   never stored long-term and raw browser-presented JWTs are never trusted —
   the JWTs are processed server-side at the token endpoint, per q4.
4. **Role model:** installation-wide `directRoles` on the user unioned with
   roles from `groupRoleMappings` applied to the user's IdP groups, plus
   per-project `projectRoles[projectId]` unioned in when the route carries a
   project id. Deny rules: a disabled user gets no roles; unknown role names
   in stored data are ignored (fail closed to known roles). Built-in
   catalogue is code-defined in `api/auth/roles.js` (`admin`, `member`,
   `viewer`); new roles later are data plus one line.
5. **Toggle and config precedence:** `KAINBAIN_AUTH_ENABLED` defaults to
   `false`. When disabled, every request is attributed to the shared
   built-in admin (`{ id: "admin", name: "admin", roles: ["admin"],
   builtin: true }`) — byte-identical behaviour to today. Runtime overrides
   (settings page, persisted to `~/.kainbain/engine/auth/access.json`) beat
   env vars, which beat schema defaults. The client secret is `secret: true`
   and redacted in `GET /status/config`.
6. **PoC enforcement surface:** settings and user-administration mutation
   routes plus the new `/auth` admin endpoints, guarded by
   `requireRole(["admin"])` (configurable to other role-manager roles).
   Extending to a route is a one-line change (preHandler or route config).
   Runner channel (`x-runner-credential`), health checks, `/docs`, and the
   agent guide stay outside user auth by design.
7. **Persistence:** JSON under `~/.kainbain/engine/auth/` via
   `resolveStatePath` plus atomic writes from `api/house/fileWriting.js`
   (`users.json`, `sessions.json`, `access.json`, `audit.jsonl`).

## Threat model (PoC)

- Code flow uses PKCE (`S256`) plus `state` and `nonce` (single-use,
  short-lived, `SameSite=Lax` cookies); strict redirect-URI allowlist — the
  callback only completes when `redirect_uri` matches the configured value.
- JWKS fetched from the discovery document; key rotation tolerated by
  refetching on unknown `kid`; clock skew bounded by a small leeway.
- Cookie flags: `HttpOnly` always, `Secure` whenever the request is https or
  the host is non-loopback, `SameSite=Lax` so the top-level OIDC redirect
  back works; logout is `POST` only (CSRF-safe); session id rotated at login
  (fixation resistance); idle TTL plus absolute TTL; server-side revocation
  on logout.
- Re-checks at refresh time re-read the user record, so disabling a user or
  changing their roles takes effect without waiting for session expiry.
- Audit log (`audit.jsonl`) records sign-ins and every role/mapping/settings
  change (who, what, when). Secrets never appear in `/status/config`.
- Admin lockout recovery: the `KAINBAIN_AUTH_ADMIN_GROUP` IdP group (or
  `KAINBAIN_AUTH_BOOTSTRAP_ADMINS` subject list) always maps to `admin`, and
  the env-level switch can always turn auth back off.

## Consequences

- One new dependency (`jose`) — passes `npm run sec` (semgrep + trivy).
- New backend domain `api/auth/` following the repo domain pattern
  (one function per file, JSDoc `@example` on every export, co-located
  tests), wired first in `api/index.js` so every route can rely on
  `request.user` / `request.auth`.
- Full guide in `docs/authentication-and-access-control.md` and the in-app
  article `site-docs/authentication.md`; `README.md` untouched.
- Native LDAP bind, multi-tenancy, SCIM, per-route matrix beyond the PoC
  surface, and front-channel SLO remain non-goals, recorded here so a later
  stage can pick them up without re-deciding the PoC.

## Spike note (Phase 0)

`jose` `createLocalJWKSet` + `jwtVerify` verified a full code flow against a
mock IdP fixture (discovery → JWKS → signed ID token) in the repo's Node
range during development; the mock-IdP helper used by the integration tests
lives in `api/test-helpers/mockOidcProvider.js`.
