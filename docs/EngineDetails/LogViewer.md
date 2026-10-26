# LogViewer — Unified Flexible Log Viewer

All four log surfaces render through one presentational component:

- task Logs tab (`tasks/LogsPanel.jsx`)
- monitor live console, desktop and compact/mobile (`observability/widgets/LiveConsoleWidget.jsx`, used by `ObservabilityDashboard.jsx` and `MobileMonitorView.jsx`)
- orchestrator activity console (`workflow/ActivityConsole.jsx`)

Capture, processing, and persistence are unchanged: the viewer only dresses
records that already exist. Monitoring headers, status pills, the task status
bar, the stuck check, agent messages, and tool cards all stay owned by their
surfaces — only the log body is unified.

## Files

- `frontend/src/components/logs/LogViewer.jsx` — presentational only. No data
  fetching, no context coupling. Props: `records`, optional pre-grouped
  `groups` (or `groupMode: 'turn' | 'source' | 'none'`), `viewer` state,
  `header`/`footer` slots, `onCopy`/`onClear`, `copiedLogs`,
  `showCopyButton`, `scrollKey`, `emptyMessage`, `searchLabel`,
  `logLabel`, `testId`, `fullTextById`.
- `frontend/src/components/logs/logViewerState.js` — `useLogViewerState({ surface, taskId })`
  owns categories, search, density, timestamp visibility/format, auto-scroll,
  and expanded rows. Pure initializers `initialCategories` / `initialSearch`
  are exported for tests.
- `frontend/src/components/logs/logCategories.js` — pure taxonomy:
  classification, normalization, filtering, grouping, timestamps,
  intervention, repeat flagging, legacy migration, chip counts, copy format.
- `frontend/src/components/logs/adapters.js` — `adaptTaskEntry(s)`,
  `adaptProcessLogLine(s)`, and the named dedup policy
  `excludeToolMirrorLinesWhenToolCardsShown`.
- `frontend/src/components/logs/__fixtures__.js` — real-shaped golden inputs.

## LogRecord shape

```ts
type LogRecord = {
  id: string;                 // source id, else deterministic `log-rec-N`
  ts: string | null;          // passed through, never invented
  category: LogCategory;      // primary lane (see below)
  secondaryCategories: LogCategory[]; // cross-cutting lanes (matching counts)
  tag: string;                // display tag, e.g. `[TOOL]` (derived from kind when absent)
  title?: string | null;
  text: string;
  detail?: string | null;     // expansion payload (tool output, usage JSON, raw source)
  meta?: Record<string, unknown> | null; // live lines stash `meta.rawLine` (by reference)
  kind?: string | null;
  collapsedThinking: boolean;
  fullTextId?: string | number | null;
  turn: number | null;
  source: 'task' | 'process-live' | ...;
  projectName?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  isIntervention: boolean;
  isRepeated: boolean;
};
```

## Category taxonomy

`output`, `tools`, `thinking`, `ci`, `stage`, `debug`, `system`, `human`,
`error`, `git`, `raw`. Classification is tag-first with text fallback so
structured entries (`kind`) and live lines (`tag`/`text` only) converge:

1. Structured `kind` wins (`thinking`/`tool`/`assistant`/`error`/
   `telemetry`→`raw`/`permission`→`human`/`plan`→`stage`).
2. Live lines dispatch on `tag` (`[TOOL]`→tools, `[CI]`/`[CI/CMD]`→ci,
   `[GIT]`→git, `[HUMAN]`→human, `[DEBUG]`/`[TRACE]`/`[VERBOSE]`→debug,
   `[USAGE]`/`[RAW]`→raw, `[PERM]`→human, `[PLAN]`→stage, `[AGENT]`→output,
   `[INFO]`/`[SYSTEM]`/`[WARN]`→system), with `text`-prefix fallback.
3. Content patterns: `STAGE_FAILBACK`/failback → `stage` (wins over generic
   tags); KainBain debug markers → `debug` (wins over generic tags);
   `STAGE_*`/stage-movement phrasing → `stage`; checkpoint/approval phrasing
   → `human`; timeout/nonzero-exit/failure phrasing → `error`.
4. CI stream wrappers: `[STDOUT]\n…` and `[STDERR]\n…` prefixes (emitted by
   `api/flow/commandStages.js` when capturing stage stdout/stderr) are
   unwrapped before classification — `[STDERR]` lines classify as `error`,
   and the content line's tag classifies `[STDOUT]` output. The same grammar
   applies in `api/watch/processLogs.js::_logEntryKindFromText` (backend)
   and `tasks/logEntryModel.js::entryFromLogLine` (legacy parse).
5. `[INFO] Task initialized…` placeholders are always `system`.
6. Untagged live stdout reads as `output`; unknown structured entries stay
   `system`.

