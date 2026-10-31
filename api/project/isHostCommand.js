import { HOST_COMMAND_PATTERN } from "./deployCommandPatterns.js";

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
export function isHostCommand(command) {
	if (typeof command !== "string" || command.length === 0) return false;
	return HOST_COMMAND_PATTERN.test(command);
}
