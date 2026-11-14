# Implementation Plan — Dependency-manifest guardrail for new frontend imports

Task: `0f0213b7-25f6-4930-8470-a73dc0611529`
Case study: `5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` (undeclared dynamic `import("mermaid")` in `frontend/src/components/common/MarkdownViewer.jsx` caused cascading Frontend Build → depcheck → Canary (1500s timeout) → Publish failures).

## 1. Goal

Add a fast, cheap pre-check that fails when a source file imports a bare package specifier not listed in the owning `package.json`, so a missing dependency surfaces in seconds with a message naming the file and the package — before the expensive build / canary / publish steps run.

## 2. Survey input (SURVEY.md, same folder)

The grill survey recorded no answers (`"answers": {}`), so this plan adopts the recommended option on each question as the default and marks the alternatives as explicit non-goals / follow-ups:

| # | Question | Adopted default (recommended) |
|---|----------|-------------------------------|
| q1 | Where should the check run? | Early automatic check in the pipeline, before the website build |
| q2 | How wide should it look? | Website (frontend) code only |
| q3 | How strict? | Stop with a clear error naming the file and the missing package |

Consequences: no pre-commit/husky hook in scope (there is no `.husky` setup in the repo today — verified); no api/root expansion in scope (depcheck already covers those slowly; the fast guardrail targets frontend first, designed so api/root can be added later behind one flag).

## 3. Success criteria (from the ticket)

1. Adding `import("some-undeclared-pkg")` to a frontend source file fails the new fast check with a message naming the file and the missing package.
2. Declared dependencies continue to pass the check (no false positives on the current tree, including `mermaid`, now declared in `frontend/package.json`).
3. The check runs before (not after) the frontend production build in the gate ordering.

## 4. Current-state facts (verified in this checkout)

- **Gate definition:** `scripts/run-tests.mjs` `buildBranches()` — canonical order is Unit Tests (api/frontend/runner) → Linting (api/frontend) → Frontend Build → Security Script Tests → Dependency Check (`npm run depcheck`, ~56s in the failure log) → Dependency Audit Gate → Harness Self-Tests → Container Tests, then Canary Tests serially via `splitGatePhases()`. All fast branches run in **one overlap window** (`runParallel`), so today nothing fails fast — the build and depcheck start together.
- **Fail-fast precedent:** `main()` runs a synchronous Settings-duplicate preflight (`checkDirectoryForDuplicates`) **before** `runParallel(fast)` and exits 1 immediately on violation. The new guardrail should reuse this exact slot/pattern.
- **Check-script precedent:** `frontend/scripts/check-react-imports.js` and `frontend/scripts/check-mermaid-bundled.js` are zero-dependency Node scripts that scan source text and exit 1 with a clear message. The new script follows this template (no new dependencies — keeps it fast and offline-safe).
- **Frontend build script (this checkout):** `frontend/package.json` `build` = `npm run check:react && node scripts/check-no-deprecations.js && node scripts/check-mermaid-bundled.js`. ⚠️ Verify during implementation whether `vite build` is appended elsewhere on this branch (failure logs show vite running after the checks; the wiring may differ by branch).
- **No hook infrastructure:** no `.husky`, no `pre-commit`/`husky` references in root or frontend manifests or `.github/`. Adding hooks would be new infrastructure — out of scope per survey q1.
- **Contributor workflow docs:** `agents.md` (agent guidance, commands), `AGENTS-MAP.md` (repo map), `docs/agent-docs/KB-Code-Standards.md` (vendored code standards), `docs/CI_SCRIPTS.md` (gate docs — verify it documents `run-tests.mjs` branches).
- **Existing slow coverage:** root `depcheck` (via `scripts/depcheck.mjs`) already catches missing deps but only after ~56s inside the overlap window — it did catch `mermaid` (`Missing dependencies * mermaid: ./src/components/common/MarkdownViewer.jsx`) yet everything expensive still ran. The new check is a seconds-fast subset, not a replacement.

## 5. Key decisions

1. **New zero-dep script, frontend-scoped:** e.g. `frontend/scripts/check-imports-declared.js` (name negotiable), invoked as `frontend` script `check:deps` and root script `check:deps:frontend`. Covers static `import … from "x"`, `export … from "x"`, dynamic `import("x")`, and `require("x")` via regex/text scan (same technique as `check-react-imports.js`); ignores relative (`./`, `../`), absolute (`/`), `node:` builtins, bare Node builtins, Vite aliases (`@/...` only if configured — verify `vite.config.js`), and asset/style imports as needed.
2. **Two insertion points, both before the build:**
   - (a) **Gate preflight** in `scripts/run-tests.mjs` `main()`, next to the Settings-duplicate check — fails the whole gate in seconds, before the overlap window (covers CI ordering, criterion 3 for `npm test` / `deploy.sh --prod`).
   - (b) **First step of `frontend` `build`** (`check:deps && …`) — fails `npm run build:frontend` itself before vite/rolldown resolves anything (covers the publish `registry-publish` gate, which runs `build:frontend` directly, and local `npm run build`).
