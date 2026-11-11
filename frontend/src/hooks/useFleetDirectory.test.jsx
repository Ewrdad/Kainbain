import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useFleetDirectory, buildFleetSnapshotKey } from './useFleetDirectory';
import '@testing-library/jest-dom';

const getRunners = vi.hoisted(() => vi.fn());
const getRunnerMonitor = vi.hoisted(() => vi.fn());

vi.mock('../services/api', () => ({
  api: { getRunners, getRunnerMonitor },
}));

/***
 * MARK: useFleetDirectory tests
 * @description Verifies the shared fleet poller behind the Now Playing bar
 *   and the per-runner widget: one tick issues exactly one fleet read no
 *   matter how many surfaces mount, a stage switch with an unchanged
 *   roster republishes (the bottom-bar refresh bug), identical polls
 *   schedule no render, and background tabs pause with catch-up on return.
 ***/

function FleetProbe({ label = 'fleet', pollMs } = {}) {
  const { assignments, runners } = useFleetDirectory(pollMs === undefined ? {} : { pollMs });
  return (
    <div data-testid={`fleet-probe-${label}`}>
      {assignments.map((a) => `${a.runnerId}:${a.stageId}`).join(',')}|{(runners || []).length}
    </div>
  );
}

const renderSpy = vi.fn();
function CountingProbe() {
  useFleetDirectory({});
  renderSpy();
  return <div data-testid="counting-probe">probe</div>;
}

const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

