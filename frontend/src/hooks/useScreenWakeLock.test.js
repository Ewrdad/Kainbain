import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useScreenWakeLock } from './useScreenWakeLock';

function makeSentinel() {
  const listeners = new Map();
  const sentinel = {
    released: false,
    release: vi.fn().mockImplementation(() => {
      sentinel.released = true;
      return Promise.resolve();
    }),
    addEventListener: vi.fn((type, cb) => {
      listeners.set(type, [...(listeners.get(type) || []), cb]);
    }),
    removeEventListener: vi.fn((type, cb) => {
      listeners.set(type, (listeners.get(type) || []).filter((fn) => fn !== cb));
    }),
    __emit(type) {
      for (const cb of listeners.get(type) || []) cb();
    },
  };
  return sentinel;
}

function installWakeLockMock(requestImpl) {
  const request = vi.fn(requestImpl ?? (() => Promise.resolve(makeSentinel())));
  Object.defineProperty(window.navigator, 'wakeLock', {
    value: { request },
    configurable: true,
    writable: true,
  });
  return request;
}

function removeWakeLockMock() {
  if ('wakeLock' in window.navigator) {
    delete window.navigator.wakeLock;
  }
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  });
}

describe('useScreenWakeLock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeWakeLockMock();
    setVisibility('visible');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    removeWakeLockMock();
    setVisibility('visible');
    vi.restoreAllMocks();
  });

  test('reports unsupported and never requests without the API', async () => {
    const { result } = renderHook(() => useScreenWakeLock({ wanted: true }));

    expect(result.current.supported).toBe(false);
    expect(result.current.active).toBe(false);
    await act(async () => {});
    expect(result.current.active).toBe(false);
  });

  test('does nothing while unwanted', async () => {
    const request = installWakeLockMock();
    const { result } = renderHook(() => useScreenWakeLock({ wanted: false }));

    expect(result.current.supported).toBe(true);
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
  });

  test('acquires the lock when wanted and visible', async () => {
    const request = installWakeLockMock();
    const onChange = vi.fn();
    const { result, unmount } = renderHook(() => useScreenWakeLock({ wanted: true, onChange }));

    await waitFor(() => expect(result.current.active).toBe(true));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
    expect(onChange).toHaveBeenCalledWith(true);
    unmount();
    await act(async () => {});
  });

  test('releases the lock when wanted flips to false', async () => {
    const sentinel = makeSentinel();
    installWakeLockMock(() => Promise.resolve(sentinel));
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ wanted }) => useScreenWakeLock({ wanted, onChange }), {
      initialProps: { wanted: true },
    });

    await waitFor(() => expect(result.current.active).toBe(true));
    rerender({ wanted: false });

    await waitFor(() => expect(result.current.active).toBe(false));
    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  test('releases on unmount', async () => {
    const sentinel = makeSentinel();
    installWakeLockMock(() => Promise.resolve(sentinel));
    const { result, unmount } = renderHook(() => useScreenWakeLock({ wanted: true }));

    await waitFor(() => expect(result.current.active).toBe(true));
    unmount();
    await waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1));
  });

  test('does not request while hidden, acquires when the tab becomes visible', async () => {
    setVisibility('hidden');
    const request = installWakeLockMock();
    const { result, unmount } = renderHook(() => useScreenWakeLock({ wanted: true }));

    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(request).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {});
  });

  test('releases on hide and re-acquires on return', async () => {
    const first = makeSentinel();
    const second = makeSentinel();
    const request = installWakeLockMock()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { result, unmount } = renderHook(() => useScreenWakeLock({ wanted: true }));

    await waitFor(() => expect(result.current.active).toBe(true));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(result.current.active).toBe(false));
    expect(first.release).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {});
  });

  test('stays inactive when the platform denies the request', async () => {
    installWakeLockMock(() => Promise.reject(new Error('NotAllowedError')));
    const { result } = renderHook(() => useScreenWakeLock({ wanted: true }));

    await act(async () => {});
    await act(async () => {});
    expect(result.current.active).toBe(false);
  });

  test('system release of the sentinel marks the lock inactive', async () => {
    const sentinel = makeSentinel();
    const request = installWakeLockMock(() => Promise.resolve(sentinel));
    const { result } = renderHook(() => useScreenWakeLock({ wanted: true }));

    await waitFor(() => expect(result.current.active).toBe(true));

    act(() => {
      sentinel.released = true;
      sentinel.__emit('release');
    });

    await waitFor(() => expect(result.current.active).toBe(false));
    // No immediate re-request loop while still visible (MDN pattern:
    // re-acquire happens on visibility return, not on every release).
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('rapid wanted flip releases the in-flight request instead of holding it', async () => {
    let resolveRequest;
    const request = installWakeLockMock(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ wanted }) => useScreenWakeLock({ wanted }), {
      initialProps: { wanted: true },
    });

    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);

    rerender({ wanted: false });
    const sentinel = makeSentinel();
    await act(async () => {
      resolveRequest(sentinel);
    });

    await waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1));
    expect(result.current.active).toBe(false);
  });

  test('unmount while a request is pending releases the lock on settle', async () => {
    let resolveRequest;
    installWakeLockMock(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const { unmount } = renderHook(() => useScreenWakeLock({ wanted: true }));

    await act(async () => {});
    unmount();

    const sentinel = makeSentinel();
    await act(async () => {
      resolveRequest(sentinel);
    });
    await waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1));
  });

  test('tab hiding while a request is pending releases the lock on settle', async () => {
    let resolveRequest;
    installWakeLockMock(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const { result } = renderHook(() => useScreenWakeLock({ wanted: true }));

    await act(async () => {});
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    const sentinel = makeSentinel();
    await act(async () => {
      resolveRequest(sentinel);
    });

    await waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1));
    expect(result.current.active).toBe(false);
  });

  test('hide->show during a pending request holds exactly one lock and strands none', async () => {
    const resolvers = [];
    const request = installWakeLockMock(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result, rerender } = renderHook(({ wanted }) => useScreenWakeLock({ wanted }), {
      initialProps: { wanted: true },
    });

    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);

    // Hide then show while the first request is still pending: the
    // visibility handler starts a second same-generation acquire.
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {});
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(2);

    // Both requests settle successfully in the same generation.
    const first = makeSentinel();
    const second = makeSentinel();
    await act(async () => {
      resolvers[0](first);
      resolvers[1](second);
    });

    await waitFor(() => expect(result.current.active).toBe(true));
    // Exactly one sentinel may remain held; the duplicate must be released.
    await waitFor(() => expect([first, second].filter((s) => !s.released)).toHaveLength(1));

    // Turning the gate off must release the survivor: nothing stranded.
    rerender({ wanted: false });
    await waitFor(() => expect(result.current.active).toBe(false));
    await waitFor(() => {
      expect(first.release).toHaveBeenCalledTimes(1);
      expect(second.release).toHaveBeenCalledTimes(1);
    });
    expect([first, second].filter((s) => !s.released)).toHaveLength(0);
  });

  test('StrictMode double-effect settles on exactly one held lock', async () => {
    const request = installWakeLockMock();
    const { result, unmount } = renderHook(() => useScreenWakeLock({ wanted: true }), {
      wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
    });

    await waitFor(() => expect(result.current.active).toBe(true));
    await act(async () => {});

    const sentinels = await Promise.all(request.mock.results.map((r) => r.value));
    expect(sentinels.filter((s) => !s.released)).toHaveLength(1);
    unmount();
    await act(async () => {});
  });
});
