import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { FLEET_POLL_MS } from '../services/pollingCadences.js';
import { isTabVisible, subscribeTabVisible } from '../services/tabVisibility.js';

/***
 * MARK: orderKeyValue
 * @description Sorts an object into key order (recursively) so the fleet
 *   content key below never flaps when the backend serialises the same
 *   nested object (`serving`, `capabilities`) with a different key order.
 *   Arrays keep their order — assignment order is normalised by the runner
 *   sort instead, because fleet order carries no meaning. Cyclical input
 *   keys as `'[cycle]'` at the loop so the builder stays total (it never
 *   throws, whatever shape it is handed).
 * @example orderKeyValue({ b: 1, a: 2 }) => [['a', 2], ['b', 1]]
 ***/
const orderKeyValue = (value, seen = new Set()) => {
  if (Array.isArray(value)) return value.map((entry) => orderKeyValue(entry, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[cycle]';
    seen.add(value);
    const ordered = Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, orderKeyValue(entry, seen)]);
    seen.delete(value);
    return ordered;
  }
  return value ?? null;
};

/***
 * MARK: buildFleetSnapshotKey
 * @description Content key for one fleet read: the monitor's live
 *   assignments plus the registry list, normalised to the fields fleet
 *   surfaces render and sorted by runner id so a reorder-only response
 *   never republishes. Every rendered field is covered (task, stage,
 *   paused, heartbeat, serving identity on assignments; status, paused,
 *   heartbeat, capabilities on registry records) so a stage switch with
 *   an unchanged roster still changes the key — the ids-only key this
 *   replaces is why runner boxes needed a full page refresh to move
 *   stage. Nested objects key in sorted key order, so a backend that
 *   reorders `serving`/`capabilities` keys does not republish every tick.
 *   Missed reads (`null`) key as `'miss'`, never as empty, so a miss
 *   cannot wipe the last-good picture. The monitor's volatile siblings
 *   (scheduler/integration counters, prompts) are excluded: they change
 *   outside the rendered fleet and would republish every tick.
 * @example const before = buildFleetSnapshotKey({ monitor: { liveAssignments: [{ runnerId: 'r1', stageId: 's1' }] }, registryList: [] })
 * @example const after = buildFleetSnapshotKey({ monitor: { liveAssignments: [{ runnerId: 'r1', stageId: 's2' }] }, registryList: [] })
 * @example before !== after // => true: the stage switch changes the key
 * @param {Object} [fleetRead] - Named inputs.
 * @param {Object|null} [fleetRead.monitor] - The `GET /runners/monitor` payload (null on miss).
 * @param {Array|null} [fleetRead.registryList] - The `GET /runners` payload (null on miss).
 * @returns {string} The stable content key.
 ***/
export const buildFleetSnapshotKey = ({ monitor, registryList } = {}) => {
  const rawAssignments = Array.isArray(monitor?.liveAssignments)
    ? monitor.liveAssignments
    : null;
  const assignments =
    rawAssignments === null
      ? 'miss'
      : rawAssignments
          .filter((a) => a && a.runnerId != null)
          .map((a) => [
            a.runnerId,
            a.projectId ?? null,
            a.taskId ?? null,
            a.executionId ?? null,
            a.epoch ?? null,
            a.startedAt ?? null,
            a.stageId ?? null,
            a.stageName ?? null,
            a.taskTitle ?? null,
            a.taskGoal ?? null,
            a.taskStatus ?? null,
            a.projectName ?? null,
            a.workflowId ?? null,
            a.workflowName ?? null,
            a.paused ?? null,
            a.lastSeenAt ?? null,
            a.serving ?? null,
          ])
          .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  const registry =
    registryList === null || registryList === undefined
      ? 'miss'
      : (Array.isArray(registryList) ? registryList : [])
          .filter((r) => r && r.runnerId != null)
          .map((r) => [
            r.runnerId,
            r.status ?? null,
            r.paused ?? null,
            r.lastSeenAt ?? null,
            r.displayName ?? null,
            r.capabilities ?? null,
          ])
          .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  return JSON.stringify(orderKeyValue([assignments, registry]));
};

