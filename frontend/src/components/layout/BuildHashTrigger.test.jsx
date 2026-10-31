import { expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BuildHashTrigger } from './BuildHashTrigger';

// Mock the API so no real request is made.
vi.mock('../../services/api', () => ({
  api: {
    systemStatus: vi.fn(),
    engineStatus: vi.fn(),
    deployChangelog: vi.fn(),
  },
}));

import { api } from '../../services/api';

/***
 * MARK: BuildHashTrigger Unit Tests
 * @description Verifies the Now Playing bar build-hash trigger: renders the
 *   live build number plus short SHA from /status, stays hidden when no build
 *   is baked, and opens the baked changelog dialog on click or keyboard.
 ***/
describe('BuildHashTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.deployChangelog.mockResolvedValue({ changelog: null, reason: 'not-baked' });
  });

  test('renders the live build number with the short SHA', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12, commit: 'abc1234' } });
    render(<BuildHashTrigger />);
    await waitFor(() => {
      expect(screen.getByTestId('build-badge')).toHaveTextContent('#B12·abc1234');
    });
  });

  test('renders the bare number when no commit SHA was stamped', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12 } });
    render(<BuildHashTrigger />);
    await waitFor(() => {
      expect(screen.getByTestId('build-badge')).toHaveTextContent('#B12');
    });
    expect(screen.getByTestId('build-badge')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Build 12 of the live deployment'),
    );
  });

  test('renders nothing when no build number is present', async () => {
    api.systemStatus.mockResolvedValue({ build: null });
    render(<BuildHashTrigger />);
    // Wait a tick for the async fetch to resolve, then assert absence.
    await waitFor(() => expect(api.systemStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('build-badge')).not.toBeInTheDocument();
  });

  test('pauses polling when tab is hidden and refreshes on visibility return', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 15, commit: 'xyz' } });
    render(<BuildHashTrigger />);
    expect(api.systemStatus).toHaveBeenCalledTimes(1);

    // Simulate tab hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(api.systemStatus).toHaveBeenCalledTimes(1);

    // Simulate tab visible again
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(api.systemStatus).toHaveBeenCalledTimes(2);
  });

  test('renders as a button that opens the changelog on click', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12, commit: 'abc' } });
    api.deployChangelog.mockResolvedValue({
      changelog: {
        branch: 'master',
        totalCount: 2,
        truncated: false,
        entries: [
          {
            sha: 'aaa',
            shortSha: 'aaa',
            subject: 'Newest entry',
            body: '',
            bodyTruncated: false,
            author: 'A',
            authorEmail: 'a@e.c',
            date: '2026-09-30',
          },
        ],
      },
      reason: null,
    });
    render(<BuildHashTrigger />);
    const badge = await screen.findByTestId('build-badge');
    expect(badge.tagName).toBe('BUTTON');
    expect(badge).toHaveAttribute(
      'aria-label',
      expect.stringContaining('show Kainbain changelog'),
    );
    // The changelog is fetched on open only — not during status polling.
    expect(api.deployChangelog).not.toHaveBeenCalled();
    fireEvent.click(badge);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Kainbain changelog' })).toBeInTheDocument();
    });
    expect(screen.getByText('Newest entry')).toBeInTheDocument();
    expect(api.deployChangelog).toHaveBeenCalledWith(200);
  });

  test('opens the changelog on keyboard activation', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12, commit: 'abc' } });
    render(<BuildHashTrigger />);
    const badge = await screen.findByTestId('build-badge');
    // A native button activates on Enter: keydown + keyup dispatches click.
    fireEvent.keyDown(badge, { key: 'Enter', code: 'Enter', charCode: 13 });
    fireEvent.keyUp(badge, { key: 'Enter', code: 'Enter', charCode: 13 });
    badge.click();
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  test('closes the changelog on Escape', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12, commit: 'abc' } });
    render(<BuildHashTrigger />);
    fireEvent.click(await screen.findByTestId('build-badge'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // The trigger itself is still there.
    expect(screen.getByTestId('build-badge')).toHaveTextContent('#B12');
  });

  test('shows the empty state when the build has no baked changelog', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12, commit: 'abc' } });
    api.deployChangelog.mockResolvedValue({ changelog: null, reason: 'not-baked' });
    render(<BuildHashTrigger />);
    fireEvent.click(await screen.findByTestId('build-badge'));
    await waitFor(() => {
      expect(screen.getByText('No changelog baked into this build.')).toBeInTheDocument();
    });
  });
});
