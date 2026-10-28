// jsdom pin: this suite needs window.confirm stub (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { DEFAULT_UI_PREFERENCES } from '../../context/useUiPreferences';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas.settings tests
 * @description Stage settings cases owned by `StageSettingsDrawer` (triggered from `StageColumn`): settings panel, keyword tokens, timeout overrides, delete-stage flow and drawer layout contract. Rendered through `WorkflowCanvas` (integration).
 ***/
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const stages = [
  { id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas.' },
  { id: '2', name: 'Review', type: 'human', prompt: 'Human review.' },
];

const tasks = [
  { id: 'task-1', goal: 'Build login page', currentStageId: '1', status: 'in_stage' },
  { id: 'task-2', goal: 'Review API spec', currentStageId: '2', status: 'in_stage' },
  { id: 'task-3', goal: 'Old task', currentStageId: '1', status: 'completed' },
];

test('opens Manage Workflows menu item and switches to settings view (B1)', () => {
  const setView = vi.fn();
  const projectWorkflows = [{ id: 'wf-1', name: 'Feature Pipeline', isDefault: true, stages }];
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    activeProjectId: 'proj-1',
    projectWorkflows,
    activeWorkflowId: 'wf-1',
    setView,
  });

  // Open the workflow dropdown and click the "Manage Workflows" menuitem.
  fireEvent.click(screen.getByRole('button', { name: /Select pipeline workflow/i }));
  const manageItem = screen.getByRole('menuitem', { name: /Manage Workflows/i });
  expect(manageItem).toBeInTheDocument();
  expect(() => fireEvent.click(manageItem)).not.toThrow();
  expect(setView).toHaveBeenCalledWith('settings');
});

test('Configure stage drawer is confined to its stage column (footer-overlap contract)', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    messages: [{ id: 'm1', role: 'assistant', content: 'Activity present' }],
    activeProjectId: 'proj-1',
  });

  // Open the Configure drawer for the first stage
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  const deleteBtn = screen.getByLabelText('Delete stage Idea');
  const doneBtn = screen.getByLabelText('Save and close settings for Idea');
  expect(deleteBtn).toBeInTheDocument();
  expect(doneBtn).toBeInTheDocument();

  // Containment contract: the drawer overlay must live inside its stage
  // column <section>, and that section must be the positioning context
  // (`relative`) for the drawer's `absolute inset-0`. If the section loses
  // `relative`, the drawer falls back to the canvas root and its footer
  // buttons slide underneath the console / Now Playing bar again.
  const section = deleteBtn.closest('section[data-stage-id]');
  expect(section).not.toBeNull();
  expect(section).toHaveClass('relative');
  const drawer = deleteBtn.closest('div.absolute.inset-0');
  expect(drawer).not.toBeNull();
  expect(section).toContainElement(drawer);

  // The console (collapsed by default) renders as a sibling of the pipeline
  // board, never inside the drawer's column subtree: the console can never
  // paint over the drawer's buttons.
  const consoleHeader = screen.getByText(/Live Agent Activity Console/i);
  expect(drawer).not.toContainElement(consoleHeader);
});

/***
 * MARK: mobile declutter tests (task 7a411b12)
 * @description On mobile (<768px) the filter pills / Show Completed row and the
 *   Live Agent Activity Console must be display:none (CSS `hidden md:flex`),
 *   while remaining mounted (so jsdom unit tests can still assert on them).
 ***/

