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
