import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../testUtils';
import { PromptReviewModal } from './PromptReviewModal';
import '@testing-library/jest-dom';

/**
 * MARK: PromptReviewModal tests
 * @description Verifies the "Review Prompt" step: shows the curated prompt
 * read-only (the per-task prompt override feature was removed) and dispatches
 * the task via confirmSubmitTask without any prompt argument.
 */
const previewPrompt = {
  goal: 'Build a feature',
  curatedPrompt: '# Task\nBuild a feature\n\n# Stage\nExecute the task.',
  stageId: '1',
};

test('renders the curated prompt and task goal', () => {
  renderWithKainBain(<PromptReviewModal />, { previewPrompt });
  expect(screen.getByText('Review Prompt')).toBeInTheDocument();
  expect(screen.getByText('Build a feature')).toBeInTheDocument();
  expect(screen.getByLabelText('Curated prompt')).toHaveTextContent(
    '# Task Build a feature # Stage Execute the task.',
  );
});

test('the curated prompt is read-only and has no edit affordance', () => {
  renderWithKainBain(<PromptReviewModal />, { previewPrompt });
  // No editable textbox is rendered anymore.
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Curated prompt (editable)')).not.toBeInTheDocument();
  // The "Reset to Original" override affordance is gone.
  expect(screen.queryByText('Reset to Original')).not.toBeInTheDocument();
});

test('confirming dispatches without sending a prompt', () => {
  const confirmSubmitTask = vi.fn();
  renderWithKainBain(<PromptReviewModal />, {
    previewPrompt,
    activeProjectId: 'proj-1',
    confirmSubmitTask,
  });
  fireEvent.click(screen.getByText('Send to Agent'));
  expect(confirmSubmitTask).toHaveBeenCalledWith('proj-1');
});

test('Ctrl+Enter dispatches without sending a prompt', () => {
  const confirmSubmitTask = vi.fn();
  renderWithKainBain(<PromptReviewModal />, {
    previewPrompt,
    activeProjectId: 'proj-1',
    confirmSubmitTask,
  });
  fireEvent.keyDown(screen.getByLabelText('Curated prompt'), {
    ctrlKey: true,
    key: 'Enter',
  });
  expect(confirmSubmitTask).toHaveBeenCalledWith('proj-1');
});

test('cancel closes the preview without dispatching', () => {
  const cancelPreview = vi.fn();
  renderWithKainBain(<PromptReviewModal />, { previewPrompt, cancelPreview });
  fireEvent.click(screen.getByText('Cancel'));
  expect(cancelPreview).toHaveBeenCalled();
});

test('renders nothing when there is no preview', () => {
  renderWithKainBain(<PromptReviewModal />, { previewPrompt: null });
  expect(screen.queryByText('Review Prompt')).not.toBeInTheDocument();
});
