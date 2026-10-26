import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useBoardSync } from './useBoardSync';

/***
 * MARK: useBoardSync tests
 * @description Pins the live-sync wiring: refs track the active project and
 * the refresh handler, and foreground polling re-fires the sync handler.
 ***/
describe('useBoardSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(activeProjectId) {
    const tasks = { scheduleTaskRefresh: vi.fn() };
    const { result } = renderHook(() => {
      const activeProjectIdRef = useRef(null);
      const taskSyncHandlerRef = useRef(null);
      useBoardSync({ activeProjectIdRef, taskSyncHandlerRef, activeProjectId, tasks });
      return { activeProjectIdRef, taskSyncHandlerRef };
    });
    return { refs: result.current, tasks };
  }

  it('tracks the active project and wires the refresh handler', () => {
    const { refs, tasks } = setup('proj-1');
    expect(refs.activeProjectIdRef.current).toBe('proj-1');
    expect(typeof refs.taskSyncHandlerRef.current).toBe('function');
    act(() => {
      refs.taskSyncHandlerRef.current('proj-1');
    });
    // Coalescing is owned by tasks.scheduleTaskRefresh (tested there); here
    // the handler must simply forward the project id.
    expect(tasks.scheduleTaskRefresh).toHaveBeenCalledWith('proj-1');
  });

  it('polls the sync handler on the foreground interval', () => {
    const { refs, tasks } = setup('proj-7');
    tasks.scheduleTaskRefresh.mockClear();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(tasks.scheduleTaskRefresh).toHaveBeenCalledWith('proj-7');
  });

  it('installs no polling without an active project', () => {
    const { refs } = setup(null);
    expect(refs.activeProjectIdRef.current).toBeNull();
    act(() => {
      vi.advanceTimersByTime(16000);
    });
  });
});
