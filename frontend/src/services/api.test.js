// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/***
 * MARK: api client contract tests
 * @description Regression traps for client↔server endpoint contract bugs that
 *   a green UI suite can otherwise mask:
 *   - C1: the follow-up client path must match the server route exactly.
 *   - C2: submitTask must thread workflowId through to the POST body (no dropped arg).
 *   - D1: an engineStatus() client exists so reconnect can reconcile engine state.
 ***/
describe('api client endpoints', () => {
  const requests = [];
  beforeEach(() => {
    requests.length = 0;
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (url, opts = {}) => {
      requests.push({ url, opts });
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    });
  });

  it('followUp posts to the exact /compute/follow-up route the server registers (C1)', async () => {
    const { api } = await import('./api');
    await api.followUp('proj-1', 'Continue');
    expect(requests.length).toBe(1);
    expect(requests[0].url.endsWith('/compute/follow-up')).toBe(true);
    expect(requests[0].url.endsWith('/compute/followup')).toBe(false);
  });

  it('submitTask sends workflowId in the POST body (C2 - no dropped arg)', async () => {
    const { api } = await import('./api');
    await api.submitTask('proj-1', 'goal', false, 'stage-1', 'wf-hotfix');
    expect(requests.length).toBe(1);
    const body = JSON.parse(requests[0].opts.body);
    expect(body.workflowId).toBe('wf-hotfix');
    expect(body.projectId).toBe('proj-1');
    // The per-task prompt override feature was removed: no prompt is sent.
    expect(body.prompt).toBeUndefined();
  });

  it('exposes engineStatus() hitting GET /status for engine-state reconciliation (D1)', async () => {
    const { api } = await import('./api');
    await api.engineStatus();
    expect(requests.length).toBe(1);
    expect(requests[0].url.endsWith('/status')).toBe(true);
  });

  it('shares in-flight promises and caches getModels responses (#5)', async () => {
    const { api, clearModelsCache } = await import('./api');
    clearModelsCache();

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ models: [{ id: 'model-a', name: 'Model A' }] }),
    }));

    // Call simultaneously from 3 components
    const [res1, res2, res3] = await Promise.all([
      api.getModels(),
      api.getModels(),
      api.getModels(),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res1.models[0].id).toBe('model-a');
    expect(res2.models[0].id).toBe('model-a');
    expect(res3.models[0].id).toBe('model-a');

    // Subsequent call uses cache without refetching
    const res4 = await api.getModels();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res4.models[0].id).toBe('model-a');

    // Calling with refresh=true forces refetch
    await api.getModels(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('shares in-flight promises and caches computeStatus responses', async () => {
    const { api, clearStatusCache } = await import('./api');
    clearStatusCache();

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ running: true }),
    }));

    const [res1, res2, res3] = await Promise.all([
      api.computeStatus(),
      api.computeStatus(),
      api.computeStatus(),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res1.running).toBe(true);
    expect(res2.running).toBe(true);
    expect(res3.running).toBe(true);

    const res4 = await api.computeStatus();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res4.running).toBe(true);

    await api.computeStatus(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('shares in-flight promises and caches healthStatus responses', async () => {
    const { api, clearStatusCache } = await import('./api');
    clearStatusCache();

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', checks: { litellm: { status: 'ok' } } }),
    }));

    const [res1, res2, res3] = await Promise.all([
      api.healthStatus(),
      api.healthStatus(),
      api.healthStatus(),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res1.status).toBe('ok');
    expect(res2.status).toBe('ok');
    expect(res3.status).toBe('ok');

    const res4 = await api.healthStatus();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res4.status).toBe('ok');

    await api.healthStatus(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('shares in-flight promises and caches systemStatus / engineStatus responses', async () => {
    const { api, clearStatusCache } = await import('./api');
    clearStatusCache();

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', build: { buildNumber: 42 } }),
    }));

    const [res1, res2, res3] = await Promise.all([
      api.systemStatus(),
      api.engineStatus(),
      api.systemStatus(),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res1.build.buildNumber).toBe(42);
    expect(res2.build.buildNumber).toBe(42);
    expect(res3.build.buildNumber).toBe(42);

    const res4 = await api.systemStatus();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res4.build.buildNumber).toBe(42);

    await api.systemStatus(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('shares in-flight promises and caches observabilityStatus responses per scope', async () => {
    const { api, clearStatusCache } = await import('./api');
    clearStatusCache();

    global.fetch = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        observability: { scope: url.includes('proj-1') ? 'proj-1' : 'all' },
      }),
    }));

    const [res1, res2] = await Promise.all([
      api.observabilityStatus('proj-1'),
      api.observabilityStatus('proj-1'),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(res1.observability.scope).toBe('proj-1');
    expect(res2.observability.scope).toBe('proj-1');

    // Calling for a different project makes its own request
    const resGlobal = await api.observabilityStatus();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(resGlobal.observability.scope).toBe('all');

    // Subsequent calls use cache
    await api.observabilityStatus('proj-1');
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Force refresh triggers refetch
    await api.observabilityStatus('proj-1', true);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('coalesces forced reads and queues one refresh after an older in-flight poll', async () => {
    const { api, clearStatusCache } = await import('./api');
    clearStatusCache();
    let finishPoll;
    global.fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPoll = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, json: async () => ({ observability: { prompt: 'new' } }) });
    const poll = api.observabilityStatus('project');
    const refresh1 = api.observabilityStatus('project', true);
    const refresh2 = api.observabilityStatus('project', true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    finishPoll({ ok: true, json: async () => ({ observability: { prompt: 'old' } }) });
    const [, first, second] = await Promise.all([poll, refresh1, refresh2]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(first).toEqual(second);
    expect(first.observability.prompt).toBe('new');
    expect(global.fetch.mock.calls[1][0]).toContain('projectId=project');
    expect(global.fetch.mock.calls[1][0]).not.toContain('refresh=true');
    await Promise.all([
      api.observabilityStatus('project', true),
      api.observabilityStatus('project', true),
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('getHarnesses fetches the harness discovery endpoint the settings dropdown consumes', async () => {
    const { api } = await import('./api');
    await api.getHarnesses();
    expect(requests.length).toBe(1);
    expect(requests[0].url.endsWith('/harnesses')).toBe(true);
    expect(requests[0].opts.method).toBeUndefined(); // plain GET
  });

  it('getConfigSpec fetches the live config-spec the Storage settings tab renders', async () => {
    const { api } = await import('./api');
    await api.getConfigSpec();
    expect(requests.length).toBe(1);
    expect(requests[0].url.endsWith('/status/config')).toBe(true);
    expect(requests[0].opts.method).toBeUndefined(); // plain GET
  });

  it('getHarnessModels probes one harness, with refresh opting past the caches', async () => {
    const { api } = await import('./api');
    await api.getHarnessModels('pi');
    expect(requests.length).toBe(1);
    expect(requests[0].url.endsWith('/harnesses/pi/models')).toBe(true);
    await api.getHarnessModels('custom', true);
    expect(requests[1].url.endsWith('/harnesses/custom/models?refresh=true')).toBe(true);
    expect(requests[1].opts.method).toBeUndefined(); // plain GET
  });
});

describe('remote-link resilience', () => {
  it('resolveApiBase rewrites a baked-in loopback base to the serving host', async () => {
    const { resolveApiBase } = await import('./api');
    expect(resolveApiBase('http://localhost:3100', '100.104.3.73')).toBe(
      'http://100.104.3.73:3100',
    );
    expect(resolveApiBase('http://127.0.0.1:3100', '100.104.3.73')).toBe(
      'http://100.104.3.73:3100',
    );
    // Same-origin builds and loopback-served pages are untouched.
    expect(resolveApiBase('', '100.104.3.73')).toBe('');
    expect(resolveApiBase('http://localhost:3100', 'localhost')).toBe('http://localhost:3100');
    expect(resolveApiBase('http://localhost:3100', '')).toBe('http://localhost:3100');
    // A non-loopback base is never rewritten.
    expect(resolveApiBase('https://api.example.com', '100.104.3.73')).toBe(
      'https://api.example.com',
    );
  });

  it('resolveWsBase heals loopback and upgrades to wss on https pages', async () => {
    const { resolveWsBase } = await import('./api');
    expect(resolveWsBase('ws://localhost:3100', '100.104.3.73', 'http:')).toBe(
      'ws://100.104.3.73:3100',
    );
    expect(resolveWsBase('ws://localhost:3100', 'example.ts.net', 'https:')).toBe(
      'wss://example.ts.net:3100',
    );
    expect(resolveWsBase('', '100.104.3.73', 'http:')).toBe('');
  });

  it('request aborts a hung fetch instead of hanging boot forever', async () => {
    const { request } = await import('./api');
    global.fetch = vi.fn(() => new Promise(() => {})); // never settles
    await expect(request('/projects', {}, { timeoutMs: 20, retries: 0 })).rejects.toThrow(
      'timed out after 20ms on /projects',
    );
  });

  it('request retries an idempotent GET once on network failure', async () => {
    const { request } = await import('./api');
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const res = await request('/projects', {}, { timeoutMs: 1000 });
    expect(res).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('request never retries a POST on network failure', async () => {
    const { request } = await import('./api');
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      request('/tasks/x/retry', { method: 'POST' }, { timeoutMs: 1000 }),
    ).rejects.toThrow('fetch failed');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('getTask fetches one full task for detail hydration', async () => {
    const { api } = await import('./api');
    const seen = [];
    global.fetch = vi.fn(async (url, opts = {}) => {
      seen.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({}) };
    });
    await api.getTask('proj-1', 'task-9');
    expect(seen.length).toBe(1);
    expect(seen[0].url.endsWith('/tasks/task-9?projectId=proj-1')).toBe(true);
    expect(seen[0].opts.method).toBeUndefined(); // plain GET
  });

  it('request does not retry HTTP error statuses', async () => {
    const { request } = await import('./api');
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
    await expect(request('/projects', {}, { timeoutMs: 1000 })).rejects.toThrow('API 500');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('request exposes the HTTP status and body for kind dispatch', async () => {
    const { request } = await import('./api');
    const body = '{"error":"Binary file content cannot be shown as text","kind":"binary"}';
    global.fetch = vi.fn(async () => ({ ok: false, status: 415, text: async () => body }));
    const err = await request('/projects/p/files/content', {}, { timeoutMs: 1000 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(415);
    expect(err.body).toBe(body);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('model key helpers', () => {
  it('builds a provider-scoped composite key', async () => {
    const { modelKey } = await import('./api');
    expect(modelKey('ollama-cloud', 'deepseek-v4-flash:0731-cloud')).toBe(
      'ollama-cloud::deepseek-v4-flash:0731-cloud',
    );
    expect(modelKey('ollama-cloud-direct', 'deepseek-v4-flash:0731-cloud')).not.toBe(
      modelKey('ollama-cloud', 'deepseek-v4-flash:0731-cloud'),
    );
  });

  it('modelOptionValue prefers backend key, else composites from provider', async () => {
    const { modelOptionValue } = await import('./api');
    expect(modelOptionValue({ id: 'x', provider: 'google', key: 'google::x' })).toBe('google::x');
    expect(modelOptionValue({ id: 'x', provider: 'google' })).toBe('google::x');
    expect(modelOptionValue({ id: 'x' })).toBe('x');
  });

  it('modelKeyForValue maps stored bare ids onto a valid composite option key', async () => {
    const { modelKeyForValue } = await import('./api');
    const models = [
      { id: 'deepseek-v4-flash:0731-cloud', provider: 'ollama-cloud' },
      { id: 'deepseek-v4-flash:0731-cloud', provider: 'ollama-cloud-direct' },
    ];
    // Backward-compat: bare id resolves to the first provider's composite key.
    expect(modelKeyForValue(models, 'deepseek-v4-flash:0731-cloud')).toBe(
      'ollama-cloud::deepseek-v4-flash:0731-cloud',
    );
    // Existing composite keys pass through unchanged.
    expect(modelKeyForValue(models, 'ollama-cloud-direct::deepseek-v4-flash:0731-cloud')).toBe(
      'ollama-cloud-direct::deepseek-v4-flash:0731-cloud',
    );
    // Unresolvable values are preserved as-is.
    expect(modelKeyForValue(models, 'does-not-exist')).toBe('does-not-exist');
    expect(modelKeyForValue(models, '')).toBe('');
  });
});

describe('groupModelsByProvider', () => {
  it('groups options by provider with providers ordered by first appearance', async () => {
    const { groupModelsByProvider } = await import('./api');
    const models = [
      { id: 'deepseek-v4-flash', name: 'DeepSeek Flash', provider: 'ollama-cloud' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek Pro', provider: 'ollama-cloud' },
      { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
    ];
    const options = groupModelsByProvider(models);
    // Provider blocks keep first-appearance order; models keep API order
    // inside a group.
    expect(options.map((o) => o.group)).toEqual([
      'ollama-cloud',
      'ollama-cloud',
      'google',
      'anthropic',
    ]);
    expect(options.map((o) => o.label)).toEqual([
      'DeepSeek Flash',
      'DeepSeek Pro',
      'Gemini 2.5 Pro',
      'Claude 3.7 Sonnet',
    ]);
  });

  it('emits composite option values so selection keys stay provider-scoped', async () => {
    const { groupModelsByProvider, modelOptionValue } = await import('./api');
    const models = [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'google',
        key: 'google::gemini-2.5-pro',
      },
      { id: 'x-model', provider: 'ollama-cloud' },
    ];
    const options = groupModelsByProvider(models);
    expect(options.map((o) => o.value)).toEqual(models.map((m) => modelOptionValue(m)));
    expect(options[0].value).toBe('google::gemini-2.5-pro');
    expect(options[1].value).toBe('ollama-cloud::x-model');
  });

  it('falls provider-less models into an Ungrouped bucket after grouped ones', async () => {
    const { groupModelsByProvider } = await import('./api');
    const models = [
      { id: 'grouped-a', name: 'Grouped A', provider: 'google' },
      { id: 'loose-b', name: 'Loose B' },
      { id: 'grouped-c', name: 'Grouped C', provider: 'google' },
      { id: 'loose-d', name: 'Loose D' },
    ];
    const options = groupModelsByProvider(models);
    expect(options.map((o) => [o.group, o.label])).toEqual([
      ['google', 'Grouped A'],
      ['google', 'Grouped C'],
      ['Ungrouped', 'Loose B'],
      ['Ungrouped', 'Loose D'],
    ]);
  });

  it('tolerates empty, null and malformed inputs', async () => {
    const { groupModelsByProvider } = await import('./api');
    expect(groupModelsByProvider([])).toEqual([]);
    expect(groupModelsByProvider(null)).toEqual([]);
    expect(groupModelsByProvider(undefined)).toEqual([]);
    expect(groupModelsByProvider('not-a-list')).toEqual([]);
  });
});

describe('isValidProjectId & api.listTasks parameter validation', () => {
  it('isValidProjectId correctly validates valid and invalid project IDs', async () => {
    const { isValidProjectId } = await import('./api');
    expect(isValidProjectId('proj-1')).toBe(true);
    expect(isValidProjectId('fac9b82c-7e4e-4c1c-86f0-ad3fd6462112')).toBe(true);
    expect(isValidProjectId('my-custom-project')).toBe(true);

    // Invalid IDs
    expect(isValidProjectId('')).toBe(false);
    expect(isValidProjectId(null)).toBe(false);
    expect(isValidProjectId(undefined)).toBe(false);
    expect(isValidProjectId('1')).toBe(false);
    expect(isValidProjectId('2')).toBe(false);
    expect(isValidProjectId('123')).toBe(false);
    expect(isValidProjectId('stage-1')).toBe(false);
    expect(isValidProjectId('stage-idea')).toBe(false);
    expect(isValidProjectId('wf-default')).toBe(false);
    expect(isValidProjectId('wf-custom')).toBe(false);
  });

  it('api.listTasks does not dispatch fetch for invalid project IDs and returns empty array', async () => {
    const { api } = await import('./api');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res1 = await api.listTasks('1');
    const res2 = await api.listTasks('stage-1');
    const res3 = await api.listTasks('wf-default');

    expect(res1).toEqual([]);
    expect(res2).toEqual([]);
    expect(res3).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('PR review endpoints', () => {
  const requests = [];
  beforeEach(() => {
    requests.length = 0;
    vi.restoreAllMocks();
    global.fetch = vi.fn(async (url, opts = {}) => {
      requests.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({}) };
    });
  });

  // Server contract (api/routes/review.js):
  //   GET    /projects/:p/tasks/:t/review
  //   POST   /projects/:p/tasks/:t/review/comments
  //   PATCH  /projects/:p/tasks/:t/review/comments/:cid
  //   POST   /projects/:p/tasks/:t/review/comments/:cid/replies
  //   DELETE /projects/:p/tasks/:t/review/comments/:cid
  it('getTaskReview hits the exact review route (C3)', async () => {
    const { api } = await import('./api');
    await api.getTaskReview('proj-1', 'task-1');
    expect(requests.length).toBe(1);
    expect(requests[0].url).toContain('/projects/proj-1/tasks/task-1/review');
    expect(requests[0].opts.method).toBeUndefined(); // GET default
  });

  it('addReviewComment posts the comment payload to the comments route (C3)', async () => {
    const { api } = await import('./api');
    const payload = {
      scope: 'line',
      filePath: 'src/app.js',
      line: 42,
      side: 'right',
      headSha: 'abc123',
      body: 'Consider the null case',
    };
    await api.addReviewComment('proj-1', 'task-1', payload);
    expect(requests.length).toBe(1);
    expect(requests[0].url).toContain('/projects/proj-1/tasks/task-1/review/comments');
    expect(requests[0].opts.method).toBe('POST');
    expect(JSON.parse(requests[0].opts.body)).toEqual(payload);
  });

  it('updateReviewComment patches body/resolved on the exact comment (C3)', async () => {
    const { api } = await import('./api');
    await api.updateReviewComment('proj-1', 'task-1', 'rc-1', { resolved: true });
    expect(requests.length).toBe(1);
    expect(requests[0].url).toContain('/projects/proj-1/tasks/task-1/review/comments/rc-1');
    expect(requests[0].opts.method).toBe('PATCH');
    expect(JSON.parse(requests[0].opts.body)).toEqual({ resolved: true });
  });

  it('addReviewCommentReply posts the reply body to the replies sub-route (C3)', async () => {
    const { api } = await import('./api');
    await api.addReviewCommentReply('proj-1', 'task-1', 'rc-1', 'Good point');
    expect(requests.length).toBe(1);
    expect(requests[0].url).toContain('/projects/proj-1/tasks/task-1/review/comments/rc-1/replies');
    expect(requests[0].opts.method).toBe('POST');
    expect(JSON.parse(requests[0].opts.body)).toEqual({ body: 'Good point' });
  });

  it('deleteReviewComment issues DELETE on the exact comment (C3)', async () => {
    const { api } = await import('./api');
    await api.deleteReviewComment('proj-1', 'task-1', 'rc-1');
    expect(requests.length).toBe(1);
    expect(requests[0].url).toContain('/projects/proj-1/tasks/task-1/review/comments/rc-1');
    expect(requests[0].opts.method).toBe('DELETE');
  });
});

/***
 * MARK: model key mapping tests
 * @description Characterization tests for the model switcher's client-side
 *   key grammar: option values prefer the backend composite key and stored
 *   legacy references (bare id / name) are remapped onto the first matching
 *   option so previously persisted selections keep highlighting a valid
 *   model. Pinned before the harness-scoped key change so the mapping
 *   contract cannot silently drift.
 ***/
describe('model key mapping', () => {
  it('modelOptionValue prefers the backend key and falls back to a locally-computed one', async () => {
    const { modelOptionValue } = await import('./api');
    expect(modelOptionValue({ id: 'm1', name: 'M1', provider: 'p', key: 'p::m1' })).toBe('p::m1');
    expect(modelOptionValue({ id: 'm1', name: 'M1', provider: 'p' })).toBe('p::m1');
    expect(modelOptionValue({ id: 'bare' })).toBe('bare');
    expect(modelOptionValue(null)).toBe('');
  });

  it('modelKeyForValue keeps exact option values and remaps stored legacy values', async () => {
    const { modelKeyForValue } = await import('./api');
    const models = [
      { id: 'm1', name: 'Model One', provider: 'p' },
      { id: 'm2', name: 'Model Two', provider: 'q' },
    ];
    expect(modelKeyForValue(models, 'p::m1')).toBe('p::m1');
    // Bare id stored before composite keys existed → remapped to the option.
    expect(modelKeyForValue(models, 'm1')).toBe('p::m1');
    // Name stored → remapped to the option.
    expect(modelKeyForValue(models, 'Model Two')).toBe('q::m2');
    // Unresolvable values pass through untouched so the UI can show them.
    expect(modelKeyForValue(models, 'gone')).toBe('gone');
    expect(modelKeyForValue(models, '')).toBe('');
    expect(modelKeyForValue(undefined, 'm1')).toBe('m1');
  });

  // --- Harness-scoped option mapping (harness::provider::id) ---
  it('modelOptionValue prefers the harness-scoped backend key and computes one when absent', async () => {
    const { modelOptionValue } = await import('./api');
    expect(modelOptionValue({ id: 'm1', provider: 'p', harness: 'pi', key: 'pi::p::m1' })).toBe(
      'pi::p::m1',
    );
    expect(modelOptionValue({ id: 'm1', provider: 'p', harness: 'pi' })).toBe('pi::p::m1');
    // Legacy shapes are untouched.
    expect(modelOptionValue({ id: 'm1', provider: 'p' })).toBe('p::m1');
  });

  it('modelKeyForValue maps stored legacy 2-part keys onto harness-scoped options (and vice versa)', async () => {
    const { modelKeyForValue } = await import('./api');
    const models = [
      {
        id: 'glm:cloud',
        name: 'GLM',
        provider: 'ollama-cloud',
        key: 'pi::ollama-cloud::glm:cloud',
        harness: 'pi',
      },
    ];
    // Canonical 3-part stored → exact option.
    expect(modelKeyForValue(models, 'pi::ollama-cloud::glm:cloud')).toBe(
      'pi::ollama-cloud::glm:cloud',
    );
    // Legacy 2-part stored → remapped onto the harness-scoped option.
    expect(modelKeyForValue(models, 'ollama-cloud::glm:cloud')).toBe('pi::ollama-cloud::glm:cloud');
    // Bare id stored → remapped too.
    expect(modelKeyForValue(models, 'glm:cloud')).toBe('pi::ollama-cloud::glm:cloud');
    // A 3-part reference naming an unknown harness still maps by provider::id.
    expect(modelKeyForValue(models, 'other::ollama-cloud::glm:cloud')).toBe(
      'pi::ollama-cloud::glm:cloud',
    );
    // Unresolvable → passthrough.
    expect(modelKeyForValue(models, 'gone')).toBe('gone');
  });

  it('maps legacy 2-part keys back onto legacy-shaped options (old cached lists)', async () => {
    const { modelKeyForValue } = await import('./api');
    const models = [{ id: 'm1', name: 'M1', provider: 'p', key: 'p::m1' }];
    expect(modelKeyForValue(models, 'p::m1')).toBe('p::m1');
    // A harness-scoped stored value maps onto the legacy-shaped option.
    expect(modelKeyForValue(models, 'pi::p::m1')).toBe('p::m1');
  });

  /**
   * MARK: backend↔frontend grammar parity
   * @description Runs the SAME key matrix through the frontend helpers (this
   *   file) and the backend canonical module (api/models.js via the shared
   *   implementation) and asserts identical outputs — locking the two
   *   grammars together so they cannot drift.
   */
  it('frontend helpers match the backend canonical module on the full key matrix (parity)', async () => {
    const frontend = await import('./api');
    // The frontend re-exports the shared canonical implementation; asserting
    // the re-exports behave per grammar keeps the import chain honest.
    const {
      parseModelKey,
      normalizeModelRef,
      modelKey,
      harnessModelKey,
      validateModelRefShape,
      classifiesForeignHarness,
    } = frontend;

    const matrix = [
      'pi::ollama-cloud::glm-5.3-flash:cloud',
      'ollama-cloud-direct::glm-5.3-flash:cloud',
      'deepseek-v4-flash:0731-cloud',
      'default',
      'p::i::extra::more',
      'unknown-harness::p::i',
    ];
    const backendResults = await import('../../../shared/modelKeys.js');

    for (const ref of matrix) {
      expect(parseModelKey(ref)).toEqual(backendResults.parseModelKey(ref));
      expect(normalizeModelRef(ref, 'pi')).toBe(backendResults.normalizeModelRef(ref, 'pi'));
      expect(validateModelRefShape(ref)).toBe(backendResults.validateModelRefShape(ref));
      expect(classifiesForeignHarness(ref, 'pi')).toBe(
        backendResults.classifiesForeignHarness(ref, 'pi'),
      );
    }
    expect(modelKey('ollama-cloud', 'm1')).toBe(backendResults.modelKey('ollama-cloud', 'm1'));
    expect(harnessModelKey('pi', 'ollama-cloud', 'm1')).toBe(
      backendResults.harnessModelKey('pi', 'ollama-cloud', 'm1'),
    );
  });
});
