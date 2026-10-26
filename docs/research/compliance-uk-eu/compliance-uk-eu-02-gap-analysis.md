# KainBain Compliance Gap Analysis (UK/EU, as of 24 October 2026)

Companion to [00 Executive summary](./compliance-uk-eu-00-executive-summary.md) and [01 Legal landscape](./compliance-uk-eu-01-legal-landscape.md). Method: each KainBain subsystem (verified in the repo) is mapped to the obligations it touches, the current state, the gap, and a severity. Severity: **Critical** = blocks any UK/EU sale or regulated-customer use; **High** = legal breach likely in normal use; **Medium** = needed for conformity evidence / customer procurement; **Low** = good practice.

Repo facts verified during this research: no auth middleware in `api/index.js`; CORS allows origin-less + loopback by default (`api/cors.js`); sessions persisted as JSONL transcripts in `.kainbain/sessions/` with TTL sweep for idle *live* sessions only (`api/sessionStore.js`); `DELETE` routes exist only for projects/workflows (`api/routes/projects.js`); documented defaults `KAINBAIN_VIBE_AUTO_APPROVE=true`, `KAINBAIN_MUSE_YOLO=1`, `KAINBAIN_MUSE_APPROVAL_MODE=never` (README env table); default models are `ollama-cloud`/LiteLLM endpoints plus harness-embedded SDKs (`api/models.js`, `api/node_modules/@earendil-works/pi-coding-agent`); `Security_scans.sh` runs Trivy + Semgrep + SBOM + SecObserve; `sbom.cyclonedx.json` is a one-off repo-root artefact; `deploy.sh` has health-check gate + auto-rollback + durable checkpoints; observability = `api/observability/alerts.js` + `webhookNotifier.js`; `api/agent/logStream/`; `api/taskDurationSummary.js`; accessibility docs in `docs/accessibility/`.

## Summary heat table

| # | Subsystem | Obligations touched | Severity |
| --- | --- | --- | --- |
| G1 | API authentication/authorisation | GDPR Art. 32; CRA Annex I; NIS2/CS&R supply chain; DORA Art. 28 | **Critical** |
| G2 | Agent execution defaults (auto-approve/yolo) | AI Act Art. 14/26; UK GDPR ADM safeguards (DUAA); ICO monitoring-workers; Annex III 4(b) tripwire | **Critical** |
| G3 | Session/log retention & erasure | GDPR Art. 5(1)(c)/(e), 17, 25; AI Act Art. 12 (counter-pressure) | **High** |
| G4 | Model-provider egress / transfers | GDPR Chapter V (SCCs/TIA/DPF); CLOUD Act; EDPB 28/2024 | **High** |
| G5 | Secrets & PII in prompts/logs | GDPR Art. 32, 5(1)(c); DPA 2018 Sch. 1; CRA Annex I | **High** |
| G6 | Transparency to users (AI disclosure, marking) | AI Act Art. 50(1)/(2)/(4); UK AI-labelling taskforce | **High** |
| G7 | CRA product-security evidence pack | CRA Arts. 13–14, Annex I, Art. 64; reporting live since 11 Sep 2026 | **High** |
| G8 | Incident reporting with legal clocks | CRA Art. 14 (24h/72h/1mo); NIS2 (24h/72h/1mo); AI Act Art. 73 (15d/2d); GDPR Art. 33 (72h) | **High** |
| G9 | Worker analytics (task durations, verdicts) | ICO monitoring-workers; DUAA ADM; AI Act Annex III 4(b); Platform Work Directive Art. 10 | **Medium** |
| G10 | Accessibility conformance | EAA (EN 301 549/WCAG 2.2); PSBAR 2018; Equality Act 2010 | **Medium** |
| G11 | AI-generated code IP hygiene | CDPA 1988 (s. 9(3) CGW, in flux); EU human-authorship; licence contamination; PLD 2024/2853 | **Medium** |
| G12 | Management-system certification | ISO/IEC 42001, 27701, 27001; EN 18286; NIST AI RMF | **Medium** |
| G13 | Records/DPIA/FRIA/TIA tooling | GDPR Art. 30/35; AI Act Art. 27; EDPB 06/2020 | **Medium** |
| G14 | Processor terms & subcontracting | GDPR Art. 28; DORA Art. 28; NIS2 Art. 21 | **Medium** |
| G15 | Privacy notice / cookies / telemetry | GDPR Art. 12/13; PECR; DUAA cookie changes | **Low** |
| G16 | AI literacy evidence | AI Act Art. 4 | **Low** |
| G17 | Data portability/export | Data Act (switching); GDPR Art. 20 | **Low** |
| G18 | Open-source posture decision | AI Act Art. 2(12); CRA open-source steward; GPL hygiene | **Low** |

