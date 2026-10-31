import { DEPLOY_COMMAND_PATTERN } from "./deployCommandPatterns.js";

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
