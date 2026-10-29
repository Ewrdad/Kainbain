import { expect, test, vi, beforeEach } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VersionMismatchBanner, isBuildMismatch, isApiMismatch, satisfiesRange } from './VersionMismatchBanner';

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

  test('isApiMismatch / satisfiesRange matrix', () => {
    expect(satisfiesRange('1.2.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfiesRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    expect(isApiMismatch('>=1.0.0 <2.0.0', '2.0.0')).toBe(true);
    expect(isApiMismatch('>=1.0.0 <2.0.0', '1.0.0')).toBe(false);
    expect(isApiMismatch('', '2.0.0')).toBe(false);
    expect(isApiMismatch('>=1.0.0 <2.0.0', '')).toBe(false);
    expect(isApiMismatch(null, null)).toBe(false);
    expect(isApiMismatch('>=1.0.0 <2.0.0', 'not-a-version')).toBe(false);
  });

  test('renders nothing when the backend carries no build ref', async () => {
    api.systemStatus.mockResolvedValue({ build: null });
    render(<VersionMismatchBanner />);
    await waitFor(() => expect(api.systemStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('version-mismatch-banner')).not.toBeInTheDocument();
  });

  test('shows the banner naming both versions when the backend is out of range', async () => {
    vi.stubEnv('VITE_BACKEND_API_RANGE', '>=1.0.0 <2.0.0');
    try {
      api.systemStatus.mockResolvedValue({ build: { apiVersion: '2.0.0', commit: 'abc' } });
      render(<VersionMismatchBanner />);
      const banner = await screen.findByTestId('version-mismatch-banner');
      expect(banner.textContent).toContain('>=1.0.0 <2.0.0');
      expect(banner.textContent).toContain('2.0.0');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test('renders nothing when the status fetch fails', async () => {
    api.systemStatus.mockRejectedValue(new Error('down'));
    render(<VersionMismatchBanner />);
    await waitFor(() => expect(api.systemStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('version-mismatch-banner')).not.toBeInTheDocument();
  });
});
