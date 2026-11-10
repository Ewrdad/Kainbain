import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingEmptyState } from './OnboardingEmptyState';
import '@testing-library/jest-dom';

const SUMMARY = {
  runner: {
    hasFreshRunner: false,
    nextAction: 'approve-runner',
    nextActionDetail: 'Approve it in Settings › Harness › Runners.',
  },
  projectCount: 0,
  taskCount: 0,
  hasRun: false,
  adoptable: [
    { path: '/repos/foo', name: 'foo' },
    { path: '/repos/bar', name: 'bar' },
  ],
  steps: [
    { id: 'runner', title: 'Connect a Runner', done: false, detail: 'Approve it.' },
    { id: 'project', title: 'Create or adopt a project', done: false, detail: 'Create one.' },
    { id: 'run', title: 'Run your first task', done: false, detail: 'Add a task.' },
  ],
  complete: false,
};

describe('OnboardingEmptyState', () => {
  it('renders the runner line, steps, and three first moves', () => {
    render(
      <OnboardingEmptyState
        summary={SUMMARY}
        onCreate={() => {}}
        onAdopt={() => {}}
        onAdoptPath={async () => {}}
        onLearnMore={() => {}}
      />,
    );
    expect(screen.getByTestId('onboarding-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-runner-status')).toHaveTextContent(
      'A Runner is waiting for approval.',
    );
    expect(screen.getByTestId('onboarding-step-runner')).toHaveTextContent('Connect a Runner');
    expect(screen.getByTestId('onboarding-step-project')).toHaveTextContent('Create or adopt a project');
    expect(screen.getByRole('button', { name: 'Create New Project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adopt Existing…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Setup guide' })).toBeInTheDocument();
  });

  it('names the connected runner when one is fresh', () => {
    render(
      <OnboardingEmptyState
        summary={{
          ...SUMMARY,
          runner: { hasFreshRunner: true, freshRunnerIds: ['local-pi'] },
        }}
      />,
    );
    expect(screen.getByTestId('onboarding-runner-status')).toHaveTextContent(
      'Runner connected: local-pi.',
    );
  });

  it('marks done steps without dropping their rows', () => {
    render(
      <OnboardingEmptyState
        summary={{
          ...SUMMARY,
          steps: [{ id: 'runner', title: 'Connect a Runner', done: true, detail: 'Live.' }],
        }}
      />,
    );
    expect(screen.getByTestId('onboarding-step-runner')).toHaveTextContent('Connect a Runner — done');
  });

  it('fires the dialog callbacks from the CTA buttons', () => {
    const onCreate = vi.fn();
    const onAdopt = vi.fn();
    const onLearnMore = vi.fn();
    render(
      <OnboardingEmptyState summary={SUMMARY} onCreate={onCreate} onAdopt={onAdopt} onLearnMore={onLearnMore} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create New Project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adopt Existing…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Setup guide' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onAdopt).toHaveBeenCalledTimes(1);
    expect(onLearnMore).toHaveBeenCalledTimes(1);
  });

  it('lists adoptable checkouts with one-click adoption', async () => {
    const onAdoptPath = vi.fn().mockResolvedValue({});
    render(<OnboardingEmptyState summary={SUMMARY} onAdoptPath={onAdoptPath} />);
    expect(screen.getByTestId('onboarding-adoptable-list')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-adopt-foo')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('onboarding-adopt-foo'));
    expect(screen.getByTestId('onboarding-adopt-foo')).toHaveTextContent('Adopting…');
    await waitFor(() => expect(onAdoptPath).toHaveBeenCalledWith('/repos/foo'));
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-adopt-foo')).toHaveTextContent('Adopt'),
    );
    expect(screen.queryByTestId('onboarding-adopt-error')).not.toBeInTheDocument();
  });

  it('shows an inline error when one-click adoption fails', async () => {
    const onAdoptPath = vi.fn().mockRejectedValue(new Error('backend refused it'));
    render(<OnboardingEmptyState summary={SUMMARY} onAdoptPath={onAdoptPath} />);
    fireEvent.click(screen.getByTestId('onboarding-adopt-bar'));
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-adopt-error')).toHaveTextContent(
        'Could not adopt bar: backend refused it',
      ),
    );
  });

  it('renders static CTAs when the backend is unreachable', () => {
    render(<OnboardingEmptyState summary={null} />);
    expect(screen.getByTestId('onboarding-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-runner-status')).toHaveTextContent(
      'Runner status is unavailable',
    );
    expect(screen.getByRole('button', { name: 'Create New Project' })).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-adoptable-list')).not.toBeInTheDocument();
  });

  it('skips malformed adoptable entries instead of crashing', () => {
    render(
      <OnboardingEmptyState summary={{ ...SUMMARY, adoptable: [null, { name: 'noname' }, 42] }} />,
    );
    expect(screen.queryByTestId('onboarding-adoptable-list')).not.toBeInTheDocument();
  });
});
