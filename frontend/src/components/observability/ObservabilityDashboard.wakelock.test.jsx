import React, { useEffect, useState } from 'react';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { ObservabilityDashboard } from './ObservabilityDashboard';
import { api } from '../../services/api';
import { setNarrowViewportOverride } from './monitorCompact';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    observabilityStatus: vi.fn().mockResolvedValue({
      status: 'ok',
      observability: {
        stats: {
          total: 10,
          completed: 7,
          failed: 1,
          running: 1,
          waitingHuman: 1,
          paused: 0,
          inStage: 1,
          blocked: 0,
          queueDepth: 2,
          successRate: 87.5,
          failureRate: 12.5,
        },
        engineState: { status: 'running', activeTaskId: 't1', activeStageName: 'Build' },
        queue: [],
        activeTask: null,
        recentCompleted: [],
        recentFailed: [],
      },
    }),
  },
}));

const RUNNING_ENGINE = { status: 'running', activeTaskId: 't1', activeStageName: 'Build' };
const IDLE_ENGINE = { status: 'idle', activeTaskId: null };
const AWAKE_PREFS = { keepScreenAwakeOnMonitor: true, reduceMotion: false };

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
    removeEventListener: vi.fn(),
    __emit(type) {
      for (const cb of listeners.get(type) || []) cb();
    },
  };
  return sentinel;
}

function installWakeLockMock() {
  const sentinels = [];
  const request = vi.fn(() => {
    const sentinel = makeSentinel();
    sentinels.push(sentinel);
    return Promise.resolve(sentinel);
  });
  Object.defineProperty(window.navigator, 'wakeLock', {
    value: { request },
    configurable: true,
    writable: true,
  });
  return { request, sentinels };
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

/***
 * Renders the dashboard with a live context so engine/pref transitions can
 * be driven mid-test. Base context values come from renderWithKainBain so
 * this harness stays in sync with the shared test defaults.
 ***/
function renderControllableDashboard({ engineState, uiPreferences }) {
  const { value: base, unmount: dropBase } = renderWithKainBain(<React.Fragment />, {
    engineState,
    uiPreferences,
  });
  dropBase();
  const control = {};
  function Harness() {
    const [engine, setEngine] = useState(engineState);
    const [prefs, setPrefs] = useState(uiPreferences);
    useEffect(() => {
      control.setEngine = setEngine;
      control.setPrefs = setPrefs;
    }, []);
    return (
      <MemoryRouter initialEntries={['/']}>
        <KainBainContext.Provider value={{ ...base, engineState: engine, uiPreferences: prefs }}>
          <ObservabilityDashboard />
        </KainBainContext.Provider>
      </MemoryRouter>
    );
  }
  const rendered = render(<Harness />);
  return { ...rendered, control };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.sessionStorage.clear();
  setNarrowViewportOverride(null);
  removeWakeLockMock();
  setVisibility('visible');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  setNarrowViewportOverride(null);
  window.sessionStorage.clear();
  removeWakeLockMock();
  setVisibility('visible');
  vi.restoreAllMocks();
});

test('holds the wake lock while open, running, opted in, and visible', async () => {
  const { request } = installWakeLockMock();
  const { unmount } = renderWithKainBain(<ObservabilityDashboard />, {
    engineState: RUNNING_ENGINE,
    uiPreferences: AWAKE_PREFS,
  });

  await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  expect(request).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => {});
});

test('legacy preferences without the key keep the screen awake (default on)', async () => {
  const { request } = installWakeLockMock();
  const { unmount } = renderWithKainBain(<ObservabilityDashboard />, {
    engineState: RUNNING_ENGINE,
    uiPreferences: { reduceMotion: false },
  });

  await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  unmount();
  await act(async () => {});
});

test('pref OFF means no lock while running', async () => {
  const { request } = installWakeLockMock();
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: RUNNING_ENGINE,
    uiPreferences: { keepScreenAwakeOnMonitor: false },
  });

  await act(async () => {});
  await act(async () => {});
  expect(request).not.toHaveBeenCalled();
});

