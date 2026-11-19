# Implementation Plan — Separate KainBain Docs Repo per Project

Task: `7f6220c3-c536-489c-b952-9858aae9ef21`
Status: planning (no code changed in this stage)
Companion survey: `./SURVEY.md` (7 questions, currently **unanswered** — see §2)

## 1. Goal and non-goals

**Goal.** Let a project store its KainBain-specific information in a *separate,
private* git repo ("docs repo") instead of inside the main project repo, so that:

- large projects are not bloated by `docs/tasks/*` history;
- teams with non-KainBain users (or public repos) see no KainBain traces;
- a solo user can "stealth use" KainBain at work on a shared repo;
- runners check out the docs repo adjacent to the main repo with synced task
  branches, keeping operations as close to normal as possible;
- the option is offered in UI configuration at project import/create time
  (especially on import).

**Explicit non-goals for v1** (to be confirmed against survey answers):

- Multi-project sharing of one docs repo (survey q7) — v1 is one docs repo per
  project; sharing is designed-for but not built.
- Automatic migration of existing docs into the new repo (survey q4) — v1
  offers "leave old docs, new work goes to the separate repo" plus a documented
  manual move; auto-move is a follow-up.
- Hiding `kb/<taskId>` working branches from the shared main repo (survey q6)
  — v1 keeps code branches in the main repo and separates only docs/state (the
  simplest reading of the task); full branch stealth is a named follow-up with
  its own design section (§7).

## 2. Survey analysis (SURVEY.md) — unanswered, with recommendations

