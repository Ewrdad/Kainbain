# Install Safety Review — domainRegistry extraction

- **Branch:** `kb/d8fe9ad9-da9d-4618-a5ce-878497132b0b` at `origin/kb/d8fe9ad9-da9d-4618-a5ce-878497132b0b` (`79bf3327`)
- **Scope:** `git diff HEAD..origin/kb/d8fe9ad9-da9d-4618-a5ce-878497132b0b --stat` = 6 files:
  `frontend/src/services/api.js` (+42/−), new `frontend/src/services/domainRegistry.js` (+222),
  `frontend/src/services/domainRequests.test.js`, `frontend/src/services/api.surface.test.js`,
  plus task docs (`SURVEY.md`, `review-plan-20261116-082152.md`).
- **Question:** does this break existing installs on update (startup crash, data loss, API break)? **Verdict: PASS — no break found.**

## 1. No persisted / backend / deploy surface

- **Zero diff** in `api/`, `shared/`, `runner/`, `scripts/`, `deploy.sh`, `Dockerfile`, `docker-entrypoint.sh`,
  `docker-compose.yml`, `package.json` / `frontend/package.json` / lockfiles, or any env/config file.
  No new runtime dependency, no DB migration, no frontmatter/config format change, no endpoint or
  request/response shape change. Existing installs update by replacing the built frontend bundle;
  `PROJECTS_ROOT` / `STATE_DIR` / `NOTES_SPACE_ROOT` mounts, `build.json` stamping, and the
  `COPY frontend/` → `COPY --from=build /build/frontend/dist ./frontend/dist` packaging path are
  untouched. New `domainRegistry.js` lives under `frontend/src/services/` and is bundled as part of
  `frontend/dist` — no manifest allowlist or `check-imports-declared` issue (all imports are relative).

## 2. Frontend runtime equivalence (the only production-code risk, `api.js` rewire)

- **Order preserved.** Old `api.js` spreads `work, flow, crew, watch, runner, house, retrospective, accessibility`
  then the `getFileRawUrl` override. New `domainRegistry.js` lists `work, flow, crew, watch, runners, house,
  retrospective, accessibility` in the same order, and new `api.js` spreads
  `...Object.assign({}, ...domainRegistry.map(...))` then the same override. Later-wins semantics are identical.
- **Wiring preserved.** `work` gets `(request, isValidProjectId)`; the other seven get `(request)` — both
  old and new. New `build({ request, isValidProjectId })` destructures only `request` for the six single-arg
  factories, so the extra value is ignored exactly as before.
- **Registry matches factories.** Live Node import of all eight factories at HEAD shows 106 keys total,
  106 unique, no duplicates. Parsing `domainRegistry.js` operations per domain gives the same 14/24/12/8/15/30/1/2
  lists (work/flow/crew/watch/runners/house/retrospective/accessibility) — every domain matches exactly,
  no missing, no extra. Registry total is 106 unique.
- **`api` surface identical.** Composing old-style spreads vs new registry-order `Object.assign` with the same
  15 literal non-domain keys gives 121 vs 121 keys, byte-identical sorted lists. `getFileRawUrl` dual
  definition is preserved: `houseRequests` key uses the imported `API_BASE` directly, the overriding wrapper
  calls the standalone `getFileRawUrl(API_BASE, …)` — same base, same `encodeURIComponent`, same URL
  (verified `getFileRawUrl('p','a/b')` equal in both compositions). The surface test's overlap pin
  (`['getFileRawUrl']` only) and `16 + 106 − 1 = 121` union math therefore hold.
- **Named exports unchanged.** Both revisions have 5 `export {}` blocks plus `export const api` and `wsUrl`;
  the registry's `domainRegistry` / `collectDomainOperationNames` / `buildDomainClients` exports are not
  re-exported through `api.js`, so the pinned named-export set is untouched.
- **Import graph safe.** Factories import only `apiBase.js` (`house`) or nothing — none import `api.js`
  or `domainRegistry.js`, so no new cycle. `api.js` → `domainRegistry.js` → factories is the same edge set
  as the old `api.js` → factories, just one hop deeper. `check-duplicate-settings` only scans
  `components/settings/`, so new identifiers cannot collide there, and `domainRegistry` has no prior
  definition in the tree.
- **Load-time fail-fast is inert at this commit.** The registry's shape guard (`build` is a function,
  `operations` is a non-empty string list) passes for all eight entries; it throws only on a future typo,
  with the domain named — replacing the old unclear `undefined is not a function` one level up, not a new
  crash class.

## 3. Test-only changes cannot break installs

- `domainRequests.test.js` (magic `toHaveLength(105)` + tally → registry-derived per-domain equality,
  cross-domain no-duplicates, `typeof api[name] === 'function'`) and `api.surface.test.js` (121 literal
  domain keys → 16 stable non-domain keys + registry union) run under Vitest and never ship in
  `frontend/dist`. Their failure mode is a red CI stage, never a runtime break in an installed app.

## Evidence

- Inline Node ESM imports of the eight factories (no files written): per-domain key lists above,
  `TOTAL 106 UNIQUE 106 DUPS []`; old-style vs registry-order composition `old 121 new 121 identical true`.
- `grep -rn "toHaveLength(10" frontend/src` shows the only remaining 105 pin was in the old
  `domainRequests.test.js`; the new revision contains no `toHaveLength(10` literal for domain operations.
- Full `npm run test:frontend` / `npm run build:frontend` were not re-run in this docs-only session
  (`frontend/node_modules` absent in this worktree); the equivalence argument above is static + live-import
  based, with no production-code behavior change to gate on. The Automated tests stage remains the
  authoritative CI gate for the new assertions.

## Conclusion

No startup crash, data loss, migration, or API/frontend contract break on update was found. Existing
installs replace static assets and behave identically; the test brittleness is removed without touching
any persisted or server-side surface. **PASS.**
