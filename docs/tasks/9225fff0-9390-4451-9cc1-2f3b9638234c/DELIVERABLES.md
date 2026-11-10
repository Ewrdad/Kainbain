# KainBain Auditability — Deliverables & Work Packages

**Report path:** `docs/tasks/9225fff0-9390-4451-9cc1-2f3b9638234c/DELIVERABLES.md`

**Task ID:** `9225fff0-9390-4451-9cc1-2f3b9638234c`

**Branch:** `kb/9225fff0-9390-4451-9cc1-2f3b9638234c`

**Source of truth:** `AUDIT.md` (this directory) — the feedback-resolved auditability audit.
Every work package below traces to a numbered section of `AUDIT.md`; the AUDIT remains
the "why", this file is the "what, in what order, blocked by what".

**Survey decisions honoured (FEEDBACK_SURVEY.md, round `auditability-followup`):**
framework-agnostic (q1); three evidence chains made tamper-evident first (q2: intent+submitter,
prompt→model→output, CI/test→code-SHA); hash-chained append-only log anchored on git (q3);
timestamped username for actors (q5); provider+jurisdiction recorded per stage report (q6);
retention/export recommended as export-bundle-first (q7); research→roadmap deliverable (q8).
Signed attestations, trusted timestamps, runner attestation, SSO/MFA, and egress enforcement
are **deferred rungs** (AUDIT §9) — listed at the end, not scheduled.

---

## 0. How to read this file

Each **work package (WP)** is one whole, ticketable step with its own deliverable, its own
required knowledge, its explicit dependencies, and acceptance checks an auditor can run.
Segmentation follows Kent Beck's "make the change easy, then make the change":

1. **Structural changes first** — the event schema, the append/verify primitives, and the
   writer-path hooks. Everything else is a new event type or a new field on top of these.
2. **Then the three evidence chains** (AUDIT §4–§6), which can proceed in parallel once the
   writer hooks exist.
3. **Then verification and export tooling** (AUDIT §7.3, §10).
4. **Config, policy defaults, and docs last** — once the mechanism exists, configuring it is
   cheap and safe.

**Dependency notation:** `depends on` = must be merged first; `blocks` = cannot start until
this WP lands. WPs with the same dependency set can be ticketed in parallel.

### Dependency map (summary)

```
WP-01 Audit RFC (schema + CLI contracts)          ── blocks ──▶ everything
WP-02 Core audit-log module (append/verify)              │ blocks WP-03, WP-08
WP-03 Writer-path integration (3 hooks + auditTipHash) ◀──┘
   ├── blocks WP-04 (intent chain)          ┐
   ├── blocks WP-05 (prompt→model→output)   ├─ parallel after WP-03
   └── blocks WP-06 (CI/test→code-SHA)      ┘
WP-07 Provider/jurisdiction + actor fields   ◀─ WP-03 (parallel with WP-04..06)
WP-08 `kainbain audit verify` CLI            ◀─ WP-02 + WP-03
WP-09 Export bundle (export / verify --bundle)◀─ WP-08
WP-10 Retention schedule + manual purge      ◀─ WP-09
WP-11 Config layer, policy defaults, docs    ◀─ WP-03..WP-10 (config last)
WP-12 Deferred rungs (signing, timestamps, SSO/MFA, egress enforcement) — parked, see §3
```

---

## 1. Work packages

### WP-01 — Audit design RFC (event schema + CLI contracts)

- **Deliverable:** a short RFC document (e.g. `docs/audit-rfc.md`) that formalises, from
  AUDIT §7.2: the `v:1` event schema (`v, taskId, seq, ts, actor, kind, body, prevHash,
  eventHash`), the canonicalisation rule (UTF-8, sorted JSON keys, no whitespace,
  `eventHash = SHA-256(canonical(event without eventHash))`, genesis `prevHash: null`), the
  `kind` enum (`intent|stage|test|approval|export` + later `purge`), and the CLI contracts
  for `kainbain audit verify|export|purge` including exit codes and output format.
  Must also freeze the **dirty-tree rule** (AUDIT §6) and the **purge-event convention**
  (AUDIT §10) so later WPs implement against stable contracts.
- **Required knowledge:** AUDIT.md §7.1–§7.4 (what git does/doesn't prove), §6 (dirty-tree
  rule), §10 (purge events); existing CLI entry points in `api/` and `scripts/` to match
  command conventions; `shared/reportTimestamp.js` for timestamp conventions.
