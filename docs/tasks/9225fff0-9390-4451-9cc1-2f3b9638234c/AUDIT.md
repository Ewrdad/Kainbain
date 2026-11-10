# KainBain Auditability Audit (Feedback-Resolved Update)

**Report path:** `docs/tasks/9225fff0-9390-4451-9cc1-2f3b9638234c/AUDIT.md`

**Task ID:** `9225fff0-9390-4451-9cc1-2f3b9638234c`

**Branch:** `kb/9225fff0-9390-4451-9cc1-2f3b9638234c`

**Baseline static audit:** tip commit `42f98d7` (see §11 for the preserved baseline findings).

**This update:** resolves the open survey gap (§11.3 of the previous revision, where
`INTENT-SURVEY.md` had `"answers": {}`) using the answered
`FEEDBACK_SURVEY.md` round (`generatedAt` `2026-11-10T09:15:00.000Z`,
stage `auditability-followup`), plus fresh source verification of the two writer
paths that any audit mechanism must build on: `api/work/taskPersistence.js`
(`saveTaskMarkdown`, `recordHistory`) and `api/watch/stageReports.js`
(`saveStageReport`). Deliverable scope per survey q8 is **research and
recommendations only** — no code changes are made or proposed as done in this
stage.

**One-line direction:** stay framework-agnostic for now; make three evidence
chains tamper-evident first (intent+submitter, prompt→model→output,
CI/test→code-SHA); do it with a **git-anchored hash-chained append-only log**,
not signatures or an external transparency log yet; record a plain username for
now; record provider+jurisdiction per stage report; ship a per-task exportable
audit bundle before automatic retention expiry.

---

## 1. Feedback Decisions Applied

| # | Question | Selected answer | Verbatim note | What this update does with it |
| :--- | :--- | :--- | :--- | :--- |
| q1 | Compliance driver | No specific framework yet — general best practice | "Someday all of them" | Keeps §3 framework mappings as future-ready; no framework is gated first (§2) |
| q2 | Tamper-evident evidence first | Intent/survey + submitter; prompt→model→output chain; CI/test tied to code SHA | — | Designs exactly these three chains in §4–§6; runner attestation, trusted timestamps explicitly deferred (§9) |
| q3 | Mechanism strength | Hash-chained append-only audit log | "Must be built around git history as that can be relatively safe" | Designs the git-anchored hash chain in §7; explains what git does and does not prove |
| q4 | Key ownership | (blank — correctly skipped, conditional on signed attestations which were not chosen) | — | Records no key decision; gives the recommendation to revisit when signatures are adopted (§9.2) |
| q5 | Human proof | Timestamped username in history is enough | "user accounts still being fleshed out" | Minimal actor schema now, SSO/MFA/signature migration path later (§8) |
| q6 | Data egress | Record provider + jurisdiction on every stage report | "configured by the user… controls at a lower level" | Per-report provider/jurisdiction fields (§6.1); allowlists, residency switches, local-only modes deferred with rationale (§9) |
| q7 | Retention/export | Undecided — recommend an option | — | Recommends exportable per-task bundle now, documented retention schedule with manual expiry next, automatic expiry later (§10) |
| q8 | Deliverable | Research and recommendations only | — | This document only; phased roadmap in §12, no prototype or implementation claimed |

Three q2 options were **not** selected (stage reports+difs/SHAs as a bundle,
runner attestation, anchored timestamps). That is treated as a scoping decision,
not a finding that those items are fine — each is recorded as deferred with its
residual risk in §9.

---

## 2. Compliance Posture: Framework-Agnostic, Future-Mapped

Per q1, no single framework gates organisational use yet. The framework mapping
from `FRAMEWORKS.md` is therefore retained as a **readiness map**, not a
compliance claim:

