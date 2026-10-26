import { normalizeNetworkHost, resolveAppUrl, validateAppUrl } from "../../shared/appUrl.js";

/***
 * MARK: APP_STATUS_VALUES
 * @description The lifecycle states a project's "Go to App" link may report.
 *   Unknown values degrade to "running" on load, and the API refuses them
 *   with 400 on write — a stored link always has a known state.
 * @example APP_STATUS_VALUES.includes('starting') => true
 ***/
export const APP_STATUS_VALUES = ["running", "stopped", "starting", "degraded"];

/***
 * MARK: normalizeAppStatus
 * @description Normalizes a project's "Go to App" status record (`{ url,
 *   networkHost, status, healthEndpoint, ... }`). Tolerant by design: absent
 *   or malformed input degrades to undefined (no link) so a hand-edited
 *   project.json can never break project loading. The resolved LAN URL is
 *   recomputed from the stored URL + network override on every pass.
 * @example normalizeAppStatus({ url: 'http://localhost:5173', networkHost: 'home.home' }) => { url: 'http://localhost:5173', networkHost: 'home.home', resolvedUrl: 'http://home.home:5173/', status: 'running' }
 * @example normalizeAppStatus({ url: 'javascript:alert(1)' }) => undefined
 * @param {*} value - Candidate status record.
 * @returns {Object|undefined} Normalized record, or undefined when there is no safe link.
 ***/
export function normalizeAppStatus(value) {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object" || Array.isArray(value)) return undefined;
	const url = validateAppUrl(value.url);
	if (!url) return undefined;
	const override = normalizeNetworkHost(value.networkHost);
	const normalized = {
		url,
		status: APP_STATUS_VALUES.includes(value.status)
			? value.status
			: "running",
		resolvedUrl: resolveAppUrl(url, value.networkHost),
	};
	if (override) {
		normalized.networkHost = override.port
			? `${override.host}:${override.port}`
			: override.host;
	}
	if (
		typeof value.healthEndpoint === "string" &&
		value.healthEndpoint.trim()
	) {
		const endpoint = value.healthEndpoint.trim();
		normalized.healthEndpoint = endpoint.startsWith("/")
			? endpoint
			: `/${endpoint}`;
	}
	if (typeof value.lastUpdated === "string" && value.lastUpdated) {
		normalized.lastUpdated = value.lastUpdated;
	}
	if (typeof value.lastHealthCheck === "string" && value.lastHealthCheck) {
		normalized.lastHealthCheck = value.lastHealthCheck;
	}
	if (typeof value.isHealthy === "boolean") {
		normalized.isHealthy = value.isHealthy;
	}
	return normalized;
}