- **Depends on:** nothing. **Blocks:** WP-02..WP-11 (all implement the RFC).
- **Acceptance checks:** RFC reviewed against AUDIT §7.2/§12.1; schema covers all three
  chain bodies from §4–§6 plus purge; canonicalisation is deterministic (two runs, same
  hash); CLI contracts name exit codes for broken chain, missing file, and clock caveat.
- **Framework map:** SOC 2 CC / ISO 27001 A.12.1.2 (design evidence), NIST AI RMF Govern.

### WP-02 — Core audit-log module: append + verify-chain primitives

- **Deliverable:** a new shared module (e.g. `shared/auditLog.js`) implementing:
  `appendEvent(taskId, event)` → writes one JSON line to
  `docs/tasks/<taskId>/audit.log.jsonl` (creating the genesis event on first use) and
  returns the `eventHash`; `verifyChain(taskId)` → recomputes every `eventHash`, checks
  every `prevHash` link, returns `{ ok, tipHash, firstBroken }`; plus `canonicalJson()` and
  `sha256()` helpers. Append-only: no edit/delete/cap APIs exist. Unit tests for
  canonicalisation stability, genesis, chaining, and detection of a hand-edited middle line.
- **Required knowledge:** AUDIT.md §7.1–§7.3; `api/work/taskPersistence.js`
  (`_atomicWriteFileSync`, task dir layout `docs/tasks/<taskId>/`); `shared/survey.js`
  serialization conventions; Node `crypto` usage already in the repo; test conventions
  (`*.test.js` colocated, vitest).
- **Depends on:** WP-01. **Blocks:** WP-03, WP-08.
- **Acceptance checks:** `verifyChain` passes on a synthetic 100-event chain; fails loudly
  naming the first broken link after a middle line is hand-edited; event hash survives
  across processes (deterministic canonicalisation); no cap/eviction path exists in the
  module (AUDIT §3 gap).
- **Framework map:** RFC 6962-style append-only log (AUDIT/FRAMEWORKS §2); ISO 27001
  controlled-change prerequisite.

### WP-03 — Writer-path integration: three hooks + `auditTipHash`

- **Deliverable:** wire the three verified writer paths (AUDIT §3) to append exactly one
  audit event per action, without changing their rendered output:
  1. `recordHistory` in `api/work/taskPersistence.js:159-177` — append a `stage|approval`
     event; the 150-entry rendered cap stays, but rendered `task.md` history lines gain a
     pointer (`audit events #0–#N retained in full in audit.log.jsonl`) per AUDIT §7.3.
  2. `saveStageReport` in `api/watch/stageReports.js:159-259` — append a `stage` event
     carrying the existing metadata (`stageName/Id, duration, status, harnessId, aliasName,
     modelRef, targetIndex, runnerId, failureKind`) plus `prevAuditHash`.
  3. survey submission in `shared/survey.js` / `api/work/taskSurvey.js` — append an
     `intent` event (full detail lands in WP-04; WP-03 only guarantees the hook fires).
  Additionally `saveTaskMarkdown` writes `auditTipHash` into `task.md` frontmatter
  (`taskPersistence.js:46-149`) so a reader can detect a rewrite without a log append.
- **Required knowledge:** AUDIT.md §3, §7.3; the three writer files above (read fully, incl.
  their `*.test.js`); `api/work/taskFiles.js` / `docsPath.js` for path resolution; how
  frontmatter is parsed/serialised in `taskPersistence.js`.
- **Depends on:** WP-02. **Blocks:** WP-04, WP-05, WP-06, WP-07, WP-11.
- **Acceptance checks:** every `recordHistory`/`saveStageReport`/survey call appends
  exactly one chained event (test with a spy on the log module); chain still verifies after
  history-cap eviction (150) and log-cap eviction (500) — AUDIT §12 review check; a
  `task.md` rewrite with no log append is detectable via `auditTipHash` mismatch; existing
  `taskPersistence.test.js` / `stageReports.test.js` / `taskSurvey*.test.js` still pass.
- **Framework map:** SOC 2 change-management spine; ISO 27001 "who changed what".

### WP-04 — Evidence chain 1: intent / survey answers + submitter (AUDIT §4)

- **Deliverable:** on every survey submission, the `intent` event body contains
  `surveyRound, surveyStage, questionSetHash` (SHA-256 over canonical JSON of the
  question set: id, type, text, options, required, showIf), full `answers` (values + notes,
  not just ids), `submitter: { username }` (required — empty/anonymous rejected at the
  boundary, AUDIT §8), and `supersedes` (hash of previous intent event or null). Intent
  edits arrive as superseding events, never in-place; `task.md` history keeps only a pointer
  (event hash + timestamp). Tests: question-wording edit changes `questionSetHash`; answers
  are bound to the exact questions seen; duplicate-round suppression in `recordHistory`
  (2000 ms) does not suppress audit events.
