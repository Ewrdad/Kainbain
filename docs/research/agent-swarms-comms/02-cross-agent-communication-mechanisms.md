# Cross-Agent Communication: Mechanisms, Evidence, and Economics

How do agents actually talk to each other in multi-agent LLM systems? The
literature and production systems converge on a small set of mechanisms. Each
has different cost, auditability, and failure modes — the choice of mechanism
is the design.

## Mechanism 1: Natural-language dialogue (conversation as substrate)

The dominant research paradigm (ChatDev, CAMEL, AutoGen, AgentVerse): agents
exchange free-form natural language, roles are prompt-defined, and the
conversation *is* the coordination mechanism.

- **Pros:** maximally flexible; agents can negotiate, clarify, argue; no
  schema to design; matches how the models were trained.
- **Cons:** unbounded token growth; context pollution (every agent re-reads
  the whole thread — the "game of telephone"); semantic drift as information
  is restated ("From Spark to Fire", arXiv 2603.04474, models error cascades
  in exactly this channel); hard to monitor at scale; emergent shorthand
  becomes unreadable to humans (Lowe et al. 2017).
- **Evidence:** Anthropic found subagents "distracting each other with
  excessive updates" and duplicate work when delegation instructions were
  vague — free-form dialogue amplifies coordination noise.

## Mechanism 2: Structured artifacts (documents, not chat)

MetaGPT's insight: standardize **what is exchanged** (requirement docs,
design docs, APIs, test reports) rather than the conversation around it.
Anthropic's appendix: write subagent output to the filesystem, pass
lightweight references. KainBain's stage reports are this pattern already.

- **Pros:** bounded size; auditable; versionable; injectable selectively into
  later prompts; survives session death (KainBain's one-session-per-stage
  design makes this essential — a conversation cannot survive the session,
  an artifact can); cheap to monitor (a file diff, not a transcript).
- **Cons:** no negotiation — a downstream agent can't ask "what did you
  mean?"; artifacts must be curated or they rot; the author must anticipate
  the reader's needs.
- **Evidence:** MetaGPT's SOP-structured document flow measurably reduced
  the chaos of free-form ChatDev-style chat; Anthropic's filesystem pattern
  cut token overhead and information loss.

## Mechanism 3: Blackboard / shared memory

Classic AI architecture (Erman et al. 1980) revived for LLMs: a shared
read/write surface; agents post contributions; specialists react.

