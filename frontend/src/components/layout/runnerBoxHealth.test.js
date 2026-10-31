// Run in the lighter node environment: pure logic, no DOM needs.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { runnerBoxHealth } from './runnerBoxHealth';

/***
 * MARK: runnerBoxHealth tests
 * @description Pins the heartbeat freshness behind each runner box dot,
 *   imported from its own module (not the NowPlayingBar barrel) so the
 *   extraction stays directly covered: live within 60s, stale after,
 *   unknown when the timestamp is missing or unparseable.
 ***/
describe('runnerBoxHealth', () => {
  it('reads a fresh heartbeat as live', () => {
    const nowMs = Date.now();
    expect(runnerBoxHealth(new Date(nowMs).toISOString(), nowMs)).toBe('live');
    expect(runnerBoxHealth(new Date(nowMs - 59999).toISOString(), nowMs)).toBe('live');
  });

  it('reads an old heartbeat as stale', () => {
    const nowMs = Date.now();
    expect(runnerBoxHealth(new Date(nowMs - 60001).toISOString(), nowMs)).toBe('stale');
    expect(runnerBoxHealth(new Date(nowMs - 3600000).toISOString(), nowMs)).toBe('stale');
  });

  it('stays unknown instead of alarming on bad input', () => {
    const nowMs = Date.now();
    expect(runnerBoxHealth(null, nowMs)).toBe('unknown');
    expect(runnerBoxHealth(undefined, nowMs)).toBe('unknown');
    expect(runnerBoxHealth('', nowMs)).toBe('unknown');
    expect(runnerBoxHealth('not-a-date', nowMs)).toBe('unknown');
  });
});
