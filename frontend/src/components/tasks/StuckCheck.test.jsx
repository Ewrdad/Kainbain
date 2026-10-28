import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import {
  StuckCheckButton,
  StuckCheckPanel,
  stuckCheckHarnessDisabledReason,
  useStuckCheck,
  verdictMeta,
} from './StuckCheck';
import '@testing-library/jest-dom';

/***
 * MARK: api mock
 * @description Replaces the api service's model listing with a controllable
 *   mock while keeping the other exports (modelOptionValue/modelKeyForValue)
 *   real, so the composite-key math in the hook stays authentic.
 ***/
vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      getModels: vi.fn(async () => ({
        models: [
          { key: 'prov-a::model-a', id: 'model-a', name: 'Model A', provider: 'prov-a' },
          { key: 'prov-b::model-b', id: 'model-b', name: 'Model B', provider: 'prov-b' },
        ],
      })),
    },
  };
});

const TASK = { id: 'task-1', goal: 'Add the feature', currentStageId: 's2' };
const STAGE = { id: 's2', name: 'In Progress', type: 'agent' };

/***
 * MARK: Harness
 * @description Renders the full stuck-check control through the real hook,
 *   exactly the way LogsPanel consumes it.
 ***/
function Harness({ task = TASK, taskStage = STAGE }) {
  const stuckCheck = useStuckCheck({ task, taskStage });
  return (
    <div>
      <StuckCheckButton
        open={stuckCheck.open}
        onClick={stuckCheck.toggle}
        disabled={!stuckCheck.canRun}
      />
      <StuckCheckPanel state={stuckCheck} />
    </div>
  );
}

/***
 * MARK: openAndRun
 * @description Opens the panel, waits for the model list to load (the Run
 *   button is disabled until a model choice resolves), then runs the check.
 ***/
async function openAndRun() {
  fireEvent.click(screen.getByRole('button', { name: /is it stuck\?/i }));
  const runButton = await screen.findByRole('button', { name: /run check/i });
  await waitFor(() => expect(runButton).not.toBeDisabled());
  fireEvent.click(runButton);
  return runButton;
}

beforeEach(() => {
  vi.clearAllMocks();
});

test('renders a closed "Is it stuck?" button by default', () => {
  renderWithKainBain(<Harness />);
  const button = screen.getByRole('button', { name: /is it stuck\?/i });
  expect(button).toBeInTheDocument();
  expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region', { name: /stuck check/i })).not.toBeInTheDocument();
});

test('toggles the advisory panel open and closed', () => {
  renderWithKainBain(<Harness />);
  const button = screen.getByRole('button', { name: /is it stuck\?/i });

  fireEvent.click(button);
  const panel = screen.getByRole('region', { name: /stuck check/i });
  expect(panel).toBeInTheDocument();
  expect(panel).toHaveTextContent(/advisory only/i);
  expect(button).toHaveAttribute('aria-expanded', 'true');

  // The accessible name comes from aria-label, which flips with the state.
  fireEvent.click(screen.getByRole('button', { name: /close stuck check/i }));
  expect(screen.queryByRole('region', { name: /stuck check/i })).not.toBeInTheDocument();
});

test('defaults the model to the project default when the stage has no model', async () => {
  const checkTaskStuck = vi.fn(async () => ({
    verdict: 'not_stuck',
    summary: 'steady progress',
    model: { name: 'Model A' },
  }));
  renderWithKainBain(<Harness />, {
    checkTaskStuck,
    projects: [{ id: 'proj-1', defaultModel: 'prov-a::model-a' }],
  });

  await openAndRun();

  await waitFor(() => {
    // Old-backend catalogue (no harnesses): no harness is sent, the backend
    // keeps its previous single-harness default.
    expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', 'task-1', {
      model: 'prov-a::model-a',
      harness: undefined,
    });
  });
});

test('prefers the current stage model override over the project default', async () => {
  const checkTaskStuck = vi.fn(async () => ({ verdict: 'unclear', summary: 'n/a' }));
  renderWithKainBain(<Harness taskStage={{ ...STAGE, model: 'prov-b::model-b' }} />, {
    checkTaskStuck,
    projects: [{ id: 'proj-1', defaultModel: 'prov-a::model-a' }],
  });

  await openAndRun();

  await waitFor(() => {
    expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', 'task-1', {
      model: 'prov-b::model-b',
      harness: undefined,
    });
  });
});

