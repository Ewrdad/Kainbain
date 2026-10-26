import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileDiffList } from './FileDiffList';

beforeEach(() => {
  window.localStorage.clear();
});

/***
 * MARK: FileDiffList tests
 * @description Verifies the changed-file sidebar: per-file rows with status
 *   chips, +/- counts, total counts, search filtering, viewed state, and the
 *   select (scroll-to) callback.
 */
const files = [
  { path: 'src/app.js', status: 'modified', additions: 12, deletions: 4 },
  { path: 'src/new.js', status: 'added', additions: 30, deletions: 0 },
  { path: 'src/gone.js', status: 'deleted', additions: 0, deletions: 9, binary: true },
];

describe('FileDiffList', () => {
  it('renders rows with counts and the totals header', () => {
    render(<FileDiffList files={files} viewedFiles={new Set()} />);
    expect(screen.getByText('3 files changed')).toBeTruthy();
    expect(screen.getByText('+42')).toBeTruthy();
    expect(screen.getByText('−13')).toBeTruthy();
    expect(screen.getByText('src/app.js')).toBeTruthy();
    expect(screen.getByText('src/new.js')).toBeTruthy();
    expect(screen.getByText('src/gone.js')).toBeTruthy();
    expect(screen.getByText('(binary)')).toBeTruthy();
  });

  it('filters rows by the search box', async () => {
    render(<FileDiffList files={files} viewedFiles={new Set()} />);
    fireEvent.change(screen.getByLabelText('Filter changed files'), {
      target: { value: 'new' },
    });
    expect(screen.getByText('src/new.js')).toBeTruthy();
    expect(screen.queryByText('src/app.js')).toBeNull();

    fireEvent.change(screen.getByLabelText('Filter changed files'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No files match “zzz”.')).toBeTruthy();
  });

  it('reflects and toggles the viewed state', () => {
    const onToggleViewed = vi.fn();
    render(
      <FileDiffList
        files={files}
        viewedFiles={new Set(['src/app.js'])}
        onToggleViewed={onToggleViewed}
      />,
    );
    const viewed = screen.getByLabelText('Mark src/app.js as viewed');
    expect(viewed.checked).toBe(true);
    expect(screen.getByLabelText('Mark src/new.js as viewed').checked).toBe(false);
    fireEvent.click(viewed);
    expect(onToggleViewed).toHaveBeenCalledWith('src/app.js');
  });

  it('emits onSelectFile when a row is clicked', () => {
    const onSelectFile = vi.fn();
    render(<FileDiffList files={files} viewedFiles={new Set()} onSelectFile={onSelectFile} />);
    fireEvent.click(screen.getByText('src/new.js'));
    expect(onSelectFile).toHaveBeenCalledWith('src/new.js');
  });

  it('renders an empty state for no files', () => {
    render(<FileDiffList files={[]} viewedFiles={new Set()} />);
    expect(screen.getByText('0 files changed')).toBeTruthy();
  });

  it('restores the file filter from localStorage after refresh', () => {
    window.localStorage.setItem('kainbain:review:fileFilter', JSON.stringify('new'));
    render(<FileDiffList files={files} viewedFiles={new Set()} />);
    expect(screen.getByLabelText('Filter changed files')).toHaveValue('new');
    expect(screen.getByText('src/new.js')).toBeTruthy();
    expect(screen.queryByText('src/app.js')).toBeNull();
  });

  it('flushes the file filter to localStorage on unmount (refresh)', () => {
    const { unmount } = render(<FileDiffList files={files} viewedFiles={new Set()} />);
    fireEvent.change(screen.getByLabelText('Filter changed files'), {
      target: { value: 'gone' },
    });
    unmount();
    expect(window.localStorage.getItem('kainbain:review:fileFilter')).toBe(
      JSON.stringify('gone'),
    );
  });

  it('falls back to an empty filter on corrupt storage', () => {
    window.localStorage.setItem('kainbain:review:fileFilter', 'not-json{{{');
    render(<FileDiffList files={files} viewedFiles={new Set()} />);
    expect(screen.getByLabelText('Filter changed files')).toHaveValue('');
    expect(screen.getByText('src/app.js')).toBeTruthy();
  });
});