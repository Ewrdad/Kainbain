import { describe, expect, test } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GitFailureDetails } from './GitFailureDetails';
import '@testing-library/jest-dom';

describe('GitFailureDetails', () => {
  const envelope = () => ({
    kind: 'hook-rejected',
    phase: 'recovery',
    command: 'git commit -m recovery: unpushed work from reused worktree (kb/t1)',
    exitCode: 1,
    hookName: 'pre-commit',
    files: ['docs/tasks/t1/assets/a.png', 'shot.png'],
    hookOutput: `binary-guard check FAILED (2 corrupt binaries):\n  a.png: expected magic 89504e47, found efbfbd\n${'trace line '.repeat(40)}END OF HOOK OUTPUT`,
    remedy: 'Re-capture each corrupt file, then retry the stage.',
    summary: 'Commit blocked by pre-commit hook: 2 corrupt files',
    truncatedFiles: false,
    truncatedOutput: true,
  });

  test('renders the hook title, command, files, remedy, and capped output', () => {
    render(<GitFailureDetails diagnostics={envelope()} />);

    expect(screen.getByTestId('git-failure-details')).toBeInTheDocument();
    expect(screen.getByTestId('git-failure-title')).toHaveTextContent('Commit blocked by pre-commit hook');
    expect(screen.getByTestId('git-failure-command')).toHaveTextContent(
      'git commit -m recovery: unpushed work from reused worktree (kb/t1) (exit 1) · recovery',
    );
    expect(screen.getByTestId('git-failure-files')).toHaveTextContent('docs/tasks/t1/assets/a.png');
    expect(screen.getByTestId('git-failure-files')).toHaveTextContent('shot.png');
    expect(screen.getByTestId('git-failure-remedy')).toHaveTextContent('Re-capture each corrupt file');
    // Capped by default: the head shows, the tail hides behind the toggle.
    expect(screen.getByTestId('git-failure-output')).toHaveTextContent('binary-guard check FAILED');
    expect(screen.queryByText(/END OF HOOK OUTPUT/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show full output' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('Show full output reveals the tail and Show less collapses it again', () => {
    render(<GitFailureDetails diagnostics={envelope()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show full output' }));
    expect(screen.getByText(/END OF HOOK OUTPUT/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText(/END OF HOOK OUTPUT/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show full output' })).toBeInTheDocument();
  });

  test('short output renders exactly, with no toggle', () => {
    render(
      <GitFailureDetails
        diagnostics={{ ...envelope(), hookOutput: 'hook says no', truncatedOutput: false }}
      />,
    );
    expect(screen.getByTestId('git-failure-output')).toHaveTextContent('hook says no');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('titles each kind, degrading gracefully on unknown hooks and kinds', () => {
    const { rerender } = render(
      <GitFailureDetails diagnostics={{ ...envelope(), hookName: 'unknown' }} />,
    );
    expect(screen.getByTestId('git-failure-title')).toHaveTextContent('Commit blocked by git hook');

    rerender(
      <GitFailureDetails
        diagnostics={{ ...envelope(), kind: 'commit-failed', hookName: null, files: [] }}
      />,
    );
    expect(screen.getByTestId('git-failure-title')).toHaveTextContent('Commit failed');
    expect(screen.queryByTestId('git-failure-files')).not.toBeInTheDocument();

    rerender(
      <GitFailureDetails
        diagnostics={{ ...envelope(), kind: 'merge-conflict', hookName: null }}
      />,
    );
    expect(screen.getByTestId('git-failure-title')).toHaveTextContent('Merge conflicts');

    rerender(
      <GitFailureDetails diagnostics={{ ...envelope(), kind: 'future-kind' }} />,
    );
    expect(screen.getByTestId('git-failure-title')).toHaveTextContent('Git operation failed');
  });

  test('renders nothing for absent or malformed diagnostics', () => {
    for (const diagnostics of [undefined, null, 'hook-rejected', 42, [], {}, { kind: '' }, { files: [] }]) {
      const { container, unmount } = render(<GitFailureDetails diagnostics={diagnostics} />);
      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('git-failure-details')).not.toBeInTheDocument();
      unmount();
    }
  });

  test('collapses again when different diagnostics arrive', () => {
    const { rerender } = render(<GitFailureDetails diagnostics={envelope()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show full output' }));
    expect(screen.getByText(/END OF HOOK OUTPUT/)).toBeInTheDocument();

    rerender(<GitFailureDetails diagnostics={{ ...envelope(), hookOutput: `other hook text\n${'x '.repeat(200)}OTHER TAIL` }} />);
    expect(screen.queryByText(/END OF HOOK OUTPUT/)).not.toBeInTheDocument();
    expect(screen.queryByText(/OTHER TAIL/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show full output' })).toBeInTheDocument();
  });
});
