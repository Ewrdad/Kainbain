import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccessibilityReportDialog } from './AccessibilityReportDialog';
import { api } from '../../services/api';
import { assertDialogLabelled } from '../../a11y/a11yTestHelpers';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    submitAccessibilityFeedback: vi.fn(),
  },
}));

/***
 * MARK: AccessibilityReportDialog tests
 * @description Verifies the report-a-problem form: labelled fields, client
 *   validation with fix suggestions, the 201 confirmation state with its
 *   reference, server-driven field errors, the mailto fallback on failure,
 *   single-flight submit, Ctrl+Enter, and cancel.
 ***/

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(props = {}) {
  const onClose = vi.fn();
  render(
    <AccessibilityReportDialog contactEmail="team@example.com" onClose={onClose} {...props} />,
  );
  return { onClose };
}

test('renders a labelled dialog with named fields', () => {
  renderDialog();
  const dialog = screen.getByRole('dialog');
  assertDialogLabelled(dialog);
  expect(screen.getByLabelText(/What happened/)).toBeInTheDocument();
  expect(screen.getByLabelText(/trying to do/)).toBeInTheDocument();
  expect(screen.getByLabelText(/reach you/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Which page/)).toBeInTheDocument();
});

test('empty submit shows a named error with a fix and never calls the API', () => {
  renderDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  const error = screen.getByRole('alert');
  expect(error.textContent).toMatch(/Describe the problem/);
  expect(error.textContent).toMatch(/which page/);
  expect(screen.getByLabelText(/What happened/)).toHaveAttribute(
    'aria-describedby',
    'a11y-report-message-error',
  );
  expect(api.submitAccessibilityFeedback).not.toHaveBeenCalled();
});

test('successful submit shows a confirmation with the reference', async () => {
  api.submitAccessibilityFeedback.mockResolvedValue({
    received: true,
    id: 'abc12345-0000-0000-0000-000000000000',
    inbox: '',
  });
  renderDialog();
  fireEvent.change(screen.getByLabelText(/What happened/), {
    target: { value: '  Focus jumps to the top after I save.  ' },
  });
  fireEvent.change(screen.getByLabelText(/trying to do/), { target: { value: 'getting-around' } });
  fireEvent.change(screen.getByLabelText(/Which page/), { target: { value: '#/observability' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  expect(await screen.findByText('Report received — thank you')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(/abc12345/);
  expect(api.submitAccessibilityFeedback).toHaveBeenCalledWith({
    message: 'Focus jumps to the top after I save.',
    needGroup: 'getting-around',
    contact: null,
    pageUrl: '#/observability',
  });
  // Confirmation takes focus for screen-reader users.
  expect(screen.getByText('Report received — thank you')).toHaveFocus();
});

test('server rejections land on the fields with fix suggestions', async () => {
  const failure = new Error('API 400 on /accessibility/feedback');
  failure.status = 400;
  failure.body = JSON.stringify({
    error: 'fix',
    code: 'invalid_report',
    errors: [{ field: 'needGroup', message: 'Pick one of the listed areas.', fix: 'Leave it blank.' }],
  });
  api.submitAccessibilityFeedback.mockRejectedValue(failure);
  renderDialog();
  fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Something broke.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  expect(await screen.findByText(/Pick one of the listed areas/)).toBeInTheDocument();
  // The draft survives the rejection.
  expect(screen.getByLabelText(/What happened/)).toHaveValue('Something broke.');
});

test('unreachable endpoint keeps the draft and offers the email fallback', async () => {
  api.submitAccessibilityFeedback.mockRejectedValue(new Error('Network down'));
  renderDialog();
  fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'My barrier words.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  const alert = await screen.findByText(/could not be sent/);
  expect(alert).toHaveAttribute('role', 'alert');
  const fallback = screen.getByRole('link', { name: /email the website team instead/ });
  expect(fallback.getAttribute('href')).toMatch(/^mailto:team@example\.com\?/);
  expect(decodeURIComponent(fallback.getAttribute('href'))).toContain('My barrier words.');
  expect(screen.getByLabelText(/What happened/)).toHaveValue('My barrier words.');
});

test('unreachable endpoint without a configured inbox shows no mailto link', async () => {
  api.submitAccessibilityFeedback.mockRejectedValue(new Error('Network down'));
  renderDialog({ contactEmail: '' });
  fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'My barrier words.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
  await screen.findByText(/could not be sent/);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('double submit sends exactly one request (single-flight)', async () => {
  let release;
  api.submitAccessibilityFeedback.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  renderDialog();
  fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Barrier.' } });
  const send = screen.getByRole('button', { name: 'Send report' });
  fireEvent.click(send);
  // The second click lands while the first request is still in flight (the
  // button now reads Sending); the single-flight guard must swallow it.
  fireEvent.click(send);
  expect(api.submitAccessibilityFeedback).toHaveBeenCalledTimes(1);
  release({ received: true, id: 'x', inbox: '' });
  expect(await screen.findByText('Report received — thank you')).toBeInTheDocument();
});

test('Ctrl+Enter sends the report from the composer', async () => {
  api.submitAccessibilityFeedback.mockResolvedValue({ received: true, id: 'x', inbox: '' });
  renderDialog();
  fireEvent.change(screen.getByLabelText(/What happened/), { target: { value: 'Barrier.' } });
  fireEvent.keyDown(screen.getByLabelText(/What happened/), { key: 'Enter', ctrlKey: true });
  expect(await screen.findByText('Report received — thank you')).toBeInTheDocument();
  expect(api.submitAccessibilityFeedback).toHaveBeenCalledTimes(1);
});

test('cancel closes without sending', () => {
  const { onClose } = renderDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(api.submitAccessibilityFeedback).not.toHaveBeenCalled();
});
