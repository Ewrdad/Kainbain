# KainBain Auditability Audit

**Report path:** `/home/server/.kainbain/runner-work/kb-9225fff0-9390-4451-9cc1-2f3b9638234c/docs/tasks/9225fff0-9390-4451-9cc1-2f3b9638234c/AUDIT.md`

**Task ID:** `9225fff0-9390-4451-9cc1-2f3b9638234c`

**Subject:** How an organization may safely use KainBain plus AI in its workflows, and what audit evidence currently exists or is missing for trusted, verifiable history.

**Branch:** `kb/9225fff0-9390-4451-9cc1-2f3b9638234c`

**Audit date (relative to repo tip):** based on the checked-out worktree at tip commit `42f98d7`.

**Basis for structure:** `FRAMEWORKS.md` ("Frameworks for Kainbain Auditability"), KainBain architecture and workflow documentation, prior reports `INTENT-SURVEY.md` and `task-spec-20261106-184516.md`, and the companion UK/EU compliance research under `docs/research/compliance-uk-eu/`.

---

## 1. Audit Basis, Scope, and Method

### 1.1 Scope

This audit examines the KainBain source tree in the current worktree. It is scoped to properties that matter for **trusted and verifiable audit history** of AI-assisted software delivery:

- task intent, planning, stage execution, reports, history, timeline, process logs;
- model identity and versioning;
- human review, approvals, rejection, routing, and sign-off;
- runner and agent provenance;
- code, git, CI, merge, and deploy evidence;
- data handling, redaction, retention, export, and immutability;
- supply-chain and runtime-update verification;
- identity, authentication, authorization, and trust boundaries.

This is a **static, source-and-documentation audit**. It documents code paths, persisted data shapes, configuration surfaces, and existing test/report documentation. It does **not** perform runtime penetration testing, key ceremony review, live tenant isolation testing, branch history verification, or independent cryptographic verification of signed or persisted artifacts.

### 1.2 Worktree inventory observed

| Item | Observed value |
| :--- | :--- |
| Git worktree path | `/home/server/.kainbain/runner-work/kb-9225fff0-9390-4451-9cc1-2f3b9638234c` |
| Branch | `kb/9225fff0-9390-4451-9cc1-2f3b9638234c` |
| Tip commit | `42f98d7` |
| Tracked files | approximately 2510 |
| JavaScript/TypeScript source files | 1180 |
| Test files | 956 |
| Documented production readiness report date | 2026-08-26 |
| Runner release signing-key rotation commit observed | `ae17552 Rotate runner release signing key before first release` |

### 1.3 Evidence reviewed (representative)

| Area | Representative files / documentation |
| :--- | :--- |
| Backend composition root | `api/index.js` |
| Configuration schema | `api/config/schema.js` |
| Task state and markdown persistence | `api/work/taskPersistence.js`, `api/taskStore.js`, `api/docsPath.js` |
| Stage reporting | `api/watch/stageReports.js`, `api/watch/processLogs.js` |
| Redaction | `shared/redactSecrets.js` |
| Model identity and aliases | `shared/modelKeys.js`, `shared/modelAliases.js`, `api/models.js`, `api/aliasSelector.js` |
| Harness contract / session store | `api/agent/harnessContract.js`, `api/sessionStore.js`, `api/agent/harnessRegistry.js` |
| Task history / timeline | `api/work/taskLifecycle.js`-adjacent persistence in `api/work/taskPersistence.js` |
| Human review and git safety | `api/flow/humanGitSafety.audit.js`, `api/flow/humanGitSafety.contract.test.js`, `api/flow/humanGitSafety.audit.test.js` |
| Runner identity and dispatch attribution | `api/flow/runnerRegistry.js`, `api/flow/runAttribution.js`, `api/flow/runnerRoutes.js` |
| Execution state | `api/flow/executionLedger.js`, `api/flow/executionQueue.js` |
| CORS | `api/cors.js` |
| Process and task streamer | `api/agent/logStream/agentLogStreamer.js` (referenced by architecture docs) |
| Frontend UI and model/service layers | `frontend/src/...` |
| Operational reports | `docs/PRODUCTION_READINESS_REPORT.md`, `docs/PORTABLE_DEPLOYMENT.md`, `docs/MuseCodeHackathon2026/*` |
| Compliance research | `docs/research/compliance-uk-eu/*` |
| Security scan framework | `Security_scans.sh` |
| Runner self-update verification | `runner/updates/verify.js`, `runner/updates/download.js`, `runner/updates/manifest.js` |
| Prompt and skill injection | `api/skills/skillInjection.js`, `api/promptCuration.js` (referenced), `shared/promptLayout.js` |
| Task analysis guide | `skills/kainbain-task-analysis/SKILL.md` |

### 1.4 Important blank areas deliberately not over-claimed

Many runtime details cannot be verified from this checkout alone. Where an evidence item is only documented and not implemented or where no implementation was found, it is recorded as **unverified / not observed** rather than assumed absent.

---

## 2. System and Trust Boundary Inventory

The architecture documentation identifies the following audit-relevant system characteristics.

### 2.1 Components

