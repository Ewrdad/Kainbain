// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildDisplayTimeline,
  formatBlockerKeys,
  formatDiffStat,
  formatTaskKey,
  formatTaskTimestamp,
  formatTaskTitleFirstLine,
  formatTryCount,
  getBlockedState,
  isAutoIterationInProgress,
  isTaskCompleted,
  resolveTimelineStageLabel,
  selectDisplayTimeline,
  selectStagePresentation,
  STAGE_RUN_TRY_COUNT_CAP,
  summarizeStageRuns,
} from './taskFormatters';
import {
  duplicateStoredTimeline,
  duplicateTimelineStages,
} from './__fixtures__/duplicateInProgressTimeline.js';

/***
 * MARK: taskFormatters unit tests
 * @description Verifies standardized task key formatting and real timestamp computation without 'Just now'.
 ***/
describe('taskFormatters', () => {
  describe('isTaskCompleted', () => {
    it('treats completed and legacy done statuses as completed', () => {
      expect(isTaskCompleted({ status: 'completed' })).toBe(true);
      expect(isTaskCompleted({ status: 'done' })).toBe(true);
    });

    it('treats every other status as active', () => {
      expect(isTaskCompleted({ status: 'in_stage' })).toBe(false);
      expect(isTaskCompleted({ status: 'pending' })).toBe(false);
      expect(isTaskCompleted({ status: 'failed' })).toBe(false);
      expect(isTaskCompleted({ status: 'waiting_human' })).toBe(false);
      expect(isTaskCompleted({})).toBe(false);
    });

    it('handles null or undefined tasks safely', () => {
      expect(isTaskCompleted(null)).toBe(false);
      expect(isTaskCompleted(undefined)).toBe(false);
    });
  });

  describe('formatTaskKey', () => {
    it('formats UUID into #KB-XXXX uppercase', () => {
      expect(formatTaskKey('73c4560d-1417-4fe1-8695-a829237de9ec')).toBe('#KB-73C4');
      expect(formatTaskKey('abc-1234-def')).toBe('#KB-ABC1');
    });

    it('formats short IDs gracefully', () => {
      expect(formatTaskKey('t1')).toBe('#KB-T1');
      expect(formatTaskKey('k12')).toBe('#KB-K12');
    });

    it('handles undefined or null IDs with fallback', () => {
      expect(formatTaskKey(null)).toBe('#KB-0000');
      expect(formatTaskKey(undefined)).toBe('#KB-0000');
      expect(formatTaskKey('')).toBe('#KB-0000');
    });
  });

  describe('formatTaskTitleFirstLine', () => {
    it('returns the first line of a task goal with heading markers stripped', () => {
      expect(formatTaskTitleFirstLine({ goal: '# Ship it\nbody' })).toBe('Ship it');
      expect(formatTaskTitleFirstLine({ goal: 'Plan\nMore detail' })).toBe('Plan');
    });

    it('prefers goal over title and falls back to title', () => {
      expect(formatTaskTitleFirstLine({ goal: 'Goal line', title: 'Title line' })).toBe(
        'Goal line',
      );
      expect(formatTaskTitleFirstLine({ goal: '', title: 'Title line' })).toBe('Title line');
    });

    it('accepts a raw string', () => {
      expect(formatTaskTitleFirstLine('# Raw\nsecond')).toBe('Raw');
    });

    it('fails safe to the fallback for missing or non-string input', () => {
      expect(formatTaskTitleFirstLine(null)).toBe('Untitled Task');
      expect(formatTaskTitleFirstLine(undefined)).toBe('Untitled Task');
      expect(formatTaskTitleFirstLine({})).toBe('Untitled Task');
      expect(formatTaskTitleFirstLine({ goal: 42 })).toBe('Untitled Task');
      expect(formatTaskTitleFirstLine(null, 'Task')).toBe('Task');
      expect(formatTaskTitleFirstLine({ goal: '', title: '' }, '')).toBe('');
    });
  });

  describe('formatTaskTimestamp', () => {
    it('formats valid ISO date timestamp without "Just now"', () => {
      const nowIso = new Date().toISOString();
      const result = formatTaskTimestamp({ enteredStageAt: nowIso });
      expect(result).not.toContain('Just now');
      expect(result).toContain('in stage');
    });

    it('formats string timeInStage with in stage suffix', () => {
      expect(formatTaskTimestamp({ timeInStage: '4m' })).toBe('4m in stage');
      expect(formatTaskTimestamp({ timeInStage: '10m in stage' })).toBe('10m in stage');
    });

    it('never outputs "Just now" when timeInStage is "Just now"', () => {
      expect(formatTaskTimestamp({ timeInStage: 'Just now' })).toBe('0m in stage');
    });

    it('handles null or empty task gracefully', () => {
      expect(formatTaskTimestamp(null)).toBe('0m in stage');
      expect(formatTaskTimestamp({})).toBe('0m in stage');
    });
  });

  describe('getBlockedState', () => {
    const blocker = { id: 'abc-1234-def', status: 'in_stage' };
    const doneBlocker = { id: 'abc-1234-def', status: 'completed' };

    it('prefers the scheduler isBlocked verdict over derivation', () => {
      expect(getBlockedState({ isBlocked: true }, []).isBlocked).toBe(true);
      expect(
        getBlockedState({ isBlocked: false, blockedBy: ['abc-1234-def'] }, [blocker]).isBlocked,
      ).toBe(false);
    });

    it('derives blocked from unfinished blockers in the live list', () => {
      const state = getBlockedState({ blockedBy: ['abc-1234-def'] }, [blocker]);
      expect(state.isBlocked).toBe(true);
      expect(state.blockerIds).toEqual(['abc-1234-def']);
    });

    it('is not blocked when every blocker is completed', () => {
      const state = getBlockedState({ blockedBy: ['abc-1234-def'] }, [doneBlocker]);
      expect(state.isBlocked).toBe(false);
      expect(state.blockerIds).toEqual(['abc-1234-def']);
    });

    it('is not blocked with an empty or missing blockedBy', () => {
      expect(getBlockedState({ blockedBy: [] }, [blocker]).isBlocked).toBe(false);
      expect(getBlockedState({}, [blocker]).isBlocked).toBe(false);
      expect(getBlockedState(null, [blocker]).isBlocked).toBe(false);
    });

    it('treats stale ids as not blocked but keeps them as blocker ids', () => {
      const state = getBlockedState({ blockedBy: ['missing-id'] }, [blocker]);
      expect(state.isBlocked).toBe(false);
      expect(state.blockerIds).toEqual(['missing-id']);
    });

    it('prefers the blockers array for ids and tolerates a non-array blockedBy', () => {
      expect(
        getBlockedState({ blockers: ['x-1'], blockedBy: 'abc-1234-def' }, []).blockerIds,
      ).toEqual(['x-1']);
      const state = getBlockedState({ blockedBy: 'abc-1234-def' }, [blocker]);
      expect(state.isBlocked).toBe(false);
      expect(state.blockerIds).toEqual([]);
    });
  });

  describe('formatBlockerKeys', () => {
    it('formats blocker ids as short #KB-XXXX keys', () => {
      expect(formatBlockerKeys(['abc-1234-def'])).toBe('#KB-ABC1');
      expect(formatBlockerKeys(['abc-1234-def', 'def-5678-ghi'])).toBe('#KB-ABC1, #KB-DEF5');
    });

    it('caps long blocker lists with a +N more suffix', () => {
      expect(formatBlockerKeys(['a-1111', 'b-2222', 'c-3333', 'd-4444'])).toBe(
        '#KB-A111, #KB-B222, #KB-C333 +1 more',
      );
      expect(
        formatBlockerKeys(['a-1111', 'b-2222', 'c-3333', 'd-4444', 'e-5555'], { max: 2 }),
      ).toBe('#KB-A111, #KB-B222 +3 more');
    });

    it('never emits a raw UUID or a blank for unknown ids', () => {
      const key = formatBlockerKeys(['73c4560d-1417-4fe1-8695-a829237de9ec']);
      expect(key).toBe('#KB-73C4');
      expect(key).not.toContain('73c4560d-1417');
      expect(formatBlockerKeys([])).toBe('');
      expect(formatBlockerKeys(null)).toBe('');
    });
  });

  describe('formatDiffStat', () => {
    it('renders added and removed lines as "+N -M"', () => {
      expect(formatDiffStat({ additions: 12, deletions: 3 })).toBe('+12 -3');
      expect(formatDiffStat({ additions: 1, deletions: 0 })).toBe('+1 -0');
    });

    it('renders a real zero diff', () => {
      expect(formatDiffStat({ additions: 0, deletions: 0 })).toBe('+0 -0');
    });

    it('returns null for legacy entries without diff data', () => {
      expect(formatDiffStat({ stage: 'Idea' })).toBeNull();
      expect(formatDiffStat({ additions: 5 })).toBeNull();
      expect(formatDiffStat({ deletions: 2 })).toBeNull();
      expect(formatDiffStat(null)).toBeNull();
      expect(formatDiffStat(undefined)).toBeNull();
    });

    it('returns null for non-integer or negative counts', () => {
      expect(formatDiffStat({ additions: '12', deletions: 3 })).toBeNull();
      expect(formatDiffStat({ additions: 1.5, deletions: 0 })).toBeNull();
      expect(formatDiffStat({ additions: -1, deletions: 2 })).toBeNull();
      expect(formatDiffStat({ additions: 2, deletions: -1 })).toBeNull();
    });
  });

  describe('resolveTimelineStageLabel', () => {
    const stages = [
      { id: '1', name: 'Idea' },
      { id: '2', name: 'Technical Elab' },
    ];

    it('maps a legacy numeric stage label to the current stage name', () => {
      expect(resolveTimelineStageLabel('1', stages)).toBe('Idea');
      expect(resolveTimelineStageLabel('2', stages)).toBe('Technical Elab');
    });

    it('leaves a non-numeric label (already a name) unchanged', () => {
      expect(resolveTimelineStageLabel('Idea', stages)).toBe('Idea');
      expect(resolveTimelineStageLabel("Technical Elab", stages)).toBe(
        'Technical Elab',
      );
    });

    it('leaves an unknown numeric label unchanged', () => {
      expect(resolveTimelineStageLabel('9', stages)).toBe('9');
    });

    it('handles empty labels and missing stages safely', () => {
      expect(resolveTimelineStageLabel('', stages)).toBe('');
      expect(resolveTimelineStageLabel('1', [])).toBe('1');
      expect(resolveTimelineStageLabel(undefined, stages)).toBe('');
    });
  });

  describe('selectDisplayTimeline', () => {
    const stages = [
      { id: '1', name: 'Idea' },
      { id: '2', name: 'Plan' },
    ];

    it('returns newest entries first without mutating the stored order', () => {
      const stored = [{ stage: 'Idea' }, { stage: 'Plan' }];
      expect(selectDisplayTimeline(stored, stages)).toEqual([
        { stage: 'Plan' },
        { stage: 'Idea' },
      ]);
      expect(stored).toEqual([{ stage: 'Idea' }, { stage: 'Plan' }]);
    });

    it('maps legacy numeric labels and drops exact duplicates', () => {
      const stored = [
        { stage: '1', timestamp: 't1', status: 's', duration: 'd' },
        { stage: '1', timestamp: 't1', status: 's', duration: 'd' },
        { stage: 'Plan', timestamp: 't2', status: 's', duration: 'd' },
      ];
      expect(selectDisplayTimeline(stored, stages)).toEqual([
        { stage: 'Plan', timestamp: 't2', status: 's', duration: 'd' },
        { stage: 'Idea', timestamp: 't1', status: 's', duration: 'd' },
      ]);
    });

    it('handles empty and non-array input safely', () => {
      expect(selectDisplayTimeline([], [])).toEqual([]);
      expect(selectDisplayTimeline(undefined, stages)).toEqual([]);
    });

    it('preserves run-attribution fields through dedupe and reversal', () => {
      const stored = [
        {
          stage: 'Plan',
          timestamp: 't1',
          status: 'Moved',
          duration: '9s',
          harnessId: 'pi',
          modelRef: 'mistral::large',
          aliasName: 'worker',
          targetIndex: 0,
        },
        {
          stage: 'CI',
          timestamp: 't2',
          status: 'Advanced',
          duration: '4s',
        },
      ];
      const display = selectDisplayTimeline(stored, stages);
      expect(display[0]).toEqual({
        stage: 'CI',
        timestamp: 't2',
        status: 'Advanced',
        duration: '4s',
      });
      expect(display[1]).toEqual({
        stage: 'Plan',
        timestamp: 't1',
        status: 'Moved',
        duration: '9s',
        harnessId: 'pi',
        modelRef: 'mistral::large',
        aliasName: 'worker',
        targetIndex: 0,
      });
    });

    it('keeps the dedupe key attribution-blind (key fields only, no model fields)', () => {
      const stored = [
        {
          stage: 'Plan',
          timestamp: 't1',
          status: 'Moved',
          duration: '9s',
          harnessId: 'pi',
          modelRef: 'mistral::large',
        },
        {
          stage: 'Plan',
          timestamp: 't1',
          status: 'Moved',
          duration: '9s',
          harnessId: 'antigravity',
          modelRef: 'gemini-3.8-flash-low',
        },
      ];
      // The dedupe key stays stage/timestamp/status/duration only: rows that
      // share those still collapse exactly as before, and attribution fields
      // never leak into the key.
      const display = selectDisplayTimeline(stored, stages);
      expect(display).toHaveLength(1);
      expect(display[0].modelRef).toBe('mistral::large');
    });
  });

  describe('selectDisplayTimeline run-attribution fail-safe (wrong-stage badges)', () => {
    const typedStages = [
      { id: '1', name: 'Catchup', type: 'agent' },
      { id: '2', name: 'Review Plan', type: 'human' },
      { id: '3', name: 'Risk review', type: 'agent' },
      { id: '4', name: 'Automated tests', type: 'ci' },
      { id: '5', name: 'Merge', type: 'merge' },
    ];
    const dirtyHumanRow = () => ({
      stage: 'Review Plan',
      timestamp: 't-human',
      status: 'Advanced',
      duration: '32s',
      harnessId: 'pi',
      modelRef: 'pi::mistral::ministral-14b-2512',
      aliasName: 'utility',
      targetIndex: 1,
    });

    it('strips a legacy misattributed badge from a human stage arrival row', () => {
      const stored = [dirtyHumanRow()];
      const display = selectDisplayTimeline(stored, typedStages);
      expect(display).toHaveLength(1);
      expect(display[0].stage).toBe('Review Plan');
      expect(display[0].timestamp).toBe('t-human');
      expect(display[0].status).toBe('Advanced');
      expect(display[0].duration).toBe('32s');
      expect(display[0].harnessId).toBeUndefined();
      expect(display[0].modelRef).toBeUndefined();
      expect(display[0].aliasName).toBeUndefined();
      expect(display[0].targetIndex).toBeUndefined();
      // The stored row is untouched: stripping is display-only.
      expect(stored[0].modelRef).toBe('pi::mistral::ministral-14b-2512');
    });

    it('strips badges from ci and merge rows whatever the stored row carries', () => {
      const stored = [
        {
          stage: 'Automated tests',
          timestamp: 't-ci',
          status: 'Advanced',
          duration: '4s',
          harnessId: 'pi',
          modelRef: 'glm',
        },
        {
          stage: 'Merge',
          timestamp: 't-merge',
          status: 'Moved',
          duration: '2s',
          harnessId: 'pi',
          modelRef: 'glm',
          aliasName: 'worker',
          targetIndex: 0,
        },
      ];
      const display = selectDisplayTimeline(stored, typedStages);
      for (const row of display) {
        expect(row.harnessId).toBeUndefined();
        expect(row.modelRef).toBeUndefined();
        expect(row.aliasName).toBeUndefined();
        expect(row.targetIndex).toBeUndefined();
      }
    });

    it('normalizes legacy stage types before stripping (review/script count as non-agent)', () => {
      const legacyStages = [
        { id: '2', name: 'Review Plan', type: 'review' },
        { id: '4', name: 'Automated tests', type: 'script' },
      ];
      const stored = [
        dirtyHumanRow(),
        {
          stage: 'Automated tests',
          timestamp: 't-ci',
          status: 'Advanced',
          duration: '4s',
          harnessId: 'pi',
          modelRef: 'glm',
        },
      ];
      const display = selectDisplayTimeline(stored, legacyStages);
      expect(display[0].modelRef).toBeUndefined();
      expect(display[1].modelRef).toBeUndefined();
    });

    it('strips by legacy numeric id and Failed outcome rows on non-agent stages', () => {
      const stored = [
        {
          stage: '2',
          timestamp: 't-num',
          status: 'Advanced',
          duration: '9s',
          harnessId: 'pi',
          modelRef: 'glm',
        },
        {
          stage: 'Review Plan',
          timestamp: 't-failed',
          status: 'Failed',
          duration: '9s',
          harnessId: 'pi',
          modelRef: 'glm',
        },
        {
          stage: 'Risk review',
          timestamp: 't-ok',
          status: 'Failed',
          duration: '9s',
          harnessId: 'antigravity',
          modelRef: 'antigravity::gemini-3.8-flash-medium',
          aliasName: 'worker',
        },
      ];
      const display = selectDisplayTimeline(stored, typedStages);
      const byTimestamp = Object.fromEntries(display.map((row) => [row.timestamp, row]));
      // Numeric '2' maps to the human 'Review Plan' stage: stripped.
      expect(byTimestamp['t-num'].stage).toBe('Review Plan');
      expect(byTimestamp['t-num'].modelRef).toBeUndefined();
      // A Failed row headed with a human stage never shows a badge either.
      expect(byTimestamp['t-failed'].modelRef).toBeUndefined();
      // A Failed row headed with an agent stage keeps its own run's badge.
      expect(byTimestamp['t-ok']).toMatchObject({
        harnessId: 'antigravity',
        modelRef: 'antigravity::gemini-3.8-flash-medium',
        aliasName: 'worker',
      });
    });

    it('keeps agent-stage badges and fails open on unknown stages', () => {
      const stored = [
        {
          stage: 'Risk review',
          timestamp: 't-agent',
          status: 'Advanced',
          duration: '9s',
          harnessId: 'antigravity',
          modelRef: 'antigravity::gemini-3.8-flash-medium',
          aliasName: 'worker',
        },
        {
          stage: 'Renamed stage',
          timestamp: 't-unknown',
          status: 'Advanced',
          duration: '9s',
          harnessId: 'pi',
          modelRef: 'glm',
        },
      ];
      const display = selectDisplayTimeline(stored, typedStages);
      const byTimestamp = Object.fromEntries(display.map((row) => [row.timestamp, row]));
      expect(byTimestamp['t-agent'].modelRef).toBe(
        'antigravity::gemini-3.8-flash-medium',
      );
      // Unresolvable stage: never assumed human/CI, stored fields preserved.
      expect(byTimestamp['t-unknown'].modelRef).toBe('glm');
      // Empty stage list: nothing resolves, nothing is stripped.
      const noStages = selectDisplayTimeline([dirtyHumanRow()], []);
      expect(noStages[0].modelRef).toBe('pi::mistral::ministral-14b-2512');
    });

    it('leaves the live Active row of a human stage blank despite a dirty stored arrival', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [dirtyHumanRow()],
        stages: typedStages,
        currentStageName: 'Review Plan',
        liveDurationLabel: '49s in stage',
        includeLiveRow: true,
      });
      expect(display).toHaveLength(1);
      expect(display[0]).toEqual({
        stage: 'Review Plan',
        duration: '49s in stage',
        timestamp: 'Active',
        status: 'Active',
      });
    });
  });

  describe('buildDisplayTimeline attribution transport', () => {
    it('keeps run-attribution fields on stored rows and leaves unattributed rows blank', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [
          {
            stage: 'Plan',
            timestamp: 't1',
            status: 'Moved',
            duration: '9s',
            harnessId: 'pi',
            modelRef: 'mistral::large',
            aliasName: 'worker',
            targetIndex: 0,
          },
          {
            stage: 'CI',
            timestamp: 't2',
            status: 'Advanced',
            duration: '4s',
          },
        ],
        includeLiveRow: false,
      });
      const attributed = display.find((entry) => entry.stage === 'Plan');
      expect(attributed).toMatchObject({
        harnessId: 'pi',
        modelRef: 'mistral::large',
        aliasName: 'worker',
        targetIndex: 0,
      });
      const blank = display.find((entry) => entry.stage === 'CI');
      expect(blank.harnessId).toBeUndefined();
      expect(blank.modelRef).toBeUndefined();
      expect(blank.aliasName).toBeUndefined();
      expect(blank.targetIndex).toBeUndefined();
    });

    it('the live Active row inherits the suppressed arrival row run attribution', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [
          {
            stage: 'In Progress',
            timestamp: 't1',
            status: 'Moved',
            duration: '9s',
            harnessId: 'pi',
            modelRef: 'mistral::large',
            aliasName: 'worker',
            targetIndex: 0,
          },
        ],
        currentStageName: 'In Progress',
        liveDurationLabel: '49s in stage',
        includeLiveRow: true,
      });
      expect(display).toHaveLength(1);
      expect(display[0]).toEqual({
        stage: 'In Progress',
        duration: '49s in stage',
        timestamp: 'Active',
        status: 'Active',
        harnessId: 'pi',
        modelRef: 'mistral::large',
        aliasName: 'worker',
        targetIndex: 0,
      });
    });

    it('the live Active row of an unattributed stage stays completely blank', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [
          { stage: 'Review plan', timestamp: 't1', status: 'Moved', duration: '9s' },
        ],
        currentStageName: 'Review plan',
        liveDurationLabel: '49s in stage',
        includeLiveRow: true,
      });
      expect(display).toHaveLength(1);
      expect(display[0]).toEqual({
        stage: 'Review plan',
        duration: '49s in stage',
        timestamp: 'Active',
        status: 'Active',
      });
    });
  });

  describe('buildDisplayTimeline', () => {
    const liveArgs = {
      storedTimeline: duplicateStoredTimeline,
      stages: duplicateTimelineStages,
      currentStageName: 'In Progress',
      liveDurationLabel: '49s in stage',
      includeLiveRow: true,
    };

    it('renders one row for the current stage: live Active row, stored arrival suppressed', () => {
      const display = buildDisplayTimeline(liveArgs);
      expect(display.filter((entry) => entry.stage === 'In Progress')).toHaveLength(1);
      expect(display[0]).toEqual({
        stage: 'In Progress',
        duration: '49s in stage',
        timestamp: 'Active',
        status: 'Active',
      });
    });

    it('keeps the failure reason row below the live row, one line per stage with a try count', () => {
      const display = buildDisplayTimeline(liveArgs);
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'In Progress Active',
        'Deep Review Failed',
        'Quick review Advanced',
      ]);
      expect(display[1].reason).toContain('[Agent Review Rejection]');
      // The two stored Deep Review rows (arrival + failure) collapse into one
      // row carrying the try count.
      expect(display[1].tryCount).toBe(2);
      expect(display[2].tryCount).toBeUndefined();
    });

    it('shows the full stored history without a live row (detail page variant), collapsed per stage', () => {
      const display = buildDisplayTimeline({
        storedTimeline: duplicateStoredTimeline,
        stages: duplicateTimelineStages,
        includeLiveRow: false,
      });
      // selectDisplayTimeline stays the raw exact-dedup projection (4 rows);
      // buildDisplayTimeline collapses to one row per stage (3 rows).
      expect(selectDisplayTimeline(duplicateStoredTimeline, duplicateTimelineStages)).toHaveLength(4);
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'In Progress Moved',
        'Deep Review Failed',
        'Quick review Advanced',
      ]);
      expect(display[1].tryCount).toBe(2);
    });

    it('keeps completed-task history intact, including the final Completed row', () => {
      const stored = [
        ...duplicateStoredTimeline,
        {
          stage: 'In Progress',
          status: 'Completed',
          duration: '12.5s',
          durationSeconds: 12.5,
          durationStageId: 'ip',
          timestamp: '2026-10-02T20:07:30.000Z',
        },
      ];
      const display = buildDisplayTimeline({
        storedTimeline: stored,
        stages: duplicateTimelineStages,
        currentStageName: 'In Progress',
        includeLiveRow: false,
      });
      expect(display[0]).toMatchObject({ stage: 'In Progress', status: 'Completed' });
      // The In Progress arrival + Completed rows collapse into one row.
      expect(display[0].tryCount).toBe(2);
      expect(display).toHaveLength(3);
    });

    it('suppresses Advanced arrivals as well as Moved arrivals', () => {
      const stored = [
        { stage: 'Idea', status: 'Moved', duration: '5s', timestamp: 't1' },
        { stage: 'Plan', status: 'Advanced', duration: '9s', timestamp: 't2' },
      ];
      const display = buildDisplayTimeline({
        storedTimeline: stored,
        stages: [
          { id: '1', name: 'Idea' },
          { id: '2', name: 'Plan' },
        ],
        currentStageName: 'Plan',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Plan Active',
        'Idea Moved',
      ]);
    });

    it('matches legacy numeric arrival labels against the live stage name', () => {
      const stored = [
        { stage: '1', status: 'Moved', duration: '5s', timestamp: 't1' },
        { stage: '2', status: 'Moved', duration: '9s', timestamp: 't2' },
      ];
      const display = buildDisplayTimeline({
        storedTimeline: stored,
        stages: [
          { id: '1', name: 'Idea' },
          { id: '2', name: 'Plan' },
        ],
        currentStageName: 'Plan',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Plan Active',
        'Idea Moved',
      ]);
    });

    it('never suppresses a same-stage Failed row (aborted visit keeps its reason)', () => {
      const stored = [
        { stage: 'Plan', status: 'Moved', duration: '5s', timestamp: 't1' },
        {
          stage: 'Review',
          status: 'Failed',
          duration: '9s',
          timestamp: 't2',
          reason: 'Aborted by failback policy',
        },
      ];
      const display = buildDisplayTimeline({
        storedTimeline: stored,
        stages: [
          { id: '1', name: 'Plan' },
          { id: '2', name: 'Review' },
        ],
        currentStageName: 'Review',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Review Active',
        'Review Failed',
        'Plan Moved',
      ]);
    });

    it('keeps a newest arrival for a different stage (inconsistent data stays visible)', () => {
      const stored = [
        { stage: 'Idea', status: 'Moved', duration: '5s', timestamp: 't1' },
        { stage: 'Plan', status: 'Moved', duration: '9s', timestamp: 't2' },
      ];
      const display = buildDisplayTimeline({
        storedTimeline: stored,
        stages: [
          { id: '1', name: 'Idea' },
          { id: '2', name: 'Plan' },
        ],
        currentStageName: 'Review',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Review Active',
        'Plan Moved',
        'Idea Moved',
      ]);
    });

    it('suppresses arrival-status variants, case-insensitively', () => {
      for (const status of ['Advanced (First Stage)', 'moved', 'MOVED', 'advanced', 'Failed back']) {
        const display = buildDisplayTimeline({
          storedTimeline: [
            { stage: 'Idea', status: 'Moved', duration: '5s', timestamp: 't1' },
            { stage: 'Plan', status, duration: '9s', timestamp: 't2' },
          ],
          stages: [
            { id: '1', name: 'Idea' },
            { id: '2', name: 'Plan' },
          ],
          currentStageName: 'Plan',
          liveDurationLabel: '3s in stage',
          includeLiveRow: true,
        });
        expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
          'Plan Active',
          'Idea Moved',
        ]);
      }
    });

    it('never treats a Failed outcome as an arrival, even beside "Failed back"', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [
          { stage: 'Plan', status: 'Moved', duration: '5s', timestamp: 't1' },
          {
            stage: 'Review',
            status: 'Failed',
            duration: '9s',
            timestamp: 't2',
            reason: 'needs rework',
          },
        ],
        stages: [
          { id: '1', name: 'Plan' },
          { id: '2', name: 'Review' },
        ],
        currentStageName: 'Review',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Review Active',
        'Review Failed',
        'Plan Moved',
      ]);
      expect(display[1].reason).toBe('needs rework');
    });

    it('suppresses an older same-stage arrival behind same-stage Failed rows (aborted visit)', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [
          { stage: 'Plan', status: 'Moved', duration: '5s', timestamp: 't1' },
          { stage: 'Review', status: 'Moved', duration: '9s', timestamp: 't2' },
          {
            stage: 'Review',
            status: 'Failed',
            duration: '11s',
            timestamp: 't3',
            reason: 'aborted, still parked in Review',
          },
        ],
        stages: [
          { id: '1', name: 'Plan' },
          { id: '2', name: 'Review' },
        ],
        currentStageName: 'Review',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Review Active',
        'Review Failed',
        'Plan Moved',
      ]);
    });

    it('keeps a same-stage arrival when a different-stage row is newer (past visit stays visible)', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [
          { stage: 'Plan', status: 'Moved', duration: '5s', timestamp: 't1' },
          { stage: 'Review', status: 'Moved', duration: '9s', timestamp: 't2' },
        ],
        stages: [
          { id: '1', name: 'Plan' },
          { id: '2', name: 'Review' },
        ],
        currentStageName: 'Plan',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Plan Active',
        'Review Moved',
        'Plan Moved',
      ]);
    });

    it('keeps a same-stage arrival when a Completed row is newer (fail-open), collapsed to one stored row', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [
          { stage: 'Plan', status: 'Moved', duration: '5s', timestamp: 't1' },
          { stage: 'Plan', status: 'Completed', duration: '9s', timestamp: 't2' },
        ],
        stages: [
          { id: '1', name: 'Plan' },
          { id: '2', name: 'Review' },
        ],
        currentStageName: 'Plan',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      // The Completed row is not an arrival, so the Moved arrival is not
      // suppressed by the live-row logic; both stored Plan rows then collapse
      // into the single newest (Completed) row with a try count.
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Plan Active',
        'Plan Completed',
      ]);
      expect(display[1].tryCount).toBe(2);
    });

    it('never suppresses rows with unknown statuses (fail-open)', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [{ stage: 'Plan', status: 'Success', duration: '5s', timestamp: 't1' }],
        stages: [{ id: '2', name: 'Plan' }],
        currentStageName: 'Plan',
        liveDurationLabel: '3s in stage',
        includeLiveRow: true,
      });
      expect(display.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'Plan Active',
        'Plan Success',
      ]);
    });

    it('keeps overlay and page views consistent on the screenshot fixture (parity)', () => {
      const overlay = buildDisplayTimeline({ ...liveArgs, includeLiveRow: true });
      const page = buildDisplayTimeline({ ...liveArgs, includeLiveRow: false });
      // The page has no live row, so it shows the full stored history
      // collapsed to one row per stage.
      expect(page.map((entry) => `${entry.stage} ${entry.status}`)).toEqual([
        'In Progress Moved',
        'Deep Review Failed',
        'Quick review Advanced',
      ]);
      // The overlay is the live row plus that same collapsed history minus
      // the arrival the live row supersedes.
      expect(overlay[0]).toMatchObject({ stage: 'In Progress', status: 'Active' });
      expect(overlay.slice(1)).toEqual(page.slice(1));
    });

    it('shows only the live row when an open task has no stored timeline yet', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [],
        stages: duplicateTimelineStages,
        currentStageName: 'In Progress',
        liveDurationLabel: '49s in stage',
        includeLiveRow: true,
      });
      expect(display).toEqual([
        {
          stage: 'In Progress',
          duration: '49s in stage',
          timestamp: 'Active',
          status: 'Active',
        },
      ]);
    });

    it('falls back to a synthetic current-stage row without stored rows or a live row', () => {
      expect(
        buildDisplayTimeline({
          storedTimeline: [],
          stages: duplicateTimelineStages,
          currentStageName: 'In Progress',
          includeLiveRow: false,
        }),
      ).toEqual([
        {
          stage: 'In Progress',
          duration: 'In progress',
          timestamp: 'Active',
          status: 'Active',
        },
      ]);
      expect(buildDisplayTimeline({ storedTimeline: undefined, includeLiveRow: false })[0].stage).toBe(
        'Current Stage',
      );
    });

    it('never mutates the stored timeline', () => {
      const stored = duplicateStoredTimeline.map((entry) => ({ ...entry }));
      buildDisplayTimeline({ ...liveArgs, storedTimeline: stored });
      expect(stored).toEqual(duplicateStoredTimeline);
    });

    it('renders a static PARKED row (never a live ACTIVE row) for failed tasks', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [],
        stages: duplicateTimelineStages,
        currentStageName: 'Merge and deploy',
        liveDurationLabel: '36m in stage',
        includeLiveRow: true,
        presentation: selectStagePresentation({ status: 'failed' }),
      });
      expect(display[0]).toMatchObject({ stage: 'Merge and deploy', status: 'Parked' });
      expect(display[0].duration).not.toMatch(/in stage/);
      expect(display[0].timestamp).not.toBe('Active');
    });

    it('keeps the live ACTIVE row for executing tasks', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [],
        stages: duplicateTimelineStages,
        currentStageName: 'In Progress',
        liveDurationLabel: '49s in stage',
        includeLiveRow: true,
        presentation: selectStagePresentation({ status: 'in_stage' }),
      });
      expect(display[0]).toMatchObject({ stage: 'In Progress', status: 'Active' });
    });

    it('stays backward compatible when no presentation is passed', () => {
      const display = buildDisplayTimeline({
        storedTimeline: [],
        stages: duplicateTimelineStages,
        currentStageName: 'In Progress',
        liveDurationLabel: '49s in stage',
        includeLiveRow: true,
      });
      expect(display[0]).toMatchObject({ stage: 'In Progress', status: 'Active' });
    });
  });

  describe('isAutoIterationInProgress', () => {
    it('is true for a cross-stage re-run flagged by the new backend field', () => {
      expect(
        isAutoIterationInProgress({
          autoRetrying: false,
          autoIterating: true,
          currentStageId: '1',
          lastError: { stageId: '2' },
        }),
      ).toBe(true);
    });

    it('is true for a legacy moved task (autoRetrying but current stage differs from the failed stage)', () => {
      expect(
        isAutoIterationInProgress({
          autoRetrying: true,
          currentStageId: '1',
          lastError: { stageId: '2' },
        }),
      ).toBe(true);
    });

    it('is false for a same-stage in-place retry', () => {
      expect(
        isAutoIterationInProgress({
          autoRetrying: true,
          currentStageId: '2',
          lastError: { stageId: '2' },
        }),
      ).toBe(false);
      expect(isAutoIterationInProgress({ autoRetrying: true, currentStageId: '2' })).toBe(false);
    });

    it('is false when nothing is auto-recovering', () => {
      expect(isAutoIterationInProgress({ status: 'failed', failureReason: 'x' })).toBe(false);
      expect(isAutoIterationInProgress(null)).toBe(false);
      expect(isAutoIterationInProgress(undefined)).toBe(false);
    });
  });

  describe('summarizeStageRuns', () => {
    it('collapses repeated same-stage rows into one row with a try count, keeping the latest entry', () => {
      const entries = [
        { stage: 'Design', status: 'Failed', timestamp: 't3', reason: 'latest boom' },
        { stage: 'Design', status: 'Failed back', timestamp: 't2', duration: '9s' },
        { stage: 'Implementation', status: 'Moved', timestamp: 't4', duration: '3s' },
        { stage: 'Design', status: 'Advanced', timestamp: 't1', duration: '5s' },
      ];
      const result = summarizeStageRuns(entries, []);
      expect(result.map((row) => `${row.stage} ${row.status}`)).toEqual([
        'Design Failed',
        'Implementation Moved',
      ]);
      expect(result[0].tryCount).toBe(3);
      expect(result[0].reason).toBe('latest boom');
      expect(result[1].tryCount).toBeUndefined();
    });

    it('collapses a failback spam cycle to one line per stage', () => {
      // Two failback cycles Design -> Implementation -> Design leave four
      // Design rows and two Implementation rows in storage order.
      const stored = [
        { stage: 'Design', status: 'Advanced', timestamp: 't1' },
        { stage: 'Implementation', status: 'Moved', timestamp: 't2' },
        { stage: 'Implementation', status: 'Failed', timestamp: 't3', reason: 'r1' },
        { stage: 'Design', status: 'Failed back', timestamp: 't4' },
        { stage: 'Design', status: 'Failed', timestamp: 't5', reason: 'r2' },
        { stage: 'Implementation', status: 'Failed back', timestamp: 't6' },
        { stage: 'Implementation', status: 'Failed', timestamp: 't7', reason: 'r3' },
        { stage: 'Design', status: 'Failed back', timestamp: 't8' },
      ];
      const display = buildDisplayTimeline({
        storedTimeline: stored,
        stages: [
          { id: 'd', name: 'Design' },
          { id: 'i', name: 'Implementation' },
        ],
        currentStageName: 'Design',
        includeLiveRow: false,
      });
      expect(display.map((row) => `${row.stage} ${row.status} tryCount=${row.tryCount}`)).toEqual([
        'Design Failed back tryCount=4',
        'Implementation Failed tryCount=4',
      ]);
      expect(formatTryCount(display[0])).toBe('Tried 4 times');
      // The latest reason survives on the collapsed row.
      expect(display[1].reason).toBe('r3');
    });

    it('groups legacy numeric labels onto their stage name', () => {
      const entries = [
        { stage: '1', status: 'Advanced', timestamp: '2026-01-01T00:00:00.000Z' },
        { stage: '1', status: 'Failed', timestamp: '2026-01-02T00:00:00.000Z', reason: 'boom' },
      ];
      const result = summarizeStageRuns(entries, [{ id: '1', name: 'Idea' }]);
      expect(result).toHaveLength(1);
      expect(result[0].stage).toBe('Idea');
      expect(result[0].status).toBe('Failed');
      expect(result[0].reason).toBe('boom');
      expect(result[0].tryCount).toBe(2);
    });

    it('caps the try count at STAGE_RUN_TRY_COUNT_CAP', () => {
      const entries = Array.from({ length: STAGE_RUN_TRY_COUNT_CAP + 10 }, (_, i) => ({
        stage: 'Plan',
        status: 'Failed',
        timestamp: `t${i}`,
      }));
      const result = summarizeStageRuns(entries, []);
      expect(result).toHaveLength(1);
      expect(result[0].tryCount).toBe(STAGE_RUN_TRY_COUNT_CAP);
    });

    it('never groups rows without a stage label and never mutates its input', () => {
      const entries = [
        { status: 'Failed', timestamp: 't1' },
        { status: 'Moved', timestamp: 't2' },
        { stage: 'Plan', status: 'Moved', timestamp: 't3' },
      ];
      const snapshot = entries.map((entry) => ({ ...entry }));
      const result = summarizeStageRuns(entries, []);
      expect(result).toHaveLength(3);
      expect(result.filter((row) => row.stage === undefined)).toHaveLength(2);
      expect(entries).toEqual(snapshot);
    });

    it('handles empty and non-array input safely', () => {
      expect(summarizeStageRuns([], [])).toEqual([]);
      expect(summarizeStageRuns(undefined, [])).toEqual([]);
      expect(summarizeStageRuns(null)).toEqual([]);
    });
  });

  describe('formatTryCount', () => {
    it('renders "Tried N times" only when the stage ran more than once', () => {
      expect(formatTryCount({ tryCount: 3 })).toBe('Tried 3 times');
      expect(formatTryCount({ tryCount: 2 })).toBe('Tried 2 times');
      expect(formatTryCount({ tryCount: 1 })).toBeNull();
      expect(formatTryCount({ stage: 'Plan' })).toBeNull();
      expect(formatTryCount(null)).toBeNull();
      expect(formatTryCount({ tryCount: 'x' })).toBeNull();
    });

    it('clamps oversized counts and floors fractional ones instead of rendering them raw', () => {
      expect(formatTryCount({ tryCount: 500 })).toBe('Tried 99 times');
      expect(formatTryCount({ tryCount: 99 })).toBe('Tried 99 times');
      expect(formatTryCount({ tryCount: 2.9 })).toBe('Tried 2 times');
      expect(formatTryCount({ tryCount: '4' })).toBe('Tried 4 times');
    });
  });

  describe('selectStagePresentation', () => {
    it('parks settled failures instead of reporting them active', () => {
      for (const status of ['failed', 'interrupted', 'blocked']) {
        expect(selectStagePresentation({ status })).toEqual({
          label: 'PARKED',
          tone: 'parked',
          ticking: false,
        });
      }
    });

    it('reports executing tasks active and waiting tasks waiting', () => {
      expect(selectStagePresentation({ status: 'in_stage' })).toEqual({
        label: 'ACTIVE',
        tone: 'active',
        ticking: true,
      });
      expect(selectStagePresentation({ status: 'running_merge' })).toMatchObject({
        label: 'ACTIVE',
        ticking: true,
      });
      expect(selectStagePresentation({ status: 'waiting_human' })).toEqual({
        label: 'WAITING',
        tone: 'waiting',
        ticking: false,
      });
    });

    it('fails safe on missing or unknown statuses', () => {
      expect(selectStagePresentation(null).ticking).toBe(true);
      expect(selectStagePresentation({}).ticking).toBe(true);
      expect(selectStagePresentation({ status: 'completed' }).ticking).toBe(false);
    });
  });
});

