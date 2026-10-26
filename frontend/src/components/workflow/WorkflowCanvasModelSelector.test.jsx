import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithKainBain } from '../../testUtils';
import { KainBainContext } from '../../context/KainBainContext';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/**
 * MARK: WorkflowCanvas model selector tests
 * @description Verifies the per-stage harness + model selectors in the
 *   in-column stage settings drawer: stages inherit the project harness by
 *   default, a controlled override picker persists stage.harness (the
 *   inherit choice clears back to inherit), the model control rescopes to
 *   the effective harness (grouped dropdown, honest empty state, or hidden),
 *   the "Inherit Project Default" empty choice, and emitted composite keys.
 */

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      getModels: vi.fn().mockResolvedValue({
        models: [
          {
            id: 'glm-5.3-flash:cloud',
            name: 'GLM 5.3 Flash (Cloud)',
            provider: 'ollama-cloud',
            key: 'ollama-cloud::glm-5.3-flash:cloud',
          },
          {
            id: 'gemini-2.5-pro',
            name: 'Gemini 2.5 Pro',
            provider: 'google',
            key: 'google::gemini-2.5-pro',
          },
        ],
        harnesses: [
          {
            id: 'pi',
            label: 'pi',
            description: 'pi coding-agent harness',
            models: [
              {
                id: 'glm-5.3-flash:cloud',
                name: 'GLM 5.3 Flash (Cloud)',
                provider: 'ollama-cloud',
                key: 'ollama-cloud::glm-5.3-flash:cloud',
              },
              {
                id: 'gemini-2.5-pro',
                name: 'Gemini 2.5 Pro',
                provider: 'google',
                key: 'google::gemini-2.5-pro',
              },
            ],
          },
        ],
      }),
    },
  };
});

import { api } from '../../services/api';

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const agentStage = [{ id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas.' }];

function openStageSettings() {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: agentStage,
    tasks: [],
    activeProjectId: 'proj-1',
    handleUpdateStage: vi.fn(),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));
}

test('stages inherit the project harness by default (explicit inherit choice)', async () => {
  openStageSettings();

  // No stored override: the picker shows the explicit inherit choice naming
  // the project harness (here: pi, the fallback) — and stays enabled so the
  // user can slot in an override.
  const harnessTrigger = await screen.findByRole('combobox', { name: 'Harness for Idea' });
  expect(harnessTrigger).toHaveTextContent('Inherit project default (pi)');
  expect(harnessTrigger).not.toBeDisabled();

  // The model dropdown keeps its stable aria label and the empty choice,
  // scoped to the inherited (pi) catalogue.
  const modelTrigger = screen.getByRole('combobox', { name: 'Model for Idea' });
  fireEvent.click(modelTrigger);
  expect(screen.getByRole('option', { name: 'Inherit Project Default' })).toBeInTheDocument();
  // Grouped by provider: headers carry the provider, labels stay plain.
  expect(screen.getByText('ollama-cloud')).toBeInTheDocument();
  expect(screen.getByText('google')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'GLM 5.3 Flash (Cloud)' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /GLM 5\.3 Flash \(Cloud\) \(/ })).not.toBeInTheDocument();
});

test('picking a stage harness persists the override and rescopes the model control', async () => {
  api.getModels.mockResolvedValueOnce({
    // NOTE: the flat list must be non-empty — useModelCatalog only adopts
    // the response (harnesses included) when models is a non-empty array.
    models: [
      {
        id: 'glm-5.3-flash:cloud',
        name: 'GLM 5.3 Flash (Cloud)',
        provider: 'ollama-cloud',
        key: 'ollama-cloud::glm-5.3-flash:cloud',
      },
    ],
    harnesses: [
      {
        id: 'pi',
        label: 'pi',
        description: 'pi coding-agent harness',
        modelSelection: 'list',
        modelFlag: null,
        isDefault: true,
        models: [
          {
            id: 'glm-5.3-flash:cloud',
            name: 'GLM 5.3 Flash (Cloud)',
            provider: 'ollama-cloud',
            key: 'ollama-cloud::glm-5.3-flash:cloud',
          },
        ],
      },
      {
        id: 'custom',
        label: 'Custom command',
        description: 'custom harness',
        modelSelection: 'none',
        modelFlag: null,
        isDefault: false,
        models: [],
      },
    ],
  });
  const handleUpdateStage = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages: agentStage,
    tasks: [],
    activeProjectId: 'proj-1',
    activeProject: { id: 'proj-1', harness: '' },
    handleUpdateStage,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  // Two harnesses, no stored override: the picker shows the inherit choice
  // naming the project harness (pi, the server default).
  const harnessTrigger = await screen.findByRole('combobox', { name: 'Harness for Idea' });
  expect(harnessTrigger).not.toBeDisabled();
  expect(harnessTrigger).toHaveTextContent('Inherit project default (pi)');

  fireEvent.click(harnessTrigger);
  fireEvent.click(screen.getByRole('option', { name: 'Custom command' }));

  // The override persists as stage.harness (the model control rescopes to
  // the custom harness on the next render — covered below).
  await waitFor(() => {
    expect(handleUpdateStage).toHaveBeenCalledWith('1', { harness: 'custom' });
  });
});

