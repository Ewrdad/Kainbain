import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useModelCatalog } from './useModelCatalog';

/**
 * MARK: useModelCatalog tests
 * @description Verifies the shared model-catalogue fetch hook: succeeds with
 *   the API payload, keeps the caller's fallback list when the API client is
 *   absent / empty / failing, and always resolves `harnesses` to an array.
 */
const FALLBACK = [{ id: 'fallback-model', name: 'Fallback Model', provider: 'google' }];

vi.mock('../services/api', () => ({
  api: { getModels: vi.fn() },
}));

import { api } from '../services/api';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useModelCatalog', () => {
  it('adopts the fetched models and harnesses from the API', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fetched-model', name: 'Fetched', provider: 'google' }],
      harnesses: [{ id: 'pi', label: 'pi', description: 'pi coding-agent harness', models: [] }],
    });

    const { result } = renderHook(() => useModelCatalog(FALLBACK));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.models).toHaveLength(1);
    expect(result.current.models[0].id).toBe('fetched-model');
    expect(result.current.harnesses).toHaveLength(1);
    expect(result.current.harnesses[0].id).toBe('pi');
  });

  it('falls back to the provided list when the API client is unavailable', () => {
    const original = api.getModels;
    delete api.getModels;
    try {
      const { result } = renderHook(() => useModelCatalog(FALLBACK));
      expect(result.current.models).toBe(FALLBACK);
      expect(result.current.harnesses).toEqual([]);
      expect(result.current.loading).toBe(false);
    } finally {
      api.getModels = original;
    }
  });

  it('keeps the fallback list when the API response has no models', async () => {
    api.getModels.mockResolvedValue({ models: [], harnesses: [] });
    const { result } = renderHook(() => useModelCatalog(FALLBACK));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.models).toBe(FALLBACK);
    expect(result.current.harnesses).toEqual([]);
  });

  it('falls back to the provided list when the request rejects', async () => {
    api.getModels.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useModelCatalog(FALLBACK));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.models).toBe(FALLBACK);
    expect(result.current.harnesses).toEqual([]);
  });

  it('normalizes an absent harnesses field to an empty array', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fetched-model', name: 'Fetched', provider: 'google' }],
    });
    const { result } = renderHook(() => useModelCatalog(FALLBACK));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.models[0].id).toBe('fetched-model');
    expect(result.current.harnesses).toEqual([]);
  });

  it('refresh() re-runs discovery past the caches and adopts the new catalogue', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'stale-model', name: 'Stale', provider: 'google' }],
      harnesses: [],
    });
    const { result } = renderHook(() => useModelCatalog(FALLBACK));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.models[0].id).toBe('stale-model');

    api.getModels.mockResolvedValue({
      models: [{ id: 'fresh-model', name: 'Fresh', provider: 'google' }],
      harnesses: [{ id: 'pi', label: 'pi', description: 'pi', models: [] }],
    });
    await act(async () => {
      await result.current.refresh();
    });

    // The refresh bypasses caches (backend ?refresh=true) and the catalogue
    // updates; the refreshing flag settles back to false.
    expect(api.getModels).toHaveBeenLastCalledWith(true);
    expect(result.current.models[0].id).toBe('fresh-model');
    expect(result.current.harnesses[0].id).toBe('pi');
    expect(result.current.refreshing).toBe(false);
  });

  it('refresh() keeps the current catalogue when the request rejects', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'kept-model', name: 'Kept', provider: 'google' }],
      harnesses: [],
    });
    const { result } = renderHook(() => useModelCatalog(FALLBACK));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    api.getModels.mockRejectedValue(new Error('network down'));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.models[0].id).toBe('kept-model');
    expect(result.current.refreshing).toBe(false);
  });
});

