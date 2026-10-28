/***
 * MARK: retrospective fixtures
 * @description Shared mock fixtures for the retrospective review page:
 *   duration-enriched task summaries (the `GET /tasks` shape via
 *   `toTaskDurationSummary`), chat turns, and the harness-degraded (501)
 *   payload. Imported by every retrospective test — no copy-pasted payloads.
 ***/

/***
 * MARK: retrospectiveTaskFixtures
 * @description Duration-enriched summaries covering the panel states:
 *   completed, failed (with failure evidence), in-progress, and a task with
 *   no duration samples yet. Samples carry `stageType` across agent, human,
 *   and ci so the stage-type visibility filter has something to toggle.
 ***/
export const retrospectiveTaskFixtures = [
  {
    id: 'task-done-1',
    title: 'Add pagination to the task list',
    goal: 'Add pagination to the task list so large boards stay fast.',
    status: 'completed',
    stage: 'Done',
    stageId: 'done',
    workflowId: 'wf-default',
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T18:00:00.000Z',
    stageDurationSamples: [
      { stageId: 'idea', stageName: 'Idea', stageType: 'agent', seconds: [120] },
      { stageId: 'plan', stageName: 'Plan', stageType: 'human', seconds: [600, 300] },
      { stageId: 'implement', stageName: 'Implement', stageType: 'ci', seconds: [3600] },
    ],
    reports: [
      { path: 'idea.md', stageId: 'idea', stageName: 'Idea', status: 'PASSED' },
      { path: 'plan.md', stageId: 'plan', stageName: 'Plan', status: 'PASSED' },
      { path: 'implement.md', stageId: 'implement', stageName: 'Implement', status: 'PASSED' },
    ],
  },
  {
    id: 'task-failed-2',
    title: 'Migrate the session store',
    goal: 'Migrate the session store to the new harness contract.',
    status: 'failed',
    stage: 'Implement',
    stageId: 'implement',
    workflowId: 'wf-default',
    failureReason: 'Tests failed on the migration branch',
    lastError: { message: 'vitest exited with code 1' },
    createdAt: '2026-09-22T09:00:00.000Z',
    updatedAt: '2026-09-22T11:30:00.000Z',
    stageDurationSamples: [
      { stageId: 'idea', stageName: 'Idea', stageType: 'agent', seconds: [90] },
      { stageId: 'implement', stageName: 'Implement', stageType: 'ci', seconds: [5400] },
    ],
    reports: [
      { path: 'idea.md', stageId: 'idea', stageName: 'Idea', status: 'PASSED' },
      { path: 'implement.md', stageId: 'implement', stageName: 'Implement', status: 'FAILED' },
    ],
  },
  {
    id: 'task-active-3',
    title: 'Draft the retrospective review page',
    goal: 'Draft the retrospective review page design.',
    status: 'in_stage',
    stage: 'Plan',
    stageId: 'plan',
    workflowId: 'wf-experiment',
    createdAt: '2026-09-28T08:00:00.000Z',
    updatedAt: '2026-09-28T09:15:00.000Z',
    stageDurationSamples: [
      { stageId: 'idea', stageName: 'Idea', stageType: 'agent', seconds: [240] },
    ],
    reports: [{ path: 'idea.md', stageId: 'idea', stageName: 'Idea', status: 'PASSED' }],
  },
  {
    id: 'task-fresh-4',
    title: 'Untouched backlog item',
    goal: 'A task with no stage visits yet.',
    status: 'queued',
    stage: 'Idea',
    stageId: 'idea',
    workflowId: 'wf-default',
    createdAt: '2026-09-29T07:00:00.000Z',
    updatedAt: '2026-09-29T07:00:00.000Z',
    stageDurationSamples: [],
    reports: [],
  },
];

/***
 * MARK: retrospectiveHydratedTaskFixture
 * @description Full-task payload (`GET /tasks/:id` shape) for row expansion:
 *   the failed fixture plus history and timeline detail.
 ***/
export const retrospectiveHydratedTaskFixture = {
  ...retrospectiveTaskFixtures[1],
  history: [
    { stage: 'Idea', status: 'PASSED', timestamp: '2026-09-22T09:10:00.000Z' },
    { stage: 'Implement', status: 'FAILED', timestamp: '2026-09-22T11:30:00.000Z' },
  ],
  timeline: [
    { stage: 'Idea', status: 'PASSED', timestamp: '2026-09-22T09:10:00.000Z', duration: '1m' },
    {
      stage: 'Implement',
      status: 'FAILED',
      timestamp: '2026-09-22T11:30:00.000Z',
      duration: '1h 30m',
    },
  ],
};

/***
 * MARK: retrospectiveChatTurnFixture
 * @description A chat turn request/response pair: user message plus the
 *   assistant reply with structured ticket drafts.
 ***/
