# UK/EU Legal Landscape for an AI Code Harness (as of 24 October 2026)

Companion to [00 Executive summary](./compliance-uk-eu-00-executive-summary.md). Each entry: instrument → status → what it requires → how it touches KainBain. Sources are listed in [05 Sources](./compliance-uk-eu-05-sources.md) with access dates.

**How to read "applicability" for KainBain.** KainBain sits in three legal roles at once, and obligations attach differently to each:

1. **Product** — downloadable/hostable software placed on the UK/EU market → product-security law (EU CRA; UK CS&R Bill when enacted; UK Product Regulation and Metrology Act 2025 powers) and, if sold to consumers in the EU, accessibility law (EAA).
2. **AI system / deployer tool** — it orchestrates AI agents that generate code and interact with humans → EU AI Act (as amended by the Digital Omnibus) attaches to the *system* its customers build/run; KainBain as its supplier inherits deployer-style duties (Art. 26 support, Art. 50 transparency design, Art. 4 literacy) and must not ship configurations that make lawful use impossible. If a customer uses it for employment/worker-management decisions (task allocation, performance evaluation — Annex III 4(b)) or critical-infrastructure software (Annex III 2(b)), the *combined system* is high-risk from 2 Dec 2027.
3. **Data processor of prompts/logs** — session transcripts contain whatever users paste (personal data, customer code, secrets) → UK GDPR/DPA 2018 and EU GDPR: storage limitation, erasure, security (Art. 32), processor terms (Art. 28), international transfers (Chapter V) because model providers are predominantly US-hosted.

---

## 1. European Union

### 1.1 EU AI Act — Regulation (EU) 2024/1689, as amended by the Digital Omnibus on AI, Regulation (EU) 2026/1744

**Status.** In force 1 Aug 2024; phased application. The Digital Omnibus (OJ 24 Jul 2026, applicable 27 Jul 2026; EP approved 16 Jun 2026, Council 29 Jun 2026) deferred the high-risk deadlines: **Annex III high-risk obligations now apply 2 Dec 2027** (was 2 Aug 2026); Annex I Section A (AI as safety component of regulated products) **2 Aug 2028**. Already applying: prohibitions + AI literacy (2 Feb 2025); GPAI + governance (2 Aug 2025); **transparency (Art. 50) + enforcement since 2 Aug 2026**. From **2 Dec 2026**: new prohibitions on non-consensual intimate imagery (NCII) and CSAM-generating systems, and the Art. 50(2) machine-readable marking transition ends for synthetic-content systems placed on the market before 2 Aug 2026. Regulatory sandboxes operational by 2 Aug 2027.

