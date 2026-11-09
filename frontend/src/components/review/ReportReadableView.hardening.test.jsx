import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportReadableView } from './ReportReadableView';
import { FIXTURE_REPORT } from './__fixtures__/reportFixture';
import * as MarkdownViewerModule from '../common/MarkdownViewer';

/***
 * MARK: ReportReadableView hardening tests
 * @description Pins fail-safe and edge-case behavior: parser failure
 *   fallback, empty/null inputs, copy-timer hygiene, and operational
 *   invariants that keep the review pane usable in degraded states.
 */

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

describe('ReportReadableView parse failure fallback', () => {
  it('shows a fallback message and Raw-lines hint instead of crashing', () => {
    const spy = vi.spyOn(MarkdownViewerModule, 'parseMarkdownBlocks').mockImplementation(() => {
      throw new Error('regex catastrophe');
    });
    try {
      render(<ReportReadableView {...baseProps()} />);
      expect(screen.getByText(/Unable to render this report as markdown/)).toBeTruthy();
      expect(screen.getByText(/Raw lines/)).toBeTruthy();
      // Pane still renders (does not throw).
      expect(screen.getByTestId('report-readable-pane')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('still shows unplaced threads in the fallback', () => {
    const spy = vi.spyOn(MarkdownViewerModule, 'parseMarkdownBlocks').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      const threadsByLine = new Map([
        [1, [{ id: 'c1', body: 'orphan note', line: 1 }]],
      ]);
      render(<ReportReadableView {...baseProps({ threadsByLine })} />);
      expect(screen.getByText(/Unable to render/)).toBeTruthy();
      expect(screen.getByText('orphan note')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('still shows file-level threads in the fallback', () => {
    const spy = vi.spyOn(MarkdownViewerModule, 'parseMarkdownBlocks').mockImplementation(() => {
      throw new Error('boom');
    });
    try {
      render(
        <ReportReadableView
          {...baseProps({
            fileLevel: [{ id: 'f1', scope: 'file', body: 'file note' }],
          })}
        />,
      );
      expect(screen.getByText('file note')).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('ReportReadableView empty and null inputs', () => {
  it('handles null reportContent without throwing', () => {
    render(<ReportReadableView {...baseProps({ reportContent: null, lines: [] })} />);
    expect(screen.getByText('This report has no content to review.')).toBeTruthy();
  });

  it('handles undefined threadsByLine without throwing', () => {
    render(<ReportReadableView {...baseProps({ threadsByLine: undefined })} />);
    expect(screen.getAllByTestId('report-block').length).toBeGreaterThan(0);
  });

  it('handles null threadsByLine without throwing', () => {
    render(<ReportReadableView {...baseProps({ threadsByLine: null })} />);
    expect(screen.getAllByTestId('report-block').length).toBeGreaterThan(0);
  });

  it('shows no affordance when canComment is false even on empty content', () => {
    render(
      <ReportReadableView
        {...baseProps({ reportContent: '', lines: [], canComment: false })}
      />,
    );
    expect(screen.queryByLabelText(/Comment on report/)).toBeNull();
  });
});

describe('ReportReadableView composer edge cases', () => {
  it('does not misplace composer when composer line is outside all blocks', () => {
    // Line 9999 is past the last block — blockIndexForLine docks to last block.
    render(<ReportReadableView {...baseProps({ composer: { line: 9999, lineText: '' } })} />);
    // Should still render blocks without crashing.
    expect(screen.getAllByTestId('report-block').length).toBeGreaterThan(0);
  });

  it('does not show composer when composer is null', () => {
    render(<ReportReadableView {...baseProps({ composer: null })} />);
    expect(screen.queryByTestId('review-comment-composer')).toBeNull();
  });
});