test('a stored stage harness override selects that harness and its model control', async () => {
  api.getModels.mockResolvedValueOnce({
    models: [
      {
        id: 'glm-5.3-flash:cloud',
        name: 'GLM 5.3 Flash (Cloud)',
        provider: 'ollama-cloud',
        key: 'ollama-cloud::glm-5.3-flash:cloud',
      },
    ],
    harnesses: [
      {
        id: 'pi',
        label: 'pi',
        description: 'pi coding-agent harness',
        modelSelection: 'list',
        modelFlag: null,
        isDefault: true,
        models: [
          {
            id: 'glm-5.3-flash:cloud',
            name: 'GLM 5.3 Flash (Cloud)',
            provider: 'ollama-cloud',
            key: 'ollama-cloud::glm-5.3-flash:cloud',
          },
        ],
      },
      {
        id: 'custom',
        label: 'Custom command',
        description: 'custom harness',
        modelSelection: 'none',
        modelFlag: null,
        isDefault: false,
        models: [],
      },
    ],
  });
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ ...agentStage[0], harness: 'custom', model: 'sonnet' }],
    tasks: [],
    activeProjectId: 'proj-1',
    activeProject: { id: 'proj-1', harness: '' },
    handleUpdateStage: vi.fn(),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  // The stored override wins over the project harness: custom selected, and
  // the model control is hidden (custom takes no model selection — flags
  // bake into the command).
  expect(await screen.findByRole('combobox', { name: 'Harness for Idea' })).toHaveTextContent(
    'Custom command',
  );
  expect(screen.queryByRole('combobox', { name: 'Model for Idea' })).not.toBeInTheDocument();
  expect(screen.getByTestId('model-none-note')).toBeInTheDocument();
});

test('picking the inherit choice clears the override back to inherit', async () => {
  api.getModels.mockResolvedValueOnce({
    models: [
      {
        id: 'glm-5.3-flash:cloud',
        name: 'GLM 5.3 Flash (Cloud)',
        provider: 'ollama-cloud',
        key: 'ollama-cloud::glm-5.3-flash:cloud',
      },
    ],
    harnesses: [
      {
        id: 'pi',
        label: 'pi coding agent',
        description: 'pi coding-agent harness',
        modelSelection: 'list',
        modelFlag: null,
        isDefault: true,
        models: [
          {
            id: 'glm-5.3-flash:cloud',
            name: 'GLM 5.3 Flash (Cloud)',
            provider: 'ollama-cloud',
            key: 'ollama-cloud::glm-5.3-flash:cloud',
          },
        ],
      },
      {
        id: 'custom',
        label: 'Custom command',
        description: 'custom harness',
        modelSelection: 'none',
        modelFlag: null,
        isDefault: false,
        models: [],
      },
    ],
  });
  const handleUpdateStage = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ ...agentStage[0], harness: 'custom' }],
    tasks: [],
    activeProjectId: 'proj-1',
    activeProject: { id: 'proj-1', harness: '' },
    handleUpdateStage,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  // Picking the inherit choice stores '' (inherit) so the stage keeps
  // following project changes instead of pinning the id.
  fireEvent.click(await screen.findByRole('combobox', { name: 'Harness for Idea' }));
  fireEvent.click(screen.getByRole('option', { name: /Inherit project default/ }));

  await waitFor(() => {
    expect(handleUpdateStage).toHaveBeenCalledWith('1', { harness: '' });
  });
});

test('an undiscovered harness shows the honest empty state (never another harness models)', async () => {
  api.getModels.mockResolvedValueOnce({
    // NOTE: the flat list must be non-empty — useModelCatalog only adopts
    // the response (harnesses included) when models is a non-empty array.
    models: [
      {
        id: 'glm-5.3-flash:cloud',
        name: 'GLM 5.3 Flash (Cloud)',
        provider: 'ollama-cloud',
        key: 'ollama-cloud::glm-5.3-flash:cloud',
      },
    ],
    harnesses: [
      {
        id: 'pi',
        label: 'pi',
        description: 'pi coding-agent harness',
        modelSelection: 'list',
        modelFlag: null,
        isDefault: true,
        models: [
          {
            id: 'glm-5.3-flash:cloud',
            name: 'GLM 5.3 Flash (Cloud)',
            provider: 'ollama-cloud',
            key: 'ollama-cloud::glm-5.3-flash:cloud',
          },
        ],
      },
      {
        id: 'antigravity',
        label: 'Antigravity',
        description: 'antigravity harness',
        modelSelection: 'list',
        modelFlag: null,
        isDefault: false,
        // Discovery failing/empty: honestly [] (no pi-flavored fallback).
        models: [],
      },
    ],
  });
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ ...agentStage[0], harness: 'antigravity' }],
    tasks: [],
    activeProjectId: 'proj-1',
    activeProject: { id: 'proj-1', harness: '' },
    handleUpdateStage: vi.fn(),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  // The stage override (antigravity) wins; its empty catalogue renders the
  // honest empty state with a Refresh escape hatch — not pi's models.
  expect(await screen.findByRole('combobox', { name: 'Harness for Idea' })).toHaveTextContent(
    'Antigravity',
  );
  expect(screen.queryByRole('combobox', { name: 'Model for Idea' })).not.toBeInTheDocument();
  expect(screen.getByTestId('model-empty-note')).toHaveTextContent('Antigravity');
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
});

