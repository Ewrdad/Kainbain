// Stage tag helpers are shared with the backend (single normalisation source
// of truth) and re-exported here so stage-model consumers have one import site.
export {
  STAGE_TAG_MAX_COUNT,
  STAGE_TAG_MAX_LENGTH,
  normalizeStageTag,
  normalizeStageTags,
  stageTagKey,
  stageHasTag,
  stageMatchesTags,
  availableStageTags,
} from '../../../shared/stageTags.js';

/***
 * MARK: Stage Types Configuration
 * @description Defines the authoritative stage types:
 *   - 'agent': Automated AI execution (System Prompt + Model override)
 *   - 'human': Checkpoint requiring human review/approval (absorbs 'review')
 *   - 'ci': Automated bash verification command with timeout (absorbs
 *     'script' and the removed 'deploy' type — a stage whose command runs
 *     the deploy script is an ordinary ci stage)
 *   - 'merge': Integrates the task's branch into main — git operations
 *     only, never runs a command
 ***/

/***
 * MARK: FALLBACK_MODELS
 * @description The single shared fallback model list for the UI model
 *   selectors, shown when the API's /compute/models catalogue is unavailable
 *   or empty. Both consumers (ProjectSettings' default model and
 *   WorkflowCanvas' per-stage override) import this list so their offline
 *   fallbacks can never drift apart.
 *
 *   De-staled (task 970c0045): the former google (gemini-2.5-*) and anthropic
 *   (claude-3-7-sonnet) entries were removed — they do not exist in any
 *   configured model registry, have no credentials, and could never run; a
 *   curated fallback must only ever list models that CAN actually run. The
 *   remaining ollama-cloud entries mirror the live models.json catalogue. When
 *   /compute/models IS reachable, the pickers render the dynamic aggregated
 *   catalog instead (one live listing per available harness, with
 *   credential-aware badges — see frontend/src/services/modelStatus.js — so
 *   fallback entries that cannot be verified are never shown as "Ready").
 *   This list is the last-resort OFFLINE tier only: it renders when the
 *   catalogue fetch itself fails. Keep it aligned with the backend source of
 *   truth (api/models.js FALLBACK_MODELS).
 ***/
export const FALLBACK_MODELS = [
  {
    id: 'deepseek-v4-flash:0731-cloud',
    name: 'DeepSeek v4 Flash (Cloud)',
    provider: 'ollama-cloud',
    input: ['text'],
  },
  {
    id: 'deepseek-v4-pro:0813-cloud',
    name: 'DeepSeek v4 Pro (Cloud)',
    provider: 'ollama-cloud',
    input: ['text'],
  },
  { id: 'gemma4:12b', name: 'Gemma 4 12B', provider: 'ollama-cloud', input: ['text'] },
  {
    id: 'gemma4:31b-cloud',
    name: 'Gemma 4 31B (Cloud)',
    provider: 'ollama-cloud',
    input: ['text', 'image'],
  },
  {
    id: 'glm-5.1:cloud',
    name: 'GLM 5.1 (Cloud)',
    provider: 'ollama-cloud',
    input: ['text'],
  },
  {
    id: 'glm-5.2:cloud',
    name: 'GLM 5.2 (Cloud)',
    provider: 'ollama-cloud',
    input: ['text'],
  },
  {
    id: 'glm-5.3-flash:cloud',
    name: 'GLM 5.3 Flash (Cloud)',
    provider: 'ollama-cloud',
    input: ['text', 'image'],
  },
  {
    id: 'gpt-oss:120b-cloud',
    name: 'GPT-OSS 120B (Cloud)',
    provider: 'ollama-cloud',
    input: ['text'],
  },
  {
    id: 'gpt-oss:20b-cloud',
    name: 'GPT-OSS 20B (Cloud)',
    provider: 'ollama-cloud',
    input: ['text'],
  },
  {
    id: 'kimi-k2.7-code:cloud',
    name: 'Kimi K2.7 Code (Cloud)',
    provider: 'ollama-cloud',
    input: ['text', 'image'],
  },
  {
    id: 'kimi-k3:cloud',
    name: 'Kimi K3 (Cloud)',
    provider: 'ollama-cloud',
    input: ['text', 'image'],
  },
  {
    id: 'qwen3.5:397b-cloud',
    name: 'Qwen 3.5 397B (Cloud)',
    provider: 'ollama-cloud',
    input: ['text', 'image'],
  },
];