// Module-level shared poller: every mounted fleet surface (the Now Playing
// bar, the per-runner widget, the mobile header) subscribes here, so one
// tick issues exactly one fleet read no matter how many surfaces mount.
// The snapshot lives only while at least one subscriber exists — the last
// unsubscribe clears it, so a later mount (or a later test) always starts
// from an honest empty state instead of a stale picture.
const subscribers = new Map();
let nextSubscriberId = 1;
let fleetTimer = null;
let fleetVisibilityStop = null;
let fleetInFlight = null;
let fleetKey = null;
let lastGoodMonitor = null;
let lastGoodRegistryList = null;

/***
 * MARK: readFleetNeeds
 * @description Reads what the mounted fleet surfaces currently need: which
 *   sides to fetch (a surface that injects an override skips that side's
 *   reads) and the shared tick cadence. The tick runs at the fastest
 *   request so the hungriest surface stays fresh; an empty room falls back
 *   to the default cadence (callers stop the timer when nothing is needed,
 *   so that value only ever seeds the next subscription).
 * @example readFleetNeeds() => { needsMonitor: true, needsRegistry: true, pollMs: 5000 }
 ***/
const readFleetNeeds = () => {
  let needsMonitor = false;
  let needsRegistry = false;
  let pollMs = Infinity;
  for (const sub of subscribers.values()) {
    needsMonitor = needsMonitor || sub.needsMonitor;
    needsRegistry = needsRegistry || sub.needsRegistry;
    if (Number.isFinite(sub.pollMs) && sub.pollMs > 0 && sub.pollMs < pollMs) {
      pollMs = sub.pollMs;
    }
  }
  return {
    needsMonitor,
    needsRegistry,
    pollMs: Number.isFinite(pollMs) ? pollMs : FLEET_POLL_MS,
  };
};

/***
 * MARK: stopFleetTimer
 * @description Stops the shared tick and its tab-return catch-up listener.
 *   Safe to call when nothing runs (unsubscribe paths call it blindly).
 * @example stopFleetTimer() => undefined
 ***/
const stopFleetTimer = () => {
  if (fleetTimer) {
    clearInterval(fleetTimer);
    fleetTimer = null;
  }
  if (fleetVisibilityStop) {
    fleetVisibilityStop();
    fleetVisibilityStop = null;
  }
};

/***
 * MARK: readFleetSide
 * @description One read of one fleet side (`monitor` or `registry`).
 *   Missing endpoint methods (old backends), rejected reads, and
 *   synchronously throwing clients all land as a miss (null) — never a
 *   throw — so a fleet outage degrades to the last-good picture (or
 *   honest empty before the first success) instead of crashing the bar.
 * @example readFleetSide('monitor') => { liveAssignments: [...] } (or null on a miss)
 ***/
const readFleetSide = async (kind) => {
  try {
    if (kind === 'monitor') {
      if (typeof api.getRunnerMonitor !== 'function') return null;
      return await api.getRunnerMonitor();
    }
    if (typeof api.getRunners !== 'function') return null;
    return await api.getRunners();
  } catch {
    return null;
  }
};

/***
 * MARK: isMonitorSuccess / isRegistrySuccess
 * @description Miss detectors for one fleet side. Any non-null monitor
 *   payload counts (even a half-shaped one — the key builder and the hook
 *   filter defensively downstream); only a real array counts for the
 *   registry, so a malformed list never wipes the last-good roster.
 * @example isRegistrySuccess(null) => false
 ***/
const isMonitorSuccess = (m) => m !== null && m !== undefined;
const isRegistrySuccess = (list) => Array.isArray(list);

/***
 * MARK: publishFleetSnapshot
 * @description Republishes the last-good fleet picture to every subscriber
 *   — but only when the content key moved, so an identical poll schedules
 *   no render anywhere (the `act()`-warning protection). One throwing
 *   listener never blocks the rest of the fleet.
 * @example publishFleetSnapshot() => undefined
 ***/
