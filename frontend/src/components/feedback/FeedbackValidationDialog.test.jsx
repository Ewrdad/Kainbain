import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeedbackValidationDialog } from './FeedbackValidationDialog';

vi.mock('../tasks/TaskImageAttach', () => ({
  TaskImageAttach: ({ onUploadedBatch }) => (
    <button
      type="button"
      data-testid="mock-attach"
      onClick={() => onUploadedBatch?.([{ name: 'a.png', path: 'assets/a.png' }])}
    >
      Mock attach
    </button>
  ),
}));

/***
 * MARK: FeedbackValidationDialog tests
 * @description Verifies the blocking recovery dialog: every missing file is
 *   named, the image-only case asks for a description, and each recovery
 *   exit (attach inline, words-only, back to editing) reaches its handler.
 ***/
describe('FeedbackValidationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names every missing file', () => {
    render(
      <FeedbackValidationDialog
        missing={['assets/a.png', 'assets/b.png']}
        imageOnly={false}
        canStrip
        onStripToTextOnly={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('feedback-validation-dialog')).toBeTruthy();
    expect(screen.getByText('Attached file missing')).toBeTruthy();
    expect(screen.getByText('assets/a.png')).toBeTruthy();
    expect(screen.getByText('assets/b.png')).toBeTruthy();
  });

  it('asks for a description on image-only drafts', () => {
    render(
      <FeedbackValidationDialog
        missing={[]}
        imageOnly
        minProseChars={10}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Describe the pictures')).toBeTruthy();
    expect(screen.queryByText('Send words-only')).toBe(null);
  });

  it('offers attach-inline plus words-only recovery exits', () => {
    const onUploadedBatch = vi.fn();
    const onStripToTextOnly = vi.fn();
    const onClose = vi.fn();
    render(
      <FeedbackValidationDialog
        missing={['assets/a.png']}
        imageOnly={false}
        projectId="proj-1"
        taskId="task-1"
        onUploadedBatch={onUploadedBatch}
        onStripToTextOnly={onStripToTextOnly}
        canStrip
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('mock-attach'));
    expect(onUploadedBatch).toHaveBeenCalledWith([
      { name: 'a.png', path: 'assets/a.png' },
    ]);
    fireEvent.click(screen.getByText('Send words-only'));
    expect(onStripToTextOnly).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Back to editing'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the attach exit without task context', () => {
    render(
      <FeedbackValidationDialog
        missing={['assets/a.png']}
        imageOnly={false}
        canStrip
        onStripToTextOnly={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('mock-attach')).toBe(null);
    expect(screen.getByText('Send words-only')).toBeTruthy();
  });
});