export const STAGE_TYPES = {
  agent: {
    label: 'Agent',
    ownerLabel: 'AGENT',
    ownerColor: 'text-primary',
    badgeClass: 'bg-agent-fill text-[#bbf7d0] border border-[#86efac]/40',
    accentClass: 'bg-primary',
    borderAccentClass: 'border-primary',
    headerClass: 'bg-stage-fill border-ochre',
    sublabel: 'SPECIFICATION',
    checkpoint: false,
  },
  human: {
    label: 'Human',
    ownerLabel: 'HUMAN',
    ownerColor: 'text-ochre',
    badgeClass: 'bg-human-fill text-[#bae6fd] border border-[#9acbff]/40',
    accentClass: 'bg-secondary',
    borderAccentClass: 'border-secondary',
    headerClass: 'bg-stage-fill border-ochre',
    sublabel: 'HUMAN GATEKEEPER',
    checkpoint: true,
  },
  ci: {
    label: 'CI',
    ownerLabel: 'AGENT',
    ownerColor: 'text-primary',
    badgeClass: 'bg-agent-fill text-[#bbf7d0] border border-[#86efac]/40',
    accentClass: 'bg-primary',
    borderAccentClass: 'border-primary',
    headerClass: 'bg-stage-fill border-ochre',
    sublabel: 'AUTOMATED VERIFICATION',
    checkpoint: false,
  },
  merge: {
    label: 'Merge',
    ownerLabel: 'MERGE',
    ownerColor: 'text-indigo-400',
    badgeClass: 'bg-indigo-900/40 text-indigo-200 border border-indigo-500/40',
    accentClass: 'bg-indigo-600',
    borderAccentClass: 'border-indigo-600',
    headerClass: 'bg-stage-fill border-indigo-600',
    sublabel: 'MERGE TO MAIN',
    checkpoint: false,
  },
};

/***
 * MARK: normalizeStageType
 * @description Normalizes legacy stage types (review -> human, script -> ci,
 *   deploy -> ci, custom -> agent) to authoritative types. The deploy pipeline
 *   stage type was removed: old `deploy`-typed stages normalize to `ci` here,
 *   and a stage whose command runs the deploy script is an ordinary ci stage.
 * @example normalizeStageType('review') => 'human'
 * @example normalizeStageType('deploy') => 'ci'
 * @param {string} [type]
 * @returns {'agent' | 'human' | 'ci' | 'merge'}
 ***/
export function normalizeStageType(type) {
  if (!type || typeof type !== 'string') return 'agent';
  const lower = type.trim().toLowerCase();
  if (lower === 'human' || lower === 'review') return 'human';
  if (lower === 'ci' || lower === 'script' || lower === 'deploy') return 'ci';
  if (lower === 'merge') return 'merge';
  if (lower === 'agent') return 'agent';
  return 'agent';
}

/***
 * MARK: getStageType
 * @description Retrieves configuration for a stage type with normalized fallback.
 * @example getStageType('human') => { label: 'Human', checkpoint: true, ... }
 * @param {string} [type]
 * @returns {{label: string, ownerLabel: string, ownerColor: string, badgeClass: string, accentClass: string, borderAccentClass: string, headerClass: string, sublabel: string, checkpoint: boolean}}
 ***/
export function getStageType(type) {
  const normalized = normalizeStageType(type);
  // eslint-disable-next-line security/detect-object-injection
  return STAGE_TYPES[normalized] || STAGE_TYPES.agent;
}

/***
 * MARK: isCheckpoint
 * @description Whether a stage requires human review/approval before proceeding.
 * @example isCheckpoint('human') => true
 * @param {string} [type]
 * @returns {boolean}
 ***/