3. **Blocking error, not warning** (survey q3): exit 1, message format `❌ Undeclared dependencies: <pkg> imported by <file> (add to frontend/package.json …)` — one line per (file, package).
4. **Same-commit rule documented** in `agents.md` (agent workflow) + `docs/agent-docs/KB-Code-Standards.md` (standards) + `docs/CI_SCRIPTS.md` if it lists gates.
5. **Fixture proof:** temp fixture file (or temp branch edit) adding `import("some-undeclared-pkg")`, run the check → expect fail naming file+package; remove fixture → expect pass. Never commit the fixture.

## 6. Work plan — make the change easy, then make the change

Ordered so big/research pieces come first and each step leaves the tree greener.

### Phase 0 — Recon (research-first, no behavior change)

- **0.1 Confirm gate insertion contract.** Read `scripts/run-tests.mjs` `main()` preflight block and `tests/run-tests.test.mjs` (pins branch list/behavior — new preflight must not break it). Decide: separate preflight call vs. first overlap branch (recommend preflight: only preflight truly runs *before* the build).
- **0.2 Confirm frontend build wiring on this branch.** Read `frontend/package.json` `build`, `frontend/vite.config.js` (aliases, externals), and `publish.sh`/`deploy.sh` frontend-build invocation. Record exactly where vite runs so insertion point (b) provably precedes it.
- **0.3 Inventory import forms in `frontend/src`.** Grep for `import(`, `from "`, `require(` to size the detector (scoped packages `@x/y`, subpath imports `pkg/sub`, type-only imports). Also list current bare specifiers vs `frontend/package.json` deps to pre-size the allowlist (e.g. `vite`/`vitest` in source? test-only files excluded like `check-react-imports.js` excludes `*.test.*`?).
- **0.4 Confirm docs targets.** Read `docs/CI_SCRIPTS.md` gate list and the relevant `KB-Code-Standards.md` section so doc edits land in the right place.

### Phase 1 — Make the change easy (prep, still no behavior change)

- **1.1 Extract/align specifier classification.** If implementation will share logic (bare-vs-relative-vs-builtin), put it in one small module the check script imports (keep zero-dep, keep it next to the other `frontend/scripts/check-*.js` files). No gate wiring yet.
- **1.2 Add the `check:deps` npm scripts (unwired).** `frontend/package.json`: `"check:deps": "node scripts/check-imports-declared.js"`; root `package.json`: `"check:deps:frontend": "npm run check:deps --prefix frontend"`. Runnable by hand, not yet in any gate — safe to land and review alone.
- **1.3 Baseline run.** Run the new script on the clean tree; must pass with zero output besides OK. Any false positive is fixed here, before wiring (protects success criterion 2).

### Phase 2 — Make the change (wire the guardrail)

- **2.1 Implement `frontend/scripts/check-imports-declared.js`.** Scan `frontend/src` (and any other source dirs found in 0.3, e.g. `scripts/`? decide explicitly), extract bare specifiers from static + dynamic import forms, compare against `dependencies` + `devDependencies` (+ `peerDependencies` if present) of `frontend/package.json`, exit 1 listing every (file, package) violation with the fix instruction (`npm install <pkg> --prefix frontend`, same commit).
- **2.2 Wire into `frontend` `build` first.** Prepend `npm run check:deps &&` to the frontend `build` script. Rationale: this single edit protects every consumer of the build (CI Frontend Build branch, publish gate, local builds).
- **2.3 Wire into `run-tests.mjs` preflight.** Add the check next to the Settings-duplicate preflight in `main()`, failing the gate before the overlap window. Keep output style consistent (`✅ … passed (N files in Mms)`).
- **2.4 Update `tests/run-tests.test.mjs` (and any gate-output parser tests)** if they pin branch lists or preflight behavior.

### Phase 3 — Prove it (fixture demonstration)

