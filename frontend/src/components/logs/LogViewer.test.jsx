// @vitest-environment jsdom
/**
 * MARK: LogViewer tests
 * @description Component contract for the unified viewer: presettable
 *   category chips (no counts, always enabled) with aria-pressed,
 *   multi-select filtering, collapsible filter block, search, compact/full
 *   density, timestamps, row expansion, grouping, copy,
 *   and the role=log accessibility surface.
 */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { LogViewer } from './LogViewer';
import { adaptTaskEntries } from './adapters';
import { groupLogRecords } from './logCategories';
import { useLogViewerState } from './logViewerState';
import { structuredTaskEntries } from './__fixtures__';
import { setNarrowViewportOverride } from '../util/viewport';
import '@testing-library/jest-dom';

function Harness({ recordsProp, groupsProp, viewerOptions, viewerProps, fullTextById }) {
  const viewer = useLogViewerState(viewerOptions);
  return (
    <LogViewer
      records={recordsProp}
      groups={groupsProp}
      groupMode="turn"
      viewer={viewer}
      fullTextById={fullTextById}
      logLabel="Test logs"
      testId="test-log-console"
      {...viewerProps}
    />
  );
}

function renderViewer(overrides = {}) {
  const records = adaptTaskEntries(structuredTaskEntries);
  return renderWithKainBain(
    <Harness
      recordsProp={records}
      viewerOptions={{ surface: 'task', taskId: `tv-${Math.random().toString(36).slice(2)}` }}
      {...overrides}
    />,
  );
}

function openLogFilters() {
  const toggle = screen.getByTestId('log-filter-toggle');
  if (toggle.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(toggle);
  }
}

// Keeps the viewer mounted while records stream in (mirrors the live
// console): appending must never reset the user's filter-block choice.
function StreamingHarness({ initialRecords, taskId }) {
  const viewer = useLogViewerState({ surface: 'task', taskId });
  const [extra, setExtra] = useState([]);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setExtra((prev) => [
            ...prev,
            ...adaptTaskEntries([
              { id: `late-${prev.length}`, kind: 'assistant', text: 'late line' },
            ]),
          ])
        }
      >
        append log line
      </button>
      <LogViewer
        records={[...initialRecords, ...extra]}
        groupMode="turn"
        viewer={viewer}
        logLabel="Test logs"
        testId="test-log-console"
      />
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  setNarrowViewportOverride(null);
});

