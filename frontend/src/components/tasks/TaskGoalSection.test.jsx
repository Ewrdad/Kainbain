import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithKainBain } from '../../testUtils';
import { KainBainContext } from '../../context/KainBainContext';
vi.mock('../../services/api', () => ({
  API_BASE: '',
  api: {
    listTaskImages: vi.fn().mockResolvedValue({ images: [] }),
    uploadTaskImage: vi.fn(),
    deleteTaskImage: vi.fn(),
  },
}));

import { api } from '../../services/api';
import { TaskGoalSection } from './TaskGoalSection';
import '@testing-library/jest-dom';

/***
 * MARK: TaskGoalSection tests
 * @description Verifies the shared goal editor used by both task detail surfaces:
 *   edit/preview mode defaulting (preview by default, edit for just-created
 *   tasks), the "applies from next stage" warning when editing during
 *   execution, mode resets on task switch, dirty-guard transitions, and
 *   auto-save wiring.
 ***/

beforeEach(() => {
  vi.clearAllMocks();
});

// Re-render with new props through the same context provider so the component
// instance (and its mode state) survives, exactly like live prop updates when
// a task status changes while the view is open. Calling rerender with a
// different root element would remount and re-run the mode initializer.
function rerenderWithProps(renderResult, props) {
  // Mirror the renderWithKainBain root (MemoryRouter > Provider) so the
  // component instance (and its mode state) survives, exactly like live prop
  // updates. A different root element would remount and re-run the initializer.
  renderResult.rerender(
    <MemoryRouter initialEntries={['/']}>
      <KainBainContext.Provider value={renderResult.value}>
        <TaskGoalSection {...props} />
      </KainBainContext.Provider>
    </MemoryRouter>,
  );
}

// Minimal props shared by every test: a controlled goal value with passthrough
// handlers, mirroring how TaskDetailPage / TaskDetailOverlay wire useAutoSave.
// Old creation date pins every default fixture to the "old task" side of the
// newly-created window, so default-mode assertions are deterministic.
const OLD_CREATED_AT = '2026-01-01T00:00:00.000Z';
// Fresh timestamp for the just-created exception path (well inside the
// five-minute edit window no matter when the suite runs).
const freshCreatedAt = () => new Date().toISOString();

function makeProps(overrides = {}) {
  return {
    taskId: 'task-1',
    createdAt: OLD_CREATED_AT,
    title: 'Build the login page',
    onTitleChange: vi.fn(),
    onBlurSave: vi.fn(),
    isSaving: false,
    lastSaved: null,
    error: null,
    isExecuting: false,
    isDirty: false,
    idPrefix: 'page-task-goal',
    variant: 'page',
    ...overrides,
  };
}

