# KainBain UK/EU Compliance Research — Executive Summary

- **Research date:** 24 October 2026
- **Scope:** (a) how KainBain can be *used for* compliance work in the UK and EU, and (b) what must change for KainBain *itself* to be the most legally compliant code harness under UK and EU law, including laws/standards that conflict with its current design.
- **Companion documents:** [01 Legal landscape](./compliance-uk-eu-01-legal-landscape.md) · [02 Gap analysis](./compliance-uk-eu-02-gap-analysis.md) · [03 Roadmap](./compliance-uk-eu-03-roadmap.md) · [04 Conflicts & tensions](./compliance-uk-eu-04-conflicts-and-tensions.md) · [05 Sources](./compliance-uk-eu-05-sources.md)
- **Disclaimer:** research notes, not legal advice. Verify against primary sources before relying on them for a conformity decision.

## What KainBain is (relevant to this research)

KainBain is an AI task-orchestration harness: a Fastify API (`api/`) + React frontend (`frontend/`) that runs AI coding agents (pi, OpenCode, Vibe, Muse, custom harnesses) through multi-stage workflow pipelines with human review/verdicts, a kanban board, git integration, deploy gates (health-check gate + auto-rollback in `deploy.sh`), security scanning (`Security_scans.sh`: Trivy + Semgrep + SBOM + SecObserve), a CycloneDX SBOM (`sbom.cyclonedx.json`), and disk-persisted agent session transcripts (`api/sessionStore.js`, `.kainbain/sessions/*.jsonl`).

## The two-part answer

### Part A — KainBain as a compliance tool

KainBain's core primitives (workflow stages, gates, verdicts, review/reject/re-route, durable logs, deploy checkpoints, scan pipelines) map unusually well onto legal obligations that are themselves *process* obligations. It can be used to **operationalise** UK/EU compliance for the software it builds and for the organisation that runs it:

- **Human oversight as a gate** — EU AI Act Art. 14/26 and UK GDPR (as amended by DUAA 2025) ADM safeguards both require meaningful human intervention; KainBain's stage verdicts/approval gates are exactly that control, if defaults are fixed (see conflicts).
- **Impact assessments as workflow stages** — DPIA (UK/EU GDPR Art. 35), Fundamental Rights Impact Assessment (AI Act Art. 27), Transfer Impact Assessment (Schrems II / EDPB 06/2020) can be templated as stages that block progression until completed.
- **Evidence generation** — AI Act Art. 12 logging, GDPR Art. 30 records, CRA technical documentation (10-year retention), SBOM (CRA Annex I), and NIS2/CS&R incident timelines (24h/72h/1-month) are all artefacts a harness can produce and timestamp.
- **Checks as gates** — WCAG/EN 301 549 accessibility checks (EAA, UK PSBAR 2018), licence-compatibility scanning of AI-generated code (copyleft contamination), secret/PII redaction checks before prompts leave the building (GDPR Art. 32, data minimisation), SBOM/vulnerability gates (CRA, NIS2 Art. 21 supply chain).
- **Transparency** — AI Act Art. 50 disclosure of AI interaction and marking of AI-generated content; UK AI-labelling taskforce direction of travel.

### Part B — KainBain itself must change

KainBain is currently a personal/single-user tool. To be sold or operated in the UK/EU — especially to regulated customers — it needs a compliance build-out. The five headline findings:

1. **No authentication or authorisation on the API.** `api/index.js` registers routes with no auth middleware; CORS allows origin-less and loopback requests by default. If sessions/logs contain personal data (they routinely contain prompts, code, file contents), this is a GDPR Art. 32 problem, a CRA Annex I problem, and a NIS2/CS&R supply-chain problem for any regulated customer.
2. **Default auto-approval of agent actions.** `KAINBAIN_VIBE_AUTO_APPROVE=true` and `KAINBAIN_MUSE_YOLO=1` are the documented defaults. This directly conflicts with the human-oversight direction of EU AI Act Art. 14/26, UK GDPR ADM safeguards (in force since 5 Feb 2026), and ICO worker-monitoring expectations if verdicts feed performance management (AI Act Annex III 4(b) makes employment/worker-management AI high-risk from 2 Dec 2027).
3. **Indefinite retention of session transcripts and logs.** `.kainbain/sessions/*.jsonl` persist prompts, tool calls, file contents and outputs with no documented retention schedule or erasure tooling (TTL sweep only disposes idle *live* sessions). Conflicts with GDPR Art. 5(1)(c)/(e) storage limitation and Art. 17 erasure — while AI Act Art. 12 simultaneously *requires* logging for high-risk systems. The resolution (retention schedules, redaction, pseudonymisation, erasure-with-audit-exception) is a design task, detailed in the roadmap.
4. **Uncontrolled egress to third-country model providers.** Default model config points at Ollama Cloud / LiteLLM endpoints and harness-embedded SDKs (Anthropic, OpenAI, Google…). Sending prompts/code (which may contain personal data or customer IP) to US providers needs a GDPR Chapter V transfer mechanism (SCCs + TIA, or EU-US Data Privacy Framework / UK–US Data Bridge where certified), plus CLOUD Act supplementary measures. No data-residency or egress-control mode exists today.
5. **Product-security law now applies to software like KainBain.** The EU Cyber Resilience Act (Regulation (EU) 2024/2847) reporting duties are **already live (since 11 Sept 2026)** and main obligations land 11 Dec 2027: secure-by-design, no known exploitable vulnerabilities, SBOM, vulnerability handling, ENISA/CSIRT reporting within 24h/72h/1 month, CE marking, 10-year technical documentation. KainBain has good raw material (SBOM, Trivy/Semgrep, deploy gates) but no VDP, no CRA-conformity evidence pack, no incident-reporting clock tooling. In the UK, the Cyber Security and Resilience Bill (in Lords; Report stage 26 Oct 2026; Royal Assent expected late 2026) will update the NIS Regulations 2018 and pull managed service providers, data centres and designated critical suppliers into scope.