- **SOC 2 (change management + system operations):** the intent→plan→code→test→sign-off
  chain (§4–§6, §8) is the evidence spine a future SOC 2 review would sample.
  Current state remains Partial (see baseline §11): the chain exists as workflow
  sequencing but without cryptographic linkage.
- **ISO 27001 (controlled changes, who changed what, who authorised it):**
  the minimal actor record (§8) plus the append-only log (§7) are the two
  prerequisites for a controlled-change claim. Neither exists yet.
- **NIST AI RMF (model identity, prompts, hallucination tracing):** the
  prompt→model→output record (§5) is the RMF-relevant chain. Model identity is
  the strongest current surface (shared key grammar `harness::provider::id`,
  alias/modelRef/runnerId/harnessId in report metadata); the missing half is the
  exact prompt (or its hash) and output binding.
- **GDPR / UK data protection (residency, retention, erasure):** explicitly
  **not** selected as the driver, but the q6/q7 decisions touch it. Residency
  stays a recorded fact rather than an enforced control (§6.1); retention/erasure
  gets a recommended schedule rather than a compliance-certified one (§10).
  Nothing in this document should be read as a GDPR compliance statement.

Design rule following from q1: every new audit field proposed below carries the
framework(s) it would one day satisfy, but **no section claims conformance**.

---

## 3. Verified Writer Paths (What the Design Builds On)

Fresh verification (November 2026 worktree) confirmed the baseline audit's
description of the two paths every audit mechanism must integrate with:

1. **`saveTaskMarkdown`** (`api/work/taskPersistence.js:46-149`): rewrites
   `<projectRoot>/docs/tasks/<taskId>/task.md` wholesale on every save via
   `_atomicWriteFileSync` — frontmatter (identity, status, `reportMetadata`,
   `timelineMetadata`, …), `# Goal`, `# History` (rendered as
   `- {timestamp}: {action}` lines, `taskPersistence.js:105-107`), `# Timeline`,
   and `# Log Entries`. Rewriting is the norm, not an anomaly — any
   tamper-evidence that lives only inside `task.md` inherits this mutability.
2. **`recordHistory`** (`api/work/taskPersistence.js:159-177`): appends
   `{ timestamp, action }`, suppresses consecutive duplicates within 2000 ms,
   and caps at 150 entries (`[first, ...last 149]`). Silent eviction of early
   events is confirmed in code — the cap is the single largest history-integrity
   gap for the q2 intent chain.
3. **`saveStageReport`** (`api/watch/stageReports.js:159-259`): writes the
   report file with plain `fs.writeFileSync(fullPath, content, "utf8")` (line
   202, no hash/MAC/signature), then appends a metadata entry carrying
   `stageName/Id, duration, status, harnessId, failureKind, aliasName, modelRef,
   targetIndex, runnerId`. There are **no** fields for prompt hash, provider,
   jurisdiction, code SHA, test artifact reference, or submitter identity —
   each proposed addition in §5–§6 therefore has a named insertion point.

Consequence: the hash-chained log (§7) must be a **new file beside** these
artifacts (`audit.log.jsonl`), never a reinterpretation of `task.md` history,
and `task.md`/report writes must additionally append to it rather than replace it.

---

## 4. Priority Chain 1 — Intent / Survey Answers + Submitter

**Why first (q2):** intent is the root of the SOC 2 / ISO 27001 chain — every
downstream claim ("the AI built what was asked") samples back to it.

**Current state (verified):** survey rounds are append-only by convention
(`shared/survey.js`; markdown serializer note), persisted with `generatedAt`
timestamps, but with no submitter identity, no question-set digest, and no
locked-answer state. `recordHistory` renders survey events as free-text action
lines subject to the 150-entry cap and full-file rewrite. An auditor therefore
cannot answer "who asked for this, exactly what options did they see, and did
the answers change afterwards?"

**Recommended record (research proposal, not implemented):** on every survey
submission, append one hash-chained event (§7) containing:

