// Domain: Project — project configuration and normalizers (barrel over api/project modules).
/***
 * MARK: project barrel
 * @description Re-exports public `api/project/*.js` pure helpers and normalizers
 *   so `api/projectStore.js` and consumers share one import seam.
 * @example import { normalizeStage, normalizeRetryCount } from './index.js';
 ***/

export { inferAliasRenames } from './aliasRenames.js';
export { DEPLOY_COMMAND_PATTERN, isDeployCommand, DEFAULT_DEPLOY_COMMAND } from './deployCommands.js';
export { DEFAULT_STAGES, normalizeStageType, normalizeStageSkills, normalizeStage, migrateMergeDeployStages, normalizeStages } from './stageNormalizers.js';
export { RETRY_SETTING_KEYS, normalizeRetryCount, normalizeTimeoutMs, normalizeRetryEnabled, normalizeProjectRetrySettings } from './retrySettings.js';
export { APP_STATUS_VALUES, normalizeAppStatus } from './appStatus.js';
export { DEFAULT_WORKFLOW_ID, DEFAULT_WORKFLOW_NAME, createDefaultWorkflow, normalizeWorkflow, normalizeWorkflows } from './workflowDefaults.js';
export { slugifyProjectName } from './projectSlug.js';
export { resolveDefaultGitRemote, detectGitRemote } from './gitRemote.js';

