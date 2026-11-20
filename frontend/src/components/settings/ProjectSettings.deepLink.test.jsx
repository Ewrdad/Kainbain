import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route, useLocation, useNavigate } from 'react-router';
import { renderWithKainBain } from '../../testUtils';
import { ProjectSettings } from './ProjectSettings';
import '@testing-library/jest-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      updateProject: vi.fn(),
      getModels: vi.fn().mockResolvedValue({ models: [], harnesses: [] }),
      getFleetModelCatalog: vi.fn().mockRejectedValue(new Error('fleet down')),
    },
  };
});
vi.mock('../../services/logger', () => ({ logger: { error: vi.fn() } }));

/***
 * MARK: ProjectSettings deep-link tests
 * @description Verifies the `/settings/:section` deep link: task surfaces
 *   link here so the user lands on the tab that edits what they were
 *   looking at (e.g. the pipelines tab for the base branch). Covers the
 *   initial tab from the URL (path segment wins, `?section=` is the
 *   fallback), the unknown-section fallback, URL updates on tab switches,
 *   following later URL changes without a remount (guard-blocked switches
 *   rewrite the URL back to the visible tab), and the back button still
 *   leaving the page (tab clicks replace the entry instead of stacking
 *   history).
 ***/
const projects = [
  { id: 'p1', name: 'Project A', cwd: '/home/server/projects/project-a' },
];

function LocationProbe() {
  const { pathname } = useLocation();
  return <span data-testid="location-probe">{pathname}</span>;
}

function BackProbe() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      go back
    </button>
  );
}

// Same-view navigation without a remount (what header links and setView do
// while already on the settings page): a push, like the router facade.
function NavigateProbe() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/settings/workflows')}>
        go workflows url
      </button>
      <button type="button" onClick={() => navigate('/settings')}>
        go bare settings url
      </button>
    </>
  );
}

function renderAt(path, entries = null) {
  return renderWithKainBain(
    <>
      <Routes>
        <Route path="/settings" element={<ProjectSettings />} />
        <Route path="/settings/:section" element={<ProjectSettings />} />
      </Routes>
      <LocationProbe />
      <BackProbe />
      <NavigateProbe />
    </>,
    {
      projects,
      activeProjectId: 'p1',
      selectProject: vi.fn(),
    },
    { initialEntries: entries ?? [path] },
  );
}

describe('ProjectSettings section deep link', () => {
  it('opens the workflows tab directly from /settings/workflows', () => {
    renderAt('/settings/workflows');
    expect(screen.getByText('Named Workflows & Pipelines')).toBeInTheDocument();
    expect(screen.queryByText('Project Configuration')).not.toBeInTheDocument();
    // The pipeline base-branch editor is on screen with no further clicks.
    expect(document.getElementById('new-wf-base-branch')).not.toBeNull();
  });

  it('still opens the Project tab from bare /settings', () => {
    renderAt('/settings');
    expect(screen.getByText('Project Configuration')).toBeInTheDocument();
    expect(screen.queryByText('Named Workflows & Pipelines')).not.toBeInTheDocument();
  });

  it('falls back to the Project tab for an unknown section', () => {
    renderAt('/settings/nope');
    expect(screen.getByText('Project Configuration')).toBeInTheDocument();
  });

  it('writes the tab into the URL when switching tabs', () => {
    renderAt('/settings');
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings');
    fireEvent.click(screen.getByText('Named Workflows'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/workflows');
    expect(screen.getByText('Named Workflows & Pipelines')).toBeInTheDocument();
  });

  it('keeps the back button leaving the page after tab switches', () => {
    // History: board, then settings (index starts on the last entry).
    renderAt('/settings', ['/', '/settings']);
    fireEvent.click(screen.getByText('Named Workflows'));
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/workflows');
    fireEvent.click(screen.getByText('go back'));
    // A push-based switch would step back to /settings; replace leaves the page.
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
  });

  it('follows the URL section when it changes without a remount', async () => {
    renderAt('/settings');
    expect(screen.getByText('Project Configuration')).toBeInTheDocument();
    // Same-view navigation (no remount): the tab must track the URL. The
    // follow settles async (one microtask after navigation).
    fireEvent.click(screen.getByText('go workflows url'));
    await waitFor(() => {
      expect(screen.getByText('Named Workflows & Pipelines')).toBeInTheDocument();
    });
    expect(document.getElementById('new-wf-base-branch')).not.toBeNull();
  });

  it('returns to the Project tab when the URL section is removed', async () => {
    renderAt('/settings/workflows');
    expect(screen.getByText('Named Workflows & Pipelines')).toBeInTheDocument();
    // The header Settings entry navigates to bare /settings while mounted.
    fireEvent.click(screen.getByText('go bare settings url'));
    await waitFor(() => {
      expect(screen.getByText('Project Configuration')).toBeInTheDocument();
    });
    expect(screen.queryByText('Named Workflows & Pipelines')).not.toBeInTheDocument();
  });

  it('rewrites the URL back when the unsaved-edits guard blocks a URL-driven switch', async () => {
    const originalConfirm = window.confirm;
    const confirm = vi.fn(() => false);
    window.confirm = confirm;
    try {
      renderAt('/settings');
      fireEvent.change(screen.getByLabelText('Project Name'), {
        target: { value: 'Draft Name' },
      });
      fireEvent.click(screen.getByText('go workflows url'));
      await waitFor(() => {
        expect(confirm).toHaveBeenCalledWith(
          'You have unsaved changes. Switch tabs anyway?',
        );
      });
      // The tab stays (and keeps the draft); the URL must name the visible
      // tab again instead of stranding the blocked section.
      expect(screen.getByLabelText('Project Name')).toHaveValue('Draft Name');
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/settings/project');
    } finally {
      window.confirm = originalConfirm;
    }
  });

  it('reads ?section= as the fallback when the path names no section', () => {
    renderAt('/settings?section=workflows');
    expect(screen.getByText('Named Workflows & Pipelines')).toBeInTheDocument();
    expect(document.getElementById('new-wf-base-branch')).not.toBeNull();
  });

  it('prefers the path segment over ?section=', () => {
    renderAt('/settings/aliases?section=workflows');
    expect(screen.getByRole('tab', { name: /aliases/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByText('Named Workflows & Pipelines')).not.toBeInTheDocument();
  });
});
