/***
 * MARK: duplicate in-progress timeline fixture
 * @description Screenshot-faithful stored data for the duplicated
 *   "In Progress" timeline bug (task 382c0406): an open task parked in
 *   In Progress after a Deep Review failure + failback. The newest stored
 *   arrival row (In Progress / Moved / 298.631s) means "arrived in
 *   In Progress after 298.631s in Deep Review", while the inspector also
 *   renders a live In Progress / Active row on top — the visual duplicate.
 *   Imported by the timeline display tests and the duration-analytics
 *   non-regression tests so both prove the same scenario.
 * @example duplicateStoredTimeline[3] => { stage: 'In Progress', status: 'Moved', ... }
 ***/

/***
 * MARK: duplicateTimelineStages
 * @description Workflow stages for the fixture, in pipeline order.
 * @example duplicateTimelineStages[2] => { id: 'ip', name: 'In Progress', type: 'agent' }
 ***/
export const duplicateTimelineStages = [
  { id: 'qr', name: 'Quick review', type: 'agent' },
  { id: 'dr', name: 'Deep Review', type: 'agent' },
  { id: 'ip', name: 'In Progress', type: 'agent' },
];

/***
 * MARK: duplicateStoredTimeline
 * @description Stored timeline entries, oldest first (persistence order).
 *   Arrival rows carry stage = destination + duration = time in the source
 *   stage; the Failed row carries stage = source + the failure reason.
 *   Timestamps and durations mirror the screenshot millisecond-apart pair.
 * @example duplicateStoredTimeline.filter((e) => e.stage === 'In Progress') => [arrivalRow]
 ***/
export const duplicateStoredTimeline = [
  {
    stage: 'Quick review',
    status: 'Advanced',
    duration: '49.127s',
    durationSeconds: 49.127,
    durationStage: 'Idea',
    durationStageId: 'idea',
    durationStartedAt: '2026-10-02T20:01:01.854Z',
    timestamp: '2026-10-02T20:01:50.981Z',
    additions: 0,
    deletions: 0,
  },
  {
    stage: 'Deep Review',
    status: 'Advanced',
    duration: '22.641s',
    durationSeconds: 22.641,
    durationStage: 'Quick review',
    durationStageId: 'qr',
    durationStartedAt: '2026-10-02T20:01:50.981Z',
    timestamp: '2026-10-02T20:02:13.622Z',
    additions: 0,
    deletions: 0,
  },
  {
    stage: 'Deep Review',
    status: 'Failed',
    duration: '298.623s',
    durationSeconds: 298.623,
    durationStageId: 'dr',
    durationStartedAt: '2026-10-02T20:02:13.622Z',
    timestamp: '2026-10-02T20:07:12.246Z',
    reason:
      '[Agent Review Rejection] api/vitest.config.js maxWorkers:6 + 10-line comment bundled into the diff (commit 6c2ac22) — update the worker count separately.',
    stageId: 'dr',
    stageName: 'Deep Review',
    additions: 0,
    deletions: 0,
  },
  {
    stage: 'In Progress',
    status: 'Moved',
    duration: '298.631s',
    durationSeconds: 298.631,
    durationStage: 'Deep Review',
    durationStageId: 'dr',
    durationStartedAt: '2026-10-02T20:02:13.622Z',
    timestamp: '2026-10-02T20:07:12.253Z',
    additions: 0,
    deletions: 0,
  },
];

/***
 * MARK: duplicateHistory
 * @description Audit history entries the backend writes alongside the stored
 *   timeline above (arrival verbs + the failure line).
 * @example duplicateHistory.at(-1) => { action: "Failed back to stage 'In Progress'", ... }
 ***/
export const duplicateHistory = [
  { timestamp: '2026-10-02T20:01:50.981Z', action: "Moved to stage 'Quick review'" },
  { timestamp: '2026-10-02T20:02:13.622Z', action: "Advanced to stage 'Deep Review'" },
  {
    timestamp: '2026-10-02T20:07:12.246Z',
    action: "Stage failed in 'Deep Review': [Agent Review Rejection] api/vitest.config.js",
  },
  { timestamp: '2026-10-02T20:07:12.253Z', action: "Failed back to stage 'In Progress'" },
];

/***
 * MARK: duplicateInProgressTask
 * @description Open task parked in In Progress carrying the fixture timeline
 *   and history, shaped like the API task payload the inspector renders.
 * @example duplicateInProgressTask.currentStageId => 'ip'
 ***/
export const duplicateInProgressTask = {
  id: 'task-duplicate-in-progress',
  goal: 'Duplicate In Progress timeline repro',
  title: 'Duplicate In Progress timeline repro',
  status: 'in_stage',
  currentStageId: 'ip',
  enteredStageAt: '2026-10-02T20:07:12.253Z',
  updatedAt: '2026-10-02T20:07:12.253Z',
  createdAt: '2026-10-02T20:01:01.854Z',
  workflowId: 'wf-default',
  timeline: duplicateStoredTimeline,
  history: duplicateHistory,
};
