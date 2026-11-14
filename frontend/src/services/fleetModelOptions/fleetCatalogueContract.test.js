// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wpCCatalogue } from './__fixtures__/wpCFleetCatalogue.js';
import { fleetCountsById } from '../../hooks/useFleetModelCatalog/fleetCountsById.js';
import { fleetModelsForHarness } from './fleetModelsForHarness.js';
import { fleetHarnessBadgeNode, fleetModelRowBadge } from '../modelStatus.js';

/***
 * MARK: fleetCatalogueContract tests
 * @description A4 (picker half): pins the picker chain against the canned
 *   WP-C catalogue fixture (`wpCCatalogue`, the `/runners/models/catalogue`
 *   response shape): the picker chain (`fleetCountsById` →
 *   `fleetModelsForHarness` → row/harness badges) must serve A1/A2/A3 end
 *   to end. Canned on purpose — frontend suites must not import the api
 *   tree (see `tests/run-parallel.test.mjs`: the api graph carries `node:`
 *   builtins that flake DOM-env suites under the overlapped gate). The
 *   real snapshot store behind the shape stays covered natively in
 *   `api/flow/dispatch/fleetModelSnapshot.test.js`; the fixture shape
 *   itself is pinned in `__fixtures__/wpCFleetCatalogue.test.js`. If the
 *   backend contract drifts, those fail — not a picker.
 */

const SERVED_ID = 'muse::meta::muse-spark-1.3';
const RETIRED_ID = 'custom::acme::retired';
const UNVERIFIED_ID = 'muse::meta::unverified-9';
const PROVIDER_ID = 'ollama-cloud-direct::gemma4:31b-cloud';

// Reads the count label out of a row badge (plain node or fragment + note).
const rowLabelOf = (node) => {
  if (!node || typeof node !== 'object') return null;
  if (node.type === Symbol.for('react.fragment')) {
    const [countNode] = node.props.children;
    return countNode.props.children[1];
  }
  return node.props.children[1];
};

describe('fleetCatalogueContract (A4: picker chain over the WP-C fixture)', () => {
  it('A1: a kept 0-runner entry badges "0 runners", never "Unavailable"', () => {
    const counts = fleetCountsById(wpCCatalogue());
    // eslint-disable-next-line security/detect-object-injection -- constant test id into our own map
    const retired = counts[RETIRED_ID];
    expect(retired).toMatchObject({ available: false, runnerCount: 0 });
    expect(rowLabelOf(fleetModelRowBadge(retired))).toBe('0 runners');
  });

  it('A2: the quarantined provider-form id never joins a harness section', () => {
    const catalogue = wpCCatalogue();
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

  it('A2 (literal): a provider-form id with a serving list still renders nothing', () => {
    // The exact acceptance input: the id grammar alone decides, so even an
    // entry claiming to serve the section cannot fan out into it.
    expect(
      fleetModelsForHarness('muse', {
        'ollama-cloud-direct::gemma4:31b-cloud': { harnesses: ['muse', 'pi'] },
      }),
    ).toEqual([]);
    expect(fleetModelsForHarness('muse', { 'gemma4-31b': { harnesses: ['muse'] } })).toEqual(
      [],
    );
  });

  it('A3: the harness badge renders the fleet harness count, never the probe verdict', () => {
    const catalogue = wpCCatalogue();
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
    const counts = fleetCountsById(wpCCatalogue());
    // eslint-disable-next-line security/detect-object-injection -- constant test id into our own map
    const unverified = counts[UNVERIFIED_ID];
    expect(unverified).toMatchObject({ verified: false, runnerCount: 0 });
    expect(unverified.declaredBy).toContain('local-alpha');
    const node = fleetModelRowBadge(unverified);
    expect(node.type).toBe(Symbol.for('react.fragment'));
    expect(rowLabelOf(node)).toBe('0 runners');
    const [, note] = node.props.children;
    expect(note.props.children).toBe('unverified');
    expect(note.props.title).toContain('local-alpha');
  });
});
