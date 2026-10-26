import React, { useEffect } from 'react';

import { useKainBain } from '../../context/KainBainContext';
import { isNoisyNotification } from '../../context/useNotifications';

/***
 * MARK: getTypeConfig
 * @description Resolves role chromatics and styles for notification types safely.
 * @param {string} type
 * @returns {Object}
 ***/
function getTypeConfig(type) {
  switch (type) {
    case 'success':
      return {
        border: 'border-primary',
        badgeBg: 'bg-primary/20 text-primary border-primary/40',
        icon: '✓',
        label: 'SUCCESS',
        accentGlow: 'shadow-[0_4px_20px_rgba(123,219,133,0.15)]',
      };
    case 'info':
      return {
        border: 'border-secondary',
        badgeBg: 'bg-secondary/20 text-secondary border-secondary/40',
        icon: 'ℹ',
        label: 'INFO',
        accentGlow: 'shadow-[0_4px_20px_rgba(154,203,255,0.15)]',
      };
    case 'warning':
      return {
        border: 'border-ochre',
        badgeBg: 'bg-ochre/20 text-ochre border-ochre/40',
        icon: '⚠',
        label: 'NOTICE',
        accentGlow: 'shadow-[0_4px_20px_rgba(255,183,127,0.15)]',
      };
    case 'error':
      return {
        border: 'border-error',
        badgeBg: 'bg-error/20 text-error border-error/40',
        icon: '✕',
        label: 'ERROR',
        accentGlow: 'shadow-[0_4px_20px_rgba(255,180,171,0.15)]',
      };
    default:
      return {
        border: 'border-border-standard',
        badgeBg: 'bg-surface-container text-text-muted border-border-standard',
        icon: '•',
        label: 'SYSTEM',
        accentGlow: 'shadow-md',
      };
  }
}

/***
 * MARK: ToastItem
 * @description Renders a single accessible notification toast with auto-hide timeout,
 * high-contrast role-based chromatics, JetBrains Mono metadata, and accessible dismissal.
 * @param {Object} props
 * @param {Object} props.notification
 * @param {Function} props.onDismiss
 * @example <ToastItem notification={n} onDismiss={dismissNotification} />
 ***/
export function ToastItem({ notification, onDismiss }) {
  const { id, type, title, message, duration = 5000, timestamp, action } = notification;
  const actionLabel = typeof action?.label === 'string' && action.label ? action.label : null;

  // WCAG 2.2.1 Timing Adjustable / 2.2.3 No Timing (AAA): the auto-dismiss
  // countdown pauses while the pointer hovers the toast or keyboard focus is
  // inside it, so slow readers never lose the message to the timer — the
  // remaining time resumes when they leave. duration <= 0 stays persistent.
  const [paused, setPaused] = React.useState(false);
  const remainingRef = React.useRef(duration);
  // Same toast id re-issued with a new duration restarts the countdown from
  // the new budget: the reset lives here (not in render) so the previous
  // effect's cleanup — which banks the elapsed time into the OLD budget —
  // runs first, then the remainder is discarded in favour of the new budget.
  const budgetKeyRef = React.useRef(`${id}:${duration}`);
  const startedAtRef = React.useRef(null);
  const timerRef = React.useRef(null);

  useEffect(() => {
    const budgetKey = `${id}:${duration}`;
    if (budgetKeyRef.current !== budgetKey) {
      budgetKeyRef.current = budgetKey;
      remainingRef.current = duration;
    }
    if (!duration || duration <= 0 || paused) return undefined;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss(id);
    }, remainingRef.current);
    return () => {
      clearTimeout(timerRef.current);
      if (startedAtRef.current !== null) {
        remainingRef.current = Math.max(
          0,
          remainingRef.current - (Date.now() - startedAtRef.current),
        );
        startedAtRef.current = null;
      }
    };
  }, [id, duration, paused, onDismiss]);

  const typeConfig = getTypeConfig(type);
  const isError = type === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      data-testid={`toast-${id}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-none w-full max-w-sm bg-surface-deep/95 backdrop-blur-md border ${typeConfig.border} ${typeConfig.accentGlow} rounded-sm p-3.5 flex items-start gap-3 transition-all duration-200 select-none animate-in fade-in slide-in-from-top-2`}
    >
      {/* Type Icon / Badge */}
      <div
        className={`w-6 h-6 rounded-sm border flex items-center justify-center text-xs font-bold shrink-0 font-mono ${typeConfig.badgeBg}`}
        aria-hidden="true"
      >
        {typeConfig.icon}
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="font-label-caps text-[9px] uppercase tracking-wider text-text-muted font-bold">
            {title || typeConfig.label}
          </span>
          {timestamp && (
            <span className="font-code-sm text-[10px] text-text-muted opacity-80">{timestamp}</span>
          )}
        </div>
        <p className="text-xs font-body-sm text-on-surface font-medium leading-relaxed break-words">
          {message}
        </p>
        {actionLabel && (
          <button
            type="button"
            onClick={() => {
              try {
                action.onClick?.();
              } finally {
                onDismiss(id);
              }
            }}
            data-testid={`toast-action-${id}`}
            className="pointer-events-auto mt-1.5 px-3 py-2 min-h-[44px] text-[0.6875rem] font-bold uppercase tracking-wider rounded-sm border border-primary text-primary cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {actionLabel}
          </button>
        )}
      </div>

      {/* Accessible Dismiss Button (touch target >= 44x44px per WCAG 2.5.8 / 2.5.5;
          stays in the tab order so keyboard users can dismiss toasts — WCAG 2.1.1). */}
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="pointer-events-auto min-w-[44px] min-h-[44px] -mr-2 -mt-2 p-2 flex items-center justify-center rounded-sm text-text-muted hover:text-on-surface hover:bg-white/10 active:scale-95 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
      >
        <span className="text-sm font-bold leading-none" aria-hidden="true">
          ✕
        </span>
      </button>
    </div>
  );
}

/***
 * MARK: Notifications
 * @description Unified Accessible Toast Notification Layer.
 * Renders floating toasts for task lifecycle events, stage transitions, human reviews,
 * CI execution results, workflow switches, project changes, and WebSocket reconnection events.
 * Fully WCAG 2.2 AAA accessible with live regions, high contrast styling, and >=44px touch targets.
 * @example <Notifications />
 ***/
export function Notifications() {
  const { notifications = [], dismissNotification } = useKainBain();

  const meaningfulNotifications = notifications.filter((item) => !isNoisyNotification(item));

  if (!meaningfulNotifications || meaningfulNotifications.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Notifications"
      className="fixed top-20 right-4 z-40 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {meaningfulNotifications.map((item) => (
        <ToastItem key={item.id} notification={item} onDismiss={dismissNotification} />
      ))}
    </aside>
  );
}

export default Notifications;
