import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOnboarding } from './useOnboarding';

/***
 * MARK: useOnboarding tests
 * @description Verifies the first-run summary hook: resolves the
 *   GET /onboarding payload, degrades to a null summary (never a stuck
 *   loader) when the backend is unreachable or lacks the endpoint, and
 *   refreshes on demand after adoption.
 */
vi.mock('../services/api', () => ({
  api: { getOnboarding: vi.fn() },
}));

import { api } from '../services/api';

afterEach(() => {
  vi.clearAllMocks();
});

const SUMMARY = {
  runner: { hasFreshRunner: false, nextAction: 'approve-runner', nextActionDetail: 'Approve it.' },
  projectCount: 0,
  taskCount: 0,
  hasRun: false,
  adoptable: [{ path: '/repos/foo', name: 'foo' }],
  steps: [{ id: 'runner', title: 'Connect a Runner', done: false, detail: 'Approve it.' }],
  complete: false,
};

describe('useOnboarding', () => {
  it('fetches the summary once on mount', async () => {
    api.getOnboarding.mockResolvedValue(SUMMARY);
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.summary).toEqual(SUMMARY);
    expect(result.current.loaded).toBe(true);
    expect(api.getOnboarding).toHaveBeenCalledTimes(1);
  });

  it('resolves to a null summary when the fetch fails', async () => {
    api.getOnboarding.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.summary).toBeNull();
    expect(result.current.loaded).toBe(false);
  });

  it('stays idle until enabled flips true', async () => {
    api.getOnboarding.mockResolvedValue(SUMMARY);
    const { result, rerender } = renderHook(({ enabled }) => useOnboarding({ enabled }), {
      initialProps: { enabled: false },
    });
    expect(result.current.loading).toBe(false);
    expect(api.getOnboarding).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.summary).toEqual(SUMMARY);
  });

  it('refreshes on demand and keeps the old summary when the refresh fails', async () => {
    api.getOnboarding.mockResolvedValue(SUMMARY);
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const updated = { ...SUMMARY, projectCount: 1 };
    api.getOnboarding.mockResolvedValue(updated);
    let next;
    await act(async () => {
      next = await result.current.refresh();
    });
    expect(next).toEqual(updated);
    expect(result.current.summary).toEqual(updated);
    api.getOnboarding.mockRejectedValue(new Error('down'));
    await act(async () => {
      next = await result.current.refresh();
    });
    expect(next).toBeNull();
    expect(result.current.summary).toEqual(updated);
    expect(result.current.loaded).toBe(true);
  });
});