test('shows the verdict badge and reasoning after a successful check', async () => {
  const checkTaskStuck = vi.fn(async () => ({
    taskId: 'task-1',
    verdict: 'stuck',
    summary: 'The same bash command repeats 9 times.',
    model: { key: 'prov-b::model-b', id: 'model-b', name: 'Model B', provider: 'prov-b' },
  }));
  renderWithKainBain(<Harness />, { checkTaskStuck });

  await openAndRun();

  const result = await screen.findByTestId('stuck-check-result');
  expect(result).toHaveTextContent(/looks stuck/i);
  expect(result).toHaveTextContent('The same bash command repeats 9 times.');
  expect(result).toHaveTextContent('Model: Model B');
});

test('shows an inline error when the check fails', async () => {
  const checkTaskStuck = vi.fn(async () => {
    throw new Error('Model could not be resolved');
  });
  renderWithKainBain(<Harness />, { checkTaskStuck });

  await openAndRun();

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/model could not be resolved/i);
  // The run button is re-enabled after a failure so the user can retry.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /run check/i })).not.toBeDisabled();
  });
});

test('disables Run Check while a check is running', async () => {
  let resolveCheck;
  const checkTaskStuck = vi.fn(
    () =>
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
  );
  renderWithKainBain(<Harness />, { checkTaskStuck });

  fireEvent.click(screen.getByRole('button', { name: /is it stuck\?/i }));
  const runButton = await screen.findByRole('button', { name: /run check/i });
  await waitFor(() => expect(runButton).not.toBeDisabled());
  fireEvent.click(runButton);

  const runningButton = await screen.findByRole('button', { name: /checking/i });
  expect(runningButton).toBeDisabled();
  expect(runningButton).toHaveAttribute('aria-busy', 'true');

  // Resolve the pending check; the result appears and the button recovers.
  resolveCheck({ verdict: 'not_stuck', summary: 'ok' });
  await screen.findByTestId('stuck-check-result');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /run check/i })).not.toBeDisabled();
  });
});

test('the toggle is disabled without a task', () => {
  renderWithKainBain(<Harness task={{ id: null, goal: 'g' }} />, {});
  expect(screen.getByRole('button', { name: /is it stuck\?/i })).toBeDisabled();
});

test('falls back to the built-in model list when the fetch fails', async () => {
  const { api } = vi.mocked(await import('../../services/api'));
  api.getModels.mockRejectedValueOnce(new Error('offline'));
  renderWithKainBain(<Harness />);
  // The panel still opens with FALLBACK_MODELS backing the dropdown.
  fireEvent.click(screen.getByRole('button', { name: /is it stuck\?/i }));
  const runButton = await screen.findByRole('button', { name: /run check/i });
  await waitFor(() => expect(runButton).not.toBeDisabled());
});

/***
 * MARK: multi-harness fixtures
 * @description Two-harness catalogues for the harness-first picker: `pi` and
 *   `cloud-b` carry disjoint model lists so scoping is observable, and the
 *   `custom` / `overseer` entries exercise the disabled-with-reason and
 *   `modelSelection: 'none'` paths.
 ***/
const PI_MODELS = [
  { key: 'pi::prov-a::model-a', id: 'model-a', name: 'Model A', provider: 'prov-a', harness: 'pi' },
  {
    key: 'pi::prov-a::model-a2',
    id: 'model-a2',
    name: 'Model A2',
    provider: 'prov-a',
    harness: 'pi',
  },
];
const B_MODELS = [
  {
    key: 'cloud-b::prov-b::model-b',
    id: 'model-b',
    name: 'Model B',
    provider: 'prov-b',
    harness: 'cloud-b',
  },
];

function listCatalogue() {
  return {
    models: [...PI_MODELS, ...B_MODELS],
    harnesses: [
      {
        id: 'pi',
        label: 'Pi',
        description: 'pi harness',
        modelSelection: 'list',
        models: PI_MODELS,
        supportsDiagnosis: true,
      },
      {
        id: 'cloud-b',
        label: 'Cloud B',
        description: 'second harness',
        modelSelection: 'list',
        models: B_MODELS,
        supportsDiagnosis: true,
      },
    ],
  };
}

async function mockCatalogueOnce(catalogue) {
  const { api } = vi.mocked(await import('../../services/api'));
  api.getModels.mockResolvedValueOnce(catalogue);
}

async function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: /is it stuck\?/i }));
  const runButton = await screen.findByRole('button', { name: /run check/i });
  await waitFor(() => expect(runButton).not.toBeDisabled());
  return runButton;
}

