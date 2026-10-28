import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderWithKainBain } from '../../testUtils';
import { PushNotificationsSection } from './PushNotificationsSection';
import { pushNotifications } from '../../services/pushNotifications';

/**
 * MARK: PushNotificationsSection tests
 * @description Black-box coverage for the System Settings › Notifications tab:
 *   permission badge, subscribe/unsubscribe lifecycle, master + trigger
 *   toggles, the test-send action, and the unsupported-browser guidance. The
 *   pushNotifications service module is mocked; all state is asserted from
 *   the rendered UI.
 */

vi.mock('../../services/pushNotifications', async () => {
  const actual = await vi.importActual('../../services/pushNotifications');
  return {
    pushNotifications: {
      // Pure helpers stay real: the component's status copy comes from them.
      describePushState: actual.describePushState,
      permissionLabel: actual.permissionLabel,
      getSubscriptionState: vi.fn(),
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      subscribeUser: vi.fn(),
      unsubscribeUser: vi.fn(),
      sendTestPush: vi.fn(),
    },
  };
});

const DEFAULT_SETTINGS = {
  enabled: true,
  triggers: { queueEmpty: true, unrecoverableStageError: true },
  stages: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: false,
  });
  pushNotifications.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
  pushNotifications.updateSettings.mockImplementation(async (patch) => ({
    ...DEFAULT_SETTINGS,
    ...patch,
    triggers: { ...DEFAULT_SETTINGS.triggers, ...(patch.triggers || {}) },
  }));
  pushNotifications.sendTestPush.mockResolvedValue({
    ok: true,
    result: { delivered: 1, pruned: 0, subscriptions: 1, errors: [] },
  });
});

test('shows the permission badge and an enable action when unsubscribed', async () => {
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByTestId('push-permission-badge')).toHaveTextContent('Allowed');
  expect(
    await screen.findByRole('button', { name: /Enable push notifications/i }),
  ).toBeInTheDocument();
  expect(screen.getByText(/not subscribed/i)).toBeInTheDocument();
});

test('allowed-but-unsubscribed explains the permission/subscription difference (the reported bug)', async () => {
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByTestId('push-subscription-status')).toHaveTextContent('Not subscribed');
  // The exact state from the reported bug: permission already Allowed, so
  // the copy says what is actually missing instead of a permission prompt.
  expect(screen.getByTestId('push-subscription-detail')).toHaveTextContent(
    /You've allowed notifications/i,
  );
  expect(screen.getByTestId('push-subscription-detail')).toHaveTextContent(
    /now subscribe this browser/i,
  );
});

test('subscribe button subscribes and confirms', async () => {
  pushNotifications.subscribeUser.mockResolvedValue({});
  pushNotifications.getSubscriptionState
    .mockResolvedValueOnce({ supported: true, permission: 'granted', subscribed: false })
    .mockResolvedValue({ supported: true, permission: 'granted', subscribed: true });
  renderWithKainBain(<PushNotificationsSection />);
  fireEvent.click(await screen.findByRole('button', { name: /Enable push notifications/i }));
  await waitFor(() => expect(pushNotifications.subscribeUser).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/this browser will now receive push/i)).toBeInTheDocument();
});

test('subscribed state offers disable and a working test send', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: true,
  });
  renderWithKainBain(<PushNotificationsSection />);
  expect(
    await screen.findByRole('button', { name: /Disable push notifications/i }),
  ).toBeInTheDocument();
  const testButton = await screen.findByRole('button', { name: /Send test notification/i });
  expect(testButton).toBeEnabled();
  fireEvent.click(testButton);
  await waitFor(() => expect(pushNotifications.sendTestPush).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/Test notification sent/i)).toBeInTheDocument();
});

