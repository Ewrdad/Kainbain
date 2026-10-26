# Plan for Attempt Two - PI Agent UI Rectification

> **Status: Complete ✅** — all usability/functionality, goal-alignment, and code-quality items below have been implemented and verified. See [ProgressReport.md](./ProgressReport.md) for the point-by-point audit. Key additions beyond the original plan: a real per-project `TaskStore` (tasks placed in exactly their stage column), human-stage Approve/Reject wired to task transitions, non-linear failback policies (`start`/`previous`/`any`/`abort`) + jump-to-any-stage, compute controls consolidated into the Now Playing bar (removed from the header), and expanded automated tests (27 API + 30 frontend unit + Playwright E2E).

This plan addresses the flaws identified in the Human Review of Attempt One. The primary focus is to shift the UI from a generic "AI chat" interface to a professional project/task management cockpit, adhering to the original design goals and improving code quality.

## 1. Usability & Functionality Rectification

### Task & Project Management

- **Task Management Tab**: Move task management from a sidebar to a dedicated full-page tab. Implement a layout inspired by Jira/Trello/GitLab (kanban or structured list) rather than a simple chat sidebar.
- **Project Settings**: Implement a dedicated Project Management/Settings page for configuration (e.g., project name, agent settings, environment variables).
- **Project Selection**: Implement functional project selection that actually switches the active session/context in the backend.
- **Task Execution Logic**: Fix the "Task management doesn't work" flaw by ensuring task triggers are correctly mapped to backend agent calls.

### Workflow & Stage Control

- **Stage Integration**: Integrate stage/workflow manipulation directly into the page. Replace the "made-up session tree" with a real representation of the current workflow state.
- **Stage Types**: Implement distinct UI treatments and logic for:
  - **Human Stages**: Explicit "waiting for user" state with clear action buttons.
  - **Bot/Script Stages**: Visual indicators of automated execution and logs.
- **Non-Linear Fallback**: Implement "Fail back to any stage." Allow users to jump back to any previous stage in the workflow, not just the immediate previous one.
- **Stage Skipping**: Enable "stage skips" in the fallback/navigation logic.

### UI/UX Refinement

- **Now Playing Bar**: Fix the width of the "Now Playing" bar so it doesn't take the whole screen width.
- **Status Integration**: Remove standalone "start your engines / compute stop" messages from the top right. Integrate these statuses and controls (Play/Pause/Stop) into the "Now Playing" bar.
- **Responsiveness**: Make the page adjustable/responsive.
- **Context Logic**: Correct the "Context Counter." Ensure the UI reflects that a new running instance is created per task per stage per run, rather than implying simple context reuse.
- **Backend Integration**: Audit and fix all buttons to ensure they are wired to the actual backend API/WebSocket events.

## 2. Goal Alignment Rectification

- **Design Adherence**: Re-review all design documents (if available) and the `phase2_plan.md` to ensure the UI follows the intended "Cockpit" metaphor.
- **Professional Inspiration**: Shift the UI aesthetic and interaction patterns away from a "coding assistant" (like T3Code/Codex) toward a "Project Management/Orchestration" tool (Jira/GitLab/Trello).
- **Remove Custom "Fluff"**: Strip out features implemented in Attempt One that were not requested or deviate from the core goal.
- **Frontend/Backend Sync**: Ensure the port management and state sharing between frontend and backend are synchronized and transparent.

## 3. Code Quality Rectification

### Architecture & Structure

- **Component Decomposition**: Break down `App.jsx` (which is currently too long) into smaller, focused functional components (e.g., `ProjectHeader`, `TabNavigator`, `TaskBoard`, `WorkflowTimeline`).
- **Directory Nesting**: Move from a flat structure to a nested one:
  - `src/components/layout/`
  - `src/components/tasks/`
  - `src/components/workflow/`
  - `src/components/settings/`
  - `src/hooks/`
  - `src/services/`
- **Remove Class-like Patterns**: Audit state management to ensure no "functions applied to state" are mimicking class behavior. Use clean functional components and hooks (useReducer/useContext) for complex state.

### Testing & Stability

- **Test Relocation**: Move unit tests from a separate folder to be colocated with the files they test (e.g., `TaskCard.jsx` and `TaskCard.test.jsx` in the same folder).
- **Automated Test Coverage**: Increase the number of automated tests for core UI interactions (stage switching, task triggering).
- **Error Elimination**: Fix the "hundreds of errors in terminal" by addressing the root causes in the frontend/backend communication and React lifecycle management.