test('renders markdown preview by default for an old task when no stage is executing', () => {
  renderWithKainBain(<TaskGoalSection {...makeProps()} />);

  // Preview-by-default: rendered markdown instead of the textarea.
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();
  // No running-stage warning for idle tasks.
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

test('opens a just-created idle task ready to edit, with no running warning', () => {
  renderWithKainBain(<TaskGoalSection {...makeProps({ createdAt: freshCreatedAt() })} />);

  const textarea = screen.getByLabelText('Task Title');
  expect(textarea).toBeInTheDocument();
  expect(textarea).toHaveValue('Build the login page');

  // Preview pane is hidden in edit mode.
  expect(screen.queryByTestId('markdown-viewer')).not.toBeInTheDocument();
  // No running-stage warning for idle tasks.
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  // No advisory tooltip on the Edit toggle when nothing is executing.
  expect(editToggleTitle()).toBeNull();
});

test('defaults to markdown preview mode when the task is executing', () => {
  renderWithKainBain(<TaskGoalSection {...makeProps({ isExecuting: true })} />);

  // Preview mode: rendered markdown instead of the textarea.
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();

  // The warning only appears once Edit is clicked, never in preview.
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

test('a just-created task opens in edit even while its first stage is executing, with the next-stage warning', () => {
  renderWithKainBain(
    <TaskGoalSection {...makeProps({ isExecuting: true, createdAt: freshCreatedAt() })} />,
  );

  // Newly-created wins over executing for the initial mode.
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
  // ...but the running-stage warning still explains the next-stage caveat.
  expect(screen.getByRole('note')).toBeInTheDocument();
  expect(screen.getByText(/applies from the next stage/i)).toBeInTheDocument();
  expect(editToggleTitle()).toEqual(expect.stringMatching(/only affects the next stage/i));
});

test('clicking Edit while the stage is executing reveals the next-stage warning and the textarea', () => {
  renderWithKainBain(<TaskGoalSection {...makeProps({ isExecuting: true })} />);

  const editToggle = screen.getAllByRole('button', { name: 'Edit' })[0];
  // Discoverable before the click: the toggle explains the implication.
  expect(editToggle).toHaveAttribute('title', expect.stringMatching(/only affects the next stage/i));
  fireEvent.click(editToggle);

  expect(screen.getByRole('note')).toBeInTheDocument();
  expect(screen.getByText(/applies from the next stage/i)).toBeInTheDocument();
  expect(screen.getByText(/will not reach the running agent/i)).toBeInTheDocument();
  // Points the user at the live channel for immediate instructions.
  expect(screen.getByText(/Manual Intervention & Real-Time Steering/i)).toBeInTheDocument();

  // Editing stays possible (warning, not a block).
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
});

test('shows no warning when manually editing a task that is not executing', () => {
  renderWithKainBain(<TaskGoalSection {...makeProps()} />);
  // Old idle task opens in preview; the user opts into edit mode.
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  expect(editToggleTitle()).toBeNull();
});

// The Edit toggle only carries the advisory tooltip while a stage is running.
function editToggleTitle() {
  const el = screen.queryByRole('button', { name: 'Edit' });
  return el ? el.getAttribute('title') : null;
}

test('warning disappears when switching to preview mode and back shows it again', () => {
  renderWithKainBain(<TaskGoalSection {...makeProps({ isExecuting: true })} />);

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  expect(screen.getByRole('note')).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
  expect(screen.queryByRole('note')).not.toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  expect(screen.getByRole('note')).toBeInTheDocument();
});

test('typing forwards the new value and blur triggers the auto-save blur handler', () => {
  const onTitleChange = vi.fn();
  const onBlurSave = vi.fn();
  // Fresh task so the editor is open by default (preview-by-default otherwise).
  renderWithKainBain(
    <TaskGoalSection {...makeProps({ onTitleChange, onBlurSave, createdAt: freshCreatedAt() })} />,
  );

  const textarea = screen.getByLabelText('Task Title');
  fireEvent.change(textarea, { target: { value: 'Updated goal' } });
  expect(onTitleChange).toHaveBeenCalledWith('Updated goal');

  fireEvent.blur(textarea);
  expect(onBlurSave).toHaveBeenCalledTimes(1);
});

test('renders the manual save button only when onManualSave is provided', () => {
  const onManualSave = vi.fn();
  renderWithKainBain(
    <TaskGoalSection
      {...makeProps({
        onManualSave,
        manualSaveDisabled: false,
        manualSaveLabel: 'Manual Save',
      })}
    />,
  );
  const saveBtn = screen.getByRole('button', { name: 'Manual Save' });
  expect(saveBtn).toBeEnabled();

  fireEvent.click(saveBtn);
  expect(onManualSave).toHaveBeenCalledTimes(1);
});

test('omits the manual save button when no handler is provided (overlay variant)', () => {
  renderWithKainBain(
    <TaskGoalSection {...makeProps({ variant: 'overlay', idPrefix: 'task-goal' })} />,
  );
  expect(screen.queryByRole('button', { name: 'Manual Save' })).not.toBeInTheDocument();
});

test('disables and relabels the manual save button while a save is pending', () => {
  renderWithKainBain(
    <TaskGoalSection
      {...makeProps({
        onManualSave: () => {},
        manualSaveDisabled: true,
        manualSaveLabel: 'Saving...',
      })}
    />,
  );
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
});

test('switching taskId resets the mode to the default for the new task age', () => {
  const renderResult = renderWithKainBain(
    <TaskGoalSection {...makeProps({ taskId: 'task-1', createdAt: freshCreatedAt() })} />,
  );

  // Fresh task-1 opens in edit; the user manually chose preview.
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();

  // Opening an old idle task re-resolves to preview (new→old).
  rerenderWithProps(renderResult, makeProps({ taskId: 'task-2' }));
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();

  // Opening a just-created task re-resolves to edit (old→new).
  rerenderWithProps(renderResult, makeProps({ taskId: 'task-3', createdAt: freshCreatedAt() }));
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();

  // Opening an old running task starts in preview mode with a clean editor.
  rerenderWithProps(renderResult, makeProps({ taskId: 'task-4', isExecuting: true }));
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();

  // Task switch also clears any running-stage warning from the previous task.
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

test('transition: stage starting while the editor is clean switches to preview', () => {
  const renderResult = renderWithKainBain(
    <TaskGoalSection {...makeProps({ isExecuting: false })} />,
  );
  // Old idle task opens in preview; the user opted into a clean editor.
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();

  rerenderWithProps(renderResult, makeProps({ isExecuting: true, isDirty: false }));
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();
});

test('transition: stage starting on a just-created task does not yank its clean editor to preview', () => {
  const renderResult = renderWithKainBain(
    <TaskGoalSection {...makeProps({ isExecuting: false, createdAt: freshCreatedAt() })} />,
  );
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();

  rerenderWithProps(
    renderResult,
    makeProps({ isExecuting: true, isDirty: false, createdAt: freshCreatedAt() }),
  );

  // Clean editor on a fresh task survives dispatch; the warning explains it.
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
  expect(screen.getByRole('note')).toBeInTheDocument();
});

test('transition: stage starting while the user is editing does not yank them out of edit mode', () => {
  const renderResult = renderWithKainBain(
    <TaskGoalSection {...makeProps({ isExecuting: false, createdAt: freshCreatedAt() })} />,
  );

  // User has unsaved edits in the textarea when dispatch happens.
  rerenderWithProps(
    renderResult,
    makeProps({ isExecuting: true, isDirty: true, createdAt: freshCreatedAt() }),
  );

  // Editor is preserved and the warning now explains the situation.
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
  expect(screen.getByRole('note')).toBeInTheDocument();
});

test('running stage finishing leaves the editor in the mode the user chose', () => {
  const renderResult = renderWithKainBain(
    <TaskGoalSection {...makeProps({ isExecuting: true })} />,
  );

  // While running the user opened edit mode; the run finishing must not
  // yank them back to preview.
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  rerenderWithProps(renderResult, makeProps({ isExecuting: false }));

  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});
describe('TaskGoalSection image affordance', () => {
  function makeImageProps(overrides = {}) {
    // Fresh task so the editor (and its attach affordance) is open by
    // default, exercising the just-created exception path too.
    return makeProps({ projectId: 'proj-1', createdAt: freshCreatedAt(), ...overrides });
  }

  test('renders the attach affordance in edit mode when task context is present', () => {
    renderWithKainBain(<TaskGoalSection {...makeImageProps()} />);
    expect(screen.getByTestId('task-image-attach')).toBeInTheDocument();
    expect(screen.getByTestId('task-image-upload-button')).toBeInTheDocument();
  });

  test('omits the attach affordance without a projectId (legacy surfaces unchanged)', () => {
    // Fresh task so the editor is open: absence proves "no projectId",
    // not "preview mode hides the affordance".
    renderWithKainBain(<TaskGoalSection {...makeProps({ createdAt: freshCreatedAt() })} />);
    expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
    expect(screen.queryByTestId('task-image-attach')).not.toBeInTheDocument();
  });

  test('appends the uploaded image markdown at the end with a new line even when caret is at the start', async () => {
    api.uploadTaskImage.mockResolvedValue({
      name: 'shot.png',
      path: 'assets/shot.png',
    });
    const props = makeImageProps({ title: 'My Task Title' });
    renderWithKainBain(<TaskGoalSection {...props} />);
    const textarea = screen.getByLabelText('Task Title');
    // Caret at position 0: the title must stay intact at the start.
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    const input = document.querySelector('[data-testid="task-image-input"]');
    const file = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(props.onTitleChange).toHaveBeenCalled());
    const inserted = props.onTitleChange.mock.calls[0][0];
    expect(inserted).toBe('My Task Title\n\n![shot.png](assets/shot.png)\n');
    // Title/first line is untouched — the image lands on its own line at the end.
    expect(inserted.split('\n')[0]).toBe('My Task Title');
  });

  test('appends the uploaded image markdown at the end even when caret is mid-text', async () => {
    api.uploadTaskImage.mockResolvedValue({
      name: 'shot.png',
      path: 'assets/shot.png',
    });
    const props = makeImageProps({ title: 'Build the login page' });
    renderWithKainBain(<TaskGoalSection {...props} />);
    const textarea = screen.getByLabelText('Task Title');
    // Caret after "Build " — must NOT split the text there.
    textarea.focus();
    textarea.setSelectionRange(6, 6);

    const input = document.querySelector('[data-testid="task-image-input"]');
    const file = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(props.onTitleChange).toHaveBeenCalled());
    const inserted = props.onTitleChange.mock.calls[0][0];
    expect(inserted).toBe('Build the login page\n\n![shot.png](assets/shot.png)\n');
  });

  test('appends image markdown with correct spacing when goal already ends with a newline', async () => {
    api.uploadTaskImage.mockResolvedValue({
      name: 'end.png',
      path: 'assets/end.png',
    });
    const props = makeImageProps({ title: 'Goal text\n' });
    renderWithKainBain(<TaskGoalSection {...props} />);
    const input = document.querySelector('[data-testid="task-image-input"]');
    const file = new File([new Uint8Array([1])], 'end.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(props.onTitleChange).toHaveBeenCalled());
    const inserted = props.onTitleChange.mock.calls[0][0];
    expect(inserted).toBe('Goal text\n\n![end.png](assets/end.png)\n');
  });

  test('appends image markdown cleanly when the goal text is empty', async () => {
    api.uploadTaskImage.mockResolvedValue({
      name: 'first.png',
      path: 'assets/first.png',
    });
    const props = makeImageProps({ title: '' });
    renderWithKainBain(<TaskGoalSection {...props} />);
    const input = document.querySelector('[data-testid="task-image-input"]');
    const file = new File([new Uint8Array([1])], 'first.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(props.onTitleChange).toHaveBeenCalled());
    const inserted = props.onTitleChange.mock.calls[0][0];
    expect(inserted).toBe('![first.png](assets/first.png)\n');
  });

  test('multi-select: one gesture with 3 images links all 3 in order, one after another', async () => {
    api.uploadTaskImage.mockImplementation(async (projectId, taskId, file) => ({
      name: file.name,
      path: `assets/${file.name}`,
    }));
    // Stateful harness mirroring the real parents (TaskDetailPage/Overlay pass
    // setTitle directly): the goal value lives here, so rapid sequential
    // onTitleChange calls accumulate exactly like production — a stale closure
    // would leave only the last reference in the textarea.
    function Harness() {
      const [value, setValue] = React.useState('Goal text');
      return (
        <TaskGoalSection
          {...makeImageProps({ title: value, onTitleChange: setValue })}
        />
      );
    }
    renderWithKainBain(<Harness />);
    const input = document.querySelector('[data-testid="task-image-input"]');
    const files = ['a.png', 'b.png', 'c.png'].map(
      (name) => new File([new Uint8Array([1])], name, { type: 'image/png' }),
    );
    await act(async () => {
      fireEvent.change(input, { target: { files } });
    });

    await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledTimes(3));
    const textarea = await screen.findByLabelText('Task Title');
    await waitFor(() => expect(textarea.value).toContain('![c.png](assets/c.png)'));
    const value = textarea.value;
    const idxA = value.indexOf('![a.png](assets/a.png)');
    const idxB = value.indexOf('![b.png](assets/b.png)');
    const idxC = value.indexOf('![c.png](assets/c.png)');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxC).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
    expect(value.split('\n')[0]).toBe('Goal text');
  });

  test('keeps keystrokes typed while an upload is in flight', async () => {
    // The batch lands seconds after the gesture; the append must apply to the
    // latest goal text, not the render-time value from when picking started.
    let resolveUpload;
    api.uploadTaskImage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpload = () => resolve({ name: 'shot.png', path: 'assets/shot.png' });
        }),
    );
    function Harness() {
      const [value, setValue] = React.useState('Goal text');
      return <TaskGoalSection {...makeImageProps({ title: value, onTitleChange: setValue })} />;
    }
    renderWithKainBain(<Harness />);
    const input = document.querySelector('[data-testid="task-image-input"]');
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledTimes(1));

    // The user keeps typing while the upload is in flight.
    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Goal text plus more detail' },
    });

    await act(async () => {
      resolveUpload();
    });
    const textarea = screen.getByLabelText('Task Title');
    await waitFor(() => expect(textarea.value).toContain('![shot.png](assets/shot.png)'));
    expect(textarea.value.startsWith('Goal text plus more detail')).toBe(true);
  });

  test('appends image markdown when the textarea caret is unavailable', async () => {
    api.uploadTaskImage.mockResolvedValue({
      name: 'end.png',
      path: 'assets/end.png',
    });
    const props = makeImageProps({ title: 'Goal text' });
    const renderResult = renderWithKainBain(<TaskGoalSection {...props} />);
    // Simulate the ref being empty (textarea not yet attached).
    renderResult.rerender(
      <MemoryRouter initialEntries={['/']}>
        <KainBainContext.Provider value={renderResult.value}>
          <TaskGoalSection {...props} />
        </KainBainContext.Provider>
      </MemoryRouter>,
    );
    const input = document.querySelector('[data-testid="task-image-input"]');
    const file = new File([new Uint8Array([1])], 'end.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => expect(props.onTitleChange).toHaveBeenCalled());
    const inserted = props.onTitleChange.mock.calls[0][0];
    expect(inserted).toBe('Goal text\n\n![end.png](assets/end.png)\n');
  });
});

