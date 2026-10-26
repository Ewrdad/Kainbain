import React from 'react';
import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { TabNavigator, TABS } from './TabNavigator';
import '@testing-library/jest-dom';

/**
 * MARK: TabNavigator tests
 * @description Verifies the primary tab navigation stays project-scoped:
 *   only Orchestrator / Files & Repo / Settings / Retrospective tabs, no
 *   platform Docs tab (Docs lives in the header System Menu).
 */
test('renders only project-scoped tabs and no Docs tab (#platform-docs)', () => {
  renderWithKainBain(<TabNavigator />, { view: 'orchestrator' });
  expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  expect(screen.getByText('Files & Repo')).toBeInTheDocument();
  expect(screen.getByText('Settings')).toBeInTheDocument();
  expect(screen.getByText('Retrospective')).toBeInTheDocument();
  expect(screen.queryByText('Docs')).not.toBeInTheDocument();
  expect(screen.queryByText('Monitor')).not.toBeInTheDocument();
  expect(screen.queryByText('Observability')).not.toBeInTheDocument();
  expect(TABS.map((t) => t.id)).toEqual(['orchestrator', 'explorer', 'settings', 'retrospective']);
});

test('marks the active tab with aria-current', () => {
  renderWithKainBain(<TabNavigator />, { view: 'settings' });
  expect(screen.getByText('Settings').closest('button')).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('Orchestrator').closest('button')).not.toHaveAttribute('aria-current');
});

test('clicking a tab calls setView with its id', () => {
  const setView = vi.fn();
  renderWithKainBain(<TabNavigator />, { view: 'orchestrator', setView });
  fireEvent.click(screen.getByText('Files & Repo'));
  expect(setView).toHaveBeenCalledWith('explorer');
  fireEvent.click(screen.getByText('Settings'));
  expect(setView).toHaveBeenCalledWith('settings');
  expect(setView).not.toHaveBeenCalledWith('docs');
});
