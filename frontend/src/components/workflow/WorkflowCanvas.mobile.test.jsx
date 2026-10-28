import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { DEFAULT_UI_PREFERENCES } from '../../context/useUiPreferences';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas.mobile tests
 * @description Mobile board cases owned by `CanvasToolbar` (stage-selector strip) and the orchestrator board layout: mobile tab resolution, absence of hidden-by-workflow notices, loading/error banners and responsive width/panning contracts. Rendered through `WorkflowCanvas` (integration).
 ***/
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  // Hermetic HTTP boundary: every canvas render fires `useModelCatalog` →
  // `/compute/models`. Unstubbed, happy-dom performs a REAL fetch (against
  // localhost:3100 when the stack is up) that may still be in flight at
  // teardown, printing an AbortError and racing the run. An empty catalogue
  // resolves immediately, so nothing is pending and no test touches the
  // network. These suites assert board layout only, never model data.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ models: [], harnesses: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
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

test('mobile tab defaults to the first stage with visible tasks instead of an empty first column', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [
      { id: '1', name: 'Idea', type: 'agent' },
      { id: '4', name: 'Review Plan', type: 'human' },
    ],
    tasks: [
      {
        id: 't-review',
        goal: 'Needs review',
        currentStageId: '4',
        status: 'waiting_human',
        workflowId: 'wf-default',
      },
    ],
    activeProjectId: 'proj-1',
  });

  expect(screen.getByRole('tab', { name: /review plan/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByRole('tab', { name: /idea/i })).toHaveAttribute('aria-selected', 'false');
});

test('mobile tab falls back to the first stage when no stage has visible tasks', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [
      { id: '1', name: 'Idea', type: 'agent' },
      { id: '4', name: 'Review Plan', type: 'human' },
    ],
    tasks: [],
    activeProjectId: 'proj-1',
  });

  expect(screen.getByRole('tab', { name: /idea/i })).toHaveAttribute('aria-selected', 'true');
});

test('renders stable board with no workflow notice when tasks hide under another workflow', async () => {
  const switchWorkflow = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [
      { id: '1', name: 'Idea', type: 'agent' },
      { id: '4', name: 'Review Plan', type: 'human' },
    ],
    tasks: [
      {
        id: 't-review',
        goal: 'Needs review',
        currentStageId: '4',
        status: 'waiting_human',
        workflowId: 'wf-default',
      },
    ],
    activeWorkflowId: 'wf-audit-e09c23',
    projectWorkflows: [
      { id: 'wf-default', name: 'Feature Pipeline', isDefault: true },
      { id: 'wf-audit-e09c23', name: 'Audit', isDefault: false },
    ],
    activeProjectId: 'proj-1',
    switchWorkflow,
  });

  expect(screen.queryByLabelText('Tasks hidden by workflow filter')).toBeNull();
  expect(screen.queryByText(/waiting in/)).not.toBeInTheDocument();

  // Workflow selector dropdown remains the primary path to switch back
  const wfButton = screen.getByRole('button', { name: /Select pipeline workflow/i });
  fireEvent.click(wfButton);
  const switchOption = screen.getByRole('menuitem', { name: /Feature Pipeline/i });
  fireEvent.click(switchOption);
  expect(switchWorkflow).toHaveBeenCalledWith('proj-1', 'wf-default');
});

test('shows no workflow notice when the board has visible tasks', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [
      { id: '1', name: 'Idea', type: 'agent' },
      { id: '4', name: 'Review Plan', type: 'human' },
    ],
    tasks: [
      {
        id: 't-review',
        goal: 'Needs review',
        currentStageId: '4',
        status: 'waiting_human',
        workflowId: 'wf-default',
      },
    ],
    activeProjectId: 'proj-1',
  });

  expect(screen.queryByText(/waiting in/)).not.toBeInTheDocument();
});

test('shows a tasks skeleton while the first list load is in flight', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ id: '1', name: 'Idea', type: 'agent' }],
    tasks: [],
    tasksLoading: true,
    activeProjectId: 'proj-1',
  });

  expect(screen.getByText('Loading tasks…')).toBeInTheDocument();
});

test('shows a retry action when the task list fails to load', () => {
  const retryTasks = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ id: '1', name: 'Idea', type: 'agent' }],
    tasks: [],
    tasksLoading: false,
    tasksError: new Error('network down'),
    retryTasks,
    activeProjectId: 'proj-1',
  });

  expect(screen.getByText(/Couldn't load tasks/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retryTasks).toHaveBeenCalledWith('proj-1');
});

