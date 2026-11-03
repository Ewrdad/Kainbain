/**
 * MARK: logCategories
 * @description Pure classification, filtering, and grouping helpers for the
 *   unified LogViewer. No React, no storage access — every export is a pure
 *   function (except a module counter for synthetic ids) so the taxonomy is
 *   unit-testable in isolation.
 *
 *   Classification is tag-first with text fallback so both structured task
 *   entries (which carry `kind`) and raw live process-log lines (which carry
 *   only `tag`/`text`) resolve to the same category taxonomy.
 *
 *   Thinking discipline (mirrors `logEntryModel.feedMatchesEntry`): collapsed
 *   thinking markers carry primary `thinking` plus secondary `output`, so they
 *   stay visible in the default narrative view; full thinking blocks are
 *   primary-only `thinking`, so they never leak into the narrative or copy
 *   unless the user explicitly selects the thinking category.
 */

export const LOG_CATEGORIES = [
  {
    id: 'output',
    label: 'Direct output',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'Assistant narrative, stage result summaries, untagged stdout text.',
  },
  {
    id: 'tools',
    label: 'Tool calls',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'Tool invocation summaries, completion mirrors, command results.',
  },
  {
    id: 'thinking',
    label: 'Thinking traces',
    // Off by default: collapsed markers stay visible through their secondary
    // `output` lane, while full reasoning blocks need an explicit opt-in —
    // the same narrative-protection rule as the legacy ALL feed.
    defaultOnCompact: false,
    defaultOnFull: false,
    description: 'Full reasoning blocks (markers stay in the narrative view).',
  },
  {
    id: 'ci',
    label: 'CI logs',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'CI command output, verification scripts, exit codes.',
  },
  {
    id: 'stage',
    label: 'Stage movement',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'Stage enter/complete/failback transitions, plan events, turn headers.',
  },
  {
    id: 'debug',
    label: 'Verbose debug',
    defaultOnCompact: false,
    defaultOnFull: false,
    description: 'KainBain debug lines, [DEBUG]/[TRACE]/[VERBOSE] diagnostics.',
  },
  {
    id: 'system',
    label: 'System',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'Orchestrator status, task init placeholders, eviction markers.',
  },
  {
    id: 'human',
    label: 'Human/checkpoints',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'Checkpoint approvals, permission prompts, human review events.',
  },
  {
    id: 'error',
    label: 'Errors',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'Errors, failures, timeouts, nonzero exit codes.',
  },
  {
    id: 'git',
    label: 'Git',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'Git operations and branch metadata.',
  },
  {
    id: 'raw',
    label: 'Telemetry/raw',
    defaultOnCompact: false,
    defaultOnFull: false,
    description: 'Usage telemetry and raw wire payloads; hidden unless selected.',
  },
  {
    id: 'runner',
    label: 'Runner',
    defaultOnCompact: true,
    defaultOnFull: true,
    description: 'Agent-stage output streamed from Runners over the wire.',
  },
];

export const LOG_CATEGORY_IDS = LOG_CATEGORIES.map((c) => c.id);

const CATEGORY_ID_SET = new Set(LOG_CATEGORY_IDS);

/***
 * MARK: isKnownCategory
 * @description Whether the id is part of the taxonomy.
 ***/
export function isKnownCategory(id) {
  return CATEGORY_ID_SET.has(id);
}

/***
 * MARK: defaultCategorySet
 * @description The default selected categories for a density mode. Debug and
 *   raw/telemetry stay off until the user opts in, so intervention signals
 *   are not drowned in diagnostics.
 ***/
export function defaultCategorySet(density = 'full') {
  const flag = density === 'compact' ? 'defaultOnCompact' : 'defaultOnFull';
  return new Set(LOG_CATEGORIES.filter((c) => c[flag]).map((c) => c.id));
}

/***
 * MARK: hydrateCategories
 * @description Validates a persisted category list back into a Set, falling
 *   back to density defaults when storage is missing or corrupt.
 ***/
