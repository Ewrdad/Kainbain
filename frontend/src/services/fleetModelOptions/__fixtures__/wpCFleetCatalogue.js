import { fleetCountsById } from '../../../hooks/useFleetModelCatalog/fleetCountsById.js';

/***
 * MARK: WP_C_FIXTURE_NOW_MS
 * @description Fixed clock (ms epoch) every WP-C fixture timestamp derives
 *   from, so catalogue ages are deterministic and components under test can
 *   compute them against a mocked clock.
 * @example WP_C_FIXTURE_NOW_MS // => 1790000000000
 ***/
export const WP_C_FIXTURE_NOW_MS = 1790000000000;

/***
 * MARK: wpCCatalogue
 * @description Builds one deterministic `/runners/models/catalogue` payload in
 *   the WP-C response shape (`models[]` with `runnerCount`/`declaredBy`/
 *   derived `verified`/`available`, `harnesses[]` counts, `quarantined[]`):
 *   a verified 2-runner model, a 1-runner model, a 0-runner model with
 *   last-served memory, and an unverified model (`verified:false`,
 *   `declaredBy:['local-alpha']`), plus one quarantined bare id. Picker and
 *   admin suites build against this until WP-C merges; the A4 integration
 *   test pins the same shape against the real snapshot store.
 * @example wpCCatalogue().models.length => 4
 * @returns {Object} Catalogue payload (`{ models, harnesses, quarantined, updatedAtMs }`).
 ***/
export const wpCCatalogue = () => {
  const now = WP_C_FIXTURE_NOW_MS;
  const hour = 3600 * 1000;
  const day = 24 * hour;
  return {
    models: [
      {
        id: 'muse::meta::muse-spark-1.3',
        form: 'harness',
        harness: 'muse',
        provider: 'meta',
        model: 'muse-spark-1.3',
        reasoning: null,
        harnesses: ['muse'],
        tiers: ['T0'],
        runnerIds: ['box-a', 'box-b'],
        runnerCount: 2,
        claimedBy: [],
        declaredBy: [],
        firstSeenAtMs: now - 7 * day,
        lastSeenAtMs: now - hour,
        lastServedAtMs: now - hour,
        lastServedRunnerIds: ['box-a', 'box-b'],
        provenance: {
          'box-a': { harnesses: ['muse'], atMs: now - hour, source: 'discovery' },
          'box-b': { harnesses: ['muse'], atMs: now - hour, source: 'discovery' },
        },
        verified: true,
        available: true,
        unavailableReason: null,
      },
      {
        id: 'pi::google::m1',
        form: 'harness',
        harness: 'pi',
        provider: 'google',
        model: 'm1',
        reasoning: null,
        harnesses: ['pi'],
        tiers: [],
        runnerIds: ['box-a'],
        runnerCount: 1,
        claimedBy: [],
        declaredBy: [],
        firstSeenAtMs: now - 2 * day,
        lastSeenAtMs: now - 30 * 60 * 1000,
        lastServedAtMs: now - 30 * 60 * 1000,
        lastServedRunnerIds: ['box-a'],
        provenance: {
          'box-a': { harnesses: ['pi'], atMs: now - 30 * 60 * 1000, source: 'discovery' },
        },
        verified: true,
        available: true,
        unavailableReason: null,
      },
      {
        id: 'custom::acme::retired',
        form: 'harness',
        harness: 'custom',
        provider: 'acme',
        model: 'retired',
        reasoning: null,
        harnesses: ['custom'],
        tiers: [],
        runnerIds: [],
        runnerCount: 0,
        claimedBy: [],
        declaredBy: [],
        firstSeenAtMs: now - 30 * day,
        lastSeenAtMs: now - 3 * day,
        lastServedAtMs: now - 3 * day,
        lastServedRunnerIds: ['box-a'],
        provenance: {
          'box-a': { harnesses: ['custom'], atMs: now - 3 * day, source: 'discovery' },
        },
        verified: false,
        available: false,
        unavailableReason: '0 runners -- last served 3d ago by box-a',
      },
      {
        id: 'muse::meta::unverified-9',
        form: 'harness',
        harness: 'muse',
        provider: 'meta',
        model: 'unverified-9',
        reasoning: null,
        harnesses: ['muse'],
        tiers: [],
        runnerIds: [],
        runnerCount: 0,
        claimedBy: [],
        declaredBy: ['local-alpha'],
        firstSeenAtMs: now - day,
        lastSeenAtMs: now - hour,
        lastServedAtMs: null,
        lastServedRunnerIds: [],
        provenance: {},
        verified: false,
        available: false,
        unavailableReason: 'declared by 1 runner, not verified by discovery',
      },
    ],
    harnesses: [
      // Both muse-model servers advertise the harness (the backend
      // quarantines harness-scoped ids from runners that do not serve the
      // named harness, so model servers are always harness advertisers).
      { id: 'muse', runnerCount: 2, runnerIds: ['box-a', 'box-b'] },
      { id: 'pi', runnerCount: 2, runnerIds: ['box-a', 'box-b'] },
    ],
    quarantined: [
      {
        id: 'ollama-cloud-direct::gemma4:31b-cloud',
        reason: 'not-harness-qualified: provider-form ids never serve a harness section',
        runnerIds: ['box-a'],
        firstSeenAtMs: now - day,
        lastSeenAtMs: now - hour,
      },
    ],
    updatedAtMs: now,
  };
};

/***
 * MARK: wpCCounts
 * @description The WP-C fixture payload passed through `fleetCountsById`:
 *   the picker-map form (`{ [id]: { runnerCount, runnerIds, harnesses, ... } }`)
 *   whose values carry the WP-C fields (`declaredBy`, `verified`, harness,
 *   timestamps, provenance) pickers and the admin view render.
 * @example wpCCounts()['muse::meta::muse-spark-1.3'].runnerCount => 2
 * @returns {Object} Id-keyed fleet availability map.
 ***/
export const wpCCounts = () => fleetCountsById(wpCCatalogue());
