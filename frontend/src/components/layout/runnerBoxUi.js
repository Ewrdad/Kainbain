import { isTaskCompleted } from '../tasks/taskFormatters';
import { isEngineOwner, isTaskRunning } from '../tasks/runningTask';

/***
 * MARK: runnerBoxUi
 * @description Pure (DOM-free) helpers behind the Now Playing runner boxes:
 *   the task-state colour map, the per-task status word, the box
 *   accessibility label, the tooltip cap, and the <5 visibility gate. Every
 *   export is a const arrow so the one-function-per-file gate stays quiet;
 *   JSX lives in RunnerBox.jsx / RunnerBoxesRow.jsx.
 * @example getRunnerBoxStyle('running') => { dotClass: 'bg-[#7bdb85]', statusClass: 'text-primary-fixed' }
 ***/

/***
 * MARK: RUNNER_BOX_MAX_COUNT
 * @description Maximum runner entries that render as boxes. 1-4 entries show
 *   the box row; 0 or 5+ fall back to the legacy single-task view so the
 *   72px bar can never crush the transport controls.
 * @example RUNNER_BOX_MAX_COUNT => 4
 ***/
export const RUNNER_BOX_MAX_COUNT = 4;

/***
 * MARK: RUNNER_BOX_TITLE_MAX_CHARS
 * @description Cap for `title` tooltip text on box lines. The visible line
 *   truncates via CSS (`truncate`); the tooltip carries the full value, but
 *   a whole-paragraph goal first line would make an unusable tooltip, so it
 *   is capped here with an ellipsis.
 * @example RUNNER_BOX_TITLE_MAX_CHARS => 240
 ***/
export const RUNNER_BOX_TITLE_MAX_CHARS = 240;

// Task-state palette, reusing the bar's own badge tokens so boxes never
// invent a second status vocabulary. Every class string below is a static
// literal already used by NowPlayingBar so the Tailwind scan emits it.
const STYLE_BY_STATUS = new Map([
  ['running', { dotClass: 'bg-[#7bdb85]', statusClass: 'text-primary-fixed' }],
  ['paused', { dotClass: 'bg-[#ffe0b2]', statusClass: 'text-[#ffe0b2]' }],
  ['failed', { dotClass: 'bg-error', statusClass: 'text-error' }],
  ['interrupted', { dotClass: 'bg-warning', statusClass: 'text-warning' }],
  ['checkpoint', { dotClass: 'bg-[#9acbff]', statusClass: 'text-secondary-fixed' }],
  ['waiting_human', { dotClass: 'bg-[#9acbff]', statusClass: 'text-secondary-fixed' }],
  ['queued', { dotClass: 'bg-text-muted', statusClass: 'text-text-muted' }],
  ['idle', { dotClass: 'bg-text-muted', statusClass: 'text-text-muted' }],
]);

const IDLE_STYLE = { dotClass: 'bg-text-muted', statusClass: 'text-text-muted' };

/***
 * MARK: getRunnerBoxStyle
 * @description Colour pair for a runner status word. Unknown words fail
 *   closed to the grey idle pair — never a missing dot. The colour is never
 *   the sole signal: RunnerBox always renders the status word as text beside
 *   the dot (WCAG 1.4.1).
 * @example getRunnerBoxStyle('failed') => { dotClass: 'bg-error', statusClass: 'text-error' }
 * @example getRunnerBoxStyle('nope') => { dotClass: 'bg-text-muted', statusClass: 'text-text-muted' }
 * @param {string} [statusWord] - One of the resolveRunnerStatusWord words.
 * @returns {{ dotClass: string, statusClass: string }} Tailwind classes.
 ***/
export const getRunnerBoxStyle = (statusWord) =>
  STYLE_BY_STATUS.get(statusWord) ?? IDLE_STYLE;