| Component | Identity in KainBain terms | Audit relevance |
| :--- | :--- | :--- |
| Fastify API (`api/`) | Server-authoritative orchestration and persistence engine | Source of stage reports, task markdown, logs, models, configuration, runner registry |
| React frontend (`frontend/`) | UI for tasks, reports, queues, settings, review | User-facing evidence view; no independent verification capability observed |
| Runner (`runner/`) | Durable native process performing dispatched stages | Stage execution, git operations, posture, model/version reporting |
| Agent harness layer (`api/agent/`) | Provider-specific harness implementations behind a normalized contract | Model invocation boundary; prompts, tool calls, and transcripts |
| Shared modules (`shared/`) | Common grammar, model keys, redaction, report timestamp, survey schema | Shared invariants between backend/frontend/runner |
| Git repository | Branch-per-task, commits, merge and integration stages | Code-level audit trail and diff attribution |
| Project docs tree | `docs/tasks/<taskId>/...` | Primary persisted artifact store; source of truth for reports |
| Session store | `.kainbain` or project-scoped session directories | Persisted agent transcripts and JSONL history |
| Health and observability | `/status`, health checker, alerts, webhook notifier | Operational evidence; not stage-level attestation |

### 2.2 Observed trust boundaries

| Boundary | Observed control | Audit status |
| :--- | :--- | :--- |
| Backend route authorization | No general authentication middleware registered in `api/index.js` | **Absent as general user/API auth** (see §7) |
| Runner-to-backend identity | Per-runner credentials issued on approval; join token gates registration; runner identity authenticated by credential; route-level R04 tests exist | **Present for runners; scoped to runner operations** |
| Operator join token | `config.runnerJoinToken`; empty value disables registration with `403 REGISTRATION_DISABLED` | **Present; empty disables registration** |
| Model execution and harness selection | Project/runner allowlist and capability advertisements | **Present as operational control; no human identity attached** |
| Secret handling in child processes | Secret-shaped child env dropped; child env allowlist; stage text redaction | **Present as redaction; not as provenance/attestation** |
| Code modification rights | Git worktree per task, pre-push posture, tier policy documentation | **Present as policy and posture; enforcement depends on runner config and tier** |
| CORS | Origin-less, loopback, and explicitly listed origins; broad HTTP verb allowance | **Network-scoping only; no user auth** |

### 2.3 Identity classes observed

The codebase distinguishes several identity-like concepts, but **they are not unified into one principal ledger**:

| Identity class | Where observed | Verifiable human/principal? |
| :--- | :--- | :--- |
| KainBain task ID | `task.id`, filenames, frontmatter | Yes as record ID; no human authorship proof |
| Project ID | `projectId`, `projects/<id>` | Yes as record ID; ownership not principals |
| Runner ID | Runner registry and report metadata (`runnerId`) | Yes as runner identity; credential-backed |
| Harness identity | `harnessId` in report metadata | Yes as runtime identity |
| Model alias name | `aliasName` in report metadata | Yes as configuration reference; no signature |
| Stage ID/name | Stage transition metadata | Yes as configuration identity |
| User operator | UI actions, `recordHistory` plain action strings | **No observed principal identity, auth token, or signature** |
| Human approver | Review stage events and history lines | **No observed principal identity, signature, or verifier** |

---

## 3. Core Audit Evidence Surfaces in KainBain

KainBain persists work and reports primarily as files in the project repository/docs tree. The following are concrete, observed audit artifacts.

### 3.1 Stage reports (`api/watch/stageReports.js`)

Every stage emits a timestamped markdown report to the project docs tree.

Observed report structure includes:

- `AUTO_REPORT_MARKER` (`<!-- KAINBAIN AUTO-GENERATED REPORT -->`) for distinguishing auto-generated stage reports from manually authored reports;
- task title;
- stage name;
- stage type;
- model;
- duration;
- status;
- summary;
- full execution output (verbatim, wrapped as a code block);
- modified files;
- verification status;
- whether failure fallback was triggered.

Observed report metadata (stored in task markdown frontmatter) includes:

- `filename`
- `stageName`
- `stageId`
- `duration`
- `status`
- `createdAt`
- `durationStartedAt`
- `harnessId`
- `failureKind` (`none`, `rejected`, or `infrastructure`)
- `aliasName`
- `modelRef`
- `targetIndex`
- `runnerId`

The report file is written with `fs.writeFileSync(fullPath, content, "utf8")` under `<projectRoot>/docs/tasks/<taskId>/<stageSlug>-<timestamp>.md`. No cryptographic signature, hash, append-only protection, or file-content MAC was observed in this path.

### 3.2 Task markdown (`api/work/taskPersistence.js`)

Task state is persisted as `<projectRoot>/docs/tasks/<taskId>/task.md`. Observed contents include:

- YAML-like frontmatter for task identity, status, timestamps, branch, stage, review baseline, report metadata, timeline metadata, deploy identifiers, stall count, reliability samples, auto-iteration flags, blocked-by information;
- `# Goal`;
- `# History` (human-readable action list);
- `# Timeline` (stage, status, duration, timestamp, optional diff stat);
- `# Log Entries` (JSON structured form);
- legacy `# Process Logs` parsing support (read-only migration path).

Observed writer function: `saveTaskMarkdown`, using `_atomicWriteFileSync`. Observed reader: `parseTaskMarkdown`.

### 3.3 Timeline

Each stage transition records a timeline entry with:

