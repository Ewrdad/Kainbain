import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  readCompactMonitorRequest,
  requestCompactMonitorView,
  clearCompactMonitorView,
  isNarrowViewport,
  useIsNarrowViewport,
  setNarrowViewportOverride,
} from './monitorCompact';
import '@testing-library/jest-dom';

beforeEach(() => {
  window.sessionStorage.clear();
  setNarrowViewportOverride(null);
  vi.restoreAllMocks();
});

afterEach(() => {
  setNarrowViewportOverride(null);
});

test('compact request flag round-trips through the tab session', () => {
  expect(readCompactMonitorRequest()).toBe(false);
  requestCompactMonitorView();
  expect(readCompactMonitorRequest()).toBe(true);
  clearCompactMonitorView();
  expect(readCompactMonitorRequest()).toBe(false);
});

test('compact request flag survives an unrelated session key', () => {
  window.sessionStorage.setItem('kainbain:other', 'x');
  expect(readCompactMonitorRequest()).toBe(false);
  requestCompactMonitorView();
  expect(window.sessionStorage.getItem('kainbain:other')).toBe('x');
});

test('narrow viewport detects phone widths via matchMedia', () => {
  const narrow = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const wide = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  expect(isNarrowViewport({ matchMedia: () => narrow })).toBe(true);
  expect(isNarrowViewport({ matchMedia: () => wide })).toBe(false);
});

test('narrow viewport falls back to full dashboard without matchMedia', () => {
  expect(isNarrowViewport({})).toBe(false);
  expect(isNarrowViewport(undefined)).toBe(false);
});

test('test override wins over matchMedia', () => {
  setNarrowViewportOverride(true);
  expect(isNarrowViewport({ matchMedia: () => ({ matches: false }) })).toBe(true);
  setNarrowViewportOverride(false);
  expect(isNarrowViewport({ matchMedia: () => ({ matches: true }) })).toBe(false);
});

test('hook follows live viewport changes', () => {
  let listener = null;
  const query = {
    matches: false,
    addEventListener: vi.fn((_, fn) => {
      listener = fn;
    }),
    removeEventListener: vi.fn(),
  };
  if (typeof window.matchMedia === 'function') {
    vi.spyOn(window, 'matchMedia').mockReturnValue(query);
  } else {
    window.matchMedia = () => query;
  }

  const { result, unmount } = renderHook(() => useIsNarrowViewport());
  expect(result.current).toBe(false);

  act(() => listener({ matches: true }));
  expect(result.current).toBe(true);

  unmount();
  expect(query.removeEventListener).toHaveBeenCalled();
});
