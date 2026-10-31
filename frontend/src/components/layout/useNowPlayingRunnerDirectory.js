import { useEffect, useState, useRef } from 'react';
import { api } from '../../services/api';

/***
 * MARK: useNowPlayingRunnerDirectory
 * @description Fleet roster behind the bar's runner boxes: the configured
 *   Runner list (GET /runners) plus live assignments (GET /runners/monitor)
 *   on the same 5s cadence as the observability widget. Tests (and any
 *   future context wiring) can inject per-piece `override` values to skip
 *   polling; each side polls only while its own override is undefined.
 *   Failures are best-effort: a missed list falls back to assignment-only
 *   boxes, a missed monitor to idle boxes, and both missed to the legacy
 *   single-task display.
 * @example useNowPlayingRunnerDirectory(undefined, []) => ({ assignments: [], runners: [] })
 ***/
export function useNowPlayingRunnerDirectory(assignmentsOverride, runnersOverride) {
  const [monitor, setMonitor] = useState(null);
  const [registry, setRegistry] = useState(null);
  // No-op polls skip the state update entirely — compared via ref so idle
  // polling never schedules a render (nor an act() warning in tests) every
  // 5s. The ref starts at the empty-roster key, so the first poll showing
  // "no assignments, registry unknown" is already a no-op.
  const keyRef = useRef(JSON.stringify([[], 'miss']));
  const pollAssignments = assignmentsOverride === undefined;
  const pollRunners = runnersOverride === undefined;
  useEffect(() => {
    if (!pollAssignments && !pollRunners) return undefined;
    let mounted = true;
    const load = async () => {
      try {
        const [m, list] = await Promise.all([
          pollAssignments ? api.getRunnerMonitor().catch(() => null) : Promise.resolve(null),
          pollRunners && typeof api.getRunners === 'function'
            ? api.getRunners().catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!mounted) return;
        const assignments = Array.isArray(m?.liveAssignments)
          ? m.liveAssignments.filter((a) => a && a.runnerId)
          : null;
        const key = JSON.stringify([
          assignments === null ? 'miss' : assignments.map((a) => a && a.runnerId),
          Array.isArray(list) ? list.map((r) => r && r.runnerId) : 'miss',
        ]);
        if (key === keyRef.current) return;
        keyRef.current = key;
        if (assignments !== null) setMonitor(m);
        if (Array.isArray(list)) setRegistry(list);
      } catch {
        // Best-effort: the last good roster stays until the next poll succeeds.
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [pollAssignments, pollRunners]);
  const assignments =
    assignmentsOverride !== undefined
      ? assignmentsOverride
      : Array.isArray(monitor?.liveAssignments)
        ? monitor.liveAssignments.filter((a) => a && a.runnerId)
        : [];
  const runners = runnersOverride !== undefined ? runnersOverride : registry;
  return { assignments, runners };
}
