# KainBain Design Specification

This document details the UI/UX and functional design for **KainBain**, an AI-driven task orchestration system. The system is designed as a supervised autonomous pipeline where tasks move through configurable stages of agentic and human intervention.

![Original Paper Concept](paper%20design.jpg)

---

## 1. Brand & Aesthetic Identity

KainBain is engineered to balance the cold precision of an IDE with the high-stakes visibility of a mission control center. The brand personality is **technical, authoritative, and operational**.

![Brand Concept](KAINbain%20design.svg)

### Design Philosophy

- **Technical/Modern Corporate Hybrid:** A "SaaS-grade" professional feel combined with developer-tool utility.
- **Role-Based Chromatics:** Color is not decorative; it indicates **ownership**.
  - **Primary (Agent Green - `#7bdb85`):** Signifies autonomous agent activity, success, and automated triggers.
  - **Secondary (Human Blue - `#9acbff`):** Signifies manual intervention, human-in-the-loop requirements, and active UI focus.
  - **Tertiary (Stage Ochre - `#ffb77f`):** Defines the structural skeleton—stage headers and workflow definitions.
- **Tactile Precision:** Information density is prioritized over whitespace, utilizing a "Now Playing" paradigm for background orchestration.

### Typography

A dual-font strategy separates UI narrative from technical data:

- **Interface (Hanken Grotesk):** Used for navigation, headers, and descriptive text.
- **Technical Data (JetBrains Mono):** Used for UUIDs, prompt snippets, logs, and role badges (e.g., "AGENT").

---

## 2. System Architecture Overview

KainBain manages **Jobs** organized by **Projects**. Each project has a custom workflow consisting of a series of **Stages**.

### The "Stage" Concept

A Stage is the fundamental unit of the workflow.

- **Definition:** A combination of a **System Prompt** and a **Fallback Route**.
- **Types:**
  - `Agent`: Automated execution by AI.
  - `Human`: A manual checkpoint requiring human approval/review.
- **Context:** Tasks are initialized with fresh context upon entering a stage.

---

## 3. Interface Design (Page-by-Page)

### 3.1 Global Control Bar (The "Now Playing" Bar)

*Persistent at the bottom of the viewport (72px height). Inspired by music players.*

**Purpose:** Real-time monitoring and control of the live execution thread.

| Section | Features |
| :--- | :--- |
| **Engine State (Left)** | Pulsing status dot, current active stage, and the specific task being processed (`#UUID`). |
| **Playback Controls (Center)** | Large `Secondary Blue` icons for Play, Pause, Skip Previous, and Skip Next. Includes Shuffle/Repeat for orchestration patterns. |
| **Progress & Info (Right)** | Visual progress bar (e.g., "Stage 2 of 5"), percentage completion, and elapsed time counter. |

### 3.2 The Kanban Board (Main View)

*The primary workspace for tracking and managing task flow.*

![Kanban Board View](AI%20Mockup/kanban_board_v2/screen.png)

**Layout:**

- **Columns:** Represent **Workflow Stages**. Each column is fixed-width (`280px`) to maintain readability.
- **Stage Headers:** Background fill of `Stage Ochre` (`#362600`) with a thick bottom border. Includes the stage name, a description (e.g., "SYSTEM INBOUND"), and the owner type (`Human` or `Agent`).
- **Add Stage:** A dashed-border "Add Stage" card at the end of the pipeline.

**Task Cards:**

- **Visuals:**
  - **Role Badge:** Top-right pill (Green for Agent / Blue for Human).
  - **UUID:** Displayed in `code-sm` (JetBrains Mono).
  - **Title:** Primary focus of the card.
  - **Metadata:** Time in stage and current status (e.g., `PENDING`, `AGENT_WORK`, `ACTIVE`).
  - **Stage age:** every card shows its current time-in-stage in both densities (full timestamp on full cards, short `45s`/`3h`/`2d` age on compact).
  - **Pace colours:** running and human-review cards are tinted against the stage average — green under 75%, amber at 75–100%, red over; no usable average renders neutral. A tooltip always states elapsed vs average, so colour is never the only signal.
  - **Card order:** `Manual order` (default) keeps drag-and-drop order; `Oldest first` surfaces the longest-waiting task per column without changing the stored order (toolbar toggle + Task Cards settings).
- **Active State:** Tasks currently being processed by the engine receive a `left-hand border accent` (3px) and a subtle background glow.

### 3.3 Task Detail View (Overlay/Popup)

