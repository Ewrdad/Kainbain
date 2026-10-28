import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeoutMinutesField, StageTypeConfig } from './StageTypeConfig';
import '@testing-library/jest-dom';

/***
 * MARK: TimeoutMinutesField tests
 * @description Pins the shared stage-timeout row: stored milliseconds display
 *   as minutes, edits commit back as whole milliseconds, and clearing (or
 *   unparseable mid-typing input) commits blank — never NaN — so the stored
 *   stage can never be corrupted from this field.
 ***/

function setup(props = {}) {
  const onCommit = vi.fn();
  render(
    <TimeoutMinutesField
      stageName="Deploy"
      timeoutMs={300000}
      onCommit={onCommit}
      tooltipTitle="Deploy Stage Timeout"
      tooltipDescription="Maximum wall-clock execution time for deployment command. Default: 5 min."
      placeholder="5 (Default: 5 min)"
      defaultHint="Default: 5 min if empty."
      {...props}
    />,
  );
  return { onCommit };
}

describe('TimeoutMinutesField', () => {
  test('displays stored milliseconds as minutes', () => {
    setup({ timeoutMs: 120000 });
    expect(screen.getByLabelText('Timeout in minutes for Deploy')).toHaveValue(2);
  });

  test('commits whole minutes back as milliseconds', () => {
    const { onCommit } = setup({ timeoutMs: '' });
    fireEvent.change(screen.getByLabelText('Timeout in minutes for Deploy'), {
      target: { value: '40' },
    });
    expect(onCommit).toHaveBeenCalledWith(2400000);
  });

  test('commits fractional minutes as whole milliseconds', () => {
    const { onCommit } = setup({ timeoutMs: '' });
    fireEvent.change(screen.getByLabelText('Timeout in minutes for Deploy'), {
      target: { value: '1.5' },
    });
    expect(onCommit).toHaveBeenCalledWith(90000);
  });

  test('clearing the field commits blank (follow the default), never NaN', () => {
    const { onCommit } = setup({ timeoutMs: 300000 });
    fireEvent.change(screen.getByLabelText('Timeout in minutes for Deploy'), {
      target: { value: '' },
    });
    expect(onCommit).toHaveBeenCalledWith('');
    expect(Number.isNaN(onCommit.mock.calls[0][0])).toBe(false);
  });

  test('unparseable input commits blank, never NaN', () => {
    const { onCommit } = setup({ timeoutMs: 300000 });
    fireEvent.change(screen.getByLabelText('Timeout in minutes for Deploy'), {
      target: { value: 'abc' },
    });
    expect(onCommit).toHaveBeenCalledWith('');
    expect(Number.isNaN(onCommit.mock.calls[0][0])).toBe(false);
  });

  test('blank stored timeout renders an empty input', () => {
    setup({ timeoutMs: '' });
    expect(screen.getByLabelText('Timeout in minutes for Deploy')).toHaveValue(null);
  });
});

/***
 * MARK: StageTypeConfig - CI Run on branch tests
 * @description Pins the ci-only branch selector: default task mode renders
 *   without the custom input, choosing custom reveals and binds the branch
 *   input, leaving custom clears the stale name, and non-ci stages never
 *   render the selector.
 ***/
describe('StageTypeConfig - CI Run on branch', () => {
  const baseStage = {
    id: 'ci-1',
    name: 'Verification',
    type: 'ci',
    command: 'npm test',
  };

  test('renders Run on branch selector with default task branch', () => {
    render(<StageTypeConfig stage={baseStage} onUpdateStage={vi.fn()} />);
    expect(screen.getByText('Run on branch')).toBeInTheDocument();
    expect(screen.getByLabelText('Run-on branch for Verification')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g. release/next')).not.toBeInTheDocument();
  });

  test('reveals custom branch input when custom mode is selected', () => {
    const onUpdate = vi.fn();
    const stage = { ...baseStage, runOnBranch: 'custom', customBranch: 'feat/test' };
    render(<StageTypeConfig stage={stage} onUpdateStage={onUpdate} />);
    const customInput = screen.getByLabelText('Custom branch for Verification');
    expect(customInput).toBeInTheDocument();
    expect(customInput).toHaveValue('feat/test');

    fireEvent.change(customInput, { target: { value: 'staging' } });
    expect(onUpdate).toHaveBeenCalledWith('ci-1', { customBranch: 'staging' });
  });

  test('selecting custom mode calls onUpdateStage with custom', () => {
    const onUpdate = vi.fn();
    render(<StageTypeConfig stage={baseStage} onUpdateStage={onUpdate} />);
    const trigger = screen.getByRole('combobox', { name: 'Run-on branch for Verification' });
    fireEvent.click(trigger);
    const customOption = screen.getByRole('option', { name: /CUSTOM BRANCH…/i });
    fireEvent.click(customOption);
    expect(onUpdate).toHaveBeenCalledWith('ci-1', {
      runOnBranch: 'custom',
    });
  });

  test('selecting primary mode clears customBranch and hides custom input', () => {
    const onUpdate = vi.fn();
    const stage = { ...baseStage, runOnBranch: 'custom', customBranch: 'feat/test' };
    render(<StageTypeConfig stage={stage} onUpdateStage={onUpdate} />);
    const trigger = screen.getByRole('combobox', { name: 'Run-on branch for Verification' });
    fireEvent.click(trigger);
    const primaryOption = screen.getByRole('option', { name: /PRIMARY BRANCH/i });
    fireEvent.click(primaryOption);
    expect(onUpdate).toHaveBeenCalledWith('ci-1', {
      runOnBranch: 'primary',
      customBranch: undefined,
    });
  });

  test('plain ci stages offer exactly task, primary, and custom', () => {
    const onUpdate = vi.fn();
    render(<StageTypeConfig stage={baseStage} onUpdateStage={onUpdate} />);
    const trigger = screen.getByRole('combobox', { name: 'Run-on branch for Verification' });
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: /^TASK BRANCH/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^PRIMARY BRANCH/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^CUSTOM BRANCH…/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /CHECKOUT/i })).not.toBeInTheDocument();
  });

  test('non-ci stage does not render Run on branch selector', () => {
    const agentStage = { id: 'agent-1', name: 'Agent', type: 'agent' };
    render(<StageTypeConfig stage={agentStage} onUpdateStage={vi.fn()} />);
    expect(screen.queryByText('Run on branch')).not.toBeInTheDocument();
  });
});

