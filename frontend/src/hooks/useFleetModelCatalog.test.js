import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { fleetCountsById, useFleetModelCatalog } from './useFleetModelCatalog';

/***
 * MARK: useFleetModelCatalog tests
 * @description Verifies the fleet availability hook: indexes the live
 *   catalogue by id, stays empty (never misleading) when the client is
 *   absent or failing, skips malformed entries, and refreshes on demand.
 */
vi.mock('../services/api', () => ({
  api: { getFleetModelCatalog: vi.fn() },
}));

import { api } from '../services/api';

afterEach(() => {
  vi.clearAllMocks();
});

describe('fleetCountsById', () => {
  it('indexes entries by id and drops malformed ones', () => {
    expect(
      fleetCountsById({
        models: [
          { id: 'm1', runnerCount: 2, runnerIds: ['a', 'b'], harnesses: ['pi'], tiers: ['T0'] },
          { id: '  ', runnerCount: 1 },
          { runnerCount: 1 },
          null,
        ],
      }),
    ).toEqual({
      m1: { runnerCount: 2, runnerIds: ['a', 'b'], harnesses: ['pi'], tiers: ['T0'] },
    });
    expect(fleetCountsById(null)).toEqual({});
    expect(fleetCountsById({})).toEqual({});
  });
});

describe('useFleetModelCatalog', () => {
  it('fetches the catalogue and indexes counts by id', async () => {
    api.getFleetModelCatalog.mockResolvedValue({
      models: [{ id: 'm1', runnerCount: 2, runnerIds: ['a', 'b'] }],
    });
    const { result } = renderHook(() => useFleetModelCatalog());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.counts.m1).toEqual({
      runnerCount: 2,
      runnerIds: ['a', 'b'],
      harnesses: [],
      tiers: [],
    });
  });

  it('stays empty when the API client is unavailable', () => {
    const original = api.getFleetModelCatalog;
    delete api.getFleetModelCatalog;
    try {
      const { result } = renderHook(() => useFleetModelCatalog());
      expect(result.current.counts).toEqual({});
      expect(result.current.loading).toBe(false);
    } finally {
      api.getFleetModelCatalog = original;
    }
  });

  it('keeps an empty map when the fetch fails, then refreshes on demand', async () => {
    api.getFleetModelCatalog.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useFleetModelCatalog());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.counts).toEqual({});
    api.getFleetModelCatalog.mockResolvedValue({
      models: [{ id: 'm9', runnerCount: 1, runnerIds: ['z'] }],
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.counts.m9.runnerCount).toBe(1);
  });

  it('does not fetch until enabled flips true', () => {
    const { result, rerender } = renderHook(({ enabled }) => useFleetModelCatalog({ enabled }), {
      initialProps: { enabled: false },
    });
    expect(api.getFleetModelCatalog).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    rerender({ enabled: true });
    expect(api.getFleetModelCatalog).toHaveBeenCalledTimes(1);
  });

  it('reports loaded only after a successful fetch', async () => {
    api.getFleetModelCatalog.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useFleetModelCatalog());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Failed fetch: counts stay empty AND loaded stays false, so pickers
    // render badge-free instead of a misleading "No runners".
    expect(result.current.counts).toEqual({});
    expect(result.current.loaded).toBe(false);
    api.getFleetModelCatalog.mockResolvedValue({ models: [] });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.loaded).toBe(true);
  });
});
