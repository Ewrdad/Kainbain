# Spike: Integrating pi-coding-agent

## Objective

Determine the optimal architectural integration of the `pi-coding-agent` into the KainBain application to achieve a "dogfood-ready" state.

## Analysis of Integration Patterns

### 1. Current Implementation Context

The system currently identifies a two-tier state model:

- **Macro-State:** Kanban columns mapping to agent configurations.
- **Micro-State:** Task lifecycle (`Queued` $\to$ `Doing` $\to$ `Waiting` $\to$ `Done`).

The core requirement is to transition from a manual agent trigger to an automated API-driven orchestration.

### 2. Comparative Integration Examples

| Pattern | Example | Pros | Cons |
| :--- | :--- | :--- | :--- |
| **CLI Wrapper** | Conventional AI CLI tools | Simple, leverages existing binary, easy to log stdout/stderr. | High overhead for process spawning, limited real-time control. |
| **LSP-like Sidecar** | IDE AI Extensions (e.g., Cursor, Copilot) | High-performance, bidirectional communication via JSON-RPC. | High complexity to implement, requires the agent to run a server. |
| **Task Queue / Worker** | GitHub Actions, Jenkins | Robust retry logic, clear state transitions, decoupled execution. | Higher latency, requires an external queue manager (e.g., Redis/BullMQ). |
| **Direct SDK Integration** | Library-based Agents | Lowest latency, full type safety, shared memory space. | Tight coupling, potential for agent crashes to bring down the API. |

### 3. Recommended Approach for KainBain: "The Orchestrated Sidecar"

Given the "Discrete Agent Runs" requirement in `docs/Phase2/Investigatory_Conclusions.md`, the most effective integration is a **Managed CLI Execution** pattern with a **State-Aware API Wrapper**.

#### Integration Blueprint

1. **Execution Layer:**
   - Use `node:child_process` (spawn) to launch `pi-agent`.
   - **Context Injection:** Pass the `TaskID` and `ProjectRoot` via environment variables (e.g., `PI_TASK_ID`, `PI_PROJECT_ROOT`).
   - **Output Capturing:** Pipe `stdout` and `stderr` to a task-specific log file and a real-time WebSocket stream for the UI.

2. **State Management:**
   - The API acts as the "Supervisor". When a task enters a "Doing" column, the API spawns the agent.
   - The agent's exit code determines the next micro-state transition:
     - `Exit 0` $\to$ `Done`.
     - `Exit 1` (with "Human Required" signal) $\to$ `Waiting on Human`.
     - `Exit 2` (Failure) $\to$ `Queued` (with error flag for user review).

3. **Filesystem Bridge:**
   - Leverage the **Symlink Resolver** to ensure the agent sees a unified project view, including external documentation.

### 4. Technical Requirements for Implementation

- [ ] **Process Manager:** Implement a wrapper around `spawn` that handles timeouts, signals (SIGTERM), and log rotation.
- [ ] **Context Provider:** A service to aggregate prompt fragments (Column config + Task description + Project context) into a temporary `config.json` for the agent.
- [ ] **Event Bridge:** A mechanism to notify the UI via WebSockets when an agent process terminates.

### 5. Industry Research & External Examples

Based on research into existing AI agent orchestrators, the following patterns were identified:

#### KaibanJS (Case Study)

KaibanJS specifically implements a "Kanban for AI Agents" model. Its key architectural takeaways include:

- **Redux-inspired State Management:** Uses a unified store to track agent statuses (`TODO`, `DOING`, `DONE`, `BLOCKED`, `REVISE`).
- **Role-Based Specialization:** Defines agents with specific roles (e.g., "Developer", "Product Manager", "QA Specialist") and goals, matching our "Column-to-Agent Mapper" concept.
- **Observability Pipeline:** Implements a subscription-based logging system to track token usage, operational costs, and state changes in real-time.
- **Tool-Centric Design:** Agents are equipped with specialized tools (e.g., search engines) that are passed as configurations.

#### General Agentic Patterns (from Arxiv/Industry Blogs)

- **Verification Loops:** High-performing coding agents use a "Plan $\to$ Implement $\to$ Test $\to$ Repair" loop.
- **Discrete State Transitions:** Moving from a "Draft" state to a "Review" state is a critical transition that often requires a "Human-in-the-loop" (HITL) checkpoint, validating our "Waiting on Human" micro-state.

### 6. Refined Integration Recommendation

To incorporate these industry insights, the "Orchestrated Sidecar" approach is augmented with:

1. **Observability Integration:** The API wrapper should not just capture logs, but parse them into a structured `workflowLogs` stream (similar to KaibanJS) to provide the UI with cost and token metrics.
2. **Verification Guardrails:** The "Doing" state in the Kanban board should be treated as a sub-cycle of `Plan` $\to$ `Execute` $\to$ `Verify`. If the `Verify` step fails, the task remains in `Doing` (Micro-state) but may trigger a `REVISE` internal signal.
3. **Context-Rich Handoffs:** Use a structured `context.json` file shared between the API and the agent, containing not just the task description, but the current "Team" state and previous agent outputs.

## Conclusion

The "Orchestrated Sidecar" approach preserves the discrete nature of agent runs (minimizing context drift) while providing the API with the control necessary to manage the Kanban-driven workflow. This aligns perfectly with the Phase 2 goal of making the system "dogfood-ready" for its own development.
