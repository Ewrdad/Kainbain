import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FleetCatalogueSection, formatFleetAge } from './FleetCatalogueSection';
import {
  WP_C_FIXTURE_NOW_MS,
  wpCCatalogue,
} from '../../services/fleetModelOptions/__fixtures__/wpCFleetCatalogue';

/***
 * MARK: FleetCatalogueSection tests
 * @description Verifies the System Settings › Models fleet-catalogue admin
 *   view: table columns from the WP-C contract, permanent removal, the
 *   quarantine list, per-runner re-scan, and the loading/empty/error/admin
 *   states.
 */
const getFleetModelCatalog = vi.hoisted(() => vi.fn());
const deleteFleetCatalogueModel = vi.hoisted(() => vi.fn());
const deleteFleetQuarantinedModel = vi.hoisted(() => vi.fn());
const requestModelRediscovery = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: {
    getFleetModelCatalog,
    deleteFleetCatalogueModel,
    deleteFleetQuarantinedModel,
    requestModelRediscovery,
  },
}));

const rowById = (id) =>
  screen
    .getAllByTestId('fleet-catalogue-row')
    .find((row) => within(row).queryByText(id, { exact: true }));

beforeEach(() => {
  vi.clearAllMocks();
  getFleetModelCatalog.mockResolvedValue(wpCCatalogue());
  deleteFleetCatalogueModel.mockResolvedValue(undefined);
  deleteFleetQuarantinedModel.mockResolvedValue(undefined);
  requestModelRediscovery.mockResolvedValue(undefined);
});