- `surveyRound`, `surveyStage`, `questionSetHash` (SHA-256 over the canonical
  JSON of `questions`: id, type, text, options, required, showIf),
- `answers` (full selected values + notes, not just ids),
- `submitter: { username }` — plain timestamped username per q5 (see §8),
- `supersedes` (hash of the previous intent event, or null for round 1).

**Why `questionSetHash`:** without it, a later edit to question wording
silently re-scopes consent. The hash binds answers to the exact questions seen.

**Migration notes:** `recordHistory`'s 150-entry cap must not apply to intent
events — they live in the append-only log, with `task.md` history keeping only
a pointer (event hash + timestamp). Intent edits arrive as new superseding
events, never in-place modifications; contradiction between rounds stays visible
rather than being overwritten.

**Future-framework cover:** SOC 2 CC (change request evidence), ISO 27001 change
control (who requested what).

---

## 5. Priority Chain 2 — Prompt → Model → Output

**Why second (q2):** this is the NIST AI RMF chain — the only way to trace a
hallucinated or biased code change back to what the model was actually told and
which model was actually invoked.

**Current state (verified):** the model half is relatively strong — report
metadata already records `harnessId, aliasName, modelRef, targetIndex,
runnerId, failureKind`, and the shared key grammar plus alias routing are
implemented. The prompt half is absent: no effective-prompt text, prompt hash,
prompt-layout version, skill-content hash, or prior-report-input hash appears in
report metadata or on disk. The output half is present but unbound: the report
body carries verbatim output and a modified-files list, with no digest binding
output to the diff actually committed.

**Recommended record:** extend each `saveStageReport` metadata entry (insertion
points at `stageReports.js:209-245` and the `reportMetadata` projection in
`taskPersistence.js:87`) with:

- `promptHash` (SHA-256 of the exact effective prompt: curated task text +
  stage instructions + injected skill text + referenced prior reports),
  plus `promptLayoutVersion` and `skillContentHashes[]`,
- `modelRef` / `harnessId` / `aliasName` / `targetIndex` (already present —
  retain, and add `modelProvenance`: temperature/config snapshot id where
  available),
- `outputHash` (SHA-256 of the report `content` as written) and
  `codeSha` (the commit SHA the stage's diff is evaluated against, with
  `boundaryStartSha`/`boundaryEndSha` where timeline entries already carry them),
- `provider` + `providerJurisdiction` (see §6.1 — recorded here because the
  model invocation is the egress point),
- `prevAuditHash` chaining the event into the per-task log (§7).

Store the full prompt text only in the export bundle (§10), not in frontmatter —
frontmatter keeps hashes; the bundle keeps bytes. This keeps `task.md` small
while preserving reconstructability.

**Hallucination-tracing payoff:** given a suspect code hunk, the auditor walks
`codeSha → outputHash → promptHash → questionSetHash`: what code, produced from
what output, from what prompt, under what intent. No link in that walk exists
today; this proposal creates all of them without signatures.

**Future-framework cover:** NIST AI RMF Govern/Map (model identity, prompt
transparency), SLSA-style provenance (builder inputs recorded, signing deferred).

---

## 6. Priority Chain 3 — CI / Test Results Tied to Code SHA

**Why third (q2):** a test verdict without a pinned code version proves nothing —
the code under test can change after the pass. This is the SOC 2 "verified test
result" link.

**Current state (verified):** CI/command stages exist, timelines optionally carry
`boundaryStartSha`/`boundaryEndSha` and diff stats, and report bodies capture
test output text — but there is no test-evidence record binding verdict to SHA:
no test-command digest, no artifact reference, no rerun provenance, and process
log entries are subject to the 500-entry cap with eviction.

**Recommended record:** for every CI/test stage, append a hash-chained event
containing:

- `codeSha` (exact commit tested) + `worktreeDirty` flag (whether uncommitted
  changes existed at test time — a dirty-tree pass must be labelled as such),
