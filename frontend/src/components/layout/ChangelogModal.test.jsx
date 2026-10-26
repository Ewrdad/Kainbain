import { expect, test, vi, beforeEach, describe } from 'vitest';
import { screen, waitFor, fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChangelogModal } from './ChangelogModal';

vi.mock('../../services/api', () => ({
  api: {
    deployChangelog: vi.fn(),
  },
}));

vi.mock('../../context/KainBainContext', () => ({
  useKainBain: () => ({ setView: vi.fn() }),
}));

import { api } from '../../services/api';

/***
 * MARK: ChangelogModal Unit Tests
 * @description Verifies the baked-changelog dialog: loading/list/empty/error
 *   states, body expansion, capped initial render with "Show more", and that
 *   untrusted commit text renders as text (never HTML).
 ***/
describe('ChangelogModal', () => {
  const entry = (overrides = {}) => ({
    sha: 'aaa111',
    shortSha: 'aaa111',
    subject: 'Fix the thing',
    body: '',
    bodyTruncated: false,
    author: 'Dev A',
    authorEmail: 'a@example.com',
    date: '2026-09-30T08:00:00+01:00',
    ...overrides,
  });

  const baked = (entries) => ({
    changelog: {
      generatedAt: '2026-09-30T08:00:00Z',
      branch: 'master',
      commit: 'aaa111',
      totalCount: 537,
      truncated: true,
      limit: 200,
      entries,
    },
    reason: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows loading then the entry list newest-first', async () => {
    api.deployChangelog.mockResolvedValue(
      baked([
        entry({ subject: 'Newest' }),
        entry({
          sha: 'bbb',
          shortSha: 'bbb',
          subject: 'Oldest',
          author: 'Dev B',
          authorEmail: 'b@example.com',
          date: '2026-09-29T08:00:00+01:00',
        }),
      ]),
    );
    render(<ChangelogModal buildNumber={12} onClose={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading changelog');
    await waitFor(() => {
      expect(screen.getByText('Newest')).toBeInTheDocument();
    });
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Newest');
    expect(items[1]).toHaveTextContent('Oldest');
    expect(screen.getByText('aaa111')).toHaveAttribute('title', 'aaa111');
    expect(screen.getByText('Dev A')).toBeInTheDocument();
    expect(screen.getByText('2026-09-30')).toBeInTheDocument();
    expect(api.deployChangelog).toHaveBeenCalledWith(200);
  });

  test('shows the build and branch in the heading', async () => {
    api.deployChangelog.mockResolvedValue(baked([entry()]));
    render(<ChangelogModal buildNumber={12} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Fix the thing')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Kainbain changelog' })).toBeInTheDocument();
    expect(screen.getByText(/#B12/)).toHaveTextContent('branch master');
  });

  test('shows an explicit empty state when no changelog was baked', async () => {
    api.deployChangelog.mockResolvedValue({ changelog: null, reason: 'not-baked' });
    render(<ChangelogModal buildNumber={12} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('No changelog baked into this build.')).toBeInTheDocument();
    });
  });

  test('shows a distinct state when generation failed', async () => {
    api.deployChangelog.mockResolvedValue({
      changelog: null,
      reason: 'generation-failed',
      detail: 'git log failed: boom',
    });
    render(<ChangelogModal buildNumber={12} onClose={() => {}} />);
    await waitFor(() => {
      expect(
        screen.getByText('Changelog generation failed during this deploy.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('git log failed: boom')).toBeInTheDocument();
  });

  test('shows an error with retry that reloads the list', async () => {
    api.deployChangelog
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(baked([entry()]));
    render(<ChangelogModal buildNumber={12} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load the changelog.');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('Fix the thing')).toBeInTheDocument();
    });
    expect(api.deployChangelog).toHaveBeenCalledTimes(2);
  });

  test('expands the full message on Show details', async () => {
    api.deployChangelog.mockResolvedValue(
      baked([entry({ body: 'Line one\nLine two', bodyTruncated: true })]),
    );
    render(<ChangelogModal buildNumber={12} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Fix the thing')).toBeInTheDocument());
    expect(screen.queryByText(/Line one/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText(/Line one/)).toBeInTheDocument();
    expect(screen.getByText(/Line one/).textContent).toContain('…');
    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    expect(screen.queryByText(/Line one/)).not.toBeInTheDocument();
  });

  test('caps the initial render and reveals the rest via Show more', async () => {
    const entries = Array.from({ length: 150 }, (_, i) =>
      entry({ sha: `sha-${i}`, shortSha: `s${i}`, subject: `Commit ${i}` }),
    );
    api.deployChangelog.mockResolvedValue(baked(entries));
    render(<ChangelogModal buildNumber={12} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Commit 0')).toBeInTheDocument());
    expect(screen.getAllByRole('listitem')).toHaveLength(100);
    const more = screen.getByRole('button', { name: /Show more \(50 remaining\)/ });
    fireEvent.click(more);
    expect(screen.getAllByRole('listitem')).toHaveLength(150);
    expect(screen.getByText('Commit 149')).toBeInTheDocument();
  });

  test('renders commit text as text, never HTML', async () => {
    api.deployChangelog.mockResolvedValue(
      baked([
        entry({
          subject: '<img src=x onerror=alert(1)>',
          body: '<script>alert("body")</script>',
        }),
      ]),
    );
    const { container } = render(<ChangelogModal buildNumber={12} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText('<script>alert("body")</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  test('Close button calls onClose', async () => {
    api.deployChangelog.mockResolvedValue(baked([entry()]));
    const onClose = vi.fn();
    render(<ChangelogModal buildNumber={12} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('Fix the thing')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Close changelog' }));
    expect(onClose).toHaveBeenCalled();
  });
});
