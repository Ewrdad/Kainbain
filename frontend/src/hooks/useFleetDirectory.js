import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { FLEET_POLL_MS } from '../services/pollingCadences.js';
import { isTabVisible, subscribeTabVisible } from '../services/tabVisibility.js';

/***
 * MARK: fleetSnapshotKey
 * @description Content key for one fleet read: the monitor's live
 *   assignments plus the registry list, normalised to the fields fleet
 *   surfaces render and sorted by runner id so a reorder-only response
 *   never republishes. Every rendered field is covered (task, stage,
 *   paused, heartbeat, serving identity on assignments; status, paused,
 *   heartbeat, capabilities on registry records) so a stage switch with
 *   an unchanged roster still changes the key — the ids-only key this
 *   replaces is why runner boxes needed a full page refresh to move
 *   stage. Missed reads (`null`) key as `'miss'`, never as empty, so a
 *   miss cannot wipe the last-good picture. The monitor's volatile
 *   siblings (scheduler/integration counters, prompts) are excluded: they
 *   change outside the rendered fleet and would republish every tick.
 * @example fleetSnapshotKey({ liveAssignments: [{ runnerId: 'r1', taskId: 't1', stageId: 's1' }] }, []) => '[{"a":[["r1",...]]},...]'
 * @param {Object|null} [monitor] - The `GET /runners/monitor` payload (null on miss).
 * @param {Array|null} [registryList] - The `GET /runners` payload (null on miss).
 * @returns {string} The stable content key.
 ***/
export const fleetSnapshotKey = (monitor, registryList) => {
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
  return JSON.stringify([assignments, registry]);
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

const fleetNeeds = () => {
  let needsMonitor = false;
  let needsRegistry = false;
  let pollMs = FLEET_POLL_MS;
  for (const sub of subscribers.values()) {
    needsMonitor = needsMonitor || sub.needsMonitor;
    needsRegistry = needsRegistry || sub.needsRegistry;
    if (Number.isFinite(sub.pollMs) && sub.pollMs > 0 && sub.pollMs < pollMs) {
      pollMs = sub.pollMs;
    }
  }
  return { needsMonitor, needsRegistry, pollMs };
};

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

// One read of one fleet side. Missing endpoint methods (old backends),
// rejected reads, and synchronously throwing clients all land as a miss
// (null) — never a throw — so a fleet outage degrades to the last-good
// picture (or honest empty before the first success) instead of crashing
// the bar.
const readFleetSide = async (kind) => {
  try {
    if (kind === 'monitor') {
      if (typeof api.getRunnerMonitor !== 'function') return null;
      return await api.getRunnerMonitor().catch(() => null);
    }
    if (typeof api.getRunners !== 'function') return null;
    return await api.getRunners().catch(() => null);
  } catch {
    return null;
  }
};

const isMonitorSuccess = (m) => m !== null && m !== undefined;
const isRegistrySuccess = (list) => Array.isArray(list);

const publishFleetSnapshot = () => {
  const key = fleetSnapshotKey(lastGoodMonitor, lastGoodRegistryList);
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

const loadFleet = () => {
  if (fleetInFlight) return fleetInFlight;
  const { needsMonitor, needsRegistry } = fleetNeeds();
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

const restartFleetTimer = () => {
  stopFleetTimer();
  const { needsMonitor, needsRegistry, pollMs } = fleetNeeds();
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