- `testCommandHash` + `testCommandText` (what ran),
- `verdict` (pass/fail), `outputHash` (SHA-256 of the captured output),
  `testArtifacts[]` (paths/hashes of coverage reports, logs, SBOMs referenced),
- `rerunOf` (prior event hash when a retry, so flaky-pass-then-ship is visible).

**Dirty-tree rule (new research recommendation):** Kainbain stages frequently run
against a live worktree rather than a clean commit. The audit event must record
whether the tree was dirty, and the export bundle (§10) must include the
worktree diff at test time. A pass on a dirty tree is evidence about that
diff — not about the later commit.

**Future-framework cover:** SOC 2 system-operations testing evidence.

### 6.1 Provider + Jurisdiction on Every Stage Report (q6)

Per q6, the selected control is recording — not enforcement. Rationale accepted
from the survey note: providers are user-configured per runner/deployment, and a
project that cannot use a runner's agents can unload the project, so heavyweight
per-project egress switches are disproportionate at this stage.

**Recommended fields** on each stage-report event (alongside `modelRef`):

- `provider` (e.g. `ollama-cloud`, `litellm:openai`, `local`),
- `providerJurisdiction` (declared processing jurisdiction for that provider
  route, e.g. `EU`, `US`, `local-only`),
- `egressClass`: `local-only` | `remote-inference` (derived, so an auditor can
  filter stages where prompts/code left the host without reading prose).

Source of truth for the jurisdiction value must be the deployment's provider
configuration, echoed per stage — never typed freehand per report. Where the
jurisdiction is unknown, record `"unknown"` rather than omitting the field; a
missing field reads as "not applicable" while `"unknown"` reads as a gap.

---

## 7. Tamper-Evidence Mechanism: Git-Anchored Hash-Chained Log (q3)

### 7.1 What was chosen and why

q3 selects the **hash-chained append-only audit log**, with the note that it
"must be built around git history as that can be relatively safe." This section
takes that note seriously: git helps, but git alone is not the mechanism.

**What git history actually proves:** every git object is content-addressed
(SHA-1, or SHA-256 with `objectFormat`), so silently altering a committed
report changes its blob hash and breaks the chain of trees and commits above
it. An auditor with the commit history can detect backdated edits — *provided*
they have an independent copy of, or a trusted anchor for, the tip they are
verifying against. That proviso is the whole weakness: in a single-clone
deployment, whoever can rewrite the branch can rewrite "history" by committing
the alteration normally. `git log` then shows a clean, linear, false past.
Force-pushes, rebases, `commit --amend`, and history-capped rewrites are normal
git operations, not attacks git prevents.

**Therefore the design is two layers:**

1. **Per-task append-only log** `docs/tasks/<taskId>/audit.log.jsonl` — one
   JSON object per line, each event carrying `prevHash` (hex of the previous
   line's canonical SHA-256) and `eventHash` (SHA-256 over canonical JSON of
   the event including `prevHash`). Genesis event uses `prevHash: null` and
   records the task creation (task id, branch, initial intent hash).
2. **Git as the anchor and transport** — the log file is committed on the task
   branch (`kb/<taskId>`) alongside reports. Verification is `verify-chain`
   (recompute every `eventHash`, check every `prevHash` link) **plus**
   `verify-anchor` (the committed log's tip hash matches an independently kept
   reference: a tag, a note on the merge commit, or the export bundle receipt).

Either layer alone fails its job: the JSONL chain without git is just another
mutable file; git without the chain shows *a* history but cannot show that no
event was dropped between two commits (the 150/500-entry caps do exactly that
kind of silent dropping today).

### 7.2 Minimal event schema (proposal)

```json
{ "v": 1, "taskId": "…", "seq": 12, "ts": "2026-11-10T09:15:00.000Z",
  "actor": { "username": "…", "kind": "human|runner|backend" },
  "kind": "intent|stage|test|approval|export",
  "body": { "…chain-specific fields from §4–§6…": "…" },
  "prevHash": "…", "eventHash": "…" }
```

