import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StageRunnerPolicyEditor } from './StageRunnerPolicyEditor';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    getRunners: () =>
      Promise.resolve([
        { runnerId: 'onsite-1', status: 'active', operatorConfig: { displayName: 'Onsite' } },
        { runnerId: 'cloud-2', status: 'active', operatorConfig: { displayName: null } },
      ]),
  },
}));

/***
 * MARK: StageRunnerPolicyEditor tests
 * @description Colocated tests for the stage-settings Runner allow/block
 *   list editor: mode selection, roster checkboxes, the
 *   `onChange(policy | undefined)` write pattern, stale-id badging, and
 *   the self-fetch roster path.
 ***/

const roster = [
  { runnerId: 'onsite-1', status: 'active', operatorConfig: { displayName: 'Onsite' } },
  { runnerId: 'cloud-2', status: 'active', paused: false, operatorConfig: { displayName: null } },
  { runnerId: 'retired', status: 'revoked', operatorConfig: { displayName: null } },
];

const openMode = (name = 'Publish') => {
  fireEvent.click(screen.getByRole('combobox', { name: `Runner access for ${name}` }));
};

const pickMode = (label) => {
  fireEvent.click(screen.getByRole('option', { name: label }));
};

test('renders Off by default with no roster', () => {
  render(<StageRunnerPolicyEditor runners={roster} stageName="Publish" onChange={() => {}} />);
  expect(screen.getByText('Runner access:')).toBeInTheDocument();
  expect(screen.getByText('Every Runner may take this stage.')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Runners for Publish' })).not.toBeInTheDocument();
});

test('selecting allow mode shows the roster and checking a runner writes the policy', () => {
  const onChange = vi.fn();
  render(
    <StageRunnerPolicyEditor runners={roster} stageName="Publish" onChange={onChange} />
  );
  openMode();
  pickMode('Only these runners');
  expect(screen.getByText('Only the selected Runners may take this stage.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Allow runner Onsite' }));
  expect(onChange).toHaveBeenCalledWith({ mode: 'allow', runners: ['onsite-1'] });
});

test('unchecking the last runner clears to undefined (unrestricted)', () => {
  const onChange = vi.fn();
  render(
    <StageRunnerPolicyEditor
      value={{ mode: 'allow', runners: ['onsite-1'] }}
      runners={roster}
      stageName="Publish"
      onChange={onChange}
    />
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Allow runner Onsite' }));
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test('selecting Off clears a stored policy to undefined', () => {
  const onChange = vi.fn();
  render(
    <StageRunnerPolicyEditor
      value={{ mode: 'block', runners: ['cloud-2'] }}
      runners={roster}
      stageName="Publish"
      onChange={onChange}
    />
  );
  expect(
    screen.getByText('Every Runner except the selected ones may take this stage.')
  ).toBeInTheDocument();
  openMode();
  pickMode('Off (every Runner)');
  expect(onChange).toHaveBeenCalledWith(undefined);
});

test('switching mode with a selection rewrites the mode, keeping the runners', () => {
  const onChange = vi.fn();
  render(
    <StageRunnerPolicyEditor
      value={{ mode: 'allow', runners: ['cloud-2'] }}
      runners={roster}
      stageName="Publish"
      onChange={onChange}
    />
  );
  openMode();
  pickMode('All except these runners');
  expect(onChange).toHaveBeenCalledWith({ mode: 'block', runners: ['cloud-2'] });
});

test('unknown runner ids are preserved with an unknown badge and removable', () => {
  const onChange = vi.fn();
  render(
    <StageRunnerPolicyEditor
      value={{ mode: 'allow', runners: ['onsite-1', 'deleted-runner'] }}
      runners={roster}
      stageName="Publish"
      onChange={onChange}
    />
  );
  expect(screen.getByText('deleted-runner')).toBeInTheDocument();
  expect(screen.getByText('unknown')).toBeInTheDocument();
  // The stale id stays selected until explicitly removed.
  expect(
    screen.getByRole('checkbox', { name: 'Remove unknown runner deleted-runner' })
  ).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Remove unknown runner deleted-runner' }));
  expect(onChange).toHaveBeenCalledWith({ mode: 'allow', runners: ['onsite-1'] });
});

test('revoked runners are hidden from the roster', () => {
  render(
    <StageRunnerPolicyEditor
      value={{ mode: 'allow', runners: ['onsite-1'] }}
      runners={roster}
      stageName="Publish"
      onChange={() => {}}
    />
  );
  expect(screen.queryByText('retired')).not.toBeInTheDocument();
});

test('display names render with runner id fallback, paused runners marked', () => {
  const withPaused = [
    ...roster,
    { runnerId: 'paused-1', status: 'active', paused: true, operatorConfig: {} },
  ];
  render(
    <StageRunnerPolicyEditor
      value={{ mode: 'allow', runners: ['paused-1'] }}
      runners={withPaused}
      stageName="Publish"
      onChange={() => {}}
    />
  );
  expect(screen.getByText('Onsite')).toBeInTheDocument();
  expect(screen.getByText('onsite-1')).toBeInTheDocument();
  expect(screen.getByText('cloud-2')).toBeInTheDocument();
  expect(screen.getByText('(paused)')).toBeInTheDocument();
});

test('human stages show the unaffected note', () => {
  render(
    <StageRunnerPolicyEditor
      runners={roster}
      stageName="Review"
      stageType="human"
      onChange={() => {}}
    />
  );
  expect(
    screen.getByText('Human stages run no Runner work, so this list does not affect them.')
  ).toBeInTheDocument();
});

test('fetches the roster itself when no runners prop is given', async () => {
  const onChange = vi.fn();
  render(<StageRunnerPolicyEditor stageName="Publish" onChange={onChange} />);
  openMode();
  pickMode('Only these runners');
  await waitFor(() => {
    expect(screen.getByRole('checkbox', { name: 'Allow runner Onsite' })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Allow runner cloud-2' }));
  expect(onChange).toHaveBeenCalledWith({ mode: 'allow', runners: ['cloud-2'] });
});