- stage;
- status;
- duration;
- timestamp;
- additions/deletions diff stat;
- optional boundary commit SHAs (`boundaryStartSha`, `boundaryEndSha`);
- baselines used for delta computation;
- diff-stat attribution metadata.

The receipt of arbitrary UTF-8 stage-consumed file contents as part of preserved output means the task markdown can include code and logs, subject to system limits.

### 3.4 History

`recordHistory` appends `{ timestamp, action }` entries, with two controls observed:

- duplicate consecutive events within 2000ms are suppressed;
- history capped at 150 entries (`[first, ...last 149]`).

What this means for audit history: history is **mutable in place**; a later save can re-write `task.md`; and the cap can drop early events. No hash chaining, event IDs, signatures, or audit cursor was observed.

### 3.5 Process logs / structured log entries

Structured log entries carry:

- `id` (`log-${counter}`);
- `ts`；
- `feed` (`main`, `thinking`, `tools`);
- `kind`;
- `turn`;
- `text`;
- `meta` (source and optional runner attribution).

Log text is redacted through `shared/redactSecrets.js`. Structured entries are capped to `config.logEntriesMaxCount` (default 500), with an eviction marker representing omitted entries. Rendered legacy text is derived at read time and is not stored on the task.

### 3.6 Session store and transcripts

`api/sessionStore.js` persists **one session directory per project** so history survives restarts. Event handlers produce normalized events and feed the runner/activity path. The backend also records agent JSONL transcripts (documented in architecture and security/supply-chain notes), but the exact principal-level provenance fields or schema level on disk were not fully audited in this report.

### 3.7 Survey and intent (`shared/survey.js`)

Survey JSON describes rounds of questions, generated by `question-me`. The schema includes:

- `round`
- `generatedAt`
- `stage`
- `questions` (id, type, text, options, required, conditional logic)
- `answers` object.

The architecture doc says surveys are append-only in rounds; the markdown serializer notes "rounds are append-only." No author signature, user identity, tamper protection, or locked-answer status was observed.

### 3.8 Prompt layout and curation

The system curates prompts by task, stage, prior report references, and constraints. Model aliases and harness selection can route a stage. Prompt text itself is not stored as a signed or hashed invariant in the report metadata observed. Stage skills (direct and option modes) are injected under documented character caps.

### 3.9 Git evidence

KainBain uses task branches (`kb/<task>`), commits, branch worktrees, review baseline strings, report metadata, and diff statistics. `humanGitSafety.audit.js` is a test-only argv audit, not a production git safety mechanism, and explicitly says "No production module imports this file."

### 3.10 Runner provenance

The runner system includes:

- join-token-gated registration;
- pending approval state;
- per-runner credentials;
- heartbeats with capabilities, harness versions, model lists, permitted tiers;
- dispatch protocol;
- runner-side policy/advertisement;
- report attribution (`runnerId`, `harnessId`, model references, `failureKind`, alias name, alias target index).

This is the most developed principal-level provenance surface in the system, but only for **runner execution**, not human workflow participants.

---

## 4. Compliance Framework Mapping (as required by FRAMEWORKS.md)

The following table applies the framework-to-component mapping from `FRAMEWORKS.md`, with verification based on the current source tree. Status is one of: **Present**, **Partial**, **Absent**, or **Unverified**.

| Kainbain component | Framework requirement | Evidence observed | Status | Missing data / verification gap |
| :--- | :--- | :--- | :--- | :--- |
| Intent Survey | SOC 2 / ISO 27001: timestamped record of user requirements and constraints | `shared/survey.js`, report/timeline persistence, task markdown frontmatter; timestamps on task creation and report records | **Partial** | Survey reports have timestamps but no human principal identity, authorization marker, survey schema hash, locked answer state, or signature |
| Agent Planning | NIST AI RMF: exact prompt → model version → planned output | Model key grammar, model aliases, harness identity, stage model fields, prompt curation engine, stage skills injection | **Partial** | Report metadata records model, alias, target index, runner, failure kind, but prompt layout version, effective prompt text or hash, model temperature/license provenance, and skill content hash were not observed |
| Stage Execution | SLSA / SOC 2: cryptographically signed result from trusted builder | Reports written by engine with auto marker; runner execution has runner credential and server-side dispatch; immutable update verification for runner assets | **Partial / Absent for signing** | No signature, hash chain, MAC, or builder attestation is attached to stage report content; runner execution evidence is report metadata only |
| CI/Test Results | SOC 2: immutable link between code version and pass/fail event | Git integration, task timeline diff stats and commit boundaries; command stages and CI stages exist; stage reports capture modifications | **Partial** | CI result-to-code-SHA signed linkage, test artifact references, and tamper protection were not observed |
| Human Approval | ISO 27001 / SOC 2: digital signature or verifiable identity log of approving human | Human review/reject stage semantics, merge/integrate stages, review baseline, task history action lines | **Partial / Absent identity** | No human principal identity, approval signature, authorization scope, MFA/identity provider evidence, or immutable approval record is present |
| Audit History | RFC 6962 / SLSA: hash-chained log or signed bundle preventing modification | Task markdown, stage reports, history array, timeline, log entries, git history; read-only sync features | **Partial** | History is mutable, capped, overwrite-capable, and unsigned; no hash chain, transparency log, Merkle proof, or append-only store enforcement was observed |
| Model Identity and Version | NIST AI RMF, SLSA, ISO 27001 | Strong shared key grammar (`harness::provider::id`); fallback rules, aliases, discovery, runnable/health state | **Present with gaps** | Update manifest signature is currently pinned to placeholder key pending rotation; model availability depends on runtime discovery and can vary |
| Runner Execution | SLSA / SOC 2 / ISO 27001: trusted and attributed execution | Runner credentials, approved/denied runner flow, runner-specific report metadata, model/report attribution, posture | **Partial** | No independent proof that runner returned report payload is attributable beyond credential-bearing ingestion and an absence of per-report signature or raw re-execution proof |
| Code and Change Management | SOC 2 / ISO 27001 | Branches, commit ranges, diff statistics, merge stages, human git safety contract tests, atomic writes | **Partial** | Branch safety is validated in tests but production path does not create a signed, externally verifiable provenance statement per change |
| Tamper Evidence | SLSA / RFC 6962 | Git tree provides object hashes at repo level; file-based reports are written and re-synced from disk | **Partial (repository-level)** | Individual audit artifacts are not independently hash-chained or signed, and moving/replacing files can alter visible history without detection inside KainBain |

