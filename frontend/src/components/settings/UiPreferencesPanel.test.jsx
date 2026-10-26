import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { UiPreferencesPanel } from './UiPreferencesPanel';
import '@testing-library/jest-dom';

describe('UiPreferencesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders sub-tabs for appearance, workspace, task cards, alerts, shortcuts, and backup', () => {
    renderWithKainBain(<UiPreferencesPanel />);

    expect(screen.getByText('🎨 Appearance')).toBeInTheDocument();
    expect(screen.getByText('🗂️ Workspace')).toBeInTheDocument();
    expect(screen.getByText('📋 Task Cards')).toBeInTheDocument();
    expect(screen.getByText('🔔 Sound & Alerts')).toBeInTheDocument();
    expect(screen.getByText('⌨️ Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('💾 Backup & Reset')).toBeInTheDocument();
  });

  test('switches color themes and updates preference', () => {
    const updateUiPreference = vi.fn();
    renderWithKainBain(<UiPreferencesPanel />, {
      updateUiPreference,
      uiPreferences: {
        theme: 'dark',
        density: 'comfortable',
        fontSize: 'medium',
        fontMono: 'jetbrains',
        reduceMotion: false,
      },
    });

    fireEvent.click(screen.getByText('Midnight (Navy)'));
    expect(updateUiPreference).toHaveBeenCalledWith('theme', 'midnight');

    fireEvent.click(screen.getByText('Light (Daylight)'));
    expect(updateUiPreference).toHaveBeenCalledWith('theme', 'light');

    fireEvent.click(screen.getByText('High Contrast'));
    expect(updateUiPreference).toHaveBeenCalledWith('theme', 'high-contrast');
  });

  test('switches density mode and font scale', () => {
    const updateUiPreference = vi.fn();
    renderWithKainBain(<UiPreferencesPanel />, {
      updateUiPreference,
    });

    fireEvent.click(screen.getByText('Compact'));
    expect(updateUiPreference).toHaveBeenCalledWith('density', 'compact');

    const fontSelect = screen.getByLabelText('Font Scale');
    fireEvent.click(fontSelect);
    fireEvent.click(screen.getByRole('option', { name: /Large \(18px\)/i }));
    expect(updateUiPreference).toHaveBeenCalledWith('fontSize', 'large');
  });

  test('navigates to Workspace tab and toggles panel visibility', () => {
    const updateUiPreference = vi.fn();
    renderWithKainBain(<UiPreferencesPanel />, {
      updateUiPreference,
      uiPreferences: {
        columnWidth: '280px',
        showNowPlayingBar: true,
        activityDrawerDefaultOpen: true,
      },
    });

    fireEvent.click(screen.getByText('🗂️ Workspace'));
    expect(screen.getByText('Pipeline Column Width')).toBeInTheDocument();

    fireEvent.click(screen.getByText('320px (Wide)'));
    expect(updateUiPreference).toHaveBeenCalledWith('columnWidth', '320px');

    fireEvent.click(screen.getByLabelText('Show Bottom Now Playing Control Bar'));
    expect(updateUiPreference).toHaveBeenCalledWith('showNowPlayingBar', false);
  });

  test('navigates to Task Cards tab and toggles metadata items', () => {
    const updateUiPreference = vi.fn();
    renderWithKainBain(<UiPreferencesPanel />, {
      updateUiPreference,
      uiPreferences: {
        showTaskId: true,
        showStageBadge: true,
        showTimeInStage: true,
        cardPreviewLines: 2,
      },
    });

    fireEvent.click(screen.getByText('📋 Task Cards'));
    expect(screen.getByText('Kanban Card Metadata Display')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Show Task Short ID (#KB-XXXX)'));
    expect(updateUiPreference).toHaveBeenCalledWith('showTaskId', false);

    const linesSelect = screen.getByLabelText('Goal Description Preview Clamping');
    fireEvent.click(linesSelect);
    fireEvent.click(screen.getByRole('option', { name: /3 Lines \(More context\)/i }));
    expect(updateUiPreference).toHaveBeenCalledWith('cardPreviewLines', 3);
  });

  test('switches task card density and updates preference (task 7a411b12)', () => {
    const updateUiPreference = vi.fn();
    renderWithKainBain(<UiPreferencesPanel />, {
      updateUiPreference,
      uiPreferences: { taskCardDensity: 'compact' },
    });

    fireEvent.click(screen.getByText('📋 Task Cards'));
    expect(screen.getByText('Task Card Density')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Full Card'));
    expect(updateUiPreference).toHaveBeenCalledWith('taskCardDensity', 'default');

    fireEvent.click(screen.getByText('Compact Card'));
    expect(updateUiPreference).toHaveBeenCalledWith('taskCardDensity', 'compact');
  });

  test('navigates to Sound & Alerts tab and tests chimes', () => {
    const updateUiPreference = vi.fn();
    renderWithKainBain(<UiPreferencesPanel />, {
      updateUiPreference,
    });

    fireEvent.click(screen.getByText('🔔 Sound & Alerts'));
    expect(screen.getByText('Audio Cues & Synthesized Chimes')).toBeInTheDocument();

    fireEvent.click(screen.getByText('▶ Test Audio'));
    // Does not crash
  });

  test('Sound & Alerts tab points at push settings instead of a dead notifications toggle', () => {
    renderWithKainBain(<UiPreferencesPanel />);

    fireEvent.click(screen.getByText('🔔 Sound & Alerts'));
    // The retired page-context notification controls must never come back:
    // the checkbox consumed the browser permission without ever subscribing
    // (Android Chrome cannot show in-page notifications at all).
    expect(screen.queryByLabelText(/Desktop \/ Browser Notifications/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Request & Test/i })).not.toBeInTheDocument();
    expect(screen.getByText('System Notifications (Web Push)')).toBeInTheDocument();
    expect(screen.getByText(/General App Settings → Notifications/)).toBeInTheDocument();
    // Without a host-provided navigation handler the card degrades to
    // plain guidance instead of a dead button.
    expect(
      screen.queryByRole('button', { name: /Manage push notifications/i }),
    ).not.toBeInTheDocument();
  });

  test('Sound & Alerts tab links to the push settings through the host navigation', () => {
    const onOpenPushNotifications = vi.fn();
    renderWithKainBain(<UiPreferencesPanel onOpenPushNotifications={onOpenPushNotifications} />);

    fireEvent.click(screen.getByText('🔔 Sound & Alerts'));
    fireEvent.click(screen.getByRole('button', { name: /Manage push notifications/i }));
    expect(onOpenPushNotifications).toHaveBeenCalledTimes(1);
  });

  test('toggles keep-screen-awake on the Workspace tab', () => {
    const updateUiPreference = vi.fn();
    renderWithKainBain(<UiPreferencesPanel />, {
      updateUiPreference,
      uiPreferences: { keepScreenAwakeOnMonitor: true },
    });

    fireEvent.click(screen.getByText('🗂️ Workspace'));
    expect(screen.getByText('Panels & Visibility')).toBeInTheDocument();

    const toggle = screen.getByLabelText('Keep screen awake while monitoring');
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(updateUiPreference).toHaveBeenCalledWith('keepScreenAwakeOnMonitor', false);
  });

  test('keep-screen-awake toggle reflects a disabled preference', () => {
    renderWithKainBain(<UiPreferencesPanel />, {
      uiPreferences: { keepScreenAwakeOnMonitor: false },
    });

    fireEvent.click(screen.getByText('🗂️ Workspace'));
    expect(screen.getByLabelText('Keep screen awake while monitoring')).not.toBeChecked();
  });

  test('activity drawer default toggle is only checked on an explicit opt-in', () => {
    // The drawer opens on first visit only when the preference is explicitly
    // true — an unset preference must render unchecked so the checkbox never
    // promises an expanded drawer the console will not show.
    const updateUiPreference = vi.fn();
    const { unmount } = renderWithKainBain(<UiPreferencesPanel />, {
      updateUiPreference,
      uiPreferences: { activityDrawerDefaultOpen: true },
    });

    fireEvent.click(screen.getByText('🗂️ Workspace'));
    const optedIn = screen.getByLabelText('Live Agent Activity Drawer Default Expanded');
    expect(optedIn).toBeChecked();
    fireEvent.click(optedIn);
    expect(updateUiPreference).toHaveBeenCalledWith('activityDrawerDefaultOpen', false);
    unmount();

    renderWithKainBain(<UiPreferencesPanel />, { uiPreferences: {} });
    fireEvent.click(screen.getByText('🗂️ Workspace'));
    expect(screen.getByLabelText('Live Agent Activity Drawer Default Expanded')).not.toBeChecked();
  });

  test('keep-screen-awake toggle shows an unsupported caption without the Wake Lock API', () => {
    if ('wakeLock' in window.navigator) {
      delete window.navigator.wakeLock;
    }
    renderWithKainBain(<UiPreferencesPanel />, {
      uiPreferences: { keepScreenAwakeOnMonitor: true },
    });

    fireEvent.click(screen.getByText('🗂️ Workspace'));
    expect(screen.getByLabelText('Keep screen awake while monitoring')).toBeInTheDocument();
    expect(screen.getByText(/Not supported on this browser\/connection/)).toBeInTheDocument();
  });

  test('keep-screen-awake toggle hides the unsupported caption with the Wake Lock API', () => {
    Object.defineProperty(window.navigator, 'wakeLock', {
      value: { request: vi.fn() },
      configurable: true,
      writable: true,
    });
    try {
      renderWithKainBain(<UiPreferencesPanel />, {
        uiPreferences: { keepScreenAwakeOnMonitor: true },
      });

      fireEvent.click(screen.getByText('🗂️ Workspace'));
      expect(screen.getByLabelText('Keep screen awake while monitoring')).toBeInTheDocument();
      expect(screen.queryByText(/Not supported on this browser\/connection/)).not.toBeInTheDocument();
    } finally {
      delete window.navigator.wakeLock;
    }
  });

  test('navigates to Backup & Reset tab and tests export and import', () => {
    const resetUiPreferences = vi.fn();
    const exportUiPreferences = vi.fn(() => '{"theme": "midnight"}');
    const importUiPreferences = vi.fn(() => ({ success: true }));

    renderWithKainBain(<UiPreferencesPanel />, {
      resetUiPreferences,
      exportUiPreferences,
      importUiPreferences,
    });

    fireEvent.click(screen.getByText('💾 Backup & Reset'));
    expect(screen.getByText('Export UI Preferences')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Copy Settings JSON'));
    expect(exportUiPreferences).toHaveBeenCalled();

    const textarea = screen.getByLabelText('Preferences JSON input');
    fireEvent.change(textarea, { target: { value: '{"theme": "light"}' } });
    fireEvent.click(screen.getByText('Apply Imported Settings'));
    expect(importUiPreferences).toHaveBeenCalledWith('{"theme": "light"}');
  });
});
