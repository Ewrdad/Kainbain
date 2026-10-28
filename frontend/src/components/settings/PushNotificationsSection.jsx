import React, { useCallback, useEffect, useState } from 'react';
import { pushNotifications } from '../../services/pushNotifications';

/***
 * MARK: pushActionLabel
 * @description Button label for the status row's single action: the in-flight
 *   wording while a request is pending (`busy` is the in-flight action name),
 *   otherwise the label the pure state helper chose.
 * @param {Object|null} action - `{ kind, label }` from `describePushState`.
 * @param {string|null} busy - In-flight action name (`'subscribe'`/`'register'`/…).
 * @returns {string}
 ***/
function pushActionLabel(action, busy) {
  if (busy === 'register') return 'Re-registering…';
  if (busy === 'unsubscribe') return 'Disabling…';
  if (busy === 'subscribe') {
    return action?.kind === 'subscribe' ? 'Subscribing…' : 'Disabling…';
  }
  return action?.label || '';
}

/***
 * MARK: PushNotificationsSection
 * @description General App Settings tab for Web Push notifications: browser
 *   permission status, a server-verified subscribe/unsubscribe lifecycle
 *   (subscribed locally AND registered on the server — permission alone
 *   never delivers anything), master + per-trigger toggles (queue-empty,
 *   human-intervention stage errors), and a test send with delivery
 *   breakdown and OS-level troubleshooting guidance. All copy is plain
 *   language; failures surface inline so the operator can act.
 * @example <PushNotificationsSection />
 ***/
