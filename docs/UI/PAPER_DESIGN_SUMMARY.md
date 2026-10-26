# Paper Design Summary: KainBain Concept

This document provides a detailed description of the `paper design.jpg` image to ensure that AI agents without vision capabilities can understand the conceptual layout and intent of the KainBain interface.

## Overview

The image is a hand-drawn "paper prototype" or conceptual sketch of the KainBain task orchestration system. It maps out the high-level user interface, emphasizing a workflow-driven approach where tasks move through a series of defined stages.

## Visual Layout & Components

### 1. Main Workspace (Kanban-style Pipeline)

The central part of the design is a horizontal pipeline consisting of several columns, representing the **Workflow Stages**.

- **Structure:** The layout mimics a Kanban board where each column is a "Stage" in the process.
- **Flow:** Tasks (represented as cards) are distributed across these columns, indicating their current progress from left to right.
- **Stage Headers:** Each column has a header designating the name of the stage (e.g., "Idea", "Plan", "Review", "In Progress").
- **Task Cards:** Small rectangular blocks within the columns containing basic task information and status indicators.

### 2. Global Control Bar ("Now Playing" Bar)

At the bottom of the screen, there is a persistent horizontal bar inspired by media players.

- **Playback Controls:** Centered buttons for `Play`, `Pause`, `Skip Previous`, and `Skip Next`, suggesting that the orchestration engine can be controlled like a music track (started, paused, or manually advanced).
- **Status Indicators:** Sections on the left and right for tracking the current active task UUID, the active stage, and the overall progress percentage of the run.

### 3. Task Detail/Audit Overlay

The sketch indicates a detailed view (likely a popup or side-panel) that opens when a task is selected.

- **Input Area:** Fields for editing the **Task Title** and the **System Prompt** used by the agent for that specific stage.
- **Technical Audit:** A terminal-like window for real-time logs and a vertical timeline showing the task's history as it passed through previous stages.

## Key Conceptual Themes

- **Supervised Autonomy:** The design highlights the "Human-in-the-loop" aspect, where some stages are marked for AI (Agent) and others for human approval.
- **Operational Visibility:** The combination of the Kanban view and the "Now Playing" bar emphasizes real-time monitoring of a background process.
- **Iterative Refinement:** The ability to edit system prompts directly within the task detail view suggests a workflow of "Run $\rightarrow$ Audit $\rightarrow$ Refine Prompt $\rightarrow$ Re-run."
