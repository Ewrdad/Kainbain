import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CopyableTaskKey } from './CopyableTaskKey';
import { copyToClipboard } from '../../services/clipboard';
import '@testing-library/jest-dom';

vi.mock('../../services/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

/***
 * MARK: CopyableTaskKey tests
 * @description Covers click-to-copy of the full task id: the copied text,
 *   transient feedback, the text-selection guard, missing ids, keyboard
 *   operability, and clipboard failure.
 ***/
describe('CopyableTaskKey', () => {
  const FULL_ID = 'fa5f7234-3efc-47c3-acef-dbcad38150fe';
  const SHORT_KEY = '#KB-FA5F';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(copyToClipboard).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('click copies the full task id, not the short display key', async () => {
    render(<CopyableTaskKey taskId={FULL_ID} label={SHORT_KEY} className="badge" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Copy task ID ${FULL_ID}` }));
    });

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyToClipboard).toHaveBeenCalledWith(FULL_ID);
  });

  test('copied feedback appears then reverts to the display key', async () => {
    vi.useFakeTimers();
    render(
      <CopyableTaskKey taskId={FULL_ID} label={SHORT_KEY} className="badge" copyDelayMs={2000} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Copy task ID ${FULL_ID}` }));
    });
    expect(screen.getByText('Copied ✓')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText(SHORT_KEY)).toBeInTheDocument();
    expect(screen.queryByText('Copied ✓')).not.toBeInTheDocument();
  });

  test('click with an active text selection does not copy', async () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      toString: () => SHORT_KEY,
    });
    render(<CopyableTaskKey taskId={FULL_ID} label={SHORT_KEY} className="badge" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Copy task ID ${FULL_ID}` }));
    });

    expect(copyToClipboard).not.toHaveBeenCalled();
    expect(screen.getByText(SHORT_KEY)).toBeInTheDocument();
  });

  test.each(['', undefined])(
    'click with a missing task id (%p) does not copy and does not throw',
    async (taskId) => {
      render(<CopyableTaskKey taskId={taskId} label={SHORT_KEY} className="badge" />);

      const badge = screen.getByRole('button', { name: 'Copy task ID' });
      expect(badge).toHaveAttribute('aria-label', 'Copy task ID');

      await act(async () => {
        fireEvent.click(badge);
      });

      expect(copyToClipboard).not.toHaveBeenCalled();
      expect(screen.getByText(SHORT_KEY)).toBeInTheDocument();
    },
  );

  test('keyboard users get the same action via a focusable labelled button', async () => {
    render(<CopyableTaskKey taskId={FULL_ID} label={SHORT_KEY} className="badge" />);
    const badge = screen.getByRole('button', { name: `Copy task ID ${FULL_ID}` });

    // Native button semantics: browsers fire click on Enter/Space, and
    // jsdom/happy-dom do not synthesize that click from keyDown — so assert
    // the native semantics plus the activation path the keypress produces.
    expect(badge.tagName).toBe('BUTTON');
    expect(badge).toHaveAttribute('type', 'button');
    expect(badge).toHaveAttribute('title', 'Click to copy task ID');
    badge.focus();
    expect(badge).toHaveFocus();

    await act(async () => {
      fireEvent.click(document.activeElement);
    });
    expect(copyToClipboard).toHaveBeenCalledWith(FULL_ID);
  });

  test('clipboard failure shows no copied state', async () => {
    vi.mocked(copyToClipboard).mockResolvedValue(false);
    render(<CopyableTaskKey taskId={FULL_ID} label={SHORT_KEY} className="badge" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Copy task ID ${FULL_ID}` }));
    });

    expect(copyToClipboard).toHaveBeenCalledWith(FULL_ID);
    expect(screen.queryByText('Copied ✓')).not.toBeInTheDocument();
    expect(screen.getByText(SHORT_KEY)).toBeInTheDocument();
  });

  test('unmount clears the pending revert timer', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { unmount } = render(
      <CopyableTaskKey taskId={FULL_ID} label={SHORT_KEY} className="badge" />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `Copy task ID ${FULL_ID}` }));
    });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
