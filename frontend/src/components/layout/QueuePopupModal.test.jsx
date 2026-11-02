// @vitest-environment jsdom
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueuePopupModal } from './QueuePopupModal';
import { renderWithKainBain } from '../../testUtils';
import React from 'react';

vi.mock('../../services/api', () => ({
  api: {
    observabilityStatus: vi.fn(async () => ({
      observability: {
        queue: [
          { id: 'task-1', title: 'First', projectName: 'P', currentStageName: 'Work', queueOrder: 1, priorityReason: 'Queued' },
        ],
      },
    })),
    getRunnerMonitor: vi.fn(async () => ({ liveAssignments: [] })),
    systemStatus: vi.fn(async () => ({ build: null })),
    deployChangelog: vi.fn(async () => ({ changelog: null, reason: 'not-baked' })),
  },
}));

import { api } from '../../services/api';

beforeEach(() => {
  vi.clearAllMocks();
  api.observabilityStatus.mockResolvedValue({
    observability: {
      queue: [
        { id: 'task-1', title: 'First', projectName: 'P', currentStageName: 'Work', queueOrder: 1, priorityReason: 'Queued' },
      ],
    },
  });
});

test('opens and lists queue rows in order', async () => {
  const onClose = vi.fn();
  const setSelectedTask = vi.fn();
  renderWithKainBain(<QueuePopupModal counted={2} onClose={onClose} />, { setSelectedTask, engineState: { openQueueDepth: 2 } });
  await waitFor(() => expect(screen.getByTestId('queue-item-task-1')).toBeInTheDocument());
  expect(screen.getByText('First')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('queue-item-task-1'));
  expect(setSelectedTask).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close queue' }));
  expect(onClose).toHaveBeenCalled();
});

test('empty state renders Queue is Clear', async () => {
  api.observabilityStatus.mockResolvedValue({ observability: { queue: [] } });
  renderWithKainBain(<QueuePopupModal counted={0} onClose={() => {}} />, { engineState: { openQueueDepth: 0 } });
  await waitFor(() => expect(screen.getByText('Queue is Clear')).toBeInTheDocument());
});

test('error state shows retry', async () => {
  api.observabilityStatus.mockRejectedValueOnce(new Error('boom'));
  renderWithKainBain(<QueuePopupModal counted={1} onClose={() => {}} />, { engineState: { openQueueDepth: 1 } });
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  api.observabilityStatus.mockResolvedValue({ observability: { queue: [] } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByText('Queue is Clear')).toBeInTheDocument());
});

test('dialog panel carries the shared modal surface (sized, surfaced, clipped)', async () => {
  renderWithKainBain(<QueuePopupModal counted={2} onClose={() => {}} />, { engineState: { openQueueDepth: 2 } });
  const dialog = await screen.findByRole('dialog');
  // Same panel contract as ChangelogModal: bounded width/height, theme
  // surface, rounded border, and overflow clipping — without it the rows
  // float over the page with no panel at all.
  expect(dialog).toHaveClass('max-w-2xl');
  expect(dialog).toHaveClass('bg-surface-container');
  expect(dialog).toHaveClass('overflow-hidden');
});

test('reconciliation note shows counts', async () => {
  renderWithKainBain(<QueuePopupModal counted={3} onClose={() => {}} />, { engineState: { openQueueDepth: 3 } });
  await waitFor(() => expect(screen.getByTestId('queue-reconciliation')).toBeInTheDocument());
  expect(screen.getByTestId('queue-reconciliation')).toHaveTextContent('3 open tasks counted · 1 shown');
});
