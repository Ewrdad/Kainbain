// Role: single source of truth for the domain-request operations composed
// into the frontend `api` client. Add an endpoint here (request-list key +
// registry entry, in the same diff) — never touch a test file for a new op.
import { workRequests } from './work/index.js';
import { flowRequests } from './flow/index.js';
import { crewRequests } from './crew/index.js';
import { watchRequests } from './watch/index.js';
import { runnerRequests } from './runners/index.js';
import { houseRequests } from './house/index.js';
import { retrospectiveRequests } from './retrospective/index.js';
import { accessibilityRequests } from './accessibility/index.js';

/***
 * MARK: domainRegistry
 * @description The single source of truth for domain-request operations: one
 *   entry per domain pairing the request list with the exact operation
 *   names that list must expose. `api.js` builds the domain portion of
 *   `api` from this list (so composition cannot drift from the contract),
 *   and the suites derive their expectations from it:
 *   per-domain key-set equality (catches unregistered adds and drops),
 *   cross-domain no-duplicates, and every registered op a function on `api`.
 *   Failure output names the offending operation — no CI round-trip needed.
 *   Order matches the historical `api.js` spread order; later entries win on
 *   overlap, exactly as hand-written spreads did. Each entry fails fast at
 *   load when its shape is wrong (see the check below the list), so a typo
 *   in a new entry breaks with the domain named instead of an unclear
 *   `undefined is not a function` far from the edit.
 * @example domainRegistry.map((entry) => entry.domain) => ['work', 'flow', 'crew', 'watch', 'runners', 'house', 'retrospective', 'accessibility']
 ***/
export const domainRegistry = [
  {
    domain: 'work',
    build: ({ request, isValidProjectId }) => workRequests(request, isValidProjectId),
    operations: [
      'completeTask',
      'createTask',
      'deleteTask',
      'deleteTaskImage',
      'getSurvey',
      'getTask',
      'listTaskImages',
      'listTasks',
      'previewTask',
      'submitSurvey',
      'submitTask',
      'uncompleteTask',
      'updateTask',
      'uploadTaskImage',
    ],
  },
  {
    domain: 'flow',
    build: ({ request }) => flowRequests(request),
    operations: [
      'abortTask',
      'advanceTask',
      'createProjectWorkflow',
      'deleteProjectWorkflow',
      'engineReset',
      'engineState',
      'engineTrip',
      'executeTaskStage',
      'failbackTask',
      'getTaskQueue',
      'getWorkflow',
      'getWorkflows',
      'jumpTask',
      'jumpToStage',
      'listWorkflows',
      'moveTask',
      'pauseTask',
      'resumeTask',
      'retryTask',
      'skipStage',
      'startWorkflow',
      'switchProjectWorkflow',
      'updateProjectWorkflow',
      'updateWorkflow',
    ],
  },
  {
    domain: 'crew',
    build: ({ request }) => crewRequests(request),
    operations: [
      'computeStart',
      'computeStop',
      'followUp',
      'followUpTask',
      'getHarnessModels',
      'getHarnessReliability',
      'getHarnesses',
      'restoreSession',
      'sessionHistory',
      'sessionStatus',
      'steer',
      'steerTask',
    ],
  },
  {
    domain: 'watch',
    build: ({ request }) => watchRequests(request),
    operations: [
      'addReviewComment',
      'addReviewCommentReply',
      'checkTaskStuck',
      'deleteReviewComment',
      'getTaskReports',
      'getTaskReview',
      'rejectTaskWithFeedback',
      'updateReviewComment',
    ],
  },
  {
    domain: 'runners',
    build: ({ request }) => runnerRequests(request),
    operations: [
      'approveRunner',
      'deleteFleetCatalogueModel',
      'deleteFleetQuarantinedModel',
      'denyRunner',
      'getFleetModelCatalog',
      'getRunnerConfig',
      'getRunnerMonitor',
      'getRunners',
      'pauseRunner',
      'requestModelRediscovery',
      'requestRunnerUpdate',
      'resumeRunner',
      'revokeRunner',
      'skipRunner',
      'updateRunnerConfig',
    ],
  },
  {
    domain: 'house',
    build: ({ request }) => houseRequests(request),
    operations: [
      'activateProject',
      'checkAppHealth',
      'clearImageGenKey',
      'createProject',
      'deleteSkill',
      'deployChangelog',
      'deployLog',
      'deployStatus',
      'dryRunPromptLayout',
      'getAliasReliability',
      'getFileContent',
      'getFileRawUrl',
      'getImageGenProviders',
      'getOnboarding',
      'getProject',
      'getPromptLayout',
      'getSkill',
      'getSkills',
      'importSkill',
      'listFiles',
      'listProjects',
      'registerProject',
      'resetPromptLayout',
      'saveImageGenKey',
      'testImageGenProvider',
      'triggerDeploy',
      'triggerRollback',
      'updateAppStatus',
      'updateProject',
      'updatePromptLayout',
    ],
  },
  {
    domain: 'retrospective',
    build: ({ request }) => retrospectiveRequests(request),
    operations: ['retrospectiveChat'],
  },
  {
    domain: 'accessibility',
    build: ({ request }) => accessibilityRequests(request),
    operations: ['accessibilityResults', 'submitAccessibilityFeedback'],
  },
];

/***
 * MARK: collectDomainOperationNames
 * @description Collects every registered domain operation name, in registry
 *   order (one entry per domain, duplicates preserved so the no-duplicates
 *   check can see them).
 * @example collectDomainOperationNames().length => domainRegistry.reduce((n, entry) => n + entry.operations.length, 0)
 ***/
export const collectDomainOperationNames = () =>
  domainRegistry.flatMap((entry) => entry.operations);

/***
 * MARK: buildDomainClients
 * @description Builds one client per registry entry from shared helpers, in
 *   registry order. `api.js` spreads the result to compose the domain
 *   portion of `api`; the suites build the same clients to check each
 *   request list against its registered operation names.
 * @example buildDomainClients({ request, isValidProjectId }).map((client) => Object.keys(client).length)
 * @param {Object} deps - Shared helpers passed to every request list.
 * @param {Function} deps.request - The shared JSON request helper.
 * @param {Function} deps.isValidProjectId - Project-id guard (work list only).
 * @returns {Array<Object>} One client object per registry entry, in order.
 ***/
export const buildDomainClients = ({ request, isValidProjectId }) =>
  domainRegistry.map((entry) => entry.build({ request, isValidProjectId }));

// Fail fast with the domain named: an entry missing its name, its
// request-list builder, or its operation names would otherwise surface as an
// unclear `undefined is not a function` far from the typo. This runs at load
// so both `api.js` and the suites break the same clear way.
for (const [index, entry] of domainRegistry.entries()) {
  const label = entry?.domain || `registry entry ${index}`;
  if (typeof entry?.build !== 'function') {
    throw new Error(`domainRegistry: "${label}" needs a request-list builder named build.`);
  }
  const operationsLookRight =
    Array.isArray(entry?.operations) &&
    entry.operations.every((name) => typeof name === 'string' && name.length > 0);
  if (!operationsLookRight) {
    throw new Error(`domainRegistry: "${label}" needs operation names as a list of non-empty text.`);
  }
}
