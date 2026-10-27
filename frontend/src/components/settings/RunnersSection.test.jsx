import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunnersSection } from './RunnersSection';

const getRunners = vi.hoisted(() => vi.fn());
const getRunnerMonitor = vi.hoisted(() => vi.fn());
const approveRunner = vi.hoisted(() => vi.fn());
const denyRunner = vi.hoisted(() => vi.fn());
const revokeRunner = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: { getRunners, getRunnerMonitor, approveRunner, denyRunner, revokeRunner },
}));

/***
 * MARK: RunnersSection Tests
 * @description Verifies the minimal Runner onboarding UI: honest
 *   loading/error/empty states, pending approve/deny, active revoke, and
 *   refetch after every mutation. Credentials never render.
 ***/
describe('RunnersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRunnerMonitor.mockResolvedValue({ liveAssignments: [] });
  });

  it('shows loading then the empty state when no Runners registered', async () => {
    getRunners.mockResolvedValue([]);
    render(<RunnersSection />);
    expect(screen.getByTestId('runners-section-loading')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('runners-section-empty')).toBeTruthy();
    });
  });

  it('shows an error with retry when the list fetch fails', async () => {
    getRunners.mockRejectedValueOnce(new Error('backend down'));
    render(<RunnersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runners-section-error')).toBeTruthy();
    });
    getRunners.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByTestId('runners-section-empty')).toBeTruthy();
    });
  });

  it('approves a pending Runner and refetches', async () => {
    getRunners
      .mockResolvedValueOnce([
        { runnerId: 'r1', status: 'pending', facts: {}, lastSeenAt: null },
      ])
      .mockResolvedValueOnce([
        { runnerId: 'r1', status: 'active', facts: {}, lastSeenAt: '2026-10-26T00:00:00.000Z' },
      ]);
    approveRunner.mockResolvedValue({ status: 'active' });
    render(<RunnersSection />);
    const approve = await screen.findByRole('button', { name: 'Approve runner r1' });
    fireEvent.click(approve);
    await waitFor(() => {
      expect(approveRunner).toHaveBeenCalledWith('r1');
      expect(getRunners).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByTestId('runner-status-r1')).toBeTruthy();
  });

  it('denies a pending Runner and revokes an active one', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'pending', facts: {}, lastSeenAt: null },
      { runnerId: 'r2', status: 'active', facts: {}, lastSeenAt: null },
    ]);
    denyRunner.mockResolvedValue({ status: 'denied' });
    revokeRunner.mockResolvedValue({ status: 'revoked' });
    render(<RunnersSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deny runner r1' }));
    await waitFor(() => {
      expect(denyRunner).toHaveBeenCalledWith('r1');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke runner r2' }));
    await waitFor(() => {
      expect(revokeRunner).toHaveBeenCalledWith('r2');
    });
  });

  it('shows the one-time credential after approve, exactly once', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'pending', facts: {}, lastSeenAt: null },
    ]);
    approveRunner.mockResolvedValue({ status: 'active', credential: 'ONE-TIME-1' });
    render(<RunnersSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve runner r1' }));
    await waitFor(() => {
      expect(screen.getByTestId('runner-credential-once')).toBeTruthy();
    });
    expect(screen.getByTestId('runner-credential-value').textContent).toBe('ONE-TIME-1');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss credential' }));
    await waitFor(() => {
      expect(screen.queryByTestId('runner-credential-once')).toBeNull();
    });
  });

  it('shows the live assignment under a running Runner', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'active', facts: {}, lastSeenAt: null },
      { runnerId: 'r2', status: 'active', facts: {}, lastSeenAt: null },
    ]);
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: 'r1', projectId: 'p1', taskId: 'abcdef12-3456', epoch: 1 }],
    });
    render(<RunnersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-assignment-r1').textContent).toContain('abcdef12');
    });
    expect(screen.queryByTestId('runner-assignment-r2')).toBeNull();
  });

  it('shows harness options and project scope per Runner', async () => {
    getRunners.mockResolvedValue([
      {
        runnerId: 'r1',
        status: 'active',
        facts: {},
        capabilities: { harnesses: [{ id: 'pi' }, { id: 'vibe' }] },
        projectScope: ['p1'],
        lastSeenAt: null,
      },
      { runnerId: 'r2', status: 'active', facts: {}, lastSeenAt: null },
    ]);
    render(<RunnersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-harnesses-r1').textContent).toContain('pi');
      expect(screen.getByTestId('runner-harnesses-r1').textContent).toContain('vibe');
    });
    expect(screen.getByTestId('runner-scope-r1').textContent).toContain('1 scoped');
    expect(screen.getByTestId('runner-scope-r2').textContent).toContain('all');
    expect(screen.queryByTestId('runner-harnesses-r2')).toBeNull();
  });

  it('shows scheduler deferral counts when the monitor reports them', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'active', facts: {}, lastSeenAt: null },
    ]);
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [],
      scheduler: { ticks: 41, dispatched: 3, deferredDispatch: 12, deferredTripped: 0, lastOutcome: 'deferred-runner-dispatch', lastDispatchAt: null },
    });
    render(<RunnersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-scheduler-deferrals').textContent).toContain('12 deferred to Runners');
    });
  });

  it('shows the Runner version for the fleet version matrix', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'active', facts: { versions: { runner: '0.3.0', protocol: 'v1' } }, lastSeenAt: null },
      { runnerId: 'r2', status: 'active', facts: {}, lastSeenAt: null },
    ]);
    render(<RunnersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-version-r1').textContent).toContain('0.3.0');
    });
    expect(screen.queryByTestId('runner-version-r2')).toBeNull();
  });

  it('hides assignments but keeps the list when the monitor is down', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'active', facts: {}, lastSeenAt: null },
    ]);
    getRunnerMonitor.mockRejectedValueOnce(new Error('monitor down'));
    render(<RunnersSection />);
    await screen.findByTestId('runners-section');
    expect(screen.queryByTestId('runner-assignment-r1')).toBeNull();
  });

  it('shows the credential issue time without the credential value', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'active', facts: {}, lastSeenAt: null, credentialIssuedAt: '2026-10-26T00:00:00.000Z' },
      { runnerId: 'r2', status: 'active', facts: {}, lastSeenAt: null },
    ]);
    render(<RunnersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-credential-age-r1')).toBeTruthy();
    });
    expect(screen.getByTestId('runner-credential-age-r1').title).toContain('2026-10-26');
    expect(screen.queryByTestId('runner-credential-age-r2')).toBeNull();
  });

  it('alerts when one Runner identity heartbeats from multiple origins', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'active', facts: {}, lastSeenAt: null, originConflicts: 2 },
      { runnerId: 'r2', status: 'active', facts: {}, lastSeenAt: null, originConflicts: 0 },
    ]);
    render(<RunnersSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-origin-alert-r1').textContent).toContain('origin ×3');
    });
    expect(screen.queryByTestId('runner-origin-alert-r2')).toBeNull();
  });

  it('never renders credential values', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'active', facts: {}, lastSeenAt: null, credential: 'SHOULD-NOT-RENDER' },
    ]);
    const { container } = render(<RunnersSection />);
    await screen.findByTestId('runners-section');
    expect(container.textContent).not.toContain('SHOULD-NOT-RENDER');
  });
});