export function isCheckpoint(type) {
  return normalizeStageType(type) === 'human' || getStageType(type).checkpoint === true;
}

/***
 * MARK: isCi
 * @description Whether a stage is an automated CI verification stage.
 * @example isCi('ci') => true
 * @param {string} [type]
 * @returns {boolean}
 ***/
export function isCi(type) {
  return normalizeStageType(type) === 'ci';
}

/***
 * MARK: isMerge
 * @description Whether a stage is a merge stage: git operations only —
 *   merges the task branch into main (never runs a command).
 * @example isMerge('merge') => true
 * @param {string} [type]
 * @returns {boolean}
 ***/
export function isMerge(type) {
  return normalizeStageType(type) === 'merge';
}

/***
 * MARK: isAgent
 * @description Whether a stage is an automated AI agent execution stage.
 * @example isAgent('agent') => true
 * @param {string} [type]
 * @returns {boolean}
 ***/
export function isAgent(type) {
  return normalizeStageType(type) === 'agent';
}

/***
 * MARK: isAutomatedStage
 * @description Whether a stage is fully scripted (no model runs): `ci`
 *   (absorbs legacy `script` and the removed `deploy` type) or `merge`. The
 *   monitor view hides the model+harness pills on these stages so they never
 *   imply AI involvement. Unknown/empty types default to `agent`
 *   (fail-visible: pills shown, never silently hidden).
 * @example isAutomatedStage('merge') => true
 * @example isAutomatedStage('agent') => false
 * @param {string} [type]
 * @returns {boolean}
 ***/
export function isAutomatedStage(type) {
  return isCi(type) || isMerge(type);
}

/***
 * MARK: findStageIndex
 * @description Finds a stage's position in the pipeline, matching by id first
 *   and falling back to a case-insensitive name match — the same resolution
 *   the backend's advanceStage uses, so the UI and the API always agree on
 *   which stage is "current" and which is "last".
 * @example findStageIndex([{id:'s1',name:'Build'},{id:'s2',name:'Review'}], 'Review') => 1
 * @param {Array} [stages] - The pipeline stage list (project stages, or the task workflow's stages).
 * @param {string} [stageIdOrName] - A stage id, or a stage name as a fallback.
 * @returns {number} The stage index, or -1 when the list is empty or has no match.
 ***/
export function findStageIndex(stages, stageIdOrName) {
  if (!Array.isArray(stages) || stages.length === 0) return -1;
  if (stageIdOrName === null || stageIdOrName === undefined) return -1;
  return stages.findIndex(
    (s) =>
      String(s.id) === String(stageIdOrName) ||
      (s.name && String(s.name).toLowerCase() === String(stageIdOrName).toLowerCase()),
  );
}

/***
 * MARK: isLastStage
 * @description Whether the given stage is the final stage of its pipeline.
 *   Fail-visible: an empty or unknown stage list returns false, so callers
 *   fall back to "advance" wording rather than wrongly promising completion.
 * @example isLastStage([{id:'s1'},{id:'s2'}], 's2') => true
 * @param {Array} [stages] - The same stage list the backend resolves for the task.
 * @param {string} [stageIdOrName] - The task's current stage id (or name).
 * @returns {boolean}
 ***/
export function isLastStage(stages, stageIdOrName) {
  if (!Array.isArray(stages) || stages.length === 0) return false;
  const index = findStageIndex(stages, stageIdOrName);
  return index !== -1 && index >= stages.length - 1;
}

/***
 * MARK: isTerminalHumanApproval
 * @description Whether approving right now finishes the whole task: the
 *   task's current stage is both the last pipeline stage AND a human
 *   checkpoint (legacy 'review' type counts as human). The backend's
 *   advanceStage already completes last-stage tasks, so this only decides
 *   which words the UI shows — never what the approval does.
 * @example isTerminalHumanApproval([{id:'s1',type:'agent'},{id:'s2',type:'human'}], {currentStageId:'s2'}) => true
 * @param {Array} [stages] - The same workflow-resolved stage list the backend uses for this task.
 * @param {Object|string} [taskOrStageId] - A task ({currentStageId}) or a stage id directly.
 * @returns {boolean}
 ***/
