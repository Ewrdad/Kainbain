# Phase 2 Investigatory Conclusions

This document captures the architectural decisions made during the pre-Phase 2 "grilling" session to ensure a consistent implementation of the "dogfood-ready" state.

## 1. Task & State Machine

The system employs a two-tier state model to balance user flexibility with execution predictability.

### Macro-State (The Kanban Board)

- **Nature:** User-defined.
- **Behavior:** Users can create/rename columns (e.g., "Ready for Elab", "Security Review", "Done").
- **Logic:** The API must maintain a mapping of `Column` $\to$ `Workflow Step` $\to$ `Agent Configuration`. Moving a task into a specific column triggers the associated agent run.

### Micro-State (The Task Lifecycle)

- **Nature:** Fixed Enums.
- **States:** `Queued` $\to$ `Doing` $\to$ `Waiting on Human` $\to$ `Done`.
- **Logic:** These states track the actual execution progress of a task regardless of which Kanban column it resides in.

## 2. Compute & Execution Model

The goal is to minimize long-term context management and enable the use of smaller, specialized models.

- **Discrete Agent Runs:** Execution is strictly discrete. An agent is spawned for a single sub-task, completes its work, and exits.
- **No Process Suspension:** Agents do not "sleep" while waiting for humans. They terminate. The API is responsible for spawning the *next* agent in the chain once human approval is granted.
- **Process Management:** The API controls `pi-agent` instances as local OS processes on the host machine.
- **Handoff:** (TODO) Research `@earendil-works/pi-coding-agent` to determine the best method for passing task context (CLI args, Env vars, or config files).

## 3. Project & Filesystem Model

The project supports "Multi-Folder Local" access via a centralized root.

- **Primary Root:** The agent is spawned within the main project directory.
- **External Integration:** Access to documentation (e.g., SilverBullet notes) is handled via **symbolic links**. This allows the agent to navigate to external notes as if they were local directories, maintaining a consistent filesystem API.
- **Project Scope:** The agent is intended to operate on the project's local drive.

## 4. Summary of "Dogfood" Requirements

To be considered "Dogfood Ready," the following must be implemented based on the above:

- [ ] **Column-to-Agent Mapper:** Logic to trigger the correct prompt based on the Kanban column.
- [ ] **Process Controller:** API capability to spawn, monitor, and track the exit codes of discrete `pi-agent` runs.
- [ ] **Symlink Resolver:** System to ensure project roots are correctly linked to documentation folders before agent spawn.
- [ ] **Task Transitioner:** UI/API flow that moves tasks from `Doing` $\to$ `Waiting on Human` $\to$ `Doing` (next step).
