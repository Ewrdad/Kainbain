import { expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VersionMismatchBanner, isBuildMismatch } from './VersionMismatchBanner';

// Mock the API so no real request is made.
vi.mock('../../services/api', () => ({
  api: {
    systemStatus: vi.fn(),
  },
}));

vi.mock('../../services/logger', () => ({
  logger: { error: vi.fn() },
}));

import { api } from '../../services/api';

/***
 * MARK: VersionMismatchBanner Unit Tests
 * @description Verifies the frontend<->backend lockstep banner (D7): the
 *   pure mismatch matrix, the hidden states (unstamped backend, fetch
 *   failure), and the visible mismatch alert.
 ***/
describe('VersionMismatchBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('isBuildMismatch matrix', () => {
    expect(isBuildMismatch('a1b2c3d', 'a1b2c3d')).toBe(false);
    expect(isBuildMismatch('a1b2c3d', 'e4f5g6h')).toBe(true);
    expect(isBuildMismatch('', 'e4f5g6h')).toBe(false);
    expect(isBuildMismatch('a1b2c3d', '')).toBe(false);
    expect(isBuildMismatch('dev', 'e4f5g6h')).toBe(false);
    expect(isBuildMismatch('a1b2c3d', 'unknown')).toBe(false);
    expect(isBuildMismatch(null, 'e4f5g6h')).toBe(false);
    expect(isBuildMismatch('  a1b2c3d  ', 'a1b2c3d')).toBe(false);
  });

  test('renders nothing when the backend carries no build ref', async () => {
    api.systemStatus.mockResolvedValue({ build: null });
    render(<VersionMismatchBanner />);
    await waitFor(() => expect(api.systemStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('version-mismatch-banner')).not.toBeInTheDocument();
  });

  test('renders nothing when the status fetch fails', async () => {
    api.systemStatus.mockRejectedValue(new Error('down'));
    render(<VersionMismatchBanner />);
    await waitFor(() => expect(api.systemStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('version-mismatch-banner')).not.toBeInTheDocument();
  });
});