describe('LogViewer chrome', () => {
  test('renders category chips without counts and aria-pressed, All pressed by default', () => {
    renderViewer();
    openLogFilters();
    const region = screen.getByTestId('test-log-console');
    expect(region).toHaveAttribute('role', 'log');
    expect(region).toHaveAttribute('aria-label', 'Test logs');
    const group = screen.getByRole('group', { name: 'Log categories' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    // CI lane has exactly one fixture line.
    expect(screen.getByRole('button', { name: 'CI logs' })).toHaveAttribute('aria-pressed', 'true');
    // Debug lane exists with one fixture line but stays off by default.
    expect(screen.getByRole('button', { name: 'Verbose debug' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // No per-lane counts are rendered anywhere on the chips.
    for (const chip of screen.getAllByRole('button', { name: /.+/ })) {
      expect(chip.textContent).not.toMatch(/\(\d+\)/);
    }
  });

  test('all lanes stay enabled with zero records so filters preset before logs arrive', () => {
    renderWithKainBain(
      <Harness recordsProp={[]} viewerOptions={{ surface: 'task', taskId: 'sparse-1' }} />,
    );
    openLogFilters();
    const ciChip = screen.getByRole('button', { name: 'CI logs' });
    expect(ciChip).not.toBeDisabled();
    // Presetting works with an empty stream: toggling flips selection.
    expect(ciChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(ciChip);
    expect(ciChip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('No logs available.')).toBeInTheDocument();
  });

  test('sparse lanes stay toggleable: single-record stream still presets other lanes', () => {
    const records = adaptTaskEntries([{ id: '1', kind: 'assistant', text: 'only narrative' }]);
    renderWithKainBain(
      <Harness recordsProp={records} viewerOptions={{ surface: 'task', taskId: 'sparse-2' }} />,
    );
    openLogFilters();
    const ciChip = screen.getByRole('button', { name: 'CI logs' });
    expect(ciChip).not.toBeDisabled();
    fireEvent.click(ciChip);
    expect(ciChip).toHaveAttribute('aria-pressed', 'false');
  });

  test('multi-select toggle narrows rows without hiding other lanes', () => {
    renderViewer();
    openLogFilters();
    expect(screen.getByText('Retrying with a fixed backoff.')).toBeInTheDocument();
    // The All highlight tracks the same default-selection state as aria-pressed.
    expect(screen.getByRole('button', { name: 'All' }).className).toContain('bg-primary');
    fireEvent.click(screen.getByRole('button', { name: 'Direct output' }));
    expect(screen.queryByText('Retrying with a fixed backoff.')).not.toBeInTheDocument();
    // Tool lane still visible: multi-select narrows, it does not switch feeds.
    expect(screen.getByText('[TOOL] bash({"cmd":"npm test"})')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'All' }).className).not.toContain('bg-primary');
  });

  test('search composes with chips', () => {
    renderViewer();
    openLogFilters();
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'backoff' } });
    expect(screen.getByText('Retrying with a fixed backoff.')).toBeInTheDocument();
    expect(screen.queryByText('[TOOL] bash({"cmd":"npm test"})')).not.toBeInTheDocument();
  });

  test('density toggle switches Compact/Full pressed state', () => {
    renderViewer();
    openLogFilters();
    expect(screen.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('filter block collapses and expands behind one toggle on every viewport', () => {
    setNarrowViewportOverride(false);
    renderViewer();
    const toggle = screen.getByTestId('log-filter-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('log-filters')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search logs')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('log-filters')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Log categories' })).toBeInTheDocument();
    // The log stream itself stays visible while filters are hidden.
    expect(screen.getByTestId('test-log-console')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('log-filters')).not.toBeInTheDocument();
  });

  test('phone-narrow viewports start collapsed; an explicit toggle survives stream updates', () => {
    setNarrowViewportOverride(true);
    const records = adaptTaskEntries(structuredTaskEntries);
    renderWithKainBain(<StreamingHarness initialRecords={records} taskId="narrow-1" />);
    // Collapsed up front so the stream is visible on small screens…
    expect(screen.getByTestId('log-filter-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('log-filters')).not.toBeInTheDocument();
    // …but the user can still open filters, and new log lines arriving (a
    // re-render with the viewer kept mounted) must not yank the explicitly
    // opened block shut again.
    fireEvent.click(screen.getByTestId('log-filter-toggle'));
    expect(screen.getByTestId('log-filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'append log line' }));
    expect(screen.getByTestId('log-filters')).toBeInTheDocument();
    expect(screen.getByTestId('log-filter-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('late line')).toBeInTheDocument();
  });

  test('collapsed filters show a Filters-on badge only while a filter is active', () => {
    setNarrowViewportOverride(true);
    renderViewer();
    // Default selection: no badge.
    expect(screen.queryByTestId('log-filter-active-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('log-filter-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Direct output' }));
    fireEvent.click(screen.getByTestId('log-filter-toggle'));
    expect(screen.getByTestId('log-filter-active-badge')).toBeInTheDocument();
  });

  test('timestamps toggle reveals the format menu', () => {
    const { unmount } = renderViewer();
    unmount();
    const records = adaptTaskEntries(structuredTaskEntries);
    renderWithKainBain(
      <Harness
        recordsProp={records}
        viewerOptions={{ surface: 'live', taskId: null }}
        viewerProps={{}}
      />,
    );
    openLogFilters();
    const toggle = screen.getByRole('button', { name: 'Timestamps' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('Timestamp format')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Timestamp format')).toBeInTheDocument();
  });
});

describe('LogViewer rows', () => {
  test('turn groups render headers and full thinking stays hidden by default', () => {
    const records = adaptTaskEntries(structuredTaskEntries);
    const groups = groupLogRecords(records, { mode: 'turn' });
    renderWithKainBain(
      <Harness
        recordsProp={records}
        groupsProp={groups}
        viewerOptions={{ surface: 'task', taskId: 'turns-1' }}
      />,
    );
    expect(screen.getByText('── Turn 1 ──')).toBeInTheDocument();
    expect(screen.getByText('── Turn 2 ──')).toBeInTheDocument();
    // Collapsed marker visible…
    expect(screen.getByText('[THINKING] (64 chars)')).toBeInTheDocument();
    // …full block hidden until the thinking category is the only lane toggled off/on.
    expect(
      screen.queryByText('The stack trace points at the retry helper, not the parser itself…'),
    ).not.toBeInTheDocument();
  });

  test('thinking expander reveals the full block via aria-expanded', () => {
    const records = adaptTaskEntries(structuredTaskEntries);
    const fullTextById = new Map([
      [2, { id: 2, text: 'The stack trace points at the retry helper, not the parser itself…' }],
    ]);
    renderWithKainBain(
      <Harness
        recordsProp={records}
        viewerOptions={{ surface: 'task', taskId: 'think-1' }}
        fullTextById={fullTextById}
      />,
    );
    const expander = screen.getByRole('button', { name: 'Show thinking (64 chars)' });
    expect(expander).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expander);
    expect(expander).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('The stack trace points at the retry helper, not the parser itself…'),
    ).toBeInTheDocument();
  });

  test('detail expander exposes tool output with aria-expanded', () => {
    renderViewer();
    const expander = screen.getAllByRole('button', { name: 'Show full detail' })[0];
    expect(expander).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expander);
    expect(screen.getByRole('button', { name: 'Hide full detail' })).toBeInTheDocument();
    expect(screen.getByText(/FAIL tests\/unit\/retry\.test\.js/)).toBeInTheDocument();
  });

  test('intervention summary strip is not rendered, maximizing log space', () => {
    const { unmount } = renderViewer();
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    expect(screen.queryByText(/Errors: \d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Checkpoints: \d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Repeated: \d+/)).not.toBeInTheDocument();
    unmount();

    // Verify backward compatibility: passing legacy showInterventionSummary prop is safe and still renders no strip
    renderViewer({ viewerProps: { showInterventionSummary: true } });
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    expect(screen.queryByText(/Errors: \d+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Checkpoints: \d+/)).not.toBeInTheDocument();
  });

  test('copy callback receives the filtered records', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onCopy = vi.fn();
    const records = adaptTaskEntries(structuredTaskEntries);
    renderWithKainBain(
      <Harness
        recordsProp={records}
        viewerOptions={{ surface: 'task', taskId: 'copy-1' }}
        viewerProps={{ onCopy }}
      />,
    );
    openLogFilters();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy logs' }));
    });
    expect(screen.getByRole('button', { name: 'Copied to clipboard' })).toBeInTheDocument();
    expect(onCopy).toHaveBeenCalledTimes(1);
    const passed = onCopy.mock.calls[0][0];
    // Default selection excludes full thinking blocks plus debug/raw lanes,
    // while collapsed markers ride along with the narrative.
    expect(passed.map((r) => r.id).sort()).toEqual(
      records
        .filter((r) => !['2', '12', '13'].includes(r.id))
        .map((r) => r.id)
        .sort(),
    );
    expect(passed.map((r) => r.id)).toContain('3');
    void writeText;
  });

  test('default copy writes formatted lines to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderViewer();
    openLogFilters();
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'backoff' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy logs' }));
    });
    expect(screen.getByRole('button', { name: 'Copied to clipboard' })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('Retrying with a fixed backoff.');
  });

  test('copy button does NOT confirm when the clipboard write fails', async () => {
    // Simulate clipboard failure: writeText rejects AND execCommand fallback fails.
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    // execCommand fallback also fails (returns false).
    document.execCommand = vi.fn().mockReturnValue(false);
    renderViewer();
    openLogFilters();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy logs' }));
    });
    // The button must NOT flip to "Copied!" — the copy failed.
    expect(screen.queryByRole('button', { name: 'Copied to clipboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy logs' })).toBeInTheDocument();
  });

  test('onCopy callback throwing does not crash the viewer', async () => {
    const onCopy = vi.fn().mockRejectedValue(new Error('boom'));
    const records = adaptTaskEntries(structuredTaskEntries);
    renderWithKainBain(
      <Harness
        recordsProp={records}
        viewerOptions={{ surface: 'task', taskId: 'copy-fail-1' }}
        viewerProps={{ onCopy }}
      />,
    );
    openLogFilters();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy logs' }));
    });
    // Viewer still renders; button does not confirm.
    expect(screen.queryByRole('button', { name: 'Copied to clipboard' })).not.toBeInTheDocument();
    expect(screen.getByTestId('test-log-console')).toBeInTheDocument();
  });

  test('reset restores defaults and empty filter shows the empty message', () => {
    renderViewer();
    openLogFilters();
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No logs available.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(screen.getByText('Retrying with a fixed backoff.')).toBeInTheDocument();
  });

  test('renders empty message when records list is empty', () => {
    renderWithKainBain(
      <Harness recordsProp={[]} viewerOptions={{ surface: 'task', taskId: 'empty-1' }} />,
    );
    expect(screen.getByText('No logs available.')).toBeInTheDocument();
    openLogFilters();
    // No counts; every chip stays enabled so the empty dashboard presets.
    expect(screen.getByRole('button', { name: 'CI logs' })).not.toBeDisabled();
  });

  test('fullTextById as a non-Map object does not crash the thinking expander', () => {
    const records = adaptTaskEntries(structuredTaskEntries);
    // Pass a plain object instead of a Map — the viewer must not throw.
    renderWithKainBain(
      <Harness
        recordsProp={records}
        viewerOptions={{ surface: 'task', taskId: 'think-nomap-1' }}
        fullTextById={{ 2: { text: 'should not be used' } }}
      />,
    );
    // The thinking marker renders; the expander is hidden because fullTextById
    // is not a Map (no full text available).
    expect(screen.getByText('[THINKING] (64 chars)')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show thinking (64 chars)' }),
    ).not.toBeInTheDocument();
  });
});

describe('LogViewer mobile layout', () => {
  test('long tool payload wraps without horizontal overflow on phone-narrow viewports', () => {
    setNarrowViewportOverride(true);
    const uuid = '11111111-2222-3333-4444-555555555555';
    const longPayload = `bash({"command":"cd /home/server/projects/kainbain && echo ${'x'.repeat(200)}"})`;
    const records = [
      {
        id: 'mobile-1',
        ts: '2026-10-16T10:00:00.000Z',
        feed: 'tools',
        feeds: ['tools'],
        kind: 'tool',
        turn: 1,
        text: `[TOOL] ${longPayload} ${uuid}`,
        tool: { name: 'bash', result: `FAIL tests/unit/retry.test.js ${'y'.repeat(300)}` },
        meta: { toolName: 'bash', toolCallId: 'tc-mobile' },
        projectName: `very-long-project-name-${'p'.repeat(60)}`,
        taskId: uuid,
      },
    ];
    const adapted = adaptTaskEntries(records);
    renderWithKainBain(
      <Harness
        recordsProp={adapted}
        viewerOptions={{ surface: 'task', taskId: 'mobile-layout-1' }}
      />,
    );

    const expander = screen.getByRole('button', { name: 'Show full detail' });
    fireEvent.click(expander);

    // Fail-safe chain: the scroll region clamps horizontally so residue can
    // never reach the page (the 18522.png "scroll to black" symptom).
    const consoleEl = screen.getByTestId('test-log-console');
    expect(consoleEl.className).toContain('overflow-x-hidden');
    expect(consoleEl.className).toContain('min-w-0');

    // Expanded detail block wraps unbreakable tokens (the 18521.png row).
    const detailText = screen.getByText(/FAIL tests\/unit\/retry\.test\.js/);
    expect(detailText.className).toContain('break-words');
    expect(detailText.className).toContain('min-w-0');
    expect(detailText.style.overflowWrap).toBe('anywhere');

    // Main text span carries the same wrapping contract.
    const mainText = screen.getByText(/bash\(\{/);
    expect(mainText.style.overflowWrap).toBe('anywhere');
    expect(mainText.className).toContain('min-w-0');

    // The Turn/Task meta line wraps a full task UUID instead of forcing width.
    const metaLine = screen.getByText(new RegExp(`Task ${uuid}`));
    expect(metaLine.className).toContain('break-words');
    expect(metaLine.style.overflowWrap).toBe('anywhere');

    // The project pill truncates (with a full-name tooltip) so a long
    // project UUID can never set the row width.
    const pill = screen.getByTitle(`very-long-project-name-${'p'.repeat(60)}`);
    expect(pill.className).toContain('truncate');
    expect(pill.className).toContain('max-w-');

    // No horizontal overflow escapes into the console (jsdom layout reports
    // 0 when nothing forces width; the class assertions above guard the CSS).
    expect(consoleEl.scrollWidth).toBeLessThanOrEqual(consoleEl.clientWidth);
  });

  test('expanded thinking block wraps long unbroken tokens', () => {
    setNarrowViewportOverride(true);
    const longThinking = `considering-${'z'.repeat(300)}-token`;
    const records = adaptTaskEntries(structuredTaskEntries);
    const fullTextById = new Map([[2, { id: 2, text: longThinking }]]);
    renderWithKainBain(
      <Harness
        recordsProp={records}
        viewerOptions={{ surface: 'task', taskId: 'mobile-thinking-1' }}
        fullTextById={fullTextById}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show thinking (64 chars)' }));
    const thinkingText = screen.getByText(new RegExp(`considering-`));
    expect(thinkingText.className).toContain('break-words');
    expect(thinkingText.className).toContain('min-w-0');
    expect(thinkingText.style.overflowWrap).toBe('anywhere');
  });

  test('compact density rows stay width-constrained with long payloads', () => {
    setNarrowViewportOverride(true);
    const uuid = '11111111-2222-3333-4444-555555555555';
    const records = adaptTaskEntries([
      {
        id: 'mobile-compact-1',
        kind: 'tool',
        text: `[TOOL] bash({"command":"cd /home/server/projects/kainbain && echo ${'x'.repeat(200)}"}) ${uuid}`,
        tool: { name: 'bash', result: 'ok' },
        meta: { toolName: 'bash', toolCallId: 'tc-compact' },
      },
    ]);
    renderWithKainBain(
      <Harness
        recordsProp={records}
        viewerOptions={{ surface: 'task', taskId: 'mobile-compact-1' }}
      />,
    );
    // Narrow viewports start with filters collapsed; open them to reach density.
    fireEvent.click(screen.getByTestId('log-filter-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));
    const mainText = screen.getByText(/bash\(\{/);
    expect(mainText.style.overflowWrap).toBe('anywhere');
    expect(mainText.className).toContain('min-w-0');
    const consoleEl = screen.getByTestId('test-log-console');
    expect(consoleEl.className).toContain('overflow-x-hidden');
  });
});
