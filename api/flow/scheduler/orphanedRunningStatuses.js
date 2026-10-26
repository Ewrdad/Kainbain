/***
 * MARK: ORPHANED_RUNNING_STATUSES
 * @description Live `running_*` statuses treated as orphaned when no engine
 *   owner holds them (e.g. after a server restart): `running_agent/ci/merge`,
 *   `advancing`, plus the legacy `running_deploy` label so pre-migration
 *   task records still reconcile. `reconcileInterruptedRuns` flips these to
 *   `interrupted`; the disk-load path applies the same rule.
 * @example ORPHANED_RUNNING_STATUSES.has("running_agent") => true
 ***/
export const ORPHANED_RUNNING_STATUSES = new Set([
	"running_agent",
	"running_ci",
	"running_deploy", // legacy label from before the deploy-runtime removal
	"running_merge",
	"advancing",
]);
