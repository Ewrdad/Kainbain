// Role: single source of truth for the domain-request operations composed
// into the frontend `api` client. Add an endpoint here (factory key +
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
 *   entry per domain pairing the factory wiring with the exact operation
 *   names that factory must expose. `api.js` composes the domain portion of
 *   `api` from this list (so composition cannot drift from the contract),
 *   and the suites derive their expectations from it:
 *   per-domain key-set equality (catches unregistered adds and drops),
 *   cross-domain no-duplicates, and every registered op a function on `api`.
 *   Failure output names the offending operation — no CI round-trip needed.
 *   Order matches the historical `api.js` spread order; later entries win on
 *   overlap, exactly as hand-written spreads did.
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
 * MARK: domainOperationNames
 * @description Union of every registered domain operation name, in registry
 *   order (one entry per domain, duplicates preserved so the no-duplicates
 *   check can see them).
 * @example domainOperationNames().length => domainRegistry.reduce((n, entry) => n + entry.operations.length, 0)
 ***/
export const domainOperationNames = () =>
  domainRegistry.flatMap((entry) => entry.operations);

/***
 * MARK: buildDomainClients
 * @description Builds one client per registry entry from shared deps, in
 *   registry order. `api.js` spreads the result to compose the domain
 *   portion of `api`; the suites build the same clients to check each
 *   factory against its registered operation list.
 * @example buildDomainClients({ request, isValidProjectId }).map((client) => Object.keys(client).length)
 * @param {Object} deps - Shared wiring passed to every factory.
 * @param {Function} deps.request - The shared JSON request helper.
 * @param {Function} deps.isValidProjectId - Project-id guard (work domain only).
 * @returns {Array<Object>} One client object per registry entry, in order.
 ***/
export const buildDomainClients = ({ request, isValidProjectId }) =>
  domainRegistry.map((entry) => entry.build({ request, isValidProjectId }));