The grill survey exists but `answers` is `{}` — nobody has answered yet. The
plan below assumes the **recommended** answer for each question (marked ★) and
notes where the code must keep the other option open. Before implementation
starts, re-run the grill (or get 5 minutes of the requester's time) to confirm;
each recommendation is one line to flip.

| # | Question | Recommended answer ★ | Why / plan impact |
|---|----------|----------------------|-------------------|
| q1 | What lives in the docs repo? | ★ **Everything KainBain**: task docs (`docs/tasks/*`), plans, reports, **and** KainBain settings/state (`.kainbain/` contents: `project.json`, sessions, worktrees, quarantine) | Stealth requires zero KainBain traces in the main repo (q5). Splitting settings from docs would leave a decision matrix in every resolver. One "KainBain home" location keeps `resolveDocsPath`/`resolveKainbainDir` a single-branch change. If q1 instead resolves to "task docs only", Phase 3 still works: `project.json` stays in main repo and only the docs resolvers move — the seam is the same. |
| q2 | Where in the import/create UI? | ★ **Tucked under an 'Advanced' section** on *both* create and import dialogs | Task text says "as an advance option" and "allowed from the default when you import/create". Advanced-collapsed keeps the simple form simple (existing dialogs are minimal: name+remote, path+name) while satisfying "from the default". Also add the same fields to Project Settings (Paths & Repositories) so it can be enabled later. |
| q3 | Auth for the (private) docs repo? | ★ **Separate login details just for the docs repo** (stored credential, optional: fall back to same-as-main when blank) | Main repo may be public/shared with no credential while docs repo is private, or the two live on different hosts. Design a `docsRepo` credential slot reusing the existing credential-redaction + `GIT_TERMINAL_PROMPT=0` patterns; empty = "same as main repo" keeps the simple case one field. Research spike R1 (Phase 0) must confirm the current credential flow first. |
| q4 | Existing docs when switching on? | ★ **Leave old docs; only new work goes to the separate repo** (+ documented manual move command) | Auto-move is a data-loss-risky migration (symlink/shadow history — see `ensureDocsLink` incident note). Leave-in-place is safe, reversible, and matches "make change easy then make the change". Auto-move becomes a follow-up stage with its own backup/verify semantics. |
| q5 | Main repo completely free of traces? | ★ **Yes — nothing KainBain-related in the main repo** | This is the stated stealth goal ("so I can stealth use kainbain at work"). Consequences: no `.kainbain/` dir, no `docs/tasks/` content, no pointer file, and (v1) `.gitignore` entries must also not be written into the main repo — they move into the docs repo / global config. The task text's "tiny pointer file is fine" alternative is explicitly rejected for v1 because any committed file defeats stealth. |
| q6 | Keep `kb/*` working branches out of shared repo too? | ★ **No — branches in the main repo are fine for v1; only docs/state move** (with a designed follow-up) | True branch stealth (code work happening in a fork/private mirror + PRs back) is a fundamentally different execution model (merge/push/review paths all assume `kb/<task>` exists on origin). V1 separates docs; §7 sketches the branch-stealth follow-up. If the requester insists on full stealth for v1, the plan gains ~2 extra phases — escalate before starting. |
| q7 | One docs repo per project, or shared? | ★ **One docs repo per project only (v1)** | Sharing needs namespacing (`<docsRepo>/<projectSlug>/tasks/...`), cross-project locking, and quota/permission questions. Single-project keeps every resolver a pure path swap. Design the on-disk layout with a namespaced root anyway (`tasks/` at top level today, reservable for `<slug>/` prefix later) so sharing is additive. |

**Action before Phase 1:** confirm q1–q7 with the requester (5-minute grill
re-run). If any answer flips, only the flagged phase changes — the Phase 0/1
seams are answer-independent by design.

## 3. Current-state findings (grounded in the repo)

All paths below are relative to the repo root. This is the surface the plan
must move:

### 3.1 Backend — project identity and docs location

- `api/projectStore.js` — `ProjectStore`: filesystem-backed projects. Key
  fields on the project record: `cwd` (main checkout), `notesPath`/`notesDir`,
  `docsDirName` (default `docs`), `centralizedDocs` (default true),
  `kainbainDirName` (default `.kainbain`), `gitUrl`/`repoUrl`, `useBranches`.
  `createProject` / `registerProject` provision; `ensureDocsLink` verifies the
  `<cwd>/<docsDir>/ → notes-space` symlink with careful repair policy.
- `api/docsPath.js` — **the docs seam**: `resolveDocsDirName`,
  `isCentralizedDocsEnabled`, `normalizeDocsSettings`,
  `assertValidDocsDirNameForWrite`, `resolveDocsPath(cwd, project)`,
  `resolveTasksDir`, `resolveTaskDocsDir`, `docsProjectFor`,
  `reportRelPath`, `docsTasksIgnorePath`. Every task-docs path flows through
  here. ★ This is where "make change easy" concentrates.
- `api/kainbainDir.js` — **the state seam**: mirrors `docsPath.js` for
  `<cwd>/.kainbain/` (`resolveKainbainDir`, `resolveProjectConfigPath`,
  `resolveSessionsDir`, `resolveWorktreesDir`, `resolveQuarantineDir`,
  `kainbainIgnorePath`). Per q1-recommended, both seams move together.
- `api/work/taskDocsFiles.js`, `api/work/taskAssets.js`,
  `api/work/taskWorkspace.js` (`repairDocsLinkAfterSwitch`,
  `resolveTaskCwd`, quarantine/worktree dirs), `api/work/taskBranches.js`
  (`kb/<taskId>` branches, worktree isolation, main/task sync helpers),
  `api/work/resolveProjectCwd.js` — all take `projectCwd` and derive docs/state
  paths from it. They must learn "docs home ≠ code home" without changing
  call signatures more than necessary.
- `api/project/gitRemote.js` — `resolveDefaultGitRemote` (template-based),
  `detectGitRemote` (reads `remote.origin.url`, **credential-redacted** via
  `redactCredentials`; git ops read the live remote from `.git/config`, never
  the stored value). The docs repo needs the same treatment: stored URL
  redacted, live URL from its own `.git/config`.
- `api/routes/projects.js` — `POST /projects` (create), `POST
  /projects/register` (adopt), `PATCH` (settings incl. docs settings —
  `projects.docsSettings.test.js`, `projects.kainbainDir.test.js` show the
  established validation/test pattern to copy).

### 3.2 Runner — adjacent checkout and synced branches

- `runner/project.js` — `prepareWorkdir({ repoUrl, localPath, workRoot,
  taskId })`: clone-mode mirror at `<workRoot>/mirrors/<slug>` (+
  `refreshMirror`) or adopt-mode local path; per-task worktree
  `<workRoot>/kb-<taskId>` on branch `kb/<taskId>` (+
  `refreshWorktreeToRemote`, LRU eviction under `WORKTREE_CAP`,
  `kb-recovery/*` parking). `syncTaskDocs` copies
  `<primaryCwd>/docs/tasks/<id>` into the worktree; `writeClaimTaskAssets`
  covers remote runners; `resolveRunnerDocsDirName` mirrors the backend
  resolver (deliberately duplicated — "the Runner ships without the backend
  tree"). `collectTaskFiles` in `runner/daemon.js` ships worktree files back.
- `runner/gitOps.js` — `commitAndPush` / `integrateUpstream`: stage-end handoff
  pushes the worktree (code + docs together today).
- Runner git runs with `GIT_TERMINAL_PROMPT=0`, 60s budget, per-workdir
  serialisation, stale-lock recovery (`RunnerGitError` codes). The docs
  checkout must reuse `runGit`, not invent a second git path.
- Runner ↔ backend file transfer for task docs goes through the worktree +
  claim payloads (`taskFiles`, `taskAssets`), not through direct docs-repo
  access — this is what lets a remote runner work with no primary checkout.

### 3.3 Frontend — create/import/settings

- `frontend/src/components/layout/Header.jsx` — New Project modal (name + git
  remote) and Add Existing Project modal (path + display name + KainBain
  folder). No "Advanced" disclosure exists yet — one must be added (q2).
- `frontend/src/components/settings/PathsAndReposSection.jsx` (+
  `ProjectSettingsForm.jsx`) — Files & Repositories block: cwd, notes symlink,
  docs folder name, KainBain folder name, centralised-docs toggle, git URL,
  task-branch options. This is where the docs-repo URL + credential fields land
  for existing projects.

### 3.4 Key invariants to preserve

1. **Single-branch resolvers**: `resolveDocsPath` / `resolveKainbainDir` stay
   the only place that maps (project, cwd) → absolute path. No caller
   hand-builds `cwd + "/docs"`.
2. **Redacted-at-rest URLs**: stored repo URLs are redacted; live git reads
   `.git/config` (see `detectGitRemote`, `redactCredentials`).
3. **Never-lose-work git hygiene**: recovery branches, no force-delete of
   unpushed work, `WORKTREE_CAP` eviction rules — the docs worktree inherits
   all of it.
4. **Runner ships standalone**: runner-side helpers cannot import backend code
   (the `resolveRunnerDocsDirName` duplication is intentional).
5. **Tolerant reads, strict writes**: resolvers degrade to defaults on garbage;
   write paths 400 with `INVALID_*` codes (see `assertValidDocsDirNameForWrite`
   pattern).

## 4. Target design (v1)

### 4.1 Data model — new project fields

```text
project.docsRepo: {
  url: string|null        # credential-REDACTED remote URL, e.g. "https://git.example.com/me/proj-kb.git"
  localPath: string|null  # backend-side checkout of the docs repo (absolute).
                          # For adopted/local setups: a path the operator gives or
                          # KainBain provisions next to cwd. For remote-backed: the
                          # backend's own clone/mirror location.
  branchMode: "synced"    # v1 fixed: docs repo carries the same kb/<taskId>
                          # branches as the code repo (see §4.3). Reserved for
                          # future "single-branch" mode.
  # auth: decided by research spike R1. Preferred: reuse the host's existing
  # credential mechanism per-remote (git credential helper / env), with an
  # optional per-project docs credential slot when R1 shows a gap.
}
```

- Absent `docsRepo` (legacy projects, default) = today's behaviour, byte for
  byte. This is the compatibility anchor: every new branch is `if
  (hasDocsRepo(project)) … else …today…`.
- Validation mirrors `assertValidDocsDirNameForWrite`:
  `assertValidDocsRepoForWrite` → 400 `INVALID_DOCS_REPO_*` codes; tolerant
  `normalizeDocsRepoSettings` for reads.
- One docs repo per project enforced (q7): backend refuses a `localPath`/`url`
  already claimed by another project (clear 409 message), until sharing is
  designed.

### 4.2 Backend layout — "KainBain home" split

Introduce one concept: **`kainbainHome/projectCwd` split**.

- Today: `projectCwd` serves as *both* code home and KainBain home
  (`<cwd>/docs/tasks`, `<cwd>/.kainbain/*`).
- With `docsRepo`: code home stays `projectCwd`; KainBain home becomes the
  docs-repo checkout (`docsRepo.localPath` on the backend).
- Implementation: add `resolveKainbainHome(project, projectCwd)` =
  `docsRepo.localPath || projectCwd`, then re-point `resolveDocsPath` and
  `resolveKainbainDir` at it (they already take `(cwd, project)` — the
  signature barely changes; internally `cwd` becomes "kainbain home").
  All downstream consumers (`taskDocsFiles`, `taskWorkspace`,
  `resolveTaskDocsDir`, `reportRelPath`, …) inherit the move with no edits —
  this is the "make change easy" payoff.
- `ensureDocsLink` / centralised-docs symlink: when `docsRepo` is set, the
  `<cwd>/docs` symlink is **not created** (stealth, q5) and
  `centralizedDocs` is ignored for that project (documented precedence:
  `docsRepo` > `centralizedDocs:false` > symlink). The docs checkout itself is
  a real git repo, not a symlink.
- `.gitignore` management: today KainBain writes ignore entries for
  `docs/tasks/` + `.kainbain/` into the main repo. With `docsRepo`, nothing is
  written into the main repo (q5 ★); equivalent ignores (if still needed) live
  in the docs repo. Audit every ignore-writing call site in Phase 1.
- `project.json`: per q1 ★, the authoritative copy lives in the docs repo
  (`<docsHome>/.kainbain/project.json`… or flattened — decided in Phase 1;
  recommend keeping the `.kainbain/` layout identical so resolvers don't fork).
  The backend's project *registry* (`projectRegistry.js`) keeps a pointer so
  `scanProjects` still finds the project. Main repo keeps zero files.

### 4.3 Branching — synced task branches across two repos

- The docs repo carries the **same branch names** as the code repo:
  `kb/<taskId>` per task, same default branch. "Synced" means: created from
  the same base event, checked out/created together at stage pickup
  (`ensureTaskBranch` gains a docs-repo twin), and pushed together at handoff.
- Merge/review semantics stay code-repo-driven: the Merge stage merges code;
  docs branches merge (or fast-forward) alongside so docs history tracks task
  history. Exact merge coupling (same commit message? docs-merge part of the
  merge stage, or lazy?) is decided in design task D3 (Phase 1) — v1 default:
  docs branch is merged/fast-forwarded by the same stage right after the code
  merge, failures reported but never blocking the code merge verdict… or
  blocking — D3 decides with a written rationale.
- Runner workdir layout becomes a pair:
  `<workRoot>/kb-<taskId>` (code worktree, as today) +
  `<workRoot>/kb-<taskId>-docs` (docs worktree, same branch name), each with
  its own mirror (`mirrors/<code-slug>`, `mirrors/<docs-slug>`).
  `prepareWorkdir` grows a `docsRepoUrl` option; eviction/recovery/reap logic
  treats the pair atomically (evict/reap both, park both).
- `syncTaskDocs` becomes a no-op source change: with docsRepo, task docs live
  *in* the docs worktree already — the copy step is skipped and
  `KAINBAIN_TASK_DOCS` points at the docs worktree path. `collectTaskFiles`
  reads from the docs worktree. `commitAndPush` commits+pushes **both**
  worktrees (docs first or code first — D3 decides; recommend docs-first so a
  half-pushed state never shows code without its docs… or code-first — D3
  writes the rationale either way).

### 4.4 Auth (pending spike R1 — shape, not final)

- Backend git ops and runner `runGit` both rely on ambient credentials today
  (live `.git/config` remotes + `GIT_TERMINAL_PROMPT=0` fail-fast). The docs
  remote must authenticate the same way wherever possible (same host ⇒ same
  credential helper ⇒ zero new secrets UI).
- If R1 finds runners/hosts where ambient auth can't cover a second remote,
  add an optional per-project docs credential stored server-side, injected via
  `GIT_ASKPASS`/header at clone/fetch time, never persisted into `.git/config`,
  never logged (extend `redactCredentials` coverage + a redaction test).
- Hard rule: docs-repo credentials must never leak into the main repo, task
  docs, logs, or claim payloads. Spike R1 must name the exact mechanism before
  Phase 2 starts.

## 5. Phased implementation plan

Ordering principle: **research spikes and "make change easy" refactors first;
user-visible behaviour last; each phase is independently shippable and leaves
the tree green.** Big/risky pieces (two-repo execution model, auth) are
investigated in Phase 0 before any behaviour changes.

### Phase 0 — Research spikes & survey confirmation (first, time-boxed)

| ID | Spike / task | Question it answers | Output |
|----|--------------|---------------------|--------|
| R0 | Confirm survey q1–q7 with requester (re-run grill, 5 min) | Are the §2 ★ defaults correct? | Filled `SURVEY.md` answers + note in this plan if any phase changes |
| R1 | **Credential flow audit** (backend `api/git*.js`, `redactCredentials`, runner `runGit`, deploy environments) | How do backend + runners authenticate to git today? Can a second remote reuse it? Where would a per-project docs credential live? | ADR-style note: chosen auth mechanism + redaction/logging rules. **Blocks Phase 2.** |
| R2 | **Ignore-file & trace audit**: every write into the main repo (`.gitignore` entries, `.kainbain/`, `docs/`, hooks `core.hooksPath`, recovery branches) | What must move or be suppressed for q5-true stealth? | Checklist consumed by Phase 1 D-tasks; each item gets a test |
| R3 | **Caller census**: every caller of `resolveDocsPath`, `resolveKainbainDir`, `resolveTasksDir`, `resolveTaskDocsDir`, `reportRelPath`, `docsTasksIgnorePath`, `kainbainIgnorePath`, `resolveRunnerDocsDirName`, `syncTaskDocs`, `collectTaskFiles`, `KAINBAIN_TASK_DOCS` | What is the exact blast radius of re-pointing the resolvers? | Annotated list + confirmation that the seam holds (no hand-built `cwd/docs` paths — fix any found in Phase 1) |
| R4 | Prototype (throwaway, `/tmp` only): two local git repos + paired `kb/<id>` branches through `prepareWorkdir`-equivalent steps | Do paired checkouts + synced branches actually work with current git helpers (worktrees, LRU, recovery)? | Go/no-go on §4.3; list of helper gaps for Phase 3 |

Phase 0 exit criteria: R0 answered; R1 names the auth mechanism; R3 census
complete; R4 go/no-go recorded. No product code changes in Phase 0 (docs-only
notes + throwaway prototype).

### Phase 1 — Make change easy (backend seams, no behaviour change)

Goal: after Phase 1, switching a project's KainBain home is a **one-line
resolver change**, fully covered by tests, with zero user-visible difference.

- **D1. Introduce `resolveKainbainHome(project, projectCwd)`** (new module,
  e.g. `api/kainbainHome.js`, mirroring `docsPath.js`/`kainbainDir.js`
  conventions incl. JSDoc `MARK:` blocks). Initially returns `projectCwd`
  always. Re-point `resolveDocsPath` and `resolveKainbainDir` internals at it.
  Unit tests: legacy projects unchanged; explicit cases for the future
  docs-home branch (written now, enabled when the field exists).
- **D2. Fix census strays (from R3)**: route any hand-built docs/state paths
  through the resolvers. Each fix: regression test proving identical output
  before/after.
- **D3. Write the two-repo execution ADR** (design doc under `docs/`):
  branch-sync coupling, merge-stage semantics, commit/push order, failure
  taxonomy (what happens when docs push fails but code push succeeds, and vice
  versa), `KAINBAIN_TASK_DOCS` contract, `taskFiles`/`taskAssets` source of
  truth. Review the ADR before Phase 2 — it is the spec Phase 2/3 implement.
- **D4. Validation/normalisation scaffolding**: add `api/project/docsRepo.js`
  with `normalizeDocsRepoSettings` (tolerant) + `assertValidDocsRepoForWrite`
  (strict, `INVALID_DOCS_REPO_*` codes) + `hasDocsRepo(project)`, following the
  `docsDirName`/`kainbainDirName` pattern. Wire into create/update validation
  behind the new fields but accept-and-ignore until Phase 2 enables storage
  (or store-but-ignore — D4 decides; must be invisible either way). Unit tests
  for validators now.
- **D5. Runner seam prep**: extract the single-repo assumptions in
  `prepareWorkdir`/`syncTaskDocs`/`collectTaskFiles` behind small helpers
  (`docsWorkdirFor(workdir)`, `shouldSyncTaskDocs(project)`) that return
  today's values. No behaviour change; runner unit tests stay green.

Phase 1 exit criteria: `npm run test:unit` green; new unit tests for D1/D4/D5
pass; ADR (D3) written and reviewed; R2 checklist fully mapped to D-tasks or
Phase 2/3 tasks.

### Phase 2 — Backend: docs-repo projects (the change, part 1)

- **B1. Persist + validate `project.docsRepo`** (`createProject`,
  `registerProject`, `PATCH`): strict validation (D4), 409 on already-claimed
  URL/localPath (q7), redacted URL at rest. Route tests copying
  `projects.docsSettings.test.js` patterns.
- **B2. Provisioning**: on create-with-docsRepo, `git init`/clone the docs
  checkout at `docsRepo.localPath`, lay out `.kainbain/` + `docs/tasks/`
  skeleton, write `project.json` there (q1 ★), register the pointer so
  `scanProjects` finds it. On adopt-with-docsRepo, verify the given local path
  (must exist, must be a git repo or empty dir — fail loud otherwise). **Write
  nothing into the main repo** (R2 checklist enforced by test: snapshot the
  main repo tree before/after provisioning).
- **B3. Flip `resolveKainbainHome`**: return `docsRepo.localPath` when set.
  All docs/state consumers move at once. `ensureDocsLink`: docsRepo projects
  report a new state (e.g. `'external-docs'`) and never touch `<cwd>/docs`.
  Centralised-docs precedence documented + tested.
- **B4. Git ops for the docs repo**: clone/fetch/checkout/push helpers for the
  docs checkout reusing `api/git/*` + `withRepoGitLock` equivalents;
  `ensureTaskBranch` gains its docs twin (create/checkout `kb/<taskId>` in
  docs repo alongside code repo); main/task sync helpers (`syncMain…`,
  `syncTaskBranch…`) run for both repos per ADR D3. Dirty-tree guards apply to
  both checkouts.
- **B5. Merge/review/deploy integration** per ADR: merge stage merges both
  branches; review diff stays code-driven (docs diff optionally linked —
  decide in D3); deploy packaging excludes docs checkout (verify: no docs leak
  into deploy artefacts).
- **B6. Back-compat & safety**: legacy projects (no `docsRepo`) byte-identical
  behaviour — full existing suite must pass unmodified. Enabling docsRepo on a
  project with existing docs: q4 ★ = leave old docs in place, new writes go to
  docs repo; surface a settings banner noting the split + link to the manual
  move procedure (docs task, Phase 5). Disabling docsRepo: refuse while docs
  branches are ahead/unpushed (fail loud with the recovery command), else flip
  back.

Phase 2 exit criteria: backend unit + integration tests green (old + new);
main-repo-cleanliness tests pass (B2/R2); two-repo branch sync covered by
integration tests with throwaway git repos.

### Phase 3 — Runner: adjacent docs checkout + synced branches (the change, part 2)

- **C1. `prepareWorkdir` + docs pair**: new `docsRepoUrl`/`docsLocalPath`
  options; mirror `mirrors/<docs-slug>`; worktree `<workRoot>/kb-<taskId>-docs`
  on the same `kb/<taskId>` branch; reuse `runGit`/`refreshMirror`/
  `refreshWorktreeToRemote` paths (no second git implementation). Reuse +
  LRU eviction + reap treat the pair atomically.
- **C2. Docs flow in the worktree pair**: skip `syncTaskDocs` copy when the
  docs worktree is present (docs already there); `KAINBAIN_TASK_DOCS` points at
  the docs worktree; `writeClaimTaskAssets` writes into the docs worktree;
  `collectTaskFiles` reads from it. Stage prompts' `./docs/tasks/…` relative
  paths keep working because the agent's cwd mapping is updated accordingly
  (detail in ADR D3 — likely: agent runs in code worktree, docs worktree path
  exported + symlinked read view… or agent cwd unchanged with docs bind — D3
  decides; the requirement is that existing prompt relative paths don't break).
- **C3. `commitAndPush` both worktrees** per ADR order; integrate-upstream for
  both; conflict taxonomy extended (`sync-conflict` names which repo).
  Recovery parking (`kb-recovery/*`) covers both worktrees.
- **C4. Remote-runner (no primary checkout) path**: claim payloads already
  carry `taskAssets`; extend the claim/dispatch contract with the docs remote
  URL (+ credential ref per R1) so a remote runner can clone both mirrors.
  Back-compat: old runners ignore the new claim fields (or are version-gated —
  decide in D3; must not break mixed fleets silently).
- **C5. Runner unit + integration tests**: paired layout, eviction atomicity,
  reuse refresh of both worktrees, push-order, conflict attribution, cap
  accounting (does the pair count as 1 or 2 against `WORKTREE_CAP`? — D3
  decides; recommend 1 pair = 1 slot).

Phase 3 exit criteria: runner test files green (`runner/*.test.js`); an
end-to-end throwaway run (two local remotes, clone-mode runner) completes a
task with docs landing only in the docs remote.

### Phase 4 — UI: Advanced option on create/import + settings (the change, part 3)

- **U1. "Advanced" disclosure in both `Header.jsx` modals** (create + adopt):
  collapsed by default; contains *Docs repository URL* (+ optional *local
  path* on adopt, *credential* field only if R1 requires it). Client-side
  validation mirrors backend codes; server errors surface inline (existing
  `createError`/`adoptError` pattern).
- **U2. `PathsAndReposSection`**: same fields for existing projects + enable
  flow (provision/clone on save), disable flow (B6 refusal messaging), and the
  q4 split-brain banner when old local docs exist.
- **U3. Visibility of state**: project settings shows docs-repo sync state
  (last sync, ahead/behind, branch) — minimum: the info the operator needs to
  trust the split. Exact widget set in D3/Phase 4 design pass; keep it to one
  compact block.
- **U4. Frontend tests** for U1/U2 (existing `*.test.jsx` patterns) + a11y
  labels on new inputs.

Phase 4 exit criteria: frontend suite green; manual walkthrough of
create-with-docsRepo, adopt-with-docsRepo, enable-later, disable flows.

### Phase 5 — Docs, migration aid, rollout

- **Docs**: (a) user guide — when to use a docs repo, create/adopt/enable
  walkthroughs, auth setup per R1, the q4 manual-move procedure, stealth
  checklist (how to verify the main repo is clean: `git status`, `git log
  --all --oneline --grep`, branch list); (b) operator notes — two-repo branch
  model, recovery branches in both repos, eviction/cap semantics, troubleshoot
  matrix from ADR D3; (c) JSDoc/AGENTS-MAP updates for new modules.
- **Migration aid (manual-move procedure)**: a documented, copy-pasteable
  sequence (or a small `scripts/` helper — decide in Phase 2; script preferred
  if it stays <100 lines, else docs-only) to move existing `docs/tasks/*` +
  `.kainbain/*` into a fresh docs repo with verification steps. Auto-move
  stays a follow-up.
- **Rollout**: feature is purely opt-in (absent `docsRepo` = today's
  behaviour); no migration of existing projects; no flag needed beyond the
  field itself. Recommend: dogfood on one real project (this repo's own
  KainBain usage is the natural candidate) for one full task lifecycle before
  announcing.

## 6. Assurance plan — proving the change was implemented

### 6.1 Testing plan (maps to phases)

| Level | What | Where / how | Phase |
|-------|------|-------------|-------|
| Unit — resolvers | `resolveKainbainHome` legacy-default + docs-home branches; `normalizeDocsRepoSettings` tolerance; `assertValidDocsRepoForWrite` strict codes | `api/kainbainHome.test.js` (new), `api/project/docsRepo.test.js` (new), following `docsPath.test.js` patterns | 1 |
| Unit — validators | create/update/register accept/reject matrices incl. 409 claim conflicts, redaction of stored URL | `api/routes/projects.docsRepo.test.js` (new, copying `projects.docsSettings.test.js`) | 2 |
| Unit — runner seam | `docsWorkdirFor`, `shouldSyncTaskDocs`, pair naming, cap accounting | `runner/project.test.js` extensions | 1, 3 |
| Integration — backend git | two throwaway repos: provision, `ensureTaskBranch` twin, sync both, merge both, dirty-tree refusal per repo, disable-refusal when ahead | `api/git.*.integration.test.js` style, isolated test roots (`isolatedTestRoots.js`) | 2 |
| Integration — runner | paired prepare/reuse/evict/reap; push both; conflict attribution; remote-runner claim with docs fields | `runner/*.test.js` + a scripted local-remote e2e (docs-only verification counts as e2e here) | 3 |
| Cleanliness (the stealth gate) | **Main-repo snapshot test**: tree before/after provisioning + full task run must be identical except code changes — no `.kainbain/`, no `docs/tasks/`, no `.gitignore` edits, no pointer file | Backend test (B2) + runner e2e (Phase 3 exit) | 2, 3 |
| Regression | Entire existing suite (`npm run test:unit` + runner tests) passes **unmodified** — legacy path byte-identical | CI / `run-tests.sh` | every phase |
| UI | Advanced disclosure behaviour, validation messages, settings enable/disable/banner flows | `*.test.jsx` + headless checks (`npm run capture:screenshot` only if visual state is in doubt) | 4 |
| Dogfood | One real project runs a full task lifecycle on a docs repo; operator verifies main remote shows only code branches + code diff | Manual, checklist in docs | 5 |

Primary gate overall: `npm run test:unit` (per stage guidance) plus the
runner tests and the stealth-gate snapshot tests. No long-lived background
servers for verification — isolated headless runners / mock fixtures /
throwaway git repos only.

### 6.2 Documentation plan

1. **ADR (D3, Phase 1)** — the spec: branch-sync coupling, push order, failure
   taxonomy, claim-contract changes, cap accounting. Reviewed before Phase 2.
2. **Spike notes (Phase 0)** — R1 auth decision, R2 trace checklist, R3 census,
   R4 go/no-go. Stored under this task's docs folder.
3. **User guide (Phase 5)** — as listed in Phase 5; must include the stealth
   verification checklist and the q4 manual-move procedure.
4. **Code docs** — JSDoc `MARK:` blocks on all new modules (repo convention),
   `AGENTS-MAP.md` / agent guide updates if new concepts need them, CHANGELOG
   entry.
5. **This plan** — updated if R0 flips any survey answer (each flip names its
   affected phase in §2's table).

### 6.3 Acceptance criteria (definition of done)

- [ ] A new project can be created with a docs repo from the Advanced section;
      an existing repo can be imported the same way (U1).
- [ ] An existing project can enable/disable docs repo from settings with
      clear messaging (U2, B6).
- [ ] Task lifecycle (create → stages → merge) works with docs repo: task docs,
      plans, reports land only in the docs repo on synced `kb/<taskId>`
      branches (B4, C1–C3).
- [ ] Main repo contains zero KainBain traces after provisioning + full run —
      proven by the snapshot/stealth-gate tests (B2, Phase 3 exit).
- [ ] Runners work in clone mode and adopt mode, local and remote (claim
      contract), with pair-atomic eviction/recovery (C1–C5).
- [ ] Legacy projects (no `docsRepo`) behave exactly as before — full existing
      suite green unmodified.
- [ ] Auth: docs remote authenticates per R1 decision; credentials never in
      logs/docs/`.git/config`/claim payloads (redaction tests).
- [ ] User guide + operator notes + ADR + CHANGELOG written (§6.2).
- [ ] Dogfood run completed on one real project (Phase 5).

## 7. Follow-ups (explicitly out of v1)

1. **Full branch stealth** (q6-full): code work in a private fork/mirror with
   PRs back to the shared repo. Needs: fork-based execution model, PR
   creation/merge flow, review UX against the fork. Design after v1 ships.
2. **Shared docs repo for several projects** (q7): namespaced layout
   (`<slug>/tasks/…`), cross-project locking, permissions. V1's
   one-repo-per-project + 409 guard keeps this additive.
3. **Automatic docs migration** (q4-auto): move existing docs/state into the
   docs repo with backup + verify + rollback. V1 ships leave-in-place + manual
   procedure.
4. **Docs-repo GC/backups**: retention policy for merged `kb/*` docs branches,
   backup guidance for the private repo.

## 8. Risk register (top risks first)

| Risk | Likelihood / impact | Mitigation (phase) |
|------|---------------------|--------------------|
| Auth for the second remote doesn't fit ambient credentials on some hosts/runners | Med / High | R1 spike **before** any build; per-project credential slot as fallback; version-gated claim contract (C4) |
| Split-brain: code branch and docs branch diverge (one pushes, other fails) | Med / High | ADR D3 defines coupling + failure taxonomy + recovery commands; integration tests per outcome; operator docs |
| Missed main-repo write (stealth leak: ignore entry, hook config, stray file) | Med / High | R2 audit + snapshot/stealth-gate tests (B2, Phase 3 exit) that fail on any unexpected main-repo delta |
| Resolver re-pointing breaks a forgotten caller | Med / Med | R3 census + D2 strays + full unmodified suite every phase |
| Mixed runner fleet (old runner, new claim) mis-handles docs fields | Low / Med | D3/C4 back-compat decision; old runners ignore-or-refuse loudly, never silently drop docs |
| Scope creep into full branch stealth (q6) | Med / Med | Survey confirmation R0; §7 follow-up; escalate if v1 scope changes |

## 9. Estimated work breakdown (order = build order)

1. Phase 0: R0 survey confirmation; R1 auth audit; R2 trace audit; R3 caller
   census; R4 throwaway prototype. (Docs + `/tmp` only.)
2. Phase 1: D1 `resolveKainbainHome` seam; D2 census strays; D3 ADR; D4
   validation scaffolding; D5 runner seam prep. (No behaviour change.)
3. Phase 2: B1 persist/validate; B2 provisioning; B3 resolver flip; B4 docs git
   ops + branch twin; B5 merge/review/deploy; B6 back-compat + enable/disable.
4. Phase 3: C1 paired workdirs; C2 docs flow; C3 dual commit/push; C4 claim
   contract; C5 runner tests + local-remote e2e.
5. Phase 4: U1 create/adopt Advanced UI; U2 settings; U3 sync-state display;
   U4 frontend tests.
6. Phase 5: user guide, operator notes, manual-move procedure, CHANGELOG,
   dogfood run.

Each numbered item should become its own task/stage (or small group) with the
exit criteria above as its done-condition. Phase 0 comes first because R1/R4
can still reshape §4; Phase 1 comes before any behaviour change so the diff
that flips behaviour (B3) is small, reviewed, and instantly revertible.
