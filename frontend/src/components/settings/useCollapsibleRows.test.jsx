import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { sanitizeRowCount, useCollapsibleRows } from './useCollapsibleRows';

/**
 * MARK: useCollapsibleRows tests
 * @description Verifies the reusable collapse-key hook behind the collapsible
 *   alias cards: stable per-instance keys, collapse state that follows keys
 *   (not indices) across add/delete, fail-safe counts, and instance
 *   isolation between two mounted sections.
 */

describe('sanitizeRowCount', () => {
  it('folds garbage counts to a safe empty state', () => {
    expect(sanitizeRowCount(null)).toBe(0);
    expect(sanitizeRowCount(undefined)).toBe(0);
    expect(sanitizeRowCount(NaN)).toBe(0);
    expect(sanitizeRowCount(-3)).toBe(0);
    expect(sanitizeRowCount('3')).toBe(0);
    expect(sanitizeRowCount(Infinity)).toBe(0);
  });

  it('keeps valid counts, flooring fractions', () => {
    expect(sanitizeRowCount(0)).toBe(0);
    expect(sanitizeRowCount(2)).toBe(2);
    expect(sanitizeRowCount(2.7)).toBe(2);
  });
});

describe('useCollapsibleRows', () => {
  it('starts expanded with stable keys across rerenders', () => {
    const { result, rerender } = renderHook(({ count }) => useCollapsibleRows(count), {
      initialProps: { count: 2 },
    });
    const first = result.current.keys;
    expect(first).toHaveLength(2);
    expect(new Set(first).size).toBe(2);
    expect(result.current.allCollapsed).toBe(false);

    rerender({ count: 2 });
    expect(result.current.keys).toEqual(first);
    expect(result.current.isCollapsed(first[0])).toBe(false);
  });

  it('toggles one row without touching its neighbours', () => {
    const { result } = renderHook(() => useCollapsibleRows(3));
    const [a, b, c] = result.current.keys;

    act(() => result.current.toggle(b));
    expect(result.current.isCollapsed(a)).toBe(false);
    expect(result.current.isCollapsed(b)).toBe(true);
    expect(result.current.isCollapsed(c)).toBe(false);

    act(() => result.current.toggle(b));
    expect(result.current.isCollapsed(b)).toBe(false);
  });

  it('collapses and expands all rows', () => {
    const { result } = renderHook(() => useCollapsibleRows(2));

    act(() => result.current.collapseAll());
    expect(result.current.allCollapsed).toBe(true);
    expect(result.current.keys.every((k) => result.current.isCollapsed(k))).toBe(true);

    act(() => result.current.expandAll());
    expect(result.current.allCollapsed).toBe(false);
    expect(result.current.keys.some((k) => result.current.isCollapsed(k))).toBe(false);
  });

  it('reports allCollapsed false for an empty list', () => {
    const { result } = renderHook(() => useCollapsibleRows(0));
    expect(result.current.keys).toEqual([]);
    expect(result.current.allCollapsed).toBe(false);
  });

  it('new keys start expanded and keep existing collapse state', () => {
    const { result, rerender } = renderHook(({ count }) => useCollapsibleRows(count), {
      initialProps: { count: 1 },
    });
    const [first] = result.current.keys;
    act(() => result.current.toggle(first));
    expect(result.current.isCollapsed(first)).toBe(true);

    act(() => result.current.addRowKey());
    rerender({ count: 2 });
    expect(result.current.keys).toHaveLength(2);
    expect(result.current.keys[0]).toBe(first);
    expect(result.current.isCollapsed(first)).toBe(true);
    expect(result.current.isCollapsed(result.current.keys[1])).toBe(false);
  });

  it('deleting a row keeps collapse state on the surviving rows', () => {
    const { result, rerender } = renderHook(({ count }) => useCollapsibleRows(count), {
      initialProps: { count: 3 },
    });
    const [, b, c] = result.current.keys;
    act(() => result.current.toggle(b));

    act(() => result.current.removeRowKeyAt(0));
    rerender({ count: 2 });
    // b (collapsed) and c (expanded) slide to positions 0 and 1.
    expect(result.current.keys).toEqual([b, c]);
    expect(result.current.isCollapsed(b)).toBe(true);
    expect(result.current.isCollapsed(c)).toBe(false);
  });

  it('reconciles externally replaced arrays (discard/reset) without crashing', () => {
    const { result, rerender } = renderHook(({ count }) => useCollapsibleRows(count), {
      initialProps: { count: 1 },
    });
    act(() => result.current.toggle(result.current.keys[0]));

    // Parent swaps in three brand-new rows at once.
    rerender({ count: 3 });
    expect(result.current.keys).toHaveLength(3);
    expect(new Set(result.current.keys).size).toBe(3);

    // Parent drops back to one row: stale collapsed entries are pruned.
    rerender({ count: 1 });
    expect(result.current.keys).toHaveLength(1);
  });

  it('ignores out-of-range deletes and unknown toggles (fail-safe)', () => {
    const { result } = renderHook(() => useCollapsibleRows(2));
    const before = result.current.keys;

    act(() => result.current.removeRowKeyAt(-1));
    act(() => result.current.removeRowKeyAt(99));
    act(() => result.current.toggle('row-that-never-existed'));
    expect(result.current.keys).toEqual(before);
    for (const key of result.current.keys) {
      expect(result.current.isCollapsed(key)).toBe(false);
    }
    // The unknown toggle must not pollute the collapsed set: collapse-all
    // still covers exactly the live rows, with no stale entry leaking in.
    act(() => result.current.collapseAll());
    expect(result.current.allCollapsed).toBe(true);
    expect(result.current.isCollapsed('row-that-never-existed')).toBe(false);
  });

  it('keeps two mounted instances fully isolated', () => {
    const first = renderHook(() => useCollapsibleRows(2));
    const second = renderHook(() => useCollapsibleRows(2));
    const keysA = first.result.current.keys;
    const keysB = second.result.current.keys;
    expect(keysA).not.toEqual(keysB);

    act(() => first.result.current.toggle(keysA[0]));
    expect(first.result.current.isCollapsed(keysA[0])).toBe(true);
    expect(second.result.current.isCollapsed(keysB[0])).toBe(false);
  });
});