test('opens in-column stage settings panel with fallback stage selector and pause stage helper (#9, #10, #11)', () => {
  const handleUpdateStage = vi.fn();
  const stagesWithSettings = [
    {
      id: '1',
      name: 'Idea',
      type: 'agent',
      paused: false,
      failback: 'previous',
      model: 'gemini-2.5-pro',
    },
    {
      id: '2',
      name: 'Review',
      type: 'agent',
      paused: false,
      failback: '1',
      model: 'gemini-2.5-flash',
    },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages: stagesWithSettings,
    tasks: [],
    handleUpdateStage,
  });

  const settingsToggle = screen.getByRole('button', { name: 'Configure stage Idea' });
  fireEvent.click(settingsToggle);

  // Settings overlay header is rendered
  expect(screen.getByText('Configure Idea')).toBeInTheDocument();

  // Pause stage setting with helper text is present
  expect(
    screen.getByText(
      'When enabled, incoming tasks will pause at this stage and require manual start.',
    ),
  ).toBeInTheDocument();

  // Fallback Stage selector with custom options is rendered
  const fallbackSelect = screen.getByLabelText(/Fallback stage for Idea/i);
  expect(fallbackSelect).toBeInTheDocument();
  fireEvent.click(fallbackSelect);
  expect(screen.getByRole('option', { name: 'Previous Stage' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Start of Pipeline' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Any Stage' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Abort Job' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '1. Idea' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '2. Review' })).toBeInTheDocument();

  // Every Stage-Settings dropdown must be full width (matching the sibling text boxes)
  // so the model name/title is not clipped to a narrow shrink-to-fit pill.
  const expectFullWidth = (trigger) => {
    const wrapper = trigger.closest('[data-testid="select-dropdown-container"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain('w-full');
    expect(wrapper.className).toContain('block');
  };

  expectFullWidth(screen.getByRole('combobox', { name: /Stage type for Idea/i }));
  expectFullWidth(screen.getByRole('combobox', { name: /Model for Idea/i }));
  expectFullWidth(screen.getByRole('combobox', { name: /Fallback stage for Idea/i }));
});

test('renders and updates timeout override for agent, ci, and deploy stages in stage settings drawer (#10)', () => {
  const handleUpdateStage = vi.fn();
  const stagesWithVariedTypes = [
    { id: '1', name: 'Idea', type: 'agent', prompt: 'Prompt', timeout: 120000 },
    { id: '2', name: 'Verify', type: 'ci', command: 'npm test' },
    // A deploy is a ci stage whose command runs the deploy script.
    { id: '3', name: 'Deploy', type: 'ci', command: './deploy.sh --prod' },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages: stagesWithVariedTypes,
    tasks: [],
    activeProjectId: 'proj-1',
    handleUpdateStage,
  });

  // 1. Agent stage timeout
  const ideaSettings = screen.getByRole('button', { name: 'Configure stage Idea' });
  fireEvent.click(ideaSettings);

  const agentTimeoutInput = screen.getByLabelText('Timeout in minutes for Idea');
  expect(agentTimeoutInput).toBeInTheDocument();
  expect(agentTimeoutInput).toHaveValue(2);
  expect(agentTimeoutInput).toHaveAttribute('placeholder', '30 (Default: 30 min)');
  expect(screen.getByText(/Default: 30 min if empty\./i)).toBeInTheDocument();

  fireEvent.change(agentTimeoutInput, { target: { value: '40' } });
  expect(handleUpdateStage).toHaveBeenCalledWith('1', { timeout: 2400000 });

  // Close Idea settings
  fireEvent.click(ideaSettings);

  // 2. CI stage timeout
  const verifySettings = screen.getByRole('button', { name: 'Configure stage Verify' });
  fireEvent.click(verifySettings);

  const ciTimeoutInput = screen.getByLabelText('Timeout in minutes for Verify');
  expect(ciTimeoutInput).toBeInTheDocument();
  expect(ciTimeoutInput).toHaveAttribute('placeholder', '1 (Default: 1 min)');
  expect(screen.getByText(/Default: 1 min if empty\./i)).toBeInTheDocument();

  fireEvent.change(ciTimeoutInput, { target: { value: '1.5' } });
  expect(handleUpdateStage).toHaveBeenCalledWith('2', { timeout: 90000 });

  // Close Verify settings
  fireEvent.click(verifySettings);

  // 3. Deploy stage timeout (an ordinary ci stage running deploy.sh)
  const deploySettings = screen.getByRole('button', { name: 'Configure stage Deploy' });
  fireEvent.click(deploySettings);

  const deployTimeoutInput = screen.getByLabelText('Timeout in minutes for Deploy');
  expect(deployTimeoutInput).toBeInTheDocument();
  expect(deployTimeoutInput).toHaveAttribute('placeholder', '1 (Default: 1 min)');
  expect(screen.getByText(/Default: 1 min if empty\./i)).toBeInTheDocument();

  fireEvent.change(deployTimeoutInput, { target: { value: '10' } });
  expect(handleUpdateStage).toHaveBeenCalledWith('3', { timeout: 600000 });

  // A deploy-command ci stage acts like any other ci stage: ordinary bash command
  // label and standard Run-on-branch control.
  expect(screen.getByText('Verification Script / Bash Command')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /Run-on branch for Deploy/i })).toBeInTheDocument();
  expect(screen.queryByText(/Run-on-branch setting is ignored/i)).not.toBeInTheDocument();

  // Close Deploy settings and confirm a plain CI stage still offers it.
  fireEvent.click(deploySettings);
  fireEvent.click(verifySettings);
  expect(screen.getByText('Verification Script / Bash Command')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: /Run-on branch for Verify/i })).toBeInTheDocument();
});

test('stage prompt settings includes dynamic keyword token picker chips (#35)', () => {
  const handleUpdateStage = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas' }],
    tasks: [],
    handleUpdateStage,
  });

  // Open stage settings drawer
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));

  // Check that keyword tokens are rendered
  expect(screen.getByRole('button', { name: 'Insert keyword {{project}}' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Insert keyword {{taskDocs}}' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Insert keyword {{previousReports}}' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Insert keyword {{taskId}}' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Insert keyword {{taskGoal}}' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Insert keyword {{stageName}}' })).toBeInTheDocument();

  // Click token to insert into prompt
  fireEvent.click(screen.getByRole('button', { name: 'Insert keyword {{taskDocs}}' }));
  expect(handleUpdateStage).toHaveBeenCalledWith('1', { prompt: 'Generate ideas {{taskDocs}}' });
});

test('Delete Stage shows a loading state and a fast double-click removes once', async () => {
  let resolveSave;
  const handleRemoveStage = vi.fn();
  const saveStages = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
  );
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    handleRemoveStage,
    saveStages,
  });

  // Open the stage settings drawer for the first column
  fireEvent.click(screen.getByLabelText('Configure stage Idea'));

  const deleteBtn = screen.getByLabelText('Delete stage Idea');
  fireEvent.click(deleteBtn);
  fireEvent.click(deleteBtn); // fast second click before the save settles

  // The stage is removed optimistically and the removal is persisted once.
  expect(handleRemoveStage).toHaveBeenCalledTimes(1);
  expect(handleRemoveStage).toHaveBeenCalledWith('1');
  expect(saveStages).toHaveBeenCalledWith('proj-1', [stages[1]]);
  const deletingBtn = screen.getByLabelText('Delete stage Idea');
  expect(deletingBtn).toBeDisabled();
  expect(deletingBtn).toHaveTextContent('Deleting...');

  // The drawer closes only once the backend has confirmed the save.
  await act(async () => {
    resolveSave({});
  });
  await waitFor(() => {
    expect(screen.queryByLabelText('Delete stage Idea')).not.toBeInTheDocument();
  });

  confirmSpy.mockRestore();
});
