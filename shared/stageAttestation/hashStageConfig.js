import { buildStageConfigInput } from "./buildStageConfigInput.js";
import { hashConfig } from "./hashConfig.js";

/***
 * MARK: hashStageConfig
 * @description One call for attestation producers: builds the hashed input
 *   from a task plus its resolved stage definition and returns the
 *   `sha256:<hex>` config hash. Total like the builder — unusable input
 *   returns null instead of throwing, so callers null-check and record an
 *   unattested entry (the pre-feature posture) rather than failing a stage
 *   over its proof. Shared verbatim by the backend and the Runner.
 * @example hashStageConfig({ task: { id: 't', goal: 'g' }, stage: { id: '5', type: 'agent' } }) => 'sha256:…'
 * @param {Object} [input] - Labelled inputs.
 * @param {Object} [input.task] - Task entity.
 * @param {Object} [input.stage] - Resolved stage definition.
 * @returns {string|null} Config hash, or null when it cannot be built.
 ***/
export function hashStageConfig(input) {
	try {
		const built = buildStageConfigInput(input);
		if (!built) return null;
		return hashConfig(built);
	} catch {
		return null;
	}
}