- **Required knowledge:** AUDIT.md §4, §8; `shared/survey.js` (question schema, markdown
  serializer, append-only convention, `generatedAt`); `api/work/taskSurvey.js` and routes;
  WP-03 hook contract.
- **Depends on:** WP-03. **Blocks:** WP-11 (config of required-submitter policy). Parallel with WP-05/WP-06.
- **Acceptance checks:** auditor can answer "who asked for this, exactly what options did
  they see, did answers change afterwards?" from the log alone; contradiction between rounds
  stays visible; submitter rejection test at the survey/API boundary.
- **Framework map:** SOC 2 CC change-request evidence; ISO 27001 change control (who requested what).

### WP-05 — Evidence chain 2: prompt → model → output (AUDIT §5)

- **Deliverable:** extend the `stage` event body and the `saveStageReport` metadata entry
  (insertion points `stageReports.js:209-245`, `reportMetadata` projection in
  `taskPersistence.js:87`) with: `promptHash` (SHA-256 of the exact effective prompt),
  `promptLayoutVersion`, `skillContentHashes[]`, retained `modelRef/harnessId/aliasName/
  targetIndex` plus `modelProvenance` (config snapshot id), `outputHash` (SHA-256 of the
  report content as written), `codeSha` (+ `boundaryStartSha`/`boundaryEndSha` where timeline
  entries carry them), and `prevAuditHash`. Full prompt text goes only into the export
  bundle (WP-09), never frontmatter. Prompt assembly must come from the real curation path —
  `api/promptCuration.js` + `shared/promptLayout.js` — so the hash covers curated task text +
  stage instructions + injected skill text + referenced prior reports.
- **Required knowledge:** AUDIT.md §5; `api/watch/stageReports.js`; `api/promptCuration.js`,
  `shared/promptLayout.js` (effective-prompt assembly, layout versioning);
  `shared/modelKeys.js`, `shared/modelAliases.js` (model identity grammar); timeline SHA
  fields in `api/work/taskWorkspace.js` / `taskDiffStat.js`.
- **Depends on:** WP-03. **Blocks:** WP-09 (bundle needs prompt bytes), WP-11. Parallel with WP-04/WP-06.
- **Acceptance checks:** given a suspect code hunk the auditor can walk
  `codeSha → outputHash → promptHash → questionSetHash` (AUDIT §5 payoff); re-hashing a
  report file matches its `outputHash`; prompt hash changes when any injected skill content
  changes.
- **Framework map:** NIST AI RMF Govern/Map (model identity, prompt transparency,
  hallucination tracing); SLSA-style provenance (inputs recorded, signing deferred).

### WP-06 — Evidence chain 3: CI / test results tied to code SHA (AUDIT §6)

- **Deliverable:** for every CI/test stage, a `test` event with `codeSha`, `worktreeDirty`
  flag (dirty-tree pass must be labelled as such — AUDIT §6 dirty-tree rule), `testCommandHash`
  + `testCommandText`, `verdict`, `outputHash` (SHA-256 of captured output), `testArtifacts[]`
  (paths/hashes of coverage/logs/SBOMs), and `rerunOf` (prior event hash on retry, so
  flaky-pass-then-ship is visible). The export bundle (WP-09) must include the worktree diff
  at test time for dirty-tree events.
- **Required knowledge:** AUDIT.md §6, §6 dirty-tree rule; CI/command stage execution and
  process-log paths (`api/watch/processLogs.js`, 500-entry cap); `api/git.js` /
  `api/work/gitLock.js` for `codeSha` and dirty-tree detection; `api/work/taskDiffStat.js`
  for diff stats and `boundaryStartSha/EndSha`.
- **Depends on:** WP-03. **Blocks:** WP-09 (dirty-tree diff inclusion). Parallel with WP-04/WP-05.
- **Acceptance checks:** a test pass on a dirty tree is labelled and its diff is recoverable
  from the bundle; a retry records `rerunOf`; verdict without pinned `codeSha` is rejected.
- **Framework map:** SOC 2 system-operations testing evidence.

### WP-07 — Provider + jurisdiction + actor fields on every stage report (AUDIT §6.1, §8)