export function hydrateCategories(stored, density = 'full') {
  if (!Array.isArray(stored)) return defaultCategorySet(density);
  // An explicitly stored empty/invalid list means "no category filter", which
  // renders the same as the default full selection (see
  // recordMatchesCategories), so unknown ids are dropped without resurrecting
  // defaults the user already cleared.
  return new Set(stored.filter((c) => isKnownCategory(c)));
}

/***
 * MARK: legacyFeedToCategories
 * @description One-way migration from the old task feed chips
 *   (`kainbain:taskLogs:<id>:feed`) to category sets.
 ***/
export function legacyFeedToCategories(feed, density = 'full') {
  switch (feed) {
    case 'ASSISTANT':
      return new Set(['output']);
    case 'TOOLS':
      return new Set(['tools']);
    case 'THINKING':
      return new Set(['thinking']);
    case 'SYSTEM':
      return new Set(['system', 'error', 'git', 'human', 'stage', 'ci']);
    case 'TELEMETRY':
      return new Set(['raw']);
    case 'RAW':
      return new Set(['raw']);
    case 'ALL':
    default:
      return defaultCategorySet(density);
  }
}

/***
 * MARK: legacyTagToCategories
 * @description One-way migration from the old monitor/orchestrator tag pills
 *   (`kainbain:board:logTag`) to category sets.
 ***/
export function legacyTagToCategories(tag, density = 'compact') {
  switch (tag) {
    case 'AGENT':
      return new Set(['output']);
    case 'TOOL':
      return new Set(['tools']);
    case 'HUMAN':
      return new Set(['human']);
    case 'CI':
    case 'CI/CMD':
      return new Set(['ci']);
    case 'INFO':
      return new Set(['system']);
    case 'ERROR':
      return new Set(['error']);
    case 'ALL':
    default:
      return defaultCategorySet(density);
  }
}

// Tag grammar shared with `tasks/logEntryModel.js` TAG_KIND_RULES, extended
// with the viewer taxonomy (ci/git/human/debug/stage/raw). Tags arrive with
// or without brackets (`[TOOL]` vs `TOOL`); normalize once here.
function cleanTag(tag) {
  return String(tag || '')
    .replace(/[[\]]/g, '')
    .trim()
    .toUpperCase();
}

function firstLine(text) {
  return String(text || '').split('\n')[0] || '';
}

/***
 * MARK: extractRunnerId
 * @description Runner id from the inline `[runner <id>]` frame prefix
 *   (ingested over the wire). Null when the text carries no runner prefix.
 * @example extractRunnerId('[runner local-alpha] hi') => 'local-alpha'
 ***/
export function extractRunnerId(text) {
  const m = String(text || '').match(/^\[runner\s+([^\]\s]+)\]/i);
  return m ? m[1] : null;
}

const STAGE_TEXT = /STAGE_ENTER|STAGE_COMPLETE|STAGE_FAILBACK|stage entered|stage completed|stage moved|turn \d+/i;
const CHECKPOINT_TEXT = /checkpoint|approval|human review|awaiting (human|approval)|decision required/i;
const DEBUG_TEXT = /kainbain.*debug|debug.*kainbain|\[KB-[A-Z]+\]|\[TRACE\]|\[VERBOSE\]/i;
const FAILURE_TEXT = /timed?\s?out|exit code [1-9]|exit [1-9]\b|command failed|failed with|traceback|ERR[A-Z_]*:/i;
// `[INFO] Task initialized…` placeholders are system, never stage movement.
const INIT_PLACEHOLDER = /task initialized/i;

function categoryFromTag(upper) {
  if (upper === 'TOOL' || upper === 'RESULT') return 'tools';
  if (upper === 'THINKING') return 'thinking';
  if (upper === 'ERROR' || upper === 'FAIL' || upper === 'STDERR') return 'error';
  if (upper === 'CI' || upper === 'CI/CMD' || upper === 'CMD') return 'ci';
  if (upper === 'GIT') return 'git';
  if (upper === 'HUMAN') return 'human';
  if (upper === 'DEBUG' || upper === 'TRACE' || upper === 'VERBOSE') return 'debug';
  if (upper === 'USAGE' || upper === 'RAW' || upper === 'TELEMETRY') return 'raw';
  if (upper === 'PERM' || upper === 'PERMISSION') return 'human';
  if (upper === 'PLAN') return 'stage';
  if (upper === 'AGENT') return 'output';
  if (upper === 'RUNNER') return 'runner';
  if (upper === 'INFO' || upper === 'SYSTEM' || upper === 'WARN') return 'system';
  return null;
}

