// jsdom pin: this suite needs submit-button form submission (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithKainBain } from '../testUtils';
import { KainBainContext } from '../context/KainBainContext';
import { FeedbackDialog } from './FeedbackDialog';
import '@testing-library/jest-dom';

vi.mock('../services/api', () => ({
  API_BASE: 'http://api.test',
  api: {
    listTaskImages: vi.fn(),
    uploadTaskImage: vi.fn(),
    deleteTaskImage: vi.fn(),
  },
}));

import { api } from '../services/api';

beforeEach(() => {
  vi.clearAllMocks();
  api.listTaskImages.mockResolvedValue({ images: [] });
});

/**
 * MARK: FeedbackDialog tests
 * @description Verifies the enhanced human review flow: rejecting a task
 * opens a dialog for correction/feedback which is sent back to the agent.
 */
const task = { id: 'task-1', goal: 'Implement the API' };

test('renders the task and feedback textarea', () => {
  renderWithKainBain(<FeedbackDialog />, { feedbackTask: task });
  expect(screen.getByText('Reject with Feedback')).toBeInTheDocument();
  expect(screen.getByText('Implement the API')).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/unit tests/i)).toBeInTheDocument();
});

test('submitting feedback calls rejectTaskWithFeedback', () => {
  const rejectTaskWithFeedback = vi.fn();
  renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback,
  });
  fireEvent.change(screen.getByPlaceholderText(/unit tests/i), {
    target: { value: 'Please add tests.' },
  });
  fireEvent.click(screen.getByText('Reject & Retry'));
  expect(rejectTaskWithFeedback).toHaveBeenCalledWith('proj-1', 'task-1', 'Please add tests.');
});

test('does not submit empty feedback', () => {
  const rejectTaskWithFeedback = vi.fn();
  renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback,
  });
  const button = screen.getByRole('button', { name: /Reject & Retry/i });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(rejectTaskWithFeedback).not.toHaveBeenCalled();
});

test('shows a loading state and disables the submit button while rejecting', async () => {
  let resolveReject;
  const rejectTaskWithFeedback = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveReject = resolve;
      }),
  );
  renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback,
  });

  fireEvent.change(screen.getByPlaceholderText(/unit tests/i), {
    target: { value: 'Please add tests.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Reject & Retry/i }));

  // While the backend has not yet responded the button is disabled and the
  // dialog shows the in-flight loading state.
  expect(rejectTaskWithFeedback).toHaveBeenCalledWith('proj-1', 'task-1', 'Please add tests.');
  const rejectingButton = screen.getByRole('button', { name: /Rejecting\.\.\./i });
  expect(rejectingButton).toBeDisabled();
  expect(rejectingButton).toHaveAttribute('aria-busy', 'true');

  // A second click while in-flight does not record the rejection twice.
  fireEvent.click(rejectingButton);
  expect(rejectTaskWithFeedback).toHaveBeenCalledTimes(1);

  // Once the backend has responded, the button returns to its idle state.
  await act(async () => {
    resolveReject();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Reject & Retry/i })).toBeEnabled();
  });
});

test('a fast double-click only records the rejection once', async () => {
  const rejectTaskWithFeedback = vi.fn().mockResolvedValue({});
  renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback,
  });

  fireEvent.change(screen.getByPlaceholderText(/unit tests/i), {
    target: { value: 'Please add tests.' },
  });
  const button = screen.getByRole('button', { name: /Reject & Retry/i });
  fireEvent.click(button);
  fireEvent.click(button); // second click before the backend has responded

  await waitFor(() => {
    expect(rejectTaskWithFeedback).toHaveBeenCalledTimes(1);
  });
});

test('renders nothing when no task is being rejected', () => {
  renderWithKainBain(<FeedbackDialog />, { feedbackTask: null });
  expect(screen.queryByText('Reject with Feedback')).not.toBeInTheDocument();
});

/**
 * MARK: FeedbackDialog image-attach tests
 * @description The reject dialog composes the shared TaskImageAttach affordance:
 *   uploads land in the task's assets/ folder and their markdown reference is
 *   appended to the submitted feedback; removal strips it again.
 */
function pickFile(container, file) {
  const input = container.querySelector('[data-testid="task-image-input"]');
  fireEvent.change(input, { target: { files: [file] } });
}

const pngFile = (name = 'shot.png') =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

test('attaching an image appends its markdown ref to the submitted feedback', async () => {
  const rejectTaskWithFeedback = vi.fn().mockResolvedValue({});
  api.uploadTaskImage.mockResolvedValue({ name: 'shot.png', path: 'assets/shot.png' });
  const { container } = renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback,
  });

  fireEvent.change(screen.getByPlaceholderText(/unit tests/i), {
    target: { value: 'The button overlaps the label.' },
  });
  await act(async () => {
    pickFile(container, pngFile());
  });

  await waitFor(() => {
    expect(screen.getByPlaceholderText(/unit tests/i).value).toContain(
      '![shot.png](assets/shot.png)',
    );
  });
  fireEvent.click(screen.getByRole('button', { name: /Reject & Retry/i }));
  await waitFor(() => {
    expect(rejectTaskWithFeedback).toHaveBeenCalledWith(
      'proj-1',
      'task-1',
      expect.stringContaining('![shot.png](assets/shot.png)'),
    );
  });
  expect(rejectTaskWithFeedback.mock.calls[0][2]).toContain('The button overlaps the label.');
});

