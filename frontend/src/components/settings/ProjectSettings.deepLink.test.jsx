import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
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
 *   initial tab from the URL, the unknown-section fallback, URL updates on
 *   tab switches, and the back button still leaving the page (tab clicks
 *   replace the entry instead of stacking history).
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

function renderAt(path, entries = null) {
  return renderWithKainBain(
    <>
      <Routes>
        <Route path="/settings" element={<ProjectSettings />} />
        <Route path="/settings/:section" element={<ProjectSettings />} />
      </Routes>
      <LocationProbe />
      <BackProbe />
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
});