const publishFleetSnapshot = () => {
  const key = buildFleetSnapshotKey({
    monitor: lastGoodMonitor,
    registryList: lastGoodRegistryList,
  });
  if (key === fleetKey) return;
  fleetKey = key;
  const snapshot = { monitor: lastGoodMonitor, registryList: lastGoodRegistryList };
  for (const sub of subscribers.values()) {
    try {
      sub.notify(snapshot);
    } catch {
      // One bad listener never blocks the rest of the fleet.
    }
  }
};

/***
 * MARK: loadFleet
 * @description Issues one shared fleet read (in-flight sharing: concurrent
 *   callers await the same promise, so a tick racing a fresh mount never
 *   double-fetches). Only the sides some subscriber needs are read; each
 *   side updates on success only, so a miss leaves the last-good picture
 *   untouched instead of strobing the bar. A read that lands after the
 *   last unsubscribe is dropped, never published into an unowned store.
 * @example loadFleet() => Promise<{ monitor, registryList }>
 ***/
const loadFleet = () => {
  if (fleetInFlight) return fleetInFlight;
  const { needsMonitor, needsRegistry } = readFleetNeeds();
  if (!needsMonitor && !needsRegistry) return Promise.resolve(null);
  fleetInFlight = (async () => {
    try {
      const [monitor, registryList] = await Promise.all([
        needsMonitor ? readFleetSide('monitor') : Promise.resolve(undefined),
        needsRegistry ? readFleetSide('registry') : Promise.resolve(undefined),
      ]);
      // Unmounted mid-flight (or a test torn down): drop the read instead
      // of publishing into a store nobody owns.
      if (subscribers.size === 0) return null;
      // Last-good sides: a miss leaves that side untouched, so a flapping
      // endpoint keeps the last picture instead of strobing the bar.
      if (monitor !== undefined && isMonitorSuccess(monitor)) lastGoodMonitor = monitor;
      if (registryList !== undefined && isRegistrySuccess(registryList)) {
        lastGoodRegistryList = registryList;
      }
      publishFleetSnapshot();
      return { monitor: lastGoodMonitor, registryList: lastGoodRegistryList };
    } finally {
      fleetInFlight = null;
    }
  })();
  return fleetInFlight;
};

/***
 * MARK: restartFleetTimer
 * @description Rebuilds the shared tick from the current subscriber needs
 *   (sides + fastest cadence). Ticks skip their read while the tab is
 *   hidden; the tab-return catch-up refreshes immediately, so a hidden tab
 *   issues zero fleet reads. Restarts on every subscribe/unsubscribe so a
 *   new surface's needs take effect at once (at most one timer ever runs).
 * @example restartFleetTimer() => undefined
 ***/
const restartFleetTimer = () => {
  stopFleetTimer();
  const { needsMonitor, needsRegistry, pollMs } = readFleetNeeds();
  if (!needsMonitor && !needsRegistry) return;
  fleetTimer = setInterval(() => {
    // Background tabs pause (survey q4); the catch-up below refreshes on
    // return, so a hidden tab issues zero fleet reads.
    if (!isTabVisible()) return;
    void loadFleet();
  }, pollMs);
  fleetVisibilityStop = subscribeTabVisible(() => {
    void loadFleet();
  });
};

/***
 * MARK: subscribeFleet
 * @description Adds one fleet surface to the shared poller and returns its
 *   unsubscribe. A newly mounted surface renders the live picture at once
 *   (no waiting a full cadence) and then shares the next fresh read
 *   in-flight. The last unsubscribe stops the timer and clears the
 *   snapshot, so a later mount always starts from honest empty.
 * @example const stop = subscribeFleet({ notify: render, pollMs: 5000, needsMonitor: true, needsRegistry: true })
 ***/