- **3.1 Negative fixture.** Add temp file `frontend/src/__depcheck-fixture__.jsx` containing `import("some-undeclared-pkg")` (uncommitted scratch): run `npm run check:deps --prefix frontend` → must exit 1 naming the fixture file and `some-undeclared-pkg`; run `npm run build --prefix frontend` → must fail at the check step before vite output appears; run gate preflight path → must fail before overlap window starts.
- **3.2 Positive control.** Delete fixture; check passes; existing suite for the touched area passes.
- **3.3 Timing evidence.** Record wall time of the new check (target: <5s) vs. the replaced failure modes (build ~30s+, depcheck ~56s, canary 1500s) for the implementation report.

### Phase 4 — Document the rule

- **4.1 `agents.md`:** one bullet under Agent Guidelines or Commands — new bare import requires the matching `package.json` (+ lockfile) change in the same commit; the fast check enforces it.
- **4.2 `docs/agent-docs/KB-Code-Standards.md`:** same rule in standards language (note: file is a vendored KB copy — follow whatever vendoring note it carries; if upstream-owned, put the normative text in `agents.md` and reference it).
- **4.3 `docs/CI_SCRIPTS.md` (if it lists gates):** document the new preflight branch, its position (before Frontend Build), and how to run it locally.
- **4.4 Implementation report** in this task folder with fixture evidence (commands + outputs + timings).

## 7. Validation plan

| Step | Command / check | Expected evidence |
|------|-----------------|-------------------|
| New script, clean tree | `npm run check:deps --prefix frontend` | exit 0, OK line |
| New script, fixture | add `import("some-undeclared-pkg")` fixture, re-run | exit 1, message names fixture file + package |
| Build ordering | `npm run build --prefix frontend` with fixture | fails at `check:deps`, no vite/rolldown output |
| Gate ordering | `npm test -- --no-canary` (or targeted gate test) with fixture | preflight failure before `▸ started Frontend Build` |
| No regressions | `npm run test:unit`, `npm run lint`, relevant `node --test tests/run-tests.test.mjs` | all green on clean tree |
| Declared deps pass | clean-tree runs above (incl. real `import("mermaid")` in `MarkdownViewer.jsx`) | pass — `mermaid` is declared |

Fastest feedback loop during development: the direct script invocation (milliseconds–seconds, no gate needed).

## 8. Risks and mitigations

- **False positives block the build.** Bare specifiers that are not npm deps (Vite aliases, virtual modules, CSS/asset imports, `node:` builtins). Mitigate: inventory in 0.3, baseline in 1.3, explicit allowlist with comments; keep the detector conservative and document each exclusion.
- **Detector misses a form** (e.g. `require`, re-export, template-literal dynamic import). Mitigate: cover static + `export…from` + `import()` + `require()` with string literals; template-literal/variable dynamic imports are out of scope and stay covered by the slow depcheck/build (documented limitation).
- **`vite build` wiring differs by branch** (see §4 ⚠️). Mitigate: 0.2 confirms the real ordering on the implementation branch before wiring.
- **Gate-test brittleness.** `tests/run-tests.test.mjs` pins gate behavior. Mitigate: 0.1 reads it first; 2.4 updates it deliberately.
- **Scope creep to api/root/hooks.** Explicitly out of scope (survey q1/q2); design the script with a package-dir parameter so a follow-up can extend it.

## 9. Non-goals

- Pre-commit / pre-push hooks (no hook infra exists; survey q1 chose pipeline).
- api / root / shared packages (survey q2 chose frontend-only; depcheck still covers them slowly).
- Replacing `depcheck` (it also finds unused deps; the new check is a fast fail-first subset for missing deps).
- Retrying or changing the pretty-tasks feature itself (reported complete).
- Lockfile-content verification (rule requires the lockfile change by convention; enforcing lockfile-vs-manifest sync is a possible follow-up).

## 10. Open questions

- None blocking: survey defaults adopted (§2). Only verification items remain (build wiring in 0.2, gate-test pins in 0.1), both answerable from the repo during implementation.

## Sources (evidence inspected for this plan)

- `docs/tasks/0f0213b7-25f6-4930-8470-a73dc0611529/SURVEY.md` (unanswered; recommended defaults adopted)
- `docs/tasks/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f/automated-tests-failure-20261114-045255.md` (build + depcheck + canary cascade)
- `docs/tasks/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f/publish-failure-20261114-062622.md` (`registry-publish` gate failure)
- `scripts/run-tests.mjs` (`buildBranches`, `splitGatePhases`, `main` preflight), `scripts/depcheck.mjs`
- `frontend/scripts/check-react-imports.js`, `frontend/scripts/check-mermaid-bundled.js` (check-script template)
- Root + `frontend/package.json` (scripts, `mermaid` now declared), `agents.md` (docs target); no `.husky`/hook config found.