export function isTerminalHumanApproval(stages, taskOrStageId) {
  const stageIdOrName =
    typeof taskOrStageId === 'string' ? taskOrStageId : taskOrStageId?.currentStageId;
  if (!isLastStage(stages, stageIdOrName)) return false;
  const stage = stages.at(findStageIndex(stages, stageIdOrName));
  return normalizeStageType(stage?.type) === 'human';
}

/***
 * MARK: APPROVAL_COPY
 * @description The single home of every human-approval string: the advancing
 *   wording for mid-pipeline checkpoints and the completion wording for a
 *   last-stage human checkpoint. All four approval surfaces (canvas card,
 *   inspector banner, full-page banner, review page) read from here via
 *   approvalCopy so the copy can never drift apart between surfaces.
 ***/
const APPROVAL_COPY = {
  advance: {
    cardButton: '✓ Approve',
    cardTooltipTitle: 'Approve Checkpoint',
    cardTooltipDescription:
      'Accept generated stage artifacts and immediately advance task to the next stage.',
    cardAriaSuffix: '',
    cardBusy: 'Advancing...',
    bannerButton: '✓ Approve & Advance',
    bannerBusy: 'Advancing...',
    bannerAriaSuffix: '',
    detailsExplainer:
      'This task is currently waiting for human approval. You can advance it to the next stage with optional guidance, or reject it with feedback.',
    pageExplainer:
      'This task is waiting for human verification. Advance to next stage or reject with guidance.',
    guidanceLabel: 'Guidance for next stage:',
    guidanceToggle: '+ Add guidance for next stage',
    reviewButton: '▶ Pass Stage',
    reviewFooterAria: 'Pass this stage',
    reviewDialogAria: 'Pass stage',
    reviewDialogTitle: '▶ Pass Stage',
    reviewBusy: 'Passing…',
    reviewExplainer:
      'This advances the task to the next stage. Optionally add guidance the agent receives as `## Human Guidance`.',
    reviewGuidanceAria: 'Guidance for the next stage',
  },
  terminal: {
    cardButton: '✓ Approve & Complete',
    cardTooltipTitle: 'Approve Checkpoint & Complete',
    cardTooltipDescription:
      'Accept generated stage artifacts and immediately mark the task complete.',
    cardAriaSuffix: ' and complete',
    cardBusy: 'Completing...',
    bannerButton: '✓ Approve & Mark Complete',
    bannerBusy: 'Completing...',
    bannerAriaSuffix: ' and mark complete',
    detailsExplainer:
      'This task is currently waiting for human approval. Approving marks the task complete (optional guidance is kept with the task), or you can reject it with feedback.',
    pageExplainer:
      'This task is waiting for human verification. Approve to mark it complete, or reject with guidance.',
    guidanceLabel: 'Guidance note (optional):',
    guidanceToggle: '+ Add guidance note',
    reviewButton: '▶ Pass Stage & Complete',
    reviewFooterAria: 'Pass this stage and complete',
    reviewDialogAria: 'Pass stage and complete',
    reviewDialogTitle: '▶ Pass Stage & Complete',
    reviewBusy: 'Completing…',
    reviewExplainer:
      'This completes the task. Optionally add guidance, kept with the task as `## Human Guidance`.',
    reviewGuidanceAria: 'Guidance note (optional)',
  },
};

/***
 * MARK: approvalCopy
 * @description Picks the approval wording for a human checkpoint: completion
 *   copy when the checkpoint is the last pipeline stage, advance copy
 *   otherwise. Terminal accessible names keep the advance roots as prefixes
 *   (e.g. 'Pass this stage and complete') so existing matchers and
 *   screen-reader habits keep working.
 * @example approvalCopy(true).bannerButton => '✓ Approve & Mark Complete'
 * @param {boolean} [isTerminal] - From isTerminalHumanApproval.
 * @returns {Object} The frozen label set for one outcome.
 ***/
export function approvalCopy(isTerminal) {
  return isTerminal ? APPROVAL_COPY.terminal : APPROVAL_COPY.advance;
}