describe('useModelCatalog enabled gate (lazy hosts)', () => {
  it('makes no request while disabled and fetches once enabled', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fetched-model', name: 'Fetched', provider: 'google' }],
      harnesses: [{ id: 'pi', label: 'pi', description: 'pi', models: [] }],
    });
    const { result, rerender } = renderHook(
      ({ enabled }) => useModelCatalog(FALLBACK, { enabled }),
      { initialProps: { enabled: false } },
    );

    // A lazily-opened host (an always-mounted modal that is closed) pays
    // nothing on app load.
    expect(api.getModels).not.toHaveBeenCalled();
    expect(result.current.models).toBe(FALLBACK);

    rerender({ enabled: true });
    await waitFor(() => {
      expect(result.current.models[0].id).toBe('fetched-model');
    });
    expect(api.getModels).toHaveBeenCalledTimes(1);
  });

  it('keeps refresh() usable while disabled', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fresh-model', name: 'Fresh', provider: 'google' }],
      harnesses: [],
    });
    const { result } = renderHook(() => useModelCatalog(FALLBACK, { enabled: false }));

    expect(api.getModels).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.refresh();
    });

    expect(api.getModels).toHaveBeenLastCalledWith(true);
    expect(result.current.models[0].id).toBe('fresh-model');
    expect(result.current.refreshing).toBe(false);
  });
});

describe('useModelCatalog alias entry', () => {
  const ALIASES = [{ name: 'small', harness: 'pi', model: 'google::small-model' }];

  it('appends the virtual alias entry with alias names as models', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fetched-model', name: 'Fetched', provider: 'google' }],
      harnesses: [{ id: 'pi', label: 'pi', description: 'pi', models: [] }],
    });
    const { result } = renderHook(() => useModelCatalog(FALLBACK, { aliases: ALIASES }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const aliasEntry = result.current.harnesses.find((h) => h.id === 'alias');
    expect(aliasEntry).toMatchObject({ label: 'Alias', modelSelection: 'list' });
    expect(aliasEntry.models).toEqual([
      { id: 'small', name: 'small', provider: 'alias', key: 'small', harness: 'alias' },
    ]);
  });

  it('lists the alias entry with an empty model list when the project has no aliases', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fetched-model', name: 'Fetched', provider: 'google' }],
      harnesses: [{ id: 'pi', label: 'pi', description: 'pi', models: [] }],
    });
    const { result } = renderHook(() => useModelCatalog(FALLBACK, { aliases: [] }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const aliasEntry = result.current.harnesses.find((h) => h.id === 'alias');
    expect(aliasEntry.models).toEqual([]);
  });

  it('leaves the view untouched when the alias list is unknown (back-compat)', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fetched-model', name: 'Fetched', provider: 'google' }],
      harnesses: [{ id: 'pi', label: 'pi', description: 'pi', models: [] }],
    });
    const { result } = renderHook(() => useModelCatalog(FALLBACK));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.harnesses).toHaveLength(1);
    expect(result.current.harnesses.find((h) => h.id === 'alias')).toBeUndefined();
  });

  it('tracks a changed alias list on re-render with no refresh() call', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fetched-model', name: 'Fetched', provider: 'google' }],
      harnesses: [{ id: 'pi', label: 'pi', description: 'pi', models: [] }],
    });
    const { result, rerender } = renderHook(({ aliases }) => useModelCatalog(FALLBACK, { aliases }), {
      initialProps: { aliases: [] },
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.harnesses.find((h) => h.id === 'alias').models).toEqual([]);

    // A newly added alias appears on the next render — the caller never
    // re-runs discovery for it.
    rerender({ aliases: [{ name: 'small', harness: 'pi', model: 'google::small-model' }] });
    expect(result.current.harnesses.find((h) => h.id === 'alias').models).toEqual([
      { id: 'small', name: 'small', provider: 'alias', key: 'small', harness: 'alias' },
    ]);
    expect(api.getModels).toHaveBeenCalledTimes(1);
  });

  it('keeps an alias named like a harness collision-free (separate entry, exact keys)', async () => {
    api.getModels.mockResolvedValue({
      models: [{ id: 'fetched-model', name: 'Fetched', provider: 'google' }],
      harnesses: [{ id: 'pi', label: 'pi', description: 'pi', models: [] }],
    });
    const { result } = renderHook(() =>
      useModelCatalog(FALLBACK, { aliases: [{ name: 'pi', harness: 'pi', model: 'm' }] }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // The real pi harness still appears exactly once…
    expect(result.current.harnesses.filter((h) => h.id === 'pi')).toHaveLength(1);
    // …and the same-named alias lives only inside the virtual entry, keyed
    // exactly (provider 'alias'), so picker matching cannot confuse the two.
    const aliasEntry = result.current.harnesses.find((h) => h.id === 'alias');
    expect(aliasEntry.models).toEqual([
      { id: 'pi', name: 'pi', provider: 'alias', key: 'pi', harness: 'alias' },
    ]);
  });
});