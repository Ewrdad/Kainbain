# Conflicts & Tensions — Where UK/EU Law Meets KainBain (and Itself), 24 Oct 2026

Companion to [00 Executive summary](./compliance-uk-eu-00-executive-summary.md), [01 Legal landscape](./compliance-uk-eu-01-legal-landscape.md), [02 Gap analysis](./compliance-uk-eu-02-gap-analysis.md), [03 Roadmap](./compliance-uk-eu-03-roadmap.md). Two families: **A. law/standards vs KainBain's current design** (fix the design), and **B. law vs law / law vs standard** (design for the tension; pick the stricter rule where they diverge). None of these are reasons not to proceed; each has a concrete resolution already scoped in the roadmap.

## A. Law/standard vs KainBain's current design

### A1. Human-oversight law vs default auto-approval/yolo (Critical)
- **Law:** EU AI Act Art. 14 (high-risk systems must be designed for effective human oversight) + Art. 26 (deployers must assign oversight); UK GDPR Arts. 22A–22D (DUAA, in force 5 Feb 2026) mandate meaningful human intervention and contest routes for significant ADM; ICO monitoring-workers guidance expects proportionate, transparent oversight of staff.
- **KainBain:** documented defaults `KAINBAIN_VIBE_AUTO_APPROVE=true`, `KAINBAIN_MUSE_YOLO=1`, `KAINBAIN_MUSE_APPROVAL_MODE=never` — the agent acts without a human gate by default.
- **Why it bites:** shipping defaults that make lawful use impossible transfers liability to the supplier (PLD 2024/2853 defective-product reasoning; GDPR Art. 25 by-design). For customers in Annex III 4(b) contexts (task allocation/performance monitoring — high-risk from 2 Dec 2027), the default configuration is non-compliant on day one.
- **Resolution:** R2 — supervised-by-default, time-boxed logged overrides, advisory-only verdicts about people.

### A2. Security law vs an unauthenticated API
- **Law:** GDPR/UK GDPR Art. 32 (appropriate security); CRA Annex I (secure by default, access control); NIS2 Art. 21 / UK CS&R (supply-chain assurance); DORA Art. 28 for finance customers.
- **KainBain:** no authn/authz anywhere in `api/index.js`; CORS permits origin-less and loopback origins by default; deploy routes unprotected.
- **Why it bites:** sessions/logs contain prompts, code, and personal data; an open API is a personal-data breach waiting to happen and an automatic fail in any customer security review.
- **Resolution:** R1 — auth + RBAC + access audit.

### A3. Storage limitation/erasure vs keep-everything transcripts
- **Law:** GDPR/UK GDPR Art. 5(1)(c)/(e) (minimisation, storage limitation) and Art. 17 (erasure).
- **KainBain:** `.kainbain/sessions/*.jsonl` retain full transcripts (prompts, tool I/O, file contents) indefinitely; TTL sweep disposes only idle live sessions; DELETE routes exist only for projects/workflows.
- **Why it bites:** a user who pastes customer personal data into a prompt creates a regulated record with no retention schedule and no erasure path.
- **Resolution:** R3 — retention schedules, redaction, erasure API with a narrow hashed audit exception.

### A4. Erasure vs immutable audit trails (git history, deploy checkpoints, Art. 12 logs)
- **Law:** GDPR Art. 17 vs AI Act Art. 12 (high-risk systems *must* log, with logs retained for oversight/market surveillance) and CRA technical documentation (10 years).
- **KainBain:** append-only git history, durable deploy checkpoints (`KAINBAIN_DEPLOY_ATTEMPT_ID`), verbose session logs.
- **Why it bites:** Art. 17 has no blanket "audit" exception; regulators accept that *integrity* evidence can survive erasure (hashes, counts, pseudonymised events) but not the personal data itself. Rewriting git history is often impractical — so don't put personal data in commits in the first place (redaction at write, R3/R6).
- **Resolution:** separate *content* (erasable) from *integrity evidence* (hash-chained, pseudonymised, retained). Document the legal-hold/erasure interplay.

### A5. GDPR Chapter V / CLOUD Act vs default US model providers
- **Law:** GDPR Chapter V + Schrems II (TIA + supplementary measures); EU–US DPF (upheld at first instance, Latombe T-553/23; CJEU appeal risk remains); UK–US Data Bridge for UK→US; DUAA's new "not materially lower" transfer test.
- **KainBain:** default models are Ollama Cloud/LiteLLM endpoints and US-headquartered provider SDKs; no egress control, no transfer-basis record.
- **Why it bites:** prompts and repo context are routinely personal data or customer IP; CLOUD Act compulsion is a recognised residual risk that a TIA must address (encryption in transit/at rest with keys outside US reach, EU-hosted proxy, or local models).
- **Resolution:** R4 — provider registry with transfer basis, `eu-only` egress mode, documented supplementary measures.

