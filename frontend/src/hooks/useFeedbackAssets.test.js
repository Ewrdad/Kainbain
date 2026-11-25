import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFeedbackAssets } from './useFeedbackAssets';

vi.mock('../services/api', () => ({
  api: { listTaskImages: vi.fn() },
}));

import { api } from '../services/api';

/***
 * MARK: useFeedbackAssets tests
 * @description Verifies the advisory attachment list behind the client
 *   pre-check: names on success, fail-open (`available: false`) when the
 *   listing fails or no task context exists, and a working refresh.
 ***/
describe('useFeedbackAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists attached names on mount', async () => {
    api.listTaskImages.mockResolvedValue({
      images: [{ name: 'a.png' }, { name: 'b.png' }],
    });
    const { result } = renderHook(() => useFeedbackAssets('proj-1', 'task-1'));
    await waitFor(() => {
      expect(result.current.available).toBe(true);
    });
    expect(result.current.names).toEqual(['a.png', 'b.png']);
    expect(api.listTaskImages).toHaveBeenCalledWith('proj-1', 'task-1');
  });

  it('fails open when the listing fails (server still guards)', async () => {
    api.listTaskImages.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useFeedbackAssets('proj-1', 'task-1'));
    await waitFor(() => {
      expect(api.listTaskImages).toHaveBeenCalled();
    });
    // Let the rejection settle into state.
    await waitFor(() => {
      expect(result.current.available).toBe(false);
    });
    expect(result.current.names).toEqual([]);
  });

  it('fails open without task context (no request fired)', async () => {
    const { result } = renderHook(() => useFeedbackAssets(null, null));
    await waitFor(() => {
      expect(result.current.available).toBe(false);
    });
    expect(api.listTaskImages).not.toHaveBeenCalled();
    expect(result.current.names).toEqual([]);
  });

  it('refresh re-lists and returns the fresh names', async () => {
    api.listTaskImages
      .mockResolvedValueOnce({ images: [] })
      .mockResolvedValueOnce({ images: [{ name: 'fresh.png' }] });
    const { result } = renderHook(() => useFeedbackAssets('proj-1', 'task-1'));
    await waitFor(() => {
      expect(result.current.available).toBe(true);
    });
    expect(result.current.names).toEqual([]);
    const fresh = await result.current.refresh();
    expect(fresh).toEqual({ names: ['fresh.png'], available: true });
    await waitFor(() => {
      expect(result.current.names).toEqual(['fresh.png']);
    });
  });

  it('refresh reports unavailable when the listing fails', async () => {
    api.listTaskImages.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useFeedbackAssets('proj-1', 'task-1'));
    await waitFor(() => {
      expect(api.listTaskImages).toHaveBeenCalled();
    });
    const fresh = await result.current.refresh();
    expect(fresh).toEqual({ names: [], available: false });
  });
});
