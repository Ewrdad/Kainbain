import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { PathsAndReposSection } from './PathsAndReposSection';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: { updateAppStatus: vi.fn(), checkAppHealth: vi.fn() },
}));

vi.mock('../../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

/***
 * MARK: PathsAndReposSection tests
 * @description Verifies the extracted Files & Repos section renders every
 *   path/repo/branch field prefilled, calls its setters on change, and
 *   does not render the Application Link & Health card (moved to AddressesSection).
 ***/
describe('PathsAndReposSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseProps = {
    cwd: '/home/server/projects/project-a',
    setCwd: vi.fn(),
    notesDir: '/home/server/apps/notes/space/project-a',
    setNotesDir: vi.fn(),
    docsDirName: '',
    setDocsDirName: vi.fn(),
    kainbainDirName: '',
    setKainbainDirName: vi.fn(),
    centralizedDocs: true,
    setCentralizedDocs: vi.fn(),
    gitRepo: 'https://git.example.com/team/ProjectA.git',
    setGitRepo: vi.fn(),
    useBranches: false,
    setUseBranches: vi.fn(),
    preserveReviewDiff: false,
    setPreserveReviewDiff: vi.fn(),
    resetReviewBaseline: true,
    setResetReviewBaseline: vi.fn(),
    clearValidationError: vi.fn(),
    project: { id: 'p1', name: 'Project A' },
    projectId: 'p1',
    updateProjectInState: vi.fn(),
  };

  it('renders all fields prefilled', () => {
    renderWithKainBain(<PathsAndReposSection {...baseProps} />);
    expect(screen.getByText('Multi-Location Paths & Repositories')).toBeInTheDocument();
    expect(screen.getByLabelText('Working Directory (Root)')).toHaveValue(
      '/home/server/projects/project-a',
    );
    expect(screen.getByLabelText('Notes Space Symlink Directory')).toHaveValue(
      '/home/server/apps/notes/space/project-a',
    );
    expect(screen.getByLabelText('Documentation Folder Name')).toHaveValue('');
    expect(screen.getByLabelText('KainBain Folder Name')).toHaveValue('');
    expect(screen.getByLabelText('Link to Centralised Documentation')).toBeChecked();
    expect(screen.getByLabelText('Git Repository URL')).toHaveValue(
      'https://git.example.com/team/ProjectA.git',
    );
    expect(screen.getByLabelText(/Use Task Branches/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Preserve PR Review Diff/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Reset Review Baseline/i)).toBeChecked();
  });

  it('calls setters on change', () => {
    const props = {
      ...baseProps,
      setCwd: vi.fn(),
      setGitRepo: vi.fn(),
      setUseBranches: vi.fn(),
      setCentralizedDocs: vi.fn(),
    };
    renderWithKainBain(<PathsAndReposSection {...props} />);
    fireEvent.change(screen.getByLabelText('Working Directory (Root)'), {
      target: { value: '/home/server/projects/custom' },
    });
    expect(props.setCwd).toHaveBeenCalledWith('/home/server/projects/custom');
    fireEvent.change(screen.getByLabelText('Git Repository URL'), {
      target: { value: 'https://git.example.com/team/Custom.git' },
    });
    expect(props.setGitRepo).toHaveBeenCalledWith('https://git.example.com/team/Custom.git');
    fireEvent.click(screen.getByLabelText(/Use Task Branches/i));
    expect(props.setUseBranches).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByLabelText('Link to Centralised Documentation'));
    expect(props.setCentralizedDocs).toHaveBeenCalledWith(false);
  });

  it('clears the validation error when folder names change', () => {
    const clearValidationError = vi.fn();
    renderWithKainBain(
      <PathsAndReposSection {...baseProps} clearValidationError={clearValidationError} />,
    );
    fireEvent.change(screen.getByLabelText('Documentation Folder Name'), {
      target: { value: 'kainbain-docs' },
    });
    expect(clearValidationError).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('KainBain Folder Name'), {
      target: { value: '.kb' },
    });
    expect(clearValidationError).toHaveBeenCalledTimes(2);
  });

  it('renders the Application Link & Health card', () => {
    renderWithKainBain(<PathsAndReposSection {...baseProps} />);
    expect(screen.getByText('Application Link & Health')).toBeInTheDocument();
    expect(screen.getByLabelText('App URL')).toBeInTheDocument();
  });
});
