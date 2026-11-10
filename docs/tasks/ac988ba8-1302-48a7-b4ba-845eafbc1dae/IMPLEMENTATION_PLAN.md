# API Key System — Implementation Plan

## Goal

Add a togglable API key system so external services and agents (e.g. security
scanners auto-creating tickets) can call the KainBain API with least-privilege
credentials. Keys reuse the user-account permission structure, default to OFF
(allow-all, byte-identical behaviour to today), never disturb the browser UI
session flow or the runner credential channel, and every action a key takes is
attributable to that key by name.

## Success Criteria

- An admin can create a key with a name, a role/scopes, and an optional expiry;
  the secret is shown once and stored hashed.
- With the feature ON, a request bearing a valid key is authorised exactly per
  that key's grants (valid key + `tasks:create`-style grant can create tasks;
  unknown/expired/revoked keys get 401; valid keys outside their grants get 403).
- With the feature OFF (the default), all API behaviour is byte-identical to
  today, including UI sessions and runner registration/claims/heartbeats.
- UI cookie login and the runner `x-runner-credential` + join-token channel
  work unchanged with the feature ON and OFF (no key required for either).
- Task history, the auth audit log, and a key-usage view all show which key
  name performed each action.
- `npm run test:unit`, the auth enforcement suite, and `npm run docs:check`
  all pass; user-facing docs describe setup, rotation, and revocation.

## Context — Current-State Evidence

All facts below were read from the working tree (not assumed):

- **Auth core** (`api/auth/`): OIDC sign-in + session cookie + RBAC. Role
  catalogue is `admin` (`*`), `member` (`read`, `write`), `viewer` (`read`)
  (`api/auth/roles.js`). Guards are one-line `requireRole([...])` preHandlers
  that pass through while `authEnabled !== true` (`api/auth/rbac.js`). The
  `onRequest` hook attributes every request (`request.user` / `request.auth`)
  and never rejects on its own (`api/auth/middleware.js`).
- **Toggle + persistence**: `authEnabled` defaults OFF via config schema
  (`api/config/schema.js`, `KAINBAIN_AUTH_ENABLED=false` in `.env.example`);
  settings-page overrides persist in `access.json`; state dir defaults to
  `~/.kainbain/engine/auth/` holding `users.json`, sessions, and `audit.jsonl`
  (`api/auth/accessConfig.js`, `api/auth/auditLog.js`).
- **Enforcement surface is tiny**: only `promptLayout`, `push`, and `imageGen`
  routes use `requireRole` today. Task routes (`POST/PATCH/DELETE /tasks…` in
  `api/work/taskWorkRoutes.js`) are **unguarded** — so keys cannot gate
  anything meaningful until guards cover the task surface. This is the key
  "make change easy" prerequisite (Step 2).
- **Runner channel is already separate**: runners authenticate with the
  `x-runner-credential` header plus a join token, and `/runners` is in
  `PUBLIC_AUTH_PATH_PREFIXES`, so user-auth enforcement already bypasses it
  (`api/flow/runnerRoutes.js`, `api/auth/middleware.js`).
- **UI flow**: session cookie (`kb_session`), `RequireAuth` guard, `LoginPage`,
  `AccessControlSection` + `AccessUserList` settings UI, `frontend/src/services/auth/`
  client facades.
- **Attribution seams**: `recordHistory(task, action, timestamp)` appends
  `{timestamp, action}` strings capped at 150 entries
  (`api/work/taskPersistence.js`); `recordAuthAudit({stateDir, action, actor, detail})`
  appends JSONL and never throws (`api/auth/auditLog.js`).
- **Secret-handling precedent**: session ids are `crypto.randomBytes(32)` /
  base64url, stored as SHA-256 hashes (`api/auth/sessionStore.js`). API keys
  should follow the same recipe.
- **Test precedent**: `api/auth/enforcement.test.js` proves enforcement on the
  real wired server with a temp `KAINBAIN_AUTH_STATE_PATH` and `app.inject` —
  the API-key validation plan reuses this harness verbatim.

## Survey Inputs (SURVEY.md) — How They Were Factored In

`SURVEY.md` exists but is **unanswered** (`"answers": {}`), and the referenced
`idea-20261110-163438.md` is not present in the task directory — so the plan
treats the survey's marked Recommended options as *assumed* answers (each
flagged ASSUMED below) and carries the two questions with no recommendation
(Q3 scope areas, Q8 attribution surfaces) as Open Questions with proposed
defaults. If the answers arrive later, only Steps 3–6 need re-pointing; the
enabling work in Steps 1–2 is unaffected either way.

