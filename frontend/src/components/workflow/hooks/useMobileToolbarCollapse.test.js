import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useMobileToolbarCollapse,
  MOBILE_TOOLBAR_BREAKPOINT,
  MOBILE_TOOLBAR_COLLAPSE_EVENT,
} from './useMobileToolbarCollapse';

/***
 * MARK: useMobileToolbarCollapse tests
 * @description Colocated unit tests for the phone-only auto-collapsing
 *   toolbar state: scroll-down collapse thresholds, scroll-up/top expand,
 *   explicit expand/collapse, desktop fail-safe, and the cross-component
 *   collapse event contract shared with `Header`.
 ***/

function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new window.Event('resize'));
}

let originalInnerWidth;

beforeEach(() => {
  originalInnerWidth = window.innerWidth;
  setViewportWidth(390);
});

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: originalInnerWidth,
  });
  vi.unstubAllGlobals();
});

describe('useMobileToolbarCollapse', () => {
  test('starts expanded', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    expect(result.current.isCollapsed).toBe(false);
  });

  test('scrolling down past the threshold collapses', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(100);
    });
    expect(result.current.isCollapsed).toBe(true);
  });

  test('small scrolls near the top never collapse', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(20);
    });
    expect(result.current.isCollapsed).toBe(false);
    act(() => {
      result.current.handleScroll(30);
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('scrolling up past the delta re-expands', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(120);
    });
    expect(result.current.isCollapsed).toBe(true);
    act(() => {
      result.current.handleScroll(90);
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('returning to the top always re-expands', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(200);
    });
    expect(result.current.isCollapsed).toBe(true);
    act(() => {
      result.current.handleScroll(5);
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('tiny upward drifts while collapsed stay collapsed', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(120);
    });
    expect(result.current.isCollapsed).toBe(true);
    // 5px upward drift is below the expand delta: no flicker.
    act(() => {
      result.current.handleScroll(115);
    });
    expect(result.current.isCollapsed).toBe(true);
  });

  test('accepts a scroll event as well as a raw scrollTop', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll({ currentTarget: { scrollTop: 150 } });
    });
    expect(result.current.isCollapsed).toBe(true);
  });

  test('expand() resets to expanded', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(150);
    });
    expect(result.current.isCollapsed).toBe(true);
    act(() => {
      result.current.expand();
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('collapse() collapses on phones', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.collapse();
    });
    expect(result.current.isCollapsed).toBe(true);
  });

  test('desktop viewports never collapse', () => {
    setViewportWidth(1024);
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(500);
    });
    expect(result.current.isCollapsed).toBe(false);
    act(() => {
      result.current.collapse();
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('resizing to desktop clears a phone collapse', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(150);
    });
    expect(result.current.isCollapsed).toBe(true);
    act(() => {
      setViewportWidth(1280);
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('exposes the reduced-motion preference as a boolean', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    expect(typeof result.current.prefersReducedMotion).toBe('boolean');
  });

  test('collapse event contract carries a boolean detail', () => {
    expect(typeof MOBILE_TOOLBAR_COLLAPSE_EVENT).toBe('string');
    expect(MOBILE_TOOLBAR_COLLAPSE_EVENT.length).toBeGreaterThan(0);
    const seen = [];
    const listener = (event) => seen.push(event.detail);
    window.addEventListener(MOBILE_TOOLBAR_COLLAPSE_EVENT, listener);
    window.dispatchEvent(
      new window.CustomEvent(MOBILE_TOOLBAR_COLLAPSE_EVENT, { detail: { collapsed: true } }),
    );
    window.removeEventListener(MOBILE_TOOLBAR_COLLAPSE_EVENT, listener);
    expect(seen).toEqual([{ collapsed: true }]);
  });

  test('breakpoint matches the md (768px) responsive contract', () => {
    expect(MOBILE_TOOLBAR_BREAKPOINT).toBe(768);
  });

  test('negative scroll offsets (iOS bounce overscroll) are clamped to 0', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    // Pull-down bounce on iOS: scrollTop < 0
    act(() => {
      result.current.handleScroll(-50);
    });
    expect(result.current.isCollapsed).toBe(false);
    // Snapping back from bounce to 15: because -50 was clamped to 0, delta is 15 - 0 = 15 (< 24), no false collapse.
    act(() => {
      result.current.handleScroll(15);
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('invalid or non-finite scroll inputs are safely ignored without crashing', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(null);
      result.current.handleScroll(undefined);
      result.current.handleScroll(NaN);
      result.current.handleScroll('invalid');
      result.current.handleScroll({});
      result.current.handleScroll({ target: null });
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('orientationchange event clears collapse when switching to desktop', () => {
    const { result } = renderHook(() => useMobileToolbarCollapse());
    act(() => {
      result.current.handleScroll(150);
    });
    expect(result.current.isCollapsed).toBe(true);

    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 1024,
      });
      window.dispatchEvent(new window.Event('orientationchange'));
    });
    expect(result.current.isCollapsed).toBe(false);
  });

  test('matchMedia throwing or unavailable defaults prefersReducedMotion to false', () => {
    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = () => {
        throw new Error('Not supported');
      };
      const { result } = renderHook(() => useMobileToolbarCollapse());
      expect(result.current.prefersReducedMotion).toBe(false);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
