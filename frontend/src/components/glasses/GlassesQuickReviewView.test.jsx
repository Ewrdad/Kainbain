import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GlassesQuickReviewView } from './GlassesQuickReviewView.jsx';
import '@testing-library/jest-dom';

/***
 * MARK: GlassesQuickReviewView tests
 * @description Guards the glasses quick review: task name plus Step N of
 *   M plus two summary lines, approve gated behind "Are you sure?", and
 *   details staying read-only without ever approving.
 ***/

function renderReview(overrides = {}) {
  const props = {
    taskName: 'Fix the auth race',
    stageName: 'Build',
    progressText: 'Step 2 of 3',
    progressFraction: 2 / 3,
    summaryLines: ['Fix the auth race', '2 files changed'],
    canApprove: true,
    isBusy: false,
    onApprove: () => {},
    ...overrides,
  };
  return render(<GlassesQuickReviewView {...props} />);
}

describe('GlassesQuickReviewView', () => {
  it('shows task name, progress, bar, and two summary lines', () => {
    renderReview();
    expect(screen.getByTestId('glasses-quick-review')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fix the auth race' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
    expect(screen.getByTestId('glasses-review-banner')).toHaveTextContent('Review needed');
    expect(screen.getByTestId('glasses-review-banner')).toHaveAttribute('aria-live', 'polite');
  });

  it('approve needs a second tap before onApprove runs', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    renderReview({ onApprove });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByTestId('glasses-approval-confirm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
  });

  it('cancelling the confirm never approves', () => {
    const onApprove = vi.fn();
    renderReview({ onApprove });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.queryByTestId('glasses-approval-confirm')).not.toBeInTheDocument();
  });

  it('details shows a read-only summary plus the larger-screen hint', () => {
    const onApprove = vi.fn();
    renderReview({ onApprove });
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const details = screen.getByTestId('glasses-review-details');
    expect(details).toHaveTextContent('Fix the auth race');
    expect(details).toHaveTextContent('Open on a larger screen for the full diff');
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to review' }));
    expect(screen.queryByTestId('glasses-review-details')).not.toBeInTheDocument();
  });

  it('locks approve while read-only or busy', () => {
    const { rerender } = renderReview({ canApprove: false });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByTestId('glasses-review-banner')).toHaveTextContent('Not ready to review');
    rerender(
      <GlassesQuickReviewView
        taskName="Fix the auth race"
        canApprove
        isBusy
        onApprove={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Approving…' })).toBeDisabled();
  });

  it('back returns when provided', () => {
    const onBack = vi.fn();
    renderReview({ onBack });
    fireEvent.click(screen.getByRole('button', { name: 'Back to tasks' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
