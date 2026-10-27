/***
 * MARK: widgetRegistry
 * @description Centralized extensible registry for Observability Dashboard widgets.
 * Allows adding new telemetry or monitoring widgets in the future with modular definitions.
 *
 * HOW TO ADD A WIDGET (the three-touch change):
 *   1. Create the component under `widgets/` (small and single-purpose — one
 *      metric or one subsystem per widget; reuse `widgets/atoms/KpiCard` or
 *      `widgets/atoms/HealthStatusCard`).
 *   2. Add one catalog entry below (pick a `category`, set `defaultColSpan` /
 *      `defaultHeight`, and `allowMultiple`).
 *   3. Add one `case` to `renderWidgetContent` in `ObservabilityDashboard.jsx`.
 *   Then add a widget test file. Nothing else keys off the widget type: the
 *   manager, persistence, presets and resize/move/hide controls all read the
 *   catalog generically, and every widget can appear multiple times.
 ***/

export const WIDGET_CATEGORIES = {
  METRICS: 'Metrics & KPIs',
  EXECUTION: 'Queue & Tasks',
  LOGS: 'Logs & Console',
  SYSTEM: 'System & Health',
};

export const COL_SPAN_OPTIONS = [
  { value: 3, label: '25% (Small / 3 cols)', class: 'lg:col-span-3' },
  { value: 4, label: '33% (1/3 / 4 cols)', class: 'lg:col-span-4' },
  { value: 6, label: '50% (Half / 6 cols)', class: 'lg:col-span-6' },
  { value: 8, label: '66% (2/3 / 8 cols)', class: 'lg:col-span-8' },
  { value: 12, label: '100% (Full Width / 12 cols)', class: 'lg:col-span-12' },
];

export const HEIGHT_OPTIONS = [
  { value: 'compact', label: 'Compact (1/6 viewport)', class: 'min-h-[0] h-[16vh]' },
  { value: 'normal', label: 'Standard (1/4 viewport)', class: 'min-h-[0] h-[24vh]' },
  { value: 'tall', label: 'Tall (1/3 viewport)', class: 'min-h-[0] h-[32vh]' },
  { value: 'full', label: 'Full View (fill remaining)', class: 'min-h-[0] flex-1' },
];

/***
 * MARK: LAYOUT_SCHEMA_VERSION
 * @description Version of the saved-layout shape. Version 2 introduces the
 *   `instanceId` field so the same widget type can appear more than once.
 *   Version 1 layouts (no `instanceId`) are migrated on load by
 *   `normalizeLayout` — users never lose a saved layout.
 ***/
export const LAYOUT_SCHEMA_VERSION = 2;

/***
 * MARK: WIDGET_CATALOG
 * @description Catalog of all available dashboard widgets with metadata and defaults.
 * Every entry may be added more than once (`allowMultiple`) so an operator can
 * build a cockpit from the smallest useful shapes (one KPI, one subsystem) and
 * repeat them at different sizes. The `kpis` and `health` composite entries
 * stay for one-click ribbons and for layouts saved before the split.
 ***/
