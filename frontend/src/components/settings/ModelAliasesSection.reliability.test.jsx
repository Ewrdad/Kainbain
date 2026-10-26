import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { ModelAliasesSection, aliasReliabilityByName, reliabilityForTarget, reliabilityForAlias, sameModelRefForReliability, aliasReliabilityTitles } from './ModelAliasesSection';
import { api } from '../../services/api';
import '@testing-library/jest-dom';

/**
 * MARK: ModelAliasesSection reliability tests
 * @description Black-box coverage for the reliability lines in Settings ›
 *   Model Aliases: each alias shows its aggregate rate and each target row
 *   shows its own all-time rate (or an honest no-data state, never 0%), a
 *   pending fetch shows an explicit loading state instead of a blank
 *   section, the fetch is scoped to the owning project id, failures offer
 *   Retry, and the note states what the rate counts and excludes. Model
 *   lookups bridge legacy and canonical key spellings on one harness. The
 *   api module keeps its real shape with only getAliasReliability mocked.
 */

const getAliasReliability = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, api: { ...actual.api, getAliasReliability } };
});

const HARNESSES = [
  {
    id: 'pi',
    label: 'pi',
    description: 'pi',
    modelSelection: 'list',
    models: [
      { id: 'm1', name: 'M1', provider: 'google', key: 'google::m1' },
      { id: 'm2', name: 'M2', provider: 'anthropic', key: 'anthropic::m2' },
    ],
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    description: 'antigravity',
    modelSelection: 'list',
    models: [{ id: 'g', name: 'G', provider: 'google', key: 'google::g' }],
  },
];

const ALIASES = [
  {
    name: 'worker',
    harness: 'pi',
    model: 'google::m1',
    targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }],
  },
  {
    name: 'mix',
    harness: 'pi',
    model: 'google::m1',
    targets: [
      { harness: 'pi', model: 'google::m1', percent: 90 },
      { harness: 'antigravity', model: 'google::g', percent: 10 },
    ],
  },
];

