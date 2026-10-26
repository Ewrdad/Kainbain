import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunnersSection } from './RunnersSection';

const getRunners = vi.hoisted(() => vi.fn());
const approveRunner = vi.hoisted(() => vi.fn());
const denyRunner = vi.hoisted(() => vi.fn());
const revokeRunner = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: { getRunners, approveRunner, denyRunner, revokeRunner },
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

  it('never renders credential values', async () => {
    getRunners.mockResolvedValue([
      { runnerId: 'r1', status: 'active', facts: {}, lastSeenAt: null, credential: 'SHOULD-NOT-RENDER' },
    ]);
    const { container } = render(<RunnersSection />);
    await screen.findByTestId('runners-section');
    expect(container.textContent).not.toContain('SHOULD-NOT-RENDER');
  });
});