### A6. Transparency law (AI Act Art. 50) vs "seamless" agent UX
- **Law:** Art. 50(1) (in force since 2 Aug 2026): users interacting with an AI system must be told it's AI — Commission guidelines confirm **AI agents** are in scope; Art. 50(2)/(4) marking/labelling of synthetic content (transition ends 2 Dec 2026); UK AI-labelling taskforce points the same way.
- **KainBain:** UI presents agent output as work product with no AI disclosure or marking.
- **Why it bites:** the "obvious it's AI" exception is narrow and shouldn't be relied on for a coding harness used by non-experts.
- **Resolution:** R6 — persistent disclosure + provenance/marking metadata (C2PA direction).

### A7. Worker-protection law vs productivity analytics
- **Law:** ICO employment-practices/monitoring-workers guidance (proportionate, transparent monitoring; DPIA); DUAA ADM safeguards; AI Act Annex III 4(b) (monitoring/evaluating performance of persons in work relationships = high-risk from 2 Dec 2027); EU Platform Work Directive Art. 10 (transposition by 2 Dec 2026 — human oversight + transparency for automated management of platform workers); works-council consultation in several EU states.
- **KainBain:** `api/taskDurationSummary.js`, session logs, verdict history form a ready-made monitoring stack over the people who operate it.
- **Why it bites:** the same artefacts that make KainBain a good engineering tool make it a worker-monitoring system if pointed at staff metrics.
- **Resolution:** R8 — aggregate-by-default analytics, advisory-only verdicts, DPIA trigger, worker notice template.

### A8. Accessibility law vs drag-and-drop kanban
- **Law:** EAA (since 28 Jun 2025; EN 301 549 v3.2.1 → v4.1.1/WCAG 2.2; enforcement active in FR/SE/NL; fines vary by member state); UK PSBAR 2018 (WCAG 2.1 AA); Equality Act 2010.
- **KainBain:** board-centric UI; drag-and-drop interactions; `docs/accessibility/` audits exist but EN 301 549 conformance is not evidenced.
- **Why it bites:** pointer-only DnD without keyboard/AT alternatives fails WCAG 2.1/2.2 (2.1.1, 2.4.3, 4.1.2); EAA exposure applies to non-EU sellers into the EU.
- **Resolution:** R9 — WCAG 2.2 AA programme, keyboard alternatives, ACR/VPAT.

### A9. Incident-reporting clocks vs engineering incident response
- **Law:** CRA Art. 14 (live since 11 Sep 2026: 24h early warning / 72h / 1-month final to ENISA + CSIRT); NIS2 Art. 23 (same clocks for in-scope customers); AI Act Art. 73 (15 days; 2 days for critical-infrastructure/widespread); GDPR Art. 33 (72h); UK CS&R Bill (clocks via secondary legislation, 2026–2028); DORA (contractual reporting to financial customers).
- **KainBain:** `deploy.sh` auto-rollback and `api/observability/alerts.js` exist, but nothing classifies an event by regime or starts legal clocks; auto-rollback is a mitigation, not a disclosure.
- **Why it bites:** the 24h CRA early-warning clock is already running for any actively exploited vulnerability in a KainBain deployment in the EU; "we auto-rolled-back" is not a report.
- **Resolution:** R7 — incident taxonomy + clock tooling + authority-contact matrix.

### A10. Copyright uncertainty vs "who owns the AI-generated code?"
- **Law:** UK CDPA s. 9(3) grants copyright in wholly computer-generated works (unique globally; government proposes removal — March 2026 report — while keeping protection for AI-assisted works); EU requires human authorship (no copyright in AI-only outputs); Getty v Stability AI (EWHC 4 Nov 2025) — no "infringing copies" in trained models; appeal green-lit 2026; training-side licensing is "license first" in the UK (May 2026) vs the EU's DSM Art. 4 opt-out + GPAI Code of Practice copyright duties.
- **KainBain:** generates code/docs/PR text with no provenance or licence hygiene.
- **Why it bites:** customers cannot prove ownership or licence cleanliness of what KainBain produces; copyleft echoes create obligations; UK/EU divergence means a UK-authored file may be protected in the UK and unprotected in the EU.
- **Resolution:** R10 + R6 — provenance ledger, licence gate, AI-origin marking; track the s. 9(3) removal and the Getty appeal (R18).

## B. Law vs law / law vs standard (design for the tension)

### B1. UK DUAA vs EU GDPR Art. 22 + AI Act (ADM divergence)
The UK lifted the ADM prohibition (except special-category data) with safeguards (inform / representations / human intervention / contest); the EU keeps the Art. 22 prohibition and the AI Act adds oversight + FRIA duties. **A UK-compliant ADM setup can be unlawful in the EU.** Resolution: `JURISDICTION` config (R18) defaulting to the stricter EU posture for any processing touching EU data subjects; keep DUAA-safeguard artefacts for UK-only deployments.

