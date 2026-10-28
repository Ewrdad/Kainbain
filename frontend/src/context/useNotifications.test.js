import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotifications, isNoisyNotification } from './useNotifications';

describe('useNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with empty notifications', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toEqual([]);
  });

  it('adds a notification with default properties', () => {
    const { result } = renderHook(() => useNotifications());
    let id;
    act(() => {
      id = result.current.addNotification({
        message: 'Task dispatch started',
        title: 'Task Dispatched',
      });
    });

    expect(id).toBeDefined();
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]).toMatchObject({
      id,
      title: 'Task Dispatched',
      message: 'Task dispatch started',
      type: 'info',
      duration: 5000,
    });
  });

  it('dismisses a notification by id', () => {
    const { result } = renderHook(() => useNotifications());
    let id1, id2;
    act(() => {
      id1 = result.current.notifySuccess('Success message');
      id2 = result.current.notifyError('Error message');
    });

    expect(result.current.notifications).toHaveLength(2);

    act(() => {
      result.current.dismissNotification(id1);
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe(id2);
  });

  it('clears all notifications', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.notifySuccess('Task one done');
      result.current.notifyInfo('Stage two active');
      result.current.notifyWarning('Review three required');
    });

    expect(result.current.notifications).toHaveLength(3);

    act(() => {
      result.current.clearAllNotifications();
    });

    expect(result.current.notifications).toHaveLength(0);
  });

  it('provides helpers for success, info, warning, and error', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.notifySuccess('Success text', 'Success Title');
      result.current.notifyInfo('Info text', 'Info Title');
      result.current.notifyWarning('Warning text', 'Warning Title');
      result.current.notifyError('Error text', 'Error Title');
    });

    expect(result.current.notifications).toHaveLength(4);
    expect(result.current.notifications[0].type).toBe('success');
    expect(result.current.notifications[1].type).toBe('info');
    expect(result.current.notifications[2].type).toBe('warning');
    expect(result.current.notifications[3].type).toBe('error');
  });

  it('ignores invalid additions without title or message', () => {
    const { result } = renderHook(() => useNotifications());
    let id;
    act(() => {
      id = result.current.addNotification({});
    });
    expect(id).toBeNull();
    expect(result.current.notifications).toHaveLength(0);
  });

  it('filters out noisy automated polling, heartbeat, and ping notifications', () => {
    expect(isNoisyNotification({ title: 'Heartbeat', message: 'Engine ping ok' })).toBe(true);
    expect(isNoisyNotification({ title: 'Health Check', message: 'Status 200' })).toBe(true);
    expect(isNoisyNotification({ title: 'Polling', message: 'Background status sync' })).toBe(true);
    expect(isNoisyNotification({ meta: { isAutomated: true }, message: 'Sync event' })).toBe(true);
    expect(isNoisyNotification({ title: 'Task Created', message: 'Task #1 created' })).toBe(false);

    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.addNotification({ title: 'Heartbeat', message: 'Keepalive ping' });
      result.current.addNotification({
        title: 'Polling update',
        message: 'Periodic background poll',
      });
      result.current.addNotification({
        title: 'Task Approved',
        message: 'Stage approved by reviewer',
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Task Approved');
  });

  it('throttles rapid duplicate identical toasts within 2000ms', () => {
    const { result } = renderHook(() => useNotifications());

    act(() => {
      result.current.notifySuccess('Identical action occurred', 'Action Done');
      result.current.notifySuccess('Identical action occurred', 'Action Done');
      result.current.notifySuccess('Identical action occurred', 'Action Done');
    });

    expect(result.current.notifications).toHaveLength(1);

    // After 2500ms, identical message is permitted again
    act(() => {
      vi.advanceTimersByTime(2500);
      result.current.notifySuccess('Identical action occurred', 'Action Done');
    });

    expect(result.current.notifications).toHaveLength(2);
  });

  it('carries the action through to the toast and drops labelless actions', () => {
    const { result } = renderHook(() => useNotifications());
    const onClick = vi.fn();
    act(() => {
      result.current.addNotification({
        type: 'success',
        title: 'Retrospective chat',
        message: 'Chat reply ready',
        action: { label: 'View chat', onClick },
      });
      result.current.addNotification({
        title: 'Labelless',
        message: 'no label here',
        action: { onClick },
      });
    });
    expect(result.current.notifications[0]).toMatchObject({
      action: { label: 'View chat', onClick },
    });
    expect(result.current.notifications[1]).not.toHaveProperty('action');
  });
});
