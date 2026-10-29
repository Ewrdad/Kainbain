// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
// Domains: existing callers keep the same request contracts after the split.
import { describe, it, expect, vi } from 'vitest';
import { workRequests } from './work/index.js';
import { flowRequests } from './flow/index.js';
import { crewRequests } from './crew/index.js';
import { watchRequests } from './watch/index.js';
import { houseRequests } from './house/index.js';
import { runnerRequests } from './runners/index.js';
import { api } from './api.js';

describe('Business-owned request lists', () => {
  it('has no duplicate operations and exposes every domain operation through the old client', () => {
    const request = vi.fn();
    const clients = [workRequests(request, () => true), flowRequests(request), crewRequests(request), watchRequests(request), houseRequests(request), runnerRequests(request)];
    const names = clients.flatMap(Object.keys);
    expect(new Set(names).size).toBe(names.length);
    // 60 legacy operations + the 3 task-image operations (uploadTaskImage,
    // listTaskImages, deleteTaskImage) added with task image support + the
    // explorer image-preview URL builder (getFileRawUrl) + the per-harness
    // availability probe (getHarnessModels) for System Settings › Harness +
    // the 2 skill-import operations (importSkill, deleteSkill) for the
    // Settings › Skills tab + the baked-changelog reader (deployChangelog)
    // for the header build badge dialog + the per-harness reliability reader
    // (getHarnessReliability) for System Settings › Harness + the per-alias
    // reliability reader (getAliasReliability) for Settings › Model Aliases +
    // the 2 "Go to App" operations (updateAppStatus, checkAppHealth).
    // the 3 Tier-5 engine-containment operations (engineState, engineTrip,
    // engineReset) added with the global circuit breaker +
    // the 4 prompt layout operations (getPromptLayout, updatePromptLayout,
    // resetPromptLayout, dryRunPromptLayout) for System Settings › Prompt Layout +
    // the adopt-existing-project operation (registerProject) for the project
    // switcher's "+ Add Existing Project…" dialog +
    // the 2 survey operations (getSurvey, submitSurvey) for the question-me
    // survey page.
    // the 8 Runner operations (getRunners, getRunnerMonitor, approveRunner,
    // denyRunner, revokeRunner, pauseRunner, resumeRunner, skipRunner) for
    // Settings › Harness › Runners and the per-runner Now Playing controls.
    expect(names).toHaveLength(90);
    for (const name of names) expect(typeof api[name]).toBe('function');
  });

  it.each([
    [workRequests, 'getTask', ['project', 'task'], '/tasks/task?projectId=project', undefined],
    [workRequests, 'getSurvey', ['project', 'task'], '/tasks/task/survey?projectId=project', undefined],
    [workRequests, 'submitSurvey', ['project', 'task', { answers: { q1: { selected: ['a'], notes: '' } } }], '/tasks/task/survey', { method: 'POST', body: '{"projectId":"project","answers":{"q1":{"selected":["a"],"notes":""}}}' }],
    [workRequests, 'submitSurvey', ['project', 'task', { action: 'skip' }], '/tasks/task/survey', { method: 'POST', body: '{"projectId":"project","action":"skip"}' }],
    [workRequests, 'updateTask', ['project', 'task', { title: 'Changed' }], '/tasks/task', { method: 'PATCH', body: '{"projectId":"project","title":"Changed"}' }],
    [flowRequests, 'advanceTask', ['project', 'task', 'next'], '/tasks/task/advance', { method: 'POST', body: '{"projectId":"project","guidance":"next"}' }],
    [flowRequests, 'updateWorkflow', [undefined, []], '/projects/workflow', { method: 'PUT', body: '{"stages":[]}' }],
    [crewRequests, 'restoreSession', ['project'], '/session/restore', { method: 'POST', body: '{"projectId":"project"}' }],
    [crewRequests, 'getHarnessReliability', [], '/harnesses/reliability', undefined],
    [houseRequests, 'getAliasReliability', ['p1'], '/projects/p1/aliases/reliability', undefined],
    [watchRequests, 'checkTaskStuck', ['project', 'task'], '/tasks/task/stuck-check', { method: 'POST', body: '{"projectId":"project"}' }],
    [houseRequests, 'getSkill', ['a/b', 'a b'], '/skills/a%2Fb?projectId=a%20b', undefined],
    [houseRequests, 'triggerDeploy', [], '/deploy', { method: 'POST', body: '{"fast":false}' }],
    [houseRequests, 'deployChangelog', [50], '/deploy/changelog?limit=50', undefined],
    [houseRequests, 'deployChangelog', [], '/deploy/changelog', undefined],
    [houseRequests, 'updateProject', ['p1', { name: 'A' }], '/projects/p1', { method: 'PATCH', body: '{"name":"A"}' }],
    [houseRequests, 'updateProject', ['p1', { name: 'A' }, { expectedUpdatedAt: 't' }], '/projects/p1', { method: 'PATCH', body: '{"name":"A","expectedUpdatedAt":"t"}' }],
    [houseRequests, 'updateProject', ['p1', { name: 'A' }, { ifMatch: 't' }], '/projects/p1', { method: 'PATCH', body: '{"name":"A"}', headers: { 'If-Match': 't' } }],
    [houseRequests, 'updateAppStatus', ['p1', { url: 'http://localhost:3000' }], '/projects/p1/app-status', { method: 'PATCH', body: '{"url":"http://localhost:3000"}' }],
    [houseRequests, 'checkAppHealth', ['p1'], '/projects/p1/app-status/health', undefined],
  ])('preserves %s / %s arguments and request result', (requests, name, args, url, options) => {
    const response = Promise.resolve({ ok: true });
    const request = vi.fn(() => response);
    const client = requests(request, () => true);
    expect(client[name](...args)).toBe(response);
    expect(request.mock.calls).toEqual([options ? [url, options] : [url]]);
  });

  it('keeps invalid project task lists network-free', async () => {
    const request = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await workRequests(request, () => false).listTasks('stage-1')).toEqual([]);
      expect(request).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