## G1 — API authentication/authorisation — Critical

**Current:** `api/index.js` registers all routes (status, deploy, projects, compute, harnesses, sessions, tasks, workflows, files, taskImages, ws, push) with no authentication or authorisation middleware. CORS (`api/cors.js`) allows origin-less requests (curl/server-to-server) and any loopback origin by default. Anyone who can reach `:3100` can read all projects/sessions/logs, trigger agent runs, and call `deploy` routes.
**Obligations:** GDPR Art. 32 (confidentiality/integrity of processing — sessions contain prompts/code/personal data); UK GDPR same; CRA Annex I (secure by default, access control, minimised attack surface); NIS2 Art. 21 / UK CS&R (supply-chain assurance customers will demand); DORA Art. 28 (audit/access clauses for finance customers).
**Gap:** No authn/authz, no RBAC, no rate limiting evidence, no audit log of API access, no TLS story documented, deploy routes unprotected.
**Fix direction:** token/OIDC auth (see roadmap R1).

## G2 — Agent execution defaults — Critical

**Current:** README documents `KAINBAIN_VIBE_AUTO_APPROVE=true` (default) and `KAINBAIN_MUSE_YOLO=1` (default), `KAINBAIN_MUSE_APPROVAL_MODE=never`. Agent shells run with the user's privileges; sandboxing is harness-dependent.
**Obligations:** EU AI Act Art. 14 (human oversight designed in for high-risk), Art. 26 (deployers must assign oversight); UK GDPR Arts. 22A–22D safeguards (inform, representations, **meaningful human intervention**, contest) when verdicts/routing drive significant decisions; ICO monitoring-workers guidance if analytics feed management; AI Act Annex III 4(b) (task allocation based on individual behaviour; monitoring/evaluating performance) — high-risk from 2 Dec 2027; OWASP Agentic Top 10 (autonomous tool execution).
**Gap:** Defaults are the *opposite* of human-oversight-by-default; no per-stage policy engine distinguishing "advisory" vs "decision" verdicts; no human-approval gate on deploy by default for agent-initiated changes (deploy gates exist in `deploy.sh` but agent task completion doesn't require them).
**Fix direction:** default-deny execution policy, approval gates, oversight config (roadmap R2).

## G3 — Session/log retention & erasure — High

**Current:** `.kainbain/sessions/*.jsonl` hold full transcripts (prompts, tool I/O, file contents) indefinitely; TTL sweep (`api/sessionStore.js` `startCleanup`, `rmSync` at line 719) disposes only idle *live* sessions; no retention schedule, no redaction, no erasure API (DELETE exists only for projects/workflows); deploy checkpoints and git history are append-only.
**Obligations:** GDPR/UK GDPR Art. 5(1)(c) minimisation, 5(1)(e) storage limitation, Art. 17 erasure, Art. 25 by design; **counter-pressure:** AI Act Art. 12 requires logging for high-risk systems — logs are legally required *and* must be proportionate (see doc 04, conflict C3/C4).
**Gap:** No retention config, no erasure tooling, no pseudonymisation/redaction, no legal-hold concept.
**Fix direction:** retention schedules, redaction pipeline, erasure API with audit exception (roadmap R3).

## G4 — Model-provider egress / international transfers — High

**Current:** Models default to `ollama-cloud` (DeepSeek et al.), LiteLLM endpoints, and harness-embedded provider SDKs (Anthropic/OpenAI/Google in pi-coding-agent's node_modules). Prompts + repo context leave the host with no egress control, no per-provider transfer mechanism record, no residency option beyond "point LiteLLM at an EU endpoint".
**Obligations:** GDPR/UK GDPR Chapter V (adequacy — EU–US DPF upheld at first instance in Latombe, appeal risk remains; UK–US Data Bridge for UK→US; otherwise SCCs + **TIA** + supplementary measures per EDPB 06/2020); CLOUD Act conflict (US providers can be compelled) → supplementary measures (E2E encryption, EU-hosted proxies); EDPB Opinion 28/2024 (legitimate-interest balancing for AI deployment; consequences of unlawfully trained models); DUAA new transfer test for UK→third-country.
**Gap:** No transfer-mechanism registry, no TIA artefacts, no residency/egress allowlist, no customer-configurable "EU-only" mode.
**Fix direction:** provider registry with transfer basis + residency + DPF status; egress allowlist; EU-proxy mode (roadmap R4).

## G5 — Secrets & PII in prompts/logs — High

**Current:** API keys in `.env`; session JSONL capture everything the agent sees (file contents, env snippets, user prompts); no redaction or secret-scanning on log write; `Security_scans.sh` scans the repo, not the session data.
**Obligations:** GDPR Art. 32 (security), Art. 5(1)(c); DPA 2018; CRA Annex I (no credentials in product, secure defaults); NIS2/CS&R incident triggers — a leaked secret in a log is a reportable incident.
**Gap:** No secret/PII redaction on transcript write; no at-rest encryption option for `.kainbain/`; logs shipped to SecObserve may carry secrets.
**Fix direction:** redaction pipeline + optional at-rest encryption + secret scanning of logs (roadmap R3/R5).

## G6 — Transparency to users — High

**Current:** UI gives no indication that stages are AI-executed; no marking/labelling of AI-generated artefacts (commit messages, PR text, docs, code); no "AI disclosure" in first-run flow.
**Obligations:** AI Act Art. 50(1) (in force since 2 Aug 2026; Commission guidelines confirm AI agents in scope) — users interacting with the system must be informed it's AI; Art. 50(2) machine-readable marking of synthetic content (transition ends 2 Dec 2026; watermarking applies from 2 Dec 2026); Art. 50(4) labelling of AI text on public-interest matters; UK AI-labelling taskforce (interim report autumn 2026) — expect UK convergence; C2PA/content-credentials as the emerging technical standard.
**Gap:** No disclosure UI, no provenance/marking metadata on generated artefacts.
**Fix direction:** AI-interaction disclosure banner + per-artefact provenance metadata (C2PA) + generated-content labelling (roadmap R6).

## G7 — CRA product-security evidence pack — High

**Current assets:** `sbom.cyclonedx.json` (one-off), `Security_scans.sh` (Trivy/Semgrep/SBOM/SecObserve), deploy health-gate + auto-rollback, dependency floor test (`api/dependencySecurityFloor.test.js`), Docker hardening in `Dockerfile`.
**Obligations:** CRA (Reg. (EU) 2024/2847): reporting duties **live since 11 Sep 2026**; main obligations 11 Dec 2027 — Annex I (secure by design, no known exploitable vulns, vulnerability handling, updates for support period [default 5y], SBOM), Arts. 13–14 manufacturer duties, technical documentation 10 years, conformity assessment + CE marking, EU economic operator if non-EU; fines €15m/2.5%.
**Gap:** No VDP/security.txt/CVE process; SBOM not generated per release in CI; no support-period/update policy; no technical-documentation pack; no conformity route decision; no ENISA/CSIRT reporting procedure; no signed provenance (SLSA).
**Fix direction:** CRA evidence pack (roadmap R5).

## G8 — Incident reporting with legal clocks — High

**Current:** `api/observability/alerts.js` + `webhookNotifier.js` (engine alerts); `deploy.sh` auto-rollback; runbooks exist for deploy/git issues (`docs/circuit-breaker-runbook.md`, `docs/git-index-lock-runbook.md`) but none map to legal reporting clocks.
**Obligations:** CRA Art. 14 (24h early warning / 72h / 1-month final to ENISA+CSIRT — live now); NIS2 Arts. 23 (24h/72h/1mo) for in-scope customers; AI Act Art. 73 (serious incidents: 15 days, 2 days critical infrastructure — from high-risk application); GDPR Art. 33/34 (72h to ICO/DPA); UK CS&R Bill (clocks via secondary legislation); DORA (major ICT incident reporting to financial customers).
**Gap:** No incident-classification (security vs personal-data vs AI-serious vs CRA-reportable), no clock timers, no authority-contact matrix, no customer-notification SLAs.
**Fix direction:** incident taxonomy + clock tooling (roadmap R7).

## G9 — Worker analytics — Medium

**Current:** `api/taskDurationSummary.js` (task durations), session logs, verdict history — rich monitoring surface over the people operating KainBain.
**Obligations:** ICO employment-practices/monitoring-workers guidance (proportionality, transparency, impact assessment; under DUAA review); UK GDPR/DUAA ADM safeguards if analytics feed decisions; AI Act Annex III 4(b) (monitoring/evaluating performance of persons in work relationships = high-risk from 2 Dec 2027); EU Platform Work Directive Art. 10 (if used to manage platform/gig workers: human oversight, transparency, impact assessment; transposition by 2 Dec 2026); works-council/consultation in several EU states.
**Gap:** No worker-facing notice, no proportionality controls, no "advisory-only" mode for verdicts, no DPIA trigger.
**Fix direction:** monitoring guardrails + advisory mode (roadmap R8).

## G10 — Accessibility — Medium

**Current:** `docs/accessibility/` (audit register 2026-08/09/10, statement, contributor checklist); wcag-audit practice exists in the wider toolchain; UI is a dense kanban/board.
**Obligations:** EAA (since 28 Jun 2025; EN 301 549 v3.2.1 now, v4.1.1/WCAG 2.2 cited soon; fines vary by MS; applies to non-EU sellers into EU); UK PSBAR 2018 (WCAG 2.1 AA, public sector); Equality Act 2010.
**Gap:** Conformance status vs EN 301 549 not evidenced; drag-and-drop likely lacks keyboard/AT alternative; no VPAT/ACR artefact; enforcement already active in FR/SE/NL.
**Fix direction:** WCAG 2.2 AA programme + ACR/VPAT (roadmap R9).

## G11 — AI-generated code IP hygiene — Medium

**Current:** No licence scanning of generated code; no provenance metadata; no human-contribution tracking per hunk (git blame + verdicts exist but aren't combined into an IP record).
**Obligations:** Copyright (CDPA 1988; EU InfoSoc) — copyleft (GPL/AGPL) contamination risk in generated code; UK s. 9(3) CGW protection (proposed for removal; today UK-only) vs EU human-authorship (no copyright in AI-only outputs); PLD 2024/2853 (defective software from 9 Dec 2026); Getty v Stability AI appeal pending (training-side risk sits with providers, but output-mirroring claims possible).
**Gap:** No licence-compatibility gate; no AI-origin marking; no authorship log.
**Fix direction:** licence gate + provenance ledger (roadmap R10).

## G12 — Management-system certification — Medium

**Current:** strong engineering hygiene (tests, docs checks, deprecation audits) but no AIMS/PIMS/ISMS framing.
**Obligations/frameworks:** ISO/IEC 42001:2023 (AIMS), ISO/IEC 27701 (PIMS), ISO/IEC 27001:2022 (ISMS), ISO/IEC 27090:2026 (AI security), EN 18286:2026 (Art. 17 QMS presumption), NIST AI RMF + AI 600-1, NIST SSDF, OWASP LLM/Agentic Top 10, NCSC secure-AI guidelines.
**Gap:** No management-system mapping; procurement questionnaires (esp. UK public sector, EU finance/NIS2 customers) will ask.
**Fix direction:** certify 27001+27701, adopt 42001, map EN 18286 (roadmap R11).

## G13 — Records/DPIA/FRIA/TIA tooling — Medium

**Current:** none — no Art. 30 records generator, no DPIA workflow, no FRIA template, no TIA artefacts.
**Obligations:** GDPR Art. 30 (records), Art. 35 (DPIA for systematic AI/monitoring); AI Act Art. 27 (FRIA for in-scope deployers); EDPB 06/2020 (TIAs); ICO DPIA guidance.
**Gap:** Customers must do this by hand; KainBain could ship templates as workflow stages (its natural strength).
**Fix direction:** compliance template library (roadmap R12).

## G14 — Processor terms & subcontracting — Medium

**Current:** no published DPA/processor terms; subprocessor list implicit (model providers, SecObserve, hosting); no subcontracting-change notice mechanism.
**Obligations:** GDPR Art. 28 (processor contracts), Art. 33 breach cooperation; DORA Art. 28 (financial customers); NIS2 Art. 21; UK GDPR mirror.
**Gap:** No Art. 28 terms, no subprocessor registry with notice period.
**Fix direction:** DPA + subprocessor registry (roadmap R13).

## G15 — Privacy notice / cookies / telemetry — Low

**Current:** frontend uses localStorage (prefs/drafts); no cookie banner needed if no non-essential cookies — verify; no privacy notice found in site-docs; pi-coding-agent ships its own telemetry module (`pi-agent-core/harness/telemetry.js`) — check its default and disable/document.
**Obligations:** GDPR Art. 12/13; PECR (as amended by DUAA); transparency.
**Fix direction:** privacy notice, telemetry audit + opt-out (roadmap R14).

## G16 — AI literacy evidence — Low

**Current:** none.
**Obligations:** AI Act Art. 4 (since 2 Feb 2025) — deployers must ensure AI literacy of staff operating AI systems; UK sector regulators expect training evidence.
**Fix direction:** literacy attestation stage + records (roadmap R15).

## G17 — Data portability/export — Low

**Current:** JSONL on disk is portable in practice; API export endpoints partial.
**Obligations:** Data Act switching/portability; GDPR Art. 20.
**Fix direction:** full export API + documented formats (roadmap R16).

## G18 — Open-source posture — Low

**Current:** `package.json` `"private": true`; distributed as a repo/docker image.
**Obligations:** AI Act Art. 2(12) open-source exemption (not for high-risk/prohibited/systemic-risk GPAI); CRA open-source steward regime (lighter duties for non-commercial OSS); licence hygiene for the codebase itself.
**Fix direction:** decide and document the distribution posture; if OSS, publish VDP + security policy (roadmap R17).