test('shows a switching state and disables workflow items while switching', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ id: '1', name: 'Idea', type: 'agent' }],
    tasks: [],
    projectWorkflows: [
      { id: 'wf-default', name: 'Feature Pipeline', isDefault: true },
      { id: 'wf-audit', name: 'Audit', isDefault: false },
    ],
    workflowSwitching: true,
    activeProjectId: 'proj-1',
  });

  fireEvent.click(screen.getByRole('button', { name: /select pipeline workflow/i }));
  expect(screen.getByText('Switching…')).toBeInTheDocument();
  for (const item of screen.getAllByRole('menuitem')) {
    if (/feature pipeline|audit/i.test(item.textContent || '')) {
      expect(item).toBeDisabled();
    }
  }
});

/***
 * MARK: mobile stage-only board tests
 * @description Mobile (< 768px) shows one stage column only: the desktop
 * dashed end column is hidden and stage creation lives in the trailing
 * button of the stage-selector strip.
 ***/

test('board Add Stage card is hidden on mobile but shown on desktop', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  // The desktop dashed card (identified by its "Extend pipeline" caption,
  // which the mobile strip button does not render).
  const columnCard = screen.getByText('Extend pipeline').closest('[role="button"]');
  expect(columnCard).not.toBeNull();
  expect(columnCard.classList.contains('hidden')).toBe(true);
  expect(columnCard.classList.contains('md:flex')).toBe(true);
});

test('mobile strip ends with an Add stage button that is not a tab', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  const tablist = screen.getByRole('tablist', { name: /mobile stage column selector/i });
  const addButton = within(tablist).getByRole('button', { name: 'Add new pipeline stage' });
  expect(addButton).toBeInTheDocument();
  // Action, not a tab: must not carry role="tab" or aria-selected.
  expect(addButton).not.toHaveAttribute('role', 'tab');
  expect(addButton.hasAttribute('aria-selected')).toBe(false);
  // 44px touch target per the existing strip standard.
  expect(addButton.className).toMatch(/min-h-\[44px\]/);
});

test('mobile trailing Add button creates a stage via the desktop creation path', () => {
  const handleAddStage = vi.fn();
  const saveStages = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    activeProjectId: 'proj-1',
    handleAddStage,
    saveStages,
  });

  const tablist = screen.getByRole('tablist', { name: /mobile stage column selector/i });
  fireEvent.click(within(tablist).getByRole('button', { name: 'Add new pipeline stage' }));

  expect(handleAddStage).toHaveBeenCalledTimes(1);
  expect(saveStages).toHaveBeenCalledTimes(1);
  expect(saveStages).toHaveBeenCalledWith('proj-1', expect.any(Array));
  const next = saveStages.mock.calls[0][1];
  expect(next).toHaveLength(stages.length + 1);
  expect(next[next.length - 1].name).toBe(`New Stage ${stages.length + 1}`);
});

test('new stage created from the mobile strip becomes the selected tab', () => {
  const saveStages = vi.fn();
  const rendered = renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    activeProjectId: 'proj-1',
    handleAddStage: () => {},
    saveStages,
  });

  const tablist = screen.getByRole('tablist', { name: /mobile stage column selector/i });
  fireEvent.click(within(tablist).getByRole('button', { name: 'Add new pipeline stage' }));

  const next = saveStages.mock.calls[0][1];
  // Feed the persisted stages back into the same mounted instance (state is
  // preserved across rerender) so the new tab can resolve its selection.
  rendered.rerender(
    <MemoryRouter initialEntries={['/']}>
      <KainBainContext.Provider value={{ ...rendered.value, stages: next }}>
        <WorkflowCanvas />
      </KainBainContext.Provider>
    </MemoryRouter>,
  );

  const newName = next[next.length - 1].name;
  const newTab = screen
    .getAllByRole('tab')
    .find((tab) => (tab.textContent || '').includes(newName));
  expect(newTab).toBeInTheDocument();
  expect(newTab).toHaveAttribute('aria-selected', 'true');
});

test('desktop end column still renders alongside the mobile strip button', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    activeProjectId: 'proj-1',
  });

  // Both affordances share the accessible name: the desktop card and the
  // mobile trailing button.
  expect(screen.getAllByLabelText('Add new pipeline stage')).toHaveLength(2);
  expect(screen.getByText('Extend pipeline')).toBeInTheDocument();
});