Secondary lanes: collapsed thinking markers carry `output` (visible in the
default narrative); full thinking blocks are primary-only `thinking`.
Failure text on a non-error primary adds `error`; checkpoint text on a
non-human primary adds `human`.

## Filter semantics

- Multi-select chips; `All` resets to density defaults. Empty selection (or
  `ALL`) shows everything. Primary **or** secondary membership counts.
- Search ANDs with chips over text + tag + title, case-insensitive.
- Defaults exclude `thinking` (full blocks only — markers ride along),
  `debug`, and `raw` until opted in. This reproduces the legacy ALL narrative
  exactly while making every lane a user choice.
- Repeat flagging (`markRepeated`, window of 8) marks identical
  category/tag/text rows without dropping them.

## Density and timestamps

- **Compact**: tight rows, tag pill, optional short timestamp, wrapping body.
  Default for monitor/activity surfaces.
- **Full**: roomier rows plus a metadata line (turn/task/repeat). Default for
  task logs.
- Any row with `detail` (or a resolvable thinking marker via `fullTextById`)
  expands inline through a button with `aria-expanded`.
- Timestamps render when enabled: on by default in full, off in compact.
  Formats `HH:MM:SS`, `HH:MM:SS.mmm`, `ISO`. Short clock times pass through;
  missing/invalid stamps render `—` — fake times are never invented.

## Intervention summary

`interventionSummary` counts **Errors** (error lane, ERROR/FAIL/STDERR tags,
`[ERROR]`/`[FAIL]`/`[STDERR]` text patterns including behind stream wrappers,
failure text), **Checkpoints** (human lane), and **Repeated** rows. Any
errors/checkpoints raise the **Needs attention** badge; rows highlight with a
tint plus a screen-reader marker (color is never the only signal). Nothing is
auto-hidden.

## Persistence keys and migration

- Task: `kainbain:logViewer:task:<taskId>:{categories,search,density,timestamps,timestampFormat,autoScroll}`
- Live: `kainbain:logViewer:live:{…}` · Activity: `kainbain:logViewer:activity:{…}`
- Expanded rows are session-only (never persisted).
- One-way read-only migration, applied only when no unified key exists:
  - `kainbain:taskLogs:<id>:feed` → categories (`TOOLS`→tools, …; unknown→defaults)
  - `kainbain:taskLogs:<id>:search` → search
  - `kainbain:board:logTag` → categories (`ERROR`→error, `CI/CMD`→ci, …)
  - `kainbain:board:logSearch` → search
- Stale legacy keys are left untouched. Corrupt values fall back to density
  defaults (categories) or `''` (search).

## Compatibility facades

- `tasks/logEntryModel.js` keeps its full API (`LOG_FEEDS`,
  `feedMatchesEntry`, …): the task hook still computes legacy entries for the
  marker-safe copy path, and existing unit tests pin the model.
- `workflow/nodeModel.js :: filterProcessLogs` is reimplemented over the new
  taxonomy (legacy tag → categories, `[TOOL]` mirrors dropped) but returns
  the ORIGINAL line objects, so copy formatting is byte-identical. It also
  re-exports `excludeToolMirrorLinesWhenToolCardsShown`.
- `severityTagStyle` / `severityTextClass` remain for existing tests; the
  viewer uses its own category pill tones.

## Accessibility

- Scroll regions: `role="log"`, `aria-live="polite"`, `aria-atomic="false"`,
  `tabIndex={0}`.
- Chips and density/timestamp toggles: `aria-pressed`; empty lanes disabled
  but visible with `(0)` counts.
- Expansions are buttons with `aria-expanded` and stable labels
  (`Show thinking (N chars)`, `Show full detail`).
- Auto-scroll degrades for reduced-motion users via
  `scrollIntoViewRespectingMotion`.

## Test map

- `logs/logCategories.test.js` — taxonomy matrix, secondaries, filter
  composition, grouping, timestamps, intervention, repeats, migration.
- `logs/adapters.test.js` — adapter equivalence, raw-line stash, dedup policy.
- `logs/LogViewer.test.jsx` — chips/counts/aria, multi-select, search,
  density, timestamps, expansion, copy, intervention strip, groups, reset.
- `logs/logViewerState.test.js` — defaults, round-trip, invalid data, legacy
  migration, per-task isolation.
- Migrated: `tasks/LogsPanel.test.jsx`, `tasks/TaskDetailOverlay.test.jsx`,
  `observability/*`, `workflow/ActivityConsole.test.jsx`,
  `workflow/WorkflowCanvas.console.test.jsx`, `workflow/nodeModel.test.js`
  (facade + policy re-export), `canary-e2e/tests/task-logs.spec.js`.
