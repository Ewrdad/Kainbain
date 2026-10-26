import React, { useState } from 'react';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { HarnessSection } from './HarnessSection';
import { useHarnessPrefs } from '../../hooks/useHarnessPrefs';
import { HARNESS_PREFS_KEY } from '../../services/harnessPrefs';
import '@testing-library/jest-dom';

/**
 * MARK: HarnessSection tests
 * @description Black-box coverage for the System Settings › Harness tab: rows
 *   render from the backend registry (never hardcoded), toggles persist,
 *   manual-off survives re-probes, unknown prefs ids are ignored, missing
 *   prefs default to all-enabled, and the default-harness selector only
 *   offers enabled harnesses while still displaying a stale default as
 *   disabled. The api module is mocked; the prefs hook is real so
 *   localStorage persistence is asserted for real.
 */

const HARNESS_PAYLOAD = vi.hoisted(() => ({
  harnesses: [
    {
      id: 'pi',
      name: 'pi coding agent',
      description: 'pi-backed AgentHarness.',
      capabilities: { createSession: true, listModels: true },
      modelSelection: 'list',
      modelFlag: null,
      isDefault: true,
      supportTier: '1',
      supportTierLabel: 'Tier 1',
      supportTierSummary: 'Direct integration in KainBain',
      testOnly: false,
      available: null,
      detectionSource: 'unknown',
    },
    {
      id: 'custom',
      name: 'Custom command',
      description: 'Runs a project-configured command line.',
      capabilities: { createSession: true, listModels: false },
      modelSelection: 'none',
      modelFlag: null,
      isDefault: false,
      supportTier: '3',
      supportTierLabel: 'Tier 3',
      supportTierSummary: 'Exec / -p functionality',
      testOnly: false,
      available: null,
      detectionSource: 'unknown',
    },
    {
      id: 'antigravity',
      name: 'Antigravity',
      description: 'Google Antigravity agy CLI harness.',
      capabilities: { createSession: true, listModels: true },
      modelSelection: 'list',
      modelFlag: null,
      isDefault: false,
      supportTier: '3',
      supportTierLabel: 'Tier 3',
      supportTierSummary: 'Exec / -p functionality',
      testOnly: false,
      available: null,
      detectionSource: 'unknown',
    },
    {
      id: 'opencode',
      name: 'OpenCode server',
      description: 'OpenCode server harness.',
      capabilities: { createSession: true, listModels: true },
      modelSelection: 'list',
      modelFlag: null,
      isDefault: false,
      supportTier: '2',
      supportTierLabel: 'Tier 2',
      supportTierSummary: 'ACP / programmatic invocation',
      testOnly: false,
      available: null,
      detectionSource: 'unknown',
    },
    {
      id: 'muse',
      name: 'Muse Code',
      description: 'Muse Code CLI harness.',
      capabilities: { createSession: true, listModels: false },
      modelSelection: 'none',
      modelFlag: null,
      isDefault: false,
      supportTier: '3',
      supportTierLabel: 'Tier 3',
      supportTierSummary: 'Exec / -p functionality',
      testOnly: false,
      available: null,
      detectionSource: 'unknown',
    },
  ],
}));

const getHarnesses = vi.hoisted(() => vi.fn());
const getHarnessModels = vi.hoisted(() => vi.fn());
const getHarnessReliability = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: { getHarnesses, getHarnessModels, getHarnessReliability },
}));

/***
 * MARK: HarnessTestBed
 * @description Real prefs hook (real localStorage persistence) around the
 *   section, with a local draft like the settings content owns.
 ***/
function HarnessTestBed({
  defaultHarness = 'pi',
  onModelsRefresh,
  modelsRefreshing,
  modelRefreshRuntimeValue,
}) {
  const { prefs, updatePref, resetPrefs } = useHarnessPrefs();
  const [draft, setDraft] = useState({
    defaultHarness,
    stageTimeoutSecs: 600,
    allowPermissionBypass: false,
  });
  const update = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  return (
    <HarnessSection
      draft={draft}
      update={update}
      inputClass=""
      toggleClass=""
      prefs={prefs}
      updatePref={updatePref}
      resetPrefs={resetPrefs}
      onModelsRefresh={onModelsRefresh}
      modelsRefreshing={modelsRefreshing}
      modelRefreshRuntimeValue={modelRefreshRuntimeValue}
    />
  );
}

