import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { UiPreferencesPanel } from './UiPreferencesPanel';
import '@testing-library/jest-dom';

/***
 * MARK: UiPreferencesPanel card-order tests
 * @description Verifies the Task Cards tab exposes the card-order setting
 * (manual vs oldest-first) bound to the shared `taskSort` preference. Kept
 * in its own file so parallel branches extending UiPreferencesPanel.test.jsx
 * do not conflict.
 ***/

function renderCardsTab(taskSort = 'manual') {
  const updateUiPreference = vi.fn();
  renderWithKainBain(<UiPreferencesPanel />, {
    updateUiPreference,
    uiPreferences: { taskSort },
  });
  fireEvent.click(screen.getByText('📋 Task Cards'));
  return { updateUiPreference };
}

test('card order setting defaults to manual and switches to oldest-first', () => {
  const { updateUiPreference } = renderCardsTab();
  const sortSelect = screen.getByLabelText('Card Order Within Stages');
  fireEvent.click(sortSelect);
  fireEvent.click(screen.getByRole('option', { name: /oldest first/i }));
  expect(updateUiPreference).toHaveBeenCalledWith('taskSort', 'oldest');
});

test('card order setting reflects the stored oldest-first value', () => {
  renderCardsTab('oldest');
  expect(screen.getByLabelText('Card Order Within Stages')).toHaveTextContent(/oldest first/i);
});
