/***
 * MARK: DEPLOY_COMMAND_PATTERN
 * @description Matches a stage command that invokes the deploy script.
 *   Data-migration heuristic ONLY (see `migrateMergeDeployStages`): it
 *   carries no runtime semantics. The generic pipeline never branches on
 *   command text; a deploy-command stage is an ordinary ci stage.
 ***/
export const DEPLOY_COMMAND_PATTERN = /deploy\.sh/;

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
 * MARK: DEFAULT_DEPLOY_COMMAND
 * @description The built-in deploy command. Default helper used by
 *   DEFAULT_STAGES for a new project's Deploy stage (an ordinary ci stage
 *   whose command runs the deploy script). It is only a default value —
 *   it confers no special runtime semantics.
 ***/
export const DEFAULT_DEPLOY_COMMAND = "./deploy.sh --prod";
