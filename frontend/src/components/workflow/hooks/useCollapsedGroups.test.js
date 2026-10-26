import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCollapsedGroups } from './useCollapsedGroups';

describe('useCollapsedGroups', () => {
  test('starts with empty set', () => {
    const { result } = renderHook(() => useCollapsedGroups());
    expect(result.current.expandedCollapsedGroups.size).toBe(0);
    expect(result.current.isGroupExpanded('g1')).toBe(false);
  });

  test('toggles group on then off', () => {
    const { result } = renderHook(() => useCollapsedGroups());
    act(() => {
      result.current.toggleCollapsedGroup('g1');
    });
    expect(result.current.expandedCollapsedGroups.has('g1')).toBe(true);
    expect(result.current.isGroupExpanded('g1')).toBe(true);
    act(() => {
      result.current.toggleCollapsedGroup('g1');
    });
    expect(result.current.expandedCollapsedGroups.has('g1')).toBe(false);
  });

  test('independent group ids', () => {
    const { result } = renderHook(() => useCollapsedGroups());
    act(() => {
      result.current.toggleCollapsedGroup('g1');
      result.current.toggleCollapsedGroup('g2');
    });
    expect(result.current.expandedCollapsedGroups.has('g1')).toBe(true);
    expect(result.current.expandedCollapsedGroups.has('g2')).toBe(true);
    expect(result.current.expandedCollapsedGroups.size).toBe(2);
  });

  test('toggle returns a new Set instance', () => {
    const { result } = renderHook(() => useCollapsedGroups());
    const before = result.current.expandedCollapsedGroups;
    act(() => {
      result.current.toggleCollapsedGroup('g1');
    });
    const after = result.current.expandedCollapsedGroups;
    expect(after).not.toBe(before);
  });
});