test('shows a harness selector and sends the default harness on Run', async () => {
  await mockCatalogueOnce(listCatalogue());
  const checkTaskStuck = vi.fn(async () => ({ verdict: 'not_stuck', summary: 'ok' }));
  renderWithKainBain(<Harness />, { checkTaskStuck });

  const runButton = await openPanel();
  // Harness-first picker: the harness row names the default (first) harness.
  expect(screen.getByRole('combobox', { name: /harness for stuck check/i })).toHaveTextContent(
    'Pi',
  );
  fireEvent.click(runButton);

  await waitFor(() => {
    expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', 'task-1', {
      model: 'pi::prov-a::model-a',
      harness: 'pi',
    });
  });
});

test('prefers the stage harness override and scopes the model default to it', async () => {
  await mockCatalogueOnce(listCatalogue());
  const checkTaskStuck = vi.fn(async () => ({ verdict: 'not_stuck', summary: 'ok' }));
  renderWithKainBain(<Harness taskStage={{ ...STAGE, harness: 'cloud-b' }} />, {
    checkTaskStuck,
    // The project default names a pi model — it must NOT leak into the
    // cloud-b check; the harness's own first model wins instead.
    projects: [{ id: 'proj-1', harness: 'pi', defaultModel: 'pi::prov-a::model-a' }],
  });

  const runButton = await openPanel();
  expect(screen.getByRole('combobox', { name: /harness for stuck check/i })).toHaveTextContent(
    'Cloud B',
  );
  fireEvent.click(runButton);

  await waitFor(() => {
    expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', 'task-1', {
      model: 'cloud-b::prov-b::model-b',
      harness: 'cloud-b',
    });
  });
});

test('switching harness re-scopes the model list (never a stale key)', async () => {
  await mockCatalogueOnce(listCatalogue());
  const checkTaskStuck = vi.fn(async () => ({ verdict: 'not_stuck', summary: 'ok' }));
  renderWithKainBain(<Harness />, { checkTaskStuck });

  await openPanel();
  fireEvent.click(screen.getByRole('combobox', { name: /harness for stuck check/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Cloud B' }));

  // The model row now offers the new harness's catalogue…
  fireEvent.click(screen.getByRole('combobox', { name: /model for stuck check/i }));
  expect(screen.getByRole('option', { name: 'Model B' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Model A' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /run check/i }));
  await waitFor(() => {
    expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', 'task-1', {
      model: 'cloud-b::prov-b::model-b',
      harness: 'cloud-b',
    });
  });
});

test('resolves a legacy bare model id within the selected harness', async () => {
  await mockCatalogueOnce(listCatalogue());
  const checkTaskStuck = vi.fn(async () => ({ verdict: 'not_stuck', summary: 'ok' }));
  renderWithKainBain(<Harness />, {
    checkTaskStuck,
    projects: [{ id: 'proj-1', defaultModel: 'model-a2' }],
  });

  const runButton = await openPanel();
  fireEvent.click(runButton);

  await waitFor(() => {
    expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', 'task-1', {
      model: 'pi::prov-a::model-a2',
      harness: 'pi',
    });
  });
});

test('disables harnesses without diagnosis support with an honest reason', async () => {
  await mockCatalogueOnce({
    models: PI_MODELS,
    harnesses: [
      {
        id: 'pi',
        label: 'Pi',
        description: 'pi harness',
        modelSelection: 'list',
        models: PI_MODELS,
        supportsDiagnosis: true,
      },
      {
        id: 'custom',
        label: 'Custom',
        description: 'custom harness',
        modelSelection: 'none',
        models: [],
        supportsDiagnosis: false,
      },
    ],
  });
  const checkTaskStuck = vi.fn(async () => ({ verdict: 'not_stuck', summary: 'ok' }));
  renderWithKainBain(<Harness />, { checkTaskStuck });

  const runButton = await openPanel();
  // The default skips the unsupported harness…
  expect(screen.getByRole('combobox', { name: /harness for stuck check/i })).toHaveTextContent(
    'Pi',
  );

  // …and its row renders disabled with the reason shown.
  fireEvent.click(screen.getByRole('combobox', { name: /harness for stuck check/i }));
  const customOption = screen.getByRole('option', { name: /custom/i });
  expect(customOption).toHaveAttribute('aria-disabled', 'true');
  expect(customOption).toHaveTextContent(/stuck check unavailable/i);

  // A click on the disabled row cannot move the selection: Run still targets pi.
  fireEvent.click(customOption);
  fireEvent.click(runButton);
  await waitFor(() => {
    expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', 'task-1', {
      model: 'pi::prov-a::model-a',
      harness: 'pi',
    });
  });
});

