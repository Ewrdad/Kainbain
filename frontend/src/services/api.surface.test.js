// node env pin: surface shape only, no DOM needs
// (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { collectDomainOperationNames } from './domainRegistry.js';

/***
 * MARK: api public-surface pin
 * @description Compatibility oracle for the api.js hotspot split: the `api`
 * object key set and the named-export set must stay identical while
 * implementations move to sibling modules. Any rename/drop fails here first.
 * The stable non-domain surface stays literally pinned below; the domain
 * portion derives from domainRegistry.js so a new endpoint updates one
 * registry file, never this test.
 ***/
describe('api public surface', () => {
  it('exposes the pinned non-domain keys plus exactly the registry operations', async () => {
    const { api } = await import('./api');
    // Stable non-domain surface: intentional change-detector, pinned literally.
    const nonDomainKeys = [
      'API_BASE',
      'clearApiCaches',
      'clearModelsCache',
      'clearStatusCache',
      'computeModels',
      'computeStatus',
      'docsArticle',
      'docsIndex',
      'engineStatus',
      'getConfigSpec',
      'getFileRawUrl',
      'getModels',
      'healthStatus',
      'isValidProjectId',
      'observabilityStatus',
      'systemStatus',
    ];
    // Domain portion derived from the registry (not a literal): adding an
    // endpoint updates domainRegistry.js, never this file.
    const registeredNames = collectDomainOperationNames();
    // The one intentional overlap: `api.js` keeps an explicit `getFileRawUrl`
    // override after the domain spread, so that name appears in both lists.
    // Any other overlap would silently replace a stable key with a domain
    // op — fail here naming it.
    const overlappingKeys = nonDomainKeys.filter((key) => registeredNames.includes(key));
    expect(overlappingKeys.sort(), 'stable keys shadowed by domain operations').toEqual([
      'getFileRawUrl',
    ]);
    const expected = [...new Set([...nonDomainKeys, ...registeredNames])].sort();
    expect(Object.keys(api).sort()).toEqual(expected);
  });

  it('exposes the exact pinned named-export set', async () => {
    const mod = await import('./api');
    expect(Object.keys(mod).sort()).toEqual([
      'API_BASE',
      'DEFAULT_REQUEST_TIMEOUT_MS',
      'MAX_GET_RETRIES',
      'MODEL_KEY_SEP',
      'api',
      'appendReasoning',
      'checkReasoningLevelText',
      'classifiesForeignHarness',
      'clearApiCaches',
      'clearModelsCache',
      'clearStatusCache',
      'fetchCachedComputeStatus',
      'fetchCachedHealthStatus',
      'fetchCachedModels',
      'fetchCachedObservabilityStatus',
      'fetchCachedSystemStatus',
      'fetchDocsArticle',
      'groupModelsByProvider',
      'harnessModelKey',
      'isLoopbackHost',
      'isValidProjectId',
      'modelKey',
      'modelKeyForValue',
      'modelOptionValue',
      'normalizeModelRef',
      'parseModelKey',
      'request',
      'resolveApiBase',
      'resolveModel',
      'resolveModelFromRegistry',
      'resolveReasoningOptions',
      'resolveWsBase',
      'splitReasoning',
      'stripReasoning',
      'stripReasoningIfUnsupported',
      'validateModelRefShape',
      'wsUrl',
    ]);
  });
});