---

## 5. Detailed Component Audit Findings

### 5.1 Intent Survey

Observed:

- `shared/survey.js` defines round-question-answer structures.
- Survey rounds are documented as append-only.
- Reports and task markdown persist timestamps and stage transitions.
- `api/work/taskSurvey.js` exists (referenced by research docs).
- `frontend/src/components/tasks/SurveyPage.jsx` is referenced.

Audit observations:

- There is no observed survey schema version hash or question-set digest.
- There is no author/actor identity attached to survey answers.
- Answer objects are key/value without a signed or time-verifiable approval state.
- Survey rounds may be followed by stages that re-scope intent; runtime intent edits can occur via follow-ups, and contradiction auditing is documented as a gap, not an implementation.

Missing data to collect:

- browser/auth context around survey submission;
- whether survey edits and append-only rounds are impossible to modify after lock;
- any digital approval extension or survey audit table.

### 5.2 Agent Planning and Prompt Assembly

Observed:

- The task description passed to each stage is curated and not the entire transcript.
- Stage skills and available skills are documented and injected.
- Model aliases route stages to weighted harness/model targets.
- Model and harness identity are first-class through shared model keys.
- Prompt layout principles and harness boundary are documented in architecture material.

Audit observations:

- Report metadata includes model, alias, model ref, target index, harness, runner, and failure kind.
- No provenance digest for the effective prompt, skill files, prior reports, task goal, or stage instructions was observed in report metadata.
- The report summary is `stripStageVerdictBlock(output)`, or may be replaced with an artifact note. Raw output can therefore serve as evidence.
- Prompt assembly can be influenced by on-disk stage skills; option mode requires the agent to read files itself, but prompts rely on path references and flags, not content attestation.

Missing data to collect:

- current `promptLayout` version, prompt template hashes, and skill file checksums;
- whether the effective prompt can be deterministically reconstructed from task/stage state;
- whether prior reports are re-read and hashed as inputs.

### 5.3 Stage Execution and Runner Participation

Observed execution control surfaces include:

- one session per stage;
- execution queues and schedule semantics;
- runner advertisement and dispatch;
- automated failure routing and retry;
- durability controls for interrupted servers;
- stage reports and runtime attribution.

Observed report attribution allows organizational tracing:

- model ref;
- harness attribution;
- alias name and target index;
- runner ID;
- failure kind (rejected vs infrastructure);
- stage status and duration.

Audit observations:

- Stage results depend on harness runtime behavior external to KainBain. The engine normalizes events but does not cryptographically attribute raw harness output.
- There is no observed per-stage attestation proving that results were algorithmically derived rather than submitted by an untrusted process.
- Runner reports are authenticated by runner credential at submission time.
- No stage-level non-repudiation signature from the runner or backend was observed.

Missing data to collect:

- runner-side execution logs and raw event traces;
- submitted completion payloads beyond backend reports;
- comparison between runner-reported model and backend dispatch stamp for all historical stages;
- server clock/runner clock drift and ordering proof.

### 5.4 CI/Test Results and Code Evidence

Observed:

- KainBain has CI stages, command stages, merge stages, review baseline metadata, branch lifecycle, and task diff statistics.
- Stage timelines contain optional commit range SHAs and diff counts.
- Git safety contract tests audit command classifications in a test harness.
- Snapshots and worktree operations are extensively tested.

Audit observations:

- CI result text and test commands can be captured in process logs and reports, but no separate immutable test/evidence record was observed beyond markdown files and process logs.
- Git SHAs appear as `reviewBaseline`, `preMergeMainSha`, and timeline boundary SHAs; these can help bind reports to repository state.
- A diff count badge and commit range in a timeline is not a test result by itself.
- Tests of operational git safety are test-harness behavior and do not form a production run attestation.

Missing data to collect:

- mapping from report/timeline entries to immutable CI artifacts;
- command output retention and preservation after cap eviction;
- git commit hashes corresponding to every stage report and their branches;
- proof of test rerun or failures as independent artifacts.

### 5.5 Human Approval, Review, and Rejection

Observed:

