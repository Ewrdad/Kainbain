// Domain: KainBain self-deploy continuity — implementation-specific entry.
//
// A deploy-command stage is an ordinary ci stage to the generic pipeline.
// This module re-attaches KainBain's own cross-restart continuity (attempt
// checkpoints, `last-result.json` reconciliation, deploy-lock deferral,
// once-only park/failback decisions) as a generic stage-lifecycle plugin —
// and ONLY when explicitly enabled for this implementation via
// `KAINBAIN_SELF_DEPLOY_CONTINUITY=1`.
//
// Generic projects run with the flag unset: no plugin is installed, the
// generic engine dispatches without any deploy-specific hooks, and none of
// the continuity code below is required or invoked.

import { registerStageLifecyclePlugin } from "../flow/stageLifecycle.js";
import {
	recordContinuityStageEntry,
	reconcileInterruptedDeploys,
} from "./deployReconcile.js";

/***
 * MARK: SELF_DEPLOY_CONTINUITY_ENV
 * @description Env var that opts this implementation into self-deploy
 *   continuity. Anything other than exactly `"1"` (after trimming) reads as
 *   disabled — including `"true"` — so a stray truthy value can never
 *   silently change dispatch behaviour.
 ***/
export const SELF_DEPLOY_CONTINUITY_ENV = "KAINBAIN_SELF_DEPLOY_CONTINUITY";

/***
 * MARK: SELF_DEPLOY_PLUGIN_NAME
 * @description Name under which the self-deploy plugin registers.
 ***/
export const SELF_DEPLOY_PLUGIN_NAME = "kainbain-self-deploy";

/***
 * MARK: isSelfDeployContinuityEnabled
 * @description Whether KainBain self-deploy continuity is active. Reads the
 *   explicit implementation flag only; generic CI runs with no flag set.
 * @example isSelfDeployContinuityEnabled({ KAINBAIN_SELF_DEPLOY_CONTINUITY: '1' }) => true
 * @param {Object} [env] - Environment record (defaults to `process.env`).
 * @returns {boolean}
 ***/
export function isSelfDeployContinuityEnabled(env = process.env) {
	try {
		return String(env?.[SELF_DEPLOY_CONTINUITY_ENV] ?? "").trim() === "1";
	} catch {
		return false;
	}
}

/***
 * MARK: installKainbainSelfDeployContinuity
 * @description Registers the self-deploy reconcile plugin on the generic
 *   lifecycle seam. No-op (returns false, registers nothing) unless the
 *   implementation flag is set. Safe to call multiple times: registration
 *   replaces by name.
 * @example installKainbainSelfDeployContinuity({ KAINBAIN_SELF_DEPLOY_CONTINUITY: '1' }) => true
 * @param {Object} [env] - Environment record (defaults to `process.env`).
 * @returns {boolean} Whether the plugin was installed.
 ***/
export function installKainbainSelfDeployContinuity(env = process.env) {
	if (!isSelfDeployContinuityEnabled(env)) return false;
	return registerStageLifecyclePlugin({
		name: SELF_DEPLOY_PLUGIN_NAME,
		reconcileInterruptions: (store) => reconcileInterruptedDeploys(store),
		onStageEvent: (event, context) => {
			if (event !== "stage:enter") return null;
			return recordContinuityStageEntry(context?.store, context);
		},
	});
}