// CI stages wrap captured streams: `[STDOUT]\n…` for stdout and
// `[STDERR]\n…` for stderr. The classification line is the first content
// line after a stream wrapper, mirroring the backend grammar in
// `api/watch/processLogs.js::_logEntryKindFromText`.
function checkLineFor(text) {
  const lines = String(text || '').split('\n');
  const first = lines[0] || '';
  if (/^\[(STDOUT|STDERR)\]/i.test(first) && lines.length > 1) return lines[1] || '';
  return first;
}

/***
 * MARK: categoryFor
 * @description Primary category for a record-like. Structured entries
 *   dispatch on `kind` first; live process-log lines (no `kind`) dispatch on
 *   `tag` first with `text`-prefix fallback, then content patterns.
 ***/
export function categoryFor(recordLike = {}) {
  const { kind, tag, text } = recordLike || {};
  if (kind === 'thinking') return 'thinking';
  if (kind === 'tool') return 'tools';
  if (kind === 'assistant') return 'output';
  if (kind === 'runner') return 'runner';
  if (kind === 'error') return 'error';
  if (kind === 'telemetry' || kind === 'raw') return 'raw';
  if (kind === 'permission') return 'human';
  if (kind === 'plan') return 'stage';

  const body = String(text || '');
  // Failback transitions are intervention-grade stage movement: they win over
  // a generic lane tag (e.g. a CI-tagged STAGE_FAILBACK line reads as stage).
  if ((!kind || kind === 'system') && /STAGE_FAILBACK|failback/i.test(body)) return 'stage';
  // KainBain verbose-debug content wins over a generic [INFO]/[SYSTEM] tag —
  // the whole point of the debug lane is isolating these diagnostics.
  if ((!kind || kind === 'system') && (DEBUG_TEXT.test(body) || DEBUG_TEXT.test(String(tag || '')))) {
    return 'debug';
  }

  const fromTag = categoryFromTag(cleanTag(tag));
  if (fromTag && kind !== 'system') {
    // Live lines (no kind) and unknown kinds trust the tag outright, except
    // the init placeholder which is always system.
    if (INIT_PLACEHOLDER.test(String(text || '')) && (fromTag === 'stage' || fromTag === 'output')) {
      return 'system';
    }
    return fromTag;
  }
  // Text-prefix fallback: the tag field may be generic while the line itself
  // carries the grammar (`[TOOL] …` inside `text`). Stream wrappers
  // (`[STDOUT]`/`[STDERR]`) are unwrapped first so the content line classifies.
  const lineHead = checkLineFor(text);
  // Runner frames carry `[runner <id>]` (space form the tag regex misses).
  if (/^\[runner[\] ]/i.test(lineHead)) return 'runner';
  const bracket = lineHead.match(/^\[([A-Za-z/]+)\]/);
  if (bracket) {
    const fromText = categoryFromTag(bracket[1].toUpperCase());
    if (fromText) {
      if (INIT_PLACEHOLDER.test(lineHead)) return 'system';
      return fromText;
    }
  }
  // A bare `[STDERR]` wrapper with no further tag still reads as error.
  if (/^\[STDERR\]/i.test(firstLine(text))) return 'error';

  if (INIT_PLACEHOLDER.test(body)) return 'system';
  if (DEBUG_TEXT.test(body) || DEBUG_TEXT.test(String(tag || ''))) return 'debug';
  if (/STAGE_FAILBACK|failback/i.test(body)) return 'stage';
  if (STAGE_TEXT.test(body)) return 'stage';
  if (CHECKPOINT_TEXT.test(body)) return 'human';
  if (FAILURE_TEXT.test(body)) return 'error';
  if (fromTag) return fromTag;
  // Untagged live stdout reads as narrative; unknown structured entries stay system.
  if (!kind) return 'output';
  return 'system';
}