/***
 * MARK: mobile single-stage full-width tests
 * @description When only one stage column is shown (< 768px) it must span
 * the whole board width. The column carries `w-full`/`flex` classes, and a
 * `@media (max-width: 767px)` override in `index.css` forces full width
 * past the desktop inline `columnWidth` style (e.g. `max-width: 280px`),
 * which otherwise caps the column and leaves an awkward gap. The index.css
 * half of this contract lives in `WorkflowCanvas.mobileCss.test.js` (node
 * env: a pure fs scan must not import `node:` builtins from a happy-dom
 * suite — that flakes under vmThreads worker sharing).
 ***/

test('mobile active stage column is the full-width flex child of the board', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  // Default mobile selection is the first stage with visible tasks ('1').
  const activeCol = document.getElementById('stage-col-1');
  expect(activeCol).not.toBeNull();
  expect(activeCol.tagName).toBe('SECTION');
  expect(activeCol.hasAttribute('data-stage-id')).toBe(true);
  expect(activeCol.classList.contains('flex')).toBe(true);
  expect(activeCol.classList.contains('w-full')).toBe(true);

  // The inactive column stays hidden on mobile (only one stage at a time).
  const inactiveCol = document.getElementById('stage-col-2');
  expect(inactiveCol).not.toBeNull();
  expect(inactiveCol.classList.contains('hidden')).toBe(true);
});

test('mobile board locks horizontal panning but keeps desktop column scroll', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  // With a single full-width stage there is nothing to slide to on a phone,
  // so the board must not pan sideways; desktop keeps overflow scroll for
  // the multi-column strip.
  const board = screen.getByLabelText('Workflow pipeline canvas');
  expect(board.classList.contains('overflow-x-hidden')).toBe(true);
  expect(board.classList.contains('md:overflow-x-auto')).toBe(true);
});

test('mobile trailing Add button sits in the normal flow at the end of the strip', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  // No `sticky right-0` pinning: the creation pill is a plain in-flow flex
  // child that scrolls with the strip instead of overlaying the stage tabs.
  const tablist = screen.getByRole('tablist', { name: /mobile stage column selector/i });
  const addButton = within(tablist).getByRole('button', { name: 'Add new pipeline stage' });
  expect(addButton.className).not.toMatch(/(?:^|\s)sticky(?:\s|$)/);
  expect(addButton.className).not.toMatch(/right-0/);
  // Scrolls with the strip as a normal child (never shrinks into an
  // overlay) and keeps the 44px touch target.
  expect(addButton.className).toMatch(/(?:^|\s)shrink-0(?:\s|$)/);
  // Still an action, not a tab.
  expect(addButton).not.toHaveAttribute('role', 'tab');
  expect(addButton.className).toMatch(/min-h-\[44px\]/);
});

test('mobile Add stage pill is the last item of the scrolling strip', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  const tablist = screen.getByRole('tablist', { name: /mobile stage column selector/i });
  const addButton = within(tablist).getByRole('button', { name: 'Add new pipeline stage' });

  // Trailing in-flow placement: the pill is the last child of the strip,
  // after every stage tab, inside the horizontally scrolling container.
  const children = Array.from(tablist.children);
  expect(children.length).toBeGreaterThan(1);
  expect(children[children.length - 1]).toBe(addButton);
  expect(tablist.className).toMatch(/overflow-x-auto/);
});

test('mobile Add stage pill matches the unselected stage-tab pill styling', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  const tablist = screen.getByRole('tablist', { name: /mobile stage column selector/i });
  const stageTabs = within(tablist).getAllByRole('tab');
  const unselectedTab = stageTabs.find((tab) => tab.getAttribute('aria-selected') === 'false');
  expect(unselectedTab).toBeDefined();
  const addButton = within(tablist).getByRole('button', { name: 'Add new pipeline stage' });

  // Same pill metrics as an unselected stage tab (padding, radius, label
  // typography, touch target) so it reads as one more item in the strip.
  // Mobile density (task 34793321): compact `px/py` below `sm` with the
  // roomier desktop metrics restored at `sm:`; the 44px target never moves.
  for (const className of [
    'px-2.5',
    'py-1.5',
    'sm:px-3.5',
    'sm:py-2',
    'rounded',
    'text-xs',
    'min-h-[44px]',
  ]) {
    expect(unselectedTab.className).toContain(className);
    expect(addButton.className).toContain(className);
  }

  // The dashed border stays the single cue that this pill creates a stage
  // instead of selecting one, so it is not mistaken for a real stage.
  expect(addButton.className).toMatch(/border-dashed/);
  expect(unselectedTab.className).not.toMatch(/border-dashed/);
});

/***
 * MARK: filter persistence tests
 * @description Contract for persistent board filters: seeded localStorage
 *   restores the pre-refresh view, user changes are written back, and
 *   corrupt values fall back to defaults without breaking render.
 ***/
