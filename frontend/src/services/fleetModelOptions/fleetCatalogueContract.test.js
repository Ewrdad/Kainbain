// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createFleetModelSnapshotStore,
  summarizeFleetHarnesses,
} from '../../../../api/flow/dispatch/fleetModelSnapshot.js';
import { fleetRunnerRecord } from '../../../../api/flow/dispatch/fleetModelFixtures.mjs';
import { fleetCountsById } from '../../hooks/useFleetModelCatalog/fleetCountsById.js';
import { fleetModelsForHarness } from './fleetModelsForHarness.js';
import { fleetHarnessBadgeNode, fleetModelRowBadge } from '../modelStatus.js';

/***
 * MARK: fleetCatalogueContract tests
 * @description A4: pins the picker chain against the REAL WP-C snapshot
 *   store (`createFleetModelSnapshotStore({ filePath: null })`, memory-only
 *   — never touches the live engine file) instead of the `wpCCatalogue`
 *   fixture: several Runner registrations flow through `update()`, the
 *   catalogue is assembled exactly like the route does
 *   (`{ ...update(runners), harnesses: summarizeFleetHarnesses(runners) }`),
 *   and the picker chain (`fleetCountsById` → `fleetModelsForHarness` →
 *   row/harness badges) must serve A1/A2/A3 end to end. If the backend
 *   contract drifts, this fails here — not in a picker.
 */

// A claim the runner's own discovery CONFIRMED: provenance lists the id and
// the naming leg succeeded just now (mirrors the api suite's confirmedCaps).
const confirmedServing = (id, harness = 'muse') => {
  const atMs = Date.now();
  return {
    models: [id],
    modelSource: 'discovered',
    modelProvenance: { [id]: { harness, atMs } },
    discoveryStatus: { [harness]: { ok: true, count: 1, atMs } },
  };
};

// One store per test, memory-only: nothing persists, nothing touches disk.
const catalogueFromRunners = (batches) => {
  const store = createFleetModelSnapshotStore({ filePath: null });
  let snapshot = { models: [], quarantined: [], updatedAtMs: null };
  for (const runners of batches) snapshot = store.update(runners);
  const latest = batches[batches.length - 1] ?? [];
  return { ...snapshot, harnesses: summarizeFleetHarnesses(latest) };
};

const SERVED_ID = 'muse::meta::muse-spark-1.3';
const RETIRED_ID = 'custom::acme::retired';
const UNVERIFIED_ID = 'muse::meta::unverified-9';
const PROVIDER_ID = 'ollama-cloud-direct::gemma4:31b-cloud';

const seedCatalogue = () =>
  catalogueFromRunners([
    // First heartbeat: two runners serve two ids.
    [
      fleetRunnerRecord({
        runnerId: 'box-a',
        capabilities: confirmedServing(SERVED_ID),
      }),
      fleetRunnerRecord({
        runnerId: 'box-b',
        capabilities: {
          ...confirmedServing(RETIRED_ID, 'custom'),
          harnesses: [{ id: 'custom' }],
        },
      }),
    ],
    // Second heartbeat: box-b left (RETIRED_ID stays as a kept 0-runner
    // entry), one runner pins an undiscovered id, one advertises a
    // provider-form id (quarantined, never served).
    [
      fleetRunnerRecord({
        runnerId: 'box-a',
        capabilities: confirmedServing(SERVED_ID),
      }),
      fleetRunnerRecord({
        runnerId: 'pin-only',
        capabilities: {
          models: [UNVERIFIED_ID],
          modelSource: 'pinned',
          discoveryStatus: {},
        },
      }),
      fleetRunnerRecord({
        runnerId: 'bad-leg',
        capabilities: { models: [PROVIDER_ID] },
      }),
    ],
  ]);

// Reads the count label out of a row badge (plain node or fragment + note).
const rowLabelOf = (node) => {
  if (!node || typeof node !== 'object') return null;
  if (node.type === Symbol.for('react.fragment')) {
    const [countNode] = node.props.children;
    return countNode.props.children[1];
  }
  return node.props.children[1];
};

describe('fleetCatalogueContract (A4: real snapshot store)', () => {
  it('serves the WP-C shape pickers build against', () => {
    const catalogue = seedCatalogue();
    expect(Object.keys(catalogue).sort()).toEqual([
      'harnesses',
      'models',
      'quarantined',
      'updatedAtMs',
    ]);
    expect(catalogue.models.length).toBeGreaterThan(0);
    for (const entry of catalogue.models) {
      for (const key of [
        'id',
        'harness',
        'runnerCount',
        'runnerIds',
        'declaredBy',
        'claimedBy',
        'verified',
        'available',
        'tiers',
        'provenance',
      ]) {
        expect(entry, `model ${entry?.id} carries ${key}`).toHaveProperty(key);
      }
      const served = entry.runnerCount > 0;
      expect(entry.verified, `${entry.id} verified`).toBe(served);
      expect(entry.available, `${entry.id} available`).toBe(served);
    }
    for (const harness of catalogue.harnesses) {
      expect(harness).toHaveProperty('id');
      expect(harness).toHaveProperty('runnerCount');
    }
  });

  it('A1: a kept 0-runner entry badges "0 runners", never "Unavailable"', () => {
    const counts = fleetCountsById(seedCatalogue());
    // eslint-disable-next-line security/detect-object-injection -- constant test id into our own map
    const retired = counts[RETIRED_ID];
    expect(retired).toMatchObject({ available: false, runnerCount: 0 });
    expect(rowLabelOf(fleetModelRowBadge(retired))).toBe('0 runners');
  });

  it('A2: the provider-form id quarantines and never joins a harness section', () => {
    const catalogue = seedCatalogue();
    expect(catalogue.quarantined.map((record) => record.id)).toContain(PROVIDER_ID);
    const counts = fleetCountsById(catalogue);
    // eslint-disable-next-line security/detect-object-injection -- constant test id into our own map
    expect(counts[PROVIDER_ID]).toBeUndefined();
    const museKeys = fleetModelsForHarness('muse', counts).map((entry) => entry.key);
    expect(museKeys).toContain(SERVED_ID);
    expect(museKeys).toContain(UNVERIFIED_ID);
    expect(museKeys).not.toContain(PROVIDER_ID);
    expect(museKeys).not.toContain(RETIRED_ID);
  });

  it('A3: the harness badge renders the real fleet harness count', () => {
    const catalogue = seedCatalogue();
    const muse = catalogue.harnesses.find((entry) => entry.id === 'muse');
    expect(muse.runnerCount).toBeGreaterThan(0);
    const node = fleetHarnessBadgeNode(muse);
    const label = node.props.children[1];
    expect(label).toBe(
      muse.runnerCount === 1 ? '1 runner' : `${muse.runnerCount} runners`,
    );
    expect(label).not.toContain('Unavailable');
  });

  it('marks the declared-but-unconfirmed id unverified with its declarant', () => {
    const counts = fleetCountsById(seedCatalogue());
    // eslint-disable-next-line security/detect-object-injection -- constant test id into our own map
    const unverified = counts[UNVERIFIED_ID];
    expect(unverified).toMatchObject({ verified: false, runnerCount: 0 });
    expect(unverified.declaredBy).toContain('pin-only');
    const node = fleetModelRowBadge(unverified);
    expect(node.type).toBe(Symbol.for('react.fragment'));
    expect(rowLabelOf(node)).toBe('0 runners');
    const [, note] = node.props.children;
    expect(note.props.children).toBe('unverified');
    expect(note.props.title).toContain('pin-only');
  });
});
