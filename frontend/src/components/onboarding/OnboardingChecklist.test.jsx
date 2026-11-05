import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingChecklist, readOnboardingDismissed } from './OnboardingChecklist';
import '@testing-library/jest-dom';

const SUMMARY = {
  projectCount: 1,
  steps: [
    { id: 'runner', title: 'Connect a Runner', done: true, detail: 'Live.' },
    { id: 'project', title: 'Create or adopt a project', done: true, detail: 'On the board.' },
    { id: 'run', title: 'Run your first task', done: false, detail: 'Add a task on the board, then run it.' },
  ],
  complete: false,
};

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

describe('OnboardingChecklist', () => {
  it('renders each step with its state and the next move', () => {
    render(<OnboardingChecklist summary={SUMMARY} onLearnMore={() => {}} />);
    expect(screen.getByTestId('onboarding-checklist')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-checklist-step-runner')).toHaveTextContent('Connect a Runner');
    expect(screen.getByTestId('onboarding-checklist-step-run')).toHaveTextContent('Run your first task');
    expect(screen.getByTestId('onboarding-checklist-next')).toHaveTextContent(
      'Add a task on the board, then run it.',
    );
    expect(screen.getByRole('button', { name: 'Setup guide' })).toBeInTheDocument();
  });

  it('fires the guide callback', () => {
    const onLearnMore = vi.fn();
    render(<OnboardingChecklist summary={SUMMARY} onLearnMore={onLearnMore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Setup guide' }));
    expect(onLearnMore).toHaveBeenCalledTimes(1);
  });

  it('dismisses persistently and never blocks the board', () => {
    const { unmount } = render(<OnboardingChecklist summary={SUMMARY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss setup checklist' }));
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
    expect(readOnboardingDismissed()).toBe(true);
    unmount();
    render(<OnboardingChecklist summary={SUMMARY} />);
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
  });

  it('hides itself when complete, missing, or stepless', () => {
    const { rerender } = render(
      <OnboardingChecklist summary={{ ...SUMMARY, complete: true }} />,
    );
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
    rerender(<OnboardingChecklist summary={null} />);
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
    rerender(<OnboardingChecklist summary={{ ...SUMMARY, steps: [] }} />);
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
  });
});
