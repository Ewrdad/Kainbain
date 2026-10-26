// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  request,
  normalizeTimeoutMs,
  DEFAULT_REQUEST_TIMEOUT_MS,
  NO_REQUEST_TIMEOUT,
} from './request.js';

/***
 * MARK: request transport tests
 * @description Locks the additive cancel/timeout seam: a POST without the new
 *   opts behaves exactly as before, `timeoutMs` overrides the default budget,
 *   and an external `signal` abort rejects with AbortError and is never
 *   retried (even for GETs, which otherwise retry once on network failure).
 ***/
describe('request transport seam', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('runs a POST without the new opts exactly as before (no retry, default budget)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'hi' }),
    }));
    global.fetch = fetchMock;
    const res = await request('/retrospective/chat', { method: 'POST', body: '{}' });
    expect(res).toEqual({ reply: 'hi' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('does not retry a POST on network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('network down');
    });
    global.fetch = fetchMock;
    await expect(request('/x', { method: 'POST', body: '{}' })).rejects.toThrow('network down');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('honours a timeoutMs override', async () => {
    global.fetch = vi.fn(() => new Promise(() => {}));
    const err = await request('/slow', { method: 'POST', body: '{}' }, { timeoutMs: 20 }).catch(
      (e) => e,
    );
    expect(err.name).toBe('AbortError');
    expect(err.message).toContain('20ms');
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30000);
  });

  it('rejects with AbortError when the external signal aborts, without retrying a GET', async () => {
    const fetchMock = vi.fn(
      (url, { signal } = {}) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('aborted by caller');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    global.fetch = fetchMock;
    const controller = new AbortController();
    const pending = request('/things', { method: 'GET' }, { signal: controller.signal });
    controller.abort();
    const err = await pending.catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('runs with no client timer when timeoutMs is NO_REQUEST_TIMEOUT', async () => {
    // No-timeout default for chat turns: even with fake timers advanced
    // far past any budget, the attempt stays pending until fetch settles.
    expect(NO_REQUEST_TIMEOUT).toBe(0);
    vi.useFakeTimers();
    try {
      let resolveFetch;
      global.fetch = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      );
      const pending = request(
        '/retrospective/chat',
        { method: 'POST', body: '{}' },
        { timeoutMs: NO_REQUEST_TIMEOUT },
      );
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(settled).toBe(false);
      resolveFetch({ ok: true, status: 200, json: async () => ({ reply: 'late' }) });
      await vi.useRealTimers();
      await expect(pending).resolves.toEqual({ reply: 'late' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still honours external abort with no client timer armed', async () => {
    const fetchMock = vi.fn(
      (url, { signal } = {}) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('cancelled by caller');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    global.fetch = fetchMock;
    const controller = new AbortController();
    const pending = request(
      '/retrospective/chat',
      { method: 'POST', body: '{}' },
      { timeoutMs: NO_REQUEST_TIMEOUT, signal: controller.signal },
    );
    controller.abort();
    const err = await pending.catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reduces timeout budgets to an armable value or disabled', () => {
    expect(normalizeTimeoutMs(1000)).toBe(1000);
    expect(normalizeTimeoutMs(0)).toBe(NO_REQUEST_TIMEOUT);
    expect(normalizeTimeoutMs(null)).toBe(NO_REQUEST_TIMEOUT);
    expect(normalizeTimeoutMs(undefined)).toBe(NO_REQUEST_TIMEOUT);
    // Degenerate inputs degrade to disabled (fail-safe): a malformed budget
    // must never abort a healthy request instantly.
    expect(normalizeTimeoutMs(Number.NaN)).toBe(NO_REQUEST_TIMEOUT);
    expect(normalizeTimeoutMs(-1)).toBe(NO_REQUEST_TIMEOUT);
    expect(normalizeTimeoutMs(Number.POSITIVE_INFINITY)).toBe(NO_REQUEST_TIMEOUT);
    expect(normalizeTimeoutMs('1000')).toBe(NO_REQUEST_TIMEOUT);
  });

  it.each([Number.NaN, -100, Number.POSITIVE_INFINITY, '1000'])(
    'never arms the client timer on degenerate budget %p',
    async (timeoutMs) => {
      vi.useFakeTimers();
      try {
        let resolveFetch;
        global.fetch = vi.fn(
          () =>
            new Promise((resolve) => {
              resolveFetch = resolve;
            }),
        );
        const pending = request('/x', { method: 'POST', body: '{}' }, { timeoutMs });
        let settled = false;
        void pending.then(() => {
          settled = true;
        });
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(settled).toBe(false);
        resolveFetch({ ok: true, status: 200, json: async () => ({ ok: true }) });
        await vi.useRealTimers();
        await expect(pending).resolves.toEqual({ ok: true });
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('still retries a timed-out GET once when no external signal is given', async () => {
    let calls = 0;
    global.fetch = vi.fn(() => {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    });
    const res = await request('/things', { method: 'GET' }, { timeoutMs: 20 });
    expect(res).toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});