- **Deliverable:** add to each stage-report event/report metadata: `provider`,
  `providerJurisdiction` (echoed from the deployment's provider configuration — never
  freehand; `"unknown"` recorded rather than omitted), derived `egressClass`
  (`local-only` | `remote-inference`), and the `actor: { username, kind:
  human|runner|backend }` schema on **every** event. Username required; rendered into
  `task.md` history as `- {ts} [{username}]: {action}`. Backfill `"unknown"` for
  pre-feature history. Verify output must label identity strength (`self-asserted username`).
- **Required knowledge:** AUDIT.md §6.1, §8; provider configuration sources
  (`api/config*`, `shared/modelKeys.js`, runner provider setup, `.env.example` provider
  vars); `api/work/taskPersistence.js` history rendering (`taskPersistence.js:105-107`).
- **Depends on:** WP-03. **Blocks:** WP-08 (verify prints identity strength), WP-11
  (jurisdiction mapping config). Parallel with WP-04..WP-06.
- **Acceptance checks:** every stage report carries provider/jurisdiction/egressClass;
  unknown jurisdiction is `"unknown"`, not missing; actor present on all event kinds; verify
  output explicitly says identity is self-asserted (AUDIT §8 residual risk).
- **Framework map:** GDPR/UK data-protection residency recording (not a conformance claim,
  AUDIT §2); NIST AI RMF model identity.

### WP-08 — `kainbain audit verify <taskId>` CLI

- **Deliverable:** a CLI command that recomputes the chain (`verifyChain`), cross-checks
  `auditTipHash` in `task.md` frontmatter, re-hashes report files against their `outputHash`
  values, checks the git anchor (`git log -- docs/tasks/<id>/audit.log.jsonl`), prints
  identity-strength and clock caveats (chain proves ordering/completeness, not wall-clock
  truth — AUDIT §7.3), and exits non-zero naming the first broken link.
- **Required knowledge:** AUDIT.md §7.3; WP-02 module API; `api/git.js` for git queries;
  existing CLI/script conventions (`scripts/`, `package.json` bin entries); `api/work/
  taskPersistence.js` frontmatter read path for `auditTipHash`.
- **Depends on:** WP-02, WP-03. **Blocks:** WP-09.
- **Acceptance checks:** one command verifies a full task; exits non-zero on a hand-edited
  middle event and names it; flags `auditTipHash` mismatch; states the clock caveat in
  output (AUDIT §12 review checks).
- **Framework map:** SOC 2 / ISO 27001 audit-evidence accessibility; RFC 6962 proof-of-inclusion analogue.

### WP-09 — Exportable per-task audit bundle (AUDIT §10 rung 1)

- **Deliverable:** `kainbain audit export <taskId>` producing `audit-bundle-<taskId>.tar.gz`
  containing `task.md`, all stage reports, `audit.log.jsonl`, the survey JSON, the worktree
  diff / commit range (incl. dirty-tree test diffs from WP-06), full prompt text (WP-05), and
  a `MANIFEST.json` (per-file SHA-256 + chain tip hash + exporter + timestamp; unsigned but
  hash-complete and labelled as such until signing exists — AUDIT §10). Plus
  `kainbain audit verify --bundle <file>` that rechecks every hash offline without the repo.
- **Required knowledge:** AUDIT.md §10; WP-08 verify logic (reuse for `--bundle`); archive
  tooling available in the repo (check `scripts/`, `deploy.packaging` tests for existing
  tar/zip usage); `api/work/taskFiles.js` for enumerating task artefacts.
- **Depends on:** WP-08 (and WP-05/WP-06 for prompt bytes and dirty-tree diffs). **Blocks:** WP-10.
- **Acceptance checks:** bundle verifies offline on a machine without the repo (AUDIT §12);
  manifest hashes match every file; chain tip in manifest matches `audit.log.jsonl`.
- **Framework map:** SOC 2 evidence export; GDPR storage-limitation/erasure workflow support
  (not a data-subject-rights implementation — AUDIT §10 disclaimer).

### WP-10 — Retention schedule + manual purge with purge events (AUDIT §10 rungs 2–3)

- **Deliverable:** a published default retention schedule document (e.g. task audit data 12
  months after task close, session transcripts 90 days, export bundles per customer
  contract) plus `kainbain audit purge --before <date>` as an **operator-run** command that
  deletes expired task data *and appends a `purge` event* (what was removed, under which
  policy version, by whom) so erasure is itself auditable. **Automatic expiry is explicitly
  out of scope** until the manual purge path is proven (AUDIT §10 rung 3).