- Human review stages and merge gates exist as stage types.
- Stage history records generic actions with timestamps.
- Review assembly and branch safety APIs are referenced in internal docs and backend files.
- Kanban transitions and board UIs are part of the platform.
- Merge stages baseline main SHAs and track merge attempts.

Audit observations:

- No human identity attribute was present on review, approval, rejection, or survey events.
- No signature or claim of authority is persisted.
- Human actions are represented by timestamped text lines, which are mutable on next save.
- Key management for approvals (buyer-held, platform-held, per-runner, or global) is not implemented or configured; survey q4 (key ownership) answer is blank.
- Review rejection reason and fix guidance are stored as stage output text, not as structured decision metadata, unless they remain in the report.

Missing data to collect:

- who approved or rejected, by what basis, at and around which time, and in which role;
- project, organization, and branch context;
- whether approvals can be retrospectively altered;
- frontend-reviewed UI audit log separate from task files.

### 5.6 Audit History, Retention, and Immutability

Observed positive features:

- `recordHistory` preserves meaningful changes and deduplicates rapid duplicates.
- Reports are timestamped and organized per task.
- process/timeline records include timestamps.
- Git provides repository-level object hashing.
- Sync from disk (`syncTaskReports`) supports redeployment and recovery of reports.

Audit observations:

- History cap: 150 records; oldest after first are evicted without an audit-visible marker except from task markdown contents.
- Log cap: 500 entries with an eviction marker; early logs can be omitted.
- Report and task markdown can be overwritten during normal saves (atomic write) and re-synced/repaired.
- No hash chain over records, no external root of trust, no append-only store, and no WORM mode were observed.
- Timestamps originate from Node Date (system clock) and are not cryptographically time-stamped or externally anchored.
- No Merkle proof, certificate transparency log, or signed bundle was observed.
- No retention schedule or erasure tooling is inherent; legacy data remains unless manually removed.

Missing data to collect:

- operating system clock provenance and under-the-host drift;
- filesystem-level append-only or object-stores in deployment;
- backup history and retained prior copies;
- all modifications to task reports or task markdown by non-KainBain tools.

### 5.7 Model Identity, Discovery, and Reliability

Observed:

- Model keys can be `harness::provider::id`, `provider::id`, or bare ID/name.
- Shared grammar is implemented to avoid parser divergence.
- Model aliases map named aliases to weighted harness/model targets.
- Snapshot-based runtime discovery and fallback models provide an always-nonempty list.
- Reliability summaries aggregate clean/infrastructure outcomes.
- Stage model designation and report attribution are connected via specific selection paths.
- Stricter runnable-model check is opt-in through `KAINBAIN_STRICT_MODEL_RUNNABLE`.

Audit observations:

- Runtime availability is dynamic; different deployments can serve different models despite identical configuration.
- Fallback models can mask absent discovery, although credential-aware badges reduce silent readiness.
- Model alias rotation is per-process and statistical across processes, not exact.
- A previously observed “placeholder” public update key must be rotated before a real release; commit `ae17552` indicates a rotation was intended, but the worktree copy still contains a key that is marked as a placeholder (see §10).
- Model dispatch warnings may be only logs, not blocking, unless strict mode is enabled.

Missing data to collect:

- model catalogs actually served in production;
- auth status per provider over time;
- alias rotation counters and target histories;
- model refusal, timeout, and infrastructure distributions per project.

### 5.8 Runner Authentication and Attribution

Observed:

- Runner registration requires join token.
- Runner states include pending, approved, denied, revoked.
- Credential rotation occurs on approval; old credentials invalidated.
- Runner heartbeats refresh capabilities and versions.
- Runners carry versions and permitted tiers per policy.
- Report metadata can carry `runnerId`, harness, failure kind, alias, and model.
- Stage dispatch attribution stamps model/runner onto arrival rows and completion paths, with tests observed.
- Unauthenticated runner API calls are rejected as part of R04 tests.

Audit observations:

- Runner ledger durability is implemented in phases; some ledger durability assumptions are noted as future work (e.g. Phase 4 referenced in comments), though persistence is present.
- Embedded runs (backend-local runs) do not carry a runner ID.
- Human operators are not represented in runner authorization flows except through approving or denying runner registrations.
- Report submission by runner is not signed per report; proof rests on credential-bearing ingestion and dispatch data.
- One identity appearing from many origins is documented as a security concern requiring alerting, but implementation of this alert is partially documented as not yet available.

Missing data to collect:

- all runner registrations/approvals/revocations;
- heartbeat policy snapshots over time;
- pending and active leases;
- post-revocation report timing and attribution;
- server versus runner clock synchronization.

### 5.9 Redaction, Secret, and PII Handling

Observed:

- `shared/redactSecrets.js` is a shared choke point across log surfaces.
- `SECRET_KEY_PATTERN` and `redactDeepStrings` redact nested structured payloads by key and by regex shape.
- Process log entries are redacted at synthesis time.
- Child environment variables with secret-shaped names are dropped.
- Redaction is invariant across the runner bundle and backend.

Audit observations:

- Redaction is regex/shape-based and cannot prove exhaustively that all secrets or PII are caught.
- Some text (for example, generated report output blocks) may be persisted before any redaction function has been applied in that path; a direct regex scan of `generateStageReportContent` does not show `redactSecretsText`.
- Redaction markers indicate type but may leave structural clues such as scheme or path family.
- User task data includes prompts, code, logs, filenames, URLs, and image references; privacy classification and consent data cannot be inferred from the codebase.
- Redaction is a preventive control, not an audit attestation or access-control policy.

