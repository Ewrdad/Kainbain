/***
 * MARK: fleetCountsById
 * @description Indexes a fleet catalogue payload by model id for option
 *   badges: `{ [id]: { runnerCount, runnerIds, harnesses, tiers } }` plus
 *   the snapshot's explicit availability verdict (`available` /
 *   `unavailableReason`) when the backend served one — the safety-net
 *   merge re-attaches it so a stale entry badges Unavailable whichever
 *   merge path added the option. Malformed entries never crash a picker
 *   — they are skipped.
 * @example fleetCountsById({ models: [{ id: 'm', runnerCount: 2, runnerIds: ['r1', 'r2'] }] })
 *   => { m: { runnerCount: 2, runnerIds: ['r1', 'r2'], harnesses: [], tiers: [] } }
 * @param {Object} [payload] - `/runners/models/catalogue` response.
 * @returns {Object} Id-keyed availability map.
 ***/
export function fleetCountsById(payload) {
  const map = {};
  const list = Array.isArray(payload?.models) ? payload.models : [];
  for (const entry of list) {
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    if (!id || Object.hasOwn(map, id)) continue;
    map[id] = {
      runnerCount: typeof entry.runnerCount === 'number' ? entry.runnerCount : 0,
      runnerIds: Array.isArray(entry.runnerIds)
        ? entry.runnerIds.filter((r) => typeof r === 'string')
        : [],
      harnesses: Array.isArray(entry.harnesses)
        ? entry.harnesses.filter((h) => typeof h === 'string')
        : [],
      tiers: Array.isArray(entry.tiers)
        ? entry.tiers.filter((t) => typeof t === 'string')
        : [],
      // Entries from older backends (live derivation, no verdict) stay
      // verdict-free — pickers fall back to the count badges as before.
      ...(typeof entry?.available === 'boolean' ? { available: entry.available } : {}),
      ...(typeof entry?.unavailableReason === 'string' ? { unavailableReason: entry.unavailableReason } : {}),
    };
  }
  return map;
}