| # | Question | Assumed answer (survey Recommended) | Plan effect |
|---|----------|-------------------------------------|-------------|
| Q1 | Own switch vs shared | ASSUMED: own separate switch | New `apiKeysEnabled` knob, independent of `authEnabled` (Step 3) |
| Q2 | Broad roles vs narrow abilities | ASSUMED: narrow abilities per key, but the task text also says "same permissions structure as user accounts" → plan adopts **Both**: one catalogue role + optional narrowing scope allowlist | Key grants = `{ roles, scopes }` where scopes can only subtract (Step 3) |
| Q3 | Which areas keys may use | No recommendation → default: tasks/tickets + status/history read; runs control, settings, and user/key management excluded until Open Q answered | Scope vocabulary seeded with task + read-only scopes; admin scopes stubbed but unroutable (Step 3) |
| Q4 | Creation UI | ASSUMED: settings page, by admin | `ApiKeysSection` in System Settings + admin-only `PUT/POST /auth/api-keys*` (Steps 7–8) |
| Q5–Q6 | Expiry | ASSUMED: optional expiry, 90-day default | `expiresAt` nullable; creation form pre-fills +90 days, clearable (Steps 3, 8) |
| Q7 | Runners/browser unchanged | ASSUMED: keys purely additive | Runner + UI paths byte-identical; non-regression suite gates every step (Step 9) |
| Q8 | Where key name appears | No recommendation → default: all three (task history, usage log, audit log) | `request.actor` plumbed to all three (Step 6) |

## Approach

"Make change easy, then make the change", with the big/risky pieces first:

1. **Research spikes first** (Step 1): map the full guard surface and the
   runner/UI auth flows before touching code, so later steps never guess.
2. **Make change easy** (Step 2): extract the shared seams (one actor-resolution
   helper, guard coverage on the task surface) with zero behaviour change while
   everything is OFF.
3. **Make the change** (Steps 3–8): store → toggle → request hook → guards →
   attribution → management API → UI, each step independently testable.
4. **Prove it** (Steps 9–10): non-regression + docs as gating deliverables, not
   afterthoughts.

## Steps

### Step 1 — Research spikes (do first; no behaviour change)

- **1a. Guard-coverage audit.** Enumerate every mutating route (`POST/PUT/PATCH/DELETE`
  across `api/routes/`, `api/work/taskWorkRoutes.js`, `api/flow/*Routes.js`)
  and record which carry `requireRole` today. Output: a table in the
  implementation notes mapping route → required role → key scope needed. This
  sizes Step 2 and the scope vocabulary.
- **1b. Runner/UI auth-flow map.** Trace `x-runner-credential` registration →
  claim → heartbeat and cookie login → `RequireAuth` → `/auth/me`, confirming
  the exact headers/cookies each path depends on. Output: the non-regression
  checklist consumed by Step 9.
- **1c. Scope-vocabulary spike.** Propose the minimal scope list that covers the
  Q3 default (`tasks:read`, `tasks:create`, `tasks:update`, `status:read`)
  plus reserved-but-unroutable names for the rest (`runs:control`,
  `settings:write`, `admin:users`, `admin:keys`). Validate against the Step 1a
  table: every guarded route must map to exactly one scope.

Validation: the three notes exist and are reviewed; no code changed.

### Step 2 — Make change easy: shared seams + guard coverage (OFF-safe)

- **2a. Extract actor resolution.** Add `resolveRequestActor(request)`-style
  helper returning `{ kind: 'user'|'builtin', id, name, roles }` from the
  existing `request.user`/`request.auth` shape. The auth hook populates it;
  nothing consumes it yet. Pure refactor, covered by unit tests.
- **2b. Extend `requireRole` to the task surface.** Add `preHandler:
  requireRole([...])` to task create/update/delete routes (member-or-above for
  writes, mirroring the `member` = "create and update work" catalogue text).
  Guards still pass through while `authEnabled` is OFF, so default behaviour
  is unchanged; when ON, behaviour matches the already-documented RBAC model.
  Extend `api/auth/enforcement.test.js` with task-route 401/403/admin cases.
- **2c. Attribution seam.** Add an `actorLabel(request)` helper (user name
  today; `api-key:<name>` tomorrow) and use it in the 2–3 `recordHistory`
  call sites that record user-initiated edits, keeping existing strings
  identical for human actors.

Validation: `npm run test:api` green; enforcement tests cover new guards;
manual UI smoke with auth ON and OFF shows zero visible change.

