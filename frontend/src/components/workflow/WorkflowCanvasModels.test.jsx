import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/**
 * MARK: WorkflowCanvas model status tests
 * @description Verifies the stage-model override dropdown against a mocked,
 *   credential-enriched /compute/models payload: status badges render on the
 *   grouped options of the shared harness-first ModelSelector, the empty-value
 *   inherit choice stays badge-free, and a failed model fetch falls back to
 *   the DE-STALED curated list (ollama-cloud entries only — the removed stale
 *   google/anthropic fallback models never reappear, and unenriched fallback
 *   entries carry no badge).
 */

const enrichedModels = vi.hoisted(() => [
  {
    id: 'deepseek-v4-flash:0731-cloud',
    name: 'DeepSeek v4 Flash (Cloud)',
    provider: 'ollama-cloud',
    key: 'pi::ollama-cloud::deepseek-v4-flash:0731-cloud',
    harness: 'pi',
    runnable: true,
    authConfigured: true,
    authSource: 'models_json_key',
    authLabel: 'models.json',
    statusLabel: 'Ready',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    key: 'pi::google::gemini-2.5-pro',
    harness: 'pi',
    runnable: false,
    authConfigured: false,
    statusLabel: 'No credentials',
  },
]);

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...(actual.api || {}),
      getModels: vi.fn().mockResolvedValue({
        models: enrichedModels,
        harnesses: [
          {
            id: 'pi',
            label: 'pi',
            description: 'pi coding-agent harness',
            models: enrichedModels,
          },
        ],
      }),
    },
  };
});

import { api } from '../../services/api';
import { FALLBACK_MODELS } from '../stageTypes';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  vi.clearAllMocks();
  api.getModels.mockResolvedValue({
    models: enrichedModels,
    harnesses: [
      {
        id: 'pi',
        label: 'pi',
        description: 'pi coding-agent harness',
        models: enrichedModels,
      },
    ],
  });
});

const agentStage = [{ id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas.' }];

async function openStageModelDropdown() {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: agentStage,
    tasks: [],
    activeProjectId: 'proj-1',
    handleUpdateStage: vi.fn(),
  });

  // Open the in-column stage settings drawer first.
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: 'Model for Idea' })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'Model for Idea' }));
  await waitFor(() => {
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
}

test('stage-model dropdown options carry credential-status badges', async () => {
  await openStageModelDropdown();

  const readyOption = screen.getByRole('option', { name: /DeepSeek v4 Flash/i });
  expect(within(readyOption).getByText('Ready')).toBeInTheDocument();

  const uncredentialedOption = screen.getByRole('option', { name: /Gemini 2\.5 Pro/i });
  expect(within(uncredentialedOption).getByText('No credentials')).toBeInTheDocument();

  // The inherit option stays badge-free.
  const inheritOption = screen.getByRole('option', { name: 'Inherit Project Default' });
  expect(within(inheritOption).queryByText('Ready')).not.toBeInTheDocument();
  expect(within(inheritOption).queryByText('No credentials')).not.toBeInTheDocument();
});

test('failed model fetch falls back to the de-staled curated list (no stale providers)', async () => {
  api.getModels.mockRejectedValue(new Error('api down'));

  await openStageModelDropdown();

  // The offline fallback renders — the de-staled curated list (ollama-cloud
  // entries only). The removed stale google/anthropic fallback models must
  // never reappear, and unenriched fallback entries carry NO badge.
  expect(screen.getByText('ollama-cloud')).toBeInTheDocument();
  expect(screen.queryByText('google')).not.toBeInTheDocument();
  expect(screen.queryByText('anthropic')).not.toBeInTheDocument();
  for (const model of FALLBACK_MODELS) {
    expect(
      screen.getByRole('option', {
        name: new RegExp(`^${model.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      }),
    ).toBeInTheDocument();
  }
  expect(screen.queryByText('Ready')).not.toBeInTheDocument();
  expect(screen.queryByText('No credentials')).not.toBeInTheDocument();
  expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();

  // The inherit choice survives the fallback too.
  expect(screen.getByRole('option', { name: 'Inherit Project Default' })).toBeInTheDocument();
});

test('an enriched catalogue overrides the initial fallback without badges dropping', async () => {
  // Late/refreshed response replaces the fallback; badges still render.
  api.getModels.mockResolvedValueOnce({
    models: [enrichedModels[0]],
    harnesses: [{ id: 'pi', label: 'pi', description: '', models: [enrichedModels[0]] }],
  });

  await openStageModelDropdown();

  const readyOption = screen.getByRole('option', { name: /DeepSeek v4 Flash/i });
  expect(within(readyOption).getByText('Ready')).toBeInTheDocument();
});