// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  STAGE_TYPES,
  normalizeStageType,
  getStageType,
  isCheckpoint,
  isCi,
  isMerge,
  isAgent,
  isAutomatedStage,
  findStageIndex,
  isLastStage,
  isTerminalHumanApproval,
  approvalCopy,
} from './stageTypes';

/***
 * MARK: Stage Types Unit Tests
 * @description Verifies that stage types include 'agent', 'human', 'ci', and
 * 'merge', that legacy types (including the removed 'deploy') are seamlessly
 * normalized, and that all type helper functions work as expected.
 ***/
describe('stageTypes', () => {
  it('defines authoritative stage types: agent, human, ci, merge', () => {
    const keys = Object.keys(STAGE_TYPES);
    expect(keys).toEqual(['agent', 'human', 'ci', 'merge']);
    expect(STAGE_TYPES.agent.label).toBe('Agent');
    expect(STAGE_TYPES.human.label).toBe('Human');
    expect(STAGE_TYPES.ci.label).toBe('CI');
    expect(STAGE_TYPES.merge.label).toBe('Merge');
  });

  it('normalizes legacy and unknown stage types correctly', () => {
    // Legacy mapping
    expect(normalizeStageType('review')).toBe('human');
    expect(normalizeStageType('script')).toBe('ci');
    expect(normalizeStageType('custom')).toBe('agent');
    expect(normalizeStageType('arbitrary-stage')).toBe('agent');
    expect(normalizeStageType(null)).toBe('agent');
    expect(normalizeStageType(undefined)).toBe('agent');
    expect(normalizeStageType('')).toBe('agent');

    // Authoritative types
    expect(normalizeStageType('agent')).toBe('agent');
    expect(normalizeStageType('human')).toBe('human');
    expect(normalizeStageType('ci')).toBe('ci');
    // The deploy pipeline type was removed: it normalizes to `ci` (a deploy
    // is a ci stage whose command runs the deploy script).
    expect(normalizeStageType('deploy')).toBe('ci');
    expect(normalizeStageType('merge')).toBe('merge');
    expect(normalizeStageType('  HUMAN  ')).toBe('human');
    expect(normalizeStageType('CI')).toBe('ci');
    expect(normalizeStageType('DEPLOY')).toBe('ci');
    expect(normalizeStageType('MERGE')).toBe('merge');
  });

  it('getStageType returns correct config object for all types', () => {
    const agentConfig = getStageType('agent');
    expect(agentConfig.label).toBe('Agent');
    expect(agentConfig.checkpoint).toBe(false);

    const humanConfig = getStageType('human');
    expect(humanConfig.label).toBe('Human');
    expect(humanConfig.checkpoint).toBe(true);

    const ciConfig = getStageType('ci');
    expect(ciConfig.label).toBe('CI');
    expect(ciConfig.checkpoint).toBe(false);

    // Legacy deploy normalizes to the ci config.
    expect(getStageType('deploy')).toEqual(STAGE_TYPES.ci);

    const mergeConfig = getStageType('merge');
    expect(mergeConfig.label).toBe('Merge');
    expect(mergeConfig.checkpoint).toBe(false);
    expect(mergeConfig.sublabel).toBe('MERGE TO MAIN');

    // Legacy fallback/normalization
    expect(getStageType('review')).toEqual(STAGE_TYPES.human);
    expect(getStageType('script')).toEqual(STAGE_TYPES.ci);
    expect(getStageType('MERGE')).toEqual(STAGE_TYPES.merge);
    expect(getStageType('unknown')).toEqual(STAGE_TYPES.agent);
  });

  it('isCheckpoint returns true only for human (and legacy review) stages', () => {
    expect(isCheckpoint('human')).toBe(true);
    expect(isCheckpoint('review')).toBe(true);
    expect(isCheckpoint('agent')).toBe(false);
    expect(isCheckpoint('ci')).toBe(false);
    expect(isCheckpoint('script')).toBe(false);
    expect(isCheckpoint('deploy')).toBe(false);
    expect(isCheckpoint('merge')).toBe(false);
    expect(isCheckpoint('other')).toBe(false);
  });

  it('isCi returns true only for ci (and legacy script) stages', () => {
    expect(isCi('ci')).toBe(true);
    expect(isCi('script')).toBe(true);
    expect(isCi('agent')).toBe(false);
    expect(isCi('human')).toBe(false);
    expect(isCi('review')).toBe(false);
    // Legacy deploy stages are ci stages now.
    expect(isCi('deploy')).toBe(true);
    expect(isCi('merge')).toBe(false);
  });

  it('isMerge returns true for merge stages (case-insensitive) and nothing else', () => {
    expect(isMerge('merge')).toBe(true);
    expect(isMerge('MERGE')).toBe(true);
    expect(isMerge(' Merge ')).toBe(true);
    expect(isMerge('agent')).toBe(false);
    expect(isMerge('ci')).toBe(false);
    expect(isMerge('script')).toBe(false);
    expect(isMerge('human')).toBe(false);
    expect(isMerge('deploy')).toBe(false);
    expect(isMerge('review')).toBe(false);
    expect(isMerge(null)).toBe(false);
    expect(isMerge(undefined)).toBe(false);
    expect(isMerge('')).toBe(false);
  });

  it('isAgent returns true for agent and fallback types', () => {
    expect(isAgent('agent')).toBe(true);
    expect(isAgent('custom')).toBe(true);
    expect(isAgent('unknown')).toBe(true);
    expect(isAgent('human')).toBe(false);
    expect(isAgent('ci')).toBe(false);
    expect(isAgent('deploy')).toBe(false);
    expect(isAgent('merge')).toBe(false);
  });

  it('findStageIndex resolves by id first, then case-insensitive name (backend parity)', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
    ];
    expect(findStageIndex(stages, 's1')).toBe(0);
    expect(findStageIndex(stages, 's2')).toBe(1);
    expect(findStageIndex(stages, 'review')).toBe(1);
    expect(findStageIndex(stages, 'REVIEW')).toBe(1);
    expect(findStageIndex(stages, 'unknown')).toBe(-1);
    expect(findStageIndex([], 's1')).toBe(-1);
    expect(findStageIndex(null, 's1')).toBe(-1);
    expect(findStageIndex(stages, null)).toBe(-1);
    expect(findStageIndex(stages, undefined)).toBe(-1);
  });

  it('isLastStage is true only for the final stage id, fail-visible otherwise', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
    ];
    expect(isLastStage(stages, 's2')).toBe(true);
    expect(isLastStage(stages, 'Review')).toBe(true);
    expect(isLastStage(stages, 's1')).toBe(false);
    expect(isLastStage(stages, 'unknown')).toBe(false);
    expect(isLastStage([], 's2')).toBe(false);
    expect(isLastStage(null, 's2')).toBe(false);
    expect(isLastStage(stages, null)).toBe(false);
    // A single-stage pipeline is trivially last.
    expect(isLastStage([{ id: 'only', name: 'Solo', type: 'human' }], 'only')).toBe(true);
  });

  it('isTerminalHumanApproval is true only for a last-stage human checkpoint', () => {
    const agentThenHuman = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
    ];
    // Last-stage human: approving completes the task.
    expect(isTerminalHumanApproval(agentThenHuman, { currentStageId: 's2' })).toBe(true);
    expect(isTerminalHumanApproval(agentThenHuman, 's2')).toBe(true);
    // Mid-pipeline human: approving advances.
    const humanThenMerge = [
      { id: 's1', name: 'Review', type: 'human' },
      { id: 's2', name: 'Merge', type: 'merge' },
    ];
    expect(isTerminalHumanApproval(humanThenMerge, { currentStageId: 's1' })).toBe(false);
    // Last stage but automated: not a human approval at all.
    expect(isTerminalHumanApproval(humanThenMerge, { currentStageId: 's2' })).toBe(false);
    expect(isTerminalHumanApproval(agentThenHuman, { currentStageId: 's1' })).toBe(false);
    // Single-stage human pipeline: the only approval is terminal.
    expect(isTerminalHumanApproval([{ id: 'only', name: 'Solo', type: 'human' }], 'only')).toBe(
      true,
    );
    // Legacy 'review' type still counts as human.
    expect(
      isTerminalHumanApproval(
        [
          { id: 's1', name: 'Build', type: 'agent' },
          { id: 's2', name: 'Review', type: 'review' },
        ],
        's2',
      ),
    ).toBe(true);
    // Fail-visible: unknown stages promise advance wording, never completion.
    expect(isTerminalHumanApproval([], 's2')).toBe(false);
    expect(isTerminalHumanApproval(null, 's2')).toBe(false);
    expect(isTerminalHumanApproval(agentThenHuman, 'unknown')).toBe(false);
    expect(isTerminalHumanApproval(agentThenHuman, {})).toBe(false);
    expect(isTerminalHumanApproval(agentThenHuman, null)).toBe(false);
    // Callers must pass the same workflow-resolved stage list the backend
    // uses (resolveStagesForTask): a project-level list that omits the task
    // workflow's trailing stages would misreport terminal here.
    const workflowStages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
      { id: 's3', name: 'Deploy', type: 'deploy' },
    ];
    expect(isTerminalHumanApproval(workflowStages, 's2')).toBe(false);
    expect(isTerminalHumanApproval(agentThenHuman, 's2')).toBe(true);
  });

  it('approvalCopy keeps advance wording unchanged and completion wording terminal', () => {
    const advance = approvalCopy(false);
    expect(advance.cardButton).toBe('✓ Approve');
    expect(advance.cardTooltipTitle).toBe('Approve Checkpoint');
    expect(advance.cardTooltipDescription).toContain('advance task to the next stage');
    expect(advance.cardAriaSuffix).toBe('');
    expect(advance.cardBusy).toBe('Advancing...');
    expect(advance.bannerButton).toBe('✓ Approve & Advance');
    expect(advance.bannerBusy).toBe('Advancing...');
    expect(advance.bannerAriaSuffix).toBe('');
    expect(advance.detailsExplainer).toContain('advance it to the next stage');
    expect(advance.pageExplainer).toContain('Advance to next stage');
    expect(advance.guidanceLabel).toBe('Guidance for next stage:');
    expect(advance.guidanceToggle).toBe('+ Add guidance for next stage');
    expect(advance.reviewButton).toBe('▶ Pass Stage');
    expect(advance.reviewFooterAria).toBe('Pass this stage');
    expect(advance.reviewDialogAria).toBe('Pass stage');
    expect(advance.reviewDialogTitle).toBe('▶ Pass Stage');
    expect(advance.reviewBusy).toBe('Passing…');
    expect(advance.reviewExplainer).toContain('advances the task to the next stage');
    expect(advance.reviewGuidanceAria).toBe('Guidance for the next stage');

    const terminal = approvalCopy(true);
    expect(terminal.cardButton).toBe('✓ Approve & Complete');
    expect(terminal.cardTooltipTitle).toBe('Approve Checkpoint & Complete');
    expect(terminal.cardTooltipDescription).toContain('mark the task complete');
    expect(terminal.cardAriaSuffix).toBe(' and complete');
    expect(terminal.cardBusy).toBe('Completing...');
    expect(terminal.bannerButton).toBe('✓ Approve & Mark Complete');
    expect(terminal.bannerBusy).toBe('Completing...');
    expect(terminal.bannerAriaSuffix).toBe(' and mark complete');
    expect(terminal.detailsExplainer).toContain('marks the task complete');
    expect(terminal.pageExplainer).toContain('mark it complete');
    expect(terminal.guidanceLabel).toBe('Guidance note (optional):');
    expect(terminal.guidanceToggle).toBe('+ Add guidance note');
    expect(terminal.reviewButton).toBe('▶ Pass Stage & Complete');
    expect(terminal.reviewFooterAria).toBe('Pass this stage and complete');
    expect(terminal.reviewDialogAria).toBe('Pass stage and complete');
    expect(terminal.reviewDialogTitle).toBe('▶ Pass Stage & Complete');
    expect(terminal.reviewBusy).toBe('Completing…');
    expect(terminal.reviewExplainer).toContain('completes the task');
    expect(terminal.reviewGuidanceAria).toBe('Guidance note (optional)');

    // Terminal labels keep the advance roots as prefixes so existing
    // accessible-name matchers and screen-reader habits keep working.
    expect(`Approve task #KB-1${terminal.cardAriaSuffix}`).toMatch(/^Approve task #KB-1/);
    expect(terminal.reviewFooterAria.startsWith(advance.reviewFooterAria)).toBe(true);
  });

  it('isAutomatedStage returns true for ci/merge (and legacy script/deploy), fail-visible otherwise', () => {
    expect(isAutomatedStage('ci')).toBe(true);
    expect(isAutomatedStage('script')).toBe(true);
    expect(isAutomatedStage('deploy')).toBe(true);
    expect(isAutomatedStage('merge')).toBe(true);
    expect(isAutomatedStage('CI')).toBe(true);
    expect(isAutomatedStage('Script')).toBe(true);
    expect(isAutomatedStage('DEPLOY')).toBe(true);
    expect(isAutomatedStage(' Merge ')).toBe(true);
    expect(isAutomatedStage('agent')).toBe(false);
    expect(isAutomatedStage('human')).toBe(false);
    expect(isAutomatedStage('review')).toBe(false);
    expect(isAutomatedStage('custom')).toBe(false);
    expect(isAutomatedStage('unknown')).toBe(false);
    expect(isAutomatedStage(null)).toBe(false);
    expect(isAutomatedStage(undefined)).toBe(false);
    expect(isAutomatedStage('')).toBe(false);
  });
});
