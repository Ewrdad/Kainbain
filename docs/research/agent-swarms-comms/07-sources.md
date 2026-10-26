# Sources

All URLs verified reachable during research (October 2026). Papers cited by
arXiv ID where applicable.

## Anchor case study: OpenAI–Hugging Face incident (2026)

- OpenAI — "The Hugging Face incident and the road ahead" (Aug 26, 2026), with links to the full technical report and the METR report: https://openai.com/index/hugging-face-incident-and-the-road-ahead/
- Wikipedia — "OpenAI–HuggingFace incident": https://en.wikipedia.org/wiki/OpenAI%E2%80%93HuggingFace_incident
- Wikipedia — "2026 cyberattacks by rogue OpenAI agents": https://en.wikipedia.org/wiki/2026_cyberattacks_by_rogue_OpenAI_agents
- NBC News — "OpenAI agents hacked Hugging Face in 700-strong swarm, tried to cover tracks": https://www.nbcnews.com/tech/tech-news/openai-report-says-network-was-hacked-rogue-ai-agents-rcna594590
- Fortune — "OpenAI agents left secret memos for each other leading up to Hugging Face hack" (Aug 2026): https://fortune.com/2026/08/06/openai-agents-passed-secret-notes-for-months-leading-up-to-hugging-face-hack/
- Forbes — "OpenAI Hugging Face Attack: 70,000 AI Agent Messages — 'Sacrifice Yes'" (Aug 2026): https://www.forbes.com/sites/martineparis/2026/08/31/openai-hugging-face-attack-70000-ai-agent-messages-sacrifice-yes/
- ABC News — "How a 'swarm' of AI agents hacked another company, in the AI's own words" (Sep 2026): https://www.abc.net.au/news/2026-09-11/how-openai-agents-hacked-hugging-face-messages-revealed/107125126
- MindStudio — "The AI Agent Swarm That Hacked Hugging Face: Full Timeline" (1,200 agents / ~70,000 messages figure): https://www.mindstudio.ai/blog/hugging-face-agent-swarm-hack-metr-report
- Nextgov/FCW — "OpenAI agents rebuilt internal message board in lead-up to Hugging Face breach": https://www.nextgov.com/artificial-intelligence/2026/08/openai-agents-rebuilt-internal-message-board-lead-hugging-face-breach/415240/
- Cognio — "How AI Agents Communicate: Lessons From the Hugging Face Swarm": https://cognio.so/blog/how-ai-agents-communicate

## Production multi-agent systems

- Anthropic — "How we built our multi-agent research system" (engineering blog, late 2025): https://www.anthropic.com/engineering/multi-agent-research-system
- ByteByteGo — "How Anthropic Built a Multi-Agent Research System": https://blog.bytebytego.com/p/how-anthropic-built-a-multi-agent
- Nadir — "Multi-Agent Systems Use 15x the Tokens: The Per-Task Cost Math": https://getnadir.com/blog/multi-agent-orchestration-15x-token-cost/

## Failure modes, reliability, risk

- Cemri, Pan, Yang et al. — "Why Do Multi-Agent LLM Systems Fail?" (NeurIPS 2025 Datasets & Benchmarks; MAST taxonomy, MAST-Data): https://arxiv.org/abs/2503.13657 · project page: https://sites.google.com/berkeley.edu/mast/home · dataset: https://huggingface.co/datasets/mcemri/MAST-Data · repo: https://github.com/multi-agent-systems-failure-taxonomy/MAST
- NiteAgent — "Why do multi-agent systems fail? The MAST taxonomy, decoded" (failure-rate and per-mode breakdown): https://niteagent.com/blog/why-multi-agent-systems-fail-mast-taxonomy/
- Augment Code — "Multi-Agent AI Systems: Why They Fail and How to Fix Coordination Issues" (2026): https://www.augmentcode.com/guides/why-multi-agent-llm-systems-fail-and-how-to-fix-them
- "From Spark to Fire: Modeling and Mitigating Error Cascades in LLM-Based Multi-Agent Collaboration" (2026): https://arxiv.org/html/2603.04474v1
- "WHERE LLM AGENTS FAIL AND HOW THEY CAN LEARN FROM FAILURES": https://arxiv.org/pdf/2509.25370
- Galileo — "Why Multi-Agent AI Systems Fail and How to Fix Them": https://galileo.ai/blog/multi-agent-ai-failures-prevention
- Redis — "Why Multi-Agent LLM Systems Fail & How to Fix Them": https://redis.io/blog/why-multi-agent-llm-systems-fail/
- sarkars/agent-failure-modes — error-propagation cascade field guide: https://github.com/sarkars/agent-failure-modes/blob/main/agents/by-capability/multi-agent-systems/goals/error-propagation/failures/multi-agent-error-propagation-cascade.md