test('disable button unsubscribes user and confirms', async () => {
  pushNotifications.unsubscribeUser.mockResolvedValue(true);
  pushNotifications.getSubscriptionState
    .mockResolvedValueOnce({ supported: true, permission: 'granted', subscribed: true })
    .mockResolvedValue({ supported: true, permission: 'granted', subscribed: false });
  renderWithKainBain(<PushNotificationsSection />);
  const disableButton = await screen.findByRole('button', { name: /Disable push notifications/i });
  fireEvent.click(disableButton);
  await waitFor(() => expect(pushNotifications.unsubscribeUser).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/no longer receive push notifications/i)).toBeInTheDocument();
});

test('server-verified subscription shows "Subscribed & registered" and enables the test send', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: true,
    registered: true,
  });
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByTestId('push-subscription-status')).toHaveTextContent(
    'Subscribed & registered',
  );
  expect(screen.getByRole('button', { name: /Disable push notifications/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Send test notification/i })).toBeEnabled();
});

test('local subscription missing on the server warns and offers a re-register retry', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: true,
    registered: false,
  });
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByTestId('push-subscription-status')).toHaveTextContent(
    /Not registered on server/i,
  );
  expect(screen.getByTestId('push-subscription-detail')).toHaveTextContent(
    /server does not have it/i,
  );
  const reregisterButton = screen.getByRole('button', {
    name: /Re-register push notifications/i,
  });
  expect(reregisterButton).toBeInTheDocument();
  // No false "ready" state: the test send is disabled until registration
  // is confirmed, or the check could not be made at all (registered: null).
  expect(screen.getByRole('button', { name: /Send test notification/i })).toBeDisabled();

  // The retry re-reads the state (which re-checks and self-heals).
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: true,
    registered: true,
  });
  fireEvent.click(reregisterButton);
  await waitFor(() =>
    expect(pushNotifications.getSubscriptionState.mock.calls.length).toBeGreaterThanOrEqual(2),
  );
  expect(await screen.findByTestId('push-subscription-status')).toHaveTextContent(
    'Subscribed & registered',
  );
});

test('re-register retry reports an error when the server still has no registration', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: true,
    registered: false,
  });
  renderWithKainBain(<PushNotificationsSection />);
  const reregisterButton = await screen.findByRole('button', {
    name: /Re-register push notifications/i,
  });
  fireEvent.click(reregisterButton);
  await waitFor(() =>
    expect(pushNotifications.getSubscriptionState.mock.calls.length).toBeGreaterThanOrEqual(2),
  );
  // Honest failure copy — never a false "re-verified" success.
  expect(await screen.findByText(/still not registered with the server/i)).toBeInTheDocument();
});

test('re-register retry reports honestly when the subscription vanished meanwhile', async () => {
  pushNotifications.getSubscriptionState
    .mockResolvedValueOnce({
      supported: true,
      permission: 'granted',
      subscribed: true,
      registered: false,
    })
    .mockResolvedValue({
      supported: true,
      permission: 'granted',
      subscribed: false,
      registered: null,
    });
  renderWithKainBain(<PushNotificationsSection />);
  const reregisterButton = await screen.findByRole('button', {
    name: /Re-register push notifications/i,
  });
  fireEvent.click(reregisterButton);
  // The subscription disappeared between renders: re-registering has nothing
  // to do, so say so instead of claiming a successful re-verification.
  expect(await screen.findByText(/no push subscription to re-register/i)).toBeInTheDocument();
});

test('successful test send appends OS-level troubleshooting guidance', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: true,
    registered: true,
  });
  renderWithKainBain(<PushNotificationsSection />);
  expect(screen.queryByTestId('push-os-troubleshooting')).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /Send test notification/i }));
  await waitFor(() => expect(pushNotifications.sendTestPush).toHaveBeenCalledTimes(1));
  expect(await screen.findByTestId('push-os-troubleshooting')).toHaveTextContent(
    /Settings → Apps/i,
  );
  expect(screen.getByTestId('push-os-troubleshooting')).toHaveTextContent(/Home Screen/i);
});

