/***
 * MARK: fleetModelFixtures
 * @description Shared mock Runner registrations for the model-catalogue
 *   chain tests (runner leg → fleet catalogue → picker option): one
 *   claim-eligible record advertising the brand-new muse id, so every
 *   seam test serves the identical newcomer without forking builders.
 *   Plain ESM, zero dependencies — importable from the api (vitest) and
 *   runner (node:test) suites alike.
 * @example fleetRunnerRecord({ runnerId: 'box-a' }).capabilities.models => ['muse::meta::muse-spark-1.4']
 ***/

/** The brand-new muse id every chain test serves (mirrors the `msp-model-list.new-model.json` fixture row). */
export const NEW_MODEL_ID = "muse::meta::muse-spark-1.4";

/** The single-colon newcomer: valid per the shared grammar, dropped by the old runner-leg filter. */
export const NEW_MODEL_COLON_ID = "muse::meta::muse-spark-1.4:cloud";

/***
 * MARK: fleetRunnerRecord
 * @description Builds one claim-eligible mock Runner registration
 *   advertising the new-model ids through the muse harness. Overrides
 *   merge shallowly (`capabilities` / `operatorConfig` merge one level).
 * @example fleetRunnerRecord({ runnerId: 'box-a' })
 * @param {Object} [over] - Field overrides.
 * @returns {Object} Runner registry record.
 ***/
export const fleetRunnerRecord = (over = {}) => ({
	status: "active",
	paused: false,
	runnerId: "fleet-fixture-1",
	capabilities: {
		harnesses: [{ id: "muse", version: "1.4.9" }],
		models: [NEW_MODEL_ID],
		tiers: ["T0", "T1"],
		discoveryStatus: { muse: { ok: true, count: 1, atMs: 1700000000000 } },
		...(over.capabilities || {}),
	},
	operatorConfig: { availableModels: null, ...(over.operatorConfig || {}) },
	...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "capabilities" && k !== "operatorConfig")),
});