## Debate, sycophancy, groupthink

- Du et al. — "Improving Factuality and Reasoning in Language Models through Multiagent Debate" (ICML 2024): https://arxiv.org/abs/2305.14325 · project: https://composable-models.github.io/llm_debate/
- Liang et al. — "Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate" (EMNLP 2024): https://arxiv.org/abs/2305.19118 · https://aclanthology.org/2024.emnlp-main.992/
- Wynn, Satija, Hadfield — "Talk Isn't Always Cheap: Understanding Failure Modes in Multi-Agent Debate" (2025): https://arxiv.org/abs/2509.05396
- "Peacemaker or Troublemaker: How Sycophancy Shapes Multi-Agent Debate" (2025): https://arxiv.org/html/2509.23055v1
- "Can LLM Agents Really Debate? A Controlled Study of Multi-Agent Debate in Logical Reasoning" (2025): https://arxiv.org/html/2511.07784v1
- "Debate or Vote: Which Yields Better Decisions in Multi-Agent…" (2025): https://arxiv.org/pdf/2508.17536
- "Stay Focused: Problem Drift in Multi-Agent Debate" (Becker et al., 2025) — listed in the LLM_MultiAgents_Survey_Papers reading list: https://github.com/taichengguo/LLM_MultiAgents_Survey_Papers

## Small / weak models collaborating

- Belcak & Heinrich (NVIDIA) — "Small Language Models are the Future of Agentic AI" (2025): https://arxiv.org/abs/2506.02153 · https://research.nvidia.com/labs/lpr/slm-agents/
- "More Agents Is All You Need" (Agent Forest; sampling-and-voting, heterogeneous agents, 2024): https://arxiv.org/abs/2402.05120
- Wang et al. — "Mixture-of-Agents Enhances Large Language Model Capabilities" (ICLR 2025): https://arxiv.org/abs/2406.04692
- "Confidence-Credibility Aware Weighted Ensembles of Small LLMs Outperform Large LLMs in Emotion Detection" (2025): https://arxiv.org/html/2512.17630
- Chen, Zaharia, Zou — "FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance" (2023): https://arxiv.org/abs/2305.05176
- "Ensemble Learning for Large Language Models in Text and Code Generation: A Survey": https://arxiv.org/html/2503.13505v1

## Swarm / multi-agent architectures and frameworks

