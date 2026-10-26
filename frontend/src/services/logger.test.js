// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger';

/***
 * MARK: logger tests
 * @description Verifies each level delegates to the matching console method
 *   with the `[kainbain]` prefix first, forwarding all extra arguments.
 ***/

describe('logger', () => {
  let info;
  let warn;
  let error;

  beforeEach(() => {
    info = vi.spyOn(console, 'info').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info forwards to console.info with the prefix', () => {
    logger.info('hello', { a: 1 });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('[kainbain]', 'hello', { a: 1 });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('warn forwards to console.warn with the prefix', () => {
    logger.warn('careful');
    expect(warn).toHaveBeenCalledWith('[kainbain]', 'careful');
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('error forwards to console.error with the prefix', () => {
    const err = new Error('boom');
    logger.error('failed', err);
    expect(error).toHaveBeenCalledWith('[kainbain]', 'failed', err);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('passes through with no extra args', () => {
    logger.info();
    expect(info).toHaveBeenCalledWith('[kainbain]');
  });
});
