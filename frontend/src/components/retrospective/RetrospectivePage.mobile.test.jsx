import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { RetrospectivePage } from './RetrospectivePage';
import { retrospectiveTaskFixtures } from './__fixtures__/index.js';
import '@testing-library/jest-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      listTasks: vi.fn(),
      getTask: vi.fn(),
      retrospectiveChat: vi.fn(),
      createTask: vi.fn(),
    },
  };
});
import { api } from '../../services/api';

/***
 * MARK: RetrospectivePage mobile tab strip tests
 * @description Locks the phone layout: below the desktop breakpoint the three
 *   panes collapse behind a tab strip (one pane visible at a time), while the
 *   `lg:` responsive classes keep every pane visible side-by-side on desktop.
 *   Visibility switching is CSS-driven (Tailwind `hidden lg:block`), so these
 *   tests assert the switching behaviour and the responsive classes; real
 *   viewport proof (375px vs 1280px) lives in the Playwright canary suite,
 *   which is the only runner that evaluates media queries.
 ***/
describe('RetrospectivePage mobile tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listTasks.mockResolvedValue(retrospectiveTaskFixtures);
  });

  async function renderPage() {
    renderWithKainBain(<RetrospectivePage />, { activeProjectId: 'proj-1' });
    await waitFor(() => {
      expect(screen.getByTestId('retrospective-task-task-done-1')).toBeInTheDocument();
    });
  }

  it('renders a three-tab strip with Histories selected first', async () => {
    await renderPage();
    const tablist = screen.getByRole('tablist', { name: 'Mobile retrospective pane selector' });
    expect(tablist).toBeInTheDocument();
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Histories', 'Actions', 'Chat']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('lets the page itself scroll vertically so stacked panes never drop off-screen', async () => {
    await renderPage();
    const page = screen.getByTestId('retrospective-page');
    // The app shell (#main-content) is overflow-hidden, so the page root
    // must own the vertical scroll region (same contract as TaskDetailPage).
    expect(page).toHaveClass('flex-1');
    expect(page).toHaveClass('min-h-0');
    expect(page).toHaveClass('overflow-y-auto');
  });

  it('hides the tab strip on desktop where all panes sit side-by-side', async () => {
    await renderPage();
    const tablist = screen.getByRole('tablist', { name: 'Mobile retrospective pane selector' });
    expect(tablist.className).toMatch(/lg:hidden/);
  });

  it('switches the visible pane on tap while every pane stays mounted', async () => {
    await renderPage();
    const historiesPanel = document.getElementById('retrospective-panel-histories');
    const chatPanel = document.getElementById('retrospective-panel-chat');
    expect(historiesPanel).not.toHaveClass('hidden');
    expect(chatPanel).toHaveClass('hidden');

    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));

    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Histories' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(chatPanel).not.toHaveClass('hidden');
    expect(historiesPanel).toHaveClass('hidden');
    // Desktop restores every pane regardless of the phone tab state: the
    // inactive pane carries `lg:block`, the active pane shows everywhere by
    // its base display.
    expect(historiesPanel.className).toMatch(/lg:block/);
    expect(chatPanel.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    // Nothing unmounts: hidden panes keep their state.
    expect(screen.getByTestId('retrospective-histories')).toBeInTheDocument();
    expect(screen.getByTestId('retrospective-quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('retrospective-chat')).toBeInTheDocument();
  });

  it('keeps the shared selection while switching tabs', async () => {
    await renderPage();
    fireEvent.click(
      screen.getByLabelText('Select Add pagination to the task list as chat context'),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(screen.getByText('Use selection (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Actions' }));
    expect(screen.getByTestId('retrospective-action-context')).toHaveTextContent(
      '1 task selected.',
    );
    expect(screen.getByTestId('retrospective-action-find-trends')).toBeEnabled();

    fireEvent.click(screen.getByRole('tab', { name: 'Histories' }));
    expect(
      screen.getByLabelText('Select Add pagination to the task list as chat context'),
    ).toBeChecked();
  });
});