### Step 3 — Key store + config toggle (default OFF)

- New `api/auth/apiKeyStore.js` mirroring `userStore.js`/`sessionStore.js`:
  `createApiKey({name, roles, scopes, expiresAt, createdBy})` returns the
  plaintext secret **once**; only `{ id, prefix, name, roles, scopes,
  hash, expiresAt, createdBy, createdAt, lastUsedAt, revoked }` persist to
  `api-keys.json` in the auth state dir (atomic writes, same as users).
  Secrets: `crypto.randomBytes(32)` base64url with a `kb_` + short prefix for
  identification; stored as SHA-256 hash; compared with `timingSafeEqual`.
  `sanitizeRoles` reused for roles; scopes validated against the Step 1c
  vocabulary (unknown scopes dropped, fail closed).
- Config: new schema keys `apiKeysEnabled` (default `false`) and
  `apiKeysHeader` (default `authorization`, accepting `Bearer <key>`, plus
  `x-api-key` alias), runtime-overridable via `access.json` like
  `authEnabled`; document in `.env.example` (`KAINBAIN_API_KEYS_ENABLED=false`).
- Scope semantics: effective grants = catalogue-role permissions **intersect**
  optional scope allowlist (scopes only narrow; a key with no scopes gets its
  full role — this satisfies both the task text and survey Q2).

Validation: unit tests for create/lookup/verify/expiry/revoke/hash-compare;
config tests for default-OFF and override precedence.

### Step 4 — Request hook: recognise keys additively

- Extend `createAuthRequestHook` (or a chained second hook): when
  `apiKeysEnabled` is ON **and** no valid session resolved, check the API-key
  headers; on match set `request.user = null`-compatible key identity plus
  `request.auth = { enabled, kind: 'api-key', keyId, keyName, roles, scopes }`
  and update `lastUsedAt` (best-effort, never throws). Session cookies always
  win when both are present; when the toggle is OFF the headers are ignored
  entirely. Runner `/runners` and other public prefixes keep bypassing as
  today — untouched code paths.
- `resolveWsUser` unchanged (keys are HTTP-only; websockets stay session-based).

Validation: `app.inject` tests — key ignored while OFF; valid key attributed
while ON; session beats key when both sent; malformed/expired/revoked → 401
shape identical to session 401s.

### Step 5 — Guards enforce key grants

- Extend `requireRole` (or add `requireGrant`) so key-attributed requests pass
  only when the key's role satisfies the route's role **and** the route's scope
  (from the Step 1a map) is in the key's allowlist (or the key has none).
  Human sessions behave exactly as before.
- Wire scopes onto the routes guarded in Step 2b plus read routes needed for
  the Q3 default.

Validation: matrix tests per guarded route × {no creds, bad key, expired key,
valid key without scope → 403, valid key with scope → 200, admin session → 200}.

### Step 6 — Attribution: flag every key action by key name

- Populate `request.actor = { kind: 'api-key', name }` (or the user actor) in
  the hook; `actorLabel` renders `api-key:<name>`.
- **Task history**: key-initiated creates/updates record e.g.
  `Task created by api-key:security-scanner` via the Step 2c seam.
- **Auth audit log**: `recordAuthAudit` entries for `apikey.created`,
  `apikey.revoked`, `apikey.used_denied` (actor = admin user or key name;
  never log secrets).
- **Usage log**: lightweight per-key `lastUsedAt` + a `GET /auth/api-keys/:id/usage`
  view sourced from the audit log (no new log file unless volume demands it —
  reassess if a key exceeds ~1k calls/day).

Validation: create/update a task via key, assert history strings; revoke a key,
assert audit entries; assert no secret material appears in any log/assert dump.

### Step 7 — Key management API (admin-only)

- `POST /auth/api-keys` (create; secret in response once), `GET /auth/api-keys`
  (metadata only, never hashes), `DELETE /auth/api-keys/:id` (revoke),
  reuse the `managerOnly` pattern from `api/auth/routes.js`. All mutations
  audited. Rate-limit creation modestly (reuse any existing limiter; otherwise
  a simple per-minute cap) to blunt enumeration.

Validation: route tests for 401/403/admin matrix, secret-once semantics,
revoked-key-immediately-401, audit entries.

### Step 8 — Settings UI: API keys section