Missing data to collect:

- all raw persisted session JSONL, report content, and task markdown examples;
- actual PII/secets present in those data sources;
- deployed logging and monitoring level;
- any tenant/operator-approved redaction policy.

### 5.10 Authentication, Authorization, and Tenancy

Observed:

- The Fastify app registers status, deploy, project, task, file, workflow, agent, review, runner, and WebSocket routes in `api/index.js`.
- `api/cors.js` allows origin-less and loopback requests and configured origins.
- The frontend has no sign-in flow in the API auth sense according to production-readiness documents.
- Runners have their own join token and credential authentication.
- Runner settings and host controls can scope projects/tools.

Audit observations:

- No authorization framework for human users/API callers was observed in backend route registration.
- If multiple users, teams, or tenants exist, the backend does not appear designed to isolate them or track ownership.
- Endpoint access is assumed within the deployment trust zone.
- Public API documentation is served at `/documentation`.
- WebSocket routes authenticate by session/project context in application logic, but no user-principal authentication is present.

Missing data to collect:

- deployment topology, ingress controls, TLS, reverse proxy users, OS service users;
- whether API is ever exposed beyond trust zone in practice;
- reverse proxy rules and network segmentation or VPN;
- existing user-level identity providers in infrastructure that are outside this codebase.

### 5.11 Data Residency, Egress, and Model Providers

Observed:

- Model harnesses can use local commands and external providers (Ollama cloud, LiteLLM, harness SDKs) depending on config.
- Provider auth state is surfaced and model discovery exposed.
- Deep links to provider-specific credentials are required inside harness runtime environments.
- No per-project data-residency or egress switch was observed in config schema.

Audit observations:

- Prompts, code, and logs can leave the local environment when remote models are used.
- There is no observed classification, routing policy, egress firewall, or signed transit receipt for data crossing provider boundaries.
- Model provider capabilities and health are dynamically reported, but data destination/retention terms are not captured.
- Transfer<Location, third-party and key mechanisms) are outside KainBain's code-level control based on visible files.

Missing data to collect:

- model endpoints and jurisdictions actually used by each deployment;
- contractual/SCC/DPF documentation for providers;
- provider-side logging and retention policies;
- data-processing agreements and data catalog.

### 5.12 Retention, Backup, Erasure, and Export

Observed:

- Existing operational report identifies project configuration (`projects/*/.kainbain/project.json`) was not backed up in that environment.
- Task reports under SilverBullet space are backed up hourly via git-backup.
- No off-host backup existed in that environment.
- Session TTL cleans up idle in-memory/live sessions but not persisted JSONL files.
- Log arrays are capped only in memory/disk task file.
- Task files remain indefinitely.

Audit observations:

- There is no observed machine-readable lifecycle for task artifacts, session transcripts, or logs tied to retention.
- No erasure or deletion API was observed in task/project route scan results at this distinction; only DELETE for projects/workflows is mentioned in research notes.
- Reports remain on disk as standard files unless removed by an external process.
- Exports are not unified into a signed bundle; individual markdown and JSON files constitute a bundle through manual filesystem operations.
- No consent, tenant, or data subject registry is observed.

Missing data to collect:

- deployed backup logs and backup provenance;
- actual disk usage history;
- data deletion and purge requests;
- archive systems integrated with project deployments.
- whether production uses Git remote sync for docs space.

### 5.13 Supply Chain, Update Security, Deployment, and Software Integrity

Observed positive controls:

- Runner update manifests and assets support minisign signatures and SHA-256 checks; verification order is signature → schema → SHA.
- Signing public key is stated to be compiled into the runner source and not network fetched.
- Security scans script includes Trivy, Semgrep, SBOM upload to SecObserve, and idempotent reporting.
- CycloneDX SBOM and deployment hardening are documented.
- Deploy script includes `.prev`, release archive, health gate, and automatic rollback.
- Update asset download follows verification before extraction/install (observed code).

Audit observations:

- The runner update public key is visibly marked as an initial placeholder; rotation correctness depends on a successful release signature and key-pin update, not yet verifiable from this checkout.
- No SLSA provenance or builder attestation beyond update package signatures was observed.
- Health scans are run and uploaded (or skipped), but they do not sign stage artifacts.
- Deploy hardening protects operational runtime but does not create an auditable change-approval chain.
- GitHub Actions secrets workflow is referenced but not visible in this worktree (e.g., actual workflows may exist in `.github` but content not thoroughly reviewed here).

Missing data to collect:

- CI/release workflow definitions and signed release logs;
- deployment approval and promotion record;
- sbom provenance and all ecosystem package lock files;
- vulnerability history and remediation records;
- actual update key after rotation and key numbers in use.

### 5.14 Accessibility and Human-Readability of Audit Data

Observed:

- Accessibility scans, statement, and audit registers are referenced.
- One moderate WCAG `region` landmark issue is documented in production readiness material.
- Reports are markdown and easy for humans to read.
- Frontend has task views, reports, logs, board, and health widgets.

Audit observations:

