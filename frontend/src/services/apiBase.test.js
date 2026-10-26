// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveApiBase,
  isLoopbackHost,
  resolveWsBase,
  pageHostname,
  pageProtocol,
} from './apiBase';

/***
 * MARK: apiBase tests
 * @description Covers the loopback self-heal (stale/dev bundle opened from a
 *   remote host rewrites to the serving host), the loopback table, the
 *   ws://->wss:// upgrade on https pages, and the window-location helpers.
 ***/

describe('isLoopbackHost', () => {
  it.each([
    ['localhost', true],
    ['127.0.0.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['100.104.3.73', false],
    ['kainbain.home', false],
    ['', false],
  ])('isLoopbackHost(%j) => %j', (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });
});

describe('resolveApiBase', () => {
  it('returns empty string for an empty configured base (same-origin build)', () => {
    expect(resolveApiBase('', '100.104.3.73')).toBe('');
    expect(resolveApiBase(undefined, '100.104.3.73')).toBe('');
  });

  it('keeps the configured base when the page host is missing or loopback', () => {
    expect(resolveApiBase('http://localhost:3100', '')).toBe('http://localhost:3100');
    expect(resolveApiBase('http://localhost:3100', undefined)).toBe('http://localhost:3100');
    expect(resolveApiBase('http://localhost:3100', 'localhost')).toBe('http://localhost:3100');
    expect(resolveApiBase('http://localhost:3100', '127.0.0.1')).toBe('http://localhost:3100');
  });

  it('rewrites a loopback base to the remote page host', () => {
    expect(resolveApiBase('http://localhost:3100', '100.104.3.73')).toBe(
      'http://100.104.3.73:3100',
    );
  });

  it('leaves a non-loopback base untouched', () => {
    expect(resolveApiBase('https://kainbain.home', '100.104.3.73')).toBe(
      'https://kainbain.home',
    );
  });

  it('passes an invalid URL through unchanged', () => {
    expect(resolveApiBase('not-a-url', '100.104.3.73')).toBe('not-a-url');
  });

  it('trims the trailing slash from the rewritten base', () => {
    expect(resolveApiBase('http://localhost:3100/', '100.104.3.73')).toBe(
      'http://100.104.3.73:3100',
    );
  });
});

describe('resolveWsBase', () => {
  it('returns empty string for an empty configured base', () => {
    expect(resolveWsBase('', '100.104.3.73', 'http:')).toBe('');
  });

  it('upgrades ws:// to wss:// when the page is https', () => {
    // Loopback self-heal runs first (localhost -> page host), then the upgrade.
    expect(resolveWsBase('ws://localhost:3100', 'example.com', 'https:')).toBe(
      'wss://example.com:3100',
    );
  });

  it('keeps ws:// when the page is plain http', () => {
    expect(resolveWsBase('ws://localhost:3100', '100.104.3.73', 'http:')).toBe(
      'ws://100.104.3.73:3100',
    );
  });

  it('leaves an already-secure wss:// base alone', () => {
    expect(resolveWsBase('wss://example.com:3100', 'other.com', 'https:')).toBe(
      'wss://example.com:3100',
    );
  });
});

describe('pageHostname / pageProtocol', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
    vi.unstubAllGlobals();
  });

  it('reads hostname and protocol from window.location', () => {
    vi.stubGlobal('window', { location: { hostname: 'example.com', protocol: 'https:' } });
    expect(pageHostname()).toBe('example.com');
    expect(pageProtocol()).toBe('https:');
  });

  it('returns empty strings when window is absent', () => {
    vi.stubGlobal('window', undefined);
    expect(pageHostname()).toBe('');
    expect(pageProtocol()).toBe('');
  });
});

describe('apiBase logging hygiene', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves bases without touching the console', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    resolveApiBase('http://localhost:3100', '100.104.3.73');
    resolveApiBase('not-a-url', '100.104.3.73');
    resolveWsBase('ws://localhost:3100', 'example.com', 'https:');
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
