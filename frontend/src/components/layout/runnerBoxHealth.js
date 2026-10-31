/***
 * MARK: runnerBoxHealth
 * @description Heartbeat freshness behind each runner box's colour dot. A
 *   Runner heartbeats every 15s, so anything seen within 60s counts as live
 *   (green). Older than that is stale (amber); a missing/unparseable
 *   timestamp stays grey (unknown) rather than alarming.
 * @example runnerBoxHealth(new Date().toISOString(), Date.now()) => 'live'
 ***/
export function runnerBoxHealth(lastSeenAt, nowMs) {
  const seen = Date.parse(lastSeenAt || '');
  if (!Number.isFinite(seen)) return 'unknown';
  return nowMs - seen <= 60000 ? 'live' : 'stale';
}