const subscribeFleet = ({ notify, pollMs, needsMonitor, needsRegistry }) => {
  const id = nextSubscriberId++;
  subscribers.set(id, { notify, pollMs, needsMonitor, needsRegistry });
  restartFleetTimer();
  // A newly mounted surface renders the live picture immediately instead
  // of waiting a full cadence; the fresh read below then follows (shared
  // in-flight with any running tick, so it never double-fetches).
  if (fleetKey !== null) {
    try {
      notify({ monitor: lastGoodMonitor, registryList: lastGoodRegistryList });
    } catch {
      // A throwing first listener still gets the fresh read below.
    }
  }
  void loadFleet();
  return () => {
    subscribers.delete(id);
    if (subscribers.size === 0) {
      stopFleetTimer();
      fleetKey = null;
      lastGoodMonitor = null;
      lastGoodRegistryList = null;
    } else {
      restartFleetTimer();
    }
  };
};

/***
 * MARK: useFleetDirectory
 * @description The single fleet roster behind every fleet surface (the Now
 *   Playing bar's runner boxes, the per-runner observability widget, the
 *   mobile header). All mounted instances share one module-level poller —
 *   one tick issues exactly one `GET /runners/monitor` + `GET /runners`
 *   pair no matter how many surfaces mount — with in-flight sharing,
 *   last-good sides on misses, and publish-only-on-content-change (an
 *   identical poll schedules no render anywhere). Polling pauses while
 *   the tab is hidden and catches up on return. Tests (and override
 *   callers like the mobile header) inject per-piece overrides to skip
 *   that side's reads; `enabled: false` skips the subscription entirely.
 *   An unusable `pollMs` (zero, negative, non-numeric) falls back to the
 *   5s default so the hook can never busy-loop the fleet endpoints.
 *   How it fails: endpoint outages, old backends without the fleet
 *   methods, and malformed payloads all degrade to the last-good picture
 *   (honest empty before the first success) — the hook never throws, and
 *   the next successful tick repairs the picture on its own.
 * @example const { assignments, runners } = useFleetDirectory({});
 * @param {Object} [opts]
 * @param {number} [opts.pollMs=5000] - Requested cadence (the shared tick uses the fastest request).
 * @param {boolean} [opts.enabled=true] - False skips the subscription entirely.
 * @param {Array} [opts.assignmentsOverride] - Injected assignments (skips the monitor side).
 * @param {Array} [opts.runnersOverride] - Injected registry list (skips the registry side).
 * @returns {{ assignments: Array, runners: Array|null, scheduler: Object|null }} The fleet picture.
 ***/
export const useFleetDirectory = ({
  pollMs = FLEET_POLL_MS,
  enabled = true,
  assignmentsOverride,
  runnersOverride,
} = {}) => {
  const [monitor, setMonitor] = useState(null);
  const [registryList, setRegistryList] = useState(null);
  const needsMonitor = enabled && assignmentsOverride === undefined;
  const needsRegistry = enabled && runnersOverride === undefined;
  // A zero or non-numeric interval would busy-loop the fleet endpoints
  // (`setInterval` treats NaN as 0), so unusable values fall back to the
  // default cadence and the fleet keeps updating instead of hammering.
  const safePollMs = Number.isFinite(pollMs) && pollMs > 0 ? pollMs : FLEET_POLL_MS;

  useEffect(() => {
    if (!needsMonitor && !needsRegistry) return undefined;
    return subscribeFleet({
      notify: (snapshot) => {
        if (needsMonitor) setMonitor(snapshot.monitor);
        if (needsRegistry) setRegistryList(snapshot.registryList);
      },
      pollMs: safePollMs,
      needsMonitor,
      needsRegistry,
    });
  }, [needsMonitor, needsRegistry, safePollMs]);

  const assignments =
    assignmentsOverride !== undefined
      ? assignmentsOverride
      : Array.isArray(monitor?.liveAssignments)
        ? monitor.liveAssignments.filter((a) => a && a.runnerId)
        : [];
  const runners = runnersOverride !== undefined ? runnersOverride : registryList;
  const scheduler = monitor?.scheduler || null;
  return { assignments, runners, scheduler };
};
