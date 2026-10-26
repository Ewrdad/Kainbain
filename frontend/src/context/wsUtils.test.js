// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  calculateBackoffWithJitter,
  compactArgsForLog,
  parseSystemToolInvocation,
} from './wsUtils';

/***
 * MARK: wsUtils tests
 * @description Pins the pure websocket helpers: backoff bounds, arg
 * compaction/truncation, and system tool-invocation parsing.
 ***/
describe('wsUtils', () => {
  it('calculateBackoffWithJitter stays within floor and jittered cap', () => {
    // The cap applies before ±20% jitter, so the ceiling is 1.2 * maxDelay.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const delay = calculateBackoffWithJitter(attempt, 500, 10000);
      expect(delay).toBeGreaterThanOrEqual(250);
      expect(delay).toBeLessThanOrEqual(12000);
    }
    expect(calculateBackoffWithJitter(10, 500, 10000)).toBeGreaterThanOrEqual(250);
  });

  it('compactArgsForLog stringifies and truncates', () => {
    expect(compactArgsForLog(null)).toBe('');
    expect(compactArgsForLog({ a: 1 })).toBe('{"a":1}');
    expect(compactArgsForLog('raw')).toBe('raw');
    const long = compactArgsForLog({ big: 'x'.repeat(500) });
    expect(long.length).toBeLessThan(200);
    expect(long.endsWith('…')).toBe(true);
  });

  it('compactArgsForLog collapses long tool-aware args to the primary argument', () => {
    const args = { command: 'npm run test:frontend', pad: 'x'.repeat(500) };
    expect(compactArgsForLog(args, 120, 'bash')).toBe('npm run test:frontend …');
    // Without a tool name the JSON head is truncated instead.
    expect(compactArgsForLog(args, 120)).toBe(
      `{"command":"npm run test:frontend","pad":"${'x'.repeat(77)}…`,
    );
  });

  it('parseSystemToolInvocation extracts name and parsed args', () => {
    expect(parseSystemToolInvocation('hello')).toBeNull();
    expect(parseSystemToolInvocation('[SYSTEM] Tool invocation: mytool')).toEqual({
      name: 'mytool',
      args: null,
    });
    expect(
      parseSystemToolInvocation('[SYSTEM] Tool invocation: mytool with arguments: {"a":1}'),
    ).toEqual({ name: 'mytool', args: { a: 1 } });
    // Malformed JSON keeps the raw string (never throws).
    const raw = parseSystemToolInvocation('[SYSTEM] Tool invocation: t with arguments: {{{');
    expect(raw.name).toBe('t');
    expect(typeof raw.args).toBe('string');
  });
});