export const WIDGET_CATALOG = [
  {
    id: 'kpi-successes',
    title: 'KPI: Successes',
    shortTitle: 'Successes',
    icon: '🏆',
    category: WIDGET_CATEGORIES.METRICS,
    description: 'Completed task count with the resolved success rate.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'kpi-failures',
    title: 'KPI: Failures',
    shortTitle: 'Failures',
    icon: '⚠️',
    category: WIDGET_CATEGORIES.METRICS,
    description: 'Failed task count with the resolved failure rate.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'kpi-queue',
    title: 'KPI: Queue Depth',
    shortTitle: 'Queue Depth',
    icon: '📋',
    category: WIDGET_CATEGORIES.METRICS,
    description: 'Scheduled candidate count with active and dependency-blocked sub-lines.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'kpi-checkpoints',
    title: 'KPI: Human Review',
    shortTitle: 'Human Review',
    icon: '✋',
    category: WIDGET_CATEGORIES.METRICS,
    description: 'Checkpoints awaiting a human decision, with any paused tasks.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'kpi-engine',
    title: 'KPI: Active Engine',
    shortTitle: 'Active Engine',
    icon: '🤖',
    category: WIDGET_CATEGORIES.METRICS,
    description:
      'Executing stage, resolved alias, and the model / harness / autonomous fallback identity.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'kpis',
    title: 'KPI Ribbon (all KPIs)',
    shortTitle: 'KPI Ribbon',
    icon: '📊',
    category: WIDGET_CATEGORIES.METRICS,
    description:
      'One-click composite of every KPI card: successes, failures, queue depth, human checkpoints, and active engine state.',
    defaultColSpan: 12,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'queue',
    title: 'Execution Queue Order',
    shortTitle: 'Queue Order',
    icon: '📋',
    category: WIDGET_CATEGORIES.EXECUTION,
    description:
      'Real-time scheduled candidate tasks ordered by autonomous scheduler priority rank.',
    defaultColSpan: 4,
    defaultHeight: 'tall',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'runnerTasks',
    title: 'Runner Tasks (per-Runner live assignments)',
    shortTitle: 'Runner Tasks',
    icon: '🏃',
    category: WIDGET_CATEGORIES.EXECUTION,
    description:
      'One card per live Runner assignment: which Runner runs which task, on what stage, and for how long, with a runner log tail.',
    defaultColSpan: 4,
    defaultHeight: 'tall',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'activeTask',
    title: 'Active Task & Full Curated Prompt',
    shortTitle: 'Active Prompt',
    icon: '🤖',
    category: WIDGET_CATEGORIES.EXECUTION,
    description:
      'Deep debug inspection of the executing task with its full dispatched prompt, harness, model details, and duration.',
    defaultColSpan: 4,
    defaultHeight: 'tall',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'console',
    title: 'Live Debug Console & Stream Logs',
    shortTitle: 'Debug Console',
    icon: '💻',
    category: WIDGET_CATEGORIES.LOGS,
    description:
      'Real-time WebSocket streaming logs terminal with severity filters and auto-scroll.',
    defaultColSpan: 4,
    defaultHeight: 'tall',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'health-litellm',
    title: 'Health: LiteLLM Proxy',
    shortTitle: 'LiteLLM',
    icon: '🔌',
    category: WIDGET_CATEGORIES.SYSTEM,
    description: 'LiteLLM model gateway reachability, response latency, and status message.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'health-device',
    title: 'Health: Host Memory & CPU',
    shortTitle: 'Host Device',
    icon: '🖥️',
    category: WIDGET_CATEGORIES.SYSTEM,
    description: 'Host memory pressure, free / total RAM, and CPU core count.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'health-ollama',
    title: 'Health: Ollama Cloud',
    shortTitle: 'Ollama Cloud',
    icon: '🦙',
    category: WIDGET_CATEGORIES.SYSTEM,
    description: 'Ollama Cloud / local inference bridge reachability and status message.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'health-websocket',
    title: 'Health: WebSocket Stream',
    shortTitle: 'WebSocket',
    icon: '📶',
    category: WIDGET_CATEGORIES.SYSTEM,
    description: 'Live bidirectional telemetry socket connection state.',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'health-harness',
    title: 'Health: pi Harness Models',
    shortTitle: 'pi Harness',
    icon: '🧩',
    category: WIDGET_CATEGORIES.SYSTEM,
    description:
      'Model-provider probe for the pi harness (available models and credential health).',
    defaultColSpan: 3,
    defaultHeight: 'compact',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'health',
    title: 'System Health (all subsystems)',
    shortTitle: 'System Health',
    icon: '🏥',
    category: WIDGET_CATEGORIES.SYSTEM,
    description:
      'One-click composite: LiteLLM latency, CPU/RAM telemetry, Ollama Cloud, WebSocket status, and the pi harness probe.',
    defaultColSpan: 6,
    defaultHeight: 'normal',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'outcomes',
    title: 'Recent Outcomes & Task History',
    shortTitle: 'Recent History',
    icon: '📜',
    category: WIDGET_CATEGORIES.METRICS,
    description:
      'List of recently completed and failed tasks with timestamps, durations, and error root causes.',
    defaultColSpan: 6,
    defaultHeight: 'normal',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'statsBreakdown',
    title: 'Pipeline Distribution & Rate Gauges',
    shortTitle: 'Rate Gauges',
    icon: '📈',
    category: WIDGET_CATEGORIES.METRICS,
    description:
      'Visual status ratio gauges, completion vs failure rates, and progress distribution breakdown.',
    defaultColSpan: 6,
    defaultHeight: 'normal',
    allowResize: true,
    allowMultiple: true,
  },
  {
    id: 'reliability',
    title: 'Harness Reliability & Intervention Flags',
    shortTitle: 'Harness Reliability',
    icon: '🛡️',
    category: WIDGET_CATEGORIES.METRICS,
    description:
      'Per-harness all-time and recent success rates with counted runs, infrastructure failures, last-run time, and "needs attention" flags for harnesses failing regularly.',
    defaultColSpan: 6,
    defaultHeight: 'normal',
    allowResize: true,
    allowMultiple: true,
  },
];