/***
 * MARK: TaskGoalSection extra-slot visibility tests
 * @description The `children` slot (context token chips on both detail
 *   surfaces) renders only in edit mode: preview mode is for reviewing, so
 *   the token block stays hidden there and the layout reclaims its space.
 ***/
describe('TaskGoalSection extra-slot (children) visibility', () => {
  test('hides the extra slot in preview mode for an old idle task', () => {
    renderWithKainBain(
      <TaskGoalSection {...makeProps()}>
        <div data-testid="extra-slot">tokens</div>
      </TaskGoalSection>,
    );

    // Preview-by-default: the slot stays out of the DOM entirely.
    expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('extra-slot')).not.toBeInTheDocument();
  });

  test('shows the extra slot in edit mode for a just-created task', () => {
    renderWithKainBain(
      <TaskGoalSection {...makeProps({ createdAt: freshCreatedAt() })}>
        <div data-testid="extra-slot">tokens</div>
      </TaskGoalSection>,
    );

    expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
    expect(screen.getByTestId('extra-slot')).toBeInTheDocument();
  });

  test('toggling Edit/Preview flips the extra slot without losing goal text', () => {
    renderWithKainBain(
      <TaskGoalSection {...makeProps()}>
        <div data-testid="extra-slot">tokens</div>
      </TaskGoalSection>,
    );

    // Preview first: slot hidden, goal rendered as markdown.
    expect(screen.queryByTestId('extra-slot')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(screen.getByTestId('extra-slot')).toBeInTheDocument();
    expect(screen.getByLabelText('Task Title')).toHaveValue('Build the login page');

    fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    expect(screen.queryByTestId('extra-slot')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-viewer')).toHaveTextContent('Build the login page');
  });

  test('hides the unsynced badge while no local draft is outstanding', () => {
    renderWithKainBain(<TaskGoalSection {...makeProps()} />);
    expect(screen.queryByText('Unsynced changes')).not.toBeInTheDocument();
  });

  test('shows the unsynced badge over the preview when a local draft is outstanding', () => {
    renderWithKainBain(<TaskGoalSection {...makeProps({ hasUnsyncedChanges: true })} />);

    // Visible even in the default preview mode so a restored draft is never
    // silently mistaken for the saved server value.
    expect(screen.getByText('Unsynced changes')).toBeInTheDocument();
  });
});
