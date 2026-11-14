// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fleetCountsById } from '../../../hooks/useFleetModelCatalog/fleetCountsById.js';
import { wpCCatalogue, wpCCounts } from './wpCFleetCatalogue.js';

/***
 * MARK: wpCFleetCatalogue tests
 * @description Pins the WP-C contract fixture shape pickers and the admin
 *   view build against: required keys per entry, derived `available` /
 *   `verified` consistent with `runnerCount > 0`, harness counts, one
 *   quarantined id, and the picker-map form carrying the WP-C fields.
 *   Contract drift fails here, not in picker tests.
 */
describe('wpCCatalogue (WP-C contract fixture)', () => {
  it('serves models/harnesses/quarantined with the contract keys', () => {
    const catalogue = wpCCatalogue();
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
    }
    for (const harness of catalogue.harnesses) {
      expect(harness).toHaveProperty('id');
      expect(harness).toHaveProperty('runnerCount');
    }
    expect(catalogue.quarantined.length).toBe(1);
    expect(catalogue.quarantined[0]).toHaveProperty('id');
    expect(catalogue.quarantined[0]).toHaveProperty('reason');
  });

  it('derives available/verified consistently with runnerCount > 0', () => {
    for (const entry of wpCCatalogue().models) {
      const served = entry.runnerCount > 0;
      expect(entry.verified, `${entry.id} verified`).toBe(served);
      expect(entry.available, `${entry.id} available`).toBe(served);
      expect(entry.runnerIds, `${entry.id} runnerIds`).toHaveLength(entry.runnerCount);
    }
  });

  it('covers the acceptance shapes: 2-runner, 0-runner, and unverified', () => {
    const catalogue = wpCCatalogue();
    expect(catalogue.models.some((m) => m.runnerCount === 2)).toBe(true);
    const zero = catalogue.models.find((m) => m.available === false && m.runnerCount === 0);
    expect(zero).toBeTruthy();
    const unverified = catalogue.models.find(
      (m) => m.verified === false && m.declaredBy.length > 0,
    );
    expect(unverified).toBeTruthy();
  });

  it('wpCCounts carries the WP-C fields through the picker map', () => {
    const counts = wpCCounts();
    expect(counts).toEqual(fleetCountsById(wpCCatalogue()));
    expect(counts['muse::meta::muse-spark-1.3'].runnerCount).toBe(2);
    const unverified = counts['muse::meta::unverified-9'];
    expect(unverified.verified).toBe(false);
    expect(unverified.declaredBy).toEqual(['local-alpha']);
    expect(counts['custom::acme::retired'].runnerCount).toBe(0);
  });
});
