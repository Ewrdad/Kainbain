import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEngineStatus } from './useEngineStatus';

vi.mock('../services/api', () => ({
  api: {
    healthStatus: vi.fn(),
    computeStatus: vi.fn(),
    computeStart: vi.fn(),
    computeStop: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../services/api';

/***
 * MARK: useEngineStatus tests
 * @description Pins health polling state and compute toggle behavior after
 * the provider extraction (no behavior change, new home).
 ***/
describe('useEngineStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchHealth stores the snapshot when checks are present', async () => {
    api.healthStatus.mockResolvedValue({
      status: 'ok',
      checks: { litellm: { status: 'ok', message: 'up' } },
    });
    const { result } = renderHook(() => useEngineStatus({}));
    await act(async () => {
      await result.current.fetchHealth();
    });
    expect(result.current.healthState.status).toBe('ok');
    expect(result.current.isHealthRefreshing).toBe(false);
  });

  it('toggleCompute starts a stopped engine and notifies', async () => {
    api.computeStart.mockResolvedValue({ running: true });
    const notifySuccess = vi.fn();
    const { result } = renderHook(() =>
      useEngineStatus({ notifySuccess, notifyInfo: vi.fn(), notifyError: vi.fn() }),
    );
    await act(async () => {
      await result.current.toggleCompute('proj-1');
    });
    expect(api.computeStart).toHaveBeenCalledWith('proj-1');
    expect(result.current.computeRunning).toBe(true);
    expect(notifySuccess).toHaveBeenCalledWith('Compute engine started', 'Engine Active');
  });

  it('toggleCompute stops the owning project, not the selected one', async () => {
    // Project B is selected but the engine owner runs in project A: stop must
    // target A so the backend interrupts the owner's live run instead of
    // cancelling nothing in B.
    api.computeStatus.mockResolvedValue({ running: true });
    api.computeStop.mockResolvedValue({ running: false });
    const { result } = renderHook(() =>
      useEngineStatus({
        notifySuccess: vi.fn(),
        notifyInfo: vi.fn(),
        notifyError: vi.fn(),
        engineState: { status: 'running', activeTaskId: 't-a1', activeProjectId: 'proj-A' },
      }),
    );
    await act(async () => {
      await result.current.fetchStatus();
    });
    await act(async () => {
      await result.current.toggleCompute('proj-B');
    });
    expect(api.computeStop).toHaveBeenCalledWith('proj-A');
  });

  it('toggleCompute starts in the selected project when the engine is idle', async () => {
    api.computeStart.mockResolvedValue({ running: true });
    const { result } = renderHook(() =>
      useEngineStatus({
        notifySuccess: vi.fn(),
        notifyInfo: vi.fn(),
        notifyError: vi.fn(),
        engineState: { status: 'idle', activeTaskId: null, activeProjectId: null },
      }),
    );
    await act(async () => {
      await result.current.toggleCompute('proj-B');
    });
    expect(api.computeStart).toHaveBeenCalledWith('proj-B');
  });

  it('toggleCompute stops a running engine', async () => {
    api.computeStatus.mockResolvedValue({ running: true });
    api.computeStop.mockResolvedValue({ running: false });
    const notifyInfo = vi.fn();
    const { result } = renderHook(() =>
      useEngineStatus({ notifySuccess: vi.fn(), notifyInfo, notifyError: vi.fn() }),
    );
    await act(async () => {
      await result.current.fetchStatus();
    });
    expect(result.current.computeRunning).toBe(true);
    await act(async () => {
      await result.current.toggleCompute('proj-1');
    });
    expect(api.computeStop).toHaveBeenCalledWith('proj-1');
    expect(result.current.computeRunning).toBe(false);
    expect(notifyInfo).toHaveBeenCalledWith('Compute engine stopped', 'Engine Idle');
  });
});