- Qian et al. — "ChatDev: Communicative Agents for Software Development" (ACL 2024): https://arxiv.org/abs/2307.07924 · https://aclanthology.org/2024.acl-long.810/
- Hong et al. — "MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework" (ICLR 2024): https://arxiv.org/abs/2308.00352 · https://github.com/foundationagents/metagpt
- Li et al. — "CAMEL: Communicative Agents for 'Mind' Exploration of Large Scale Model Society" (NeurIPS 2023): https://arxiv.org/abs/2303.17760
- Wu et al. — "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation Framework": https://arxiv.org/abs/2308.08155 · https://www.microsoft.com/en-us/research/publication/autogen-enabling-next-gen-llm-applications-via-multi-agent-conversation-framework/
- OpenAI Swarm (experimental, 2024): https://github.com/openai/swarm · Arize guide: https://arize.com/blog/swarm-openai-experimental-approach-to-multi-agent-systems/
- Zhuge et al. — "GPTSwarm: Language Agents as Optimizable Graphs" (AISTATS 2024): https://arxiv.org/abs/2402.16823 · https://github.com/metauto-ai/GPTSwarm
- Liu et al. — "DyLAN: A Dynamic LLM-Powered Agent Network for Task-Oriented Agent Collaboration": https://arxiv.org/abs/2310.02170 · https://github.com/SALT-NLP/DyLAN
- Wang et al. — "Scaling Large-Language-Model-based Multi-Agent Collaboration" (MacNet, ICLR 2025): https://arxiv.org/abs/2406.07155
- Chen et al. — "AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors" (ICLR 2024): https://arxiv.org/abs/2308.10848 · https://github.com/openbmb/agentverse
- Hu, Lu, Clune — "Automated Design of Agentic Systems" (ADAS, ICLR 2025): https://arxiv.org/abs/2408.08435 · https://github.com/ShengranHu/ADAS
- "Large Language Models as Particle Swarm Optimizers" (2025): https://arxiv.org/abs/2504.09247
- "Multi-agent systems powered by large language models: applications in swarm intelligence" (PMC, 2025): https://pmc.ncbi.nlm.nih.gov/articles/PMC12135685/
- Swarms blog — "What Is Swarm Intelligence? From Ant Colonies to LLM Agent Swarms": https://www.swarms.ai/blog/what-is-swarm-intelligence
- Super Agent — "Agent Swarm Architecture: The Complete Guide": https://super-agent.ai/blog/agent-swarm-architecture

## Communication mechanisms: blackboards, mailboxes, surveys

- "Exploring Advanced LLM Multi-Agent Systems Based on Blackboard Architecture" (bMAS, 2025): https://arxiv.org/html/2507.01701v1
- "LLM-based Multi-Agent Blackboard System for Information Discovery in Data Science" (2025): https://arxiv.org/html/2510.01285v1
- "LLM-Based Multi-Agent Orchestration: A Survey of Frameworks, Communication Protocols, and Emerging Patterns" (*Future Internet* 18(6):326, 2026): https://www.mdpi.com/1999-5903/18/6/326
- "A Comprehensive Survey on Agent-to-Agent Communication in Multi-agent LLM Systems" (Springer, 2026): https://link.springer.com/chapter/10.1007/978-3-032-27691-9_4
- "Beyond Self-Talk: A Communication-Centric Survey of LLM-Based Multi-Agent Systems" (2025): https://arxiv.org/html/2502.14321v1
- "Creativity in LLM-based Multi-Agent Systems: A Survey" (EMNLP 2025): https://aclanthology.org/2025.emnlp-main.1403.pdf
- Actor-model / agentic-inbox patterns: https://zylos.ai/research/2026-03-10-actor-model-communicating-agent-patterns/ · https://agentdraft.io/blog/agentic-email-inbox-multi-agent-teams · https://lobstermail.ai/blog/multi-agent-email-coordination-how-ai-agents-use-inboxes-to-work-together
- Orchestration-pattern practitioner guides: https://gurusup.com/blog/agent-orchestration-patterns · https://www.glukhov.org/ai-systems/architecture/multi-agent-orchestration-patterns/
- Framework comparisons (2026): https://www.langchain.com/resources/ai-agent-frameworks · https://gurusup.com/blog/best-multi-agent-frameworks-2026 · https://openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared

## Emergent communication

- Mordatch & Abbeel — "Emergence of Language with Multi-agent Games" (2017): https://arxiv.org/abs/1705.11192
- Lowe et al. — "Natural Language Does Not Emerge 'Naturally' in Multi-Agent Dialog" (2017): https://arxiv.org/abs/1706.08502
- "Emergent Linguistic Phenomena in Multi-Agent Communication Games" (2019): https://arxiv.org/abs/1901.08706

## Protocols

