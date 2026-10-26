import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { ProjectExplorer, formatFileSize, getFileIcon } from './ProjectExplorer';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    listFiles: vi.fn(),
    getFileContent: vi.fn(),
    getFileRawUrl: vi.fn(
      (projectId, filePath) =>
        `/projects/${projectId}/files/raw?path=${encodeURIComponent(filePath)}`,
    ),
  },
}));

vi.mock('../../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { api } from '../../services/api';

/***
 * MARK: ProjectExplorer tests
 * @description Verifies folder browsing, breadcrumbs, search filtering, markdown/code previewing, and error states.
 ***/
describe('ProjectExplorer Component', () => {
  const mockProjects = [
    {
      id: 'proj-1',
      name: 'Project Alpha',
      cwd: '/home/server/projects/alpha',
    },
  ];

  const mockRootEntries = [
    { name: 'docs', path: 'docs', isDirectory: true, size: 4096, extension: null },
    { name: 'src', path: 'src', isDirectory: true, size: 4096, extension: null },
    { name: 'README.md', path: 'README.md', isDirectory: false, size: 512, extension: '.md' },
    {
      name: 'package.json',
      path: 'package.json',
      isDirectory: false,
      size: 1024,
      extension: '.json',
    },
  ];

  const mockDocsEntries = [
    { name: 'tasks', path: 'docs/tasks', isDirectory: true, size: 4096, extension: null },
    { name: 'spec.md', path: 'docs/spec.md', isDirectory: false, size: 2048, extension: '.md' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubEnv('VITE_NOTES_VIEWER_URL', 'http://notes.example.com');
    api.listFiles.mockImplementation(async (projId, subpath) => {
      if (subpath === 'docs') {
        return {
          cwd: '/home/server/projects/alpha',
          currentPath: 'docs',
          entries: mockDocsEntries,
        };
      }
      return { cwd: '/home/server/projects/alpha', currentPath: '', entries: mockRootEntries };
    });

    api.getFileContent.mockImplementation(async (projId, filePath) => {
      if (filePath === 'README.md') {
        return {
          name: 'README.md',
          path: 'README.md',
          content: '# Project Alpha\nThis is a sample readme content.',
          size: 512,
          extension: '.md',
        };
      }
      if (filePath === 'package.json') {
        return {
          name: 'package.json',
          path: 'package.json',
          content: '{\n  "name": "alpha"\n}',
          size: 1024,
          extension: '.json',
        };
      }
      if (filePath === 'docs/spec.md') {
        return {
          name: 'spec.md',
          path: 'docs/spec.md',
          content: '# Spec\nDocs-resident markdown.',
          size: 2048,
          extension: '.md',
        };
      }
      throw new Error('File not found');
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('formats file sizes accurately', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1048576)).toBe('1.00 MB');
  });

  it('assigns correct icons by file extension and directory', () => {
    expect(getFileIcon({ isDirectory: true })).toBe('📁');
    expect(getFileIcon({ isDirectory: false, extension: '.md' })).toBe('📝');
    expect(getFileIcon({ isDirectory: false, extension: '.json' })).toBe('📦');
    expect(getFileIcon({ isDirectory: false, extension: '.js' })).toBe('⚡');
    expect(getFileIcon({ isDirectory: false, extension: '.log' })).toBe('📋');
  });

  it('renders directory entries and breadcrumbs on initial load', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    expect(screen.getByText('Files & Documents')).toBeInTheDocument();
    expect(screen.getByText(/Document & Code Viewer/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('docs')).toBeInTheDocument();
      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    expect(api.listFiles).toHaveBeenCalledWith('proj-1', '');
  });

  it('navigates into subdirectories when clicking a folder and updates breadcrumbs', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('docs'));

    await waitFor(() => {
      expect(api.listFiles).toHaveBeenCalledWith('proj-1', 'docs');
      expect(screen.getByText('spec.md')).toBeInTheDocument();
      expect(screen.getByText('tasks')).toBeInTheDocument();
    });

    // Check breadcrumbs include Project Alpha and docs
    expect(screen.getByRole('button', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'docs' })).toBeInTheDocument();

    // Clicking Project Alpha root in breadcrumb navigates back to root
    fireEvent.click(screen.getByRole('button', { name: 'Project Alpha' }));
    await waitFor(() => {
      expect(api.listFiles).toHaveBeenCalledWith('proj-1', '');
    });
  });

  it('shows the Notes deep link for markdown under docs/', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('docs'));

    await waitFor(() => {
      expect(screen.getByText('spec.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('spec.md'));

    await waitFor(() => {
      expect(api.getFileContent).toHaveBeenCalledWith('proj-1', 'docs/spec.md');
      expect(screen.getByText(/Docs-resident markdown/)).toBeInTheDocument();
      const sbLink = screen.getByRole('link', { name: /Open in Notes/i });
      expect(sbLink).toBeInTheDocument();
      expect(sbLink).toHaveAttribute(
        'href',
        'http://notes.example.com/Projects/Personal/Project%20Alpha/spec.md',
      );
    });
  });

  it('hides the Notes link for root-level markdown while keeping the preview', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(api.getFileContent).toHaveBeenCalledWith('proj-1', 'README.md');
      expect(screen.getByText(/This is a sample readme content/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Copy Path/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open in Notes/i })).not.toBeInTheDocument();
  });

  it('links the configured git remote and hides the link when no remote exists', async () => {
    const { unmount } = renderWithKainBain(<ProjectExplorer />, {
      projects: [
        {
          ...mockProjects[0],
          gitUrl: 'https://git.example.com/team/alpha.git',
        },
      ],
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeInTheDocument();
    });
    const remoteLink = screen.getByRole('link', { name: /Open git remote/i });
    expect(remoteLink).toHaveAttribute('href', 'https://git.example.com/team/alpha');
    unmount();

    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });
    await waitFor(() => {
      expect(screen.getByText('docs')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /Open git remote/i })).not.toBeInTheDocument();
  });

  it('selects a code file (package.json) and previews its formatted code', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('package.json'));

    await waitFor(() => {
      expect(api.getFileContent).toHaveBeenCalledWith('proj-1', 'package.json');
      expect(screen.getByText(/{\s*"name": "alpha"\s*}/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /Open in Notes/i })).not.toBeInTheDocument();
  });

  it('filters file entries in the explorer via the search input', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText('Filter files');
    fireEvent.change(searchInput, { target: { value: 'README' } });

    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.queryByText('package.json')).not.toBeInTheDocument();
  });

  it('restores the explorer search from localStorage after refresh', async () => {
    window.localStorage.setItem('kainbain:explorer:search', JSON.stringify('README'));
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Filter files')).toHaveValue('README');
    expect(screen.queryByText('package.json')).not.toBeInTheDocument();
  });

  it('falls back to an empty explorer search on corrupt storage', async () => {
    window.localStorage.setItem('kainbain:explorer:search', 'not-json{{{');
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Filter files')).toHaveValue('');
    expect(screen.getByText('package.json')).toBeInTheDocument();
  });

  it('renders an error banner if listFiles fails and allows retry', async () => {
    api.listFiles.mockRejectedValueOnce(new Error('Network connection timeout'));

    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('Error loading folder')).toBeInTheDocument();
      expect(screen.getByText('Network connection timeout')).toBeInTheDocument();
    });

    api.listFiles.mockResolvedValueOnce({
      cwd: '/home/server/projects/alpha',
      currentPath: '',
      entries: mockRootEntries,
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
  });

  it('allows mobile user to return to file list using Back to Files button', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(screen.getByLabelText('Back to file list')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Back to file list'));

    await waitFor(() => {
      expect(screen.getByText(/Document & Code Viewer/i)).toBeInTheDocument();
    });
  });

  it('hides the create-task button when no file is selected', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: /Create task from here/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps every viewer action reachable on narrow viewports (wraps, no clipping)', async () => {
    // Widest-toolbar case: a docs/tasks markdown file shows the Notes link,
    // the Inspector button, the Preview/Raw toggle, both copy buttons, and the
    // create-task button all at once.
    api.listFiles.mockImplementation(async () => ({
      cwd: '/home/server/projects/alpha',
      currentPath: '',
      entries: [
        {
          name: 'task.md',
          path: 'docs/tasks/abc123/task.md',
          isDirectory: false,
          size: 2048,
          extension: '.md',
        },
      ],
    }));
    api.getFileContent.mockResolvedValue({
      name: 'task.md',
      path: 'docs/tasks/abc123/task.md',
      content: '# Task\nWidest toolbar case.',
      size: 2048,
      extension: '.md',
    });

    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    fireEvent.click(await screen.findByText('task.md'));

    await waitFor(() => {
      expect(screen.getByText(/Widest toolbar case/)).toBeInTheDocument();
    });

    const actions = screen.getByTestId('viewer-actions');
    // Wrap-first: the strip must be allowed to shrink and wrap its buttons instead
    // of refusing to shrink and running off the right edge of the viewport.
    expect(actions.className).toContain('flex-wrap');
    expect(actions.className).toContain('min-w-0');
    expect(actions.className).not.toContain('shrink-0');
    // Below sm the strip owns a full row (independent of how wide its content
    // happens to be); from sm it flows inline with the title again.
    expect(actions.className).toContain('w-full');
    expect(actions.className).toContain('sm:w-auto');
    // Reachability comes from wrapping alone. The strip intentionally is NOT a
    // horizontal scroll container: `overflow-x-auto` would (a) be inert here
    // because the row wraps and (b) clip the 3px :focus-visible ring of the
    // first control in each wrapped row, the exact a11y regression this layout
    // must not introduce.
    expect(actions.className).not.toContain('overflow-x-auto');

    // Every action stays mounted and pressable regardless of viewport width.
    expect(screen.getByLabelText('Back to file list')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Notes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open in Inspector/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Raw/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Content/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Path/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create task from here/i })).toBeInTheDocument();

    // Accessible names are pinned by aria-label, so screen readers / role
    // queries hear the same action regardless of which compact label CSS shows.
    expect(screen.getByRole('button', { name: 'Open in Inspector' })).toHaveAttribute(
      'aria-label',
      'Open in Inspector',
    );
    expect(screen.getByRole('button', { name: 'Copy content' })).toHaveAttribute(
      'aria-label',
      'Copy content',
    );
    expect(screen.getByRole('button', { name: 'Copy path' })).toHaveAttribute(
      'aria-label',
      'Copy path',
    );
    expect(screen.getByRole('button', { name: 'New task: create task from here' })).toHaveAttribute(
      'aria-label',
      'New task: create task from here',
    );

    // Button order is a stable contract (desktop and mobile): a reorder here is
    // a UX change, not an implementation detail.
    expect(
      [...actions.querySelectorAll('button, a')].map(
        (el) => el.getAttribute('aria-label') || el.textContent.trim(),
      ),
    ).toEqual([
      'Open in Notes',
      'Open in Inspector',
      'Preview',
      'Raw',
      'Copy content',
      'Copy path',
      'New task: create task from here',
    ]);

    // Compact labels below sm free ~100-200px on mobile while desktop keeps
    // the full strings; buttons never wrap internally (the strip wraps instead).
    for (const shortLabel of ['Notes', 'Inspector', 'Content', 'Path', 'New Task']) {
      const el = screen.getByText(shortLabel, { exact: true });
      expect(el.className).toContain('sm:hidden');
    }
    for (const control of actions.querySelectorAll('button, a')) {
      expect(control.className).toContain('whitespace-nowrap');
    }

    // Title block compresses (truncate) instead of pushing actions off-screen,
    // but keeps a readable floor: without it a medium desktop width (e.g. 1440px)
    // lets the action strip eat the whole row and squeezes the filename to a few
    // characters. The floor makes the strip wrap to its own row instead.
    const titleHeading = screen.getByRole('heading', { name: 'task.md' });
    expect(titleHeading.className).toContain('truncate');
    const titleGroup = titleHeading.closest('header').firstElementChild;
    expect(titleGroup.className).toContain('min-w-0');
    expect(titleGroup.className).toContain('flex-1');
    expect(titleGroup.className).toContain('sm:min-w-[12rem]');
  });

  it('does not render the viewer actions strip until a file is selected', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    // No selected file -> no toolbar -> nothing to overflow or mis-label.
    expect(screen.queryByTestId('viewer-actions')).not.toBeInTheDocument();
  });

  it('selects an image file and renders the image preview without fetching text', async () => {
    api.listFiles.mockResolvedValueOnce({
      cwd: '/home/server/projects/alpha',
      currentPath: '',
      entries: [
        {
          name: 'logo.png',
          path: 'logo.png',
          isDirectory: false,
          size: 512,
          extension: '.png',
          kind: 'image',
          mime: 'image/png',
        },
      ],
    });
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('logo.png')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('logo.png'));

    await waitFor(() => {
      const img = screen.getByAltText('logo.png');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', '/projects/proj-1/files/raw?path=logo.png');
    });
    expect(api.getFileContent).not.toHaveBeenCalled();
    expect(api.getFileRawUrl).toHaveBeenCalledWith('proj-1', 'logo.png');
    expect(screen.queryByRole('button', { name: /Copy Content/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Path/i })).toBeInTheDocument();
  });

  it('falls back to the download pane when the text endpoint refuses with 415', async () => {
    api.listFiles.mockResolvedValueOnce({
      cwd: '/home/server/projects/alpha',
      currentPath: '',
      entries: [{ name: 'blob', path: 'blob', isDirectory: false, size: 64, extension: '' }],
    });
    api.getFileContent.mockRejectedValueOnce(
      new Error('API 415 on /projects/proj-1/files/content?path=blob: {"error":"..."}'),
    );
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('blob')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('blob'));

    await waitFor(() => {
      expect(api.getFileContent).toHaveBeenCalledWith('proj-1', 'blob');
      expect(screen.getByText(/Preview unavailable for this file type/)).toBeInTheDocument();
    });
  });

  it('shows the oversize download state for huge images', async () => {
    api.listFiles.mockResolvedValueOnce({
      cwd: '/home/server/projects/alpha',
      currentPath: '',
      entries: [
        {
          name: 'huge.png',
          path: 'huge.png',
          isDirectory: false,
          size: 16 * 1024 * 1024,
          extension: '.png',
          kind: 'image',
          mime: 'image/png',
        },
      ],
    });
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await waitFor(() => {
      expect(screen.getByText('huge.png')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('huge.png'));

    await waitFor(() => {
      expect(screen.getByText(/too large to preview/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Download huge.png/i })).toHaveAttribute(
        'href',
        '/projects/proj-1/files/raw?path=huge.png',
      );
    });
  });

  it('shows the button with a file selected and opens the modal with the file path', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
      projectWorkflows: [
        { id: 'wf-1', name: 'Feature', stages: [{ id: 'stage-1', name: 'Idea', type: 'agent' }] },
      ],
      stages: [{ id: 'stage-1', name: 'Idea', type: 'agent' }],
      activeWorkflowId: 'wf-1',
      createTask: vi.fn(),
      executeTaskStage: vi.fn(),
      setSelectedTask: vi.fn(),
      switchWorkflow: vi.fn(),
    });

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create task from here/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Create task from here/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Create task from here/i })).toBeInTheDocument();
      expect(screen.getByLabelText('Task description')).toHaveValue(
        'In reference to: README.md\n\n',
      );
    });
  });

  it('shows the Open App quick action when the project has an app link', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: [
        {
          ...mockProjects[0],
          appStatus: {
            url: 'http://localhost:5173',
            networkHost: 'home.home',
            status: 'running',
          },
        },
      ],
      activeProjectId: 'proj-1',
    });

    const link = await screen.findByRole('link', { name: /Open app \(running\)/i });
    expect(link).toHaveAttribute('href', 'http://home.home:5173/');
    expect(link).toHaveTextContent('Open App');
  });

  it('hides the Open App quick action when the project has no app link', async () => {
    renderWithKainBain(<ProjectExplorer />, {
      projects: mockProjects,
      activeProjectId: 'proj-1',
    });

    await screen.findByText('README.md');
    expect(screen.queryByRole('link', { name: /Open app/i })).not.toBeInTheDocument();
  });
});