function storedPrefs() {
  const raw = window.localStorage.getItem(HARNESS_PREFS_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  window.localStorage.clear();
  getHarnesses.mockReset();
  getHarnessModels.mockReset();
  getHarnessReliability.mockReset();
  getHarnesses.mockResolvedValue(HARNESS_PAYLOAD);
  getHarnessModels.mockResolvedValue({ models: [] });
  getHarnessReliability.mockResolvedValue({ reliability: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('renders one row per harness from the registry payload (no hardcoded list)', async () => {
  renderWithKainBain(<HarnessTestBed />);

  for (const harness of HARNESS_PAYLOAD.harnesses) {
    expect(await screen.findByTestId(`harness-row-${harness.id}`)).toBeInTheDocument();
  }
  expect(screen.getByTestId('harness-list').children).toHaveLength(5);
});

test('a newly registered harness appears with zero UI code', async () => {
  getHarnesses.mockResolvedValue({
    harnesses: [
      ...HARNESS_PAYLOAD.harnesses,
      { id: 'future', name: 'Future harness', modelSelection: 'list', isDefault: false },
      { id: 'other', name: 'Other harness', modelSelection: 'list', isDefault: false },
    ],
  });
  renderWithKainBain(<HarnessTestBed />);

  expect(await screen.findByTestId('harness-row-future')).toBeInTheDocument();
  expect(await screen.findByTestId('harness-row-other')).toBeInTheDocument();
  expect(screen.getByTestId('harness-list').children).toHaveLength(7);
});

test('renders the backend support-tier label per harness row', async () => {
  renderWithKainBain(<HarnessTestBed />);

  for (const harness of HARNESS_PAYLOAD.harnesses) {
    const badge = await screen.findByTestId(`harness-tier-${harness.id}`);
    // The wording arrives from GET /harnesses — never a per-harness frontend map.
    expect(badge).toHaveTextContent(harness.supportTierLabel);
    expect(badge).toHaveAttribute('title', harness.supportTierSummary);
    expect(badge).not.toHaveTextContent('test-only');
  }
});

test('an unknown/absent tier degrades to no tier badge, never a fabricated one', async () => {
  getHarnesses.mockResolvedValue({
    harnesses: [
      ...HARNESS_PAYLOAD.harnesses,
      { id: 'future', name: 'Future harness', modelSelection: 'list', isDefault: false },
    ],
  });
  renderWithKainBain(<HarnessTestBed />);

  await screen.findByTestId('harness-row-future');
  expect(screen.queryByTestId('harness-tier-future')).not.toBeInTheDocument();
  // Known harnesses still label honestly alongside the unknown one.
  expect(await screen.findByTestId('harness-tier-pi')).toHaveTextContent('Tier 1');
});

test('marks a test-only harness so it cannot be mistaken for real support', async () => {
  getHarnesses.mockResolvedValue({
    harnesses: [
      ...HARNESS_PAYLOAD.harnesses,
      {
        id: 'mock',
        name: 'Mock',
        modelSelection: 'list',
        isDefault: false,
        supportTier: '1',
        supportTierLabel: 'Tier 1',
        supportTierSummary: 'Direct integration in KainBain',
        testOnly: true,
      },
    ],
  });
  renderWithKainBain(<HarnessTestBed />);

  const badge = await screen.findByTestId('harness-tier-mock');
  expect(badge).toHaveTextContent('Tier 1');
  expect(badge).toHaveTextContent('test-only');
});

test('shows a support-tier legend tying the labels to the tiers doc', async () => {
  renderWithKainBain(<HarnessTestBed />);

  const legend = await screen.findByTestId('harness-tier-legend');
  expect(legend).toHaveTextContent(/integration depth, not model quality/i);
  expect(legend).toHaveTextContent('HarnessSupportTeirs.md');
});

test('Enabled toggle flips prefs and persists them', async () => {
  renderWithKainBain(<HarnessTestBed />);
  const row = await screen.findByTestId('harness-row-antigravity');

  fireEvent.click(within(row).getByLabelText('Enable Antigravity harness'));

  await waitFor(() => {
    expect(storedPrefs()).toEqual({
      antigravity: { enabled: false, autoDetect: true },
    });
  });
  expect(within(row).getByTestId('harness-status-antigravity')).toHaveTextContent('Disabled');
});

test('manual-off survives a re-probe that reports available', async () => {
  renderWithKainBain(<HarnessTestBed />);
  const row = await screen.findByTestId('harness-row-pi');

  // Explicit off first.
  fireEvent.click(within(row).getByLabelText('Enable pi coding agent harness'));
  await waitFor(() => expect(storedPrefs()?.pi?.enabled).toBe(false));

  // The probe now reports models (available) — prefs must not flip back.
  getHarnessModels.mockResolvedValue({ models: [{ id: 'm', provider: 'p' }] });
  fireEvent.click(within(row).getByLabelText('Refresh pi coding agent availability'));

  await waitFor(() =>
    expect(within(row).getByLabelText('Refresh pi coding agent availability')).toHaveTextContent(
      'Refresh',
    ),
  );
  expect(storedPrefs()?.pi?.enabled).toBe(false);
  expect(within(row).getByTestId('harness-status-pi')).toHaveTextContent('Disabled');
});

test('unknown-id prefs entries are ignored and missing prefs show all enabled', async () => {
  window.localStorage.setItem(
    HARNESS_PREFS_KEY,
    JSON.stringify({ 'no-such-harness': { enabled: false, autoDetect: false } }),
  );
  renderWithKainBain(<HarnessTestBed />);

  for (const harness of HARNESS_PAYLOAD.harnesses) {
    const row = await screen.findByTestId(`harness-row-${harness.id}`);
    expect(
      within(row).getByLabelText(`Enable ${harness.name} harness`),
    ).toBeChecked();
  }
  const select = screen.getByLabelText('Default harness');
  expect(within(select).getAllByRole('option')).toHaveLength(5);
});

test('default-harness selector excludes disabled harnesses but keeps a stale default visible as disabled', async () => {
  renderWithKainBain(<HarnessTestBed defaultHarness="antigravity" />);
  const row = await screen.findByTestId('harness-row-antigravity');

  fireEvent.click(within(row).getByLabelText('Enable Antigravity harness'));
  await waitFor(() => expect(storedPrefs()?.antigravity?.enabled).toBe(false));

  // The stored default stays selected (never silently rewritten) but its
  // option is disabled with a reason.
  const select = screen.getByLabelText('Default harness');
  expect(select.value).toBe('antigravity');
  const staleOption = within(select).getByRole('option', { name: /Antigravity \(disabled\)/ });
  expect(staleOption.disabled).toBe(true);
  // Every other option stays selectable.
  for (const option of within(select).getAllByRole('option')) {
    if (option === staleOption) continue;
    expect(option.disabled).toBe(false);
  }
});

test('an older backend payload without availability fields renders all-enabled', async () => {
  getHarnesses.mockResolvedValue({
    harnesses: HARNESS_PAYLOAD.harnesses.map(({ available, detectionSource, ...rest }) => rest),
  });
  renderWithKainBain(<HarnessTestBed />);

  for (const harness of HARNESS_PAYLOAD.harnesses) {
    const row = await screen.findByTestId(`harness-row-${harness.id}`);
    expect(
      within(row).getByLabelText(`Enable ${harness.name} harness`),
    ).toBeChecked();
    // Honest status, never silent: unknown until probed.
    expect(within(row).getByTestId(`harness-status-${harness.id}`)).toHaveTextContent(
      /Unknown|Unavailable|Auto-detect off/,
    );
  }
});

test('probe results surface as Detected for catalogue harnesses with models', async () => {
  getHarnessModels.mockImplementation((id) =>
    id === 'pi' ? Promise.resolve({ models: [{ id: 'm' }] }) : Promise.resolve({ models: [] }),
  );
  renderWithKainBain(<HarnessTestBed />);

  const piRow = await screen.findByTestId('harness-row-pi');
  await waitFor(() =>
    expect(within(piRow).getByTestId('harness-status-pi')).toHaveTextContent('Detected'),
  );
});

test('a probe discoveryError renders the specific reason + fix under the badge', async () => {
  getHarnessModels.mockImplementation((id) =>
    id === 'antigravity'
      ? Promise.resolve({
          models: [],
          discoveryError: {
            code: 'AGY_BIN_MISSING',
            message: 'The agy CLI was not found.',
            hint: 'Install the Antigravity CLI.',
          },
        })
      : Promise.resolve({ models: [] }),
  );
  renderWithKainBain(<HarnessTestBed />);

  const row = await screen.findByTestId('harness-row-antigravity');
  await waitFor(() =>
    expect(
      within(row).getByTestId('harness-status-detail-antigravity'),
    ).toBeInTheDocument(),
  );
  expect(
    within(row).getByTestId('harness-status-detail-antigravity'),
  ).toHaveTextContent('The agy CLI was not found.');
  expect(
    within(row).getByTestId('harness-status-detail-antigravity'),
  ).toHaveTextContent('Install the Antigravity CLI.');
  // The badge still reports the honest probe outcome underneath.
  expect(within(row).getByTestId('harness-status-antigravity')).toHaveTextContent(
    'Unavailable',
  );
});

test('a probe without discoveryError renders no reason line', async () => {
  getHarnessModels.mockResolvedValue({ models: [] });
  renderWithKainBain(<HarnessTestBed />);

  const row = await screen.findByTestId('harness-row-antigravity');
  await waitFor(() =>
    expect(within(row).getByTestId('harness-status-antigravity')).toHaveTextContent(
      'Unavailable',
    ),
  );
  expect(
    within(row).queryByTestId('harness-status-detail-antigravity'),
  ).not.toBeInTheDocument();
});

test('each harness row shows its success rate and run count', async () => {
  getHarnessReliability.mockResolvedValue({
    reliability: [
      {
        harnessId: 'pi',
        runs: 120,
        successes: 117,
        infraFailures: 3,
        excludedRejected: 4,
        successRate: 97.5,
        lastRunAt: '2026-10-01T12:00:00.000Z',
        recent: {
          runs: 50,
          successes: 49,
          infraFailures: 1,
          excludedRejected: 1,
          successRate: 98,
        },
      },
    ],
  });
  renderWithKainBain(<HarnessTestBed />);

  const piRow = await screen.findByTestId('harness-row-pi');
  await waitFor(() =>
    expect(
      within(piRow).getByTestId('harness-reliability-pi'),
    ).toHaveTextContent('All-time 97.5% · 120 runs'),
  );
  // Badge and toggles are undisturbed by the reliability line.
  expect(within(piRow).getByTestId('harness-status-pi')).toBeInTheDocument();
  expect(
    within(piRow).getByLabelText('Enable pi coding agent harness'),
  ).toBeInTheDocument();
});

test('harnesses without attributed runs show an honest no-data state (never 0%)', async () => {
  getHarnessReliability.mockResolvedValue({ reliability: [] });
  renderWithKainBain(<HarnessTestBed />);

  const row = await screen.findByTestId('harness-row-pi');
  await waitFor(() =>
    expect(
      within(row).getByTestId('harness-reliability-pi'),
    ).toHaveTextContent('No reliability data yet'),
  );
  expect(
    within(row).getByTestId('harness-reliability-pi'),
  ).not.toHaveTextContent('0%');
});

test('a reliability fetch failure shows one honest error note and no fake lines', async () => {
  getHarnessReliability.mockRejectedValue(new Error('network down'));
  renderWithKainBain(<HarnessTestBed />);

  await screen.findByTestId('harness-row-pi');
  await waitFor(() =>
    expect(screen.getByTestId('harness-reliability-error')).toHaveTextContent(
      'Could not load harness reliability.',
    ),
  );
  expect(screen.queryByTestId('harness-reliability-pi')).not.toBeInTheDocument();
});

test('a reliability retry re-fetches and renders the lines on success', async () => {
  getHarnessReliability
    .mockRejectedValueOnce(new Error('network down'))
    .mockResolvedValueOnce({
      reliability: [
        {
          harnessId: 'pi',
          runs: 10,
          successes: 9,
          infraFailures: 1,
          excludedRejected: 0,
          successRate: 90,
          lastRunAt: '2026-10-01T12:00:00.000Z',
          recent: {
            runs: 10,
            successes: 9,
            infraFailures: 1,
            excludedRejected: 0,
            successRate: 90,
          },
        },
      ],
    });
  renderWithKainBain(<HarnessTestBed />);

  await screen.findByTestId('harness-row-pi');
  const errorNote = await screen.findByTestId('harness-reliability-error');
  expect(getHarnessReliability).toHaveBeenCalledTimes(1);

  fireEvent.click(within(errorNote).getByRole('button', { name: 'Retry' }));

  const piRow = await screen.findByTestId('harness-row-pi');
  await waitFor(() =>
    expect(
      within(piRow).getByTestId('harness-reliability-pi'),
    ).toHaveTextContent('All-time 90% · 10 runs'),
  );
  expect(getHarnessReliability).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId('harness-reliability-error')).not.toBeInTheDocument();
});

test('the reliability note states what counts as failure and what is excluded', async () => {
  renderWithKainBain(<HarnessTestBed />);

  await screen.findByTestId('harness-row-pi');
  const note = screen.getByTestId('harness-reliability-note');
  expect(note).toHaveTextContent(/timeouts and harness errors/i);
  expect(note).toHaveTextContent(/deliberate agent.*fail/i);
});

test('stage timeout is entered in minutes and persisted back to seconds', async () => {
  const persisted = [];
  function TimeoutProbe() {
    const { prefs, updatePref, resetPrefs } = useHarnessPrefs();
    const [draft, setDraft] = useState({
      defaultHarness: 'pi',
      stageTimeoutSecs: 600,
      allowPermissionBypass: false,
    });
    const update = (key, value) => {
      persisted.push([key, value]);
      setDraft((prev) => ({ ...prev, [key]: value }));
    };
    return (
      <HarnessSection
        draft={draft}
        update={update}
        inputClass=""
        toggleClass=""
        prefs={prefs}
        updatePref={updatePref}
        resetPrefs={resetPrefs}
      />
    );
  }
  renderWithKainBain(<TimeoutProbe />);

  const input = await screen.findByLabelText('Stage timeout in minutes');
  // Stored 600 seconds displays as 10 minutes.
  expect(input).toHaveValue(10);

  fireEvent.change(input, { target: { value: '5' } });
  expect(persisted).toContainEqual(['stageTimeoutSecs', 300]);

  // Fractional minutes persist back to whole seconds.
  fireEvent.change(input, { target: { value: '1.5' } });
  expect(persisted).toContainEqual(['stageTimeoutSecs', 90]);
});

test('falls back to the backend availability hint when the probe reports nothing', async () => {
  getHarnesses.mockResolvedValue({
    harnesses: HARNESS_PAYLOAD.harnesses.map((harness) =>
      harness.id === 'muse'
        ? { ...harness, available: false, detectionSource: 'not-found', hint: 'Install the Muse CLI or set KAINBAIN_MUSE_BIN.' }
        : harness,
    ),
  });
  // muse manages its own model (modelSelection none): the probe stays silent.
  getHarnessModels.mockResolvedValue({ models: [] });
  renderWithKainBain(<HarnessTestBed />);

  const detail = await screen.findByTestId('harness-status-detail-muse');
  expect(detail).toHaveTextContent('Install the Muse CLI or set KAINBAIN_MUSE_BIN.');
});

/***
 * MARK: harness Refresh → model catalogue refresh
 * @description The literal user request: an explicit Refresh on a harness row
 *   also re-runs the shared model catalogue, but only when the config gate
 *   allows it. These tests pin the enabled path (callback fired with the
 *   probe's refresh), the disabled paths (runtime config false and build flag
 *   off), the auto-detect exemption (non-explicit probes never refresh), and
 *   the subtle in-flight hint.
 ***/

test('explicit harness Refresh also refreshes the model catalog when enabled', async () => {
  const onModelsRefresh = vi.fn().mockResolvedValue(undefined);
  renderWithKainBain(<HarnessTestBed onModelsRefresh={onModelsRefresh} />);
  const row = await screen.findByTestId('harness-row-pi');

  fireEvent.click(within(row).getByLabelText('Refresh pi coding agent availability'));

  await waitFor(() => expect(onModelsRefresh).toHaveBeenCalledTimes(1));
  // The availability probe still runs with the explicit refresh flag.
  expect(getHarnessModels).toHaveBeenCalledWith('pi', true);
});

test('explicit harness Refresh does NOT refresh the model catalog when the runtime config disables it', async () => {
  const onModelsRefresh = vi.fn().mockResolvedValue(undefined);
  renderWithKainBain(
    <HarnessTestBed onModelsRefresh={onModelsRefresh} modelRefreshRuntimeValue={false} />,
  );
  const row = await screen.findByTestId('harness-row-pi');

  fireEvent.click(within(row).getByLabelText('Refresh pi coding agent availability'));

  await waitFor(() =>
    expect(within(row).getByLabelText('Refresh pi coding agent availability')).toHaveTextContent(
      'Refresh',
    ),
  );
  expect(onModelsRefresh).not.toHaveBeenCalled();
  expect(getHarnessModels).toHaveBeenCalledWith('pi', true);
});

test('explicit harness Refresh does NOT refresh the model catalog when the build flag disables it', async () => {
  vi.stubEnv('VITE_ENABLE_SYSTEM_SETTINGS_MODEL_REFRESH', '0');
  const onModelsRefresh = vi.fn().mockResolvedValue(undefined);
  renderWithKainBain(<HarnessTestBed onModelsRefresh={onModelsRefresh} />);
  const row = await screen.findByTestId('harness-row-pi');

  fireEvent.click(within(row).getByLabelText('Refresh pi coding agent availability'));

  await waitFor(() =>
    expect(within(row).getByLabelText('Refresh pi coding agent availability')).toHaveTextContent(
      'Refresh',
    ),
  );
  expect(onModelsRefresh).not.toHaveBeenCalled();
});

test('a catalogue-refresh failure never fails the harness probe or blocks the badge', async () => {
  const onModelsRefresh = vi.fn().mockRejectedValue(new Error('catalogue down'));
  getHarnessModels.mockResolvedValue({ models: [{ id: 'm' }] });
  renderWithKainBain(<HarnessTestBed onModelsRefresh={onModelsRefresh} />);
  const row = await screen.findByTestId('harness-row-pi');

  fireEvent.click(within(row).getByLabelText('Refresh pi coding agent availability'));

  await waitFor(() => expect(onModelsRefresh).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(within(row).getByTestId('harness-status-pi')).toHaveTextContent('Detected'),
  );
});

test('a synchronous throw from the catalogue refresh never escapes the probe', async () => {
  // Defensive guard: the callback is invoked inside a deferred promise chain,
  // so even a callback that throws before returning a promise cannot turn the
  // explicit Refresh into a failed harness probe.
  const onModelsRefresh = vi.fn(() => {
    throw new Error('sync catalogue boom');
  });
  getHarnessModels.mockResolvedValue({ models: [{ id: 'm' }] });
  renderWithKainBain(<HarnessTestBed onModelsRefresh={onModelsRefresh} />);
  const row = await screen.findByTestId('harness-row-pi');

  fireEvent.click(within(row).getByLabelText('Refresh pi coding agent availability'));

  await waitFor(() => expect(onModelsRefresh).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(within(row).getByTestId('harness-status-pi')).toHaveTextContent('Detected'),
  );
  // The button settles back to its idle label — the probe was not disturbed.
  expect(within(row).getByLabelText('Refresh pi coding agent availability')).toHaveTextContent(
    'Refresh',
  );
});

test('auto-detect probes (no explicit Refresh) never trigger a catalog refresh', async () => {
  const onModelsRefresh = vi.fn().mockResolvedValue(undefined);
  renderWithKainBain(<HarnessTestBed onModelsRefresh={onModelsRefresh} />);

  await screen.findByTestId('harness-row-pi');
  await waitFor(() => expect(getHarnessModels).toHaveBeenCalled());
  expect(onModelsRefresh).not.toHaveBeenCalled();
});

test('explicit harness Refresh without a catalogue callback still completes the probe', async () => {
  // Defensive guard: hosts that render HarnessSection without onModelsRefresh
  // (no shared catalogue to refresh) must get the plain harness-only probe —
  // the missing callback is skipped, never thrown through the probe.
  renderWithKainBain(<HarnessTestBed />);
  const row = await screen.findByTestId('harness-row-pi');

  fireEvent.click(within(row).getByLabelText('Refresh pi coding agent availability'));

  await waitFor(() => expect(getHarnessModels).toHaveBeenCalledWith('pi', true));
  // Exact match: a substring assertion would also pass while the button still
  // reads 'Refreshing…'.
  await waitFor(() =>
    expect(within(row).getByLabelText('Refresh pi coding agent availability')).toHaveTextContent(
      /^Refresh$/,
    ),
  );
});

test('shows a subtle in-flight hint while the catalog refresh runs', async () => {
  renderWithKainBain(<HarnessTestBed modelsRefreshing />);

  await screen.findByTestId('harness-row-pi');
  expect(screen.getByTestId('models-refresh-status')).toHaveTextContent('Models refreshing…');
});

test('omits the in-flight hint when no catalog refresh is running', async () => {
  renderWithKainBain(<HarnessTestBed />);

  await screen.findByTestId('harness-row-pi');
  expect(screen.queryByTestId('models-refresh-status')).not.toBeInTheDocument();
});