- Human-readable reports do not offer independent proof of cryptographic integrity.
- If tasks are loaded/changed in the frontend, modifications are indirectly persisted through API writes; no watcher is documented.
- Accessibility affects usability of audit review but not its trust properties per se.
- Export of audit data is filesystem-centric; no generated formal report/index is observed.

---

## 6. Observed Test and Assurance Coverage

The codebase itself contains a significant test ecosystem, which is a positive quality signal, though generally tests test behavior rather than audit assurance.

Representative coverage areas observed:

- agent execution contract, verdict fail-open behavior, stage resolution, stage target session;
- model key and alias behavior;
- harness boundary and session contract;
- runner dispatch/attribution and runner R04 auth rejection;
- report generation/save/sync functions;
- log entry and feed rendering;
- human git-safety contract and argv audit (integration tests);
- task lifecycle branches and task persistence;
- security reference and deprecation audit infrastructure.

Audit observations:

- Tests establish functional behavior and regressions, but no test suite appears to assert cryptographic immutability, audit-chain completeness, actor attribution, append-only invariants or irreversible approval signatures.
- A git-history test protects store-to-state agreement, but not external tamper.
- Test-only git wrappers generate audit data for testing and do not function in production.
- No end-to-end auditor tooling or evidence export format was observed.

Missing data to collect:

- actual test command outputs from this exact tip;
- coverage percentage trend over time;
- security scan baseline history;
- test artifact archival location;
- whether test artifacts are considered production evidence.

---

## 7. Threat Mapping for Auditability

The threat themes below are drawn from existing internal risk sections and compliance research. They are repeated here because they directly threaten trusted audit history.

| Threat | Observed evidence | Auditability implication |
| :--- | :--- | :--- |
| Compromised backend or prompt-injection from repository/task content causing code execution on runners | `RiskAssessment.md`, runner spawn controls, YOLO default behavior | Audit artifacts can be influenced or fabricated by an attacker who compromises backend or task inputs; report authenticity relies on backend integrity |
| Rogue or compromised runner returning false results | Runner credential, dispatch stamp, report metadata | Backend can attribute runner but cannot independently prove execution unless re-run |
| Agent hallucinated claims about work performed | Verdict gating, output text, changed files list, timeline diff statistics | Reports include raw output and files modified, but no automatic proof the summary corresponds to committed diffs |
| Malicious insider altering history after the fact | Task markdown mutable files, caps, replacements | File and report history can be modified; detections require external git or backup comparison, not native controls |
| Backend tampering or log loss | CORS, absence of user auth, potential API surface | Any caller with path access could potentially alter tasks/artifacts; network trust zone becomes the security boundary |
| Auto-approving agent actions by default | YOLO/auto-approve defaults, sandbox posture | Legal and compliance human-oversight obligations and audit expectations over actual authorization of machine actions |
| Third-country provider egress | Ollama Cloud/LiteLLM/API key dependent discovery | Audit-relevant data can exit jurisdiction; no per-project control or attestation |
| Indefinite retention | No general lifecycle or deletion tools | Storage-limitation conflicts; impossible erasure handling; increased breach exposure |
| Broken/manual signing keys | Update signing implementation and key placeholder | Update authenticity cannot be trusted until correct key provisioning is delivered |

---

## 8. Data Handling and PII Exposure Relevant to Audit Trust

### 8.1 Data types persisted in audit-relevant artifacts

The audit surface includes potentially:

- task goals, surveys, and chat-like text;
- agent generated reports;
- tool call transcripts;
- command and git output;
- model names and provider information;
- runner IDs and host/capability details;
- file paths, branch names, commit SHAs;
- redacted secret shapes, emails, home paths, phone numbers, and cards;
- uploaded task image references;
- deploy statuses and crash/recovery actions.

Audit observations:

- `shared/redactSecrets.js` redacts a deliberately broad set of secret and PII shapes before some log text is stored.
- Redaction is not equivalent to data classification, access control, minimal retention, nor a defined set of processing purposes.
- Redaction markers in text can preserve categories and operational clues.
- RBAC/tenant isolation and authentication are not present in core backend.
- The frontend and backend logs can expose different surfaces depending on state.

Missing data to collect:

- actual retained records and project sensitivity classification;
- consent, legal basis, and purpose for storing long-lived logs;
- provider transfer mechanisms;
- vulnerability and incident history linked to personal data.

---

## 9. Observed Evidence Map to What "Trusted Audit History" Would Need

Using the audit table from `FRAMEWORKS.md`, this section states the current presence/absence of each evidence property within KainBain.

