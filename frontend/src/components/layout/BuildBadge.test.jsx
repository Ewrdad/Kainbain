import { expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BuildBadge } from './BuildBadge';

// Mock the API so no real request is made.
vi.mock('../../services/api', () => ({
  api: {
    systemStatus: vi.fn(),
    engineStatus: vi.fn(),
    deployChangelog: vi.fn(),
  },
}));

vi.mock('../../context/KainBainContext', () => ({
  useKainBain: () => ({ setView: vi.fn() }),
}));

import { api } from '../../services/api';

/***
 * MARK: BuildBadge Unit Tests
 * @description Verifies the header build badge renders the live build number
 *   from /status, stays hidden when none is available, and opens the baked
 *   changelog dialog on click.
 ***/
describe('BuildBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.deployChangelog.mockResolvedValue({ changelog: null, reason: 'not-baked' });
  });

  test('renders the live build number', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12, commit: 'abc' } });
    render(<BuildBadge />);
    await waitFor(() => {
      expect(screen.getByTestId('build-badge')).toHaveTextContent('#B12');
    });
  });

  test('renders nothing when no build number is present', async () => {
    api.systemStatus.mockResolvedValue({ build: null });
    render(<BuildBadge />);
    // Wait a tick for the async fetch to resolve, then assert absence.
    await waitFor(() => expect(api.systemStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('build-badge')).not.toBeInTheDocument();
  });

  test('pauses polling when tab is hidden and refreshes on visibility return', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 15, commit: 'xyz' } });
    render(<BuildBadge />);
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
    render(<BuildBadge />);
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

  test('closes the changelog on Escape', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12, commit: 'abc' } });
    render(<BuildBadge />);
    fireEvent.click(await screen.findByTestId('build-badge'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // The badge itself is still there.
    expect(screen.getByTestId('build-badge')).toHaveTextContent('#B12');
  });

  test('shows the empty state when the build has no baked changelog', async () => {
    api.systemStatus.mockResolvedValue({ build: { buildNumber: 12, commit: 'abc' } });
    api.deployChangelog.mockResolvedValue({ changelog: null, reason: 'not-baked' });
    render(<BuildBadge />);
    fireEvent.click(await screen.findByTestId('build-badge'));
    await waitFor(() => {
      expect(screen.getByText('No changelog baked into this build.')).toBeInTheDocument();
    });
  });
});
