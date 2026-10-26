# Phase 2: PI Agent UI Integration Plan

## Overview

The goal is to build a high-performance UI layer over the PI AI Agent, transforming it from a CLI-centric tool into a fully interactive web application. This requires a robust JS middleware to manage long-running agent sessions, stream real-time events, and handle non-linear conversation trees.

## 1. Session Lifecycle & Management

To support a multi-user web environment, the backend must manage `AgentSession` instances as stateful services.

### Session Store

- **Mapping**: Implement a `Map<SessionId, AgentSessionRuntime>` on the server.
- **Persistence**: Leverage `SessionManager.open(sessionPath)` to resume sessions from the `.jsonl` files.
- **Resource Isolation**: Each session must have its own `cwd` and `AgentDir` to avoid cross-session file contamination.

### Lifecycle Management

- **Startup**: Use `createAgentSession()` to initialize the runtime.
- **Teardown**: Call `runtime.dispose()` and `session.dispose()` when a user disconnects or a session is closed to kill orphaned bash processes and save state.
- **Session Switching**: Implement `runtime.switchSession(path)` to allow users to toggle between different project sessions.

## 2. Real-time Communication (The Event Bridge)

The PI Agent is event-driven. A request-response REST API is insufficient for the streaming nature of AI responses and tool executions.

### Transport Layer

- **Protocol**: WebSocket or Server-Sent Events (SSE).
- **Event Stream**: Map internal `AgentSession` events to WebSocket messages sent to the frontend.

### Event Mapping Table

| Agent Event | UI Action |
| :--- | :--- |
| `message_start` | Append a new message bubble; show "Typing..." indicator. |
| `message_update` | Update the content of the current assistant message in real-time. |
| `tool_execution_start` | Render a tool-call card (e.g., "Executing `ls -R`..."). |
| `tool_execution_update` | Stream partial tool output (e.g., streaming bash logs). |
| `tool_execution_end` | Finalize the tool card; render diffs or formatted results. |
| `agent_end` | Remove "Typing..." indicator; enable the user input field. |
| `agent_settled` | Confirm that all background processes (retries/compaction) are done. |

## 3. Handling Long-Running Interactions

AI sessions often last hours. The UI must handle long-running turns and context limits gracefully.

### Interruptions & Queuing

- **Streaming State**: Use `session.isStreaming` to disable the primary "Send" button or change its behavior.
- **Steering**: If a user sends a message while the agent is running, call `session.steer(text)`. This interrupts the agent's current thought process *after* the current tool call finishes, but *before* the next LLM turn.
- **Follow-up**: Use `session.followUp(text)` for messages that should be processed only after the agent has completely finished its current task.

### Context & Compaction

- **Monitoring**: Call `session.getContextUsage()` periodically to feed a "Context Meter" in the UI.
- **Compaction**: Provide a "Summarize History" button that triggers `session.compact()`. Auto-compaction should be enabled by default (`setAutoCompactionEnabled(true)`).

## 4. Non-Linear Navigation (The Tree UI)

PI's most powerful feature is the ability to fork and navigate conversation branches.

### The Conversation Tree

- **Visualization**: Implement a tree-based navigation sidebar using `sessionManager.getEntries()`.
- **Navigation**: Use `session.navigateTree(targetId)` to jump to a specific point in history.
- **Forking**: Implement a "Fork from here" button that calls `runtime.fork(entryId)`, allowing the user to explore alternative solutions without losing the original path.

## 5. Tooling & Extension Integration

- **Custom UI Tools**: Inject a custom tool via `createAgentSession({ customTools: [...] })` that allows the agent to trigger UI-specific actions (e.g., `highlight_code_block`, `open_sidebar`).
- **Bash Streaming**: Use `session.executeBash(command, onChunk, options)` to pipe real-time terminal output directly to a xterm.js terminal component in the UI.

## 6. Common Pitfalls & Solutions (Research-Based)

Based on industry patterns for AI Agent UIs:

- **Pitfall: Token Drift**: The UI state and Agent state can diverge if events are lost.
  - **Solution**: Periodically sync the full message history via `session.messages` instead of relying solely on incremental updates.
- **Pitfall: Zombied Processes**: Bash tools may keep running after a user closes the browser tab.
  - **Solution**: Strict implementation of `AbortController` passed through the SDK to all tools; ensure `runtime.dispose()` is called on socket disconnect.
- **Pitfall: "Wall of Text"**: Large tool outputs (e.g., `npm install` logs) crash the browser.
  - **Solution**: Implement virtualized lists and "Expand/Collapse" toggles for tool results exceeding 50 lines.
- **Pitfall: Race Conditions**: User sends a message while a `compact()` operation is running.
  - **Solution**: Implement a backend lock or queue that prevents `prompt()` from executing until `isCompacting` is false.