describe('FleetCatalogueSection', () => {
  it('renders all contract columns from the fixture', async () => {
    render(<FleetCatalogueSection />);
    const rows = await screen.findAllByTestId('fleet-catalogue-row');
    expect(rows).toHaveLength(4);

    const spark = rowById('muse::meta::muse-spark-1.3');
    expect(within(spark).getByText('2 runners')).toBeInTheDocument();
    expect(within(spark).getByText('yes')).toBeInTheDocument();
    expect(within(spark).getByText(/box-a \(serving, discovery, .* ago\)/)).toBeInTheDocument();
    expect(within(spark).getByText(/box-b \(serving, discovery, .* ago\)/)).toBeInTheDocument();
    // Last-served age carries the exact timestamp as its tooltip.
    expect(
      within(spark).getByTitle(new Date(WP_C_FIXTURE_NOW_MS - 3600 * 1000).toISOString()),
    ).toBeInTheDocument();

    const single = rowById('pi::google::m1');
    expect(within(single).getByText('1 runner')).toBeInTheDocument();

    const retired = rowById('custom::acme::retired');
    expect(within(retired).getByText('0 runners')).toBeInTheDocument();
    expect(within(retired).getByText('no')).toBeInTheDocument();
    // The snapshot's unavailable verdict renders in ADMIN (never pickers),
    // with the snapshot reason as its tooltip; served rows carry no verdict.
    expect(within(retired).getByText('Unavailable')).toBeInTheDocument();
    expect(within(retired).getByTestId('fleet-catalogue-verdict')).toHaveAttribute(
      'title',
      '0 runners -- last served 3d ago by box-a',
    );
    expect(within(spark).queryByTestId('fleet-catalogue-verdict')).not.toBeInTheDocument();

    const unverified = rowById('muse::meta::unverified-9');
    expect(within(unverified).getByText('0 runners')).toBeInTheDocument();
    expect(within(unverified).getByText('local-alpha')).toBeInTheDocument();
    expect(within(unverified).getByText('local-alpha (declared)')).toBeInTheDocument();
    expect(within(unverified).getByText('never')).toBeInTheDocument();
  });

  it('renders the quarantine list with per-row remove', async () => {
    render(<FleetCatalogueSection />);
    const quarantine = await screen.findByTestId('fleet-quarantine-row');
    expect(within(quarantine).getByText('ollama-cloud-direct::gemma4:31b-cloud')).toBeInTheDocument();
    expect(within(quarantine).getByText(/not-harness-qualified/)).toBeInTheDocument();

    fireEvent.click(
      within(quarantine).getByRole('button', {
        name: 'Remove quarantined ollama-cloud-direct::gemma4:31b-cloud',
      }),
    );
    await waitFor(() =>
      expect(deleteFleetQuarantinedModel).toHaveBeenCalledWith(
        'ollama-cloud-direct::gemma4:31b-cloud',
      ),
    );
    // Removal refreshes the table (a re-advertised id reappears on update).
    await waitFor(() => expect(getFleetModelCatalog).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('fleet-catalogue-notice')).toHaveTextContent(
      'Removed ollama-cloud-direct::gemma4:31b-cloud permanently.',
    );
  });

  it('removes a model permanently and refreshes', async () => {
    render(<FleetCatalogueSection />);
    await screen.findAllByTestId('fleet-catalogue-row');
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove custom::acme::retired permanently' }),
    );
    await waitFor(() =>
      expect(deleteFleetCatalogueModel).toHaveBeenCalledWith('custom::acme::retired'),
    );
    await waitFor(() => expect(getFleetModelCatalog).toHaveBeenCalledTimes(2));
  });

  it('refreshes silently when removal answers 404 (already gone)', async () => {
    deleteFleetCatalogueModel.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));
    render(<FleetCatalogueSection />);
    await screen.findAllByTestId('fleet-catalogue-row');
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove custom::acme::retired permanently' }),
    );
    await waitFor(() => expect(getFleetModelCatalog).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('fleet-catalogue-error')).not.toBeInTheDocument();
  });

  it('keeps the last-good table with an error note when removal fails', async () => {
    deleteFleetCatalogueModel.mockRejectedValue(new Error('forbidden'));
    render(<FleetCatalogueSection />);
    await screen.findAllByTestId('fleet-catalogue-row');
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove custom::acme::retired permanently' }),
    );
    expect(await screen.findByTestId('fleet-catalogue-error')).toHaveTextContent('forbidden');
    // The table is still there — never a blank that reads as "no models".
    expect(screen.getAllByTestId('fleet-catalogue-row')).toHaveLength(4);
  });

  it('queues a per-runner re-scan with pending and notice states', async () => {
    let release;
    requestModelRediscovery.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<FleetCatalogueSection />);
    await screen.findAllByTestId('fleet-catalogue-row');
    fireEvent.click(screen.getAllByRole('button', { name: 'Re-scan box-a' })[0]);
    expect(screen.getAllByRole('button', { name: 'Re-scan box-a' })[0]).toHaveTextContent('Queuing…');
    release(undefined);
    await waitFor(() => expect(requestModelRediscovery).toHaveBeenCalledWith('box-a'));
    expect(await screen.findByTestId('fleet-catalogue-notice')).toHaveTextContent(
      'Re-scan queued — box-a will refresh on next heartbeat.',
    );
  });

  it('notes a failed re-scan without losing the table', async () => {
    requestModelRediscovery.mockRejectedValueOnce(new Error('runner offline'));
    render(<FleetCatalogueSection />);
    await screen.findAllByTestId('fleet-catalogue-row');
    fireEvent.click(screen.getAllByRole('button', { name: 'Re-scan box-a' })[0]);
    expect(await screen.findByTestId('fleet-catalogue-error')).toHaveTextContent('runner offline');
    expect(screen.getAllByTestId('fleet-catalogue-row')).toHaveLength(4);
  });

  it('hides destructive buttons for non-admins (re-scan stays)', async () => {
    render(<FleetCatalogueSection isAdmin={false} />);
    await screen.findAllByTestId('fleet-catalogue-row');
    expect(
      screen.queryByRole('button', { name: 'Remove custom::acme::retired permanently' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Remove quarantined ollama-cloud-direct::gemma4:31b-cloud',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('fleet-catalogue-admin-note')).toHaveTextContent(
      'needs the admin role',
    );
    // Re-scan is not destructive (open route): it stays.
    expect(screen.getAllByRole('button', { name: 'Re-scan box-a' }).length).toBeGreaterThan(0);
  });

  it('shows loading, then the table', async () => {
    let resolveCatalog;
    getFleetModelCatalog.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCatalog = resolve;
      }),
    );
    render(<FleetCatalogueSection />);
    expect(screen.getByTestId('fleet-catalogue-loading')).toBeInTheDocument();
    resolveCatalog(wpCCatalogue());
    expect(await screen.findAllByTestId('fleet-catalogue-row')).toHaveLength(4);
    expect(screen.queryByTestId('fleet-catalogue-loading')).not.toBeInTheDocument();
  });

  it('shows honest empty states for an empty catalogue', async () => {
    getFleetModelCatalog.mockResolvedValue({ models: [], harnesses: [], quarantined: [] });
    render(<FleetCatalogueSection />);
    expect(await screen.findByTestId('fleet-catalogue-empty')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-quarantine-empty')).toBeInTheDocument();
  });

  it('shows unavailable (never a blank table) when the fetch fails before load', async () => {
    getFleetModelCatalog.mockRejectedValueOnce(new Error('boom'));
    render(<FleetCatalogueSection />);
    expect(await screen.findByTestId('fleet-catalogue-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('fleet-catalogue-error')).toHaveTextContent('boom');
    expect(screen.queryByTestId('fleet-catalogue-empty')).not.toBeInTheDocument();
  });

  it('keeps the last-good table with an error note when a refresh fails', async () => {
    render(<FleetCatalogueSection />);
    await screen.findAllByTestId('fleet-catalogue-row');
    getFleetModelCatalog.mockRejectedValueOnce(new Error('flaky refresh'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByTestId('fleet-catalogue-error')).toHaveTextContent('flaky refresh');
    expect(screen.getAllByTestId('fleet-catalogue-row')).toHaveLength(4);
  });
});

describe('formatFleetAge', () => {
  const NOW = 1790000000000;
  it('formats ages and never-served', () => {
    expect(formatFleetAge(NOW - 30 * 1000, NOW)).toBe('just now');
    expect(formatFleetAge(NOW - 5 * 60 * 1000, NOW)).toBe('5m ago');
    expect(formatFleetAge(NOW - 3 * 3600 * 1000, NOW)).toBe('3h ago');
    expect(formatFleetAge(NOW - 2 * 86400 * 1000, NOW)).toBe('2d ago');
    expect(formatFleetAge(null, NOW)).toBe('never');
    expect(formatFleetAge(undefined, NOW)).toBe('never');
  });
});
