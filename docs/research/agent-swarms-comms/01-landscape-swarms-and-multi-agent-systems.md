# The Landscape: AI Swarms and Multi-Agent Systems (as of October 2026)

## What "swarm" means here — and what it doesn't

"Swarm" is used loosely in 2026 marketing. In the research and engineering
literature it maps to a **decentralized or semi-decentralized multi-agent
system**: many LLM-backed agents with (partial) autonomy, communicating to
divide labor, and with no single hard-coded workflow. That contrasts with:

- **Workflows / pipelines** — fixed, pre-declared control flow (what KainBain
  is today: stages advance deterministically; see `docs/KB Architecture.md`).
- **Orchestrator–worker (hierarchical)** — one lead agent decomposes and
  delegates to subagents (Anthropic's Research system is the canonical
  production example).
- **Swarms (decentralized)** — peer-to-peer, emergent coordination, no fixed
  topology. Classic swarm intelligence (ant colonies, particle swarm
  optimization, boids) is the heritage: simple local rules, no central
  controller, intelligence in the interaction pattern.
- **Networks / meshes (semi-structured)** — fixed or learned graph topologies
  (MacNet's DAGs, DyLAN's dynamic agent network, GPTSwarm's optimizable
  graphs).

A 2026 survey of LLM-based multi-agent orchestration proposes exactly this
three-topology taxonomy — centralized, decentralized, hierarchical — plus a
dynamic/adaptivity axis ("LLM-Based Multi-Agent Orchestration: A Survey of
Frameworks, Communication Protocols, and Emerging Patterns", *Future Internet*
18(6):326). Communication-centric surveys ("Beyond Self-Talk", arXiv
2502.14321; "A Comprehensive Survey on Agent-to-Agent Communication in
Multi-agent LLM Systems", Springer 2026) organize the same field by *how
messages flow* rather than by topology.

Practical 2026 consensus (see also the practitioner guides in `07-sources.md`):
swarms and meshes are real but niche — best for **exploration-heavy,
breadth-first, hard-to-decompose** work. Hierarchical orchestrator–worker is
the production default. Strict workflows win for anything with tight
sequential dependencies. KainBain sits in the workflow camp; the question is
how much *structured* peer communication to bolt on.

## Topology comparison

| Topology | Control | Best for | Cost/complexity | Example |
| --- | --- | --- | --- | --- |
| Pipeline/workflow | Fully pre-declared | Sequential, verifiable steps | Lowest | KainBain stages today |
| Orchestrator–worker | Lead agent delegates | Breadth-first research, fan-out | Medium | Anthropic Research (Opus 4 lead + Sonnet 4 subagents) |
| Hierarchical (multi-level) | Nested orchestrators | >5–8 workers, layered tasks | Higher | Enterprise agent platforms |
| Swarm (decentralized) | Emergent, peer-to-peer | Exploration, redundancy, resilience | High coordination risk | OpenAI's incident swarm; PSO-style LLM swarms |
| Network/mesh (DAG) | Fixed or learned graph | Structured collective reasoning | Medium-high | MacNet, DyLAN, GPTSwarm |
| Blackboard | Shared read/write artifact | Democratic collaboration, token economy | Medium (needs curation) | bMAS (arXiv 2507.01701) |

Swarm-intelligence heritage applied to LLMs: "Large Language Models as Particle
Swarm Optimizers" (arXiv 2504.09247) shows PSO naturally maps onto multi-agent
coordination; LLM+swarm-robotics surveys (e.g. PMC 2025) replace hard-coded
robot controllers with LLM prompts. The lesson from decades of swarm research
that transfers directly: **swarm performance comes from diversity + local
rules, and collapses under correlated behaviour** — which is precisely how
LLM swarms fail (see `05-risks-where-it-hurts.md`).

## The framework zoo (what people actually build with)

| Framework | Origin | Model of collaboration | Notes |
| --- | --- | --- | --- |
| ChatDev (arXiv 2307.07924, ACL 2024) | OpenBMB | Role-play a software company (CEO/CTO/programmer/reviewer/tester), "chat chain" over waterfall phases, inception prompting | The paper that established *linguistic communication as the coordination substrate* for software work |
| MetaGPT (arXiv 2308.00352, ICLR 2024) | Sirui Hong et al. | SOPs; structured documents passed between roles; publish/subscribe to a shared message pool | Key idea: **standardize the *artifacts* agents exchange, not just the chat** |
| CAMEL (arXiv 2303.17760, NeurIPS 2023) | Li et al. | Two-agent role-play (AI user ↔ AI assistant), inception prompting | Foundational for "autonomous cooperation without human input" |
| AutoGen / AG2 (arXiv 2308.08155) | Microsoft | Conversable agents; flexible natural-language ↔ code control transitions; human-in-the-loop | The general-purpose conversation substrate |
| OpenAI Swarm (2024, experimental) | OpenAI | Lightweight "routines + handoffs"; explicitly educational | Handoff = transfer of conversation to another agent; closest thing to a minimal comms primitive |
| CrewAI / LangGraph / Google ADK / OpenAI Agents SDK | Various | Production orchestration (crews, graphs, supervisors) | 2026 comparisons converge on: LangGraph for stateful control flow, vendor SDKs for their own models |
| MacNet (arXiv 2406.07155, ICLR 2025) | OpenBMB | Heterogeneous agents on directed acyclic graphs; collective reasoning | "Scaling LLM-based multi-agent collaboration" |
| DyLAN (arXiv 2310.02170) | SALT-NLP | Dynamic LLM-agent network; agent-team optimization; debate for selection | Shows *team composition* can be optimized, not just prompts |
| GPTSwarm (arXiv 2402.16823, AISTATS 2024) | Zhuge et al. | Agents as nodes in an **optimizable graph**; RL over topology and prompts | "Self-improving" agents; the graph is the program |
| AgentVerse (arXiv 2308.10848, ICLR 2024) | OpenBMB | Expert recruitment → collaborative decision → feedback; multi-agent simulation | Explicitly studies *emergent* swarm behaviours |
| ADAS / Meta Agent Search (arXiv 2408.08435, ICLR 2025) | Hu, Lu, Clune | A meta-agent **designs** agentic systems | Recursive self-improvement; relevant to "let agents improve the comms protocol itself" |

## Protocols: the plumbing layer that matters more than the framework

- **MCP — Model Context Protocol** (Anthropic, Nov 2024). Standardizes
  agent ↔ tool/data connections. For KainBain this is the cleanest way to
  expose a comms channel to *any* harness as a tool (`post_message`,
  `read_messages`), without touching the harness boundary per-harness.
- **A2A — Agent2Agent Protocol** (Google, Apr 9 2025; now under the Linux
  Foundation, 50+ partners). Agent discovery, authentication, task delegation
  *across* vendors/frameworks. Most relevant if KainBain agents ever need to
  talk to agents outside KainBain. Overkill for intra-instance comms today.
- **ACP — Agent Client Protocol** (Zed, 2025; JetBrains co-development Oct
  2025). Agent ↔ *editor/IDE* protocol. KainBain already speaks ACP to the
  `vibe` harness (`api/agent/harnesses/vibe/`, `docs/EngineDetails/VibeHarness.md`)
  — evidence that protocol-based agent integration is already a pattern here.
- **Emergent-communication research** (Mordatch & Abbeel 2017, arXiv
  1705.11192; Lowe et al. 2017, arXiv 1706.08502; Lazaridou et al.; arXiv
  1901.08706): language *can* emerge between agents trained to cooperate, but
  "natural language does not emerge 'naturally'" — unconstrained learned
  protocols drift into unreadable shorthand. Direct implication: **if agents
  are allowed to evolve their own communication format, humans lose the
  ability to monitor the channel** — the exact failure the user wants to
  avoid. Keep the message format structured and human-readable.

## Anthropic's production system — the most instructive data point

Anthropic's "How we built our multi-agent research system" (engineering blog,
late 2025) is the best-documented production multi-agent system:

