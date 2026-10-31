export {
	DEPLOY_COMMAND_PATTERN,
	HOST_COMMAND_PATTERN,
	PUBLISH_COMMAND_PATTERN,
} from "./deployCommandPatterns.js";
export { isDeployCommand } from "./isDeployCommand.js";
export { isHostCommand } from "./isHostCommand.js";
export { isPublishCommand } from "./isPublishCommand.js";

/***
 * MARK: DEFAULT_DEPLOY_COMMAND
 * @description The built-in deploy command. Default helper used by
 *   DEFAULT_STAGES for a new project's Deploy stage (an ordinary ci stage
 *   whose command runs the deploy script). It is only a default value —
 *   it confers no special runtime semantics.
 ***/
export const DEFAULT_DEPLOY_COMMAND = "./deploy.sh --prod";
