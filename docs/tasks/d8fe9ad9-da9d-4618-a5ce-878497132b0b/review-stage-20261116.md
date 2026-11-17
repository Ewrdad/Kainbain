# Review stage — PR review of the magic-number fix (task d8fe9ad9)

**Verdict: PASS.** Reviewed `main...HEAD` for this branch (4 frontend files +
task docs) and verified the acceptance criteria by experiment. The repo
working tree was not modified (probes ran on a `/tmp` copy; the only file
written is this report).

## What changed

- `frontend/src/services/domainRegistry.js` (new, 222 LOC): single source of
  truth — one entry per domain pairing the request-list factory with the exact
  operation names it must expose, plus `collectDomainOperationNames`,
  `buildDomainClients`, and a load-time shape guard that names the domain on a
  malformed entry.
- `frontend/src/services/api.js`: domain spreads replaced by
  `...Object.assign({}, ...domainRegistry.map(e => e.build({ request, isValidProjectId })))`;
  the explicit `getFileRawUrl` override is kept and commented.
- `frontend/src/services/domainRequests.test.js`: `toHaveLength(105)` and the
  ~40-line tally comment removed; assertions now derive from the registry
  (per-domain key-set equality, cross-domain no-duplicates, client-name
  equality, per-op `typeof api[name] === 'function'`).
- `frontend/src/services/api.surface.test.js`: the 121-key literal split into
  16 literally pinned stable non-domain keys + registry-derived domain keys,
  with the `getFileRawUrl` overlap pinned explicitly. Named-export pin untouched.

## Verification (executed, not assumed)

| Check | Result |
|---|---|
| `vitest run src/services/domainRequests.test.js src/services/api.surface.test.js` (in repo) | 2 files, 32 tests passed |
| Full frontend suite `vitest run` (in repo) | 353 files, 4791 tests passed, exit 0 |
| Full `src/services` directory | 28 files, 386 tests passed |
| Composed `api` key set: branch vs `main` (live import of both) | identical, 121 = 121; also identical to main's old pinned surface list |
| Registry vs factories (live import) | per-domain match 14/24/12/8/15/30/1/2 = 106 unique, no dups |
| Probe A — add `probeNewOp` to work factory + registry, no test edits | 32/32 green (acceptance: add-op keeps suite green) |
| Probe B — drop `getTask` from work factory, registry intact | fails: "work client keys" + surface test (dropped op caught) |
| Probe C — duplicate `getTask` into flow + registry | fails: "duplicate domain operations: expected [ 'getTask' ] to deeply equal []" |
| Probe D — factory key without registry entry | fails in both suites, "work client keys" named |
| Probe E — registry entry without factory key | fails in both suites, "work client keys" named |
| `eslint` on the 4 touched files | 0 errors; the 2 `security/detect-object-injection` warnings in the test are pre-existing on main's version |
| `check-imports-declared.js`, `check-react-imports.js` | pass (745 files) |
| `grep toHaveLength(10` in `frontend/src` | no operation-count pins remain (two unrelated `toHaveLength(100)` component pins) |

## Review questions

- **Goal achieved?** Yes — no magic number remains; the registry is the one
  place an endpoint is added (factory key + registry line, same diff).
- **Followed the plan?** Yes — matches IMPLEMENTATION_PLAN.md (registry
  extraction, zero-behavior rewire proven by key-set identity, derived
  assertions, all 8 domains covered incl. `retrospective`, which the old test
  missed).
- **Code standards?** Yes — eslint clean (0 errors), import checks pass, no
  new dependencies, no backend/runner/deploy surface touched (consistent with
  the prior install-safety review's PASS).
- **Easy to modify later?** Yes — registry header documents "add an endpoint
  here"; failure messages name the domain/op; load-time guard catches typos.
- **Best practices / tech debt?** Sound. Later-wins spread semantics preserved
  by keeping registry order = old spread order; the intentional
  `getFileRawUrl` dual definition is pinned by the surface test so a future
  divergence fails loudly rather than silently changing clients. No new debt.
- **Docs updated?** CHANGELOG is curated at release only ("ordinary PRs are not
  required to touch this file"), so no entry needed; task docs folder carries
  survey/plan/safety-review. One minor follow-up (not blocking): root
  `AGENTS-MAP.md:49,54` still describes `api.js` as a pure re-export facade
  and omits `domainRegistry.js` (and the `runners`/`accessibility` domains) —
  worth a one-line update in a code-capable stage so "new requests go in
  services/{...}/index.js" also says "+ one registry entry in
  domainRegistry.js". Not editable from this docs-only stage.

## Case-study tie-in

The cccd8b9d failure (`expected …(104) to have a length of 104 but got 105`,
automated-tests-failure-20261115-232533.md:136) is exactly the failure mode
removed: under Probe A the same class of change (new op added correctly) now
keeps the suite green with no test edit, while Probes B–E show drops,
duplicates, and unregistered adds still fail fast with the offender named.