describe('buildFleetSnapshotKey', () => {
  test('a stage switch with an unchanged roster changes the key', () => {
    const before = buildFleetSnapshotKey({
      monitor: { liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }] },
      registryList: [],
    });
    const after = buildFleetSnapshotKey({
      monitor: { liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's2' }] },
      registryList: [],
    });
    expect(after).not.toBe(before);
  });

  test('task, paused, and heartbeat changes change the key', () => {
    const base = { liveAssignments: [{ runnerId: 'r1', taskId: 't1', paused: false }] };
    expect(
      buildFleetSnapshotKey({
        monitor: { liveAssignments: [{ runnerId: 'r1', taskId: 't2', paused: false }] },
        registryList: [],
      }),
    ).not.toBe(buildFleetSnapshotKey({ monitor: base, registryList: [] }));
    expect(
      buildFleetSnapshotKey({
        monitor: { liveAssignments: [{ runnerId: 'r1', taskId: 't1', paused: true }] },
        registryList: [],
      }),
    ).not.toBe(buildFleetSnapshotKey({ monitor: base, registryList: [] }));
    expect(
      buildFleetSnapshotKey({
        monitor: {
          liveAssignments: [{ runnerId: 'r1', taskId: 't1', lastSeenAt: '2026-11-11T00:00:05Z' }],
        },
        registryList: [],
      }),
    ).not.toBe(
      buildFleetSnapshotKey({
        monitor: {
          liveAssignments: [{ runnerId: 'r1', taskId: 't1', lastSeenAt: '2026-11-11T00:00:00Z' }],
        },
        registryList: [],
      }),
    );
  });

  test('registry status changes change the key; misses key distinctly from empty', () => {
    expect(
      buildFleetSnapshotKey({
        monitor: { liveAssignments: [] },
        registryList: [{ runnerId: 'r1', status: 'active' }],
      }),
    ).not.toBe(
      buildFleetSnapshotKey({
        monitor: { liveAssignments: [] },
        registryList: [{ runnerId: 'r1', status: 'revoked' }],
      }),
    );
    // A missed read must never key as empty: a miss keeps the last-good
    // picture, while an honest empty clears the fleet.
    expect(buildFleetSnapshotKey({ monitor: null, registryList: null })).not.toBe(
      buildFleetSnapshotKey({ monitor: { liveAssignments: [] }, registryList: [] }),
    );
  });

  test('identical payloads key identically and reorder-only responses do not flap', () => {
    const monitor = {
      liveAssignments: [
        { runnerId: 'r1', taskId: 't1', stageId: 's1' },
        { runnerId: 'r2', taskId: 't2', stageId: 's2' },
      ],
    };
    const reordered = {
      liveAssignments: [...monitor.liveAssignments].reverse(),
    };
    expect(buildFleetSnapshotKey({ monitor: reordered, registryList: [] })).toBe(
      buildFleetSnapshotKey({ monitor, registryList: [] }),
    );
    expect(buildFleetSnapshotKey({ monitor, registryList: [] })).toBe(
      buildFleetSnapshotKey({ monitor, registryList: [] }),
    );
  });

  test('reordered nested keys (serving/capabilities) do not flap the key', () => {
    // The backend may serialise the same nested object with a different
    // key order; without sorted keying that republishes every tick.
    const monitor = {
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', serving: { harness: 'pi', model: 'm1' } }],
    };
    const reordered = {
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', serving: { model: 'm1', harness: 'pi' } }],
    };
    const registryList = [{ runnerId: 'r1', capabilities: { a: 1, b: 2 } }];
    const registryReordered = [{ runnerId: 'r1', capabilities: { b: 2, a: 1 } }];
    expect(buildFleetSnapshotKey({ monitor: reordered, registryList: registryReordered })).toBe(
      buildFleetSnapshotKey({ monitor, registryList }),
    );
    // A real nested change still moves the key.
    expect(
      buildFleetSnapshotKey({
        monitor: {
          liveAssignments: [
            { runnerId: 'r1', taskId: 't1', serving: { harness: 'pi', model: 'm2' } },
          ],
        },
        registryList,
      }),
    ).not.toBe(buildFleetSnapshotKey({ monitor, registryList }));
  });

  test('malformed and cyclical input never throws', () => {
    // The loop lives in covered fields (`serving`, `capabilities`) so it
    // actually reaches the key builder instead of being filtered away.
    const cyclicServing = {};
    cyclicServing.self = cyclicServing;
    const cyclicCaps = {};
    cyclicCaps.self = cyclicCaps;
    expect(() =>
      buildFleetSnapshotKey({
        monitor: { liveAssignments: [{ runnerId: 'r1', serving: cyclicServing }, null, 'nope'] },
        registryList: [{ runnerId: 'r1', capabilities: cyclicCaps }, null],
      }),
    ).not.toThrow();
    expect(() =>
      buildFleetSnapshotKey({ monitor: 'not-a-monitor', registryList: 'not-a-list' }),
    ).not.toThrow();
    expect(() => buildFleetSnapshotKey()).not.toThrow();
    expect(() => buildFleetSnapshotKey({})).not.toThrow();
    // Missing sides key as misses, exactly like explicit nulls.
    expect(buildFleetSnapshotKey({})).toBe(
      buildFleetSnapshotKey({ monitor: null, registryList: null }),
    );
  });
});