- Orchestrator–worker: a LeadResearcher spawns parallel Subagents, each with
  its own context window; a CitationAgent finalizes.
- Opus 4 lead + Sonnet 4 subagents beat a single Opus 4 agent by **90.2%** on
  an internal research eval — but at **~15× the tokens of a chat** (agents
  generally ~4×).
- On BrowseComp, **token usage alone explained 80%** of performance variance
  (tool-call count and model choice explained the rest). Multi-agent systems
  "work mainly because they help spend enough tokens to solve the problem."
- Lessons that transfer to KainBain: teach the orchestrator to delegate
  (objective + output format + tool guidance + task boundaries per message);
  scale effort to query complexity; tool descriptions are as critical as UI;
  **write subagent outputs to the filesystem and pass lightweight references** —
  "to minimize the 'game of telephone'"; synchronous subagent execution is a
  bottleneck, asynchronous adds coordination/state/error-propagation problems.

That last appendix point is the single most KainBain-relevant sentence in the
whole literature: artifact-mediated handoff beats conversation-mediated
handoff for fidelity *and* token cost. KainBain already does this between
stages (distilled reports, never transcripts — `docs/KB Architecture.md`).

## Where this leaves the design space

For a system like KainBain — serialized execution, one fresh session per
stage, disk-persisted everything, human review gates — the viable swarm
patterns are, in order of fit:

1. **Artifact-mediated handoff** (already 80% there via stage reports) —
   formalize agent-to-agent messages as first-class artifacts.
2. **Blackboard / shared notes per task** — one writable, curated, human-visible
   surface; matches bMAS findings that a blackboard *reduces* token
   consumption when managed (and explodes it when unmanaged).
3. **Mailboxes** — asynchronous, addressed messages; the natural fit for
   serialized execution (no agent is ever live at the same time as another).
4. **Live chat / Slack-style** — only meaningful if concurrency is introduced;
   today it would be a mailbox with extra steps and worse ergonomics.
5. **Full emergent swarm** — not recommended; unmonitorable, and the incident
   case study (`03`) is what it looks like when it goes wrong.