/***
 * MARK: DEFAULT_LAYOUT
 * @description Balanced default 3-column cockpit layout for secondary monitors.
 * Kept visually identical to the pre-instance layout so an upgrade does not
 * reshuffle anyone's monitor. Instance ids equal the widget type for the first
 * copy, so the default layout's DOM test ids (`widget-kpis`, …) are unchanged.
 ***/
export const DEFAULT_LAYOUT = [
  { instanceId: 'kpis', id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
  { instanceId: 'queue', id: 'queue', colSpan: 4, height: 'tall', enabled: true },
  { instanceId: 'runnerTasks', id: 'runnerTasks', colSpan: 4, height: 'tall', enabled: true },
  { instanceId: 'console', id: 'console', colSpan: 4, height: 'tall', enabled: true },
  { instanceId: 'outcomes', id: 'outcomes', colSpan: 6, height: 'normal', enabled: true },
  { instanceId: 'health', id: 'health', colSpan: 6, height: 'normal', enabled: true },
  {
    instanceId: 'statsBreakdown',
    id: 'statsBreakdown',
    colSpan: 6,
    height: 'normal',
    enabled: false,
  },
  { instanceId: 'reliability', id: 'reliability', colSpan: 6, height: 'normal', enabled: false },
];

/***
 * MARK: PRESET_LAYOUTS
 * @description Curated layout presets for different operational needs.
 ***/
export const PRESET_LAYOUTS = [
  {
    id: 'default',
    name: 'Cockpit Overview (Balanced)',
    description: 'Full KPI ribbon, 3-column queue, active prompt, and live terminal.',
    layout: DEFAULT_LAYOUT,
  },
  {
    id: 'debugger',
    name: 'Deep Debugger (Logs & Prompt Focus)',
    description: 'Large prompt inspector side-by-side with a full-height debug logs terminal.',
    layout: [
      { instanceId: 'activeTask', id: 'activeTask', colSpan: 6, height: 'tall', enabled: true },
      { instanceId: 'console', id: 'console', colSpan: 6, height: 'tall', enabled: true },
      { instanceId: 'queue', id: 'queue', colSpan: 6, height: 'normal', enabled: true },
      { instanceId: 'kpis', id: 'kpis', colSpan: 12, height: 'compact', enabled: false },
      { instanceId: 'outcomes', id: 'outcomes', colSpan: 6, height: 'normal', enabled: false },
      { instanceId: 'health', id: 'health', colSpan: 6, height: 'normal', enabled: false },
      {
        instanceId: 'statsBreakdown',
        id: 'statsBreakdown',
        colSpan: 6,
        height: 'normal',
        enabled: false,
      },
      {
        instanceId: 'reliability',
        id: 'reliability',
        colSpan: 6,
        height: 'normal',
        enabled: false,
      },
    ],
  },
  {
    id: 'executive',
    name: 'Executive Telemetry (Metrics & Outcomes)',
    description:
      'Full width KPI ribbon, success/failure rate gauges, queue flow, recent outcomes, and per-harness reliability.',
    layout: [
      { instanceId: 'kpis', id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
      {
        instanceId: 'statsBreakdown',
        id: 'statsBreakdown',
        colSpan: 6,
        height: 'normal',
        enabled: true,
      },
      { instanceId: 'outcomes', id: 'outcomes', colSpan: 6, height: 'normal', enabled: true },
      { instanceId: 'queue', id: 'queue', colSpan: 6, height: 'normal', enabled: true },
      { instanceId: 'health', id: 'health', colSpan: 6, height: 'normal', enabled: true },
      { instanceId: 'reliability', id: 'reliability', colSpan: 6, height: 'normal', enabled: true },
      { instanceId: 'activeTask', id: 'activeTask', colSpan: 6, height: 'tall', enabled: false },
      { instanceId: 'console', id: 'console', colSpan: 6, height: 'tall', enabled: false },
    ],
  },
  {
    id: 'kiosk',
    name: 'Big Screen Kiosk (Queue & Live Logs)',
    description: 'Optimized for far-view monitors with wide queue list and big streaming console.',
    layout: [
      { instanceId: 'kpis', id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
      { instanceId: 'queue', id: 'queue', colSpan: 4, height: 'tall', enabled: true },
      { instanceId: 'console', id: 'console', colSpan: 8, height: 'tall', enabled: true },
      { instanceId: 'activeTask', id: 'activeTask', colSpan: 8, height: 'normal', enabled: true },
      { instanceId: 'health', id: 'health', colSpan: 4, height: 'normal', enabled: true },
      { instanceId: 'outcomes', id: 'outcomes', colSpan: 6, height: 'normal', enabled: false },
      {
        instanceId: 'statsBreakdown',
        id: 'statsBreakdown',
        colSpan: 6,
        height: 'normal',
        enabled: false,
      },
      {
        instanceId: 'reliability',
        id: 'reliability',
        colSpan: 6,
        height: 'normal',
        enabled: false,
      },
    ],
  },
];

const CATALOG_BY_ID = new Map(WIDGET_CATALOG.map((widget) => [widget.id, widget]));
const VALID_COL_SPANS = new Set(COL_SPAN_OPTIONS.map((option) => option.value));
const VALID_HEIGHTS = new Set(HEIGHT_OPTIONS.map((option) => option.value));

/***
 * MARK: cloneWidgetInstance
 * @description Copies one layout entry so callers (defaults, presets,
 *   normalization) never hand out a shared object that a later resize or
 *   config edit could mutate in place.
 * @example cloneWidgetInstance({ instanceId: 'queue', id: 'queue', config: { title: 'prod' } })
 *   => { instanceId: 'queue', id: 'queue', config: { title: 'prod' } }
 * @param {Object} instance - A layout entry.
 * @returns {Object} A shallow copy with its own `config` object.
 ***/
export function cloneWidgetInstance(instance = {}) {
  return { ...instance, config: { ...(instance.config || {}) } };
}

/***
 * MARK: cloneLayout
 * @description Copies a whole layout array entry-by-entry.
 * @example cloneLayout(DEFAULT_LAYOUT).forEach(entry => entry.enabled = false) // DEFAULT_LAYOUT untouched
 * @param {Array<Object>} [layout] - Layout entries, if any.
 * @returns {Array<Object>} A new array of independent entries.
 ***/
export function cloneLayout(layout) {
  return Array.isArray(layout) ? layout.map(cloneWidgetInstance) : [];
}

/***
 * MARK: nextInstanceId
 * @description Picks a unique, human-readable id for a new copy of a widget
 *   type. The first copy is simply the widget type (`queue`); further copies
 *   take the smallest unused `-2`, `-3`, … suffix, so exported JSON and DOM
 *   test ids stay stable across add/remove cycles.
 * @example nextInstanceId('queue', [{ instanceId: 'queue' }]) => 'queue-2'
 * @example nextInstanceId('queue', [{ instanceId: 'queue' }, { instanceId: 'queue-2' }]) => 'queue-3'
 * @example nextInstanceId('kpi-queue', []) => 'kpi-queue'
 * @param {string} typeId - Catalog id of the widget type.
 * @param {Array<Object>} [layout] - The layout the new copy joins, if any.
 * @returns {string} An `instanceId` not yet used in `layout`. A missing or
 *   non-string type can never mint a `undefined-2` id: it falls back to the
 *   generic `widget` base (callers passing a real catalog id never hit this).
 ***/
export function nextInstanceId(typeId, layout = []) {
  const base = typeof typeId === 'string' && typeId.length > 0 ? typeId : 'widget';
  const usedInstanceIds = new Set(
    (Array.isArray(layout) ? layout : []).map((entry) => entry?.instanceId).filter(Boolean),
  );
  if (!usedInstanceIds.has(base)) return base;
  let suffix = 2;
  while (usedInstanceIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/***
 * MARK: createWidgetInstance
 * @description Builds a fresh, enabled layout entry for a widget type using
 *   the catalog defaults, ready to append to a layout. `config` starts empty;
 *   it is the per-instance extension seam (for example a future reliability
 *   widget instance could hold `{ harness: 'pi' }`).
 * @example createWidgetInstance('kpi-queue', [{ instanceId: 'kpi-queue' }])
 *   => { instanceId: 'kpi-queue-2', id: 'kpi-queue', colSpan: 3, height: 'compact', enabled: true, config: {} }
 * @param {string} typeId - Catalog id of the widget type.
 * @param {Array<Object>} [layout] - The layout the new copy joins, if any.
 * @returns {Object} A new layout entry, or null for an unknown widget type.
 ***/
export function createWidgetInstance(typeId, layout = []) {
  const meta = CATALOG_BY_ID.get(typeId);
  if (!meta) return null;
  return {
    instanceId: nextInstanceId(typeId, layout),
    id: typeId,
    colSpan: meta.defaultColSpan ?? 6,
    height: meta.defaultHeight ?? 'normal',
    enabled: true,
    config: {},
  };
}

/***
 * MARK: normalizeLayout
 * @description The single migration and validation point for every layout that
 *   enters the dashboard (localStorage load, preset apply, JSON import).
 *   Version 1 entries without an `instanceId` are migrated in place by
 *   assigning ids; unknown widget types are dropped; missing sizes fall back
 *   to catalog defaults; a non-array or fully-unknown input falls back to
 *   `DEFAULT_LAYOUT`. Entries that already carry a unique `instanceId` keep it,
 *   so a saved v2 layout round-trips byte-for-byte.
 * @example normalizeLayout([{ id: 'kpis', colSpan: 12, height: 'compact', enabled: true }])
 *   => [{ instanceId: 'kpis', id: 'kpis', colSpan: 12, height: 'compact', enabled: true, config: {} }]
 * @example normalizeLayout([{ id: 'removed-widget' }]) => DEFAULT_LAYOUT
 * @param {*} [entries] - Parsed layout JSON of any schema version.
 * @returns {Array<Object>} A valid, uniquely-keyed layout array.
 ***/
export function normalizeLayout(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return cloneLayout(DEFAULT_LAYOUT);
  const normalized = [];
  const usedInstanceIds = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const meta = CATALOG_BY_ID.get(entry.id);
    if (!meta) continue;
    const requestedInstanceId =
      typeof entry.instanceId === 'string' && entry.instanceId.length > 0 ? entry.instanceId : null;
    const instanceId =
      requestedInstanceId && !usedInstanceIds.has(requestedInstanceId)
        ? requestedInstanceId
        : nextInstanceId(entry.id, normalized);
    usedInstanceIds.add(instanceId);
    normalized.push({
      instanceId,
      id: entry.id,
      colSpan: VALID_COL_SPANS.has(entry.colSpan) ? entry.colSpan : (meta.defaultColSpan ?? 6),
      height: VALID_HEIGHTS.has(entry.height) ? entry.height : (meta.defaultHeight ?? 'normal'),
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
      config:
        entry.config && typeof entry.config === 'object' && !Array.isArray(entry.config)
          ? { ...entry.config }
          : {},
    });
  }
  if (normalized.length === 0) return cloneLayout(DEFAULT_LAYOUT);
  return normalized;
}