test('test send surfaces zero-delivery as an error, not a false success', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: true,
  });
  pushNotifications.sendTestPush.mockResolvedValue({
    ok: true,
    result: { delivered: 0, pruned: 0, subscriptions: 0, errors: [] },
  });
  renderWithKainBain(<PushNotificationsSection />);
  const testButton = await screen.findByRole('button', { name: /Send test notification/i });
  fireEvent.click(testButton);
  await waitFor(() => expect(pushNotifications.sendTestPush).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/no subscriptions.*may not have been saved/i)).toBeInTheDocument();
});

test('test send surfaces a server-side error message when delivery fails', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'granted',
    subscribed: true,
  });
  pushNotifications.sendTestPush.mockRejectedValue(
    new Error('Test notification was not delivered — check the server logs for details'),
  );
  renderWithKainBain(<PushNotificationsSection />);
  const testButton = await screen.findByRole('button', { name: /Send test notification/i });
  fireEvent.click(testButton);
  await waitFor(() => expect(pushNotifications.sendTestPush).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/was not delivered/i)).toBeInTheDocument();
});

test('master and trigger toggles persist through updateSettings', async () => {
  renderWithKainBain(<PushNotificationsSection />);
  const master = await screen.findByLabelText(/Push notifications enabled/i);
  expect(master).toBeChecked();
  fireEvent.click(master);
  await waitFor(() =>
    expect(pushNotifications.updateSettings).toHaveBeenCalledWith({ enabled: false }),
  );
  const queueToggle = screen.getByLabelText(/Queue empty/i);
  fireEvent.click(queueToggle);
  await waitFor(() =>
    expect(pushNotifications.updateSettings).toHaveBeenCalledWith({
      triggers: { queueEmpty: false, unrecoverableStageError: true },
    }),
  );
});

test('blocked permission explains how to unblock', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'denied',
    subscribed: false,
    registered: null,
  });
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByTestId('push-permission-badge')).toHaveTextContent('Blocked');
  expect(screen.getByText(/blocked for this site/i)).toBeInTheDocument();
  // No subscribe CTA while blocked: the operator must unblock in the
  // browser site settings first — a dead enable button would mislead.
  expect(
    screen.queryByRole('button', { name: /Enable push notifications/i }),
  ).not.toBeInTheDocument();
});

test('blocked permission with a stale subscription still offers unsubscribe', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: true,
    permission: 'denied',
    subscribed: true,
    registered: true,
  });
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByTestId('push-permission-badge')).toHaveTextContent('Blocked');
  // The browser normally drops the subscription when permission is revoked,
  // but a stale one must not leave the operator stuck with no cleanup path.
  expect(screen.getByRole('button', { name: /Disable push notifications/i })).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Enable push notifications/i }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Send test notification/i })).toBeDisabled();
});

test('unsupported browsers get setup guidance instead of actions', async () => {
  pushNotifications.getSubscriptionState.mockResolvedValue({
    supported: false,
    permission: 'unsupported',
    subscribed: false,
  });
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByTestId('push-permission-badge')).toHaveTextContent('Unsupported');
  expect(screen.getByText(/HTTPS or localhost/i)).toBeInTheDocument();
});

test('load failure surfaces an inline error', async () => {
  pushNotifications.getSubscriptionState.mockRejectedValue(new Error('down'));
  pushNotifications.getSettings.mockRejectedValue(new Error('down'));
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByText(/Could not load notification settings/i)).toBeInTheDocument();
});

test('subscription row names the iPhone/iPad Home-Screen requirement', async () => {
  renderWithKainBain(<PushNotificationsSection />);
  expect(await screen.findByText(/Home Screen/i)).toBeInTheDocument();
});

test('scheduler-stall toggle defaults on and pages independently', async () => {
  renderWithKainBain(<PushNotificationsSection />);
  const stallToggle = await screen.findByLabelText(/Scheduler recovered stuck work/i);
  expect(stallToggle).toBeChecked();
  fireEvent.click(stallToggle);
  await waitFor(() =>
    expect(pushNotifications.updateSettings).toHaveBeenCalledWith({
      triggers: { queueEmpty: true, unrecoverableStageError: true, schedulerStall: false },
    }),
  );
});