/***
 * MARK: resolveRunnerStatusWord
 * @description Per-box status word from task state (plan q3: colour means
 *   task state, computable from context data only — no health backend is
 *   consulted). Order matters: settled task states win over the global
 *   engine state so a failed task never renders green while the engine runs
 *   something else. A completed task (or no task at all) is `idle`: the
 *   runner has no live work.
 * @example resolveRunnerStatusWord(null, {}) => 'idle'
 * @example resolveRunnerStatusWord({ status: 'failed' }, { status: 'running' }) => 'failed'
 * @example resolveRunnerStatusWord({ id: 't1' }, { status: 'running', activeTaskId: 't1' }, false) => 'running'
 * @param {Object|null} [task] - The runner's current task (null when idle).
 * @param {Object} [engineState] - Engine snapshot (status/activeTaskId).
 * @param {boolean} [isAgentRunning=false] - Agent-loop liveness flag.
 * @returns {string} running|paused|failed|interrupted|checkpoint|waiting_human|queued|idle.
 ***/
export const resolveRunnerStatusWord = (task, engineState, isAgentRunning = false) => {
  if (!task) return 'idle';
  if (task.status === 'failed') return 'failed';
  if (task.wasInterrupted === true || task.status === 'interrupted') return 'interrupted';
  if (isTaskCompleted(task)) return 'idle';
  if (engineState?.status === 'paused') return 'paused';
  // A task held by a Runner (backend fencing token in `task.claim`) is
  // executing off-process even when this browser's engine snapshot does not
  // name it as the owner — the Runner is the one doing the work. Colour and
  // word it as running so the box reflects live work instead of `queued`,
  // unless a more specific settled state won above.
  const claimRunnerId = task?.claim?.runnerId ?? task?.claimRunnerId ?? task?.runnerClaim?.runnerId;
  if (typeof claimRunnerId === 'string' && claimRunnerId.trim() !== '') return 'running';
  if (isTaskRunning(task, engineState, isAgentRunning)) return 'running';
  if (isEngineOwner(task, engineState) && engineState?.status === 'checkpoint') {
    return 'checkpoint';
  }
  if (isEngineOwner(task, engineState) && engineState?.status === 'waiting_human') {
    return 'waiting_human';
  }
  return 'queued';
};

/***
 * MARK: formatRunnerStatusDisplay
 * @description Human-readable rendering of a status word for the box line:
 *   upper-cased with underscores as spaces (`waiting_human` -> WAITING HUMAN).
 * @example formatRunnerStatusDisplay('waiting_human') => 'WAITING HUMAN'
 * @param {string} [statusWord] - One of the resolveRunnerStatusWord words.
 * @returns {string} Display text (never empty).
 ***/
export const formatRunnerStatusDisplay = (statusWord) =>
  typeof statusWord === 'string' && statusWord.trim() !== ''
    ? statusWord.trim().replace(/_/g, ' ').toUpperCase()
    : 'IDLE';

/***
 * MARK: buildRunnerBoxAriaLabel
 * @description Accessible name for a runner box: runner + status always,
 *   task and stage when known. The health dot is aria-hidden, so this label
 *   is the non-visual status channel.
 * @example buildRunnerBoxAriaLabel({ runnerLabel: 'bravo', statusWord: 'running', taskTitleFirstLine: 'Ship it', stageName: 'Plan' }) => 'Runner bravo, running, task Ship it, stage Plan'
 * @param {Object} [entry] - Runner box entry.
 * @returns {string} aria-label text.
 ***/
export const buildRunnerBoxAriaLabel = (entry) => {
  const rawLabel = entry?.runnerLabel;
  const label =
    typeof rawLabel === 'string' && rawLabel.trim() !== '' ? rawLabel.trim() : 'Runner';
  const rawStatus = entry?.statusWord;
  const status =
    typeof rawStatus === 'string' && rawStatus.trim() !== '' ? rawStatus.trim() : 'idle';
  let text = `Runner ${label}, ${status}`;
  if (entry?.taskTitleFirstLine) text += `, task ${entry.taskTitleFirstLine}`;
  if (entry?.stageName) text += `, stage ${entry.stageName}`;
  return text;
};

