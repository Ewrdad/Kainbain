// @vitest-environment jsdom
import { expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useScheduledQueue } from './useScheduledQueue';

vi.mock('../services/api', () => ({
  api: {
    observabilityStatus: vi.fn(),
  },
}));

vi.mock('../services/observabilityEvents', () => ({
  subscribeObservability: vi.fn(() => () => {}),
}));

import { api } from '../services/api';
import { subscribeObservability } from '../services/observabilityEvents';

beforeEach(() => {
  vi.clearAllMocks();
  api.observabilityStatus.mockResolvedValue({ observability: { queue: [] } });
});

test('does not fetch when disabled', async () => {
  renderHook(() => useScheduledQueue({ projectScope: 'all', enabled: false }));
  await new Promise((r) => setTimeout(r, 50));
  expect(api.observabilityStatus).not.toHaveBeenCalled();
});

test('fetches when enabled', async () => {
  api.observabilityStatus.mockResolvedValue({ observability: { queue: [{ id: 'a' }] } });
  const { result } = renderHook(() => useScheduledQueue({ projectScope: 'all', enabled: true }));
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(api.observabilityStatus).toHaveBeenCalled();
});

test('error state', async () => {
  api.observabilityStatus.mockRejectedValueOnce(new Error('boom'));
  const { result } = renderHook(() => useScheduledQueue({ projectScope: 'all', enabled: true }));
  await waitFor(() => expect(result.current.error).toBeTruthy());
});

test('empty state', async () => {
  api.observabilityStatus.mockResolvedValue({ observability: { queue: [] } });
  const { result } = renderHook(() => useScheduledQueue({ projectScope: 'all', enabled: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.items).toEqual([]);
});

test('refreshes on observability events (debounced follow-up fetch)', async () => {
  api.observabilityStatus.mockResolvedValue({ observability: { queue: [{ id: 'a' }] } });
  const { result } = renderHook(() => useScheduledQueue({ projectScope: 'all', enabled: true }));
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(api.observabilityStatus).toHaveBeenCalledTimes(1);

  const subscriber = subscribeObservability.mock.calls[0][0];
  act(() => {
    subscriber({ type: 'tasks-changed' });
  });
  await waitFor(() => expect(api.observabilityStatus).toHaveBeenCalledTimes(2), { timeout: 3000 });
});

test('project-scoped hook ignores events for other projects', async () => {
  api.observabilityStatus.mockResolvedValue({ observability: { queue: [] } });
  const { result } = renderHook(() => useScheduledQueue({ projectScope: 'proj-1', enabled: true }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(api.observabilityStatus).toHaveBeenCalledTimes(1);

  const subscriber = subscribeObservability.mock.calls[0][0];
  act(() => {
    subscriber({ type: 'tasks-changed', projectId: 'other-proj' });
  });
  await new Promise((r) => setTimeout(r, 700));
  expect(api.observabilityStatus).toHaveBeenCalledTimes(1);
});
