# Phase 2 Completion Plan: Dogfooding Readiness

This plan outlines the remaining work required to make the KainBain orchestrator usable for internal dogfooding. The goal is to move from "feature-complete but fragile" to "stable enough for real-world usage."

## 1. Current State Analysis

The application currently has:

- **Backend**: Fastify API with WebSocket event bridge, project/task/workflow stores, and integration with the PI Agent SDK.
- **Frontend**: React-based UI with context-driven state, real-time event streaming, and a workflow canvas/kanban board.
- **Core Loop**: Users can create projects, define workflow stages, submit tasks, and observe the agent executing them via streaming events.

## 2. Critical Gaps for Dogfooding

### A. Reliability & Stability (The "No-Crash" Goal)

The app currently lacks robust error handling and session persistence.

- **Session Persistence**: Sessions are currently in-memory. If the server restarts, all active sessions are lost.
- **Error Recovery**: WebSocket disconnects trigger reconnection, but there's no "sync" mechanism to recover missed events during the gap.
- **Zombie Process Management**: While `disposeSession` exists, there's no automatic cleanup for abandoned sessions (e.g., browser tab closed).

### B. Usability & UX (The "I Can Actually Use This" Goal)

Several "quality of life" features are missing that make agent interaction tedious.

- **Message History Persistence**: Messages and tool calls are currently stored in React state and lost on refresh.
- **Task-Centric Navigation**: The transition between the "Orchestrator" (streaming view) and "Task Management" (kanban view) is disjointed.
- **Context Visibility**: The context meter exists in the API but isn't prominently used in the UI to warn users before hits.
- **Input Validation**: Lack of basic validation on task submission and stage configuration.

### C. Feature Completeness (The "Core Loop" Goal)

Some Phase 2 specifications are only partially implemented.

- **Non-Linear Navigation**: Tree navigation and forking are in the API but lack a dedicated, intuitive UI.
- **Prompt Curation**: The curation engine is integrated into task creation, but the user cannot see or edit the curated prompt before it's sent to the agent.
- **Human-in-the-Loop**: Human stages are visually represented, but the "Approve/Reject" flow is basic and doesn't allow providing feedback/corrections.

## 3. Implementation Roadmap

### Phase 2.1: Infrastructure Hardening (Priority: High)

*Estimated Time: 2-3 days*

- [x] **Disk-backed Session Store**: Replace `Map<SessionId, AgentSessionRuntime>` with a persisted store using the SDK's `SessionManager` to allow session recovery across restarts. Implemented in `api/sessionStore.js` (`SessionManager.create` + `SessionManager.open` resume).
- [x] **Event Sync Protocol**: Implement a `GET /session/history` endpoint. On WebSocket reconnect, the UI should fetch the full history to fill the gap. Endpoint added; `KainBainContext.fetchHistory` runs on `socket.onopen`.
- [x] **Session TTL/Cleanup**: Implement a heartbeat mechanism. If a session has no active WS connections for X minutes, trigger `disposeSession`. Implemented in `SessionStore.startCleanup()` (30 min idle TTL, 1 min sweep).

### Phase 2.2: UX Refinement (Priority: Medium)

*Estimated Time: 2-3 days*

- [x] **Persistent UI State**: Sync `messages` and `toolCalls` with the backend history so refreshing the page doesn't wipe the current session view. `fetchHistory` populates messages/tree on connect/reconnect.
- [x] **Prompt Preview/Edit**: Add a "Review Prompt" step in the task submission flow, allowing users to edit the output of the `PromptCurationEngine` before execution. `POST /tasks/preview` + `PromptReviewModal`.
- [x] **Enhanced Human Review**: Update the "Reject" action in human stages to open a dialog for "Correction/Feedback," which then updates the task goal and sends it back to the agent. `POST /tasks/:id/reject` + `FeedbackDialog`.
- [x] **Context Warning System**: Add a visual indicator (e.g., yellow/red bar) when context usage exceeds 80% of the limit. `contextWarning` derived state + Header badges (>80% warn, >95% critical).

### Phase 2.3: Advanced Navigation UI (Priority: Low/Medium)

*Estimated Time: 2 days*

- [x] **Conversation Tree Sidebar**: Implement a visual tree navigator (based on `session/tree`) allowing users to jump between forks and historical states. `SessionTreeSidebar` (Jump/Fork).
- [x] **Forking Interface**: Add a "Fork from here" button on individual messages to start a new parallel branch of exploration. Added to `WorkflowCanvas`; fork endpoint fixed to use `sessionManager.branch()`.

## Status

**All Phase 2.1 / 2.2 / 2.3 items plus drag-and-drop Kanban and flexible stage types are complete.** Automated coverage: 88 API + 116 frontend unit tests + 41 Playwright canary E2E tests, all passing. The kanban board now supports real drag-and-drop between stages, and the stage-type system supports `agent`, `human`, `review`, `ci`, and arbitrary custom types without hard-coded branching. See the point-by-point audit in `docs/Phase2/AttemptTwo/ProgressReport.md` for the earlier rectification work.

## 4. Verification Criteria (Definition of Done)

The app is "dogfood-ready" when:

1. **Persistence**: Server restart does not kill active agent sessions or wipe conversation history.
2. **Stability**: No uncaught crashes during common workflows (Task $\rightarrow$ Agent $\rightarrow$ Human $\rightarrow$ Agent).
3. **Loop Closure**: A user can create a project, define a 3-stage workflow, submit a task, correct the agent's mistake in a human stage, and see the task reach "Completed."
4. **Context Safety**: The user is warned before the agent hits token limits.
5. **Navigation**: The user can successfully fork a session and jump back to the original branch.
