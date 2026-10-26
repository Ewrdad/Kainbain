import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../testUtils';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import '@testing-library/jest-dom';

describe('KeyboardShortcutsModal', () => {
  test('does not render when isShortcutsModalOpen is false', () => {
    renderWithKainBain(<KeyboardShortcutsModal />, {
      isShortcutsModalOpen: false,
    });
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
  });

  test('renders shortcuts list and closes on close button', () => {
    const setIsShortcutsModalOpen = vi.fn();
    renderWithKainBain(<KeyboardShortcutsModal />, {
      isShortcutsModalOpen: true,
      setIsShortcutsModalOpen,
    });

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Open platform docs')).toBeInTheDocument();
    expect(screen.queryByText('Switch to Docs knowledge base')).not.toBeInTheDocument();
    expect(screen.getByText('Switch to Orchestrator view')).toBeInTheDocument();
    expect(
      screen.getByText('Open UI Customization & Preferences modal'),
    ).toBeInTheDocument();
    expect(screen.getByText('Open System Settings')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close'));
    expect(setIsShortcutsModalOpen).toHaveBeenCalledWith(false);
  });
});