test('a none harness shows its own-model note and Run works without a model', async () => {
  await mockCatalogueOnce({
    models: PI_MODELS,
    harnesses: [
      {
        id: 'pi',
        label: 'Pi',
        description: 'pi harness',
        modelSelection: 'list',
        models: PI_MODELS,
        supportsDiagnosis: true,
      },
      {
        id: 'overseer',
        label: 'Overseer',
        description: 'manages its own model',
        modelSelection: 'none',
        models: [],
        supportsDiagnosis: true,
      },
    ],
  });
  const checkTaskStuck = vi.fn(async () => ({ verdict: 'not_stuck', summary: 'ok' }));
  renderWithKainBain(<Harness />, { checkTaskStuck });

  await openPanel();
  fireEvent.click(screen.getByRole('combobox', { name: /harness for stuck check/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Overseer' }));

  // Honest note instead of a model control, and Run stays enabled.
  expect(screen.getByTestId('model-none-note')).toHaveTextContent(/manages its own model/i);
  const runButton = screen.getByRole('button', { name: /run check/i });
  expect(runButton).not.toBeDisabled();
  fireEvent.click(runButton);

  await waitFor(() => {
    expect(checkTaskStuck).toHaveBeenCalledWith('proj-1', 'task-1', {
      model: undefined,
      harness: 'overseer',
    });
  });
});

test('offers project aliases under the Alias harness without a refresh', async () => {
  await mockCatalogueOnce(listCatalogue());
  const { api } = vi.mocked(await import('../../services/api'));
  api.getModels.mockClear();
  const checkTaskStuck = vi.fn(async () => ({ verdict: 'not_stuck', summary: 'ok' }));
  renderWithKainBain(<Harness />, {
    checkTaskStuck,
    projects: [
      {
        id: 'proj-1',
        modelAliases: [{ name: 'small', harness: 'pi', model: 'pi::prov-a::model-a' }],
      },
    ],
  });

  await openPanel();
  fireEvent.click(screen.getByRole('combobox', { name: /harness for stuck check/i }));
  fireEvent.click(screen.getByRole('option', { name: 'Alias' }));

  fireEvent.click(screen.getByRole('combobox', { name: /model for stuck check/i }));
  expect(screen.getByRole('option', { name: 'small' })).toBeInTheDocument();
  // Alias visibility is render-time only — discovery ran once on mount.
  expect(api.getModels).toHaveBeenCalledTimes(1);
});

test('shows a labeled Reasoning dropdown for reasoning-capable harnesses', async () => {
  await mockCatalogueOnce({
    models: PI_MODELS,
    harnesses: [
      {
        id: 'pi',
        label: 'Pi',
        description: 'pi harness',
        modelSelection: 'list',
        reasoningLevels: ['low', 'medium', 'high'],
        models: PI_MODELS,
        supportsDiagnosis: true,
      },
    ],
  });
  renderWithKainBain(<Harness />, { checkTaskStuck: vi.fn() });

  await openPanel();
  // Visible label (not just the combobox accessible name) so the control is
  // recognizable next to the model dropdown.
  expect(screen.getByText('Reasoning')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Reasoning' })).toBeInTheDocument();
});

describe('stuckCheckHarnessDisabledReason', () => {
  test('disables only on an explicit negative flag', () => {
    expect(stuckCheckHarnessDisabledReason({ supportsDiagnosis: false })).toBe(
      'stuck check unavailable',
    );
    expect(stuckCheckHarnessDisabledReason({ supportsDiagnosis: true })).toBeNull();
    // Older backends send no flag — those entries stay selectable.
    expect(stuckCheckHarnessDisabledReason({ id: 'pi' })).toBeNull();
    expect(stuckCheckHarnessDisabledReason(undefined)).toBeNull();
  });
});

describe('verdictMeta', () => {
  test('maps canonical verdicts and degrades unknown ones', () => {
    expect(verdictMeta('stuck').label).toBe('Looks stuck');
    expect(verdictMeta('not_stuck').label).toBe('Not stuck');
    expect(verdictMeta('unclear').label).toBe('Unclear');
    expect(verdictMeta('something-new').label).toBe('Unclear');
  });
});