test('emits a composite provider::id model key into the stage update payload', async () => {
  const handleUpdateStage = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages: agentStage,
    tasks: [],
    activeProjectId: 'proj-1',
    handleUpdateStage,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  const modelTrigger = await screen.findByRole('combobox', { name: 'Model for Idea' });
  fireEvent.click(modelTrigger);
  fireEvent.click(screen.getByRole('option', { name: 'Gemini 2.5 Pro' }));

  await waitFor(() => {
    expect(handleUpdateStage).toHaveBeenCalledWith('1', {
      model: 'google::gemini-2.5-pro',
    });
  });
});

test('saved project aliases reach per-stage pickers with no catalogue refresh', async () => {
  api.getModels.mockClear();
  const first = renderWithKainBain(<WorkflowCanvas />, {
    stages: agentStage,
    tasks: [],
    activeProjectId: 'proj-1',
    activeProject: { id: 'proj-1', harness: '' },
    handleUpdateStage: vi.fn(),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  const harnessTrigger = await screen.findByRole('combobox', { name: 'Harness for Idea' });
  fireEvent.click(harnessTrigger);
  expect(screen.queryByRole('option', { name: 'Alias' })).not.toBeInTheDocument();
  fireEvent.click(harnessTrigger);

  // The project gains an alias (Settings save merges it into context) and a
  // stage references it through the virtual harness.
  const nextValue = {
    ...first.value,
    stages: [{ ...agentStage[0], harness: 'alias', model: 'small' }],
    activeProject: {
      id: 'proj-1',
      harness: '',
      modelAliases: [{ name: 'small', harness: 'pi', model: 'google::gemini-2.5-pro' }],
    },
  };
  first.rerender(
    <MemoryRouter initialEntries={['/']}>
      <KainBainContext.Provider value={nextValue}>
        <WorkflowCanvas />
      </KainBainContext.Provider>
    </MemoryRouter>,
  );

  // The stored alias reference resolves: the harness names Alias and the
  // model control offers the new name.
  expect(screen.getByRole('combobox', { name: 'Harness for Idea' })).toHaveTextContent('Alias');
  fireEvent.click(screen.getByRole('combobox', { name: 'Model for Idea' }));
  expect(screen.getByRole('option', { name: 'small' })).toBeInTheDocument();
  // The alias arrived via context — discovery still ran only on mount.
  expect(api.getModels).toHaveBeenCalledTimes(1);
});

test('shows a labeled Reasoning dropdown on reasoning-capable harnesses', async () => {
  api.getModels.mockResolvedValueOnce({
    // NOTE: the flat list must be non-empty — useModelCatalog only adopts
    // the response (harnesses included) when models is a non-empty array.
    models: [
      {
        id: 'glm-5.3-flash:cloud',
        name: 'GLM 5.3 Flash (Cloud)',
        provider: 'ollama-cloud',
        key: 'ollama-cloud::glm-5.3-flash:cloud',
      },
    ],
    harnesses: [
      {
        id: 'pi',
        label: 'pi',
        description: 'pi coding-agent harness',
        modelSelection: 'list',
        modelFlag: null,
        isDefault: true,
        reasoningLevels: ['low', 'medium', 'high'],
        models: [
          {
            id: 'glm-5.3-flash:cloud',
            name: 'GLM 5.3 Flash (Cloud)',
            provider: 'ollama-cloud',
            key: 'ollama-cloud::glm-5.3-flash:cloud',
          },
        ],
      },
    ],
  });
  openStageSettings();

  // Visible label (not just the combobox accessible name) so the control is
  // recognizable next to the model dropdown.
  expect(await screen.findByText('Reasoning')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Reasoning' })).toBeInTheDocument();
});

test('resolves a legacy bare-id stored model onto the grouped option list', async () => {
  const handleUpdateStage = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ ...agentStage[0], model: 'glm-5.3-flash:cloud' }],
    tasks: [],
    activeProjectId: 'proj-1',
    handleUpdateStage,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  // The stored bare id resolves to the composite option and shows its label.
  await waitFor(async () => {
    const trigger = screen.getByRole('combobox', { name: 'Model for Idea' });
    expect(trigger).toHaveTextContent('GLM 5.3 Flash (Cloud)');
  });
  expect(handleUpdateStage).not.toHaveBeenCalled();
});