*Detailed view triggered by expanding a task card. A glass-panel modal with backdrop blur.*

![Task Detail View](AI%20Mockup/task_detail_popup_v2/screen.png)

**Header Section:**

- **Primary Title:** Large display font.
- **Contextual Data:** UUID, initiating orchestrator version, and a status badge (e.g., "ORCHESTRATING").
- **Navigation:** Tabs to switch between `Details` and `History`.

**Content Area (Split Layout):**

1. **Editing Section (Left - Focus on Input):**
   - **Task Title:** Input field with a **Vibrant Green** palette (`#39994b`) border/glow. While a stage is executing, the task goal opens in **Preview** mode by default; clicking **Edit** shows an amber advisory that the change only applies from the next stage (the running agent keeps the goal it was dispatched with — for live instructions use Real-Time Steering).
   - **System Prompt:** Large textarea with an **Ochre** palette (`#b86200`) border/glow. Includes "Restore Default" and "Full Screen" actions.
   - **Resources & Metadata:** Quick-access buttons for "View Report" and "View Logs," and a tag-cloud for Keywords (e.g., `#NLP_CORE`).

2. **Technical Audit Section (Right - Focus on Logs):**
   - **Live Process:** A terminal-style window showing real-time logs with severity colors (`[INFO]`, `[HUMAN]`, `[WARN]`).
   - **Orchestration History:** A vertical timeline with status dots (Green=Success, Red=Fail, Blue=Active) and duration for each stage completion.

**Footer Section:**

- **Infrastructure Data:** Node cluster ID (e.g., `NODE_01 :: US-EAST-1`) and last auto-sync timestamp.
- **Global Actions:** "Cancel Run" and a high-priority "Prioritise Run" button.

---

## 3.6 Model Selector Pattern (`ModelSelector`)

*The shared AI-model picker rendered by the project's Default AI Model setting and the per-stage Model Selection in the stage settings drawer.*

The model selector is **harness-first** and **provider-grouped**:

```
AI Harness            [ pi                v ]   <- harness scopes the catalogue (single harness today: disabled-but-visible)
Default AI Model      [ Gemini 2.5 Pro      v ]   <- models of the selected harness
+--------------------------+
| OLLAMA-CLOUD             |                  <- non-interactive provider group header
|  DeepSeek v4 Flash (Cl.) |
|  GLM 5.3 Flash (Cloud)   |
| GOOGLE                   |
|  Gemini 2.5 Pro          |
| ANTHROPIC                |
|  Claude 3.7 Sonnet       |
+--------------------------+
```

- **Harness row:** rendered above the model dropdown, populated from the
  `/compute/models` additive `harnesses[]` view (`{ id, label, description, models }`).
  With a single registered harness (today: `pi`) the row is visible but disabled so the
  structure is evident and future harnesses drop in without layout change. When an older
  backend sends no `harnesses`, the flat catalogue is wrapped as the single `pi` harness.
- **Model list:** scoped to the selected harness and grouped by provider via
  `SelectDropdown`'s `group` option field — group headers are non-interactive
  (`role="group"`, `aria-label` set) and carry the provider name, so option labels are
  the plain model names (the former `name (provider)` suffix is retired).
- **Values:** stored selections keep the shared reference grammar — canonical
  harness-scoped `harness::provider::id` keys (what the backend serves as `key` and the
  component emits on change), legacy `provider::id` composites, and oldest bare ids;
  `modelKeyForValue` resolves all three onto a visible option so nothing already stored
  breaks.
- **Sizing:** settings pages use `size="md"`; the stage columns (260–280 px) use
  `size="sm"` with both dropdowns `block w-full` stacked vertically.
- **Empty choice:** the canvas selector prepends `Inherit Project Default` (value `''`);
  the project default selector has no empty choice.

---

## 4. Summary of User Flows

1. **Project Setup:** User creates a project $\rightarrow$ Defines stages (Agent/Human) $\rightarrow$ Writes system prompts for each.
2. **Task Lifecycle:** Task created $\rightarrow$ Enters `Idea` (Human) $\rightarrow$ Moves to `Plan` (Agent) $\rightarrow$ Moves to `Review` (Human) $\rightarrow$ `In Progress` (Agent).
3. **Live Monitoring:** User monitors the Global Bar $\rightarrow$ identifies a bottleneck/error $\rightarrow$ opens Task Detail View to audit logs $\rightarrow$ adjusts the Stage Prompt in the editing section to refine AI behavior.