**What it requires (selected).**
- **Art. 4 AI literacy** (applies since 2 Feb 2025): providers *and deployers* must ensure staff and other persons involved in operating AI systems have a sufficient level of AI literacy (training, awareness) — an employer duty that KainBain's customers owe and KainBain can evidence.
- **Art. 5 prohibitions**: manipulative/subliminal techniques, exploitation of vulnerabilities, social scoring, untargeted facial-image scraping, emotion inference in workplaces/education, real-time remote biometric ID in public spaces (law-enforcement exceptions), plus (from 2 Dec 2026) NCII/CSAM generation. Fines up to **€35m or 7%** of worldwide turnover.
- **Art. 6 + Annex III high-risk**: Annex III 4 (employment, workers' management, access to self-employment): (a) recruitment/selection/evaluation of candidates; (b) **decisions affecting work-related relationships, promotion/termination, task allocation based on individual behaviour or personal traits, and monitoring/evaluating performance and behaviour**. This is the single most important classification risk for a harness that allocates tasks and scores work. Also relevant: Annex III 2(b) (management/operation of critical infrastructure, where software is safety-relevant), 5(b)/(c) (creditworthiness, life/health insurance pricing) if customers build such systems with KainBain.
- **High-risk obligations** (from 2 Dec 2027): risk management (Art. 9), data governance (Art. 10), technical documentation (Art. 11), **record-keeping/logging (Art. 12)**, transparency + instructions for use (Art. 13), **human oversight (Art. 14)**, accuracy/robustness/cybersecurity (Art. 15), QMS (Art. 17), conformity assessment + CE marking (Arts. 43–47), registration in EU database, post-market monitoring (Art. 72), **serious-incident reporting (Art. 73: 15 days; 2 days for widespread/critical-infrastructure incidents)**.
- **Art. 26 deployer obligations**: use per instructions, human oversight assignment, input-data relevance monitoring, logging retention, inform affected individuals, **FRIA where required (Art. 27)** (public bodies and private entities providing public services for listed uses; certain deployers must publish FRIA summary), report serious incidents.
- **Art. 50 transparency (applies since 2 Aug 2026)**: (1) AI systems interacting with humans (Commission draft guidelines confirm **AI agents** are in scope) must disclose they are AI; (2) synthetic audio/image/video/text must be marked machine-readable and detectable (watermarking obligations apply from 2 Dec 2026); (3) deployers of emotion-recognition/biometric-categorisation must inform exposed individuals; (4) deepfakes and AI-generated text on matters of public interest must be labelled (human-review exception). Applies to open-source systems too. Fines €15m/3% tier.
- **Chapter V GPAI (applies since 2 Aug 2025)**: model-level duties (technical documentation, training-data summary template, copyright policy respecting DSM Art. 4 opt-outs, systemic-risk evaluation/mitigation for models trained above 10²⁵ FLOPs). The final **GPAI Code of Practice (July 2025)** covers safety, security and transparency commitments. These bind model providers (Anthropic, OpenAI, Google, Ollama, DeepSeek…), but KainBain as integrator must surface provider status to customers.
- **Scope**: extraterritorial (Art. 2) — applies to non-EU providers/deployers whose output is used in the EU. Open-source exemption (Art. 2(12)) for free/open-source AI systems, **not** available for prohibited practices, high-risk systems, or systemic-risk GPAI.

**Applicability to KainBain.** KainBain itself is an orchestrator, not a model; the realistic exposure is (a) **Art. 50(1)** — its UI is an AI-interaction surface and must disclose AI involvement; (b) **Art. 50(2)/(4)** — any synthetic content it helps produce (docs, commit messages, release notes, PR text) needs marking/labelling support; (c) **Art. 4** — ship AI-literacy prompts/attestations; (d) **Art. 26 support** — customers deploying high-risk systems need KainBain to provide instructions for use, logging (Art. 12), human-oversight affordances (Art. 14) and incident-reporting hooks (Art. 73); (e) **Annex III 4(b) tripwire** — task allocation/performance verdicts must be configurable as *advisory only* with human decision points, or customers become high-risk deployers on 2 Dec 2027. First harmonised standard **EN 18286:2026** (QMS for Art. 17) was cited in the OJ on 19 Oct 2026 (Implementing Decision (EU) 2026/2274) and layers onto ISO/IEC 42001 — the natural backbone for KainBain's own conformity evidence.

### 1.2 EU Cyber Resilience Act — Regulation (EU) 2024/2847

**Status.** In force 10 Dec 2024. **Reporting obligations apply since 11 Sep 2026** (Art. 14: actively exploited vulnerabilities and severe incidents → ENISA + national CSIRT; early warning ≤24h, notification ≤72h, final report ≤1 month). **Main obligations apply 11 Dec 2027.**

**What it requires.** Applies to "products with digital elements" placed on the EU market — explicitly including software (apps, OS, libraries) and treating necessary remote data-processing as part of the product; extraterritorial (non-EU manufacturers need an EU responsible economic operator). Annex I essential requirements: secure by design/default, no known exploitable vulnerabilities at release, vulnerability handling process, free security updates for the support period (default 5 years), **machine-readable SBOM** covering components, incident reporting. Manufacturer duties (Arts. 13–14): technical documentation (kept **10 years**), conformity assessment (self-assessment for most software; third-party for "important II"; certification for "critical"), EU declaration of conformity, CE marking. Open-source software developed outside a commercial activity is largely out of scope; **open-source stewards** have a lighter, tailored regime. Fines (Art. 64): up to **€15m/2.5%** (Annex I + Arts. 13–14), €10m/2% (other obligations), €5m/1% (misleading authorities).

**Applicability to KainBain.** Direct. KainBain is a software product with digital elements. Existing assets that already help: `sbom.cyclonedx.json`, `Security_scans.sh` (Trivy + Semgrep + SBOM + SecObserve), deploy health-gate/auto-rollback, `DEPRECATIONS.md`. Missing: defined support period + update policy, VDP (vulnerability disclosure policy) + CVE handling, ENISA/CSIRT reporting runbook with the 24h/72h/1-month clocks, technical-documentation pack, CE-marking/conformity route decision, EU authorised-representative if the maker is non-EU, SBOM in CI per release (not a one-off file), signed provenance (SLSA/in-toto). Note the interplay: KainBain's *customers* also face CRA for what they build with it — KainBain can ship SBOM/vulnerability evidence downstream as a feature.

### 1.3 NIS2 — Directive (EU) 2022/2555

**Status.** Transposition deadline was 17 Oct 2024; enforcement and first fines are underway across member states in 2025–2026.

**What it requires.** Entities in 18 sectors (energy, transport, banking, financial market infrastructures, health, drinking water, digital infrastructure, ICT service management, public administration, space, etc.) classified essential/important must implement risk-management measures (Art. 21 — including **supply-chain security**: suppliers' security posture is in scope), and report significant incidents: **early warning ≤24h, incident notification ≤72h, final report ≤1 month**. Management-body liability and possible personal liability of management. Fines (Art. 34): essential entities up to **€10m or 2%** of worldwide turnover; important entities up to **€5m or 1%**.

**Applicability to KainBain.** Indirect but sharp: any NIS2 entity that uses KainBain must be able to show KainBain (its supplier) meets supply-chain expectations — SBOM, vulnerability handling, incident-notification SLAs, signed releases. KainBain should ship a "NIS2 supplier pack". If KainBain (the operating company) itself became an ICT service-management provider to essential entities, it could fall in scope directly.

### 1.4 DORA — Regulation (EU) 2022/2554 (financial sector)

**Status.** Applies since 17 Jan 2025.

**What it requires.** Financial entities (banks, insurers, investment firms, payment institutions…) must manage ICT third-party risk: pre-contract due diligence, **mandatory contractual clauses (Art. 28)** — audit/access rights, exit strategies, subcontracting rules, incident-reporting cooperation — plus a register of information on all ICT providers. "Critical" ICT third-party providers can be designated for direct EU oversight (lead overseer).

**Applicability to KainBain.** If a bank/insurer uses KainBain to build or operate software, KainBain is an ICT third-party service provider: expect Art. 28 clause packs, audit rights, and incident-reporting SLAs in procurement. A DORA-ready contract/evidence pack is a sales requirement, not a legal duty on KainBain itself (unless designated critical, unlikely).

### 1.5 EU Data Act — Regulation (EU) 2023/2854

**Status.** Applies since 12 Sep 2025.

**What it requires.** B2B data-sharing rights for connected products, switching/portability between cloud/data-processing services (no lock-in, no switching charges after transition periods), interoperability, and safeguards for non-personal data shared with public bodies. Smart-contract requirements for data-sharing agreements.

**Applicability to KainBain.** Mild but real: KainBain stores project/session data on disk in open formats (JSONL) — good for portability; keep export APIs first-class (Data Act switching rights for customers), and don't lock customers into proprietary storage formats.

### 1.6 European Accessibility Act — Directive (EU) 2019/882

**Status.** Applies since **28 Jun 2025**; all 27 member states transposed; enforcement underway — first lawsuits filed in France (Nov 2025), Sweden market surveillance (Oct 2025), Dutch ACM actively enforcing e-commerce/electronic communications in 2026. Applies to non-EU companies selling covered products/services into the EU.

**What it requires.** Accessibility requirements (via **EN 301 549**, currently v3.2.1 = WCAG 2.1 AA; **v4.1.1 (WCAG 2.2) published 2 Sep 2026**, OJ citation expected Nov 2026) for covered services incl. e-commerce, consumer banking, and associated software/self-service terminals; accessibility information in contracts/terms; market-surveillance enforcement with member-state fines (reported range ~€60k IE to ~€900k SE).

**Applicability to KainBain.** If KainBain is sold to EU customers (esp. as e-commerce or used in covered services), the product UI and the sales site need EN 301 549/WCAG 2.2 AA conformance. KainBain already has `docs/accessibility/` (audit register, statement) — build on it. Drag-and-drop kanban needs keyboard/AT alternatives (see doc 04).

### 1.7 Product Liability Directive (new) — Directive (EU) 2024/2853; AI Liability Directive withdrawn

**Status.** The AI Liability Directive (fault-presumption rules for AI) was **withdrawn** by the Commission; liability exposure now runs through national fault-based rules plus the new PLD, which **covers software** (including AI systems embedded in products and standalone software updates), applies to products placed on the market after **9 Dec 2026**, transposition by 9 Dec 2026. Strict liability for defective products; software is defective if it fails to provide the safety a person is entitled to expect (incl. cybersecurity flaws, post-market update failures); disclosure obligations on claimants.

**Applicability to KainBain.** As a software product: defective cybersecurity or unsafe AI-generated code that KainBain *places on the market* (not merely code it helps a customer write) can trigger strict liability. Reinforces CRA-grade security, SBOM, and update discipline. Also relevant to KainBain's customers: AI-generated code with vulnerabilities that ship → their PLD exposure; KainBain's gates (scan/review) are their mitigation.

### 1.8 EU GDPR (Regulation (EU) 2016/679) + EDPB guidance

**Status.** Unchanged core; EDPB **Opinion 28/2024 (18 Dec 2024)** on AI models: anonymity of models is case-by-case (singling-out + extraction tests); legitimate interest for AI development needs the 3-step test (purpose, necessity, balancing) with mitigations; models trained on unlawfully processed personal data may render deployment unlawful unless anonymised. EDPB anonymisation guidelines updated 2026. Chapter V transfers post-Schrems II require a transfer tool (SCCs, adequacy, DPF) **plus a Transfer Impact Assessment (TIA)** and supplementary measures where needed.

**Applicability to KainBain.** Sessions/logs hold prompts, code, file contents — personal data whenever users paste them (EDPB: code can contain personal data; even comments/identifiers). Obligations: Art. 5 principles (minimisation, storage limitation), Art. 12 transparency, Art. 17 erasure, Art. 25 data protection by design, Art. 28 processor terms (towards customers whose data it processes), Art. 30 records, Art. 32 security (encryption, access control, testing — KainBain currently has **no auth**), Art. 33/34 breach notification (72h), Chapter V for US model providers, **Art. 35 DPIA** for systematic AI use, **Art. 22 ADM** (significant decisions solely automated — interlocks with AI Act and, post-DUAA, the UK regime). EU–UK adequacy renewed July 2025 (to 2031) keeps EU→UK flows simple; UK→US runs on the UK–US Data Bridge (UK extension to the EU–US DPF). The EU–US DPF was **upheld at first instance** (General Court dismissed Latombe, T-553/23); CJEU appeal risk remains — keep SCCs+TIA as fallback.

---

## 2. United Kingdom

### 2.1 UK GDPR + Data Protection Act 2018, as amended by the Data (Use and Access) Act 2025 (DUAA)

**Status.** DUAA received Royal Assent 19 Jun 2025. **Core data-protection reforms in force 5 Feb 2026**; data-protection complaints regime from 19 Jun 2026; ICO consulted on draft ADM guidance in Mar 2026 (final guidance pending).

**What changed (selected).**
- **Automated decision-making (new UK GDPR Arts. 22A–22D):** the Art. 22-style prohibition is lifted **except where special category data is involved**; any other lawful basis (e.g. legitimate interests — but not the new "recognised" ones) can support significant ADM. **Mandatory safeguards for all ADM**: inform the individual, opportunity to make representations, **meaningful human intervention**, ability to contest. Secretary of State may designate "significant decisions" and vary safeguards. Note: UK and EU now **diverge** — an EU-compliant Art. 22 posture is stricter than the UK's.
- **Recognised legitimate interests**: new pre-approved legitimate-interest grounds (direct marketing, intra-group transfers, network security…) without a bespoke LIA.
- **International transfers**: new "data protection test" — third-country protection must not be "materially lower" than UK standards (replaces the EU-style Art. 45–49 analysis for UK transfers; regulations pending).
- ICO gains expanded powers (fines up to GDPR levels for PECR breaches, compelled interviews, etc.).

**Applicability to KainBain.** Same GDPR-style analysis as EU GDPR (UK GDPR mirrors it), plus: if KainBain's verdicts/routing ever drive significant decisions about individuals (e.g. performance scoring of developers, gig task allocation), the DUAA ADM safeguards apply — the human-in-the-loop gate becomes a legal control, not a UX preference. ICO **employment practices: monitoring workers** guidance (Oct 2023, under review post-DUAA) applies if task-duration/session analytics are used on staff.

### 2.2 Cyber Security and Resilience (NIS) Bill (UK)

**Status.** Introduced 12 Nov 2025 (Bill 4035); Commons stages complete (Jun 2026); **Lords Second Reading 14 Jul 2026**, committee stage Aug 2026, **Report stage 26 Oct 2026**; Royal Assent expected **late 2026**; duties phased through secondary legislation to 2028. Updates and expands the NIS Regulations 2018.

**What it will require.** Brings **managed service providers (MSPs) and data centres** into scope; strengthens incident reporting (24h/72h-style clocks expected via secondary legislation); stronger regulator powers (information, enforcement, cost recovery); "designated critical suppliers" regime; supply-chain security emphasis mirroring NIS2.

**Applicability to KainBain.** A company operating/selling KainBain as a managed service could fall in scope as an MSP; as a software supplier to UK essential services (energy, transport, water, health, digital infrastructure), expect CS&R/NIS-style supply-chain clauses. Prepare the same supplier pack as for NIS2, plus UK-specific incident clocks once secondary legislation lands. Also relevant: NCSC **Cyber Assessment Framework** for CNI suppliers, and **Cyber Essentials / Cyber Essentials Plus** (government policy requires Cyber Essentials for central-government contracts handling personal/sensitive data — Procurement Act 2023, in force 24 Feb 2025, governs the commercial route).

### 2.3 UK AI regulation (no AI statute)

**Status.** Pro-innovation, sector-based: no cross-sector AI law; regulators (ICO, FCA, Ofcom, CMA…) apply existing powers; DSIT coordinates. **AI Growth Lab** launched 2026 (first sandbox: legal services; call for evidence closed Jan 2026) allowing time-limited regulatory relaxation for approved projects. UK AI Safety Institute (renamed from AISI) runs evaluations; NCSC co-authored the **Guidelines for secure AI system development** (Nov 2023) with CISA and international partners.

**Applicability to KainBain.** No AI Act-style conformity regime to certify against — but customers in regulated sectors (finance: FCA/PRA; health: MHRA + NHS; legal: SRA) will ask for evidence: DPIAs, ADM documentation, secure-development evidence (NCSC guidelines, NIST SSDF), evaluation results. KainBain's compliance-pack idea serves this market directly.

### 2.4 UK copyright and AI — CDPA 1988 + March 2026 Copyright & AI Report

**Status.** TDM exception remains **non-commercial research only** (CDPA s. 29A). The government's proposed commercial TDM exception with opt-out was **abandoned** (Report on Copyright and AI, 18 Mar 2026); the May 2026 response to the Lords Communications & Digital Committee confirms **"license first, legislate later"**: AI developers must seek permission/licences for training on copyright works unless an exception applies. On **computer-generated works**: the government proposes to **remove** the s. 9(3) CDPA protection for wholly computer-generated works (in place since 1988) while retaining protection for AI-assisted works — in the absence of evidence of its value. Digital replicas: exploring a new personality right (consultation). AI-labelling taskforce: interim report due autumn 2026.

**Case law.** *Getty Images v Stability AI* (EWHC, 4 Nov 2025): trained models held not to be "infringing copies" (no reproductions stored); trade-mark claim partially succeeded; "article" can be intangible (a divergence from EU distribution-right concepts); **appeal green-lit 2026** — watch for the Court of Appeal.

**Applicability to KainBain.** (a) **Ownership of AI-generated code is unsettled and diverging**: today the UK grants copyright in wholly computer-generated works (s. 9(3), computer as author) while the EU requires human authorship (no copyright in AI-only outputs); the UK proposes to remove s. 9(3). KainBain should track human contribution per change (it already has verdicts/git attribution) and mark AI-generated content — the UK taskforce and EU Art. 50(2) both point to labelling. (b) **Training-data risk sits with model providers**, but KainBain should surface licence/provenance metadata per model (GPAI CoP-style transparency) and let customers pin EU-sourced or openly-licensed models. (c) **Copyleft contamination**: generated code echoing GPL/AGPL training data creates licence obligations for the *user*; a licence-compatibility gate is a genuine compliance feature (UK and EU alike — copyright infringement is the claim, not AI law).

### 2.5 UK accessibility law

**Status.** Public Sector Bodies (Websites and Mobile Applications) Accessibility Regulations 2018 require WCAG 2.1 AA (monitoring 2022–2024 published; GDS tracking WCAG 2.2 success criteria — movement to 2.2 expected); Equality Act 2010 duties apply to service providers (reasonable adjustments; auxiliary aids). The EAA is not UK law but binds UK companies selling into the EU.

**Applicability to KainBain.** If KainBain (or its operator) supplies UK public sector, the UI must meet WCAG 2.1 AA now and should target 2.2 AA (EN 301 549 v4.1.1 direction). Existing `docs/accessibility/` audits are the starting point; the kanban board needs non-drag alternatives.

### 2.6 Other UK instruments (watchlist)

- **Online Safety Act 2023** — duties attach to user-to-user/search services; a private/local harness is out of scope, but if KainBain ever adds shared/hosted multi-user features with user-generated content visible to others, reassess.
- **Product Regulation and Metrology Act 2025** — framework powers over product safety (mostly physical goods; software relevance indirect via CRA-style future measures).
- **Procurement Act 2023** (in force 24 Feb 2025; further changes 1 Apr 2026) — route to UK public-sector sales; Cyber Essentials expectations; supplier declarations.
- **Employment Rights Bill / worker-monitoring** — ICO monitoring-workers guidance is the operative standard; DUAA review ongoing.

---

## 3. Standards & frameworks (the "how to evidence it" layer)

| Standard / framework | What it is | Use for KainBain |
| --- | --- | --- |
| **ISO/IEC 42001:2023** | AI management system (AIMS) — certifiable | Backbone AIMS for the KainBain organisation; policy, risk, lifecycle, supplier management |
| **ISO/IEC 27701:2019** | Privacy information management (PIMS), extends ISO/IEC 27001 | GDPR/UK GDPR evidence; pairs with ISO/IEC 27001 certification |
| **ISO/IEC 27001:2022** | Information security management | Baseline for the API/auth/storage hardening |
| **ISO/IEC 27090:2026** | Cybersecurity — AI — security threats to AI systems | Threat-model AI-specific risks (prompt injection, model theft, data poisoning) |
| **ISO/IEC 5338:2023 / 42005:2023** | AI lifecycle processes / AI system impact assessment | Process + impact-assessment method for the roadmap |
| **EN 18286:2026** | First AI Act harmonised standard (Art. 17 QMS), cited in OJ 19 Oct 2026 | Presumption-of-conformity route for any future high-risk configuration |
| **CEN-CENELEC JTC 21 rolling plan** | Harmonised standards for AI Act (risk mgmt, data governance, logging, human oversight…) | Track; more hENs expected before Dec 2027 |
| **NIST AI RMF 1.0 + GenAI Profile (AI 600-1, Jul 2024)** | US voluntary framework (Govern/Map/Measure/Manage) | Cross-walk for customers; useful structure for the compliance pack |
| **NIST SP 800-218 (SSDF)** | Secure software development practices | Aligns with CRA Annex I; KainBain's gates/scans already partial coverage |
| **OWASP LLM Top 10 (2025) + Top 10 for Agentic Applications (2026)** | LLM/agentic security risk lists | Agent-execution sandboxing, tool-approval, egress-control requirements |
| **MITRE ATLAS** | Adversarial threat landscape for AI systems | Threat modelling for the harness |
| **NCSC Guidelines for secure AI system development (2023)** | UK/EU-friendly secure-AI guidance (with CISA et al.) | UK public-sector and NCSC-aligned customers |
| **EN 301 549 (v3.2.1 → v4.1.1/WCAG 2.2)** | Accessibility standard | EAA/PSBAR conformance target |
| **eIDAS 2.0 (Reg. (EU) 2024/1183)** | EUDI wallets + qualified signatures; wallet obligations phase in through 2026 | Future: qualified e-signatures on approval gates; EU customer identity |
| **SLSA / in-toto, CycloneDX/SPDX** | Supply-chain provenance + SBOM formats | CRA SBOM + provenance evidence in CI |
| **EU AI Pact / GPAI Code of Practice / Transparency CoP (2026)** | Voluntary early-compliance instruments | Signal alignment; adopt relevant controls early |

## 4. Timeline (consolidated)

See the table in [00 Executive summary](./compliance-uk-eu-00-executive-summary.md#key-dates-as-of-24-oct-2026). The two dates that matter most for planning: **2 Dec 2026** (AI Act NCII/CSAM prohibitions + Art. 50(2) marking transition ends; new PLD applies; Platform Work Directive transposition) and **2 Dec 2027** (AI Act Annex III high-risk incl. employment/worker management; CRA main obligations 11 Dec 2027).
