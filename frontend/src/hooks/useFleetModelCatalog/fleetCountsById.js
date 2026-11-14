/***
 * MARK: fleetCountsById
 * @description Indexes a fleet catalogue payload by model id for option
 *   badges: `{ [id]: { runnerCount, runnerIds, harnesses, tiers, ... } }`.
 *   Every WP-C field (`declaredBy`, `claimedBy`, `verified`, `harness`,
 *   timestamps, provenance, the derived `available` verdict, ...) rides
 *   through untouched so pickers and the admin fleet-catalogue view render
 *   them verbatim; only the count and the four badge-critical lists are
 *   re-normalized (a hostile count badges an honest zero downstream).
 *   Malformed entries never crash a picker — they are skipped. The map is
 *   null-prototype: catalogue ids are arbitrary runner-advertised text, so
 *   `__proto__` must land as an own key, never as the map's prototype.
 * @example fleetCountsById({ models: [{ id: 'm', runnerCount: 2, runnerIds: ['r1', 'r2'] }] })
 *   => { m: { runnerCount: 2, runnerIds: ['r1', 'r2'], harnesses: [], tiers: [] } }
 * @param {Object} [payload] - `/runners/models/catalogue` response.
 * @returns {Object} Id-keyed availability map.
 ***/
export function fleetCountsById(payload) {
  const map = Object.create(null);
  const list = Array.isArray(payload?.models) ? payload.models : [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id || Object.hasOwn(map, id)) continue;
    // Drop `id` from the value: the map is already keyed by id.
    const { id: _droppedId, ...rest } = entry;
    const stringList = (value) =>
      Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
    // eslint-disable-next-line security/detect-object-injection -- id is a validated non-empty catalogue key into our own null-prototype map
    map[id] = {
      ...rest,
      runnerCount:
        typeof entry.runnerCount === 'number' && Number.isFinite(entry.runnerCount)
          ? Math.max(0, Math.floor(entry.runnerCount))
          : 0,
      runnerIds: stringList(entry.runnerIds),
      harnesses: stringList(entry.harnesses),
      tiers: stringList(entry.tiers),
    };
  }
  return map;
}