| Evidence requirement | Current status | Where observed | What is missing/unknown |
| :--- | :--- | :--- | :--- |
| User request / intent record | Partially present | task goal, survey JSON, report title | Principal identity, signature, immutable version, timestamp source proof |
| Intent → plan → code chain of custody | Present as workflow sequencing and reports | task timeline, reports, model metadata | Cryptographic linkage, prompt hash, plan version, author attribution |
| AI model identity/version | Present with runtime variability | model key grammar, aliases, ref fields | Runtime cache snapshots, exact model binaries and provider routing proof |
| Prompt exactly used | Not observed | Prompt curation engine, skills injection docs | Stored effective prompt hash or full prompt in report |
| Agent output and accepted changes | Present | report output block, modified files, diff stats | Independent output-diff binding; attestation |
| CI/test pass-fail tied to code SHA | Partial | timeline SHA fields, reports | Test artifact schema, rerun provenance, commit-bound test evidence |
| Human sign-off | Partial text-only | review stages, history lines | Principal identity, role, signature, normalized approval decision |
| Runner/trusted builder attestation | Partial | runnerId, dispatch stamp | Per-report signed statement from runner; key ceremony and rotation history |
| Append-only, immutable history | Absent/native mutable | markdown writes and caps | Hash chain, transparent log, external anchoring |
| Retention/export bundle | Absent as formal bundle | docs tasks folder, markdown | Retention policy, erase, signed export, archive inventory |
| Security scan/deployment provenance | Partial | Security script, deploy logs, SBOM docs | Signed release and scan evidence; CI/host integration proof |

---

## 10. Explicitly Missing or Unverified Data

This section lists evidence that this audit deliberately did **not** claim was present. It defines the collection gap for any follow-on peer review.

### 10.1 Unverified because code path only documented, not inspected deeply enough

1. Actual contents and schemas of on-disk session JSONL files.
2. PromptCurationEngine exact prompt template and their version control state.
3. Skill file contents and injected text safety.
4. All route-level request schema/contracts and mutation endpoints.
5. Whether report output blocks are redacted at their writing site.
6. Actual cron and systemd configurations in the assessed deployment.
7. CI workflow files and SLSA provenance fields.
8. Audit log storage selection (disk, git remote) in production.
9. `runner/updates` update manifest key rotation state (code says placeholder, but release metadata may indicate otherwise).
10. Frontend UI behavior around approval, merge, and canary checks.
11. `deploy.sh`, runtime version archive, and log rotation details beyond operational summary.
12. `docsPath.js` exact docs task resolution and path security.

### 10.2 Missing on design level (not observed in code)

1. Cryptographic public-key hierarchy or session/token signing.
2. Human user principal model, scoped authorization, or role registry.
3. Tenant boundary and segregation model.
4. WORM/append-only ledger or hash-chain.
5. Report signing bundle or in-toto attestations.
6. Third-party verifiable transparency log.
7. Formal retention/erasure tool and schedules.
8. PII/secrets classification taxonomy.
9. Data residency and routing control.
10. Export API or signed bundle generator.
11. Least-privilege model approval for agent actions.
12. First-class audit viewer that checks integrity of linked git commits.

### 10.3 Survey data gap (INTENT-SURVEY answers not recorded)

The `INTENT-SURVEY.md` survey JSON contains an `answers` object that is empty in this task's copy:

```json
"answers": {}
```

As a result, the compliance framework selection, required audit events, tamper-resilience choice, signing key ownership, first threat, deliverable expectation, human sign-off locations, and retention/export expectation are not available as recorded inputs to this audit. This is itself a material audit-data gap. In future stages, survey answers should be explicitly captured and linked to the stage report before assessment proceeds.

---

## 11. Source References

- `FRAMEWORKS.md`
- `INTENT-SURVEY.md`
- `task-spec-20261106-184516.md`
- `docs/KB Architecture.md`
- `docs/PRODUCTION_READINESS_REPORT.md`
- `docs/PORTABLE_DEPLOYMENT.md`
- `docs/research/compliance-uk-eu/compliance-uk-eu-00-executive-summary.md`
- `docs/research/compliance-uk-eu/compliance-uk-eu-02-gap-analysis.md`
- `docs/research/compliance-uk-eu/compliance-uk-eu-04-conflicts-and-tensions.md`
- `docs/research/finetune-data-flywheel/01-human-grader-signals-in-kainbain.md`
- `docs/MuseCodeHackathon2026/Strengths-Weaknesses-Deep-Dive.md` and `docs/MuseCodeHackathon2026/YOLO-Plan.md`
- `api/index.js`
- `api/cors.js`
- `api/sessionStore.js`
- `api/work/taskPersistence.js`
- `api/watch/stageReports.js`
- `api/watch/processLogs.js`
- `shared/redactSecrets.js`
- `shared/modelKeys.js`
- `shared/modelAliases.js`
- `api/models.js`
- `api/flow/runnerRegistry.js`
- `api/flow/runAttribution.js`
- `api/config/schema.js`
- `runner/updates/verify.js`

---

## 12. Auditor Conclusion

KainBain has unusually strong **process structure and operational evidence** for an early-stage AI orchestration tool: fresh per-stage sessions, report-per-stage, model identity, prompt curation, redaction choke points, runner credentials, timeline/diff attribution, stage history, git safety contract tests, and update verification infrastructure. It is materially closer to an auditable workflow engine than a chat transcript.

The central weakness is **trust as evidence**: most audit records are ordinary mutable files generated by a single backend and lack actor identity, cryptographic immutability, append-only enforcement, signed runner reports, per-report provenance, robust retention/erasure/export, tenant authorization, and independently anchored timestamps. The compliance research already identifies these as blocking for regulated organizational use. The existing framework maps can be satisfied by hardening and evidencing these gaps, not merely by keeping more logs.

The most useful next collection for peer review would be live runtime provenance (session JSONL, routing records, backup logs, release workflows, provider maps, and authorization context), because the source tree alone cannot establish how the deployed system is actually operated.

---

KAINBAIN_VERDICT: PASS