describe('useFleetDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisibility('visible');
    getRunners.mockResolvedValue([]);
    getRunnerMonitor.mockResolvedValue({ liveAssignments: [] });
  });

  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  test('two mounted surfaces share one poller: one read pair per tick, never doubled', async () => {
    vi.useFakeTimers();
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }],
    });
    getRunners.mockResolvedValue([{ runnerId: 'r1', status: 'active' }]);
    render(
      <>
        <FleetProbe label="bar" />
        <FleetProbe label="widget" />
      </>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    // Initial load + ticks at 5s and 10s: exactly 3 read pairs for both
    // surfaces together (the pre-sharing bar + widget issued 6).
    expect(getRunnerMonitor).toHaveBeenCalledTimes(3);
    expect(getRunners).toHaveBeenCalledTimes(3);
    // Both surfaces render the same live picture.
    expect(screen.getByTestId('fleet-probe-bar')).toHaveTextContent('r1:s1');
    expect(screen.getByTestId('fleet-probe-widget')).toHaveTextContent('r1:s1');
  });

  test('a late-mounted surface renders the live picture immediately, without a second read', async () => {
    vi.useFakeTimers();
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }],
    });
    const { unmount } = render(<FleetProbe label="bar" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getRunnerMonitor).toHaveBeenCalledTimes(1);
    unmount();
    // A fresh mount after a full teardown starts honest-empty and reads once.
    render(<FleetProbe label="widget" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getRunnerMonitor).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('fleet-probe-widget')).toHaveTextContent('r1:s1');
  });

  test('identical polls schedule no render anywhere (act-warning protection)', async () => {
    vi.useFakeTimers();
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }],
    });
    render(<CountingProbe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Mount + first publish only.
    expect(renderSpy.mock.calls.length).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    // Three more identical ticks polled (proving the timer ran) but
    // published nothing: no further renders.
    expect(getRunnerMonitor).toHaveBeenCalledTimes(4);
    expect(renderSpy.mock.calls.length).toBe(2);
  });

  test('a stage switch with an unchanged roster republishes to every subscriber', async () => {
    vi.useFakeTimers();
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }],
    });
    render(<FleetProbe label="bar" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('fleet-probe-bar')).toHaveTextContent('r1:s1');
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's2' }],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByTestId('fleet-probe-bar')).toHaveTextContent('r1:s2');
  });

  test('a missed read keeps the last-good picture instead of strobing to empty', async () => {
    vi.useFakeTimers();
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }],
    });
    render(<FleetProbe label="bar" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('fleet-probe-bar')).toHaveTextContent('r1:s1');
    getRunnerMonitor.mockRejectedValue(new Error('fleet monitor down'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByTestId('fleet-probe-bar')).toHaveTextContent('r1:s1');
  });

  test('a synchronously throwing client is a miss, not a crash', async () => {
    vi.useFakeTimers();
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }],
    });
    render(<FleetProbe label="bar" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('fleet-probe-bar')).toHaveTextContent('r1:s1');
    // A client that throws before returning a promise (bad config, dead
    // transport) must degrade like any other miss.
    getRunnerMonitor.mockImplementation(() => {
      throw new Error('transport exploded');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByTestId('fleet-probe-bar')).toHaveTextContent('r1:s1');
  });

  test('the shared tick honours a slower request instead of polling faster than asked', async () => {
    // One slow surface alone: initial read + one 15s tick in 20s (a 5s
    // floor would issue 5 reads and waste the budget it was given).
    vi.useFakeTimers();
    render(<FleetProbe label="slow" pollMs={15_000} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(getRunnerMonitor).toHaveBeenCalledTimes(2);
    expect(getRunners).toHaveBeenCalledTimes(2);
  });

  test('foreground request budget: at most one read pair per 5s tick', async () => {
    // Step 9 budget: the shared poller may issue the initial read plus one
    // pair per FLEET_POLL_MS tick — 13 pairs/minute foreground for every
    // mounted surface combined (previously 13 per surface).
    vi.useFakeTimers();
    render(
      <>
        <FleetProbe label="bar" />
        <FleetProbe label="widget" />
      </>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(getRunnerMonitor.mock.calls.length).toBeLessThanOrEqual(13);
    expect(getRunners.mock.calls.length).toBeLessThanOrEqual(13);
    expect(getRunnerMonitor.mock.calls.length).toBeGreaterThan(0);
  });

  test('background tabs pause fleet reads and catch up on return', async () => {
    vi.useFakeTimers();
    render(<FleetProbe label="bar" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getRunnerMonitor).toHaveBeenCalledTimes(1);
    setVisibility('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // A full backgrounded minute issues zero further fleet reads.
    expect(getRunnerMonitor).toHaveBeenCalledTimes(1);
    expect(getRunners).toHaveBeenCalledTimes(1);
    // Returning to the tab refreshes immediately (no waiting for the tick).
    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getRunnerMonitor).toHaveBeenCalledTimes(2);
  });
});