describe('useCollapsibleRows startCollapsed', () => {
  it('initialises every row collapsed when startCollapsed is set', () => {
    const { result } = renderHook(() => useCollapsibleRows(2, { startCollapsed: true }));
    expect(result.current.keys).toHaveLength(2);
    expect(result.current.allCollapsed).toBe(true);
    for (const key of result.current.keys) {
      expect(result.current.isCollapsed(key)).toBe(true);
    }
  });

  it('reports allCollapsed true with a single collapsed row', () => {
    const { result } = renderHook(() => useCollapsibleRows(1, { startCollapsed: true }));
    expect(result.current.allCollapsed).toBe(true);
  });

  it('expandAll recovers from a collapsed start', () => {
    const { result } = renderHook(() => useCollapsibleRows(2, { startCollapsed: true }));
    act(() => result.current.expandAll());
    expect(result.current.allCollapsed).toBe(false);
    expect(result.current.keys.some((k) => result.current.isCollapsed(k))).toBe(false);
  });

  it('addRowKey still starts expanded when startCollapsed is set', () => {
    const { result, rerender } = renderHook(({ count }) => useCollapsibleRows(count, { startCollapsed: true }), {
      initialProps: { count: 1 },
    });
    expect(result.current.isCollapsed(result.current.keys[0])).toBe(true);
    act(() => result.current.addRowKey());
    rerender({ count: 2 });
    const keys = result.current.keys;
    expect(keys).toHaveLength(2);
    expect(result.current.isCollapsed(keys[0])).toBe(true);
    expect(result.current.isCollapsed(keys[1])).toBe(false);
  });

  it('reconciles externally added rows collapsed', () => {
    const { result, rerender } = renderHook(({ count }) => useCollapsibleRows(count, { startCollapsed: true }), {
      initialProps: { count: 1 },
    });
    rerender({ count: 3 });
    expect(result.current.keys).toHaveLength(3);
    for (const key of result.current.keys) {
      expect(result.current.isCollapsed(key)).toBe(true);
    }
  });

  it('collapses later external growth even after an internal add (no reservation leak)', () => {
    // Regression: the in-flight reservation for an internally added row must
    // clear once counts catch up — otherwise a later discard/reset that
    // grows the list would wrongly leave its first new row expanded.
    const { result, rerender } = renderHook(({ count }) => useCollapsibleRows(count, { startCollapsed: true }), {
      initialProps: { count: 1 },
    });
    act(() => result.current.addRowKey());
    rerender({ count: 2 });
    expect(result.current.keys).toHaveLength(2);
    expect(result.current.isCollapsed(result.current.keys[1])).toBe(false);

    // External growth (discard/reset with more rows): every minted row
    // collapses; the earlier internal row keeps its expanded state.
    rerender({ count: 4 });
    expect(result.current.keys).toHaveLength(4);
    expect(result.current.isCollapsed(result.current.keys[0])).toBe(true);
    expect(result.current.isCollapsed(result.current.keys[1])).toBe(false);
    expect(result.current.isCollapsed(result.current.keys[2])).toBe(true);
    expect(result.current.isCollapsed(result.current.keys[3])).toBe(true);
  });

  it('prunes stale collapsed entries on shrink', () => {
    const { result, rerender } = renderHook(({ count }) => useCollapsibleRows(count, { startCollapsed: true }), {
      initialProps: { count: 2 },
    });
    const first = result.current.keys[0];
    act(() => result.current.toggle(first)); // expand first
    rerender({ count: 1 });
    expect(result.current.keys).toHaveLength(1);
    expect(result.current.isCollapsed(result.current.keys[0])).toBe(false);
  });

  it('accepts boolean true directly as the options parameter', () => {
    const { result } = renderHook(() => useCollapsibleRows(2, true));
    expect(result.current.keys).toHaveLength(2);
    expect(result.current.allCollapsed).toBe(true);
    for (const key of result.current.keys) {
      expect(result.current.isCollapsed(key)).toBe(true);
    }
  });

  it('accepts boolean false directly and keeps rows expanded', () => {
    const { result } = renderHook(() => useCollapsibleRows(2, false));
    expect(result.current.keys).toHaveLength(2);
    expect(result.current.allCollapsed).toBe(false);
    for (const key of result.current.keys) {
      expect(result.current.isCollapsed(key)).toBe(false);
    }
  });
});
