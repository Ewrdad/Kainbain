// @vitest-environment jsdom
/**
 * MARK: LogViewer follow-scroll tests
 * @description Geometry-stubbed contract tests for the stick-to-bottom
 *   follow-scroll. jsdom has no layout, so the scroll container's geometry
 *   is patched on HTMLElement.prototype; the tests restore it afterwards.
 */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { LogViewer } from './LogViewer';
import { adaptTaskEntries } from './adapters';
import { useLogViewerState } from './logViewerState';
import { setNarrowViewportOverride } from '../util/viewport';
import '@testing-library/jest-dom';

function StreamingHarness({ initialRecords, taskId, autoScroll }) {
  const viewer = useLogViewerState({ surface: 'task', taskId });
  const effectiveViewer = { ...viewer, autoScroll: autoScroll !== undefined ? autoScroll : viewer.autoScroll };
  const [extra, setExtra] = useState([]);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setExtra((prev) => [
            ...prev,
            ...adaptTaskEntries([{ id: `late-${prev.length}`, kind: 'assistant', text: 'late line' }]),
          ])
        }
      >
        append log line
      </button>
      <LogViewer
        records={[...initialRecords, ...extra]}
        groupMode="turn"
        viewer={effectiveViewer}
        logLabel="Test logs"
        testId="test-log-console"
      />
    </>
  );
}

function patchGeometry(initialHeight) {
  let h = initialHeight;
  let top = 0;
  const desc = {
    scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
    scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return h; },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return 50; },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() { return top; },
    set(v) { top = v; },
  });
  return {
    get height() { return h; },
    set height(v) { h = v; },
    get top() { return top; },
    set top(v) { top = v; },
    restore() {
      if (desc.scrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc.scrollHeight);
      else delete HTMLElement.prototype.scrollHeight;
      if (desc.clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', desc.clientHeight);
      else delete HTMLElement.prototype.clientHeight;
      if (desc.scrollTop) Object.defineProperty(HTMLElement.prototype, 'scrollTop', desc.scrollTop);
      else delete HTMLElement.prototype.scrollTop;
    },
  };
}

describe('LogViewer follow-scroll component', () => {
  let geo;
  beforeEach(() => {
    setNarrowViewportOverride(false);
    geo = patchGeometry(100);
    geo.top = 50; // start pinned to bottom of 100/50
  });

  afterEach(() => {
    geo.restore();
    setNarrowViewportOverride(null);
  });

  test('filled log: append advances scrollTop by delta', () => {
    const initial = adaptTaskEntries([{ id: 'a', kind: 'assistant', text: 'a' }]);
    renderWithKainBain(<StreamingHarness initialRecords={initial} taskId="fs-1" />);
    expect(geo.top).toBe(50);
    geo.height = 140;
    fireEvent.click(screen.getByRole('button', { name: 'append log line' }));
    expect(geo.top).toBe(90);
  });

  test('short log: no programmatic scroll, stays at top', () => {
    geo.height = 40; // shorter than viewport
    geo.top = 0;
    const initial = adaptTaskEntries([{ id: 'a', kind: 'assistant', text: 'a' }]);
    renderWithKainBain(<StreamingHarness initialRecords={initial} taskId="fs-2" />);
    expect(geo.top).toBe(0);
    geo.height = 45;
    fireEvent.click(screen.getByRole('button', { name: 'append log line' }));
    expect(geo.top).toBe(0);
  });

  test('scrolled up: append does not move scrollTop', () => {
    const initial = adaptTaskEntries([{ id: 'a', kind: 'assistant', text: 'a' }]);
    renderWithKainBain(<StreamingHarness initialRecords={initial} taskId="fs-3" />);
    geo.top = 0;
    const el = screen.getByTestId('test-log-console');
    fireEvent.scroll(el);
    const before = geo.top;
    geo.height = 140;
    fireEvent.click(screen.getByRole('button', { name: 'append log line' }));
    expect(geo.top).toBe(before);
  });

  test('follow-scroll never calls scrollIntoView (page must not move)', () => {
    // `scrollIntoView` scrolls every scrollable ancestor, so on mobile it
    // pushes the page past the log panel into the blank area below it
    // (18569). Follow-scroll must position the log pane's own scrollTop only.
    const spy = vi.fn();
    const hadNative = typeof Element.prototype.scrollIntoView === 'function';
    const native = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      const initial = adaptTaskEntries([{ id: 'a', kind: 'assistant', text: 'a' }]);
      renderWithKainBain(<StreamingHarness initialRecords={initial} taskId="fs-siv" />);
      // Initial mount follow + one streamed append: the tail-follow path runs
      // twice, and neither may touch an ancestor scroller.
      geo.height = 140;
      fireEvent.click(screen.getByRole('button', { name: 'append log line' }));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      if (hadNative) Element.prototype.scrollIntoView = native;
      else delete Element.prototype.scrollIntoView;
    }
  });

  test('scroll region contains overscroll so gestures cannot chain into the page', () => {
    const initial = adaptTaskEntries([{ id: 'a', kind: 'assistant', text: 'a' }]);
    renderWithKainBain(<StreamingHarness initialRecords={initial} taskId="fs-os" />);
    const el = screen.getByTestId('test-log-console');
    expect(el.className).toContain('overscroll-contain');
    expect(el.className).toContain('overflow-y-auto');
  });

  test('autoScroll disabled: never scrolls', () => {
    geo.height = 100;
    geo.top = 0;
    const initial = adaptTaskEntries([{ id: 'a', kind: 'assistant', text: 'a' }]);
    // Use viewer autoScroll false via prop through harness
    function H() {
      const viewer = useLogViewerState({ surface: 'task', taskId: 'fs-4' });
      const effectiveViewer = { ...viewer, autoScroll: false };
      const [extra, setExtra] = useState([]);
      return (
        <>
          <button
            type="button"
            onClick={() =>
              setExtra((prev) => [
                ...prev,
                ...adaptTaskEntries([{ id: `late-${prev.length}`, kind: 'assistant', text: 'late line' }]),
              ])
            }
          >
            append log line
          </button>
          <LogViewer
            records={[...initial, ...extra]}
            groupMode="turn"
            viewer={effectiveViewer}
            logLabel="Test logs"
            testId="test-log-console"
          />
        </>
      );
    }
    renderWithKainBain(<H />);
    geo.height = 140;
    fireEvent.click(screen.getByRole('button', { name: 'append log line' }));
    expect(geo.top).toBe(0);
  });
});
