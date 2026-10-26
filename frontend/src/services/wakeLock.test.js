import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { isWakeLockSupported, requestScreenWakeLock, releaseWakeLock } from './wakeLock';

function installWakeLockMock(overrides = {}) {
  const request = overrides.request ?? vi.fn().mockResolvedValue(makeSentinel());
  Object.defineProperty(window.navigator, 'wakeLock', {
    value: { request },
    configurable: true,
    writable: true,
  });
  return { request };
}

function removeWakeLockMock() {
  if ('wakeLock' in window.navigator) {
    delete window.navigator.wakeLock;
  }
}

function makeSentinel(overrides = {}) {
  return {
    released: false,
    release: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides,
  };
}

describe('wakeLock service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeWakeLockMock();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    removeWakeLockMock();
    vi.restoreAllMocks();
  });

  test('isWakeLockSupported is false without the API and true with it', () => {
    expect(isWakeLockSupported()).toBe(false);

    installWakeLockMock();
    expect(isWakeLockSupported()).toBe(true);
  });

  test('isWakeLockSupported is false when request is not a function', () => {
    Object.defineProperty(window.navigator, 'wakeLock', {
      value: {},
      configurable: true,
      writable: true,
    });
    expect(isWakeLockSupported()).toBe(false);
  });

  test('requestScreenWakeLock resolves the sentinel for a screen lock', async () => {
    const sentinel = makeSentinel();
    const { request } = installWakeLockMock({ request: vi.fn().mockResolvedValue(sentinel) });

    await expect(requestScreenWakeLock()).resolves.toBe(sentinel);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
  });

  test('requestScreenWakeLock returns null without the API and never throws', async () => {
    await expect(requestScreenWakeLock()).resolves.toBeNull();
  });

  test('requestScreenWakeLock returns null when the platform denies the request', async () => {
    installWakeLockMock({
      request: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
    });

    await expect(requestScreenWakeLock()).resolves.toBeNull();
  });

  test('releaseWakeLock releases a held sentinel', async () => {
    const sentinel = makeSentinel();

    await expect(releaseWakeLock(sentinel)).resolves.toBe(true);
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  test('releaseWakeLock is a no-op for null or already-released sentinels', async () => {
    await expect(releaseWakeLock(null)).resolves.toBe(false);
    await expect(releaseWakeLock(undefined)).resolves.toBe(false);

    const released = makeSentinel({ released: true });
    await expect(releaseWakeLock(released)).resolves.toBe(true);
    expect(released.release).not.toHaveBeenCalled();
  });

  test('releaseWakeLock never throws when release rejects', async () => {
    const sentinel = makeSentinel({
      release: vi.fn().mockRejectedValue(new Error('gone')),
    });

    await expect(releaseWakeLock(sentinel)).resolves.toBe(false);
  });
});