export function PushNotificationsSection() {
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [registered, setRegistered] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showTestTroubleshooting, setShowTestTroubleshooting] = useState(false);

  // State setters run only in promise continuations (never synchronously in
  // the mount effect), matching the StorageSection pattern the lint rules
  // enforce. Event handlers use refresh() directly.
  const applyLoaded = useCallback((state, prefs) => {
    setSupported(state.supported !== false);
    setPermission(state.permission || 'default');
    setSubscribed(Boolean(state.subscribed));
    // registered: true | false from the server check, null when the check
    // could not be made (the UI then degrades to the local-only display).
    setRegistered(
      state.registered === true || state.registered === false ? state.registered : null,
    );
    if (prefs) setSettings(prefs);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const [state, prefs] = await Promise.all([
        pushNotifications.getSubscriptionState(),
        pushNotifications.getSettings().catch(() => null),
      ]);
      applyLoaded(state, prefs);
      return state;
    } catch {
      setNotice({
        kind: 'error',
        text: 'Could not load notification settings. Check the API is reachable, then retry.',
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyLoaded]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      pushNotifications.getSubscriptionState(),
      pushNotifications.getSettings().catch(() => null),
    ])
      .then(([state, prefs]) => {
        if (cancelled) return;
        applyLoaded(state, prefs);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setNotice({
          kind: 'error',
          text: 'Could not load notification settings. Check the API is reachable, then retry.',
        });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyLoaded]);

  const runAction = useCallback(
    async (name, fn, okText) => {
      setBusy(name);
      setNotice(null);
      setShowTestTroubleshooting(false);
      try {
        const result = await fn();
        await refresh();
        // For test sends, surface the delivery breakdown so the operator
        // sees when the request succeeded but zero notifications were
        // actually delivered (the classic silent-failure mode).
        if (name === 'test' && result && result.ok !== false) {
          const delivered = result.result?.delivered || 0;
          const subs = result.result?.subscriptions || 0;
          if (delivered === 0 && subs === 0) {
            setNotice({
              kind: 'error',
              text: 'Test request succeeded but the server has no subscriptions — the browser subscription may not have been saved. Try disabling and re-enabling push notifications.',
            });
            return;
          }
          if (delivered === 0 && subs > 0) {
            setNotice({
              kind: 'error',
              text: `Test notification could not be delivered to any of the ${subs} subscription(s) — check the server logs for the push delivery error.`,
            });
            return;
          }
          setNotice({
            kind: 'ok',
            text: `Test notification sent — delivered to ${delivered} of ${subs} subscribed browser(s). Check your system notifications.`,
          });
          // The server-side delivery succeeded, so anything the user does not
          // see is an OS-level display issue (notification channel off, or
          // iOS without a Home-Screen install) — not something web code can
          // detect, only guide.
          setShowTestTroubleshooting(true);
          return;
        }
        if (okText) setNotice({ kind: 'ok', text: okText });
      } catch (error) {
        setNotice({ kind: 'error', text: error?.message || 'That did not work — try again.' });
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  // Retry affordance for "subscribed locally but missing on the server":
  // reading the state again re-checks the server and self-heals by
  // re-registering the existing subscription (idempotent upsert). The
  // notice reflects what the re-check actually found — a still-missing
  // registration is an error, not a success.
  const reregister = useCallback(async () => {
    setBusy('register');
    setShowTestTroubleshooting(false);
    try {
      const state = await refresh();
      if (!state) {
        // refresh() already surfaced the load error.
      } else if (!state.subscribed) {
        setNotice({
          kind: 'error',
          text: 'This browser has no push subscription to re-register — use Enable push notifications instead.',
        });
      } else if (state.registered === false) {
        setNotice({
          kind: 'error',
          text: 'This browser is still not registered with the server — check the API is reachable, then try disabling and re-enabling push notifications.',
        });
      } else {
        setNotice({ kind: 'ok', text: 'Push registration re-verified with the server.' });
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'That did not work — try again.' });
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const toggleMaster = (next) =>
    runAction('settings', async () => {
      const updated = await pushNotifications.updateSettings({ enabled: next });
      setSettings(updated);
    });
  const toggleTrigger = (key, next) =>
    runAction('settings', async () => {
      const updated = await pushNotifications.updateSettings({
        triggers: { ...(settings?.triggers || {}), [key]: next },
      });
      setSettings(updated);
    });

  // The status row's single action, owned by `describePushState` (which
  // derives it from the same flags it describes) and routed here; the
  // component never re-derives the action from raw state.
  const pushState = pushNotifications.describePushState({
    supported,
    permission,
    subscribed,
    registered,
  });

  const handlePushAction = useCallback(() => {
    switch (pushState.action?.kind) {
      case 'subscribe':
        return runAction(
          'subscribe',
          () => pushNotifications.subscribeUser(),
          'Subscribed — this browser will now receive push notifications.',
        );
      case 'reregister':
        return reregister();
      case 'unsubscribe':
        return runAction(
          'unsubscribe',
          () => pushNotifications.unsubscribeUser(),
          'Unsubscribed — this browser will no longer receive push notifications.',
        );
      default:
        return undefined;
    }
  }, [pushState.action?.kind, runAction, reregister]);

  const rowClass = 'flex flex-col gap-1.5 py-3 border-b border-border-standard last:border-b-0';
  const buttonClass =
    'self-start px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest disabled:opacity-50 text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer disabled:cursor-default';
  const primaryButtonClass =
    'self-start px-4 py-2 min-h-[44px] bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer disabled:cursor-default';
  const toggleClass = 'flex items-center gap-2 cursor-pointer select-none text-xs text-on-surface';

  if (loading) {
    return (
      <div className="py-6 text-xs text-text-muted" role="status" aria-live="polite">
        Loading notification settings…
      </div>
    );
  }

  const statusToneClass = {
    ok: 'bg-agent-fill text-primary border-primary/30',
    warning: 'bg-warning/20 text-warning border-warning/40',
    error: 'bg-error-container text-on-error-container border-error/40',
    muted: 'bg-surface-deep text-text-muted border-border-standard',
  }[pushState.tone];

  return (
    <div className="flex flex-col">
      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className="mt-3 px-3 py-2 text-[11px] border rounded-sm text-on-surface bg-surface-container-high border-border-standard"
        >
          {notice.text}
        </p>
      )}
      {showTestTroubleshooting && (
        <p className="mt-2 px-3 text-[11px] text-text-muted" data-testid="push-os-troubleshooting">
          If nothing appeared: on Android check system Settings → Apps → (Chrome or the installed
          KainBain app) → Notifications; on iPhone/iPad the app must be added to the Home Screen for
          notifications to appear.
        </p>
      )}

      <div className={rowClass}>
        <span className="text-xs font-bold text-on-surface">Browser permission</span>
        <span className="flex items-center gap-2 text-[11px] text-text-muted">
          <span
            data-testid="push-permission-badge"
            className="px-2 py-1 bg-surface-container-high border border-border-standard rounded-sm text-on-surface-variant font-bold uppercase tracking-widest text-[10px]"
          >
            {pushNotifications.permissionLabel(supported ? permission : 'unsupported')}
          </span>
          Allowing notifications is a browser permission — it does not subscribe this browser. The
          subscription status below is what delivers notifications.
        </span>
      </div>

      <div className={rowClass}>
        <span className="text-xs font-bold text-on-surface">Subscription</span>
        <span className="flex items-center gap-2 text-[11px] text-text-muted">
          <span
            data-testid="push-subscription-status"
            className={`px-2 py-1 border rounded-sm font-bold uppercase tracking-widest text-[10px] ${statusToneClass}`}
          >
            {pushState.label}
          </span>
          <span data-testid="push-subscription-detail">{pushState.detail}</span>
        </span>
        <span className="text-[11px] text-text-muted">
          On iPhone/iPad, Safari only delivers push to apps added to the Home Screen — use the share
          menu first, then subscribe from the new icon.
        </span>
        <span className="flex gap-2">
          {pushState.action && (
            <button
              type="button"
              onClick={handlePushAction}
              disabled={busy !== null}
              className={pushState.action.kind === 'subscribe' ? primaryButtonClass : buttonClass}
            >
              {pushActionLabel(pushState.action, busy)}
            </button>
          )}
        </span>
      </div>

      <div className={rowClass}>
        <span className="text-xs font-bold text-on-surface">Notify me when</span>
        <label className={toggleClass}>
          <input
            type="checkbox"
            checked={settings?.enabled !== false}
            onChange={(e) => toggleMaster(e.target.checked)}
            disabled={busy === 'settings'}
            className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
          />
          <span>Push notifications enabled</span>
        </label>
        <label className={toggleClass}>
          <input
            type="checkbox"
            checked={settings?.triggers?.queueEmpty !== false}
            onChange={(e) => toggleTrigger('queueEmpty', e.target.checked)}
            disabled={busy === 'settings' || settings?.enabled === false}
            className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
          />
          <span>Queue empty — no tasks left to run (all work complete)</span>
        </label>
        <label className={toggleClass}>
          <input
            type="checkbox"
            checked={settings?.triggers?.unrecoverableStageError !== false}
            onChange={(e) => toggleTrigger('unrecoverableStageError', e.target.checked)}
            disabled={busy === 'settings' || settings?.enabled === false}
            className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
          />
          <span>Stage needs me — an error the app cannot recover from on its own</span>
        </label>
        <label className={toggleClass}>
          <input
            type="checkbox"
            checked={settings?.triggers?.schedulerStall !== false}
            onChange={(e) => toggleTrigger('schedulerStall', e.target.checked)}
            disabled={busy === 'settings' || settings?.enabled === false}
            className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0 cursor-pointer"
          />
          <span>
            Scheduler recovered stuck work — a run that never settled was force-settled and retried
          </span>
        </label>
        <span className="text-[11px] text-text-muted">
          Routine failures (test failures, review rejections, automatic retries) never notify — only
          stalled work that needs a human. Stage-specific rules can be configured per workflow stage
          in upcoming releases.
        </span>
      </div>

      <div className={rowClass}>
        <span className="text-xs font-bold text-on-surface">Verify</span>
        <span className="text-[11px] text-text-muted">
          Send a test notification to every subscribed browser right now.
        </span>
        <button
          type="button"
          onClick={() => runAction('test', () => pushNotifications.sendTestPush())}
          disabled={busy !== null || !pushState.canTest}
          className={buttonClass}
        >
          {busy === 'test' ? 'Sending…' : 'Send test notification'}
        </button>
      </div>
    </div>
  );
}
