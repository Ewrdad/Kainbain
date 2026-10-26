import { useCallback, useState, useRef } from 'react';

/***
 * MARK: isNoisyNotification
 * @description Inspects notification metadata, title, and message to filter out noisy automated polling,
 * background heartbeats, health checks, and ping/keepalive events.
 * @param {Object} notif - Notification candidate object.
 * @returns {boolean} True if the notification is automated noise and should be suppressed.
 * @example isNoisyNotification({ title: 'Heartbeat', message: 'Ping ok' }) => true
 ***/
export function isNoisyNotification(notif) {
  if (!notif) return true;
  if (notif.meta?.isAutomated || notif.meta?.isPolling || notif.meta?.isHeartbeat) {
    return true;
  }

  const combined = `${notif.title || ''} ${notif.message || ''}`.toLowerCase();
  const noisyPatterns = [
    /\bheartbeat\b/,
    /\bpolling\b/,
    /\bpoll\b/,
    /\bhealth\s*check\b/,
    /\bping\b/,
    /\bpong\b/,
    /\bkeepalive\b/,
    /\bstatus\s*check\b/,
    /\bperiodic\s*sync\b/,
    /\bbackground\s*sync\b/,
    /\bautomated\s*poll\b/,
  ];

  return noisyPatterns.some((pattern) => pattern.test(combined));
}

/***
 * MARK: useNotifications
 * @description Hook managing transient toast notifications with accessible timers,
 * auto-dismissal, severity levels, noise filtering (suppressing automated polling/heartbeats),
 * and rapid duplicate throttling.
 * @example const { notifications, addNotification, dismissNotification, clearAllNotifications } = useNotifications();
 * @returns {Object}
 ***/
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const recentToastsRef = useRef([]);

  /***
   * MARK: dismissNotification
   * @description Removes a notification by its unique ID.
   * @example dismissNotification('notif-123')
   * @param {string} id
   ***/
  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /***
   * MARK: clearAllNotifications
   * @description Clears all active notifications.
   * @example clearAllNotifications()
   ***/
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  /***
   * MARK: addNotification
   * @description Adds a new toast notification with auto-dismissal duration, filtering out
   * noisy automated polling/heartbeats and throttling duplicate toasts within 2000ms.
   * @example addNotification({ type: 'success', message: 'Task created successfully', title: 'Task Created' })
   * @param {Object} notif
   * @param {string} notif.message - The main message text.
   * @param {string} [notif.type='info'] - 'info' | 'success' | 'warning' | 'error'
   * @param {string} [notif.title] - Optional title for the notification.
   * @param {number} [notif.duration=5000] - Duration in ms before auto-dismissal (0 for persistent).
   * @param {Object} [notif.meta] - Optional extra metadata.
   * @param {Object} [notif.action] - Optional `{ label, onClick }` action button
   *   (local toasts only — callbacks cannot cross the WebSocket).
   * @returns {string|null} The created notification ID or null if filtered.
   ***/
  const addNotification = useCallback((notif) => {
    if (!notif || (!notif.message && !notif.title)) return null;

    // Filter noisy polling/heartbeat automated toasts
    if (isNoisyNotification(notif)) {
      return null;
    }

    const now = Date.now();
    const messageKey = `${notif.type || 'info'}|${notif.title || ''}|${notif.message || ''}`;

    // Throttle identical rapid duplicate notifications within 2000ms
    const isDuplicate = recentToastsRef.current.some(
      (entry) => entry.key === messageKey && now - entry.timestamp < 2000,
    );

    if (isDuplicate) {
      return null;
    }

    recentToastsRef.current = [
      ...recentToastsRef.current.filter((e) => now - e.timestamp < 5000),
      { key: messageKey, timestamp: now },
    ];

    const id = `notif-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const item = {
      id,
      type: notif.type || 'info',
      title: notif.title || null,
      message: notif.message || '',
      duration: typeof notif.duration === 'number' ? notif.duration : 5000,
      timestamp,
      meta: notif.meta || {},
      ...(notif.action && typeof notif.action.label === 'string' && notif.action.label
        ? { action: notif.action }
        : {}),
    };

    setNotifications((prev) => [...prev.slice(-9), item]);
    return id;
  }, []);

  /***
   * MARK: notifySuccess
   * @description Convenience helper for success notifications.
   * @example notifySuccess('Task completed', 'Success')
   * @param {string} message
   * @param {string} [title]
   * @param {number} [duration=5000]
   * @returns {string}
   ***/
  const notifySuccess = useCallback(
    (message, title = 'Success', duration = 5000) => {
      return addNotification({ type: 'success', title, message, duration });
    },
    [addNotification],
  );

  /***
   * MARK: notifyInfo
   * @description Convenience helper for informational notifications.
   * @example notifyInfo('Stage advanced', 'Info')
   * @param {string} message
   * @param {string} [title]
   * @param {number} [duration=5000]
   * @returns {string}
   ***/
  const notifyInfo = useCallback(
    (message, title = 'Info', duration = 5000) => {
      return addNotification({ type: 'info', title, message, duration });
    },
    [addNotification],
  );

  /***
   * MARK: notifyWarning
   * @description Convenience helper for warning notifications.
   * @example notifyWarning('Review rejected', 'Warning')
   * @param {string} message
   * @param {string} [title]
   * @param {number} [duration=5000]
   * @returns {string}
   ***/
  const notifyWarning = useCallback(
    (message, title = 'Warning', duration = 5000) => {
      return addNotification({ type: 'warning', title, message, duration });
    },
    [addNotification],
  );

  /***
   * MARK: notifyError
   * @description Convenience helper for error notifications.
   * @example notifyError('Failed to execute command', 'Error')
   * @param {string} message
   * @param {string} [title]
   * @param {number} [duration=7000]
   * @returns {string}
   ***/
  const notifyError = useCallback(
    (message, title = 'Error', duration = 7000) => {
      return addNotification({ type: 'error', title, message, duration });
    },
    [addNotification],
  );

  return {
    notifications,
    setNotifications,
    addNotification,
    dismissNotification,
    clearAllNotifications,
    notifySuccess,
    notifyInfo,
    notifyWarning,
    notifyError,
  };
}

export default useNotifications;
