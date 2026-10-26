# Roadmap — Making KainBain the Most Legally Compliant Code Harness (UK/EU)

Companion to [00 Executive summary](./compliance-uk-eu-00-executive-summary.md), [01 Legal landscape](./compliance-uk-eu-01-legal-landscape.md), [02 Gap analysis](./compliance-uk-eu-02-gap-analysis.md). Items are numbered R1–R17, grouped P0 (before any UK/EU sale or regulated-customer pilot), P1 (next quarter), P2 (this year). Each item names the legal driver, the KainBain surface it lands on, and acceptance criteria. Gap references (G#) point into doc 02.

## Design principles

1. **Compliance by default, override by record.** Defaults must be the legally safe configuration (auth on, approvals required, egress restricted); every deviation is an explicit, logged, expiring decision. This inverts today's `KAINBAIN_VIBE_AUTO_APPROVE=true` / `KAINBAIN_MUSE_YOLO=1` defaults (G2).
2. **Evidence as an artefact.** Every legal duty that is procedural (oversight, assessments, logging, reporting) should produce a timestamped, exportable artefact from normal operation — AI Act Art. 12 logs, GDPR Art. 30 records, CRA technical documentation, DPIA/FRIA/TIA packs.
3. **Gates are the product.** KainBain already gates deploys (`deploy.sh` health gate + auto-rollback). Extend the same gate primitive to compliance checks: licence scan, accessibility check, secret/PII scan, SBOM freshness, transfer-mechanism validity, approval completeness.
4. **Least-privilege egress.** Prompts/code leave the host only to providers with a recorded transfer basis, and only after redaction.
5. **Divergence-aware.** UK and EU now differ on ADM (DUAA vs Art. 22 + AI Act) and CGW copyright. Ship a `JURISDICTION` config (uk / eu / uk+eu-strict) that selects the stricter rule set where they diverge.
6. **Advisory by default for people.** Verdicts about *tasks* can be automated; verdicts that feed decisions about *people* (allocation, performance) must be advisory-only with a human decision point (AI Act Annex III 4(b); DUAA Arts. 22A–22D safeguards).

---

## P0 — ship before any UK/EU sale or regulated-customer pilot

### R1 — Authentication, authorisation, RBAC on the API (G1)
- **What:** OIDC or token auth on every route in `api/index.js` (incl. WebSocket `ws` and `deploy`); roles (viewer / operator / admin / compliance-officer); per-project scoping; rate limiting; access audit log.
- **Legal driver:** GDPR/UK GDPR Art. 32; CRA Annex I; NIS2 Art. 21 / UK CS&R supply chain; DORA Art. 28 (finance customers).
- **Where:** `api/index.js` (preHandler hook), `api/cors.js` (remove origin-less allowance when auth is on), `api/config.js` (new `KAINBAIN_AUTH_*` env), `api/routes/*`.
- **Acceptance:** default config refuses unauthenticated requests; `npm run test:api` auth test suite green; deploy routes require admin; audit log written per request.

### R2 — Human-oversight-by-default execution policy (G2)
- **What:** Replace auto-approve defaults: `KAINBAIN_VIBE_AUTO_APPROVE` default `false`; remove `yolo` as default for Muse; introduce an execution-policy object per project: `{ mode: "supervised" | "assisted" | "autonomous" }` with `autonomous` requiring an explicit per-project, time-boxed, reasoned override. Sandbox enforcement per harness (pi/opencode/vibe/muse) with a policy check before shell/network/file-write tool classes. Every approval/override recorded with identity + reason.
- **Legal driver:** AI Act Art. 14/26 (human oversight); DUAA Arts. 22A–22D safeguards (human intervention, contest); ICO monitoring-workers guidance; OWASP Agentic Top 10 (2026); Annex III 4(b) tripwire.
- **Where:** `api/agent/harnesses/*`, `api/agentRunner.js`, `api/config.js`, README env table, `api/agent/sessionEvents.js` (oversight events).
- **Acceptance:** fresh clone boots with approvals required; override is logged and expires; `autonomous` mode emits a warning banner + compliance log entry; tests cover policy enforcement per harness.

### R3 — Retention, redaction, erasure for sessions/logs (G3, G5)
- **What:** Configurable retention per data class (`KAINBAIN_RETENTION_SESSIONS_DAYS`, `..._LOGS_DAYS`, `..._DEPLOY_CHECKPOINTS_DAYS`); scheduled pruning with a manifest of what was deleted; redaction pipeline on transcript write (secrets via regex+entropy, emails, IPs, file paths outside workspace flagged); optional at-rest encryption for `.kainbain/`; erasure API (`DELETE /projects/:id/data`, `DELETE /sessions/:id`) with a narrow, documented audit-exception (integrity hash retained, content destroyed); legal-hold flag that suspends pruning.
- **Legal driver:** GDPR/UK GDPR Art. 5(1)(c)/(e), 17, 25; counter-pressure AI Act Art. 12 (logging) resolved via proportionate retention + redaction (doc 04, C3/C4).
- **Where:** `api/sessionStore.js`, `api/agent/logStream/*`, `api/kainbainDir.js`, `api/routes/sessions.js` (new DELETE), `api/config.js`.
- **Acceptance:** retention config enforced by a sweep test; erasure removes content and is verifiable; audit-exception stores hash only; redaction test suite covers secret patterns.

### R4 — Transfer-mechanism registry & egress control (G4)
- **What:** A provider registry (per model/harness endpoint): `{ provider, jurisdiction, transfer_basis: "EU-adequacy"|"UK-adequacy"|"DPF"|"UK-US-Data-Bridge"|"SCCs+TIA", tia_ref, dpf_cert_verified, residency, subprocessors }`. Egress allowlist enforced before agent runs; `KAINBAIN_EGRESS_MODE=eu-only` blocks non-EU endpoints; a first-run banner records the operator's transfer basis; CLOUD Act note + supplementary-measures checklist (EU-hosted proxy / BYOK / local Ollama) documented per provider.
- **Legal driver:** GDPR/UK GDPR Chapter V; EDPB 06/2020 (TIA); EDPB Opinion 28/2024; DUAA transfer test; EU–US DPF (upheld first instance, Latombe; keep SCC fallback); UK–US Data Bridge.
- **Where:** `api/models.js`, `api/crew/modelDiscovery.js`, `api/config.js`, `api/agent/harnesses/*` (egress check hook), `.env.example`.
- **Acceptance:** a provider without a recorded transfer basis is refused by default; `eu-only` mode test; registry exportable as a TIA annex.

### R5 — CRA product-security evidence pack (G7, G5)
- **What:** Per-release CI pipeline: SBOM (CycloneDX) generated on every build (not a one-off `sbom.cyclonedx.json`), Trivy + Semgrep + `npm audit` gates (extend `Security_scans.sh` into CI), signed provenance (SLSA/in-toto level target), published `SECURITY.md` + `security.txt` + VDP with CVE assignment and coordinated disclosure timelines; documented support period + security-update policy (default 5 years); technical-documentation pack (Annex VII-style) generated from repo docs; decision record for conformity route + CE-marking readiness; EU authorised-representative plan if the maker is non-EU.
- **Legal driver:** CRA Arts. 13–14, Annex I, Art. 64 (reporting live since 11 Sep 2026; main obligations 11 Dec 2027); NIS2 Art. 21 (customer supply-chain evidence); NIST SSDF alignment.
- **Where:** `Security_scans.sh`, `.github/workflows/`, `sbom.cyclonedx.json` (regenerate per release), `deploy.sh`, new `docs/compliance/cra-evidence/`.
- **Acceptance:** `npm run sec` produces SBOM + scan report + provenance per release; VDP page live; support policy published; dry-run ENISA/CSIRT report template (R7).

### R6 — Transparency & provenance UI (G6, G11)
- **What:** Persistent "AI system in use" disclosure in the UI (AI Act Art. 50(1)); per-artefact provenance metadata (model, harness, prompt hash, human verdicts) attached to commits/PRs/docs; machine-readable marking hooks for synthetic content (C2PA/content credentials) on generated text; "AI-generated" labels in UI for generated artefacts; generated-code watermark option where the model supports it.
- **Legal driver:** AI Act Art. 50(1)/(2)/(4) (in force since 2 Aug 2026; marking transition ends 2 Dec 2026); UK AI-labelling taskforce direction; UK CGW/copyright uncertainty (doc 01 §2.4).
- **Where:** `frontend/src` (banner + labels), `api/reviewCommentFormatter.js`, `api/git.js` (commit metadata), `api/agent/logStream/logRecord.js`.
- **Acceptance:** disclosure visible in every AI-executed stage; provenance JSON exportable per task; generated-text artefacts carry labels.

### R7 — Incident taxonomy & legal-clock tooling (G8)
- **What:** Incident classifier mapping events to regimes: `personal-data` (GDPR Art. 33, 72h), `cra-reportable` (actively exploited vuln / severe incident — ENISA+CSIRT 24h/72h/1mo), `ai-serious` (AI Act Art. 73, 15d/2d — for high-risk customers), `nis2-customer` (24h/72h/1mo contract SLA), `dora-customer` (major ICT incident per contract). Per-incident clock timers with owner, authority-contact matrix, and a one-click evidence export (logs + timeline). Wire `api/observability/alerts.js` + `webhookNotifier.js` into the classifier.
- **Legal driver:** CRA Art. 14; NIS2 Art. 23; AI Act Art. 73; GDPR Arts. 33–34; DORA; UK CS&R (pending secondary legislation).
- **Where:** `api/observability/*`, new `api/compliance/incident*`, `docs/compliance/incident-runbook.md`.
- **Acceptance:** simulated incident produces correct per-regime clocks + draft reports; runbook covers each regime.

## P1 — next quarter

### R8 — Worker-monitoring guardrails & advisory mode (G9)
- **What:** `KAINBAIN_WORKER_ANALYTICS_MODE=off|aggregate|individual` (default `aggregate` when multiple users); worker-facing notice template; verdict-type config marking outputs as **advisory** vs **decision**; block verdict types that would constitute ADM about a person unless a human-decision stage + DUAA/Art. 22 safeguard checklist is attached; DPIA trigger when individual-level analytics are enabled.
- **Legal driver:** ICO monitoring-workers guidance; DUAA Arts. 22A–22D; AI Act Annex III 4(b) (from 2 Dec 2027) + Art. 27 FRIA; EU Platform Work Directive Art. 10 (gig/platform use; transposition 2 Dec 2026).
- **Where:** `api/taskDurationSummary.js`, `api/workflowRegistry.js` (stage types), `api/reviewStore.js`, `api/config.js`.
- **Acceptance:** individual mode requires explicit config + generates a DPIA artefact; decision-type verdicts require a human stage.

### R9 — Accessibility conformance programme (G10)
- **What:** Target WCAG 2.2 AA / EN 301 549 v4.1.1 (EAA enforcement live since 28 Jun 2025; v4.1.1 OJ citation expected Nov 2026); keyboard/AT alternatives for kanban drag-and-drop (keyboard reorder, menu-based moves); automated axe checks in canary E2E; publish accessibility statement + VPAT/ACR; keep `docs/accessibility/` audit register current.
- **Legal driver:** EAA (Directive (EU) 2019/882); UK PSBAR 2018 (WCAG 2.1 AA now, 2.2 direction); Equality Act 2010.
- **Where:** `frontend/src/components/` (board), `canary-e2e/tests/`, `docs/accessibility/`.
- **Acceptance:** zero critical axe violations on main screens; ACR published; statement references EN 301 549.

### R10 — Licence & IP hygiene gates (G11)
- **What:** Licence-compatibility scan of AI-generated code against the project's declared licence (flag GPL/AGPL/copyleft echoes); per-hunk provenance ledger (model + human edits via git blame + verdicts); policy hook that can block commits failing licence policy; AI-origin marking in generated files (comment header, configurable).
- **Legal driver:** Copyright (CDPA 1988; InfoSoc Directive) — licence contamination; UK s. 9(3) CGW in flux (removal proposed); EU human-authorship; PLD 2024/2853 (defective software from 9 Dec 2026); Getty appeal watch.
- **Where:** `api/gitGate.test.js` (extend `api/git.js` gate), new `api/compliance/licenceGate.js`, `api/reviewAssembly.js`.
- **Acceptance:** gate blocks a seeded copyleft-licensed snippet in tests; provenance ledger exportable per release.

### R11 — Management-system certification track (G12)
- **What:** ISO/IEC 27001:2022 + ISO/IEC 27701 (PIMS) certification for the operating company; adopt ISO/IEC 42001:2023 (AIMS) as the internal framework; map processes to EN 18286:2026 (Art. 17 QMS presumption) and NIST AI RMF + AI 600-1; AI-specific threat model per ISO/IEC 27090:2026 + MITRE ATLAS + OWASP LLM/Agentic Top 10.
- **Legal driver:** customer procurement (UK public sector: Procurement Act 2023 + Cyber Essentials; EU NIS2/DORA customers); AI Act conformity credibility.
- **Where:** org-level; `docs/compliance/` hosts the AIMS.
- **Acceptance:** stage-1 audit passed; AIMS policy + risk register published internally.

### R12 — Compliance workflow template library (G13) — *the "compliance harness" product*
- **What:** Shipped workflow templates (KainBain's native strength) that customers run as gated stages: **DPIA** (GDPR Art. 35), **FRIA** (AI Act Art. 27), **TIA** (EDPB 06/2020, per provider), **ADM-safeguard checklist** (DUAA Arts. 22A–22D / Art. 22), **AI-literacy attestation** (Art. 4), **Art. 50 disclosure checklist**, **WCAG gate** (R9), **licence gate** (R10), **SBOM/vuln gate** (R5), **human-oversight gate** (R2), **accessibility-of-release gate**. Each template produces a signed, timestamped evidence artefact exportable to the customer's GRC.
- **Legal driver:** all of doc 01; this is how KainBain is *used for* compliance.
- **Where:** `api/workflowRegistry.js` + `api/flow/`, new `skills/compliance/` (skill pack), `site-docs/`.
- **Acceptance:** each template runs end-to-end in canary E2E and emits an evidence file.

### R13 — Processor terms & subprocessor registry (G14)
- **What:** Publish a GDPR Art. 28 DPA (processor terms) + UK GDPR equivalent; subprocessor registry (model providers, SecObserve, hosting, CDNs) with change-notice period; DORA Art. 28 clause pack for financial customers; NIS2/CS&R supplier pack (SBOM, VDP, incident SLAs, penetration-test summaries).
- **Legal driver:** GDPR Art. 28; DORA Art. 28; NIS2 Art. 21; UK CS&R Bill.
- **Where:** `site-docs/legal/`, `docs/compliance/`.
- **Acceptance:** DPA + registry published; supplier pack passes a mock customer security review.

## P2 — this year

### R14 — Privacy notice, telemetry audit, cookie posture (G15)
Publish privacy notice (operator + end-user facing); audit embedded harness telemetry (`pi-agent-core/harness/telemetry.js`) and default it off or document it; confirm no non-essential cookies/trackers in `frontend/` (localStorage only is fine); DUAA-aware cookie/PECR statements.

### R15 — AI-literacy attestation stage (G16)
Per-user AI-literacy attestation workflow (content + date + version) with expiry and reporting — evidence for AI Act Art. 4 and UK customer questionnaires.

### R16 — Full export/portability API (G17)
Documented export of projects/sessions/logs (machine-readable), aligned to Data Act switching expectations and GDPR Art. 20; no proprietary lock-in.

### R17 — Distribution posture & open-source decision (G18)
Decide: commercial SaaS / self-hosted product / open source. If OSS: AI Act Art. 2(12) exemption helps customers but CRA open-source-steward duties and the "not high-risk" limit apply; publish VDP + security policy either way. Record the decision in an ADR (`docs/adr/`).

### R18 — Divergence config & horizon tracking
`JURISDICTION=uk|eu|strict` selects rule sets (ADM: EU = Art. 22 + AI Act posture; UK = DUAA safeguards; CGW marking differs). A living "regulatory watch" doc updated quarterly: UK CS&R secondary legislation (2026–2028), ICO ADM guidance (final), AI-labelling taskforce (autumn 2026), Getty appeal, CEN-CENELEC hENs ahead of 2 Dec 2027, DPF appeal outcome, eIDAS 2.0 wallet milestones.

## Sequencing logic

P0 is ordered by blast radius: R1 (who can touch the system) → R2 (what the AI may do) → R3/R4 (what data persists and where it goes) → R5–R7 (prove and report). P1 turns the harness into a compliance *product* (R12) and clears procurement blockers (R9–R11, R13). P2 hardens the long tail. R2 + R12 together are the differentiator: "the harness whose own gates enforce the customer's legal obligations."