test('removing an attached image strips its markdown ref from the draft', async () => {
  api.listTaskImages.mockResolvedValue({
    images: [{ name: 'shot.png', path: 'assets/shot.png', size: 3 }],
  });
  api.uploadTaskImage.mockResolvedValue({ name: 'shot.png', path: 'assets/shot.png' });
  api.deleteTaskImage.mockResolvedValue({ status: 'deleted' });
  renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback: vi.fn(),
  });

  // The draft carries the uploaded reference...
  const textarea = screen.getByPlaceholderText(/unit tests/i);
  fireEvent.change(textarea, { target: { value: 'The button overlaps the label.' } });
  const input = document.querySelector('[data-testid="task-image-input"]');
  await act(async () => {
    fireEvent.change(input, { target: { files: [pngFile()] } });
  });
  await waitFor(() => expect(textarea.value).toContain('![shot.png](assets/shot.png)'));

  // ...and removing the thumbnail takes it back out, keeping the prose.
  fireEvent.click(await screen.findByTestId('task-image-remove-shot.png'));
  await waitFor(() =>
    expect(api.deleteTaskImage).toHaveBeenCalledWith('proj-1', 'task-1', 'shot.png'),
  );
  await waitFor(() => expect(textarea.value).not.toContain('shot.png'));
  expect(textarea.value).toBe('The button overlaps the label.');
});

test('multi-select links every image in order in one update', async () => {
  api.uploadTaskImage.mockImplementation(async (projectId, taskId, file) => ({
    name: file.name,
    path: `assets/${file.name}`,
  }));
  const { container } = renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback: vi.fn(),
  });

  const textarea = screen.getByPlaceholderText(/unit tests/i);
  fireEvent.change(textarea, { target: { value: 'Overlaps.' } });
  const input = container.querySelector('[data-testid="task-image-input"]');
  const files = ['a.png', 'b.png', 'c.png'].map((name) => pngFile(name));
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });

  await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(textarea.value).toContain('![c.png](assets/c.png)'));
  const idxA = textarea.value.indexOf('![a.png](assets/a.png)');
  const idxB = textarea.value.indexOf('![b.png](assets/b.png)');
  const idxC = textarea.value.indexOf('![c.png](assets/c.png)');
  expect(idxA).toBeGreaterThanOrEqual(0);
  expect(idxA).toBeLessThan(idxB);
  expect(idxB).toBeLessThan(idxC);
});

test('pasting a screenshot into the feedback textarea uploads it', async () => {
  api.uploadTaskImage.mockResolvedValue({ name: 'pasted.png', path: 'assets/pasted.png' });
  renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback: vi.fn(),
  });

  const textarea = screen.getByPlaceholderText(/unit tests/i);
  const event = new Event('paste', { bubbles: true, cancelable: true });
  event.clipboardData = { files: [pngFile('pasted.png')] };
  textarea.dispatchEvent(event);

  await waitFor(() =>
    expect(api.uploadTaskImage).toHaveBeenCalledWith('proj-1', 'task-1', expect.any(File)),
  );
  await waitFor(() => expect(textarea.value).toContain('![pasted.png](assets/pasted.png)'));
});

test('submit stays disabled while an image upload is in flight', async () => {
  let resolveUpload;
  api.uploadTaskImage.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveUpload = () => resolve({ name: 'shot.png', path: 'assets/shot.png' });
      }),
  );
  const { container } = renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback: vi.fn(),
  });

  fireEvent.change(screen.getByPlaceholderText(/unit tests/i), {
    target: { value: 'The button overlaps the label.' },
  });
  pickFile(container, pngFile());

  // The upload has started but not resolved: Reject stays disabled so the
  // rejection cannot go out before its screenshot reference lands.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Reject & Retry/i })).toBeDisabled();
  });

  await act(async () => {
    resolveUpload();
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Reject & Retry/i })).toBeEnabled();
  });
  expect(screen.getByPlaceholderText(/unit tests/i).value).toContain(
    '![shot.png](assets/shot.png)',
  );
});

test('switching tasks resets the feedback draft including image refs', async () => {
  api.uploadTaskImage.mockResolvedValue({ name: 'shot.png', path: 'assets/shot.png' });
  const rendered = renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback: vi.fn(),
  });

  fireEvent.change(screen.getByPlaceholderText(/unit tests/i), {
    target: { value: 'The button overlaps the label.' },
  });
  await act(async () => {
    pickFile(rendered.container, pngFile());
  });
  await waitFor(() =>
    expect(screen.getByPlaceholderText(/unit tests/i).value).toContain('shot.png'),
  );

  rendered.rerender(
    <MemoryRouter initialEntries={['/']}>
      <KainBainContext.Provider
        value={{ ...rendered.value, feedbackTask: { id: 'task-2', goal: 'Another task' } }}
      >
        <FeedbackDialog />
      </KainBainContext.Provider>
    </MemoryRouter>,
  );
  expect(screen.getByPlaceholderText(/unit tests/i).value).toBe('');
});

test('keeps the dialog open with the draft intact when rejecting fails', async () => {
  const rejectTaskWithFeedback = vi.fn().mockRejectedValue(new Error('backend down'));
  renderWithKainBain(<FeedbackDialog />, {
    feedbackTask: task,
    activeProjectId: 'proj-1',
    rejectTaskWithFeedback,
  });
  fireEvent.change(screen.getByPlaceholderText(/unit tests/i), {
    target: { value: 'Please add tests.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Reject & Retry/i }));
  await waitFor(() => {
    expect(rejectTaskWithFeedback).toHaveBeenCalledTimes(1);
  });
  // The failure surfaces through the notification layer; the dialog returns
  // to idle with the draft preserved for a retry.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Reject & Retry/i })).toBeEnabled();
  });
  expect(screen.getByText('Reject with Feedback')).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/unit tests/i).value).toBe('Please add tests.');
});
