import { PUBLISH_COMMAND_PATTERN } from "./deployCommandPatterns.js";

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
