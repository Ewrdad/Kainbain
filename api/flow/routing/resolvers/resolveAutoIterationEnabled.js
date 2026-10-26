import { config } from "../../../config.js";

/***
 * MARK: resolveAutoIterationEnabled
 * @description Whether automatic failback-and-retry is enabled for a project:
 *   an explicit project `autoIterationEnabled` boolean wins, otherwise the
 *   global config default. A non-boolean project value falls through.
 * @example resolveAutoIterationEnabled({ autoIterationEnabled: false }) => false
 * @param {Object} [project]
 * @returns {boolean}
 ***/
export function resolveAutoIterationEnabled(project) {
	if (
		project &&
		typeof project === "object" &&
		typeof project.autoIterationEnabled === "boolean"
	) {
		return project.autoIterationEnabled;
	}
	return config.autoIterationEnabled;
}