export const retrospectiveChatTurnFixture = {
  request: {
    messages: [{ role: 'user', content: 'What failed recently?' }],
    taskIds: ['task-failed-2'],
    harness: 'pi',
    model: 'm1',
  },
  response: {
    reply: 'The migration task failed its tests. I suggest a follow-up ticket.',
    suggestions: [{ title: 'Stabilize migration tests', goal: 'Fix the failing migration tests.' }],
    harness: 'pi',
    model: 'm1',
  },
};

/***
 * MARK: retrospectiveDegradedResponseFixture
 * @description The 501 `unsupported_by_harness` payload a non-chat harness
 *   produces; the chat pane renders the designed degraded notice for it.
 ***/
export const retrospectiveDegradedResponseFixture = {
  status: 501,
  body: {
    error: 'Retrospective chat is not supported by the active harness',
    code: 'unsupported_by_harness',
    capability: 'prompt',
  },
};

/***
 * MARK: retrospectiveTimeoutErrorFixture
 * @description The AbortError from client or 504 from server timeout.
 ***/
export const retrospectiveTimeoutErrorFixture = {
  status: 504,
  body: JSON.stringify({
    error: 'Chat prompt timed out after 300000ms',
    code: 'chat_prompt_timeout',
  }),
};

/***
 * MARK: retrospectiveModelFailedFixture
 * @description The 502 chat_prompt_failed payload when the model call throws.
 ***/
export const retrospectiveModelFailedFixture = {
  status: 502,
  body: JSON.stringify({
    error: 'Chat prompt failed: model exploded',
    code: 'chat_prompt_failed',
  }),
};

/***
 * MARK: retrospectiveTimeoutWithOutputFixture
 * @description The 504 chat_prompt_timeout payload when the model streamed
 *   partial output before the server gave up (bounded `output` tail).
 ***/
export const retrospectiveTimeoutWithOutputFixture = {
  status: 504,
  body: JSON.stringify({
    error: 'Chat prompt timed out after 300000ms',
    code: 'chat_prompt_timeout',
    output: 'warming up…',
  }),
};

/***
 * MARK: retrospectiveModelFailedWithOutputFixture
 * @description The 502 chat_prompt_failed payload when the model streamed
 *   partial output before throwing (bounded `output` tail).
 ***/
export const retrospectiveModelFailedWithOutputFixture = {
  status: 502,
  body: JSON.stringify({
    error: 'Chat prompt failed: model exploded',
    code: 'chat_prompt_failed',
    output: 'before the boom',
  }),
};

/***
 * MARK: retrospectiveTaskNotFoundFixture
 * @description Full-bogus 404 task_not_found payload.
 ***/
export const retrospectiveTaskNotFoundFixture = {
  status: 404,
  body: JSON.stringify({
    error: 'Task bogus-id not found',
    code: 'task_not_found',
    taskId: 'bogus-id',
  }),
};

/***
 * MARK: retrospectiveLenientUnknownFixture
 * @description Lenient 200 payload reporting unknownTaskIds.
 ***/
export const retrospectiveLenientUnknownFixture = {
  reply: 'I noticed some tasks were missing but here is your answer.',
  suggestions: [],
  harness: 'pi',
  model: 'm1',
  modelRequested: true,
  unknownTaskIds: ['stale-task-id'],
  contextTaskIds: ['task-failed-2'],
  contextTruncated: false,
  contextChars: 500,
};

/***
 * MARK: retrospectiveTruncatedContextFixture
 * @description 200 response when task context was truncated to fit the character budget.
 ***/
export const retrospectiveTruncatedContextFixture = {
  reply: 'Reviewed recent tasks (older ones omitted).',
  suggestions: [],
  harness: 'pi',
  model: 'm1',
  modelRequested: true,
  unknownTaskIds: [],
  contextTaskIds: ['task-failed-2'],
  contextTruncated: true,
  contextChars: 12000,
};

/***
 * MARK: retrospectiveEmptyReplyFixture
 * @description 200 response where model returned empty content or whitespace.
 ***/
export const retrospectiveEmptyReplyFixture = {
  reply: '',
  suggestions: [],
  harness: 'pi',
  model: 'm1',
  modelRequested: true,
  unknownTaskIds: [],
  contextTaskIds: ['task-failed-2'],
  contextTruncated: false,
  contextChars: 300,
};

/***
 * MARK: retrospectiveOversizedInputFixture
 * @description 400 error payload when input exceeds caps.
 ***/
export const retrospectiveOversizedInputFixture = {
  status: 400,
  body: JSON.stringify({
    error: 'Chat input exceeds limits',
    code: 'chat_input_too_large',
    detail: 'message exceeds 8000 characters',
  }),
};
