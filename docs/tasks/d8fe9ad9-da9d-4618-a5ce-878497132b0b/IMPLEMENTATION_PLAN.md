# Implementation Plan — Replace the magic-number domain-operation count

Task `d8fe9ad9-da9d-4618-a5ce-878497132b0b`.
Problem: `frontend/src/services/domainRequests.test.js` pins an exact hardcoded
client size (`expect(names).toHaveLength(105)`). Every legitimate new API
operation breaks it and costs a full CI cycle to discover and fix.

> Process note: this plan follows "make change easy, then make the change".
> Phase 1 extracts a single source of truth (a domain-request registry) and
> rewires composition to it while keeping every test green; Phase 2 rewrites
> the assertions to derive from that registry. Big / risky pieces come first.
>
> Evidence gap: the stage prompt references `SURVEY.md` (grill-me survey) and
> `idea-20261116-072233.md` in this task's docs folder, but neither file — nor
> the folder itself — existed in this worktree at plan time (verified via
> directory listing and filesystem search). All survey-dependent scope calls
> below are marked `[ASSUMPTION — confirm against survey]` so the implementer
> can reconcile them if the survey surfaces.

## Goal

Adding a new domain operation updates exactly one source file (the
domain-request registry, in the same diff as the endpoint) and no test file,
while the suite still fails fast — with the offending operation named — if an
operation is dropped from the client, duplicated across domains, or added
without registering it.

## Success Criteria

1. `frontend/src/services/domainRequests.test.js` contains no literal operation
   count and no per-operation tally comment block; its expectations derive from
   the registry.
2. Adding a new domain operation (registry entry + domain-factory key, no test
   edits) keeps `npm run test:frontend` green.
3. The suite still fails when: an operation is dropped from the composed `api`
   client but still registered; the same operation name is returned by two
   domain factories; a factory exposes an operation the registry does not list
   (forces the one-registry update instead of a silent pass).
4. All 8 domain factories composed by `api.js` (including
   `retrospectiveRequests`, currently missing from the test) are covered by the
   consistency check.
5. `npm run test:frontend`, `npm run lint:frontend`, and the repo's
   `npm run test:unit` gate pass; no production behavior change (the composed
   `api` object is key-for-key identical before/after).

## Context — grounded findings