/***
 * MARK: categoriesFor
 * @description Secondary categories for cross-cutting concerns. Matching
 *   treats primary OR secondary membership as visible, which is how collapsed
 *   thinking markers stay in the default narrative view while full thinking
 *   blocks (primary-only) stay out until explicitly selected.
 ***/
export function categoriesFor(recordLike = {}) {
  const safe = recordLike || {};
  const primary = categoryFor(safe);
  const out = [];
  const body = String(safe.text || '');
  // Collapsed markers ride along with the narrative; full blocks do not.
  if (safe.kind === 'thinking' && (safe.collapsedThinking || safe.meta?.collapsed)) {
    if (!out.includes('output')) out.push('output');
  }
  // Runner frames ride along with the narrative: they used to classify
  // as assistant output, so existing stored category sets (which lack the
  // new runner id) keep showing them until the user resets. Unchecking
  // both Runner and Direct output hides them.
  if (safe.kind === 'runner') {
    if (!out.includes('output')) out.push('output');
  }
  // Failure signals surface under Errors even when their primary lane is
  // tools/ci/stage (e.g. a nonzero tool result or a STAGE_FAILBACK line).
  // `[STDERR]` stream wrappers and `[ERROR]`/`[FAIL]` tags in the body count
  // as failure signals so they surface under the Errors chip.
  if (
    primary !== 'error' &&
    (FAILURE_TEXT.test(body) ||
      /STAGE_FAILBACK|failback/i.test(body) ||
      /\[?(ERROR|FAIL|STDERR)\]?/i.test(String(safe.tag || '')) ||
      /\[(ERROR|FAIL|STDERR)\]/i.test(body))
  ) {
    out.push('error');
  }
  // Checkpoint/human signals surface under Human even from system lines.
  if (primary !== 'human' && CHECKPOINT_TEXT.test(body)) out.push('human');
  return out;
}

// Synthetic ids are counter-based (deterministic per session) so repeated
// renders and snapshot tests stay stable; real ids always win when present.
let syntheticIdCounter = 0;

/***
 * MARK: tagForRecord
 * @description Display tag for a record-like. Structured entries usually
 *   carry no tag, so derive one from `kind` that matches the legacy grammar.
 ***/
export function tagForRecord(recordLike = {}) {
  const safe = recordLike || {};
  if (safe.tag) return String(safe.tag);
  switch (safe.kind) {
    case 'thinking':
      return '[THINKING]';
    case 'tool':
      return '[TOOL]';
    case 'error':
      return '[ERROR]';
    case 'assistant':
      return '[AGENT]';
    case 'runner': {
      const id = safe.runnerId ?? safe.meta?.runnerId ?? extractRunnerId(safe.text);
      return id ? `[RUNNER ${id}]` : '[RUNNER]';
    }
    case 'telemetry':
      return '[USAGE]';
    case 'raw':
      return '[RAW]';
    case 'permission':
      return '[PERM]';
    case 'plan':
      return '[PLAN]';
    default: {
      // No kind: extract the leading tag from the text (unwrapping
      // `[STDOUT]`/`[STDERR]` stream wrappers) so live lines keep their
      // grammar instead of collapsing to a generic `[LOG]` pill.
      // Runner frames (`[runner <id>]`) keep their id in the pill.
      const runnerId = extractRunnerId(safe.text);
      if (runnerId) return `[RUNNER ${runnerId}]`;
      const head = checkLineFor(safe.text || '');
      const bracket = head.match(/^\[([A-Za-z/]+)\]/);
      if (bracket) return `[${bracket[1].toUpperCase()}]`;
      return '[LOG]';
    }
  }
}

/***
 * MARK: extractDetail
 * @description Full payload for row expansion: full tool output, usage JSON,
 *   raw wire source, or explicit detail. Returns null when there is nothing
 *   beyond the summary line so rows can skip the expand affordance.
 ***/