- bMAS ("Exploring Advanced LLM Multi-Agent Systems Based on Blackboard
  Architecture", arXiv 2507.01701) and "LLM-based Multi-Agent Blackboard System
  for Information Discovery in Data Science" (arXiv 2510.01285): blackboard
  collaboration can outperform pure dialogue, **but only with active content
  management** — "effective management of content of the blackboard can
  facilitate meaningful communication among agents and at the same time reduce
  token consumption"; unmanaged, it becomes noise that every agent pays to
  read.
- **Pros:** democratic; no sender/receiver coupling; naturally human-inspectable
  (one place to look); fits KainBain's kanban mental model ("the board").
- **Cons:** needs a curator (summarize, prune, tag); write conflicts;
  information overload; a shared surface is also a shared attack surface
  (any agent can write anything any other agent will read — see
  `05-risks-where-it-hurts.md` on injection propagation).

## Mechanism 4: Mailboxes / addressed asynchronous messages

Actor-model style: each agent (or role, or stage) has an inbox; messages are
addressed, delivered asynchronously, and survive the sender's death.

- **Pros:** the natural fit for **serialized execution** (KainBain runs at
  most one live agent at a time — `api/flow/singleActiveInvariant.test.js`);
  targeted (no broadcast noise); dead-letter and retry semantics map onto
  KainBain's stage-failure routing; per-recipient context injection is
  bounded.
- **Cons:** routing rules needed (who may message whom); a message to a stage
  that already ran needs a policy (deliver to next stage? drop? escalate?);
  more machinery than a flat channel.
- **Evidence:** the incident's own message board was effectively a mailbox
  system ("reply to JAN183411's mailbox") — agents *invented* this pattern
  when given nothing. Practitioner literature on "agentic inboxes" (2026)
  treats per-agent inboxes as the standard fix for coordination in
  asynchronous multi-agent teams.

## Mechanism 5: Debate / deliberation protocols

Not a transport, but a *use* of dialogue: multiple agents propose, critique,
and converge; a judge or vote decides.

- Du et al., "Improving Factuality and Reasoning in Language Models through
  Multiagent Debate" (ICML 2024, arXiv 2305.14325): N instances of the same
  model debate; final answer by last-round extraction or majority vote;
  improved factuality and math reasoning.
- Liang et al., "Encouraging Divergent Thinking… through Multi-Agent Debate"
  (EMNLP 2024, arXiv 2305.19118): "tit-for-tat" debate + judge to counter
  premature consensus.
- **But** (see `05`): "Talk Isn't Always Cheap" (arXiv 2509.05396) shows
  debate can *degrade* below single-agent performance (sycophancy from RLHF);
  "Peacemaker or Troublemaker" (arXiv 2509.23055) and "Can LLM Agents Really
  Debate?" (arXiv 2511.07784) show homogeneous groups amplify shared biases;
  "Debate or Vote" (arXiv 2508.17536) is literally the question of which
  aggregation to trust.
- **Design implications:** debate needs (a) diversity, (b) a dissent-
  preserving format, (c) a judge stronger than the debaters, (d) a stopping
  rule. KainBain's human review gate is a natural judge — a "debate" stage
  whose output is reviewed by a human fits the existing product shape.

## Mechanism 6: Handoffs

OpenAI Swarm's core primitive: transfer control (and conversation) to another
agent. Minimal, explicit, auditable at the transfer point. A handoff is a
one-shot, structured message — the degenerate case of a mailbox that transfers
ownership. KainBain's stage advancement is already a handoff; what's missing
is the *payload* (a message from the outgoing agent to the incoming one).

## Mechanism 7: Tool-mediated / protocol-mediated comms (MCP, A2A)

Agents communicate by calling tools exposed over MCP (`post_message`,
`read_channel`, `assign_task`), or across systems via A2A. This is the most
"infrastructural" mechanism: the comms channel becomes part of the agent's
tool surface, uniform across harnesses — which matters for KainBain because
the engine deliberately does not know which harness it is talking to
(`api/agent/harnessContract.js`, `docs/KB Architecture.md`).

- **Pros:** harness-agnostic; standard; permission-interceptable (KainBain's
  harnesses already intercept permission requests — a comms tool can be
  gated the same way); auditable at the tool-call layer (every message is a
  `tool_started`/`tool_finished` event in the normalized vocabulary,
  `api/agent/sessionEvents.js`).
- **Cons:** MCP server lifecycle to run; tool-call overhead per message;
  agents must be prompted to use the tool (a skill can do this —
  `api/skills/skillInjection.js`).

## The economics of agent talk

Numbers worth designing against:

- Anthropic: agents use ~**4×** the tokens of chat; multi-agent systems
  ~**15×**; token usage explained **80%** of research-task performance
  variance. Multi-agent is justified only where task value pays for it.
- "Talk Isn't Always Cheap" (arXiv 2509.05396): debate rounds cost tokens
  *and* can reduce accuracy.
- Blackboard systems reduce token consumption **only when curated** (bMAS).
- Artifact handoff (Anthropic appendix) minimizes both token cost and
  information loss.
- The incident: ~1,200 agents exchanging on the order of 10⁵–10⁶ messages
  over ~2 months — communication volume was not the bottleneck, *oversight*
  was.

Rules of thumb that fall out: **bound message size, bound channel size,
curate aggressively, prefer artifacts over transcripts, and never let a
channel grow unread into a prompt.** KainBain's prompt curation already
enforces injected-text caps for skills (`api/skills/skillInjection.js`,
`maxChars`) — the same cap pattern should apply to injected channel history.

## What good agent-to-agent messages look like (design guidance from the literature)

From Anthropic's delegation lessons, MetaGPT's SOPs, and the MAST failure
taxonomy (file `05`), a well-formed inter-agent message has:

1. **An objective** ("what decision/action is this message for?")
2. **A bounded payload** (the artifact or the distilled finding, not the journey)
3. **Explicit scope** (which task/stage it concerns; what it is *not* about)
4. **An output format** for the expected response
5. **Attribution** (which agent/stage/model wrote it — essential for
   monitoring and for not trusting peer goals blindly, the incident's
   "agents adopting goals from one another" failure)
6. **A freshness/size budget** (so readers can cap what they ingest)

This is essentially a ticket-comment schema — which is why "agents comment
on tickets" is the cheapest first implementation for KainBain (file `06`).