- **Required knowledge:** AUDIT.md §10; WP-02 event schema (`purge` kind from WP-01 RFC);
  WP-09 bundle; `api/work/taskLifecycle.js` / `taskFinalize.js` for task-close semantics;
  project config storage for the schedule.
- **Depends on:** WP-09. **Blocks:** WP-11 (retention config defaults).
- **Acceptance checks:** purge appends an event rather than silently deleting (AUDIT §12);
  re-running purge is idempotent; schedule document states it does not implement data-subject
  rights.
- **Framework map:** GDPR storage limitation / erasure workflow (labelled non-conformance).

### WP-11 — Config layer, policy defaults, and docs (config last)

- **Deliverable:** deployment-level configuration for everything above, added only after the
  mechanisms exist: provider→jurisdiction mapping (source of truth for WP-07 fields),
  retention schedule values (WP-10), required-submitter enforcement toggle (WP-04),
  audit enable/disable per project, and operator documentation (`docs/` + `site-docs/`)
  covering: how to run `verify`/`export`/`purge`, the identity-strength caveat, the
  clock caveat, and the deferred-rungs list. Also update `AGENTS-MAP.md`/`agents.md` if new
  modules are added.
- **Required knowledge:** AUDIT.md §6.1 (config as source of truth), §8, §10; `.env.example`
  and `api/config.js` conventions; `docs/` and `site-docs/` structure; WP-01..WP-10 outputs.
- **Depends on:** WP-03..WP-10. **Blocks:** nothing (terminal WP).
- **Acceptance checks:** all new config keys appear in `.env.example` with defaults matching
  the documented schedule; docs name the verify/export/purge commands and both caveats;
  no behaviour change when audit config is at defaults beyond the new log file.
- **Framework map:** all — this is the organisational-onboarding surface.

---

## 2. Sequencing notes for ticketing

- **Merge order:** WP-01 → WP-02 → WP-03 → {WP-04, WP-05, WP-06, WP-07 in parallel} → WP-08 → WP-09 → WP-10 → WP-11.
- **Why this order (XP "make the change easy, then make the change"):** WP-01/WP-02 make
  *adding an audit event* a one-line call; WP-03 makes every existing writer emit events;
  after that, each evidence chain (WP-04..06) is purely additive event-body work with no
  further structural change. Verification (WP-08) and export (WP-09) only make sense once
  real events exist; retention (WP-10) builds on export; config (WP-11) is deliberately last
  so policy is set against a working mechanism, not a hypothetical one.
- **Blocking highlights:** WP-03 is the critical-path hub — the three chains, actor fields,
  and the verify CLI all depend on it. WP-08 gates WP-09; WP-09 gates WP-10.
- **Cross-cutting acceptance checks (from AUDIT §12, apply from WP-03 onward):** chain
  verifies after 150-history / 500-log eviction; verify fails loudly on a hand-edited middle
  event; export bundle verifies offline; purge appends an event; `task.md` rewrite without a
  log append is flagged by `auditTipHash` mismatch.

---

## 3. Deferred rungs (AUDIT §9 — parked, not scheduled)

Do **not** ticket these now; each activates only when an organisation demands it:

1. **Signed attestations (SLSA/in-toto style)** — per-runner keys with central registry
  (AUDIT §9.2), backend countersigning chain checkpoints; key rotation becomes a chained event.
2. **Trusted timestamps** — RFC 3161 timestamping of daily chain tips (AUDIT §9.3).
3. **External transparency log** — RFC 6962-style anchoring of chain tips (AUDIT §7.4).
4. **Strong human identity** — SSO/OIDC, MFA (`amr`), principal fields; migrate via a `v:2`
  chain segment, never retrofit signatures onto old events (AUDIT §8, §9.4).
5. **Egress enforcement** — provider allowlists, per-project residency switches, local-only
  modes; mandatory for multi-tenant/regulated-data deployments (AUDIT §9.5).
6. **Runner attestation beyond credential-bearing ingestion** — per-report runner signatures,
  re-execution proof (AUDIT §9.6).

---

## 4. Sources

- `AUDIT.md` (this directory) — all § references above
- `FEEDBACK_SURVEY.md` — answered decisions q1–q8 (round `auditability-followup`)
- `FRAMEWORKS.md` — framework-to-component map (SOC 2, ISO 27001, NIST AI RMF, SLSA, RFC 6962)
- `INTENT-SURVEY.md`, `task-spec-20261106-184516.md`
- Code paths verified in AUDIT §3: `api/work/taskPersistence.js`, `api/watch/stageReports.js`, `shared/survey.js`
