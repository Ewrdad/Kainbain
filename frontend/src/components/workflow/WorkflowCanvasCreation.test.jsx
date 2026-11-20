import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkflowCanvas } from './WorkflowCanvas';
import { vi } from 'vitest';
import { api } from '../../services/api';
import { useKainBain } from '../../context/KainBainContext';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      createTask: vi.fn(),
      executeTaskStage: vi.fn(),
      healthStatus: vi.fn(),
      listProjects: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock('../../context/KainBainContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useKainBain: vi.fn(),
  };
});

const mockTask = {
  id: 'task-123',
  title: 'New Task',
  goal: 'New Task',
  currentStageId: 'stage-1',
  status: 'waiting_human',
};

const mockStages = [
  { id: 'stage-1', name: 'Idea', type: 'agent' },
];

describe('WorkflowCanvas Task Creation', () => {
  it('immediately opens the task inspector after inline creation', async () => {
    const mockSetSelectedTask = vi.fn();
    const mockCreateTask = vi.fn().mockResolvedValue(mockTask);
    const mockExecuteTaskStage = vi.fn().mockResolvedValue({ status: 'running' });

    vi.mocked(useKainBain).mockReturnValue({
      stages: mockStages,
      tasks: [],
      setSelectedTask: mockSetSelectedTask,
      createTask: mockCreateTask,
      executeTaskStage: mockExecuteTaskStage,
      activeProjectId: 'proj-1',
      activeWorkflowId: 'wf-1',
      projects: [],
      projectWorkflows: [],
      uiPreferences: {},
    });

    render(<WorkflowCanvas />);

    // Trigger "Add Task" in first column
    await waitFor(() => {
      expect(screen.getByText(/Add Task/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Add Task/i));

    // Fill in title and submit
    const input = screen.getByPlaceholderText(/Task goal/i);
    fireEvent.change(input, { target: { value: 'New Task' } });
    
    const form = input.closest('form');
    if (form) {
      fireEvent.submit(form);
    } else {
      const submitBtn = screen.getByRole('button', { name: /Create Task/i });
      fireEvent.click(submitBtn);
    }

    // Verify that setSelectedTask was called with the created task
    await waitFor(() => {
      expect(mockSetSelectedTask).toHaveBeenCalledWith(mockTask);
    });
  });

  it('previews the active pipeline base branch in the inline add-task form', async () => {
    vi.mocked(useKainBain).mockReturnValue({
      stages: mockStages,
      tasks: [],
      setSelectedTask: vi.fn(),
      createTask: vi.fn(),
      executeTaskStage: vi.fn(),
      activeProjectId: 'proj-1',
      activeWorkflowId: 'wf-feature',
      projects: [],
      projectWorkflows: [{ id: 'wf-feature', name: 'Feature', baseBranch: 'feature/auth' }],
      uiPreferences: {},
    });

    render(<WorkflowCanvas />);

    await waitFor(() => {
      expect(screen.getByText(/Add Task/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Add Task/i));
    expect(screen.getByText('New task will branch off feature/auth')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change in pipeline settings' }),
    ).toBeInTheDocument();
  });

  it('shows no base preview when the active pipeline uses the repo default', async () => {
    vi.mocked(useKainBain).mockReturnValue({
      stages: mockStages,
      tasks: [],
      setSelectedTask: vi.fn(),
      createTask: vi.fn(),
      executeTaskStage: vi.fn(),
      activeProjectId: 'proj-1',
      activeWorkflowId: 'wf-1',
      projects: [],
      projectWorkflows: [{ id: 'wf-1', name: 'Main Pipeline', isDefault: true }],
      uiPreferences: {},
    });

    render(<WorkflowCanvas />);

    await waitFor(() => {
      expect(screen.getByText(/Add Task/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Add Task/i));
    expect(screen.queryByText(/New task will branch off/)).toBeNull();
  });
});
