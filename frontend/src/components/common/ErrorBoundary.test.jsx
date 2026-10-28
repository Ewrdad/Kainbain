import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function ProblemChild({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Test exploding component');
  }
  return <div>Healthy Child Content</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Healthy Child Content')).toBeInTheDocument();
  });

  it('catches render error and displays fallback UI with error message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary name="Workflow">
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Workflow Component Error/i)).toBeInTheDocument();
    expect(screen.getByText(/Test exploding component/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try to Recover/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload Page/i })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('calls onReset callback when Try to Recover is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Try to Recover/i }));
    expect(onReset).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});
