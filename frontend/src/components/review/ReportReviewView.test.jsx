import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportReviewView } from './ReportReviewView';

vi.mock('../../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('../../services/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

import { copyToClipboard } from '../../services/clipboard';

/***
 * MARK: ReportReviewView tests
 * @description Verifies the report reviewer: Readable mode by default (rendered
 *   blocks with hover-only highlights, no per-line dividers), the Raw-lines
 *   escape hatch with numbered rows and overlay ⊕ buttons, per-block and
 *   per-line composer payloads, report-level comments, inline threads matched
 *   across `./` path spellings, copy actions, and the read-only gate.
 */
const REPORT = {
  path: './docs/tasks/t-1/IMPLEMENTATION_PLAN.md',
  filename: 'IMPLEMENTATION_PLAN.md',
  stageName: 'Plan',
  auto: true,
  timestamp: '20261012-071931',
  content: ['# Plan', 'Add retries', 'Ship it'].join('\n'),
};

const lineComment = (overrides = {}) => ({
  id: 'rc-line',
  filePath: './docs/tasks/t-1/IMPLEMENTATION_PLAN.md',
  scope: 'line',
  line: 2,
  side: 'right',
  headSha: 'sha-2',
  body: 'Tighten the retry budget',
  resolved: false,
  replies: [],
  ...overrides,
});

const handlers = () => ({
  addComment: vi.fn().mockResolvedValue({ id: 'rc-new' }),
  onReply: vi.fn().mockResolvedValue({ id: 'rep-1' }),
  onUpdate: vi.fn().mockResolvedValue({}),
  onDelete: vi.fn().mockResolvedValue(true),
});

describe('ReportReviewView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens in Readable mode by default: rendered blocks, no line rows or dividers', () => {
    const { container } = render(
      <ReportReviewView report={REPORT} comments={[]} {...handlers()} />,
    );
    expect(screen.getByTestId('report-readable-pane')).toBeTruthy();
    expect(screen.queryAllByTestId('report-line')).toHaveLength(0);
    const blocks = screen.getAllByTestId('report-block');
    expect(blocks.length).toBeGreaterThan(0);
    // No always-on per-line dividers in the reading view.
    expect(container.querySelector('.divide-y')).toBeNull();
  });

  it('renders the report header and one numbered row per content line in Raw mode', () => {
    render(<ReportReviewView report={REPORT} comments={[]} {...handlers()} />);
    fireEvent.click(screen.getByText('Raw lines'));
    expect(screen.getByTestId('report-review-view').getAttribute('data-report-path')).toBe(
      './docs/tasks/t-1/IMPLEMENTATION_PLAN.md',
    );
    expect(screen.getByText('Auto')).toBeTruthy();
    expect(screen.getByText('./docs/tasks/t-1/IMPLEMENTATION_PLAN.md')).toBeTruthy();
    const rows = screen.getAllByTestId('report-line');
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute('data-line')).toBe('1');
    expect(rows[2].getAttribute('data-line')).toBe('3');
    expect(screen.getByText('Add retries')).toBeTruthy();
  });

  it('renders blank source lines as rows in Raw mode (characterization)', () => {
    render(
      <ReportReviewView
        report={{ ...REPORT, content: '# Plan\n\nAdd retries\n\n' }}
        comments={[]}
        {...handlers()}
      />,
    );
    fireEvent.click(screen.getByText('Raw lines'));
    expect(screen.getAllByTestId('report-line')).toHaveLength(5);
  });

  it('keeps Raw ⊕ buttons out of layout flow so rows size to content', () => {
    render(<ReportReviewView report={REPORT} comments={[]} {...handlers()} />);
    fireEvent.click(screen.getByText('Raw lines'));
    const addButton = screen.getByLabelText('Add comment on report line 3');
    expect(addButton.className).toContain('absolute');
  });

  it('opens the line composer from ⊕ in Raw mode and submits scope line with path, line, and text', async () => {
    const h = handlers();
    const { container } = render(
      <ReportReviewView report={REPORT} comments={[]} headSha="sha-2" {...h} />,
    );
    fireEvent.click(screen.getByText('Raw lines'));
    fireEvent.click(screen.getByLabelText('Add comment on report line 3'));
    const composer = container.querySelector('[data-testid="review-comment-composer"]');
    expect(composer).toBeTruthy();
    fireEvent.change(composer.querySelector('textarea'), {
      target: { value: 'Mention the rollback' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(h.addComment).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'line',
          filePath: './docs/tasks/t-1/IMPLEMENTATION_PLAN.md',
          line: 3,
          side: 'right',
          headSha: 'sha-2',
          lineText: 'Ship it',
          body: 'Mention the rollback',
        }),
      );
    });
  });

  it('opens a block composer from the Readable ⊕ and submits the block start line', async () => {
    const h = handlers();
    const { container } = render(
      <ReportReviewView report={REPORT} comments={[]} headSha="sha-2" {...h} />,
    );
    fireEvent.click(screen.getByLabelText('Add comment on heading, line 1'));
    const composer = container.querySelector('[data-testid="review-comment-composer"]');
    expect(composer).toBeTruthy();
    fireEvent.change(composer.querySelector('textarea'), {
      target: { value: 'Sharpen the title' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(h.addComment).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'line',
          filePath: './docs/tasks/t-1/IMPLEMENTATION_PLAN.md',
          line: 1,
          side: 'right',
          headSha: 'sha-2',
          lineText: '# Plan',
          body: 'Sharpen the title',
        }),
      );
    });
  });

  it('renders inline threads anchored to the matching block in Readable mode', () => {
    render(<ReportReviewView report={REPORT} comments={[lineComment()]} {...handlers()} />);
    const thread = screen.getByTestId('review-comment-thread');
    expect(thread.getAttribute('data-comment-id')).toBe('rc-line');
    expect(screen.getByText('Tighten the retry budget')).toBeTruthy();
    // Thread on source line 2 sits under the block spanning lines 2–3.
    const block = screen.getByText('Tighten the retry budget').closest('[data-testid="report-block"]');
    expect(block.getAttribute('data-start-line')).toBe('2');
    expect(block.getAttribute('data-end-line')).toBe('3');
  });

  it('matches threads across ./ and bare path spellings and ignores other files', () => {
    render(
      <ReportReviewView
        report={REPORT}
        comments={[
          lineComment({
            id: 'rc-bare',
            filePath: 'docs/tasks/t-1/IMPLEMENTATION_PLAN.md',
            line: 3,
          }),
          lineComment({ id: 'rc-other', filePath: './docs/tasks/t-1/OTHER.md', line: 2 }),
        ]}
        {...handlers()}
      />,
    );
    expect(screen.getAllByTestId('review-comment-thread')).toHaveLength(1);
    expect(screen.getByTestId('review-comment-thread').getAttribute('data-comment-id')).toBe(
      'rc-bare',
    );
  });

  it('submits report-level comments with scope file', async () => {
    const h = handlers();
    const { container } = render(<ReportReviewView report={REPORT} comments={[]} {...h} />);
    fireEvent.click(
      screen.getByLabelText('Comment on report ./docs/tasks/t-1/IMPLEMENTATION_PLAN.md'),
    );
    const composer = container.querySelector('[data-testid="review-comment-composer"]');
    fireEvent.change(composer.querySelector('textarea'), {
      target: { value: 'Whole-plan note' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(h.addComment).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'file',
          filePath: './docs/tasks/t-1/IMPLEMENTATION_PLAN.md',
          body: 'Whole-plan note',
        }),
      );
    });
  });

  it('toggles between Readable and Raw lines and back', () => {
    render(<ReportReviewView report={REPORT} comments={[]} {...handlers()} />);
    expect(screen.getByTestId('report-readable-pane')).toBeTruthy();
    expect(screen.queryAllByTestId('report-line')).toHaveLength(0);
    fireEvent.click(screen.getByText('Raw lines'));
    expect(screen.getAllByTestId('report-line')).toHaveLength(3);
    expect(screen.queryByTestId('report-readable-pane')).toBeNull();
    fireEvent.click(screen.getByText('Readable'));
    expect(screen.getByTestId('report-readable-pane')).toBeTruthy();
    expect(screen.queryAllByTestId('report-line')).toHaveLength(0);
  });

  it('is read-only when canComment is false: no ⊕ or report comment affordance in either mode', () => {
    render(<ReportReviewView report={REPORT} comments={[]} canComment={false} {...handlers()} />);
    expect(screen.queryByLabelText(/Add comment on/)).toBeNull();
    expect(screen.queryByLabelText(/Comment on report /)).toBeNull();
    fireEvent.click(screen.getByText('Raw lines'));
    expect(screen.queryByLabelText(/Add comment on report line/)).toBeNull();
    expect(screen.queryByLabelText(/Comment on report /)).toBeNull();
  });

  it('copies the report path and markdown through the clipboard service', async () => {
    render(<ReportReviewView report={REPORT} comments={[]} {...handlers()} />);
    fireEvent.click(screen.getByLabelText('Copy report path'));
    await vi.waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith('./docs/tasks/t-1/IMPLEMENTATION_PLAN.md');
    });
    fireEvent.click(screen.getByLabelText('Copy markdown content'));
    await vi.waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(REPORT.content);
    });
  });

  it('splits CRLF content without leaking carriage returns', () => {
    render(
      <ReportReviewView
        report={{ ...REPORT, content: '# Plan\r\nAdd retries\r\nShip it' }}
        comments={[]}
        {...handlers()}
      />,
    );
    fireEvent.click(screen.getByText('Raw lines'));
    const rows = screen.getAllByTestId('report-line');
    expect(rows).toHaveLength(3);
    expect(screen.getByText('Add retries')).toBeTruthy();
    expect(screen.queryByText(/Add retries\r/)).toBeNull();
  });

  it('shows an empty-content message for a report without a body', () => {
    render(<ReportReviewView report={{ ...REPORT, content: '' }} comments={[]} {...handlers()} />);
    expect(screen.getByText('This report has no content to review.')).toBeTruthy();
  });

  it('shows a select-a-report message when no report is provided', () => {
    render(<ReportReviewView report={null} comments={[]} {...handlers()} />);
    expect(screen.getByText('Select a report to review.')).toBeTruthy();
  });
});
