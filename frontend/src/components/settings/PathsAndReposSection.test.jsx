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

  it('does not render the Application Link & Health card (moved to Addresses)', () => {
    renderWithKainBain(<PathsAndReposSection {...baseProps} />);
    expect(screen.queryByText('Application Link & Health')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('App URL')).not.toBeInTheDocument();
  });

  it('wraps a very long docs folder name in the symlink hint', () => {
    const longFolderName = `quarterly-release-docs-${'f'.repeat(140)}`;
    renderWithKainBain(<PathsAndReposSection {...baseProps} docsDirName={longFolderName} />);
    // The folder name renders inside a <code> hint, so it must break anywhere.
    expect(screen.getByText(longFolderName, { exact: false })).toHaveClass('break-all');
  });

  it('renders the separate docs repo fields and disables the local path while the URL is blank', () => {
    const setDocsRepoUrl = vi.fn();
    const setDocsRepoLocalPath = vi.fn();
    renderWithKainBain(
      <PathsAndReposSection
        {...baseProps}
        docsRepoUrl=""
        setDocsRepoUrl={setDocsRepoUrl}
        docsRepoLocalPath=""
        setDocsRepoLocalPath={setDocsRepoLocalPath}
      />,
    );
    const urlInput = screen.getByLabelText('Separate Docs Repository URL (optional)');
    const pathInput = screen.getByLabelText('Docs Repository Local Path (optional)');
    expect(urlInput).toHaveValue('');
    expect(pathInput).toBeDisabled();
    fireEvent.change(urlInput, { target: { value: 'git@github.com:me/proj-docs.git' } });
    expect(setDocsRepoUrl).toHaveBeenCalledWith('git@github.com:me/proj-docs.git');
  });

  it('enables the local path field when a docs repo URL is set and forwards edits', () => {
    const setDocsRepoLocalPath = vi.fn();
    renderWithKainBain(
      <PathsAndReposSection
        {...baseProps}
        docsRepoUrl="git@github.com:me/proj-docs.git"
        setDocsRepoUrl={vi.fn()}
        docsRepoLocalPath="/srv/kb/proj"
        setDocsRepoLocalPath={setDocsRepoLocalPath}
      />,
    );
    const pathInput = screen.getByLabelText('Docs Repository Local Path (optional)');
    expect(pathInput).toBeEnabled();
    expect(pathInput).toHaveValue('/srv/kb/proj');
    fireEvent.change(pathInput, { target: { value: '/srv/kb/other' } });
    expect(setDocsRepoLocalPath).toHaveBeenCalledWith('/srv/kb/other');
  });

  it('renders the separate docs repo block FIRST so it is in the first viewport without scrolling', () => {
    renderWithKainBain(<PathsAndReposSection {...baseProps} />);
    const urlInput = screen.getByLabelText('Separate Docs Repository URL (optional)');
    const pathInput = screen.getByLabelText('Docs Repository Local Path (optional)');
    const cwdInput = screen.getByLabelText('Working Directory (Root)');
    // DOM order (not just presence): the docs-repo block leads the tab, so
    // direct Files & Repos navigation shows it without scrolling. The block
    // used to sit halfway down the tab and reviewers never found it.
    expect(urlInput.compareDocumentPosition(cwdInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pathInput.compareDocumentPosition(cwdInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the docs repo block with a heading and a disabled status when unset', () => {
    renderWithKainBain(<PathsAndReposSection {...baseProps} />);
    expect(screen.getByText('Separate Docs Repository')).toBeInTheDocument();
    expect(screen.getByTestId('docs-repo-status')).toHaveTextContent(/disabled/i);
  });

  it('shows an enabled status naming the docs repo URL when set', () => {
    renderWithKainBain(
      <PathsAndReposSection
        {...baseProps}
        project={{ id: 'p1', name: 'Project A', docsRepo: { url: 'https://git.example.com/me/docs.git' } }}
      />,
    );
    const status = screen.getByTestId('docs-repo-status');
    expect(status).toHaveTextContent(/enabled/i);
    expect(status).toHaveTextContent('https://git.example.com/me/docs.git');
  });
});