export function extractDetail(recordLike = {}) {
  const safe = recordLike || {};
  if (typeof safe.detail === 'string' && safe.detail) return safe.detail;
  if (safe.detail != null && typeof safe.detail === 'object') {
    try {
      return JSON.stringify(safe.detail, null, 2);
    } catch {
      return null;
    }
  }
  const output =
    safe.tool?.result ??
    safe.tool?.partials ??
    safe.meta?.output ??
    null;
  if (typeof output === 'string' && output && output !== safe.text) return output;
  if (safe.usage && typeof safe.usage === 'object') {
    try {
      return JSON.stringify(safe.usage, null, 2);
    } catch {
      return null;
    }
  }
  const source = safe.evidence?.sourceEvent ?? safe.meta?.evidence?.sourceEvent;
  if (typeof source === 'string' && source && source !== safe.text) return source;
  if (typeof safe.raw === 'string' && safe.raw && safe.raw !== safe.text) {
    return safe.raw;
  }
  return null;
}

/***
 * MARK: normalizeLogRecord
 * @description Normalizes any record-like into the shared LogRecord shape.
 *   Never throws on partial input; never invents timestamps.
 ***/
export function normalizeLogRecord(recordLike = {}, fallbackSource = 'task') {
  const safe = recordLike || {};
  const category = categoryFor(safe);
  return {
    id: safe.id != null ? String(safe.id) : `log-rec-${(syntheticIdCounter += 1)}`,
    ts: safe.ts ?? safe.timestamp ?? null,
    displayTs: safe.displayTs ?? null,
    category,
    secondaryCategories: categoriesFor({ ...safe, kind: safe.kind }),
    tag: tagForRecord(safe),
    title: safe.title ?? null,
    text: safe.text ?? '',
    detail: extractDetail(safe),
    meta: safe.meta ?? null,
    kind: safe.kind ?? null,
    collapsedThinking: Boolean(safe.collapsedThinking || safe.meta?.collapsed),
    fullTextId: safe.fullTextId ?? safe.meta?.fullTextId ?? null,
    turn: Number.isFinite(safe.turn) ? safe.turn : null,
    source: safe.source || fallbackSource,
    runnerId: safe.runnerId ?? safe.meta?.runnerId ?? extractRunnerId(safe.text),
    projectName: safe.projectName ?? null,
    taskId: safe.taskId != null ? String(safe.taskId) : null,
    projectId: safe.projectId ?? null,
    isIntervention: isIntervention(safe),
    isRepeated: Boolean(safe.isRepeated),
  };
}

/***
 * MARK: asCategorySet
 * @description Coerces any category input (Set, array, single id, null) into
 *   a Set. Exported so presentational components share one coercion path.
 ***/
export function asCategorySet(categories) {
  if (!categories) return new Set();
  if (categories instanceof Set) return categories;
  if (Array.isArray(categories)) return new Set(categories);
  return new Set([categories]);
}

/***
 * MARK: recordMatchesCategories
 * @description Visibility for one record: `ALL` (or an empty selection)
 *   shows everything; otherwise primary or secondary membership counts.
 ***/
export function recordMatchesCategories(record, categories) {
  const set = asCategorySet(categories);
  if (set.size === 0 || set.has('ALL')) return true;
  if (!record) return false;
  if (set.has(record.category)) return true;
  return (record.secondaryCategories || []).some((c) => set.has(c));
}

/***
 * MARK: filterLogRecords
 * @description Pure filter: multi-select categories ANDed with
 *   case-insensitive search over text + tag + title.
 ***/