Canonicalisation: UTF-8, JSON keys sorted, no whitespace, `eventHash =
SHA256(canonical(event without eventHash))`. SHA-256 (not git's object id) so
the chain survives hash-algorithm transitions and can be checked without git.

### 7.3 Writer rules (where code must change, later stage)

- All three writer paths (`recordHistory`, `saveStageReport`, survey
  submission) **append** exactly one event per action; nothing in the log is
  ever edited, deleted, or capped. The 150-history / 500-log caps continue to
  bound the *rendered* `task.md` sections only, each rendered with an explicit
  pointer (`audit events #0–#N retained in full in audit.log.jsonl`).
- `task.md` frontmatter gains `auditTipHash` (tip `eventHash` at last save) so
  a reader can tell at a glance whether the rendered file matches the log.
- Verification command `kainbain audit verify <taskId>` recomputes the chain
  and cross-checks `auditTipHash`, per-file `outputHash` values (re-hash the
  report files), and the git anchor (`git log -- docs/tasks/<id>/audit.log.jsonl`).
  It exits non-zero with the first broken link named — an auditor runs one
  command, not a reading of code.
- Clock note: timestamps remain system-clock (`Date.toISOString`, as today).
  Trusted-timestamp anchoring was **not** selected in q2 and is deferred (§9.3);
  the chain proves *ordering and completeness*, not wall-clock truth. Say so in
  the verify output.

### 7.4 Why not signatures or a transparency log yet

That is the q3 scoping decision, and it is defensible: a hash chain with a git
anchor detects insider edits and backend tampering (the threats the chain
addresses) at near-zero key-management cost, while signatures add a key
ceremony, rotation, and revocation burden the project has no owner for yet
(q4 blank; runner update key rotation still outstanding per baseline §11).
The chain is also the correct precursor — signed attestations later sign
*chain checkpoints*, and a transparency log later anchors *chain tips*,
rather than replacing the chain. §9 records both as explicit next rungs.

---

## 8. Human Identity: Timestamped Username Now, Principals Later (q5)

q5 selects "timestamped username in history is enough," noting user accounts are
still being designed. Accepted — with a schema that does not paint the project
into a corner.

**Now:** every audit event carries
`actor: { username: string, kind: "human"|"runner"|"backend" }`, rendered into
`task.md` history lines as today (`- {ts} [{username}]: {action}`). Username is
required (empty/anonymous submissions are rejected at the survey/API boundary,
not defaulted), free-text but stable per deployment.

**Explicitly not claimed:** this proves nothing about who the human is — no
SSO/OIDC, no MFA evidence, no signature, no role. Approval events additionally
record `role` as *claimed* text (e.g. `reviewer`), never as verified authority.
The verify command must label identity strength (`self-asserted username`) so
no future reader mistakes it for authentication.

**Migration path (when accounts land):** extend `actor` to
`{ username, principalId?, idp?, amr? }` (`amr`: authentication methods, e.g.
`pwd`, `mfa`, `sso`) without renaming existing fields; old `username`-only
events remain valid chain links. Do **not** retrofit signatures onto old events
— start a new chain segment (`v: 2` event noting the identity upgrade) instead.

**Residual risk stated plainly:** until principals exist, a malicious insider
with write access can author events as anyone. The hash chain (§7) makes that
forgery *detectable after the fact* (it cannot be backdated into the middle of
the chain without breaking links) but not *preventable*. That matches the
survey's risk appetite at this stage; organisations needing prevention should
not rely on this mechanism (see §9.4).

---

## 9. Explicitly Deferred (Not Selected) — With Residual Risks

### 9.1 Stage reports + diffs + SHAs as a standalone bundle (q2, not selected)

Partly covered anyway: `outputHash` + `codeSha` per stage (§5) and the export
bundle (§10) include reports, diffs, and SHAs. What is *not* built is a
separately signed report bundle — deferred because the chain tip plus git anchor
already binds the set. Residual risk: none beyond §7's clock caveat.

### 9.2 Signed attestations — SLSA/in-toto style (q3 ladder rung above chosen)

Not built now. When adopted, the recommendation is: **per-runner keys with a
central registry** (the q4 option that best fits the existing runner credential
model — join-token registration, per-runner credentials, approval/revocation
states already exist), with the backend countersigning chain checkpoints.
Customer-held BYOK belongs to a later multi-tenant phase. Key-rotation history
itself must become a chained event type. Residual risk: a compromised backend
can append plausible events; detection relies on reviewers and the git anchor,
not on independent runner signatures.

### 9.3 Trusted timestamps (q2, not selected)

System-clock timestamps only. The chain proves order, not time. Organisations
that need "this existed before date X" (regulatory filings, prior-art claims)
cannot use this mechanism alone. Next rung when needed: RFC 3161 timestamping
of daily chain tips — cheap, no per-event cost.

### 9.4 Strong human proof — SSO/MFA/signatures (q5 options not selected)

See §8 residual risk. Organisations under ISO 27001 approval-control
requirements must layer their own approval system in front of Kainbain gates
until principals land.

### 9.5 Egress enforcement — allowlists, residency switches, local-only modes (q6 options not selected)

Recording (§6.1) is not enforcement: a stage can still send data to any
configured provider; the log only shows where it went. The survey's reasoning
(user-configured providers, unload-the-project escape hatch) is accepted for
single-tenant self-hosted use. Multi-tenant or regulated-data deployments must
revisit this — per-project provider policy becomes mandatory there.

### 9.6 Runner attestation beyond credential-bearing ingestion (q2, not selected)

Runner identity stays as today (join token, per-runner credentials, dispatch
stamps). No per-report runner signature, no re-execution proof. Rogue-runner
false results remain detectable only by re-running or by reviewer scrutiny, not
by cryptography.

---

## 10. Retention and Export: Recommendation for Undecided q7

q7 is "Undecided — recommend an option." Recommendation: **exportable per-task
audit bundle now; documented retention schedule with manual expiry next;
automatic expiry last.** Rationale, in order:

1. **Bundle first (build next):** `kainbain audit export <taskId>` produces a
   single archive (e.g. `audit-bundle-<taskId>.tar.gz`) containing `task.md`,
   all stage reports, `audit.log.jsonl`, the survey JSON, the worktree diff /
   commit range, and a `MANIFEST.json` (per-file SHA-256 + chain tip hash +
   exporter + timestamp). The bundle is self-verifying: `kainbain audit verify
   --bundle <file>` rechecks every hash without needing the repo. This is
   git-native, needs no key ceremony, and is the artefact an external auditor
   actually asks for. Sign the manifest only once signing exists (§9.2) — ship
   unsigned-but-hash-complete first, and label it so.
2. **Retention schedule as documentation + manual tooling (same phase):**
   publish a default schedule (e.g. task audit data retained 12 months after
   task close, session transcripts 90 days, export bundles per customer
   contract), and provide `kainbain audit purge --before <date>` as an
   operator-run command that deletes expired task data *and appends a purge
   event* (what was removed, under which policy version, by whom) so erasure
   itself is auditable. Without the purge event, retention enforcement looks
   identical to tampering under the §7 chain.
3. **Automatic expiry last:** only after the purge path is proven manually.
   Automatic deletion of audit data is the highest-risk retention feature (a
   bug becomes evidence destruction); it must wait for the chain, the bundle,
   and the purge-event convention to exist.

GDPR note: this schedule supports storage-limitation and erasure workflows but
does not itself implement data-subject rights (no subject registry, no
per-subject search). Do not present it as such.

---

## 11. Preserved Baseline (Static Audit at 42f98d7)

The previous revision's static findings stand and are summarised here rather
than repeated; consult git history of this file for the full text.

- **Strengths confirmed:** per-stage reports with runner/model attribution
  (`runnerId, harnessId, modelRef, aliasName, targetIndex, failureKind`); task
  timeline with diff stats and optional commit SHAs; redaction choke point
  (`shared/redactSecrets.js`); runner credential lifecycle (join token, approval,
  rotation, R04 rejection tests); runner update signature+SHA verification order
  (key rotation outstanding); large behavioural test suite (no immutability or
  attribution assertions).
- **Design-level gaps confirmed (12):** no user auth/principal model; no tenant
  model; no append-only ledger/hash chain; no report signing; no retention /
  erasure tool; no residency control; no signed export; no prompt-hash capture;
  no CI→SHA binding; no trusted timestamps; no approval signatures; no audit
  viewer with integrity checks.
- **Threats confirmed:** rogue runner, hallucinated claims, insider history
  edits, backend tampering/log loss, YOLO auto-approval, third-country egress,
  indefinite retention, placeholder signing keys. The §7 chain addresses insider
  edits and log loss (detection); hallucination tracing is addressed by §5;
  the remainder need the deferred controls in §9.
- **Prior survey gap closed:** `INTENT-SURVEY.md` had `"answers": {}`; the
  feedback round answered the same substance (framework, evidence, mechanism,
  identity, egress, retention, deliverable). Threat-priority (old q5) and
  sign-off-location (old q7) questions were not re-asked; they remain open
  inputs for the design stage, with a default reading that insider-edit
  resistance (§7) and merge/deploy gates are the sensible defaults.

---

## 12. Roadmap (Research Deliverable → Next Stages)

This stage delivers research only (q8). Recommended sequencing for the stages
that follow, cheapest verifiable step first:

1. **Design doc:** formalise §7 event schema + §4–§6 field additions +
   `verify`/`export` CLI contracts as a short RFC; include the dirty-tree rule
   (§6) and the purge-event convention (§10).
2. **Prototype:** `audit.log.jsonl` append + `verify-chain` on one task flow
   end-to-end (survey submit → stage → test stage), with `auditTipHash` in
   frontmatter; no signing, no transparency log.
3. **Provider/jurisdiction + actor fields:** add the §6.1 and §8 fields to
   report metadata; backfill `"unknown"` for pre-feature history.
4. **Export bundle:** `export`/`verify --bundle` per §10, including worktree
   diffs for dirty-tree test events.
5. **Retention tooling:** documented schedule + manual `purge` with purge
   events; automatic expiry only after operational experience.
6. **Later rungs (only when an organisation demands them):** per-runner signing
   with central registry → checkpoint countersigning → RFC 3161 tip
   timestamping → external transparency log → SSO/MFA principals → per-project
   egress enforcement.

**Suggested review checks for the next stage:** chain verifies after history-cap
eviction (150) and log-cap eviction (500); verification fails loudly on a
hand-edited middle event; export bundle verifies offline; purge appends an
event rather than silently deleting; `task.md` rewrite without a log append is
flagged by `auditTipHash` mismatch.

---

## 13. Sources

- `FEEDBACK_SURVEY.md` (auditability-followup round, answered 2026-11-10)
- `FRAMEWORKS.md` (framework-to-component map)
- `INTENT-SURVEY.md` (unanswered baseline round)
- `task-spec-20261106-184516.md`
- `api/work/taskPersistence.js` (`saveTaskMarkdown`, `recordHistory`)
- `api/watch/stageReports.js` (`saveStageReport`)
- `shared/survey.js`, `shared/modelKeys.js`, `shared/modelAliases.js`,
  `shared/redactSecrets.js`, `shared/reportTimestamp.js`
- Baseline static audit content (previous revision of this file, commit
  `42f98d7` basis) — preserved in summary in §11.