/***
 * MARK: truncateRunnerText
 * @description Caps tooltip text at RUNNER_BOX_TITLE_MAX_CHARS with an
 *   ellipsis. The visible line truncates in CSS; this only keeps absurdly
 *   long goal first lines out of the `title` tooltip.
 * @example truncateRunnerText('abc', 2) => 'a…'
 * @example truncateRunnerText('abc', 10) => 'abc'
 * @param {*} [value] - Candidate text.
 * @param {number} [max=RUNNER_BOX_TITLE_MAX_CHARS] - Maximum characters kept.
 * @returns {string} Capped text ('' for non-strings).
 ***/
export const truncateRunnerText = (value, max = RUNNER_BOX_TITLE_MAX_CHARS) => {
  if (typeof value !== 'string') return '';
  const limit = Number.isInteger(max) && max > 1 ? max : RUNNER_BOX_TITLE_MAX_CHARS;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
};

/***
 * MARK: coerceBoxText
 * @description Fail-closed text for a box line: trims strings, coerces other
 *   primitives (so an id of 7 renders as "7", never "[object Object]" or an
 *   empty name), and falls back for blank/missing/object values. Never throws.
 * @example coerceBoxText('  Bravo  ', 'unknown') => 'Bravo'
 * @example coerceBoxText(null, 'unknown') => 'unknown'
 * @param {*} [value] - Candidate text.
 * @param {string} fallback - Used when the value has no usable text.
 * @returns {string} Trimmed text or the fallback.
 ***/
export const coerceBoxText = (value, fallback) => {
  const safeFallback =
    typeof fallback === 'string' && fallback !== '' ? fallback : 'unknown';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' ? trimmed : safeFallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return safeFallback;
};

/***
 * MARK: selectRenderableRunnerEntries
 * @description Fail-safe filter for runner box entries: keeps only plain
 *   entry objects and drops junk array items (null, strings, numbers) that a
 *   half-written registry payload or a bad map could inject. Junk must never
 *   flip the bar into box mode or render a phantom "unknown" box — with no
 *   renderable entries the bar falls back to the legacy single-task view.
 *   Never throws and never mutates its input; non-array input yields [].
 * @example selectRenderableRunnerEntries([{ runnerId: 'b' }, null, 'junk']) => [{ runnerId: 'b' }]
 * @example selectRenderableRunnerEntries(null) => []
 * @param {Array} [entries] - Candidate runner box entries.
 * @returns {Array<Object>} Only the renderable entry objects, in order.
 ***/
export const selectRenderableRunnerEntries = (entries) =>
  Array.isArray(entries) ? entries.filter((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry)) : [];

/***
 * MARK: shouldShowRunnerBoxes
 * @description The <5 visibility gate plus the kill switch: 1-4 renderable
 *   entries render boxes unless `uiPreferences.showRunnerBoxes === false`
 *   (absent preference means enabled, so existing stored profiles need no
 *   migration). Junk array items are not counted: `[null]` keeps the legacy
 *   view instead of rendering a phantom box.
 * @example shouldShowRunnerBoxes([{}], {}) => true
 * @example shouldShowRunnerBoxes([{}, {}, {}, {}, {}], {}) => false
 * @example shouldShowRunnerBoxes([{}], { showRunnerBoxes: false }) => false
 * @example shouldShowRunnerBoxes([null], {}) => false
 * @param {Array} [entries] - Runner box entries.
 * @param {Object} [uiPreferences] - UI preferences (kill switch read only).
 * @returns {boolean} True when the box row replaces the single-task view.
 ***/
export const shouldShowRunnerBoxes = (entries, uiPreferences) => {
  const count = selectRenderableRunnerEntries(entries).length;
  if (count === 0 || count > RUNNER_BOX_MAX_COUNT) return false;
  return uiPreferences?.showRunnerBoxes !== false;
};
