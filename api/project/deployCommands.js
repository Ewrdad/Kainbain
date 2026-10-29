/***
 * MARK: DEPLOY_COMMAND_PATTERN
 * @description Matches a stage command that invokes a deploy/publish/redeploy
 *   script. Used by the merge/deploy stage data migration
 *   (migrateMergeDeployStages) and by host-command classification
 *   (isHostCommand): host commands are stamped hostOnly at stage
 *   normalization and never dispatched to a Runner.
 * @example DEPLOY_COMMAND_PATTERN.test('./publish.sh') => true
 ***/
export const DEPLOY_COMMAND_PATTERN = /(?:deploy|publish|redeploy)\.sh/;

/***
 * MARK: HOST_COMMAND_PATTERN
 * @description Matches deploy/redeploy scripts only: those are host commands
 *   that must run on the backend in the primary checkout, never on a Runner.
 *   publish.sh is NOT a host command — it is an ordinary ci stage that a
 *   Runner executes (the Runner is native on the host and has Docker access);
 *   publish.sh re-execs itself into the primary checkout when a Runner runs
 *   it from a task worktree, so it still only ever publishes merged main.
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
export function isDeployCommand(command) {
	if (typeof command !== "string" || command.length === 0) return false;
	return DEPLOY_COMMAND_PATTERN.test(command);
}

/***
 * MARK: isHostCommand
 * @description Whether a stage command is a host command (deploy/publish/
 *   redeploy script). Host commands run only on the backend in the primary
 *   checkout; they must never be dispatched to a Runner.
 * @example isHostCommand('./publish.sh --detect') => true
 * @param {unknown} command - Stage `command` or `script` value.
 * @returns {boolean}
 ***/
export function isHostCommand(command) {
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
export function isPublishCommand(command) {
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
