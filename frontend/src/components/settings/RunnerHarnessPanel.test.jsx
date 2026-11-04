import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RunnerHarnessPanel, summarizeHarnessAvailability } from './RunnerHarnessPanel';

const getHarnesses = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: { getHarnesses },
}));

describe('summarizeHarnessAvailability', () => {
  it('merges runner-advertised and backend-detected views', () => {
    const out = summarizeHarnessAvailability(
      [
        { runnerId: 'r1', capabilities: { harnesses: [{ id: 'pi', version: '1.2.3' }] } },
        { runnerId: 'r2', capabilities: { harnesses: [{ id: 'pi' }, { id: 'vibe', version: 'unknown' }] } },
        { runnerId: 'r3', capabilities: null },
      ],
      [
        { id: 'pi', name: 'Pi', available: true, binPath: '/usr/bin/pi' },
        { id: 'muse', name: 'Muse', available: false, hint: 'Install the muse CLI' },
        { id: 'mock', name: 'Mock', available: true, testOnly: true },
      ],
    );
    expect(out.runnerTools).toEqual([
      { id: 'pi', version: '1.2.3', runnerIds: ['r1', 'r2'] },
      { id: 'vibe', version: null, runnerIds: ['r2'] },
    ]);
    expect(out.backendDetected.map((h) => h.id)).toEqual(['pi']);
    expect(out.backendMissing.map((h) => h.id)).toEqual(['muse']);
  });

  it('tolerates malformed input', () => {
    expect(summarizeHarnessAvailability(null, null)).toEqual({
      runnerTools: [],
      backendDetected: [],
      backendMissing: [],
    });
  });
});

describe('RunnerHarnessPanel', () => {
  it('shows runner CLIs plus backend detection with install hints', async () => {
    getHarnesses.mockResolvedValue({
      harnesses: [
        { id: 'pi', name: 'Pi', available: true, binPath: '/usr/bin/pi' },
        { id: 'muse', name: 'Muse', available: false, hint: 'Install the muse CLI' },
      ],
    });
    render(
      <RunnerHarnessPanel
        runners={[{ runnerId: 'r1', capabilities: { harnesses: [{ id: 'pi', version: '9.9' }] } }]}
      />,
    );
    expect(screen.getByTestId('runner-harness-panel')).toBeInTheDocument();
    expect(screen.getByText(/pi 9\.9/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('backend-harness-list')).toBeInTheDocument());
    expect(screen.getByText('/usr/bin/pi', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Install the muse CLI/)).toBeInTheDocument();
  });

  it('explains the empty state and survives a failed catalogue fetch', async () => {
    getHarnesses.mockRejectedValue(new Error('down'));
    render(<RunnerHarnessPanel runners={[]} />);
    expect(screen.getByTestId('runner-harness-none')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/Checking this backend host/)).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId('backend-harness-list')).not.toBeInTheDocument();
  });
});
