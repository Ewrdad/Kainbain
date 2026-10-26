// Domain: The Flow — generic stage lifecycle plugin seam.
//
// The generic pipeline never inspects what a command DOES (in particular it
// never branches on `deploy.sh` command text, deploy attempt ids, deploy
// build markers, or `running_deploy` status). Implementation-specific
// continuity behaviour — e.g. KainBain surviving its own redeploy — plugs in
// here instead of living in the dispatch path.
//
// Contract: a plugin is `{ name: string, reconcileInterruptions?: (store) =>
// Promise<Array<{projectId,taskId}>> | Array<...> }`. The default registry is
// empty (no-op): generic projects run with no continuity code required or
// invoked. `api/continuity/kainbainSelfDeploy.js` registers the KainBain
// self-deploy plugin, and only when its explicit opt-in flag is set.

const plugins = [];

/***
 * MARK: registerStageLifecyclePlugin
 * @description Registers an implementation-specific stage lifecycle plugin.
 *   Duplicate names replace the previous registration so re-installs (tests,
 *   restarts) cannot double-reconcile.
 * @example registerStageLifecyclePlugin({ name: 'x', reconcileInterruptions: async () => [] })
 * @param {Object} [plugin]
 * @returns {boolean} Whether the plugin was registered.
 ***/
export function registerStageLifecyclePlugin(plugin) {
	if (!plugin || typeof plugin !== "object") return false;
	const name = String(plugin.name || "").trim();
	if (!name) return false;
	const existing = plugins.findIndex(
		(entry) => String(entry?.name || "") === name,
	);
	if (existing >= 0) plugins[existing] = plugin;
	else plugins.push(plugin);
	return true;
}

/***
 * MARK: clearStageLifecyclePlugins
 * @description Removes all registered lifecycle plugins. Test seam only.
 * @returns {void}
 ***/
export function clearStageLifecyclePlugins() {
	plugins.length = 0;
}

/***
 * MARK: listStageLifecyclePlugins
 * @description Returns the names of the currently registered plugins.
 * @returns {Array<string>}
 ***/
export function listStageLifecyclePlugins() {
	return plugins.map((entry) => String(entry?.name || ""));
}

/***
 * MARK: emitStageLifecycle
 * @description Broadcasts one lifecycle event to every registered plugin in
 *   registration order. The generic pipeline emits the same events for every
 *   stage regardless of what its command does — plugins decide whether an
 *   event concerns them. A plugin may return `{ env: { NAME: "value" } }` to
 *   contribute child-process environment for the entering stage; only
 *   non-empty string keys and values survive (bounded to 100 entries per
 *   plugin). Never rejects: a throwing plugin is skipped so one
 *   implementation's continuity bug can never break generic dispatch. With
 *   no plugins registered this resolves to `{ env: {} }`.
 * @example await emitStageLifecycle('stage:enter', { store, projectId: 'p', taskId: 't', stage }) => { env: {} }
 * @param {string} event - Lifecycle event name (`stage:enter`, ...).
 * @param {Object} [context] - Event context (store, project/task/stage ids).
 * @returns {Promise<{ env: Object }>} Merged environment contributions.
 ***/
export async function emitStageLifecycle(event, context = {}) {
	const mergedEnv = {};
	try {
		for (const plugin of [...plugins]) {
			try {
				const hook = plugin?.onStageEvent;
				if (typeof hook !== "function") continue;
				const result = await hook(event, context);
				const env = result?.env;
				if (!env || typeof env !== "object") continue;
				let count = 0;
				for (const [key, value] of Object.entries(env)) {
					if (count >= 100) break;
					if (typeof key !== "string" || !key) continue;
					if (typeof value !== "string" || !value) continue;
					/* eslint-disable-next-line security/detect-object-injection -- keys come from in-process registered plugins (implementation code), filtered to non-empty strings above */
					mergedEnv[key] = value;
					count += 1;
				}
			} catch {
				// A plugin failure never breaks dispatch.
			}
		}
	} catch {
		// Registry faults never break dispatch.
	}
	return { env: mergedEnv };
}

/***
 * MARK: runInterruptionReconcilePlugins
 * @description Runs every registered plugin's `reconcileInterruptions`
 *   hook in registration order and concatenates the reconciled pairs.
 *   Never rejects: a throwing plugin is skipped so one implementation's
 *   continuity bug can never break generic startup recovery or the
 *   scheduler tick. With no plugins registered this is a no-op `[]`.
 * @example await runInterruptionReconcilePlugins(store) => []
 * @param {Object} store
 * @returns {Promise<Array<Object>>} Reconciled `{ projectId, taskId }` pairs.
 ***/
export async function runInterruptionReconcilePlugins(store) {
	const reconciled = [];
	for (const plugin of [...plugins]) {
		try {
			const hook = plugin?.reconcileInterruptions;
			if (typeof hook !== "function") continue;
			const result = await hook(store);
			if (Array.isArray(result)) {
				for (const entry of result) {
					if (entry && typeof entry === "object") reconciled.push(entry);
				}
			}
		} catch {
			// A plugin failure retries next tick; generic flow continues.
		}
	}
	return reconciled;
}
