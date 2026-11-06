import { expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskInspectorResize } from './useTaskInspectorResize';

beforeEach(() => {
  window.localStorage.clear();
});

test('defaults to 560 when preference missing', () => {
  const { result } = renderHook(() => useTaskInspectorResize({ uiPreferences: {}, updateUiPreference: vi.fn() }));
  expect(result.current.panelWidth).toBe(560);
});

test('ArrowLeft increases, ArrowRight decreases by 20 and clamps', () => {
  const updateUiPreference = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 560 }, updateUiPreference }),
  );

  act(() => {
    result.current.handleResizeKeyDown({ key: 'ArrowLeft', preventDefault: vi.fn() });
  });
  expect(result.current.panelWidth).toBe(580);
  expect(updateUiPreference).toHaveBeenLastCalledWith('taskInspectorWidth', 580);

  act(() => {
    result.current.handleResizeKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() });
  });
  expect(result.current.panelWidth).toBe(560);
});

test('drag updates width with leftward pointer movement', () => {
  const updateUiPreference = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 560 }, updateUiPreference }),
  );

  act(() => {
    result.current.handleResizeMouseDown({ clientX: 100, button: 0, preventDefault: vi.fn() });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 }));
  });
  // startWidth 560 + (100-60)=600
  expect(result.current.panelWidth).toBe(600);

  act(() => {
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 60 }));
  });
  expect(result.current.isDraggingInspector).toBe(false);
});

test('invalid preference falls back to default', () => {
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 'bad' }, updateUiPreference: vi.fn() }),
  );
  expect(result.current.panelWidth).toBe(560);
});

test('clamps to min/max', () => {
  const updateUiPreference = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 320 }, updateUiPreference }),
  );
  act(() => {
    result.current.handleResizeKeyDown({ key: 'ArrowRight', preventDefault: vi.fn() });
  });
  expect(result.current.panelWidth).toBe(320);
});

test('touch drag updates width with leftward movement and persists', () => {
  const updateUiPreference = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 560 }, updateUiPreference }),
  );

  act(() => {
    result.current.handleResizeTouchStart({
      touches: [{ clientX: 100 }],
      preventDefault: vi.fn(),
    });
    const move = new Event('touchmove');
    move.touches = [{ clientX: 60 }];
    window.dispatchEvent(move);
  });
  // startWidth 560 + (100-60) = 600
  expect(result.current.panelWidth).toBe(600);
  expect(updateUiPreference).toHaveBeenLastCalledWith('taskInspectorWidth', 600);

  act(() => {
    window.dispatchEvent(new Event('touchend'));
  });
  expect(result.current.isDraggingInspector).toBe(false);
});

test('touch start without touches is ignored', () => {
  const updateUiPreference = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 560 }, updateUiPreference }),
  );

  act(() => {
    result.current.handleResizeTouchStart({ touches: [], preventDefault: vi.fn() });
  });
  expect(result.current.isDraggingInspector).toBe(false);
  expect(updateUiPreference).not.toHaveBeenCalled();
});