test('idle engine means no lock even when opted in', async () => {
  const { request } = installWakeLockMock();
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: IDLE_ENGINE,
    uiPreferences: AWAKE_PREFS,
  });

  await act(async () => {});
  await act(async () => {});
  expect(request).not.toHaveBeenCalled();
});

test('missing Wake Lock API is a silent no-op', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: RUNNING_ENGINE,
    uiPreferences: AWAKE_PREFS,
  });

  await act(async () => {});
  expect(screen.getByTestId('observability-dashboard')).toBeInTheDocument();
  expect(api.observabilityStatus).toHaveBeenCalled();
});

test('turning the toggle OFF releases the lock; turning it back ON re-acquires', async () => {
  const { request, sentinels } = installWakeLockMock();
  const { control, unmount } = renderControllableDashboard({
    engineState: RUNNING_ENGINE,
    uiPreferences: AWAKE_PREFS,
  });

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

  act(() => {
    control.setPrefs({ keepScreenAwakeOnMonitor: false });
  });
  await waitFor(() => expect(sentinels[0].release).toHaveBeenCalledTimes(1));

  act(() => {
    control.setPrefs({ keepScreenAwakeOnMonitor: true });
  });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  unmount();
  await act(async () => {});
});

test('engine going idle releases the lock; running again re-acquires', async () => {
  const { request, sentinels } = installWakeLockMock();
  const { control, unmount } = renderControllableDashboard({
    engineState: RUNNING_ENGINE,
    uiPreferences: AWAKE_PREFS,
  });

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

  act(() => {
    control.setEngine(IDLE_ENGINE);
  });
  await waitFor(() => expect(sentinels[0].release).toHaveBeenCalledTimes(1));

  act(() => {
    control.setEngine(RUNNING_ENGINE);
  });
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  unmount();
  await act(async () => {});
});

test('hiding the tab releases the lock; returning re-acquires it', async () => {
  const { request, sentinels } = installWakeLockMock();
  const { unmount } = renderWithKainBain(<ObservabilityDashboard />, {
    engineState: RUNNING_ENGINE,
    uiPreferences: AWAKE_PREFS,
  });

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

  setVisibility('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(sentinels[0].release).toHaveBeenCalledTimes(1));

  setVisibility('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  unmount();
  await act(async () => {});
});

test('leaving the monitor (unmount) releases the lock', async () => {
  const { request, sentinels } = installWakeLockMock();
  const { unmount } = renderWithKainBain(<ObservabilityDashboard />, {
    engineState: RUNNING_ENGINE,
    uiPreferences: AWAKE_PREFS,
  });

  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  unmount();
  await waitFor(() => expect(sentinels[0].release).toHaveBeenCalledTimes(1));
});

test('compact mobile monitor acquires the wake lock through the same wiring', async () => {
  setNarrowViewportOverride(true);
  const { request } = installWakeLockMock();
  const { unmount } = renderWithKainBain(<ObservabilityDashboard />, {
    engineState: RUNNING_ENGINE,
    uiPreferences: AWAKE_PREFS,
    processLogs: [{ id: '1', timestamp: 't', tag: '[AGENT]', text: 'hello' }],
  });

  await waitFor(() => expect(screen.getByTestId('mobile-monitor-view')).toBeInTheDocument());
  await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
  unmount();
  await act(async () => {});
});

test('compact mobile monitor does not acquire when the pref is OFF', async () => {
  setNarrowViewportOverride(true);
  const { request } = installWakeLockMock();
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: RUNNING_ENGINE,
    uiPreferences: { keepScreenAwakeOnMonitor: false },
    processLogs: [{ id: '1', timestamp: 't', tag: '[AGENT]', text: 'hello' }],
  });

  await waitFor(() => expect(screen.getByTestId('mobile-monitor-view')).toBeInTheDocument());
  await act(async () => {});
  expect(request).not.toHaveBeenCalled();
});