- New `ApiKeysSection.jsx` beside `AccessControlSection` (same System Settings
  › Access tab): enable toggle, key table (name, prefix, roles/scopes, expiry,
  last used), create form (name, role, scopes, expiry pre-filled +90d,
  clearable), one-time secret reveal with copy button, revoke with confirm.
  Client facades in `frontend/src/services/auth/` mirroring the existing
  `getAuthSettings`/`saveAuthSettings` style. Non-admins see the same
  access-denied pattern as `AccessControlSection`.

Validation: component tests (render, denied state, create flow with mocked
service, secret shown once); headless check via existing fixtures or
`npm run capture:screenshot` only if visual doubt arises (no long-lived
servers per stage guidance).

### Step 9 — Runner/UI non-regression gate (blocks completion)

- Re-run the Step 1b checklist as automated tests: runner register → claim →
  heartbeat → release with the feature ON and OFF (keys never required);
  cookie login → `/auth/me` → guarded settings mutation → logout with the
  feature ON and OFF; `/runners`, `/status/health`, `/docs`, `/ws` stay open.
- Add a dedicated `api/auth/apiKeys.enforcement.test.js` (same temp-state-dir +
  `app.inject` recipe as `enforcement.test.js`) covering the full matrix from
  Steps 4–5 plus the Step 9 flows, so regressions fail the unit gate.

Validation: new suite green; full `npm run test:unit` green; `npm test`
(full gate) green before sign-off.

### Step 10 — Documentation (part of done, not follow-up)

- `.env.example`: new knobs with comments. `site-docs/` (served by `GET /docs`):
  operator page for creating, scoping, rotating, and revoking keys.
  `CHANGELOG.md`: feature entry. Agent/guide surfaces if they enumerate auth
  (`agentGuide` coverage test will flag gaps — keep it green).
- Assurance: `npm run docs:check` green (link integrity + env coverage +
  JSDoc examples for every new exported function, per repo gates).

## Validation Plan (assurance summary)

| Level | What | How |
|-------|------|-----|
| Unit | store, hash/compare, expiry, scope narrowing, actor label | `npm run test:api` (vitest, co-located `*.test.js`) |
| Integration | guard matrix + runner/UI flows, feature ON and OFF | new `apiKeys.enforcement.test.js` + extended `enforcement.test.js`, `app.inject`, temp state dir |
| Frontend | keys section render/denied/create/revoke | `npm run test:frontend` (vitest + mocked services) |
| Docs gates | links, env coverage, JSDoc examples, one-function-per-file | `npm run docs:check`, `npm run check:one-function`, `npm run check:jsdoc-example` |
| Full gate | everything incl. canary E2E | `npm test` (or `-- --no-canary` when canary env is unavailable, stated explicitly) |
| Manual | create key → scanner-style `POST /tasks` → history shows key name → revoke → 401; UI login + runner daemon smoke | one scripted pass, recorded in the task notes |

Highest-risk validation: **Step 9's runner/UI non-regression matrix** — a key-system
bug that breaks runners or UI login is worse than no keys at all, so it gates
completion and runs with the feature both ON and OFF.

## Risks

- **Guard expansion (Step 2b) changes auth-ON behaviour.** Mitigation: guards
  mirror the documented catalogue semantics; OFF (the default) is provably
  unchanged; enforcement tests pin both modes.
- **Secret leakage via logs/errors.** Mitigation: hash-at-rest, secret-once,
  prefix-only in listings, audit reviews asserting no secret material.
- **Scope-vocabulary drift** (routes added without scopes). Mitigation: default
  deny for key-attributed requests on unmapped mutating routes; coverage test
  asserting every guarded route declares a scope.
- **Survey unanswered.** Mitigation: assumptions table above isolates the blast
  radius to Steps 3–6 if answers differ.

## Open Questions

1. Q3 scope: is the default (tasks + status-read now; runs/settings/users/keys
   excluded) right, or should any of runs control, settings, or user/key
   management be key-accessible from day one?
2. Q8 attribution: is all three surfaces (task history, usage view, audit log)
   acceptable, or should any be dropped for noise/volume reasons?
3. Should keys be project-scoped (like `projectRoles`) in addition to global,
   or is global-only sufficient for v1? (Plan assumes global-only v1.)
4. Any retention requirement for the usage/audit data (e.g. 90 days), or is
   unbounded JSONL acceptable for v1?

## Non-Goals

- Replacing OIDC session login or the runner credential channel.
- Per-task-instance or per-project key scoping beyond catalogue roles + global scopes (v1).
- Key rotation automation / scheduled expiry jobs (manual rotate = create +
  revoke; automation later).
- Websocket authentication via keys (HTTP-only for v1).
