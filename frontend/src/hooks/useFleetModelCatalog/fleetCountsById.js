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
    // Carry every WP-C field (declaredBy, claimedBy, verified, harness,
    // timestamps, provenance, lastServedAtMs, ...) through untouched so the
    // admin fleet-catalogue view and pickers can render them verbatim. Only
    // the four badge-critical lists are re-normalized; everything else passes
    // through (malformed entries already skipped above).
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
      // Drop `id`: the map is already keyed by id, and carrying it
      // in the value breaks deep-equal expectations and is redundant.
      ...(({ id: _id, ...rest }) => rest)(entry || {}),
      // Re-normalize after the spread so derived/validated shapes win over
      // any malformed raw values.
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
    };
  }
  return map;
}