/***
 * MARK: StageTypeConfig - CI command keyword token chips tests
 * @description Pins the ci command token picker: the shared keyword chips
 *   render under the command textarea, clicking inserts the token into
 *   `command`/`script` (preserving existing text), and agent stages keep
 *   inserting into `prompt` instead.
 ***/
describe('StageTypeConfig - CI command keyword tokens', () => {
  const ciStage = {
    id: 'ci-1',
    name: 'Verification',
    type: 'ci',
    command: 'npm test',
  };

  test('renders command keyword chips for ci stages', () => {
    render(<StageTypeConfig stage={ciStage} onUpdateStage={vi.fn()} />);
    expect(
      screen.getByText('Command Keyword Tokens (interpolated at runtime)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert keyword {{taskDocs}}' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Insert keyword {{latestReportPath:plan}}' }),
    ).toBeInTheDocument();
  });

  test('clicking a chip appends the token to the command and script', () => {
    const onUpdate = vi.fn();
    render(<StageTypeConfig stage={ciStage} onUpdateStage={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert keyword {{taskDocs}}' }));
    expect(onUpdate).toHaveBeenCalledWith('ci-1', {
      command: 'npm test {{taskDocs}}',
      script: 'npm test {{taskDocs}}',
    });
  });

  test('clicking a chip on an empty command sets the token alone', () => {
    const onUpdate = vi.fn();
    render(
      <StageTypeConfig
        stage={{ id: 'ci-1', name: 'Verification', type: 'ci' }}
        onUpdateStage={onUpdate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Insert keyword {{projectRoot}}' }));
    expect(onUpdate).toHaveBeenCalledWith('ci-1', {
      command: '{{projectRoot}}',
      script: '{{projectRoot}}',
    });
  });

  test('agent chips keep inserting into the prompt, not the command', () => {
    const onUpdate = vi.fn();
    render(
      <StageTypeConfig
        stage={{ id: 'a-1', name: 'Idea', type: 'agent', prompt: 'Generate ideas' }}
        onUpdateStage={onUpdate}
      />,
    );
    expect(
      screen.queryByText('Command Keyword Tokens (interpolated at runtime)'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Insert keyword {{taskDocs}}' }));
    expect(onUpdate).toHaveBeenCalledWith('a-1', {
      prompt: 'Generate ideas {{taskDocs}}',
    });
  });
});

/***
 * MARK: StageTypeConfig - deploy-command Run on branch tests
 * @description Pins the always-visible toggle for deploy-command ci stages:
 *   the selector renders (no deploy.sh filter) with the same uniform
 *   three-option contract as a verification ci stage — task branch
 *   (default: the deploy runs from the task's isolated worktree),
 *   primary branch, custom branch — and mode changes commit runOnBranch
 *   exactly like a verification ci stage.
 ***/
describe('StageTypeConfig - deploy-command Run on branch', () => {
  const deployStage = {
    id: 'deploy-1',
    name: 'Deploy',
    type: 'ci',
    command: './deploy.sh --prod',
  };

  test('renders Run on branch selector for a deploy-command ci stage', () => {
    render(<StageTypeConfig stage={deployStage} onUpdateStage={vi.fn()} />);
    expect(screen.getByText('Run on branch')).toBeInTheDocument();
    expect(screen.getByLabelText('Run-on branch for Deploy')).toBeInTheDocument();
    expect(screen.queryByText(/setting is ignored/i)).not.toBeInTheDocument();
  });

  test('deploy-command stages use the uniform task-default option set', () => {
    render(<StageTypeConfig stage={deployStage} onUpdateStage={vi.fn()} />);
    const trigger = screen.getByRole('combobox', { name: 'Run-on branch for Deploy' });
    fireEvent.click(trigger);
    expect(screen.getByRole('option', { name: /^TASK BRANCH/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^PRIMARY BRANCH/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^CUSTOM BRANCH…/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /CHECKOUT/i })).not.toBeInTheDocument();
  });

  test('committing a custom branch on a deploy-command stage updates runOnBranch', () => {
    const onUpdate = vi.fn();
    render(<StageTypeConfig stage={deployStage} onUpdateStage={onUpdate} />);
    const trigger = screen.getByRole('combobox', { name: 'Run-on branch for Deploy' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: /CUSTOM BRANCH…/i }));
    expect(onUpdate).toHaveBeenCalledWith('deploy-1', { runOnBranch: 'custom' });
  });
});