## The conflict headline (details in doc 04)

Several obligations pull against KainBain's current design or against each other: **auto-approve defaults vs human-oversight law**; **no-auth API vs security law**; **keep-everything logs vs erasure/storage limitation** (while AI Act Art. 12 demands logs); **immutable git/audit history vs Art. 17**; **US model egress vs GDPR Chapter V / CLOUD Act**; **UK vs EU divergence** on automated decision-making (DUAA liberalisation vs GDPR Art. 22 + AI Act) and on computer-generated-work copyright (UK proposes removing CDPA s. 9(3); EU never had it); **transparency duties vs seamless UX** (AI Act Art. 50 applies since 2 Aug 2026, incl. AI agents); **worker-analytics features vs ICO monitoring guidance / EU Platform Work Directive**; **EAA/WCAG vs drag-and-drop UI**; **24h incident clocks vs engineering response**. None of these are blockers; all are design decisions the roadmap turns into gates.

## What "most legally compliant code harness" looks like

A prioritised programme (full detail in [doc 03](./compliance-uk-eu-03-roadmap.md)):

- **P0 (ship before any EU/UK sale or regulated-customer pilot):** authentication + RBAC on the API; default-deny agent execution (approval required, sandbox enforced) with an explicit, logged override; data-residency/egress controls and a transfer-mechanism registry (SCCs/TIA/DPF per provider); retention schedules + redaction + erasure tooling for sessions/logs; privacy notice + AI-transparency disclosure in UI (AI Act Art. 50(1)); security.txt + VDP; incident-reporting runbook with 24h/72h/1-month and AI Act Art. 73 (15-day) clocks.
- **P1 (next quarter):** CRA evidence pack (SBOM automation in CI, signed release provenance/SLSA, EU declaration of conformity prep, 10-year documentation store); compliance workflow template library (DPIA, FRIA, TIA, ADM-safeguard checklist, WCAG gate, licence gate); accessibility conformance work to EN 301 549/WCAG 2.2 AA; ISO/IEC 42001-aligned AIMS + ISO/IEC 27701 PIMS as the management-system backbone; AI-literacy attestation tracking (AI Act Art. 4).
- **P2 (this year):** EN 18286:2026 / harmonised-standard mapping for any high-risk configuration; eIDAS 2.0 qualified-signature approvals for gates; NIS2/DORA supplier packs (Art. 28 DORA contract clauses, register-of-information data); UK CS&R readiness (MSP/critical-supplier duties); UK-EU divergence config (ADM safeguards stricter mode for EU personal data); GPAI Code of Practice alignment for embedded models.

## Key dates (as of 24 Oct 2026)

| Date | Event |
| --- | --- |
| 2 Feb 2025 | EU AI Act: prohibitions + AI literacy (Art. 4/5) apply |
| 2 Aug 2025 | EU AI Act: GPAI obligations + governance apply; GPAI Code of Practice finalised July 2025 |
| 19 Jun 2025 | UK Data (Use and Access) Act 2025 Royal Assent |
| 28 Jun 2025 | European Accessibility Act applies (enforcement underway; first FR lawsuits Nov 2025) |
| 12 Sep 2025 | EU Data Act applies |
| 4 Nov 2025 | Getty v Stability AI (EWHC): no "infringing copies" in trained models; appeal green-lit 2026 |
| 5 Feb 2026 | UK DUAA core reforms in force, incl. new ADM regime (Arts. 22A–22D UK GDPR) |
| 18 Mar 2026 | UK Report on Copyright & AI: TDM opt-out abandoned; licensing-first; CGW protection to be removed |
| Jul 2026 | EU–UK adequacy renewed to 2031; Commission AI Act guidelines (GPAI 18 Jul, transparency 20 Jul) |
| 27 Jul 2026 | Digital Omnibus on AI (Reg. (EU) 2026/1744) applicable — defers Annex III high-risk to 2 Dec 2027 |
| 2 Aug 2026 | AI Act Art. 50 transparency rules apply (incl. AI agents); enforcement starts |
| 11 Sep 2026 | **CRA reporting duties live** (24h/72h/1-month to ENISA/CSIRT) |
| 19 Oct 2026 | EN 18286:2026 cited in OJ — first AI Act harmonised standard (Art. 17 QMS) |
| 26 Oct 2026 | UK CS&R Bill Lords Report stage (imminent) |
| 2 Dec 2026 | AI Act: new NCII/CSAM prohibitions + Art. 50(2) marking transition ends; new PLD applies to products placed on market after 9 Dec 2026; EU Platform Work Directive transposition deadline |
| 2 Aug 2027 | EU AI regulatory sandboxes operational |
| 2 Dec 2027 | **EU AI Act Annex III high-risk obligations apply** (employment/worker management incl. task allocation & performance monitoring) |
| 11 Dec 2027 | CRA main obligations apply |
| 2 Aug 2028 | AI Act Annex I (regulated products) high-risk obligations |
