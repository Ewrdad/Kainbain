/***
 * MARK: DEPLOY_COMMAND_PATTERN
 * @description Matches a stage command that invokes a deploy/publish/redeploy
 *   script. Used by the merge/deploy stage data migration
 *   (migrateMergeDeployStages) and by host-command classification
 *   (isHostCommand): host commands are stamped hostOnly at stage
 *   normalization and never dispatched to a Runner.
 * @example DEPLOY_COMMAND_PATTERN.test('./publish.sh') => true
 ***/
export const DEPLOY_COMMAND_PATTERN = /(?:deploy|publish|redeploy|update|install)\.sh/;

/***
 * MARK: HOST_COMMAND_PATTERN
 * @description Matches deploy/redeploy scripts. Retired as a dispatch
 *   signal: every command stage runs on a Runner (the backend never
 *   executes stage commands), so nothing consults this pattern to keep
 *   work embedded. Kept for command recognition alongside the other
 *   patterns in this module.
 * @example HOST_COMMAND_PATTERN.test('./redeploy.sh --frontend') => true
 * @example HOST_COMMAND_PATTERN.test('./publish.sh --detect') => false
 ***/
export const HOST_COMMAND_PATTERN = /(?:deploy|redeploy)\.sh/;

/***
 * MARK: PUBLISH_COMMAND_PATTERN
 * @description Matches a stage command that invokes the publish script.
 * @example PUBLISH_COMMAND_PATTERN.test('./publish.sh --detect') => true
 ***/
export const PUBLISH_COMMAND_PATTERN = /publish\.sh/;

/***
 * MARK: isDeployCommand
 * @description Whether a stage command string invokes the deploy script.
 *   Used only by the merge/deploy stage data migration below — never by
 *   the generic dispatch path.
 * @example isDeployCommand('./deploy.sh --prod') => true
 * @param {unknown} command - Stage `command` or `script` value.
 * @returns {boolean} True only for strings naming `deploy.sh`.
 ***/
export const isDeployCommand = (command) => {
	if (typeof command !== "string" || command.length === 0) return false;
	return DEPLOY_COMMAND_PATTERN.test(command);
}

/***
 * MARK: isHostCommand
 * @description Whether a stage command invokes a deploy/redeploy script.
 *   Retired as a dispatch signal: every command stage runs on a Runner.
 *   Kept for command recognition alongside the other predicates here.
 * @example isHostCommand('./deploy.sh --prod') => true
 * @example isHostCommand('./publish.sh --detect') => false
 * @param {unknown} command - Stage `command` or `script` value.
 * @returns {boolean}
 ***/
export const isHostCommand = (command) => {
	if (typeof command !== "string" || command.length === 0) return false;
	return HOST_COMMAND_PATTERN.test(command);
}

/***
 * MARK: isPublishCommand
 * @description Whether a stage command invokes the publish script. Publish
 *   stages are ordinary ci stages (Runner-dispatchable); publish.sh handles
 *   the primary-checkout requirement itself.
 * @example isPublishCommand('./publish.sh --detect') => true
 * @param {unknown} command - Stage `command` or `script` value.
 * @returns {boolean}
 ***/
export const isPublishCommand = (command) => {
	if (typeof command !== "string" || command.length === 0) return false;
	return PUBLISH_COMMAND_PATTERN.test(command);
}

/***
 * MARK: DEFAULT_DEPLOY_COMMAND
 * @description The built-in deploy command. Default helper used by
 *   DEFAULT_STAGES for a new project's Deploy stage (an ordinary ci stage
 *   whose command runs the deploy script). It is only a default value —
 *   it confers no special runtime semantics.
 ***/
export const DEFAULT_DEPLOY_COMMAND = "./deploy.sh --prod";
