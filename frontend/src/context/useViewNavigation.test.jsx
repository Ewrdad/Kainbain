import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewNavigation } from './useViewNavigation';

/***
 * MARK: useViewNavigation tests
 * @description Pins router-backed navigation after the provider extraction:
 * plain state without a router, navigate-on-setView with a router, and
 * location sync (including unknown-path retention and task resolution).
 ***/
describe('useViewNavigation', () => {
  function setup({ tasksList = [], selectedSnapshot = null } = {}) {
    const setSelectedSnapshot = vi.fn();
    const { result } = renderHook(() =>
      useViewNavigation({ tasksList, selectedSnapshot, setSelectedSnapshot }),
    );
    return { result, setSelectedSnapshot };
  }

  it('starts on orchestrator and sets view as plain state without a router', () => {
    const { result } = setup();
    expect(result.current.view).toBe('orchestrator');
    act(() => {
      result.current.setView('settings');
    });
    expect(result.current.view).toBe('settings');
  });

  it('navigates through the registered router on setView', () => {
    const { result } = setup();
    const navigate = vi.fn();
    act(() => {
      result.current.registerRouter({ navigate, pathname: '/' });
    });
    act(() => {
      result.current.setView('settings');
    });
    expect(navigate).toHaveBeenCalledWith('/settings');
    // Same-tick duplicate navigations to one target push a single entry.
    act(() => {
      result.current.setView('settings');
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('syncRouteLocation resolves the view and selects the routed task', () => {
    const tasksList = [{ id: 't1', goal: 'G' }];
    const { result, setSelectedSnapshot } = setup({ tasksList });
    act(() => {
      result.current.syncRouteLocation('/tasks/t1');
    });
    expect(result.current.view).toBe('task-detail');
    expect(setSelectedSnapshot).toHaveBeenCalled();
    // The updater resolves against the fresh board list.
    const updater = setSelectedSnapshot.mock.calls[0][0];
    expect(updater(null)).toEqual(tasksList[0]);
  });

  it('syncRouteLocation keeps the view on unknown paths', () => {
    const { result } = setup();
    act(() => {
      result.current.setView('settings');
    });
    act(() => {
      result.current.syncRouteLocation('/nope-not-a-route');
    });
    expect(result.current.view).toBe('settings');
  });

  it('syncRouteLocation keeps the task snapshot on the survey route', () => {
    const tasksList = [{ id: 't1', goal: 'G' }];
    const { result, setSelectedSnapshot } = setup({ tasksList });
    act(() => {
      result.current.syncRouteLocation('/tasks/t1/survey');
    });
    expect(result.current.view).toBe('task-survey');
    expect(setSelectedSnapshot).toHaveBeenCalled();
    const updater = setSelectedSnapshot.mock.calls[0][0];
    // Deep links and back/forward keep task context instead of clearing it.
    expect(updater(null)).toEqual(tasksList[0]);
  });

  it('syncRouteLocation clears the snapshot on non-task locations', () => {
    const { result, setSelectedSnapshot } = setup({
      selectedSnapshot: { id: 't1' },
    });
    act(() => {
      result.current.syncRouteLocation('/settings');
    });
    expect(result.current.view).toBe('settings');
    const updater = setSelectedSnapshot.mock.calls[0][0];
    expect(updater({ id: 't1' })).toBeNull();
  });
});
