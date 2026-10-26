import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { UiPreferencesModal } from './UiPreferencesModal';
import '@testing-library/jest-dom';

describe('UiPreferencesModal', () => {
  test('does not render when isCustomizationModalOpen is false', () => {
    renderWithKainBain(<UiPreferencesModal />, {
      isCustomizationModalOpen: false,
    });
    expect(
      screen.queryByText('UI Customization & Workspace Preferences'),
    ).not.toBeInTheDocument();
  });

  test('renders dialog when isCustomizationModalOpen is true and closes on Done button', () => {
    const setIsCustomizationModalOpen = vi.fn();
    renderWithKainBain(<UiPreferencesModal />, {
      isCustomizationModalOpen: true,
      setIsCustomizationModalOpen,
    });

    expect(screen.getByText('UI Customization & Workspace Preferences')).toBeInTheDocument();
    expect(screen.getByText('Settings are automatically saved to local storage')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Done'));
    expect(setIsCustomizationModalOpen).toHaveBeenCalledWith(false);
  });

  test('keeps header and footer unshrunk while the panel scrolls (task 5ad55777)', () => {
    // Same flex-column invariant as the System Settings screen/content: only
    // the content pane may shrink/scroll on short screens.
    renderWithKainBain(<UiPreferencesModal />, {
      isCustomizationModalOpen: true,
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('header')).toHaveClass('shrink-0');
    expect(dialog.querySelector('footer')).toHaveClass('shrink-0');

    const content = dialog.querySelector('header').nextElementSibling;
    expect(content).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');
  });
});