### B2. UK "license first" for AI training vs EU DSM Art. 4 opt-out
UK: permission/licensing usually needed for training (March/May 2026 position). EU: commercial TDM allowed unless rights-reserved (Art. 4(3) DSM), with GPAI providers obliged to respect reservations (Art. 53 + CoP). **A model lawful to train in the EU may be unlicensable in the UK, and vice versa.** Resolution: per-model provenance metadata (training-data summary availability, opt-out compliance statement) in the provider registry (R4); prefer models with published training-data summaries for UK customers.

### B3. UK s. 9(3) CGW vs EU human authorship (converging, but not yet aligned)
Today: UK protects wholly AI-generated works; EU does not. UK proposes removal (not yet law). Outcome converges on "no copyright for AI-only works; protect AI-assisted works" — but until the UK change lands, the same file has different ownership status by territory. Resolution: record human contribution per change (git + verdicts) so AI-*assisted* protection is provable everywhere (R10); do not rely on s. 9(3).

### B4. AI Act Art. 12 logging vs GDPR minimisation/erasure (the productive tension)
High-risk AI systems must keep logs enabling oversight and post-market monitoring; GDPR demands minimisation, storage limitation, and erasure. These are reconcilable only by design: log what oversight needs (events, decisions, overrides, model/version IDs), not raw content; pseudonymise; retain per schedule. Resolution: R3 — the retention/redaction design *is* the reconciliation; document it as the Art. 12/Art. 5(1)(e) balancing record.

### B5. EU–US DPF (adequacy) vs Schrems II residual risk vs CLOUD Act
The DPF was upheld at first instance (Latombe dismissed), but an appeal to the CJEU is possible and the framework remains politically contested; UK→US flows also have the UK–US Data Bridge. SCCs+TIA remain the robust fallback. Resolution: never rely on a single mechanism — registry records primary + fallback basis per provider (R4); re-verify DPF certification annually (R18 watch item).

### B6. AI Act open-source exemption vs CRA open-source-steward duties vs commercial SaaS
Releasing KainBain as free/open-source AI tooling engages the AI Act's open-source carve-out (unavailable for high-risk/prohibited/systemic-risk uses) and the CRA's lighter "open-source steward" regime — but offering it as hosted SaaS is "making available on the market" in the course of a commercial activity and pulls the full CRA (and potentially AI Act deployer-adjacent) duties back in. **The same code has different legal weight depending on the distribution model.** Resolution: R17 — decide and document the posture in an ADR; if OSS, keep the high-risk-capable configuration behind explicit, documented customer obligations.

### B7. NIS2 (EU) vs UK CS&R Bill (parallel, not identical)
Both extend supply-chain/incident duties; the UK Bill adds MSPs, data centres and "designated critical suppliers" with its own clocks and regulator powers via secondary legislation through 2028. **A NIS2 supplier pack is ~80% of a CS&R pack, but not all of it.** Resolution: build the union pack (R13) and diff when CS&R secondary legislation lands (R18).

### B8. eIDAS 2.0 as opportunity, not conflict
Qualified electronic signatures / EUDI wallets (rolling out through 2026) could upgrade KainBain's approval gates from "logged click" to legally qualified sign-off — valuable for high-risk customers needing Art. 14 oversight evidence and for EU public-sector procurement identity. Not a conflict; a P2 feature (roadmap R18 watch + future gate type).

### B9. Data Act switching rights vs harness/model lock-in
The Data Act (applies since 12 Sep 2025) pushes cloud/data-processing customers toward portable, switchable services. KainBain's open JSONL storage is an asset; any future hosted/telemetry features must not reintroduce lock-in. Resolution: R16 export API + documented formats; avoid proprietary storage.

### B10. Standards proliferation (which framework wins?)
ISO/IEC 42001 (AIMS), EN 18286 (Art. 17 QMS, presumption of conformity), NIST AI RMF + AI 600-1, NIST SSDF, OWASP LLM/Agentic Top 10, ISO/IEC 27090, NCSC secure-AI guidelines, MITRE ATLAS — overlapping but complementary. **Conflict risk is duplication, not contradiction.** Resolution: R11 — one internal control set mapped to all of them (42001 as the spine; EN 18286 for AI Act conformity; SSDF/OWASP for engineering controls; ATLAS for AI threat model).

## Summary: the five conflicts that should drive design reviews

1. **A1** auto-approve defaults vs human-oversight law → R2.
2. **A2** open API vs security law → R1.
3. **A3/A4/B4** keep-everything logs vs erasure, vs mandatory logging → R3.
4. **A5/B5** US model egress vs Chapter V/CLOUD Act → R4.
5. **B1/B2/B3** UK–EU divergence (ADM, training licences, CGW copyright) → R18 jurisdiction config + provenance/marking (R6/R10).