function reliabilityPayload() {
  return {
    aliases: [
      {
        aliasName: 'worker',
        runs: 3,
        successes: 2,
        infraFailures: 1,
        excludedRejected: 2,
        successRate: 66.7,
        lastRunAt: '2026-10-01T12:00:00.000Z',
        recent: { runs: 3, successes: 2, infraFailures: 1, excludedRejected: 0, successRate: 66.7 },
        targets: [
          {
            harness: 'pi',
            model: 'google::m1',
            runs: 3,
            successes: 2,
            infraFailures: 1,
            excludedRejected: 2,
            successRate: 66.7,
            lastRunAt: '2026-10-01T12:00:00.000Z',
            recent: { runs: 3, successes: 2, infraFailures: 1, excludedRejected: 0, successRate: 66.7 },
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  getAliasReliability.mockReset();
  getAliasReliability.mockResolvedValue({ aliases: [] });
});

/**
 * Alias cards mount collapsed, so tests that assert on the expanded body
 * expand first via the toolbar toggle (or the single row's chevron when the
 * toolbar hides). Null-safe and never swallowing real render errors.
 */
function expandAllCards() {
  const toolbar = screen.queryByTestId('model-aliases-collapse-all-toggle');
  if (toolbar) {
    if (/Expand All/i.test(toolbar.textContent || '')) fireEvent.click(toolbar);
    return;
  }
  const toggle = screen.queryByTestId('model-alias-toggle-0');
  if (toggle && toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
}

function renderSection(props = {}) {
  const rendered = renderWithKainBain(
    <ModelAliasesSection
      aliases={ALIASES}
      onChange={() => {}}
      harnesses={HARNESSES}
      projectId="p1"
      {...props}
    />,
  );
  expandAllCards();
  return rendered;
}

test('each target row shows its own success rate and run count', async () => {
  getAliasReliability.mockResolvedValue(reliabilityPayload());
  renderSection();

  expect(getAliasReliability).toHaveBeenCalledWith('p1');
  const line = await screen.findByTestId('alias-reliability-0-0');
  await waitFor(() =>
    expect(line).toHaveTextContent('All-time 66.7% · 3 runs'),
  );
  // The unattributed target shows the honest no-data state, never 0%.
  const mixLine = await screen.findByTestId('alias-reliability-1-0');
  expect(mixLine).toHaveTextContent('No reliability data yet');
  expect(mixLine).not.toHaveTextContent('0%');
});

test('lines show an explicit loading state until the fetch lands', async () => {
  let resolveFetch;
  getAliasReliability.mockReturnValue(
    new Promise((resolve) => {
      resolveFetch = resolve;
    }),
  );
  renderSection();

  // The section never looks featureless while loading: every alias and
  // every target names the pending load instead of rendering nothing.
  expect(await screen.findByTestId('alias-reliability-0')).toHaveTextContent(
    'Loading reliability…',
  );
  expect(screen.getByTestId('alias-reliability-0-0')).toHaveTextContent(
    'Loading reliability…',
  );

  resolveFetch(reliabilityPayload());
  const line = await screen.findByTestId('alias-reliability-0-0');
  await waitFor(() => expect(line).toHaveTextContent('All-time 66.7% · 3 runs'));
});

test('each alias shows its aggregate rate across all its targets', async () => {
  getAliasReliability.mockResolvedValue(reliabilityPayload());
  renderSection();

  const aliasLine = await screen.findByTestId('alias-reliability-0');
  await waitFor(() =>
    expect(aliasLine).toHaveTextContent('All-time 66.7% · 3 runs'),
  );
  // The unattributed alias shows the honest no-data state, never 0%.
  const mixAliasLine = await screen.findByTestId('alias-reliability-1');
  expect(mixAliasLine).toHaveTextContent('No reliability data yet');
  expect(mixAliasLine).not.toHaveTextContent('0%');
});

test('a target re-saved under a legacy spelling still finds its canonical history', async () => {
  const canonicalBucket = {
    harness: 'pi',
    model: 'pi::google::m1',
    runs: 2,
    successes: 2,
    infraFailures: 0,
    excludedRejected: 0,
    successRate: 100,
    lastRunAt: null,
    recent: { runs: 2, successes: 2, infraFailures: 0, excludedRejected: 0, successRate: 100 },
  };
  getAliasReliability.mockResolvedValue({
    aliases: [
      {
        aliasName: 'worker',
        runs: canonicalBucket.runs,
        successes: canonicalBucket.successes,
        infraFailures: canonicalBucket.infraFailures,
        excludedRejected: canonicalBucket.excludedRejected,
        successRate: canonicalBucket.successRate,
        lastRunAt: canonicalBucket.lastRunAt,
        recent: canonicalBucket.recent,
        targets: [canonicalBucket],
      },
    ],
  });
  renderSection({
    aliases: [
      {
        name: 'worker',
        harness: 'pi',
        model: 'google::m1',
        targets: [{ harness: 'pi', model: 'google::m1', percent: 100 }],
      },
    ],
  });

  const line = await screen.findByTestId('alias-reliability-0-0');
  await waitFor(() => expect(line).toHaveTextContent('All-time 100% · 2 runs'));
});

test('the reliability fetch runs once per mount with the project id', async () => {
  renderSection();

  await screen.findByTestId('alias-reliability-0-0');
  expect(getAliasReliability).toHaveBeenCalledTimes(1);
  expect(getAliasReliability).toHaveBeenCalledWith('p1');
});

test('without a project id no fetch runs and no lines render', async () => {
  renderWithKainBain(
    <ModelAliasesSection aliases={ALIASES} onChange={() => {}} harnesses={HARNESSES} />,
  );

  await screen.findByTestId('model-aliases-section');
  expect(getAliasReliability).not.toHaveBeenCalled();
  expect(screen.queryByTestId('alias-reliability-0-0')).not.toBeInTheDocument();
});

test('without an alias reliability reader no lines render and nothing hangs on loading', async () => {
  // Defensive build shape: `api.getAliasReliability` missing entirely. The
  // mount effect intentionally skips the fetch, so the section must not
  // promise a load that will never land (perpetual "Loading reliability…").
  const original = api.getAliasReliability;
  api.getAliasReliability = undefined;
  try {
    renderSection();
    await screen.findByTestId('model-aliases-section');
    expect(getAliasReliability).not.toHaveBeenCalled();
    expect(screen.queryByTestId('alias-reliability-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alias-reliability-0-0')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading reliability…')).not.toBeInTheDocument();
  } finally {
    api.getAliasReliability = original;
  }
});

test('a reliability fetch failure shows one honest error note and no fake lines', async () => {
  getAliasReliability.mockRejectedValue(new Error('network down'));
  renderSection();

  const errorNote = await screen.findByTestId('alias-reliability-error');
  expect(errorNote).toHaveTextContent('Could not load alias reliability.');
  expect(screen.queryByTestId('alias-reliability-0-0')).not.toBeInTheDocument();
});

test('a reliability retry re-fetches and renders the lines on success', async () => {
  getAliasReliability
    .mockRejectedValueOnce(new Error('network down'))
    .mockResolvedValueOnce(reliabilityPayload());
  renderSection();

  const errorNote = await screen.findByTestId('alias-reliability-error');
  expect(getAliasReliability).toHaveBeenCalledTimes(1);

  fireEvent.click(within(errorNote).getByRole('button', { name: 'Retry' }));

  const line = await screen.findByTestId('alias-reliability-0-0');
  await waitFor(() =>
    expect(line).toHaveTextContent('All-time 66.7% · 3 runs'),
  );
  expect(getAliasReliability).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId('alias-reliability-error')).not.toBeInTheDocument();
});

test('the reliability note states what counts as failure and what is excluded', async () => {
  renderSection();

  await screen.findByTestId('alias-reliability-0-0');
  const note = screen.getByTestId('alias-reliability-note');
  expect(note).toHaveTextContent(/timeouts and harness errors as failures/);
  expect(note).toHaveTextContent(/deliberate agent/);
  expect(note).toHaveTextContent(/excluded/);
});

test('aliasReliabilityByName folds payloads into trimmed alias entries', () => {
  expect(aliasReliabilityByName({ aliases: [] })).toEqual({});
  expect(aliasReliabilityByName(null)).toEqual({});
  expect(aliasReliabilityByName({})).toEqual({});
  expect(aliasReliabilityByName({ aliases: 'nope' })).toEqual({});

  const entry = { aliasName: 'worker', targets: [] };
  const folded = aliasReliabilityByName({
    aliases: [
      entry,
      { aliasName: '  ', targets: [] },
      { targets: [] },
      null,
    ],
  });
  expect(folded.worker).toBe(entry);
  expect(Object.keys(folded)).toEqual(['worker']);
});

test('aliasReliabilityByName trims names and never leaks prototype keys', () => {
  const folded = aliasReliabilityByName({
    aliases: [{ aliasName: ' worker ', targets: [{ harness: 'pi', model: 'm', runs: 1 }] }],
  });
  expect(reliabilityForTarget(folded, 'worker', 'pi', 'm')).toMatchObject({ runs: 1 });

  const hostile = aliasReliabilityByName({
    aliases: [
      { aliasName: '__proto__', targets: [{ harness: 'pi', model: 'evil', runs: 99 }] },
      { aliasName: 'worker', targets: [{ harness: 'pi', model: 'm', runs: 1 }] },
    ],
  });
  // The hostile entry stays an own key (no prototype poisoning)…
  expect(Object.prototype.hasOwnProperty.call(hostile, '__proto__')).toBe(true);
  // …and unrelated aliases never inherit its targets.
  expect(reliabilityForTarget(hostile, 'ghost', 'pi', 'evil')).toBeUndefined();
  expect(reliabilityForTarget(hostile, 'worker', 'pi', 'm')).toMatchObject({ runs: 1 });
});

test('sameModelRefForReliability bridges key spellings without crossing harnesses', () => {
  // Legacy `provider::id` and canonical `harness::provider::id` name one model.
  expect(sameModelRefForReliability('google::m1', 'pi', 'pi::google::m1', 'pi')).toBe(true);
  expect(sameModelRefForReliability('pi::google::m1', 'pi', 'google::m1', 'pi')).toBe(true);
  expect(sameModelRefForReliability('pi::google::m1', 'pi', 'pi::google::m1', 'pi')).toBe(true);
  expect(sameModelRefForReliability('', 'muse', '', 'muse')).toBe(true);
  // Same model id on another harness is another deployment path: never merged.
  expect(sameModelRefForReliability('google::m1', 'pi', 'google::m1', 'antigravity')).toBe(false);
  expect(sameModelRefForReliability('google::m1', 'pi', 'google::other', 'pi')).toBe(false);
  expect(sameModelRefForReliability('', 'pi', 'google::m1', 'pi')).toBe(false);
  expect(sameModelRefForReliability('google::m1', 'pi', '', 'pi')).toBe(false);
  expect(sameModelRefForReliability(null, 'pi', 'google::m1', 'pi')).toBe(false);
  expect(sameModelRefForReliability('google::m1', '', 'pi::google::m1', 'pi')).toBe(false);
});

test('reliabilityForTarget finds history across equivalent model spellings', () => {
  const byAlias = {
    worker: { targets: [{ harness: 'pi', model: 'pi::google::m1', runs: 4 }] },
  };
  expect(reliabilityForTarget(byAlias, 'worker', 'pi', 'google::m1')).toMatchObject({
    runs: 4,
  });
  // …but never a neighbouring harness's bucket.
  expect(reliabilityForTarget(byAlias, 'worker', 'antigravity', 'google::m1')).toBeUndefined();
});

test('reliabilityForAlias reads the aggregate bucket without leaking prototype keys', () => {
  expect(reliabilityForAlias(null, 'worker')).toBeUndefined();
  expect(reliabilityForAlias({}, 'worker')).toBeUndefined();
  expect(reliabilityForAlias({ worker: null }, 'worker')).toBeUndefined();
  const entry = { aliasName: 'worker', runs: 3, targets: [] };
  expect(reliabilityForAlias({ worker: entry }, ' worker ')).toBe(entry);
  expect(reliabilityForAlias({ worker: entry }, 'ghost')).toBeUndefined();
  expect(reliabilityForAlias({ worker: entry }, '')).toBeUndefined();
});

test('aliasReliabilityTitles names the alias and states the exclusion', () => {
  const withStats = aliasReliabilityTitles('worker', {
    runs: 2,
    successes: 1,
    infraFailures: 1,
  });
  expect(withStats.title).toMatch(/"worker"/);
  expect(withStats.title).toMatch(/excluded/);
  expect(aliasReliabilityTitles('mix').title).toBe('');
  expect(aliasReliabilityTitles('mix').emptyTitle).toMatch(/No attributed runs/);
  expect(aliasReliabilityTitles('').emptyTitle).toMatch(/this alias/);
});

test('reliabilityForTarget matches exact trimmed harness+model pairs', () => {
  const byAlias = {
    worker: {
      targets: [
        { harness: 'pi', model: 'google::m1', runs: 3 },
        { harness: 'muse', model: '', runs: 1 },
      ],
    },
  };
  expect(
    reliabilityForTarget(byAlias, 'worker', 'pi', 'google::m1'),
  ).toMatchObject({ runs: 3 });
  expect(
    reliabilityForTarget(byAlias, ' worker ', 'pi', ' google::m1 '),
  ).toMatchObject({ runs: 3 });
  expect(
    reliabilityForTarget(byAlias, 'worker', 'muse', ''),
  ).toMatchObject({ runs: 1 });
  expect(reliabilityForTarget(byAlias, 'worker', 'pi', 'google::other')).toBeUndefined();
  expect(reliabilityForTarget(byAlias, 'ghost', 'pi', 'google::m1')).toBeUndefined();
  expect(reliabilityForTarget(null, 'worker', 'pi', 'google::m1')).toBeUndefined();
});

/**
 * MARK: reliability grouping tests
 * @description Black-box coverage for the visual grouping of reliability
 *   metrics: the alias aggregate rate lives in its own labeled bar
 *   ("Overall Alias Reliability") outside every target card, and each
 *   target's rate lives inside that target's card under a "Target
 *   reliability:" label, so no rate can be misread as belonging to the
 *   target above or below it. Target cards announce themselves as groups
 *   (role="group" + descriptive aria-label) for assistive technology.
 */
describe('reliability metric grouping', () => {
  test('the aggregate rate is labeled and sits outside every target card', async () => {
    getAliasReliability.mockResolvedValue(reliabilityPayload());
    renderSection();

    const aggregateBar = await screen.findByTestId('model-alias-aggregate-reliability-0');
    expect(aggregateBar).toHaveTextContent('Overall Alias Reliability');
    expect(within(aggregateBar).getByTestId('alias-reliability-0')).toBeInTheDocument();

    // The aggregate bar must never read as one of the targets' own rates.
    for (const card of screen.getAllByTestId('model-alias-target-row')) {
      expect(card.contains(aggregateBar)).toBe(false);
    }
  });

  test('each target card labels its own rate inside the card', async () => {
    getAliasReliability.mockResolvedValue(reliabilityPayload());
    renderSection();

    const cards = await screen.findAllByTestId('model-alias-target-row');
    const card = cards[0];
    const line = within(card).getByTestId('alias-reliability-0-0');
    expect(card).toHaveTextContent('Target reliability:');
    // The label introduces the value, so the rate reads as the target's own.
    const label = within(card).getByText('Target reliability:');
    expect(
      label.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The resolution status stays grouped with the target it describes.
    expect(within(card).getByTestId('model-alias-target-validity-0-0')).toBeInTheDocument();
  });

  test('the reliability footer stays inside the card, after the inputs', async () => {
    getAliasReliability.mockResolvedValue(reliabilityPayload());
    renderSection();

    const card = (await screen.findAllByTestId('model-alias-target-row'))[0];
    const percent = within(card).getByLabelText('Alias 1 percent');
    const line = within(card).getByTestId('alias-reliability-0-0');
    // The rate closes the card — it can never sit above the next target.
    expect(
      percent.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test('target cards announce themselves as labelled groups', async () => {
    renderSection();

    const cards = await screen.findAllByTestId('model-alias-target-row');
    // Single-target alias reads as one plain target…
    expect(cards[0]).toHaveAttribute('role', 'group');
    expect(cards[0]).toHaveAttribute('aria-label', 'Alias 1 target');
    // …multi-target aliases name each target and its harness.
    expect(cards[1]).toHaveAttribute('role', 'group');
    expect(cards[1]).toHaveAttribute('aria-label', 'Alias 2 target 1 (pi)');
    expect(cards[2]).toHaveAttribute('role', 'group');
    expect(cards[2]).toHaveAttribute('aria-label', 'Alias 2 target 2 (antigravity)');
  });

  test('the targets list is introduced by a counted Targets header', async () => {
    renderSection();

    await screen.findByTestId('model-aliases-section');
    expect(screen.getByText('Targets (1)')).toBeInTheDocument();
    expect(screen.getByText('Targets (2)')).toBeInTheDocument();
  });

  test('multi-target cards are numbered with their share in the header', async () => {
    renderSection();

    const cards = await screen.findAllByTestId('model-alias-target-row');
    // The single-target alias stays un-numbered…
    expect(cards[0]).not.toHaveTextContent('Target 1');
    // …while each card of the weighted alias names itself and its share.
    expect(cards[1]).toHaveTextContent('Target 1 · 90%');
    expect(cards[2]).toHaveTextContent('Target 2 · 10%');
  });

  test('target cards and aggregate bar use theme-mapped bg-surface-subtle tokens', async () => {
    getAliasReliability.mockResolvedValue(reliabilityPayload());
    renderSection();

    const cards = await screen.findAllByTestId('model-alias-target-row');
    for (const card of cards) {
      expect(card).toHaveClass('bg-surface-subtle');
      expect(card).toHaveClass('border-border-standard');
      expect(card.className).not.toMatch(/bg-surface-deep\/\d+/);
    }

    const aggregateBar = await screen.findByTestId('model-alias-aggregate-reliability-0');
    expect(aggregateBar).toHaveClass('bg-surface-subtle');
    expect(aggregateBar).toHaveClass('border-border-standard');
    expect(aggregateBar.className).not.toMatch(/bg-surface-deep\/\d+/);
  });

  test('target remove button provides at least a 44x44 CSS px hit target (WCAG 2.5.8 AAA)', async () => {
    renderSection();

    await screen.findByTestId('model-aliases-section');
    const removeButtons = screen.getAllByRole('button', { name: /Remove .* target from alias 2/i });
    expect(removeButtons.length).toBeGreaterThan(0);
    for (const btn of removeButtons) {
      expect(btn).toHaveClass('min-h-[44px]');
      expect(btn).toHaveClass('min-w-[44px]');
      expect(btn).toHaveClass('inline-flex');
      expect(btn).toHaveClass('items-center');
      expect(btn).toHaveClass('justify-center');
    }
  });

  test('the aggregate bar announces itself as a labelled group', async () => {
    getAliasReliability.mockResolvedValue(reliabilityPayload());
    renderSection();

    const aggregateBar = await screen.findByTestId('model-alias-aggregate-reliability-0');
    expect(aggregateBar).toHaveAttribute('role', 'group');
    expect(aggregateBar).toHaveAttribute('aria-label', 'Alias 1 overall reliability');
  });

  test('the targets list is a labelled group naming its heading', async () => {
    renderSection();

    await screen.findByTestId('model-aliases-section');
    const list = document.getElementById('alias-targets-0');
    expect(list).toHaveAttribute('role', 'group');
    const headingId = list.getAttribute('aria-labelledby');
    expect(document.getElementById(headingId)).toHaveTextContent('Targets (1)');
  });

  test('the collapsed header names the aggregate rate for assistive technology', async () => {
    getAliasReliability.mockResolvedValue(reliabilityPayload());
    // Cards mount collapsed, so collapse the expanded test fixture back.
    renderSection();
    fireEvent.click(await screen.findByTestId('model-alias-toggle-0'));
    const collapsedRow = (await screen.findAllByTestId('model-alias-row'))[0];
    // Visually unchanged (screen-reader-only), but the aggregate can never
    // be heard as one of the hidden targets' own rates.
    expect(within(collapsedRow).getByText('Overall alias reliability:')).toHaveClass('sr-only');
    expect(within(collapsedRow).getByTestId('alias-reliability-0')).toBeInTheDocument();
  });

  test('an unassigned target never borrows another target\u2019s rate', () => {
    const byAlias = {
      worker: { targets: [{ harness: 'pi', model: 'google::m1', runs: 3 }] },
    };
    // Blank harness/model pairs match nothing — the line stays honest no-data.
    expect(reliabilityForTarget(byAlias, 'worker', '', '')).toBeUndefined();
    expect(reliabilityForTarget(byAlias, 'worker', '', 'google::m1')).toBeUndefined();
  });

  test('a blank target with no reliability lines renders no footer at all', async () => {
    renderWithKainBain(
      <ModelAliasesSection
        aliases={[{ name: 'draft', targets: [{ harness: '', model: '', percent: 100 }] }]}
        onChange={() => {}}
        harnesses={HARNESSES}
      />,
    );
    expandAllCards();

    const card = (await screen.findAllByTestId('model-alias-target-row'))[0];
    // No resolution status to show and no fetch to scope: the footer (status
    // + rate) is omitted rather than rendered empty.
    expect(card).toHaveAttribute('role', 'group');
    expect(
      within(card).queryByTestId('model-alias-target-validity-0-0'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('alias-reliability-0-0')).not.toBeInTheDocument();
  });
});
