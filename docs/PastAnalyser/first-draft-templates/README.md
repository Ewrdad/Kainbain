# Past Analyser — UI Design Prototypes & Layout Drafts

This folder contains **5 drastically different UI design explorations** for the **Past Analyser** module conceived in [`InitialIdea.md`](../InitialIdea.md), complete with a zero-dependency Node host server, persistent navigation switcher, and shared mock data rooted in the actual KainBain codebase architecture.

---

## 🚀 Quick Start

To launch the prototype server, run:

```bash
cd docs/PastAnalyser/first-draft-templates
npm start
# or directly:
node server.js
```

Then open your browser to **[http://localhost:3344](http://localhost:3344)**.

---

## 🎨 5 Radically Distinct UI Paradigms

| # | Design Concept | Paradigm & Aesthetic | Core Strengths & Use Case |
|---|---|---|---|
| **1** | **[Command & Control Cockpit](./designs/1-ops-cockpit/index.html)** | Datadog / Cloud Cost Telemetry (High Density Dark Glass) | Real-time DORA cost metrics, global spend KPIs, provider breakdown bars, model downgrade radar, and active retry loop alerts. |
| **2** | **[Workflow Graph & Node Canvas](./designs/2-workflow-graph/index.html)** | Node-RED / Langflow Pipeline Canvas | Visual workflow execution graph, stage token burn heatmap, pulsating retry loop arcs, and hovering subagent Split/Combine advice flags. |
| **3** | **[DevTools Diagnostic Studio](./designs/3-devtools-studio/index.html)** | VS Code / JetBrains Profiler Studio | Left file tree with context bloat warnings, center side-by-side `AGENTS.md` rule pruning diffs & flamegraphs, right tool synthesizer drawer. |
| **4** | **[Actionable Copilot Stream](./designs/4-copilot-feed/index.html)** | Linear Insights / Lighthouse Audit Cards | High-impact prioritization stream with confidence scores, effort badges, and interactive Before/After simulation sliders. |
| **5** | **[Multi-Dimensional Pivot Matrix](./designs/5-pivot-matrix/index.html)** | Bloomberg Terminal / Airtable BI Spreadsheet | Deep-dive multi-column financial and token modeling grid with in-cell heatmaps, instant search, and bulk downgrade rule application. |

---

## 📊 Shared Mock Data (`shared/mockData.js`)

All 5 prototypes read from the **same normalized mock dataset** (`window.PAST_ANALYSER_MOCK_DATA`) to show how different user experience philosophies present identical underlying project telemetry:

1. **DORA Cost-Only Metrics**:
   - *Cost per Successful Task*: `$0.041` (Target benchmark: `$0.025`)
   - *Token Rework Ratio*: `26.8%` of tokens burned in retry loops
   - *Change Fail Waste*: `$48.20` lost across 142 failed stages
   - *Model Efficiency Index*: `74 / 100`

2. **Model Performance & Downgrade/Upgrade Detector**:
   - `anthropic::claude-3-7-sonnet`: Over-provisioned in 64.1% of simple plan/report stages -> Downgrade to `deepseek-v4-flash` (saves $78.40/mo).
   - `ollama-cloud::qwen-2.5-coder-32b`: High 11.8% failure rate triggers expensive 3x retry cascades -> Upgrade recommended to `gemini-2.5-flash`.
   - `ollama-cloud::deepseek-v4-flash:0731-cloud`: Promoted default workhorse model.

3. **Workflow & Loop Analysis**:
   - `Core Feature Delivery Lifecycle`: 198 retry loops detected on `Unit Review ⟷ Implementation` ($34.20 waste).
   - *AI Breakdown (Split)*: Split monolithic `Implementation` stage into 2 parallel subagents (`API Subagent` + `UI Subagent`).
   - *AI Combine*: Merge `Plan` and `Spec` stages into a single fast-track stage for minor fixes.

4. **`AGENTS.md` / System Prompt Optimizer**:
   - Scans `agents.md`, `gemini.md`, `claude.md`, and `api/promptCuration.js`.
   - Generates unified git diff removing duplicate rules and reducing historical stage report injection window from 4 to 2 reports (saving 63.1% prompt overhead).

5. **Refactor Needed Detector**:
   - Flags `api/agentRunner.js` (1,240 LOC monolithic context bloat loaded in 82% of sessions).
   - Flags `api/tasks.js` (mixed routing & validation logic).
   - Flags `canary-e2e/prod_manual_tester.mjs` (unfiltered Playwright logs).

6. **Agent Tool / Skill Creator**:
   - Synthesizes `kainbain-git-diff-summary` CLI tool (replaces 12k raw diff tokens with 340-token structured JSON).
   - Synthesizes `secobserve-finding-compact` MCP skill.
   - Synthesizes `fast-preflight-linter` agent hook.

---

## 🎛️ Switcher Component

A floating sticky switcher bar (`shared/switcher.js`) is automatically included across all pages. It enables:
- Seamless jumping between all 5 designs and the Hub.
- Opening the **Mock Data Inspector** to view the live JSON.
- Viewing the **Feature Coverage Matrix** mapping back to `InitialIdea.md`.