- Brittle assertion: [domainRequests.test.js](/home/server2/.kainbain/runner-work/kb-d8fe9ad9-da9d-4618-a5ce-878497132b0b/frontend/src/services/domainRequests.test.js:62)
  (`expect(names).toHaveLength(105)`) plus a ~40-line tally comment
  (lines 23–61) that must be hand-edited per endpoint. Git history shows the
  count being bumped repeatedly (e.g. commit `1fc1b3b3` "95->97 op count";
  27 `toHaveLength` occurrences in the file's history).
- Case study: [automated-tests-failure-20261115-232533.md](/home/server2/.kainbain/runner-work/kb-d8fe9ad9-da9d-4618-a5ce-878497132b0b/docs/tasks/cccd8b9d-9021-4d0f-b51c-26d489073567/automated-tests-failure-20261115-232533.md:136)
  — adding `uncompleteTask` flipped the count 104 → 105 and failed the
  Automated tests stage after ~17 min of CI.
- The test builds clients from **7** factories (line 20) but
  [api.js](/home/server2/.kainbain/runner-work/kb-d8fe9ad9-da9d-4618-a5ce-878497132b0b/frontend/src/services/api.js:113)
  composes **8** (adds `retrospectiveRequests`, i.e. `retrospectiveChat`).
  Factory list and composition have already drifted — a test-only fix would
  leave this gap.
- Overlap trap: `getFileRawUrl` is BOTH a key inside `houseRequests`
  ([house/index.js:83](/home/server2/.kainbain/runner-work/kb-d8fe9ad9-da9d-4618-a5ce-878497132b0b/frontend/src/services/house/index.js:83))
  and an explicit key on `api` ([api.js:121](/home/server2/.kainbain/runner-work/kb-d8fe9ad9-da9d-4618-a5ce-878497132b0b/frontend/src/services/api.js:121)).
  So `api` keys (121 pinned) = union(16 non-domain keys, 106 domain names),
  not a sum. Any "exact set" assertion must be a true set comparison, and the
  `api.js` rewire must preserve the explicit-override behavior (or prove the
  two definitions equivalent before collapsing them).
- Second pin: [api.surface.test.js](/home/server2/.kainbain/runner-work/kb-d8fe9ad9-da9d-4618-a5ce-878497132b0b/frontend/src/services/api.surface.test.js:16)
  pins all 121 `api` keys literally — by design ("Any rename/drop fails here
  first"). Today, adding an endpoint means touching **two** test files. The
  plan re-scopes this pin (see Decision 2) so the registry becomes the only
  domain touchpoint.
- Factory signatures differ: `workRequests(request, isValidProjectId)` vs the
  rest `xxxRequests(request)`. The registry must carry each factory's wiring,
  not just names.
- No `frontend/node_modules` in this worktree, so no baseline test run was
  possible at plan time; the implementer's first step is establishing the green
  baseline via the repo's own commands (Step 0).

## Approach

Two-phase, behavior-preserving first:

- **Phase 1 — make the change easy (source refactor, tests untouched and
  green):** introduce one registry module (suggested
  `frontend/src/services/domainRegistry.js`; exact name at implementer's
  discretion) that explicitly enumerates, per domain, the operation names that
  domain must expose, paired with its factory and wiring. Rewire `api.js` to
  compose the domain portion of `api` from the registry. Prove zero behavior
  change: full frontend suite + a key-for-key `api` snapshot comparison
  before/after.
- **Phase 2 — make the change (test rewrite):** rewrite the brittle test to
  derive expectations from the registry (per-domain key-set equality,
  cross-domain no-duplicates, every registered op a function on `api`), delete
  the magic number and tally comment, and re-scope `api.surface.test.js` so
  only the ~16 stable non-domain keys stay literally pinned while the domain
  portion derives from the registry.

Why an *explicit* (literal-name) registry rather than `Object.keys` of factory
outputs: a registry derived from the factories cannot catch drops — deleting
an operation from a factory would shrink the expectation too and stay green.
The registry is the independent enumeration the task asks for ("the client
exposes exactly the operations enumerated by the domain-request registry");
its update rides in the same diff as the endpoint, so it never costs a CI
cycle to discover.

## Key Decisions

1. **Explicit per-domain operation-name registry in source (not test-derived,
   not `Object.keys`-derived).** Rejected: (a) merely deleting the
   `toHaveLength` line — cheapest, but keeps the 7-vs-8 factory drift, keeps
   two test files as the touchpoint, and drops the drop-detection the task
   requires of this test; (b) `Object.keys`-derived expectations — cannot fail
   on drops.
2. **Re-scope `api.surface.test.js`, don't gut it.** Keep its literally-pinned
   non-domain keys (~16 stable client-surface keys) as the intentional
   change-detector; derive only the domain-key portion from the registry.
   `[ASSUMPTION — confirm against survey]`: the survey may instead scope this
   task to `domainRequests.test.js` only, leaving the surface pin as the one
   deliberate per-endpoint test touch. If so, Success Criterion 2 weakens to
   "no touch to `domainRequests.test.js`" and Step 5 is skipped — the rest of
   the plan is unchanged.
3. **Registry entries pair names with factory wiring** (each domain knows how
   to build its client, covering `workRequests`' extra `isValidProjectId`
   arg), so both `api.js` and the test consume one list and cannot drift
   again. Rejected: a names-only list plus a separate factory list — recreates
   the two-list drift this task exists to kill.
4. **`getFileRawUrl` enumerated once; override behavior preserved.** The
   registry lists it under `house`; `api.js` keeps its explicit override until
   the implementer proves equivalence (Step 2 investigation), otherwise the
   override stays with a comment. Rejected: silently collapsing the duplicate
   without the equivalence check.
5. **Failure messages name the operation.** Assertions use per-operation or
   set-diff comparisons (expected-set vs actual-set diff printed), never a
   bare length, so a failure points at the op without a CI round-trip.

## Steps

Big / risky work first. Each step lists its validation; do not proceed past a
red step.

### Step 0 — Establish the green baseline (prerequisite)

- Install deps per repo convention and run the focused suites:
  `npm run test --prefix frontend -- src/services/domainRequests.test.js`
  and `... src/services/api.surface.test.js`; then the full
  `npm run test:frontend`.
- Record the baseline: 105 domain names (7 factories), 121 `api` keys.
- Validation: both files pass unmodified. If the baseline is red for unrelated
  reasons, stop and report — do not build the refactor on a red base.

### Step 1 — Design the registry module (research piece, before code)

- Read all 8 domain factories (`work`, `flow`, `crew`, `watch`, `house`,
  `runners`, `retrospective`, `accessibility` under
  `frontend/src/services/*/index.js`, plus `taskImages.js` spread into `work`)
  and enumerate each factory's returned keys, noting composed spreads
  (`taskImageRequests` inside `work`) and the `getFileRawUrl` overlap.
- Decide the registry shape (recommended: array of
  `{ domain, build: (deps) => client, operations: [...] }`, with `work`
  receiving `isValidProjectId` via deps), the module path/name, and JSDoc
  conventions per repo standards.
- `[ASSUMPTION — confirm against survey]`: registry lives in
  `frontend/src/services/` next to its consumers; no new package or config.
- Validation: design reviewed against the Decision list above; no code yet.

### Step 2 — Extract the registry; rewire `api.js` composition (the big piece)

- Create the registry module with explicit per-domain operation lists (8
  domains; include `retrospective`, omitted from the test today).
- Rewire `api.js` to spread domain clients built via the registry instead of
  8 hand-written spreads. Keep the 16 non-domain keys and the `getFileRawUrl`
  explicit override exactly as-is (pending the equivalence check below).
- Investigate: compare `houseRequests().getFileRawUrl` with the standalone
  `getFileRawUrl(API_BASE, …)` wrapper on `api` — if behaviorally identical,
  collapse to one and note it; if different in any edge (encoding, defaults),
  keep both with a comment. Either outcome must keep the suite green.
- Validation: (a) full `npm run test:frontend` green with **zero test edits**;
  (b) key-for-key `api` snapshot diff before/after (a throwaway node/vitest
  probe dumping `Object.keys(api).sort()` on both revisions — must be
  identical); (c) `npm run lint --prefix frontend` clean.

### Step 3 — Rewrite `domainRequests.test.js` to derive from the registry

- Replace the `clients` array + `toHaveLength(105)` + tally comment with:
  1. per-domain: `Object.keys(factoryClient).sort()` equals the registry's
     `operations` for that domain (catches unregistered adds and drops);
  2. cross-domain: union has no duplicates (keep the existing Set check,
     now over all 8 factories);
  3. client exposure: every registry operation is a `function` on the real
     `api` import.
- Keep the remaining tests in the file (`it.each` contract pins, network-free
  invalid-project test) untouched.
- Validation: the focused file passes; failure output for an intentionally
  broken fixture names the operation (spot-check during Step 4).

### Step 4 — Mutation probes: prove the acceptance criteria (test-the-test)

With throwaway, immediately-reverted edits (never committed), verify each:

1. **Add:** register a fake op + factory key → full frontend suite green with
   no test edits (proves Criterion 2).
2. **Add without registering:** factory key only → `domainRequests.test.js`
   fails naming the op (proves the registry is enforced).
3. **Drop:** remove a factory key but keep the registry entry → fails naming
   the op (proves drop-detection).
4. **Duplicate:** return the same op name from two factories → fails
   (proves no-duplicates).
5. **Client exposure:** delete a spread from `api.js` composition → fails
   (proves client-exposure check).

- Validation: all five probes behave as stated; worktree clean afterward
  (`git status` shows only intended files).

### Step 5 — Re-scope `api.surface.test.js` domain portion

- Split the 121-key literal pin: keep the ~16 non-domain keys pinned
  literally; assert the domain-key subset of `api` equals the registry union
  (set comparison, diff-printing on failure).
- Skip this step if the survey scopes the task to `domainRequests.test.js`
  only (see Decision 2) — then the surface pin stays the single deliberate
  per-endpoint test touch and this is recorded in the final report.
- Validation: focused file passes; repeat probes 1 and 3 against it
  (add → green; drop-from-client → red).

### Step 6 — Docs, comments, and changelog hygiene

- Ensure no stale count/tally comment remains in either test; each derived
  assertion carries a one-line comment pointing at the registry module.
- Add/extend the registry module's header doc: "add an endpoint here" + the
  3-assertion contract the tests enforce.
- If repo convention requires it (check `CHANGELOG.md` + recent endpoint
  diffs), add a changelog entry; otherwise skip — do not invent process.
- Validation: `grep -rn "toHaveLength(10" frontend/src/services/` empty;
  `grep -rn "104\|105" frontend/src/services/domainRequests.test.js` empty
  (no resurrected literals).

### Step 7 — Full verification gate

- Run, in order: `npm run test:frontend`, `npm run lint:frontend`,
  `npm run build --prefix frontend` (composition rewire must not break the
  build), then the repo gate `npm run test:unit` (or the CI equivalent the
  case-study failure ran under).
- Validation: all green; final `git status` / `git diff --stat` shows only:
  new registry module, `api.js` rewire, the two test files (or one, per
  Decision 2), docs/changelog.

## Validation Plan (summary)

| Check | Command / action | Expected evidence |
|---|---|---|
| Baseline green | `npm run test --prefix frontend -- src/services/domainRequests.test.js src/services/api.surface.test.js` | both files pass at 105/121 |
| Zero-behavior rewire | throwaway `Object.keys(api)` snapshot diff pre/post Step 2 | identical sorted key lists |
| Focused rewrite | same focused command after Steps 3–5 | pass, no literals |
| Add-op acceptance | probe 1 (Step 4) | suite green, no test edits |
| Drop/duplicate/unregistered/client-removal | probes 2–5 (Step 4) + Step 5 repeats | each fails naming the op |
| Lint + build | `npm run lint --prefix frontend`, `npm run build --prefix frontend` | clean |
| Repo gate | `npm run test:unit` | green |
| No literal resurrection | `grep` checks (Step 6) | empty |

Highest-risk validation: the Step 2 snapshot diff — the `api.js` rewire must
be provably key-for-key identical, including the `getFileRawUrl` override and
`workRequests`' extra arg. If the snapshot differs, the rewire is wrong, not
the snapshot.

## Documentation Plan

1. **Registry header doc** (in-code): purpose, "how to add an endpoint"
   (factory key + registry entry, in one diff), and the enforced contract.
2. **Test comments**: one line per derived assertion pointing at the registry;
   deletion of the ~40-line tally comment is itself the documentation win.
3. **Task report**: the implementation stage's final report records which
   Decision-2 scope was taken and the probe results from Step 4.
4. **Changelog**: only if convention requires (Step 6 check).

## Risks / Open Questions

- **R1 — Survey scope unknown (evidence gap, see top note).** If the survey
  mandates test-file-only changes (no new source module), fall back to the
  minimal variant: delete the `toHaveLength` line, add `retrospectiveRequests`
  to the test's factory list, keep both pins otherwise. This satisfies "no
  magic number" but leaves two touchpoints; record the downgrade explicitly.
- **R2 — `getFileRawUrl` dual definition.** Resolved by investigation in
  Step 2; the safe default (keep override + comment) has zero behavior risk.
- **R3 — Hidden coupling to spread order.** Something may depend on `api.js`
  spread order (later spreads overwrite earlier ones). Mitigation: preserve
  exact factory order in the registry and prove it with the Step 2 snapshot
  diff.
- **R4 — Other suites pinning the count.** `grep` for `toHaveLength(10` /
  `105` across `frontend/src` during Step 1; none found at plan time beyond
  the known file, but the implementer must re-check.
- **Open question:** none blocking — all material choices are decided above,
  with Decision 2 / R1 as the explicit fallback if the survey disagrees.

## Non-goals

- No new endpoints, no transport/cache changes, no UI changes.
- No changes to the `it.each` request-contract pins or any other test file.
- No backend, runner, or CI-workflow changes; no new dependencies.