export function filterLogRecords(records, state = {}) {
  const set = asCategorySet(state.categories);
  const needle = String(state.search || '').trim().toLowerCase();
  const runners =
    state.runners instanceof Set
      ? state.runners
      : Array.isArray(state.runners)
        ? new Set(state.runners)
        : null;
  return (records || []).filter((record) => {
    if (!record) return false;
    if (!recordMatchesCategories(record, set)) return false;
    // Per-runner selection: when a runner allowlist is given, only that
    // runner's own frames pass (records without a runnerId are excluded).
    if (runners && runners.size > 0) {
      if (!record.runnerId || !runners.has(record.runnerId)) return false;
    }
    if (needle) {
      // Searchable history: summaries plus expandable detail (full tool
      // output, usage JSON, raw evidence), tool names and their arguments —
      // a `[RESULT]` row carries no tool name/args in its text, so those
      // fields join the haystack instead of forcing the user to guess the
      // [TOOL] row. Tool arguments may contain the command name or path the
      // user is looking for even when the summary truncated it.
      let toolArgsText = '';
      try {
        const args = record.tool?.args ?? record.meta?.args ?? null;
        if (args !== null && args !== undefined) {
          toolArgsText = typeof args === 'string' ? args : JSON.stringify(args);
        }
      } catch {
        toolArgsText = '';
      }
      const hay = `${record.text || ''}\n${record.tag || ''}\n${record.title || ''}\n${record.detail || ''}\n${record.meta?.toolName || ''}\n${record.tool?.name || ''}\n${record.meta?.toolCallId || ''}\n${toolArgsText || ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/***
 * MARK: groupLogRecords
 * @description Groups records for rendering. `turn` preserves adjacency like
 *   `logEntryModel.groupByTurn` (turnless runs share one unlabeled group);
 *   `source` groups by record source; `none` returns a single group.
 ***/
export function groupLogRecords(records, { mode = 'none' } = {}) {
  const list = (records || []).filter(Boolean);
  if (mode === 'turn') {
    const groups = [];
    for (const record of list) {
      const turn = Number.isFinite(record?.turn) ? record.turn : null;
      const last = groups.at(-1);
      if (last && last.turn === turn) {
        last.records.push(record);
      } else {
        groups.push({
          id: turn === null ? `log-${groups.length}` : `turn-${turn}`,
          turn,
          label: turn === null ? null : `── Turn ${turn} ──`,
          records: [record],
        });
      }
    }
    return groups;
  }
  if (mode === 'source') {
    const bySource = new Map();
    for (const record of list) {
      const key = record?.source || 'unknown';
      if (!bySource.has(key)) {
        bySource.set(key, { id: key, turn: null, label: key, records: [] });
      }
      bySource.get(key).records.push(record);
    }
    return [...bySource.values()];
  }
  return [{ id: 'all', turn: null, label: null, records: [...list] }];
}

const SHORT_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(\.\d+)?$/;

/***
 * MARK: timestampLabel
 * @description Display timestamp. Short `HH:MM:SS` clock times (what live
 *   lines carry) pass through; ISO/epoch stamps format per `format`
 *   (`HH:MM:SS`, `HH:MM:SS.mmm`, `ISO`). Missing/invalid stamps render `—`
 *   — fake times are never invented.
 ***/
export function timestampLabel(ts, format = 'HH:MM:SS') {
  if (ts === null || ts === undefined || ts === '') return '—';
  if (typeof ts === 'string' && SHORT_TIME.test(ts.trim())) return ts.trim();
  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  if (format === 'ISO') {
    try {
      return date.toISOString();
    } catch {
      return '—';
    }
  }
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const base = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (format === 'HH:MM:SS.mmm') return `${base}.${pad(date.getMilliseconds(), 3)}`;
  return base;
}

/***
 * MARK: isIntervention
 * @description Whether a record signals that the user may need to step in:
 *   errors, checkpoints/human review, permission prompts, timeouts, repeated
 *   commands, failbacks. Case-insensitive; never throws on partial input.
 ***/
export function isIntervention(recordLike = {}) {
  if (!recordLike) return false;
  if (recordLike.isIntervention === true) return true;
  const tag = String(recordLike.tag || '').toUpperCase();
  if (tag.includes('ERROR') || tag.includes('FAIL') || tag.includes('STDERR')) return true;
  if (recordLike.kind === 'error') return true;
  if (recordLike.category === 'error' || recordLike.category === 'human') return true;
  const body = `${recordLike.text || ''} ${recordLike.title || ''}`;
  // Error grammar in text: `[ERROR]`/`[FAIL]`/`[STDERR]` tags anywhere in the
  // body (including behind `[STDOUT]`/`[STDERR]` stream wrappers).
  if (/\[(ERROR|FAIL|STDERR)\]/i.test(body)) return true;
  if (CHECKPOINT_TEXT.test(body)) return true;
  if (FAILURE_TEXT.test(body)) return true;
  if (/STAGE_FAILBACK|failback/i.test(body)) return true;
  if (/\[PERM\]|permission (required|denied|prompt)/i.test(body)) return true;
  if (/repeating|repeated|looks stuck|stuck\?/i.test(body)) return true;
  return false;
}

/***
 * MARK: markRepeated
 * @description Flags records whose normalized text repeats an identical
 *   category/tag/text record within the previous `window` records. Pure —
 *   returns new objects, keeps input order and categories.
 ***/
export function markRepeated(records, window = 8) {
  const list = records || [];
  const seen = [];
  return list.map((record) => {
    const category = record?.category || '';
    const tag = record?.tag || '';
    const text = String(record?.text || '').trim();
    // An empty row (no category, tag, or text) is missing data, not a
    // repeat — never flag it, but still track it so the window stays aligned.
    const isEmpty = category === '' && tag === '' && text === '';
    const key = `${category}\u0000${tag}\u0000${text}`;
    const isRepeated = !isEmpty && seen.includes(key);
    seen.push(key);
    if (seen.length > window) seen.shift();
    if (isRepeated && !record.isRepeated) return { ...record, isRepeated: true };
    return record;
  });
}

/***
 * MARK: countByCategory
 * @description Totals per category over a record list (primary categories
 *   only). General-purpose helper — the viewer intentionally renders no
 *   per-lane counts so chips stay presettable and compact.
 ***/
export function countByCategory(records) {
  const counts = {};
  for (const record of records || []) {
    if (!record) continue;
    const c = record.category || 'system';
    counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}

/***
 * MARK: interventionSummary
 * @description Header counts for errors, human checkpoints, and repeated
 *   rows, plus a needs-attention flag.
 * @deprecated No longer rendered in the UI — the LogViewer intervention
 *   strip was removed to maximize vertical log space. Kept as a pure
 *   utility for tests and external consumers.
 ***/
export function interventionSummary(records) {
  let errors = 0;
  let checkpoints = 0;
  let repeated = 0;
  for (const record of records || []) {
    if (!record) continue;
    const tag = String(record.tag || '').toUpperCase();
    const body = String(record.text || '');
    const failed =
      record.category === 'error' ||
      tag.includes('ERROR') ||
      tag.includes('FAIL') ||
      tag.includes('STDERR') ||
      /\[(ERROR|FAIL|STDERR)\]/i.test(body) ||
      FAILURE_TEXT.test(body);
    if (failed) {
      errors += 1;
    } else if (record.category === 'human') {
      checkpoints += 1;
    }
    if (record.isRepeated) repeated += 1;
  }
  return { errors, checkpoints, repeated, needsAttention: errors > 0 || checkpoints > 0 };
}

/***
 * MARK: formatLogRecordsForCopy
 * @description Default plain-text export: `[ts] [tag] text` per line with
 *   expanded details appended. Detail lines are included only for rows the
 *   user expanded (via `expandedIds`) or records already flagged
 *   `expanded` — summary-only by default, so full payloads never leak into
 *   the clipboard unasked. Surfaces with richer copy contracts (task
 *   markers, activity stream) pass their own `onCopy` instead.
 ***/
export function formatLogRecordsForCopy(
  records,
  { includeTimestamp = true, expandedIds = null } = {},
) {
  return (records || [])
    .filter(Boolean)
    .map((record) => {
      const head = includeTimestamp && record.ts ? `[${record.ts}] ` : '';
      const line = `${head}${record.tag || ''} ${record.text || ''}`.trim();
      const expanded =
        expandedIds instanceof Set ? expandedIds.has(record.id) : Boolean(record?.expanded);
      if (record.detail && expanded) return `${line}\n${record.detail}`;
      return line;
    })
    .join('\n');
}
