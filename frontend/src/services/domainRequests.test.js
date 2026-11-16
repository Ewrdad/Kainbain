// node env pin: this suite is pure logic with no DOM needs
// (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
// Domains: existing callers keep the same request contracts after the split.
import { describe, it, expect, vi } from 'vitest';
import { workRequests } from './work/index.js';
import { flowRequests } from './flow/index.js';
import { crewRequests } from './crew/index.js';
import { watchRequests } from './watch/index.js';
import { houseRequests } from './house/index.js';
import { accessibilityRequests } from './accessibility/index.js';
import { domainRegistry, collectDomainOperationNames, buildDomainClients } from './domainRegistry.js';
import { api } from './api.js';

describe('Business-owned request lists', () => {
  it('exposes exactly the registry operations with no duplicates', () => {
    const request = vi.fn();
    // Derived from domainRegistry.js: adding an endpoint updates the
    // registry (same diff as the request list), never this file.
    const deps = { request, isValidProjectId: () => true };
    // Per-domain key-set equality: a request-list key missing from the
    // registry (unregistered add) or a registry entry missing from the
    // request list (dropped op) fails here naming the domain.
    for (const entry of domainRegistry) {
      expect(Object.keys(entry.build(deps)).sort(), `${entry.domain} client keys`).toEqual(
        [...entry.operations].sort(),
      );
    }
    const clients = buildDomainClients(deps);
    const names = clients.flatMap(Object.keys);
    // Cross-domain no-duplicates: the same op name from two request lists
    // fails here naming the duplicated operation.
    const seenNames = new Set();
    const duplicatedNames = new Set();
    for (const name of names) {
      if (seenNames.has(name)) duplicatedNames.add(name);
      else seenNames.add(name);
    }
    expect([...duplicatedNames], 'duplicate domain operations').toEqual([]);
    expect([...names].sort()).toEqual([...collectDomainOperationNames()].sort());
    // Client exposure: every registered op must be callable on `api`.
    for (const name of collectDomainOperationNames()) expect(typeof api[name], name).toBe('function');
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
    [houseRequests, 'getOnboarding', [], '/onboarding', undefined],
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
    [houseRequests, 'getImageGenProviders', [], '/settings/image-gen/providers', undefined],
    [houseRequests, 'saveImageGenKey', ['muse', 'sk-x'], '/settings/image-gen/providers/muse/key', { method: 'PUT', body: '{"key":"sk-x"}' }],
    [houseRequests, 'clearImageGenKey', ['muse'], '/settings/image-gen/providers/muse/key', { method: 'DELETE' }],
    [houseRequests, 'testImageGenProvider', ['mock'], '/settings/image-gen/providers/mock/test', { method: 'POST', body: '{}' }],
    [houseRequests, 'testImageGenProvider', ['muse', 'hi'], '/settings/image-gen/providers/muse/test', { method: 'POST', body: '{"prompt":"hi"}' }],
    [accessibilityRequests, 'accessibilityResults', [], '/accessibility/results', undefined],
    [accessibilityRequests, 'submitAccessibilityFeedback', [{ message: 'Focus is lost', needGroup: 'seeing', contact: null, pageUrl: null }], '/accessibility/feedback', { method: 'POST', body: '{"message":"Focus is lost","needGroup":"seeing","contact":null,"pageUrl":null}' }],
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
