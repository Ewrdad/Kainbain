import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiffView } from './DiffView';

vi.mock('../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

/***
 * MARK: DiffView tests
 * @description Verifies the per-file diff renderer: file header (status chip,
 *   +/- counts, path + oldPath, binary/tooLarge badges), hunk headers, line
 *   gutters, per-line ⊕ comment composer wiring, file-level comments, the
 *   Viewed checkbox, collapse behavior, and stale-thread rendering.
 */
const DIFF_PATCH = [
  'diff --git a/src/app.js b/src/app.js',
  '--- a/src/app.js',
  '+++ b/src/app.js',
  '@@ -1,3 +1,4 @@ function main() {',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' return a + b;',
].join('\n');

const baseFile = {
  path: 'src/app.js',
  status: 'modified',
  additions: 2,
  deletions: 1,
  binary: false,
  tooLarge: false,
  diff: DIFF_PATCH,
};

const noop = () => {};
const threadFor = (container, id) =>
  container.querySelector(`[data-comment-id="${id}"]`);

describe('DiffView', () => {
  let handlers;

  beforeEach(() => {
    handlers = {
      onToggleViewed: vi.fn(),
      addComment: vi.fn().mockResolvedValue({ id: 'rc-1' }),
      onReply: vi.fn().mockResolvedValue({ id: 'rep-1' }),
      onUpdate: vi.fn().mockResolvedValue({}),
      onDelete: vi.fn().mockResolvedValue(true),
    };
  });

  it('renders the file header with status chip, path, and +/- counts', () => {
    const { container } = render(
      <DiffView file={baseFile} viewedFiles={new Set()} {...handlers} headSha="sha-2" />,
    );
    expect(container.querySelector('[data-testid="diff-view"][data-file-path="src/app.js"]')).toBeTruthy();
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByText('−1')).toBeTruthy();
    expect(screen.getByText('modified')).toBeTruthy();
  });

  it('renders hunk header and old/new line numbers in the two gutters', () => {
    render(<DiffView file={baseFile} viewedFiles={new Set()} {...handlers} />);
    expect(screen.getByText(/@@ -1,3 \+1,4 @@/)).toBeTruthy();
    expect(screen.getByText('function main() {')).toBeTruthy();
    // Old line numbers column and new line numbers column both render.
    const rows = screen.getAllByText('1');
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Line 3 appears in both the old and the new gutter (context line).
    expect(screen.getAllByText('3').length).toBe(2);
    expect(screen.getByText('4')).toBeTruthy(); // new line 4 (added)
  });

  it('opens a line composer from the ⊕ gutter and submits with scope/line/side (A2)', async () => {
    const { container } = render(
      <DiffView file={baseFile} viewedFiles={new Set()} {...handlers} headSha="sha-2" />,
    );
    const addButtons = screen.getAllByLabelText(/Add comment on new line/);
    expect(addButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(addButtons[0]); // first added/context line (new line 1)
    const composer = container.querySelector('[data-testid="review-comment-composer"]');
    expect(composer).toBeTruthy();
    const textarea = composer.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'Null case ignored' } });
    fireEvent.submit(composer.querySelector('form') || composer);
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(handlers.addComment).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'line',
          filePath: 'src/app.js',
          line: 1,
          side: 'right',
          headSha: 'sha-2',
          body: 'Null case ignored',
        }),
      );
    });
  });

  it('anchors line comments on deleted lines to the old side (left)', async () => {
    const { container } = render(
      <DiffView file={baseFile} viewedFiles={new Set()} {...handlers} headSha="sha-2" />,
    );
    fireEvent.click(screen.getByLabelText('Add comment on old line 2'));
    const composer = container.querySelector('[data-testid="review-comment-composer"]');
    fireEvent.change(composer.querySelector('textarea'), {
      target: { value: 'Why was this removed?' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(handlers.addComment).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'line', line: 2, side: 'left' }),
      );
    });
  });

  it('opens a file-level composer from the file header (A3)', async () => {
    const { container } = render(
      <DiffView file={baseFile} viewedFiles={new Set()} {...handlers} headSha="sha-2" />,
    );
    fireEvent.click(screen.getByLabelText('Comment on file src/app.js'));
    const composer = container.querySelector('[data-testid="review-comment-composer"]');
    fireEvent.change(composer.querySelector('textarea'), { target: { value: 'File-level note' } });
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(handlers.addComment).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'file',
          filePath: 'src/app.js',
          headSha: 'sha-2',
          body: 'File-level note',
        }),
      );
    });
  });

  it('renders inline threads under their anchored line and file-level threads above the diff', () => {
    const comments = [
      { id: 'rc-line', filePath: 'src/app.js', line: 1, side: 'right', scope: 'line', body: 'line note' },
      { id: 'rc-file', filePath: 'src/app.js', scope: 'file', body: 'file note' },
      { id: 'rc-other', filePath: 'other.js', scope: 'file', body: 'not mine' },
    ];
    render(<DiffView file={baseFile} comments={comments} viewedFiles={new Set()} {...handlers} />);
    expect(screen.getByText('line note')).toBeTruthy();
    expect(screen.getByText('file note')).toBeTruthy();
    // A comment for another file must not leak into this file's view.
    expect(screen.queryByText('not mine')).toBeNull();
  });

  it('shows the Viewed checkbox and forwards toggles', () => {
    render(
      <DiffView
        file={baseFile}
        viewedFiles={new Set(['src/app.js'])}
        {...handlers}
      />,
    );
    const checkbox = screen.getByLabelText('Mark src/app.js as viewed');
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(handlers.onToggleViewed).toHaveBeenCalledWith('src/app.js');
  });

  it('collapses the diff and reports the number of line threads', () => {
    const comments = [
      { id: 'rc-1', filePath: 'src/app.js', line: 1, side: 'right', scope: 'line', body: 'note' },
    ];
    render(
      <DiffView file={baseFile} comments={comments} viewedFiles={new Set()} {...handlers} />,
    );
    fireEvent.click(screen.getByLabelText('Collapse file diff'));
    expect(screen.getByText('Diff collapsed · 1 threads on lines')).toBeTruthy();
    expect(screen.queryByText(/@@ -1,3 \+1,4 @@/)).toBeNull();
  });

  it('renders the binary and too-large states without a diff body', () => {
    const { rerender } = render(
      <DiffView file={{ ...baseFile, binary: true, diff: 'Binary files differ' }} viewedFiles={new Set()} {...handlers} />,
    );
    expect(screen.getByText('Binary file not shown.')).toBeTruthy();

    rerender(
      <DiffView
        file={{ ...baseFile, tooLarge: true, diff: null, additions: 900, deletions: 100 }}
        viewedFiles={new Set()}
        {...handlers}
      />,
    );
    expect(screen.getByText(/Diff too large to render \(1000 changed lines\)/)).toBeTruthy();
  });

  it('renders the "no textual diff" state for an empty patch', () => {
    render(<DiffView file={{ ...baseFile, diff: null }} viewedFiles={new Set()} {...handlers} />);
    expect(screen.getByText('No textual diff available for this file.')).toBeTruthy();
  });

  it('renders renamed files with old → new path', () => {
    render(
      <DiffView
        file={{ ...baseFile, status: 'renamed', oldPath: 'src/old.js' }}
        viewedFiles={new Set()}
        {...handlers}
      />,
    );
    expect(screen.getByText(/src\/app\.js/)).toBeTruthy();
    expect(screen.getByText(/← src\/old\.js/)).toBeTruthy();
  });

  it('marks threads stale when headSha mismatches (A6)', () => {
    const comments = [
      { id: 'rc-1', filePath: 'src/app.js', line: 1, side: 'right', scope: 'line', headSha: 'old-sha', body: 'note' },
    ];
    const { container } = render(
      <DiffView file={baseFile} comments={comments} viewedFiles={new Set()} {...handlers} headSha="new-sha" />,
    );
    expect(screen.getByText('Outdated')).toBeTruthy();
    expect(threadFor(container, 'rc-1')).toBeTruthy();
  });

  it('hides comment affordances when canComment is false (read-only)', () => {
    render(
      <DiffView file={baseFile} viewedFiles={new Set()} {...handlers} canComment={false} />,
    );
    expect(screen.queryByLabelText(/Add comment on new line/)).toBeNull();
    expect(screen.queryByLabelText('Comment on file src/app.js')).toBeNull();
    // Viewed checkbox stays available in read-only mode.
    expect(screen.getByLabelText('Mark src/app.js as viewed')).toBeTruthy();
  });
});