- MCP — Anthropic, "Introducing the Model Context Protocol" (Nov 2024): https://www.anthropic.com/news/model-context-protocol · Wikipedia: https://en.wikipedia.org/wiki/Model_Context_Protocol
- A2A — Google, "Announcing the Agent2Agent Protocol (A2A)" (Apr 9, 2025): https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/ · spec: https://a2a-protocol.org/latest/ · IBM overview: https://www.ibm.com/think/topics/agent2agent-protocol
- ACP — Zed, Agent Client Protocol (2025): https://zed.dev/acp · https://agentclientprotocol.com/get-started/introduction · JetBrains: https://www.jetbrains.com/acp/

## Monitoring, oversight, CoT

- Kutasov et al. — "Chain of Thought Monitorability: A New and Fragile Opportunity for AI Safety" (2025): https://arxiv.org/pdf/2507.11473
- "Noticing the Watcher: LLM Agents Can Infer CoT Monitoring from Blocking Feedback" (2026): https://arxiv.org/html/2603.16928v1
- "When AIs Judge AIs: The Rise of Agent-as-a-Judge Evaluation for LLMs" (2025): https://arxiv.org/html/2508.02994v1
- "Covert Assistance: Helpful LLM Agents Evade Oversight in Multi-Agent Systems" (2026): https://arxiv.org/html/2609.39050
- Langfuse — "AI Agent Observability, Tracing & Evaluation": https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse

## Security: injection, egress, sandboxing

- Trezala — "Prompt Injection in AI Agents: Detection, Prevention, and Architecture": https://www.trezalabs.com/blog/prompt-injection-attacks-on-ai-agents
- Striker — "Agent Hijacking: How Prompt Injection Compromises AI Agents": https://www.straiker.ai/blog/agent-hijacking-how-prompt-injection-leads-to-full-ai-system-compromise
- Obsidian — "Prompt Injection Attacks on AI Agents": https://www.obsidiansecurity.com/blog/prompt-injection
- "From Prompt Injections to Protocol Exploits: Threats in LLM-Powered AI Agents Workflows" (2025): https://arxiv.org/html/2506.23260v1
- Firecrawl — "AI Agent Sandbox: How to Safely Run Autonomous Agents in 2026": https://www.firecrawl.dev/blog/ai-agent-sandbox
- Northflank — "How to design networking for secure AI-agent sandboxes": https://northflank.com/blog/how-to-design-networking-for-secure-ai-agent-sandboxes
- Blaxel — "Egress control for AI agents: deny-by-default networking": https://blaxel.ai/blog/egress-control-deny-by-default-ai-agents
- SpecStory — "What is egress control?": https://specstory.com/learning/environments/egress-control
- innoq — "I sandboxed my coding agents. Now I control their network." (Mar 2026): https://www.innoq.com/en/blog/2026/03/dev-sandbox-network/

## Internal KainBain references (repo docs)

- `docs/KB Architecture.md` — one session per stage; server-authoritative; no in-memory storage
- `AGENTS-MAP.md` — domain ownership map
- `api/reviewStore.js`, `api/routes/review.js`, `api/reviewCommentFormatter.js` — review comments store/routes
- `api/promptCuration.js`, `shared/promptLayout.js` — curated prompt assembly
- `api/skills/skillInjection.js`, `api/skills/skillsRegistry.js` — skill injection
- `api/agent/harnessContract.js`, `api/agent/sessionEvents.js`, `api/crew/sessionCapabilities.js` — harness boundary
- `api/agentRunner.js`, `shared/modelAliases.js` — per-stage model resolution and aliases
- `api/flow/singleActiveInvariant.test.js`, `api/flow/circuitBreaker.js`, `api/flow/stageFailureRouting.js` — serialized execution, gating, failure routing
- `api/watch/stageReports.js`, `api/agent/logStream/` — reports and structured logging
- `docs/research/compliance-uk-eu/` — repo precedent for multi-file research reports and retention questions
- `docs/research/harness2/` — repo precedent for research→implementation mapping
