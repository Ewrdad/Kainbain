import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Notifications, ToastItem } from './Notifications';
import { KainBainContext } from '../../context/KainBainContext';

describe('Notifications Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderWithContext = (notifications = [], dismissNotification = vi.fn()) => {
    return render(
      <KainBainContext.Provider
        value={{
          notifications,
          dismissNotification,
        }}
      >
        <Notifications />
      </KainBainContext.Provider>,
    );
  };

  it('renders nothing when there are no notifications', () => {
    const { container } = renderWithContext([]);
    expect(container.firstChild).toBeNull();
  });

  it('renders floating toasts with correct accessible roles and content', () => {
    const mockNotifications = [
      {
        id: 'n1',
        type: 'success',
        title: 'Task Created',
        message: 'Build Auth API created successfully',
        timestamp: '10:00:00 AM',
      },
      {
        id: 'n2',
        type: 'error',
        title: 'CI Failed',
        message: 'Tests exited with code 1',
        timestamp: '10:01:00 AM',
      },
    ];

    renderWithContext(mockNotifications);

    expect(screen.getByText('Task Created')).toBeInTheDocument();
    expect(screen.getByText('Build Auth API created successfully')).toBeInTheDocument();
    expect(screen.getByText('CI Failed')).toBeInTheDocument();
    expect(screen.getByText('Tests exited with code 1')).toBeInTheDocument();

    // Check accessible roles: status for success/info, alert for error
    const successToast = screen.getByTestId('toast-n1');
    expect(successToast).toHaveAttribute('role', 'status');
    expect(successToast).toHaveAttribute('aria-live', 'polite');

    const errorToast = screen.getByTestId('toast-n2');
    expect(errorToast).toHaveAttribute('role', 'alert');
    expect(errorToast).toHaveAttribute('aria-live', 'assertive');
  });

  it('dismisses a toast when clicking the dismiss button', () => {
    const dismissNotification = vi.fn();
    const mockNotifications = [
      {
        id: 'n1',
        type: 'info',
        title: 'Info Notice',
        message: 'Workflow switched to Fast Track',
      },
    ];

    renderWithContext(mockNotifications, dismissNotification);

    const dismissBtn = screen.getByRole('button', { name: /Dismiss notification/i });
    expect(dismissBtn).toBeInTheDocument();

    fireEvent.click(dismissBtn);
    expect(dismissNotification).toHaveBeenCalledWith('n1');
  });

  it('auto-dismisses after the specified duration', () => {
    const dismissNotification = vi.fn();
    const mockNotifications = [
      {
        id: 'n1',
        type: 'success',
        message: 'Auto-hiding toast',
        duration: 3000,
      },
    ];

    renderWithContext(mockNotifications, dismissNotification);

    expect(dismissNotification).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(dismissNotification).toHaveBeenCalledWith('n1');
  });

  it('individual ToastItem renders touch target >= 44px', () => {
    const onDismiss = vi.fn();
    const notification = {
      id: 'n-test',
      type: 'warning',
      title: 'Warning',
      message: 'Human review rejected',
    };

    render(<ToastItem notification={notification} onDismiss={onDismiss} />);

    const dismissBtn = screen.getByRole('button', { name: /Dismiss notification/i });
    expect(dismissBtn).toHaveClass('min-w-[44px]');
    expect(dismissBtn).toHaveClass('min-h-[44px]');
  });

  it('filters out noisy automated polling/heartbeat toasts and renders only meaningful actions', () => {
    const mockNotifications = [
      {
        id: 'n-noise1',
        type: 'info',
        title: 'Heartbeat Ping',
        message: 'Engine keepalive ok',
      },
      {
        id: 'n-noise2',
        type: 'info',
        title: 'Status Polling',
        message: 'Periodic poll result: idle',
      },
      {
        id: 'n-real',
        type: 'success',
        title: 'Task Created',
        message: 'Auth module task created',
      },
    ];

    renderWithContext(mockNotifications);

    expect(screen.queryByText('Heartbeat Ping')).not.toBeInTheDocument();
    expect(screen.queryByText('Status Polling')).not.toBeInTheDocument();
    expect(screen.getByText('Task Created')).toBeInTheDocument();
    expect(screen.getByText('Auth module task created')).toBeInTheDocument();
  });

  it('renders the action button and runs it before dismissing', () => {
    const onClick = vi.fn();
    const dismissNotification = vi.fn();
    renderWithContext(
      [
        {
          id: 'n-action',
          type: 'success',
          title: 'Retrospective chat',
          message: 'Chat reply ready — hello',
          action: { label: 'View chat', onClick },
        },
      ],
      dismissNotification,
    );
    const actionBtn = screen.getByTestId('toast-action-n-action');
    expect(actionBtn).toHaveTextContent('View chat');
    expect(actionBtn).toHaveClass('min-h-[44px]');
    fireEvent.click(actionBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(dismissNotification).toHaveBeenCalledWith('n-action');
  });

  it('renders no action button without an action label', () => {
    renderWithContext([{ id: 'n-plain', type: 'info', message: 'Plain toast' }]);
    expect(screen.queryByTestId('toast-action-n-plain')).not.toBeInTheDocument();
  });

  it('pauses auto-dismiss on hover/focus and resumes on leave (WCAG 2.2.1/2.2.3)', () => {
    const dismissNotification = vi.fn();
    renderWithContext(
      [{ id: 'n-pause', type: 'info', message: 'Slow-reader toast', duration: 3000 }],
      dismissNotification,
    );
    const toast = screen.getByTestId('toast-n-pause');

    // Hover pauses the countdown: advancing past the duration dismisses nothing.
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(dismissNotification).not.toHaveBeenCalled();

    // Leaving resumes with the remaining time (3000ms untouched while paused).
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(dismissNotification).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(dismissNotification).toHaveBeenCalledWith('n-pause');
  });

  it('restarts the countdown when the same toast id is re-issued with a new duration', () => {
    const dismissNotification = vi.fn();
    const { rerender } = render(
      <KainBainContext.Provider
        value={{
          notifications: [{ id: 'n-retry', type: 'info', message: 'Try again', duration: 1000 }],
          dismissNotification,
        }}
      >
        <Notifications />
      </KainBainContext.Provider>,
    );
    // Let most of the original 1000ms budget elapse, then re-issue the same
    // id with a fresh 5000ms budget: the old remainder must not leak through.
    act(() => {
      vi.advanceTimersByTime(900);
    });
    rerender(
      <KainBainContext.Provider
        value={{
          notifications: [{ id: 'n-retry', type: 'info', message: 'Try again', duration: 5000 }],
          dismissNotification,
        }}
      >
        <Notifications />
      </KainBainContext.Provider>,
    );
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(dismissNotification).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(dismissNotification).toHaveBeenCalledWith('n-retry');
  });

  it('pauses auto-dismiss while keyboard focus is inside the toast', () => {
    const dismissNotification = vi.fn();
    renderWithContext(
      [{ id: 'n-focus', type: 'info', message: 'Focusable toast', duration: 2000 }],
      dismissNotification,
    );
    const toast = screen.getByTestId('toast-n-focus');
    fireEvent.focus(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(dismissNotification).not.toHaveBeenCalled();
    fireEvent.blur(toast);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(dismissNotification).toHaveBeenCalledWith('n-focus');
  });
});
