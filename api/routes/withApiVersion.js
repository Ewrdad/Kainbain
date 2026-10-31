import { readApiVersion } from "./readApiVersion.js";

const API_VERSION = readApiVersion();

/***
 * MARK: withApiVersion
 * @description Additively stamps `apiVersion` onto a build record (or a
 *   fresh object when no build record exists).
 * @example withApiVersion({ commit: 'abc' }) => { commit: 'abc', apiVersion: '1.0.0' }
 * @param {Object|null} build - deployManager build record.
 * @returns {Object}
 ***/
export function withApiVersion(build) {
	return { ...(build && typeof build === "object" ? build : {}), apiVersion: API_VERSION };
}
