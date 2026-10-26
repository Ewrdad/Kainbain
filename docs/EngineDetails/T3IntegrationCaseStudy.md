Replicating the T3 Code Architecture: A Technical Guide to Multi-Agent Harness Integration and Event-Sourced Orchestration  
Architectural Paradigm of an Agent Harness Control Surface  
Modern AI-assisted software engineering has fractured into isolated command-line tools, proprietary desktop wrappers, and bespoke integrated development environment (IDE) plugins. Each major model vendor optimizes its foundation models around a specific execution environment—referred to as an agent harness—which governs how the model inspects filesystems, executes shell commands, parses diffs, and manages conversation context. T3 Code (pingdotgg/t3code), an MIT-licensed TypeScript monorepo built by Ping Labs (T3 Tools), resolves this fragmentation by operating not as a coding agent or model provider, but as an agent harness control surface. Rather than reimplementing prompt loops or reselling API tokens, T3 Code runs a lightweight local server (t3code-server) alongside local Git repositories to spawn, supervise, and multiplex the official CLI harnesses already installed and authenticated on the host machine.  
This Bring Your Own Subscription (BYOS) and Bring Your Own Key (BYOK) architecture yields three foundational engineering advantages for projects seeking to replicate its behavior. First, delegating execution to native harnesses ensures that each model operates within the exact tool-use loop upon which it was reinforcement-trained—such as Claude Code for Anthropic models and Codex CLI for OpenAI models. Second, the control plane introduces zero token markup or artificial quota caps, preserving existing vendor subscription limits and host credentials such as SSH agents, OAuth tokens, and local environment variables. Third, decoupling agent execution from the user interface allows stateless view surfaces—including an Electron desktop wrapper, a React and Vite web application (app.t3.codes), and React Native iOS and Android clients—to attach to, monitor, and steer long-running agent sessions remotely over authenticated WebSocket Remote Procedure Calls (RPC).  
Structurally, the control plane is organized across four distinct architectural tiers that isolate user interfaces from asynchronous, untrusted CLI subprocesses. At the top tier, stateless client surfaces (Web, Electron Desktop, and iOS/Android mobile apps) converge into a shared client runtime (packages/client-runtime) that communicates over typed WebSocket RPC with the second tier: the local Environment Server and V2 Orchestrator. Within this orchestration tier, a pure Decider validates incoming commands and commits state transitions atomically via an EventSink into SQLite alongside a Read Model Projector and an Outbox Effect Worker. The Outbox Effect Worker dispatches side effects downward into the third tier—the Provider Adapter Boundary—which houses the ACP Session Runtime, the Codex JSON-RPC Adapter, the Claude SDK Adapter, and the OpenCode Runtime. Finally, these adapters manage the fourth tier on the host operating system, spawning isolated agent CLI subprocesses over standard input/output (stdio) and capturing workspace state via hidden Git ref checkpoints within local Git worktrees.  
To prevent state divergence across desktop, web, and mobile surfaces, T3 Code enforces strict ownership boundaries documented in docs/internals/overview.md. Provider subprocesses, pseudo-terminals (PTYs), Git repositories, and project filesystems belong exclusively to the server domain (apps/server). Remote clients are strictly prohibited from substituting client-local filesystems, credentials, or machine states for the server environment's state; even the Electron desktop application, which bundles the Node.js/Bun backend server, forces its renderer process to communicate across the exact same authenticated RPC boundary as a remote smartphone client. Shared connection lifecycle, environment authentication, and state reduction logic are centralized in packages/client-runtime, while all wire-crossing payloads and serialized Schema.TaggedError definitions reside in packages/contracts (@t3tools/contracts).  
Because clients and host environments upgrade on independent release cadences, the RPC boundary relies on explicit capability negotiation via an environment descriptor rather than assuming coordinated version numbers. For example, pull request linking negotiates whether a server supports multi-link arrays (threadPullRequests: true) or legacy single-link metadata (threadPullRequestLinking: true), ensuring backward compatibility across schema evolutions and environment downgrades. Furthermore, socket authentication establishes transport identity but does not grant blanket method authorization; client mutations must wrap calls in createEnvironmentRpcCommand and validate permissions against CLIENT\_GUARDED\_RPC\_SCOPES before the server authoritatively verifies the grant. Connectivity across network topologies is abstracted into four transport routes—T3 Connect (which brokers initial handshakes and push notifications before routing traffic directly over a Cloudflare tunnel), LAN pairing (via local QR code or token on port 3773), Tailscale HTTPS (t3 serve --tailscale-serve), and direct SSH environment bridging—with the client runtime automatically selecting the lowest-latency route that responds.  
| Architectural Layer | Monorepo Location | Primary Responsibilities | Strictly Prohibited Operations |  
|---|---|---|---|  
| Wire Contracts | packages/contracts | Defines shared Effect Schemas, RPC payloads, normalized orchestration events, and serializable Schema.TaggedError types. | Holding runtime state, executing I/O, or importing platform-specific Node.js/DOM modules. |  
| Client Runtime | packages/client-runtime | Manages multi-environment WebSocket connections, reconnect state machines, capability negotiation, and thread state reducers. | Spawning processes, reading local Git repositories, or bypassing server authorization grants. |  
| Client UI Surfaces | apps/web, apps/desktop, apps/mo\[span\_72\](start\_span)\[span\_72\](end\_span)\[span\_79\](start\_span)\[span\_79\](end\_span)bile | Renders dumb UI projections, diff viewers, inline approval cards, and platform-specific shells (Electron, Expo/React Native). | Containing provider-specific branching (if (provider === ...)) or mutating state outside RPC commands. |  
| V2 Orchestrator | apps/server/src/orchestration-v2 | Serializes incoming commands, runs pure decision logic, commits atomic SQLite transactions (EventSink), and dispatches outbox effects. | Performing direct external I/O, filesystem writes, or subprocess spawning inside the command decision loop. |  
| Provider Adapters | apps/server/src/provider | Probes CLI binaries on PATH, manages subprocess lifecycles, translates stdio/ACP/SDK streams into normalized events, and handles retries. | Leaking vendor-specific wire formats into the core orchestration domain or UI components. |  
Taxonomy of Supported Agent Harnesses and Transport Modalities  
A foundational design principle of T3 Code is that complexity belongs at the adapter boundary. The orchestration engine interacts exclusively with normalized commands and events, remaining agnostic to whether an underlying agent communicates via standardized JSON-RPC, a proprietary vendor SDK, or raw CLI flags. As of late 2026, T3 Code supports six primary coding agent harnesses, each requiring local authentication on the host server prior to orchestration.  
| Provider Harness | Host Binary / Entrypoint | Authentication Command | Primary Integration Transport in T3 Code | Key Adapter / Runtime Modules |  
|---|---|---|---|---|  
| OpenAI Codex | codex | codex login | Bidirectional JSON-RPC over stdio (app-server / ACP bridge) | CodexProvider.ts, ProviderRegistry.ts, CodexTextGeneration.ts |  
| Claude Code | claude | claude auth login | Anthropic Agent SDK (@anthropic-ai/claude-agent-sdk) / ACP Wrapper (@agentclientprotocol/claude-agent-acp) | ClaudeAdapt\[span\_121\](start\_span)\[span\_121\](end\_span)\[span\_123\](start\_span)\[span\_123\](end\_span)\[span\_125\](start\_span)\[span\_125\](end\_span)er.ts, ProviderCommandReactor.ts |  
| Cursor Agent | agent / cursor-agent | agent login | Agent Client Protocol (ACP) over stdio (cursor-agent acp / agent --force acp) | AcpSessionRuntime.ts, AcpAdapterV2.ts, CursorAcpSupport.ts, CursorTransportFailure.ts |  
| Grok Build | grok | grok login | Agent Client Protocol (ACP) over stdio (grok agent --permission-mode ... stdio) | AcpSessionRuntime.ts, AcpAdapterV2.ts, GrokAcpSupport.ts |  
| OpenCode | opencode | opencode auth login | Managed CLI Server & Subprocess (opencode v2.0.x runtime & ACP support) | opencodeRuntime.ts, ProviderRegistry.ts |  
| Google Antigravity | agy\_acp\_server (Managed binary) | In-app Settings install & Google OAuth Sign-In (No manual CLI install) | Agent Client Protocol (ACP) over stdio | AntigravityDriver.ts, AntigravityAdapterV2.ts, AntigravityAcpSupport.ts |  
When replicating this multi-harness architecture, engineering teams encounter three distinct subprocess integration patterns across the supported providers. The first and increasingly dominant pattern is Standardized ACP over Standard I/O (stdio), used by harnesses such as Cursor (cursor-agent), Grok Build (grok), Google Antigravity (agy\_acp\_server), and community ACP agents (gjc, openclaw, qwen-code) that expose a dedicated acp or stdio subcommand. T3 Code consolidates this logic into a shared apps/server/src/provider/acp/ subsystem (AcpSessionRuntime.ts, AcpAdapterV2.ts, AcpSessionConfig.ts, AcpRegistrySupport.ts), parameterizing vendor quirks through lightweight "flavor" support modules (CursorAcpSupport.ts, GrokAcpSupport.ts, AntigravityAcpSupport.ts).  
The second integration pattern involves Vendor-Specific JSON-RPC Servers and Agent SDKs. OpenAI's Codex CLI (codex) serves as T3 Code's original reference integration, communicating via structured JSON-RPC over stdio (CodexProvider.ts). Anthropic's Claude Code (claude) integrates through ClaudeAdapter.ts using the Anthropic Agent SDK (@anthropic-ai/claude-agent-sdk), which spawns the underlying claude binary, streams structured tool-use and thinking messages, and can optionally be bridged via @agentclientprotocol/claude-agent-acp using \_meta.claudeCode.emitRawSDKMessages when raw cost, rate-limit, or context compaction telemetry is required. The third pattern comprises Local Daemon and CLI State Wrappers for harnesses like OpenCode (opencode), which maintain their own local SQLite database and background server lifecycle. Rather than treating the agent as a stateless pipe, opencodeRuntime.ts coordinates CLI discovery queries (models --verbose and agent list) and manages the local OpenCode server startup lifecycle before routing thread turns.  
Beyond session execution, T3 Code maps four universal permission modes selected in the thread composer into the specific enforcement primitives of each harness: Supervised (which prompts the user for approval before file edits or shell commands), Auto-accept edits (which permits file modifications automatically while gating shell execution), Auto (which delegates routine action approval to the provider's internal safety reviewer on Codex, Claude, Cursor, and Grok, while falling back to explicit prompts on unsupported harnesses), and Full Access (which bypasses interactive permission gates entirely). Similarly, T3 Code separates permission mode from interaction mode (Chat/Normal vs. Plan Mode), translating Plan Mode into provider-specific read-only exploration instructions prior to code generation. Because conversation history is normalized in SQLite, T3 Code also supports mid-thread agent switching—for instance, generating an architectural plan with Claude Code and handing the thread over to Codex for file edits. Short threads transfer in full, whereas long threads transfer the original user request, the most recent messages, and summarized command outputs.  
Deep Dive: The Agent Client Protocol and Adapter Normalization  
To avoid writing bespoke parsers for every emerging CLI agent, modern control planes rely heavily on the Agent Client Protocol (ACP). Originally introduced by Zed Industries on August 27, 2025 (with Google's Gemini CLI as its inaugural integration) and co-developed with JetBrains starting in October 2025, ACP is an Apache-2.0 licensed standard based on JSON-RPC 2.0 over newline-delimited standard I/O (stdio).  
Architects replicating T3 Code must first disambiguate the acronym ACP, which refers to three entirely unrelated specifications in contemporary AI literature. In the context of coding editors and T3 Code's apps/server/src/provider/acp/ architecture, ACP denotes the Agent Client Protocol co-governed by Zed and JetBrains, which connects code editors or control planes to coding agents over stdio JSON-RPC 2.0. By contrast, IBM BeeAI and AGNTCY previously developed an HTTP/REST-based Agent Communication / Connect Protocol for multi-agent orchestration, which was officially archived in April 2026 in favor of the Agent-to-Agent (A2A) invocation standard. A third specification, the Agentic Commerce Protocol introduced by OpenAI and Stripe in September 2025, governs merchant checkout and payment flows and has no relation to software development tools.  
Within the coding stack, ACP, the Model Context Protocol (MCP), and the Language Server Protocol (LSP) form three complementary JSON-RPC layers that unbundle distinct relationships:  
| Protocol Standard | Governance & License | Primary Relationship | Communication Directionality | Core Primitives |  
|---|---|---|---|---|  
| LSP (Language Server Protocol) | Microsoft / Open Community | Editor \\longleftrightarrow Language Server | Client-initiated queries & server diagnostics | Completions, go-to-definition, AST diagnostics. |  
| ACP (Agent Client Protocol) | Zed Industries & JetBrains (Apache 2.0) | Editor / Control Surface \\longleftrightarrow Coding Agent | Bidirectional (session/p\[span\_211\](start\_span)\[span\_211\](end\_span)rompt in; session/update & requestPermission out) | Session lifecycle, streaming diffs/chunks, tool permission gates, terminal display. |  
| MCP (Model Context Protocol) | Anthropic / Agentic AI Foundation | Coding Agent \\longleftrightarrow External Tools & Data | Agent-initiated tool calls (tools/call) to MCP servers | Context resources, database queries, CI/CD build inspection, browser automation. |  
In T3 Code, both ACP and MCP operate simultaneously. T3 Code acts as an ACP Client downward toward local agent harnesses (AcpSessionRuntime.ts), while simultaneously exposing an MCP Server endpoint (apps/server/src/mcp/) upward so external agents (such as a terminal Claude Code instance or ChatGPT) can create, inspect, and steer T3 Code threads programmatically.  
The ACP Connection Lifecycle and Bidirectional RPC Flow  
When T3 Code's AcpSessionRuntime spawns an ACP-compliant harness using the official @agentclientprotocol/sdk TypeScript package (which superseded the deprecated @zed-industries/agent-client-protocol package), communication proceeds through a deterministic four-phase state machine over ndJsonStream.  
During the initial Handshake and Capability Exchange (initialize and authenticate) phase, the control plane spawns the agent binary with piped stdin, stdout, and stderr, wrapping process.stdout and process.stdin in a newline-delimited JSON stream (ndJsonStream). Crucially, stdout is strictly reserved for JSON-RPC frames; any diagnostic logging by the agent must route to stderr to prevent stream corruption. The client sends an initialize request specifying protocolVersion: 1 and client capabilities, and the agent responds with agentCapabilities (such as sessions: { new: true, load: false }) alongside required authenticationMethods.  
Once initialized, the runtime enters Session Instantiation (session/new or session/load), where the client establishes an isolated conversation context rooted in the workspace directory (cwd), optionally passing MCP server configurations and model or thinking effort overrides (AcpSessionConfig.ts). Although ACP standardizes configuration categories, individual harnesses advertise differing parameter IDs under those categories—for instance, codex-acp advertises model and reasoning\_effort, whereas claude-agent-acp advertises model and effort, requiring the adapter to normalize options by category rather than raw string identifier.  
During Turn Execution and Streaming Notifications (session/prompt and session/update), AcpAdapterV2 dispatches a session/prompt request whenever a user submits a message. Crucially, the session/prompt RPC request remains pending (held open) for the entire duration of the agent's turn. While the turn is active, the agent streams asynchronous session/update notifications (agent\_message\_chunk, tool\_call, plan updates, and file diffs) back to the client, which AcpAdapterV2 registers via runtime.handleSessionUpdate(...) and translates into normalized T3 Code orchestration events.  
Finally, Mid-Turn Permission Interception (requestPermission) leverages ACP's bidirectional transport whenever a destructive tool call or shell execution requires human authorization. While session/prompt is still held open, the agent acts as an RPC client toward the control plane, sending a requestPermission request containing the sessionId, toolCall descriptor (toolCallId, title), and available options such as allow\_once, allow\_always, or reject. T3 Code intercepts this call, emits a normalized approval-requested event to the SQLite event log, and renders an inline approval card across connected desktop, web, and mobile clients. Once the user responds on any connected device, the adapter resolves the pending requestPermission Promise with { outcome: { outcome: "selected", optionId } } (or { outcome: { outcome: "cancelled" } }), allowing the agent to resume execution and eventually resolve session/prompt with { stopReason: "end\_turn" }.  
Code Listing 1: ACP Client Harness Connection and Permission Interceptor  
The following TypeScript implementation demonstrates how to replicate T3 Code's AcpSessionRuntime and AcpAdapterV2 integration using Node.js child\_process.spawn and @agentclientprotocol/sdk:  
import { spawn, type ChildProcessWithoutNullStreams } from "node:child\_process";  
import { Readable, Writable } from "node:stream";  
import {  
  ClientSideConnection,  
  ndJsonStream,  
  type RequestPermissionRequest,  
  type RequestPermissionResponse,  
  type SessionNotification,  
} from "@agentclientprotocol/sdk";

export type NormalizedHarnessEvent =  
  | { type: "turn.text.delta"; threadId: string; text: string }  
  | { type: "turn.tool.call"; threadId: string; toolCallId: string; title: string }  
  | {  
      type: "turn.permission.requested";  
      threadId: string;  
      requestId: string;  
      toolCallId: string;  
      title: string;  
      options: Array<{ optionId: string; kind: string; label?: string }>;  
    }  
  | { type: "turn.completed"; threadId: string; stopReason: string }  
  | { type: "harness.stderr"; threadId: string; line: string };

export interface PendingPermissionResolver {  
  resolve: (decision: { approved: boolean; optionId?: string }) => void;  
}

export class AcpHarnessSession {  
  private child: ChildProcessWithoutNullStreams | null = null;  
  private connection: ClientSideConnection | null = null;  
  private acpSessionId: string | null = null;  
  private readonly pendingPermissions = new Map<string, PendingPermissionResolver>();

  constructor(  
    private readonly threadId: string,  
    private readonly binaryPath: string,  
    private readonly spawnArgs: string\[\],  
    private readonly workspaceCwd: string,  
    private readonly onEvent: (event: NormalizedHarnessEvent) => void,  
  ) {}

  public async start(envOverrides: Record<string, string> = {}): Promise<void> {  
    // Sanitize environment to prevent nested Claude/agent session detection traps  
    const sanitizedEnv: NodeJS.ProcessEnv = {  
      ...process.env,  
      ...envOverrides,  
      NODE\_NO\_WARNINGS: "1",  
    };  
    delete sanitizedEnv.CLAUDECODE;

    // Spawn in a detached process group so kill(-pid) can reap child subagents  
    this.child = spawn(this.binaryPath, this.spawnArgs, {  
      cwd: this.workspaceCwd,  
      env: sanitizedEnv,  
      stdio: \["pipe", "pipe", "pipe"\],  
      detached: process.platform !== "win32",  
    });

    this.child.stderr.setEncoding("utf8");  
    this.child.stderr.on("data", (chunk: string) => {  
      for (const line of chunk.split(/\\r?\\n/)) {  
        if (line.trim().length > 0) {  
          this.onEvent({ type: "harness.stderr", threadId: this.threadId, line });  
        }  
      }  
    });

    // ACP strictly reserves stdout for NDJSON protocol frames  
    const stream = ndJsonStream(  
      Writable.toWeb(this.child.stdin),  
      Readable.toWeb(this.child.stdout),  
    );

    this.connection = new ClientSideConnection(  
      () => ({  
        sessionUpdate: async (notification: SessionNotification) => {  
          this.handleSessionUpdate(notification);  
        },  
        requestPermission: async (  
          params: RequestPermissionRequest,  
        ): Promise<RequestPermissionResponse> => {  
          return this.handlePermissionRequest(params);  
        },  
      }),  
      stream,  
    );

    // 1. Perform ACP protocol handshake  
    const initResult = await this.connection.initialize({  
      protocolVersion: 1,  
      capabilities: {},  
    });

    if (initResult.protocolVersion !== 1) {  
      throw new Error(\`Unsupported ACP protocol version: ${initResult.protocolVersion}\`);  
    }

    // 2. Open an isolated session bound to the workspace directory  
    const sessionResult = await this.connection.newSession({  
      cwd: this.workspaceCwd,  
      mcpServers: \[\],  
    });

    this.acpSessionId = sessionResult.sessionId;  
  }

  public async sendTurn(promptText: string): Promise<void> {  
    if (!this.connection || !this.acpSessionId) {  
      throw new Error("ACP session has not been initialized.");  
    }

    // session/prompt stays open across streaming updates and permission pauses  
    const promptResponse = await this.connection.prompt({  
      sessionId: this.acpSessionId,  
      prompt: \[{ type: "text", text: promptText }\],  
    });

    this.onEvent({  
      type: "turn.completed",  
      threadId: this.threadId,  
      stopReason: promptResponse.stopReason ?? "end\_turn",  
    });  
  }

  public resolvePermission(  
    requestId: string,  
    decision: { approved: boolean; optionId?: string },  
  ): void {  
    const pending = this.pendingPermissions.get(requestId);  
    if (!pending) return;  
    this.pendingPermissions.delete(requestId);  
    pending.resolve(decision);  
  }

  private handleSessionUpdate(params: SessionNotification): void {  
    const update = params.update as Record<string, unknown>;  
    const kind = (update.sessionUpdate ?? update.kind) as string | undefined;

    if (kind === "agent\_message\_chunk") {  
      const content = update.content as { type?: string; text?: string } | undefined;  
      if (content?.type === "text" && typeof content.text === "string") {  
        this.onEvent({  
          type: "turn.text.delta",  
          threadId: this.threadId,  
          text: content.text,  
        });  
      }  
    } else if (kind === "tool\_call") {  
      this.onEvent({  
        type: "turn.tool.call",  
        threadId: this.threadId,  
        toolCallId: String(update.toolCallId ?? "unknown"),  
        title: String(update.title ?? "Executing tool"),  
      });  
    }  
  }

  private handlePermissionRequest(  
    params: RequestPermissionRequest,  
  ): Promise<RequestPermissionResponse> {  
    const requestId = crypto.randomUUID();  
    const options = (params.options ?? \[\]).map((opt) => ({  
      optionId: opt.optionId,  
      kind: String(opt.kind ?? "unknown"),  
      label: opt.name,  
    }));

    this.onEvent({  
      type: "turn.permission.requested",  
      threadId: this.threadId,  
      requestId,  
      toolCallId: params.toolCall?.toolCallId ?? "unknown",  
      title: params.toolCall?.title ?? "Permission required",  
      options,  
    });

    return new Promise<RequestPermissionResponse>((resolve) => {  
      this.pendingPermissions.set(requestId, {  
        resolve: ({ approved, optionId }) => {  
          if (!approved) {  
            resolve({ outcome: { outcome: "cancelled" } });  
            return;  
          }  
          const fallbackAllow = options.find(  
            (o) => o.kind === "allow\_once" || o.kind === "allow\_always",  
          )?.optionId;  
          const selectedId = optionId ?? fallbackAllow ?? options\[0\]?.optionId;  
          if (!selectedId) {  
            resolve({ outcome: { outcome: "cancelled" } });  
            return;  
          }  
          resolve({  
            outcome: {  
              outcome: "selected",  
              optionId: selectedId,  
            },  
          });  
        },  
      });  
    });  
  }

  public dispose(): void {  
    for (const \[, pending\] of this.pendingPermissions) {  
      pending.resolve({ approved: false });  
    }  
    this.pendingPermissions.clear();

    // Terminate only the explicit PID or detached process group captured at spawn  
    if (this.child?.pid) {  
      try {  
        if (process.platform !== "win32") {  
          process.kill(-this.child.pid, "SIGTERM");  
        } else {  
          this.child.kill("SIGTERM");  
        }  
      } catch {  
        // Process already exited  
      }  
    }  
  }  
}

V2 Event-Sourced Orchestration: Deciders, Projectors, and Outbox Reactors  
A common failure mode in naive agent wrappers is coupling WebSocket handlers directly to subprocess stdin pipes. When a mobile client drops connectivity in an elevator, or when an agent subprocess crashes mid-turn, direct-piped architectures suffer from split-brain UI projections, non-idempotent command retries, and orphaned filesystem mutations. T3 Code eliminates these failure modes by implementing a strict Event-Sourced V2 Orchestrator (apps/server/src/orchestration-v2/Orchestrator.ts) built atop the Effect (effect@4.x) functional framework and SQLite (apps/server/src/persistence/Layers/Sqlite.ts).  
The V2 orchestration pipeline processes every client interaction through five deterministic stages. First, during Command Serialization, clients transmit typed WebSocket RPC requests that thin transport handlers (ws.ts) decode and convert into domain commands without executing business logic. Second, the orchestrator invokes a Pure Decider (decideOrchestrationCommand), passing the serialized command alongside current state. Crucially, the decider performs zero external I/O—it neither writes to the filesystem nor communicates with provider subprocesses—instead validating invariants (such as queue limits or active turn status) and returning a deterministic tuple of domain events and outbox effect declarations.  
Third, the Atomic Transactional Commit (EventSink) executes a single SQLite database transaction that simultaneously commits four artifacts: the immutable domain events to the event log, the updated read-model projections queried by the UI, the accepted command receipt (which guarantees idempotency if a client retries a command over an unstable network), and the outbox effects queued for asynchronous execution. WebSocket subscribers are notified strictly after this database transaction commits, making it impossible for a client UI projection to advance ahead of the durable event log.  
Fourth, Asynchronous Outbox Execution (Effect Worker / ProviderCommandReactor) drains the committed outbox queue in the background to perform impure side effects—such as spawning an agent CLI, transmitting a prompt via a provider adapter, or capturing a Git checkpoint—and feeds completion receipts back into the orchestrator as new commands. Consequently, an RPC command acknowledgement sent to a client signifies that the user's intent has been durably recorded, not that the provider turn or Git checkpoint has finished executing. If a provider subprocess crashes or the host server restarts, recovery logic retires orphaned outbox effects tied to the dead process before admitting new work, preventing blind replay of destructive side effects.  
Fifth, Turn Finalization, Steer vs. Queue, and Auto-Settlement govern how ongoing and completed runs behave. T3 Code separates a provider turn ending from overall run finalization. When a thread is actively running (session.status === "running"), incoming user messages do not blindly collide with the active stream. Instead, T3 Code supports two distinct mid-run interaction modes: Queue (thread.follow-up.queue, which buffers up to MAX\_QUEUED\_FOLLOW\_UPS = 10 prompts in SQLite and automatically pops the next item once thread.turn-diff-complete lands) and Steer (thread.turn.steer\[span\_56\](start\_span)\[span\_56\](end\_span), which injects a course-correction message directly into the active provider turn without a destructive interrupt, or merges queued items via "Steer All"). Finally, a server-owned Settlement Service and PR Sync Reactor monitor finished runs (thread.auto-settle), refreshing linked Pull Request states (even when merged externally via gh pr merge) and detaching idle provider subprocesses to reclaim host RAM.  
Code Listing 2: Normalized Provider Adapter Contract and Transactional Decider-Outbox Pipeline  
The following TypeScript implementation illustrates how to structure T3 Code's pure Decider, atomic SQLite EventSink projection pipeline, and ProviderAdapter interface:  
export type ProviderId =  
  | "codex"  
  | "claude"  
  | "cursor"  
  | "grok"  
\[span\_58\](start\_span)\[span\_58\](end\_span)  | "opencode"  
  | "antigravity";

export type PermissionMode = "supervised" | "auto-accept-edits" | "auto" | "full-access";  
export type InteractionMode = "chat" | "plan";

// 1. Normalized Provider Ad\[span\_59\](start\_span)\[span\_59\](end\_span)apter Boundary  
export interface ProviderTurnInput {  
  threadId: string;  
  turnId: string;  
  workspacePath: string;  
  modelId: string;  
  permissionMode: PermissionMode;  
  interactionMode: InteractionMode;  
  prompt: string;  
}

export interface ProviderAdapter {  
  readonly providerId: ProviderId;  
  readonly capabilities: {  
    readonly supportsMidTurnSteer: boolean;  
    readonly supportsConversationRevert: boolean;  
  };  
  startTurn(input: ProviderTurnInput): Promise<void>;  
  steerTurn(threadId: string, instruction: string): Promise<void>;  
  interruptTurn(threadId: string): Promise<void>;  
  revertConversation(threadId: string, targetTurnId: string): Promise<boolean>;  
}

// 2. Orchestration Commands, Events, and Outbox Effects  
export type OrchestrationCommand =  
  | {  
      commandId: string;  
      type: "thread.turn.start";  
      threadId: string;  
      prompt: string;  
      providerId: ProviderId;  
      modelId: string;  
      permissionMode: PermissionMode;  
      interactionMode: InteractionMode;  
    }  
  | {  
      commandId: string;  
      type: "thread.follow-up.queue";  
      threadId: string;  
      followUpId: string;  
      prompt: string;  
    }  
  | {  
      commandId: string;  
      type: "thread.turn.steer";  
      threadId: string;  
      prompt: string;  
      followUpId?: string;  
    }  
  | {  
      commandId: string;  
      type: "thread.turn.diff-complete";  
      threadId: string;  
      turnId: string;  
      checkpointRef: string;  
    };

export type OrchestrationEvent =  
  | { type: "thread.turn-started"; threadId: string; turnId: string; prompt: string }  
  | { type: "thread.follow-up-queued"; threadId: string; followUpId: string; prompt: string }  
  | { type: "thread.follow-up-dequeued"; threadId: string; followUpId: string }  
  | { type: "thread.turn-steered"; threadId: string; prompt: string }  
  | { type: "thread.turn-completed"; threadId: string; turnId: string; checkpointRef: string }  
  | { type: "thread.command-rejected"; threadId: string; reason: string };

export type OutboxEffect =  
  | {  
      effectId: string;  
      type: "effect.checkpoint.pre-turn";  
      threadId: string;  
      turnId: string;  
    }  
  | {  
      effectId: string;  
      type: "effect.provider.start-turn";  
      threadId: string;  
      turnId: string;  
      providerId: ProviderId;  
      modelId: string;  
      permissionMode: PermissionMode;  
      interactionMode: InteractionMode;  
      prompt: string;  
    }  
  | {  
      effectId: string;  
      type: "effect.provider.steer-turn";  
      threadId: string;  
      providerId: ProviderId;  
      prompt: string;  
    };

export interface ThreadProjection {  
  threadId: string;  
  providerId: ProviderId;  
  modelId: string;  
  permissionMode: PermissionMode;  
  interactionMode: InteractionMode;  
  status: "idle" | "running";  
  activeTurnId: string | null;  
  queuedFollowUps: Array<{ followUpId: string; prompt: string }>;  
  checkpoints: Record<string, string>;  
}

const MAX\_QUEUED\_FOLLOW\_UPS = 10;

// 3. Pure Decider: Zero I/O, deterministic mapping from (State, Command) -> (Events, OutboxEffects)  
export function decideOrchestrationCommand(  
  state: ThreadProjection,  
  command: OrchestrationCommand,  
): { events: OrchestrationEvent\[\]; effects: OutboxEffect\[\] } {  
  switch (command.type) {  
    case "thread.turn.start": {  
      if (state.status === "running") {  
        return {  
          events: \[  
            {  
              type: "thread.command-rejected",  
              threadId: state.threadId,  
              reason: "Turn already running; queue a follow-up or steer the active turn.",  
            },  
          \],  
          effects: \[\],  
        };  
      }  
      const turnId = crypto.randomUUID();  
      return {  
        events: \[  
          {  
            type: "thread.turn-started",  
            threadId: state.threadId,  
            turnId,  
            prompt: command.prompt,  
          },  
        \],  
        effects: \[  
          {  
            effectId: crypto.randomUUID(),  
            type: "effect.checkpoint.pre-turn",  
            threadId: state.threadId,  
            turnId,  
          },  
          {  
            effectId: crypto.randomUUID(),  
            type: "effect.provider.start-turn",  
            threadId: state.threadId,  
            turnId,  
            providerId: command.providerId,  
            modelId: command.modelId,  
            permissionMode: command.permissionMode,  
            interactionMode: command.interactionMode,  
            prompt: command.prompt,  
          },  
        \],  
      };  
    }

    case "thread.follow-up.queue": {  
      if (state.queuedFollowUps.length >= MAX\_QUEUED\_FOLLOW\_UPS) {  
        return {  
          events: \[  
            {  
              type: "thread.command-rejected",  
              threadId: state.threadId,  
              reason: \`Follow-up queue limit (${MAX\_QUEUED\_FOLLOW\_UPS}) reached.\`,  
            },  
          \],  
          effects: \[\],  
        };  
      }  
      return {  
        events: \[  
          {  
            type: "thread.follow-up-queued",  
            threadId: state.threadId,  
            followUpId: command.followUpId,  
            prompt: command.prompt,  
          },  
        \],  
        effects: \[\],  
      };  
    }

    case "thread.turn.steer": {  
      if (state.status !== "running") {  
        return {  
          events: \[  
            {  
              type: "thread.command-rejected",  
              threadId: state.threadId,  
              reason: "Cannot steer when no turn is active.",  
            },  
          \],  
          effects: \[\],  
        };  
      }  
      const events: OrchestrationEvent\[\] = \[\];  
      if (command.followUpId) {  
        events.push({  
          type: "thread.follow-up-dequeued",  
          threadId: state.threadId,  
          followUpId: command.followUpId,  
        });  
      }  
      events.push({  
        type: "thread.turn-steered",  
        threadId: state.threadId,  
        prompt: command.prompt,  
      });

      return {  
        events,  
        effects: \[  
          {  
            effectId: crypto.randomUUID(),  
            type: "effect.provider.steer-turn",  
            threadId: state.threadId,  
            providerId: state.providerId,  
            prompt: command.prompt,  
          },  
        \],  
      };  
    }

    case "thread.turn.diff-complete": {  
      const events: OrchestrationEvent\[\] = \[  
        {  
          type: "thread.turn-completed",  
          threadId: state.threadId,  
          turnId: command.turnId,  
          checkpointRef: command.checkpointRef,  
        },  
      \];  
      const effects: OutboxEffect\[\] = \[\];

      // Automatically dequeue the next follow-up item when the current turn settles  
      const nextFollowUp = state.queuedFollowUps\[0\];  
      if (nextFollowUp) {  
        const nextTurnId = crypto.randomUUID();  
        events.push(  
          {  
            type: "thread.follow-up-dequeued",  
            threadId: state.threadId,  
            followUpId: nextFollowUp.followUpId,  
          },  
          {  
            type: "thread.turn-started",  
            threadId: state.threadId,  
            turnId: nextTurnId,  
            prompt: nextFollowUp.prompt,  
          },  
        );  
        effects.push(  
          {  
            effectId: crypto.randomUUID(),  
            type: "effect.checkpoint.pre-turn",  
            threadId: state.threadId,  
            turnId: nextTurnId,  
          },  
          {  
            effectId: crypto.randomUUID(),  
            type: "effect.provider.start-turn",  
            threadId: state.threadId,  
            turnId: nextTurnId,  
            providerId: state.providerId,  
            modelId: state.modelId,  
            permissionMode: state.permissionMode,  
            interactionMode: state.interactionMode,  
            prompt: nextFollowUp.prompt,  
          },  
        );  
      }

      return { events, effects };  
    }  
  }  
}

// 4. Pure Read-Model Projector  
export function applyEventsToProjection(  
  state: ThreadProjection,  
  events: OrchestrationEvent\[\],  
): ThreadProjection {  
  let next = { ...state, queuedFollowUps: \[...state.queuedFollowUps\], checkpoints: { ...state.checkpoints } };  
  for (const event of events) {  
    switch (event.type) {  
      case "thread.turn-started":  
        next.status = "running";  
        next.activeTurnId = event.turnId;  
        break;  
      case "thread.follow-up-queued":  
        next.queuedFollowUps.push({ followUpId: event.followUpId, prompt: event.prompt });  
        break;  
      case "thread.follow-up-dequeued":  
        next.queuedFollowUps = next.queuedFollowUps.filter((f) => f.followUpId !== event.followUpId);  
        break;  
      case "thread.turn-completed":  
        next.status = "idle";  
        next.activeTurnId = null;  
        next.checkpoints\[event.turnId\] = event.checkpointRef;  
        break;  
    }  
  }  
  return next;  
}

Workspace Isolation and Non-Destructive Git Checkpointing  
Running multiple coding agents in parallel against a single filesystem checkout inevitably causes index lock collisions and interleaved file corruption. T3 Code resolves this at the workspace layer by distinguishing between a Project (a repository directory registered on an environment server) and a Workspace (the specific directory where a thread's agent executes). When starting a thread, the user selects either the Current Checkout (appropriate for single-writer tasks, read-only exploration, or inspecting uncommitted local edits) or a New Worktree (which invokes git worktree add to provision an isolated working tree and branch per thread, allowing multiple models or parallel tasks to edit the same repository simultaneously without conflict).  
To make worktree provisioning repeatable across complex applications, T3 Code supports a repository-committed t3.json configuration file alongside custom project Quick Actions. When a new worktree is created, T3 Code executes the project's deterministic setup script and injects two critical environment variables into the shell environment: T3CODE\_PROJECT\_ROOT, which points to the original primary repository directory so setup scripts can copy shared local .env templates or reference cached assets, and T3CODE\_WORKTREE\_PATH, which points to the newly isolated worktree directory where dependency installation (pnpm install / vp i), port assignment, or database schema seeding occurs.  
Turn-by-Turn Checkpointing via Hidden Git Refs  
A major limitation of native agent undo features—such as Claude Code's built-in /rewind command—is that they only track file modifications routed through the agent's internal file-editing tool calls. Any filesystem mutations caused by shell commands (sed -i, rm, mv, npm install, code generators, or subagent scripts) bypass the agent's internal edit log and cannot be cleanly undone by the harness.  
T3 Code overcomes this limitation by implementing harness-agnostic workspace checkpoints around each turn using hidden Git refs. Rather than creating commits on the user's active branch or polluting git status and git stash, the server snapshots the entire working tree—including untracked non-ignored files and shell-mutated artifacts—directly into Git's object database (refs/t3code/checkpoints/... or refs/turns/...) using a four-step sequence of low-level Git plumbing commands. First, the server performs Throwaway Index Initialization, copying the workspace's current .git/index to a temporary file and setting the GIT\_INDEX\_FILE environment variable to point exclusively to that temporary copy. Second, it performs Full Working Tree Staging by executing git add -A with GIT\_INDEX\_FILE set, which stages all tracked modifications, deletions, and untracked files (while respecting .gitignore) into the temporary index without touching the developer's real staging area. Third, it executes Tree and Commit Object Creation, running git write-tree to write the temporary index into an immutable Git tree SHA, followed by git commit-tree <tree-sha> -p HEAD -m "checkpoint" to wrap that tree into a commit object. Fourth, it performs Hidden Ref Assignment via git update-ref refs/checkpoints/<threadId>/<turnId> <commit-sha>, binding a human-invisible reference to the commit object. Because standard git log, git status, and git push (default=simple) only traverse refs/heads/ and refs/tags/, the user's branch history and HEAD remain completely pristine, while T3 Code's CheckpointDiffQuery can compute exact per-turn diffs by comparing the pre-turn and post-turn checkpoint refs.  
When a user clicks Go back (message-level revert) to roll a thread back to an earlier turn, T3 Code enforces two critical safety invariants. First, it enforces a Conversation Revert Guard: before mutating a single byte on the filesystem, the orchestrator checks whether the active provider adapter can roll back its internal conversation context (docs/internals/overview.md). If a provider cannot truncate or revert its conversation state to match the target turn, it must reject the revert operation immediately prior to touching the working tree. Second, once the provider approves the conversation rollback, T3 Code executes a Three-Step Atomic Git Restoration sequence documented in pingdotgg/t3code#5489: git restore --source <checkpoint-ref> --worktree --staged -- . (which restores all tracked files in both working tree and index to the snapshot state), git clean -fd -- . (which removes untracked files and directories created after the snapshot), and git reset --quiet -- . (which unstages the index to match HEAD). Crucially, because background Git status polling or concurrent checkpoint operations briefly hold .git/index.lock, running git restore without serialization intermittently fails with an opaque Git exit code 128. Projects replicating this behavior must serialize per-worktree Git operations through an asynchronous mutex or retry on transient index.lock contention.  
Code Listing 3: Non-Destructive Turn Checkpointing and Atomic Workspace Restoration  
The following TypeScript module implements T3 Code's hidden-ref checkpoint creation, turn diffing, conversation revert guard, and lock-safe atomic restoration:  
import { execFile } from "node:child\_process";  
import { copyFile, mktemp, rm, stat } from "node:fs/promises";  
import { tmpdir } from "node:os";  
import { join } from "node:path";  
import { promisify } from "node:util";  
import type { ProviderAdapter } from "./orchestrator";

const execFileAsync = promisify(execFile);

export class WorkspaceCheckpointManager {  
  // Per-workspace mutex queue to prevent conc\[span\_60\](start\_span)\[span\_60\](end\_span)urrent Git index.lock exit 128 failures  
  private readonly workspaceLocks = new Map<string, Promise<unknown>>();

  private async withWorkspaceLock<T>(workspacePath: string,\[span\_61\](start\_span)\[span\_61\](end\_span) fn: () => Promise<T>): Promise<T> {  
    const previous = this.workspaceLocks.get(workspacePath) ?? Promise.resolve();  
    const next = previous.catch(() => undefined).then(fn);  
    this.workspaceLocks.set(workspacePath, next);  
    return next;  
  }

  private async runGit(  
    workspacePath: string,  
    args: string\[\],  
    envOverrides?: NodeJS.ProcessEnv,  
  ): Promise<string> {  
    const { stdout } = await execFileAsync("git", args, {  
      cwd: workspacePath,  
      env: {  
        ...process.env,  
        GIT\_AUTHOR\_NAME: "T3 Code Checkpoint",  
        GIT\_AUTHOR\_EMAIL: "checkpoint@t3.codes",  
        GIT\_COMMITTER\_NAME: "T3 Code Checkpoint",  
        GIT\_COMMITTER\_EMAIL: "checkpoint@t3.codes",  
        ...envOverrides,  
      },  
      maxBuffer: 32 \* 1024 \* 1024,  
    });  
    return stdout.trim();  
  }

  /\*\*  
   \* Captures the entire working tree (tracked + untracked, respecting .gitignore)  
   \* into a hidden Git ref without modifying HEAD, the active branch, or the real index.  
   \*/  
  public async createTurnCheckpoint(  
    workspacePath: string,  
    threadId: string,  
    turnId: string,  
    phase: "pre" | "post",  
  ): Promise<string> {  
    return this.withWorkspaceLock(workspacePath, async () => {  
      const tempDir = await mktemp(join(tmpdir(), "t3-ckpt-"));  
      const tempIndexFile = join(tempDir, "index");

      try {  
        // Resolve the real git index path (supports both standard repos and linked worktrees)  
        const realIndexPath = await this.runGit(workspacePath, \["rev-parse", "--git-path", "index"\]);  
        try {  
          await stat(realIndexPath);  
          await copyFile(realIndexPath, tempIndexFile);  
        } catch {  
          // Index may not exist yet in a brand-new repository  
        }

        const indexEnv = { GIT\_INDEX\_FILE: tempIndexFile };

        // Stage all tracked and untracked files into the throwaway index  
        await this.runGit(workspacePath, \["add", "-A"\], indexEnv);

        // Write the throwaway index into a Git tree object  
        const treeSha = await this.runGit(workspacePath, \["write-tree"\], indexEnv);

        // Determine parent commit if HEAD exists  
        let parentArgs: string\[\] = \[\];  
        try {  
          const headSha = await this.runGit(workspacePath, \["rev-parse", "--verify", "HEAD"\]);  
          parentArgs = \["-p", headSha\];  
        } catch {  
          // Unborn HEAD; create a root commit object  
        }

        // Create an off-branch commit object pointing to the captured tree  
        const commitSha = await this.runGit(workspacePath, \[  
          "commit-tree",  
          treeSha,  
          ...parentArgs,  
          "-m",  
          \`t3code checkpoint ${threadId} ${turnId} (${phase})\`,  
        \]);

        // Bind the commit SHA to a hidden ref outside refs/heads/ and refs/tags/  
        const hiddenRef = \`refs/t3code/checkpoints/${threadId}/${turnId}/${phase}\`;  
        await this.runGit(workspacePath, \["update-ref", hiddenRef, commitSha\]);

        return hiddenRef;  
      } finally {  
        await rm(tempDir, { recursive: true, force: true });  
      }  
    });  
  }

  /\*\*  
   \* Computes the exact unified diff across a single agent turn using its pre/post hidden refs.  
   \*/  
  public async getTurnDiff(  
    workspacePath: string,  
    threadId: string,  
    turnId: string,  
  ): Promise<string> {  
    const preRef = \`refs/t3code/checkpoints/${threadId}/${turnId}/pre\`;  
    const postRef = \`refs/t3code/checkpoints/${threadId}/${turnId}/post\`;  
    return this.runGit(workspacePath, \["diff", preRef, postRef\]);  
  }

  /\*\*  
   \* Reverts both the provider conversation state and the workspace filesystem to a target turn.  
   \*/  
  public async revertToCheckpoint(  
    workspacePath: string,  
    threadId: string,  
    targetTurnId: string,  
    checkpointRef: string,  
    adapter: ProviderAdapter,  
  ): Promise<void> {  
    // Conversation Revert Guard: Provider must confirm rollback capability BEFORE touching disk  
    if (!adapter.capabilities.supportsConversationRevert) {  
      throw new Error(  
        \`Provider '${adapter.providerId}' does not support conversation state rollback; aborting filesystem revert.\`,  
      );  
    }

    const reverted = await adapter.revertConversation(threadId, targetTurnId);  
    if (!reverted) {  
      throw new Error("Provider failed to roll back conversation state; filesystem left untouched.");  
    }

    // Execute the 3-step atomic restore sequence inside the per-workspace lock  
    await this.withWorkspaceLock(workspacePath, async () => {  
      await this.runGit(workspacePath, \[  
        "restore",  
        "--source",  
        checkpointRef,  
        "--worktree",  
        "--staged",  
        "--",  
        ".",  
      \]);  
      await this.runGit(workspacePath, \["clean", "-fd", "--", "."\]);  
      await this.runGit(workspacePath, \["reset", "--quiet", "--", "."\]);  
    });  
  }  
}

Production Failure Modes and Subprocess Hardening Blueprint  
As documented across T3 Code's internal engineering teardowns and issue tracker, the Provider Adapter Layer is the single most fragile bottleneck in an agent control plane. Wrapping external, rapidly evolving third-party CLIs exposes the host server to upstream breaking changes, database lock collisions, silent error swallowing, and process tree leaks.  
Projects replicating T3 Code's harness integration must proactively engineer around six documented operational traps in the subprocess lifecycle. The first trap is SQLite Lock Contention During Provider Discovery (opencodeRuntime.ts). When initializing or probing a provider, launching CLI metadata commands concurrently via Promise.all crashes harnesses that store local state in SQLite. In T3 Code v0.0.38 (pingdotgg/t3code#9208), opencodeRuntime.ts spawned opencode models --verbose and opencode agent list in parallel; because both commands opened OpenCode's shared SQLite database simultaneously, the second process failed with Error: Unexpected error: database is locked (exit code 1), throwing a fatal ProviderAdapterProcessError that wedged subsequent sessions until server restart. Replicating systems must serialize CLI discovery commands (models --verbose followed sequentially by agent list) and wrap them with a 1-second backoff retry.  
The second operational hazard involves Startup Probe Timeouts and Disk Cache Hydration (ProviderRegistry.ts). Probing six external CLIs on PATH during server boot is slow and prone to hanging if an agent CLI attempts a network self-update. In apps/server/src/provider/providerSnapshot.ts, T3 Code enforces a strict DEFAULT\_TIMEOUT\_MS = 4\_000 (4 seconds) per probe and hydrates the UI immediately on boot from a per-instance status cache persisted on disk (ProviderRegistry.ts), refreshing workspace snapshots asynchronously in the background while deduplicating concurrent cwd probes. Furthermore, on Windows, background provider probes and VCS process terminations must be spawned with windowsHide: true or appropriate creation flags to prevent flashing console windows on the user's desktop (pingdotgg/t3code#2537).  
A third failure mode stems from Swallowed Transport Failures in ACP Streams (AcpAdapterV2.ts and AntigravityAdapterV2.ts). Certain ACP harnesses fail to return a structured JSON-RPC error code when their upstream model API disconnects mid-turn. For example, when Google Antigravity (agy\_acp\_server\[span\_181\](start\_span)\[span\_181\](end\_span)) encounters a brief 502 Bad Gateway disconnect, it surfaces the raw error string (Agent execution error: model unreachable: Error 502...) inside a standard assistant text message chunk and terminates the turn as completed (pingdotgg/t3code#16010). If AcpAdapterV2 blindly trusts the end\_turn completion, the orchestration engine marks the turn as finished rather than triggering a retryable transport error. Similarly, when grok spawns background subagents, AcpAdapterV2 must set deferFinalizeForBackgroundWork: true so the root turn is not prematurely closed the moment the initial session/prompt RPC returns (pingdotgg/t3code#17159).  
Fourth, adapters must account for MCP Approval Starvation and Context Poisoning in cursor-agent acp. A sharp disparity exists between interactive CLI execution and ACP stdio mode in harnesses like cursor-agent. Global MCP servers configured in ~/.cursor/mcp.json (such as Sentry, Vercel, or PostHog) can cause cursor-agent acp to fail immediately during session/prompt with RetriableError: \[internal\] Failed to run step, exceeded max retries (CursorTransportFailure.ts), requiring per-project MCP disabling (agent mcp disable) or adapter-level MCP filtering where AcpAdapterV2 attaches only the t3-code bridge in strict mode. Additionally, CLI flags like --approve-mcps and --yolo historically bypassed tool permissions only in interactive CLI mode while leaving file-based MCP approval checks active in ACP mode.  
Fifth, control planes must sanitize Environment Variable Contamination (CLAUDECODE and IS\_SANDBOX). When an agent harness is spawned by a control surface—or when a developer uses Claude Code inside T3 Code to develop T3 Code itself—inherited environment variables can silently break child harnesses. Specifically, if CLAUDECODE is present in process.env, child claude processes detect a nested invocation and silently fail on --resume. Conversely, when running T3 Code inside a root LXC container or Docker environment, Claude Code refuses to enable Full access (bypass permissions) mode as the root user unless the service explicitly injects IS\_SANDBOX=1 into the subprocess environment. Additionally, user-level settings files such as ~/.claude/settings.json with defaultMode: bypassPermissions can starve the control surface's own approval gate unless the adapter explicitly overrides session/set\_mode and settingSources.  
Sixth, Subprocess Termination Safety (AGENTS.md Hard Prohibitions) is critical in multi-agent environments where several dev servers and agent processes execute concurrently with the workspace path in their command-line arguments (argv). T3 Code's AGENTS.md strictly prohibits killing processes via pattern matching (pkill -f, pgrep | kill, or matching worktree path strings), as an agent or server cleanup routine will inevitably match and terminate its own parent process. Replicating systems must capture the exact child PID at spawn time (spawning with detached: true on POSIX so kill(-pid) reaps the entire process group) or verify port ownership via ss -H -ltnp combined with /proc/<pid>/cwd validation before sending termination signals.  
Comprehensive Glossary of Agent Harness and T3 Code Terminology  
To provide a definitive reference for engineering teams, the following tables define both the industry-wide protocol standards and the specific architectural primitives established in pingdotgg/t3code/docs/internals/glossary.md and AGENTS.md.  
Protocol and Industry Standards  
| Term / Acronym | Full Name | Technical Definition and Architectural Role |  
|---|---|---|  
| ACP | Agent Client Protocol | An open, Apache-2.0 licensed protocol (created by Zed Industries and JetBrains) based on JSON-RPC 2.0 over newline-delimited stdio that standardizes bidirectional communication—including session setup, streaming updates, and permission prompts—between code editors/control surfaces and AI coding agents. (Distinct from IBM's archived Agent Communication Protocol and OpenAI/Stripe's Agentic Commerce Protocol). |  
| MCP | Model Context Protocol | An open JSON-RPC protocol (created by Anthropic) operating over stdio or HTTP/SSE that connects an AI agent to external tools, databases, and context resources. While ACP connects the UI/editor to the agent, MCP connects the agent to its tools. |  
| LSP | Language Server Protocol | A JSON-RPC standard that decouples programming-language intelligence (autocomplete, diagnostics, go-to-definition) from code editors; the direct architectural inspiration for ACP. |  
| JSON-RPC 2.0 | JavaScript Object Notation Remote Procedure Call | A stateless, lightweight remote procedure call specification defining request (id, method, params), response (id, result/error), and notification (method, params without id) message structures used by LSP, MCP, and ACP. |  
| NDJSON | Newline-Delimited JSON | The transport framing format (ndJsonStream) used by ACP over stdio and T3 Code's local observability trace files (server.trace.ndjson), where each complete JSON-RPC message or trace span is serialized on a single line terminated by \\n. |  
| BYOS / BYOK | Bring Your Own Subscription / Bring Your Own Key | An operational model where the control plane does not proxy LLM API calls or resell tokens, instead delegating execution to local agent CLIs already authenticated with the developer's existing vendor subscription or API key. |  
| Effect (effect@4.x) | Effect TypeScript Framework | The functional TypeScript system used across T3 Code (Services/, Lay\[span\_214\](start\_span)\[span\_214\](end\_span)ers/, Schema.TaggedError, Layer.provideMerge) to enforce type-safe dependency injection, structured concurrency, SQL persistence, and wire serialization. |  
T3 Code Domain and Internal Architecture Vocabulary  
| Term | Technical Definition in T3 Code (docs/internals/glossary.md & overview.md) |  
|---|---|  
| Agent Harness | The execution software wrapping an AI model (e.g., Claude Code, Codex CLI, Cursor Agent) responsible for prompt loops, context window management, file editing tools, and shell execution. |  
| Agent Harness Control Surface | T3 Code's self-description: an orchestration server and multi-client UI layer that sits above native agent harnesses to start, monitor, steer, diff, and create PRs from their sessions without replacing their internal prompt loops. |  
| Environment | A single running t3code-server instance and the host machine behind it that owns the repositories, terminals, credentials, and provider subprocesses. |  
| Provider | The concrete coding agent runtime or CLI harness controlled by T3 Code (specifically Codex, Claude Code, Cursor, Grok Build, OpenCode, or Google Antigravity). |  
| Provider Adapter | A server-side module (apps/server/src/provider/) that encapsulates a provider's native protocol (ACP, JSON-RPC, or SDK) and translates its output into normalized T3 Code orchestration events. |  
| Client | A stateless view application (Web app.t3.codes, Electron Desktop renderer, or React Native iOS/Android mobile app) that connects to one or more Environments over authenticated WebSocket RPC. |  
| Project | An environment-local record rooted in a specific Git repository directory on the host machine, optionally configured via a checked-in t3.json file. |  
| Workspace | The exact filesystem directory where an agent thread executes—either the repository's Current Checkout or an isolated Git Worktree. |  
| Thread | A persistent task context connecting a conversation history, a selected Provider and model, a Workspace directory, linked Pull Requests, and a sequence of Turns. |  
| Turn | A single user-to-agent execution cycle within a thread, beginning when a prompt is dispatched and ending when the provider finishes, fails, or pauses for input, inclusive of follow-up checkpointing work. |  
| Steer vs. Queue | Two mechanisms for handling user prompts submitted while a turn is already running: Queue buffers up to 10 follow-up prompts to run sequentially after the current turn finishes, whereas Steer injects instructions directly into the active turn without interrupting it. |  
| Decider | The pure, side-effect-free state machine inside the V2 Orchestrator (Orchestra\[span\_323\](start\_span)\[span\_323\](end\_span)tor.ts) that validates serialized commands and emits domain events and outbox effect declarations without performing any I/O. |  
| EventSink | The transactional persistence boundary that commits domain events, updated UI read-model projections, accepted command receipts, and outbox effects in a single atomic SQLite database transaction before notifying subscribers. |  
| Projector | The component that derives materialized read models (projections) from persisted orchestration events so connected clients can render thread state without replaying every historical event. |  
| Effect Worker / Reactor | The queue-backed background runner (OrchestrationEffectWorkerV2 / ProviderCommandReactor) that executes impure side effects after EventSink commits and emits typed Receipts back into orchestration when milestones complete. |  
| Checkpoint (Hidden Git Ref) | A non-destructive workspace snapshot captured around each turn using a temporary GIT\_INDEX\_FILE, git write-tree, git commit-tree, and git update-ref into a hidden Git ref namespace (refs/...), enabling per-turn diffs and message-level rollback without polluting the active branch. |  
| Settlement Service | A server-owned background service (including the PR Sync Reactor and thread.auto-settle) that evaluates inactivity timers, synchronizes external PR merge states, and detaches idle provider sessions without requiring an active client connection. |  
Architectural Synthesis and Implementation Roadmap  
Engineering teams seeking to replicate T3 Code's multi-harness orchestration capabilities should avoid building a monolithic chat wrapper around raw CLI stdout streams. Instead, the implementation should follow a phased, boundary-first sequence modeled on T3 Code's internal architecture.  
The initial phase must establish the Contract and Event-Sourced Core before any subprocess wiring takes place. All wire schemas, normalized provider events (turn.started, turn.text.delta, turn.permission.requested, turn.completed), and serializable errors belong in a shared contracts package. Implementing the pure Decider and single-transaction SQLite EventSink upfront guarantees that command acknowledgements, UI projections, and outbox side-effect queues cannot desynchronize across web, desktop, and mobile clients.  
The second phase should adopt @agentclientprotocol/sdk as the Primary Harness Bridge by building a unified AcpSessionRuntime over ndJsonStream. This single transport layer unlocks immediate compatibility with cursor-agent acp, grok agent stdio, agy\_acp\_server, claude-agent-acp, and codex-acp. Harness-specific discrepancies—such as parameter category naming (reasonin\[span\_76\](start\_span)\[span\_76\](end\_span)\[span\_83\](start\_span)\[span\_83\](end\_span)g\_effort vs. effort), background subagent finalization flags (deferFinalizeForBackgroundWork), and swallowed 502 error messages—can then be isolated into thin per-provider flavor modules (CursorAcpSupport, GrokAcpSupport, AntigravityAcpSupport) without polluting domain logic.  
Finally, the third phase must couple Worktree Isolation with Throwaway-Index Git Checkpoints. Enforcing per-thread workspace isolation via git worktree add with injected PROJECT\_ROOT and WORKTREE\_PATH environment variables allows multiple agents to modify the same repository in parallel. Wrapping every provider turn in pre-turn and post-turn hidden Git ref snapshots using a temporary GIT\_INDEX\_FILE and a per-workspace mutex queue guarantees that even arbitrary shell mutations can be diffed and atomically reverted without triggering Git exit code 128 index.lock failures.