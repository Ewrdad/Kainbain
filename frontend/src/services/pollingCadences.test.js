import { describe, expect, test } from 'vitest';
import {
  ENGINE_QUEUE_SYNC_POLL_MS,
  FLEET_POLL_MS,
  INVALIDATION_DEBOUNCE_MS,
  QUEUE_POPUP_POLL_MS,
} from './pollingCadences';

/***
 * MARK: pollingCadences tests
 * @description Pins the freshness-budget invariants behind the live Now
 *   Playing bar (survey: near-live, 15–30s): every cadence is a usable
 *   positive interval (an unusable value would busy-loop or stall a
 *   poller), bursts collapse well inside one poll tick, and the safety
 *   nets stay inside the 15–30s freshness bound. Exact values stay in
 *   `pollingCadences.js` with their rationale; this file only guards the
 *   relationships that keep the bar live without hammering the server.
 ***/

describe('pollingCadences', () => {
  test('every cadence is a usable positive interval', () => {
    for (const cadence of [
      FLEET_POLL_MS,
      QUEUE_POPUP_POLL_MS,
      ENGINE_QUEUE_SYNC_POLL_MS,
      INVALIDATION_DEBOUNCE_MS,
    ]) {
      expect(Number.isFinite(cadence)).toBe(true);
      expect(cadence).toBeGreaterThan(0);
    }
  });

  test('a burst collapses into one read well inside a single poll tick', () => {
    expect(INVALIDATION_DEBOUNCE_MS).toBeLessThan(FLEET_POLL_MS);
    expect(INVALIDATION_DEBOUNCE_MS).toBeLessThan(QUEUE_POPUP_POLL_MS);
    expect(INVALIDATION_DEBOUNCE_MS).toBeLessThan(ENGINE_QUEUE_SYNC_POLL_MS);
  });

  test('foreground polls and safety nets stay inside the near-live bound', () => {
    // Survey q1 chose near-live (15–30s): nothing may poll slower than 30s
    // in the foreground, or the bar stops being a live monitor.
    for (const cadence of [FLEET_POLL_MS, QUEUE_POPUP_POLL_MS, ENGINE_QUEUE_SYNC_POLL_MS]) {
      expect(cadence).toBeLessThanOrEqual(30_000);
    }
  });
});
