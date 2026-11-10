import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportReadableView } from './ReportReadableView';
import { FIXTURE_REPORT, FIXTURE_LINES } from './__fixtures__/reportFixture';

/***
 * MARK: ReportReadableView tests
 * @description Verifies the default reading pane: one hover-highlighted block
 *   per markdown block with stable line-span anchors, per-block composers
 *   that submit the same line-comment payloads as Raw mode, legacy thread
 *   placement (including blank-line fallback), read-only gating, and the
 *   unplaced-comments fallback for empty reports.
 ***/

const commentOn = (line, overrides = {}) => ({
  id: `rc-${line}`,
  filePath: FIXTURE_REPORT.path,
  scope: 'line',
  line,
  side: 'right',
  body: `note on line ${line}`,
  resolved: false,
  replies: [],
  ...overrides,
});

const baseProps = (overrides = {}) => ({
  reportContent: FIXTURE_REPORT.content,
  reportPath: FIXTURE_REPORT.path,
  lines: FIXTURE_REPORT.content.split('\n'),
  threadsByLine: new Map(),
  fileLevel: [],
  composer: null,
  setComposer: vi.fn(),
  onSubmitLineComment: vi.fn().mockResolvedValue(undefined),
  onSubmitFileComment: vi.fn().mockResolvedValue(undefined),
  renderThread: (comment) => (
    <div key={comment.id} data-testid="review-comment-thread" data-comment-id={comment.id}>
      {comment.body}
    </div>
  ),
  canComment: true,
  ...overrides,
});

describe('ReportReadableView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one anchored block per markdown block with line chips', () => {
    render(<ReportReadableView {...baseProps()} />);
    const blocks = screen.getAllByTestId('report-block');
    expect(blocks).toHaveLength(12);
    expect(blocks[0].getAttribute('data-start-line')).toBe('1');
    expect(blocks[0].getAttribute('data-block-id')).toBe('report-block-1-1');
    // Multi-line intro paragraph (lines 3–4) gets a span chip.
    expect(blocks[1].getAttribute('data-start-line')).toBe('3');
    expect(blocks[1].getAttribute('data-end-line')).toBe('4');
    expect(blocks[1].textContent).toContain('L3–4');
    // Hover-only highlight, no dividers: gentle hover/focus background.
    expect(blocks[1].className).toContain('hover:bg-surface-container-high/60');
    expect(blocks[1].className).toContain('focus-within:bg-surface-container-high/60');
  });

  it('exposes a named comment button per block kind with its source lines', () => {
    render(<ReportReadableView {...baseProps()} />);
    expect(
      screen.getByLabelText('Add comment on heading, line 1'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Add comment on paragraph, lines 3 to 4'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Add comment on code block, lines 17 to 20'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Add comment on table, lines 22 to 25')).toBeTruthy();
  });

  it('opens the composer under its block and submits the block start line', async () => {
    const props = baseProps();
    const { rerender } = render(<ReportReadableView {...props} />);
    fireEvent.click(screen.getByLabelText('Add comment on paragraph, lines 3 to 4'));
    expect(props.setComposer).toHaveBeenCalledWith({
      line: 3,
      lineText: FIXTURE_LINES[2],
    });
    // Docked composer submits the same payload shape as Raw mode.
    const composerState = { line: 3, lineText: FIXTURE_LINES[2] };
    rerender(<ReportReadableView {...props} composer={composerState} />);
    const composer = document.querySelector('[data-testid="review-comment-composer"]');
    expect(composer).toBeTruthy();
    fireEvent.change(composer.querySelector('textarea'), {
      target: { value: 'Tighten this intro' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(props.onSubmitLineComment).toHaveBeenCalledWith(
        3,
        FIXTURE_LINES[2],
        'Tighten this intro',
      );
    });
  });

  it('places legacy threads under the block spanning their line', () => {
    const threadsByLine = new Map([
      [1, [commentOn(1)]],
      [19, [commentOn(19)]],
      [24, [commentOn(24)]],
    ]);
    render(<ReportReadableView {...baseProps({ threadsByLine })} />);
    expect(screen.getAllByTestId('review-comment-thread')).toHaveLength(3);
    const codeThread = screen.getByText('note on line 19').closest('[data-testid="report-block"]');
    expect(codeThread.getAttribute('data-start-line')).toBe('17');
    expect(codeThread.getAttribute('data-end-line')).toBe('20');
    const tableThread = screen
      .getByText('note on line 24')
      .closest('[data-testid="report-block"]');
    expect(tableThread.getAttribute('data-start-line')).toBe('22');
  });

  it('falls back blank-line threads to the next visible block', () => {
    const threadsByLine = new Map([[5, [commentOn(5)]]]);
    render(<ReportReadableView {...baseProps({ threadsByLine })} />);
    const thread = screen.getByTestId('review-comment-thread');
    const block = thread.closest('[data-testid="report-block"]');
    // Blank line 5 sits between the intro paragraph and the list.
    expect(block.getAttribute('data-start-line')).toBe('6');
  });

  it('hides comment affordances when read-only but still shows threads', () => {
    const threadsByLine = new Map([[1, [commentOn(1)]]]);
    render(
      <ReportReadableView {...baseProps({ threadsByLine, canComment: false })} />,
    );
    expect(screen.getByText('note on line 1')).toBeTruthy();
    expect(screen.queryByLabelText(/Add comment on/)).toBeNull();
    expect(screen.queryByLabelText(/Comment on report/)).toBeNull();
  });

  it('keeps blocks compact and keyboard-focusable: no min-height or dividers, native buttons', () => {
    render(<ReportReadableView {...baseProps()} />);
    for (const block of screen.getAllByTestId('report-block')) {
      expect(block.className).not.toContain('min-h-');
      expect(block.className).not.toContain('divide-');
    }
    const addButton = screen.getByLabelText('Add comment on paragraph, lines 3 to 4');
    expect(addButton.tagName).toBe('BUTTON');
    expect(addButton.tabIndex).toBe(0);
    expect(addButton.className).toContain('focus-visible:ring-2');
    addButton.focus();
    expect(document.activeElement).toBe(addButton);
  });

  it('shows unplaced line threads for an empty report instead of dropping them', () => {
    const threadsByLine = new Map([[2, [commentOn(2)]]]);
    render(
      <ReportReadableView
        {...baseProps({ reportContent: '', lines: [], threadsByLine })}
      />,
    );
    expect(screen.getByText('This report has no content to review.')).toBeTruthy();
    expect(screen.getByText('Earlier line comments')).toBeTruthy();
    expect(screen.getByText('note on line 2')).toBeTruthy();
  });

  it('opens a file-level composer from the report comment affordance', async () => {
    const props = baseProps();
    const { container, rerender } = render(<ReportReadableView {...props} />);
    fireEvent.click(screen.getByLabelText(`Comment on report ${FIXTURE_REPORT.path}`));
    expect(props.setComposer).toHaveBeenCalledWith('file');
    rerender(<ReportReadableView {...props} composer="file" />);
    const composer = container.querySelector('[data-testid="review-comment-composer"]');
    fireEvent.change(composer.querySelector('textarea'), {
      target: { value: 'Whole-report note' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(props.onSubmitFileComment).toHaveBeenCalledWith('Whole-report note');
    });
  });
});
