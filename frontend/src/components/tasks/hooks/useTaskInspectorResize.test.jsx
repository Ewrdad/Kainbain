import { expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTaskInspectorResize,
  getTaskInspectorDynamicMax,
  DEFAULT_TASK_INSPECTOR_WIDTH,
} from './useTaskInspectorResize';

beforeEach(() => {
  window.localStorage.clear();
});

test('defaults to 560 when preference missing', () => {
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: {}, updateUiPreference: vi.fn() }),
  );
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
    useTaskInspectorResize({
      uiPreferences: { taskInspectorWidth: 'bad' },
      updateUiPreference: vi.fn(),
    }),
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

test('ignores non-primary mouse buttons', () => {
  const updateUiPreference = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 560 }, updateUiPreference }),
  );
  act(() => {
    result.current.handleResizeMouseDown({ clientX: 100, button: 2, preventDefault: vi.fn() });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }));
  });
  expect(result.current.isDraggingInspector).toBe(false);
  expect(result.current.panelWidth).toBe(560);
  expect(updateUiPreference).not.toHaveBeenCalled();
});

test('double-click resets to the default width and persists it', () => {
  const updateUiPreference = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 900 }, updateUiPreference }),
  );
  act(() => {
    result.current.handleResizeDoubleClick();
  });
  expect(result.current.panelWidth).toBe(DEFAULT_TASK_INSPECTOR_WIDTH);
  expect(updateUiPreference).toHaveBeenLastCalledWith('taskInspectorWidth', 560);
});

test('unrelated keys are ignored and not prevented', () => {
  const updateUiPreference = vi.fn();
  const preventDefault = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 560 }, updateUiPreference }),
  );
  act(() => {
    result.current.handleResizeKeyDown({ key: 'Tab', preventDefault });
  });
  expect(preventDefault).not.toHaveBeenCalled();
  expect(updateUiPreference).not.toHaveBeenCalled();
});

test('unmounting mid-drag removes window listeners', () => {
  const updateUiPreference = vi.fn();
  const { result, unmount } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 560 }, updateUiPreference }),
  );
  act(() => {
    result.current.handleResizeMouseDown({ clientX: 100, button: 0, preventDefault: vi.fn() });
  });
  unmount();
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }));
  expect(updateUiPreference).not.toHaveBeenCalled();
});

test('a second mousedown during a live drag does not stack listeners', () => {
  const updateUiPreference = vi.fn();
  const { result } = renderHook(() =>
    useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 560 }, updateUiPreference }),
  );
  act(() => {
    result.current.handleResizeMouseDown({ clientX: 100, button: 0, preventDefault: vi.fn() });
  });
  act(() => {
    result.current.handleResizeMouseDown({ clientX: 100, button: 0, preventDefault: vi.fn() });
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 80 }));
  });
  expect(updateUiPreference).toHaveBeenCalledTimes(1);
  act(() => {
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 }));
  });
  expect(updateUiPreference).toHaveBeenCalledTimes(1);
  expect(result.current.isDraggingInspector).toBe(false);
});

test('window shrink clamps the displayed width without persisting', () => {
  const updateUiPreference = vi.fn();
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
  try {
    const { result } = renderHook(() =>
      useTaskInspectorResize({ uiPreferences: { taskInspectorWidth: 1500 }, updateUiPreference }),
    );
    expect(result.current.panelWidth).toBe(1500);
    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.panelWidth).toBe(1000 - 80);
    expect(getTaskInspectorDynamicMax()).toBe(920);
    expect(updateUiPreference).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  }
});

test('dynamic max never drops below the minimum width on tiny windows', () => {
  const originalWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 200 });
  try {
    expect(getTaskInspectorDynamicMax()).toBe(320);
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  }
});
