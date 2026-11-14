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

  it('preserves the snapshot verdict when the backend served one', () => {
    expect(
      fleetCountsById({
        models: [
          {
            id: 'muse::meta::retired',
            runnerCount: 0,
            runnerIds: [],
            harnesses: ['muse'],
            tiers: [],
            available: false,
            unavailableReason: 'stale pin',
          },
        ],
      }),
    ).toEqual({
      'muse::meta::retired': {
        runnerCount: 0,
        runnerIds: [],
        harnesses: ['muse'],
        tiers: [],
        available: false,
        unavailableReason: 'stale pin',
      },
    });
  });

  it('carries WP-C fields (declaredBy, verified, provenance) for pickers and admin', () => {
    const entry = {
      id: 'muse::meta::m',
      runnerCount: 0,
      runnerIds: [],
      harnesses: ['muse'],
      tiers: [],
      declaredBy: ['local-alpha'],
      claimedBy: [],
      verified: false,
      harness: 'muse',
      lastServedAtMs: 123,
      provenance: { 'box-a': { source: 'discovery' } },
    };
    expect(fleetCountsById({ models: [entry] })['muse::meta::m']).toEqual({
      runnerCount: 0,
      runnerIds: [],
      harnesses: ['muse'],
      tiers: [],
      declaredBy: ['local-alpha'],
      claimedBy: [],
      verified: false,
      harness: 'muse',
      lastServedAtMs: 123,
      provenance: { 'box-a': { source: 'discovery' } },
    });
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

  it('exposes harnesses, models, and quarantined for pickers and admin', async () => {
    const harnesses = [{ id: 'muse', runnerCount: 1, runnerIds: ['r1'] }];
    const models = [{ id: 'muse::meta::m', runnerCount: 1, runnerIds: ['r1'] }];
    const quarantined = [{ id: 'prov::m', reason: 'not-harness-qualified' }];
    api.getFleetModelCatalog.mockResolvedValue({ models, harnesses, quarantined });
    const { result } = renderHook(() => useFleetModelCatalog());
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    expect(result.current.harnesses).toEqual(harnesses);
    expect(result.current.models).toEqual(models);
    expect(result.current.quarantined).toEqual(quarantined);
  });

  it('defaults harnesses, models, and quarantined to empty lists', () => {
    const { result } = renderHook(() => useFleetModelCatalog({ enabled: false }));
    expect(result.current.harnesses).toEqual([]);
    expect(result.current.models).toEqual([]);
    expect(result.current.quarantined).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('records fetch errors without losing the last-good state', async () => {
    api.getFleetModelCatalog.mockResolvedValueOnce({
      models: [{ id: 'm1', runnerCount: 1, runnerIds: ['a'] }],
    });
    const { result } = renderHook(() => useFleetModelCatalog());
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    expect(result.current.error).toBeNull();
    api.getFleetModelCatalog.mockRejectedValueOnce(new Error('flaky'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe('flaky');
    // Last-good data survives; loaded never downgrades.
    expect(result.current.loaded).toBe(true);
    expect(result.current.counts.m1.runnerCount).toBe(1);
    api.getFleetModelCatalog.mockResolvedValue({ models: [] });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBeNull();
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
    // render badge-free instead of a misleading "0 runners".
    expect(result.current.counts).toEqual({});
    expect(result.current.loaded).toBe(false);
    api.getFleetModelCatalog.mockResolvedValue({ models: [] });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.loaded).toBe(true);
  });
});
