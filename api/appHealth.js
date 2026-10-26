import { isLoopbackHostname, validateAppUrl } from "../shared/appUrl.js";

/***
 * MARK: DEFAULT_PROBE_TIMEOUT_MS
 * @description Wall-clock budget for one app health probe. A dev server that
 *   cannot answer in 3s reads as down — the probe must never hang a request.
 * @example DEFAULT_PROBE_TIMEOUT_MS => 3000
 ***/
export const DEFAULT_PROBE_TIMEOUT_MS = 3000;

/***
 * MARK: extraProbeHosts
 * @description Reads the operator-configured extra probe allowlist from
 *   `KAINBAIN_APP_HEALTH_HOSTS` (comma-separated hostnames, e.g.
 *   `home.home,kainbain.home`). Empty means "no extras".
 * @example extraProbeHosts() => ['home.home']
 * @returns {Array<string>}
 ***/
export function extraProbeHosts() {
	const raw = process.env.KAINBAIN_APP_HEALTH_HOSTS || "";
	return raw
		.split(",")
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);
}

/***
 * MARK: isProbeTargetAllowed
 * @description SSRF guard for the app health probe: only `http:`/`https:`
 *   URLs without credentials may be fetched, and only when the host is a
 *   loopback address, one of the project's own stored app hosts (the operator
 *   explicitly configured that link), or on the `KAINBAIN_APP_HEALTH_HOSTS`
 *   allowlist. Redirects are never followed (see probeAppHealth), so an
 *   allowed URL cannot bounce the probe somewhere else.
 * @example isProbeTargetAllowed('http://localhost:3000/health', []) => true
 * @example isProbeTargetAllowed('http://169.254.169.254/', []) => false
 * @param {string} targetUrl - Absolute probe URL.
 * @param {Array<string>} [storedHosts] - The project's own stored app hosts.
 * @returns {boolean}
 ***/
export function isProbeTargetAllowed(targetUrl, storedHosts = []) {
	if (!validateAppUrl(targetUrl)) return false;
	let parsed;
	try {
		parsed = new URL(targetUrl);
	} catch {
		return false;
	}
	if (parsed.username || parsed.password) return false;
	const host = parsed.hostname.toLowerCase();
	if (isLoopbackHostname(host)) return true;
	const allowed = new Set([
		...storedHosts.map((h) => String(h || "").toLowerCase()),
		...extraProbeHosts(),
	]);
	return allowed.has(host);
}

/***
 * MARK: probeAppHealth
 * @description Fetches one app health URL and reports reachability. Any 2xx
 *   or 3xx answer counts as healthy (a redirect still proves the app is up);
 *   redirects are NOT followed, so the SSRF guard cannot be bounced. Network
 *   errors and timeouts report `healthy: false` with `statusCode: 0` instead
 *   of throwing — the probe result, not an exception, is the deliverable.
 * @example probeAppHealth('http://localhost:3000/health') => { healthy: true, statusCode: 200, latencyMs: 12, checkedAt: '...' }
 * @param {string} targetUrl - Absolute http(s) probe URL.
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs] - Per-probe budget (default 3000).
 * @returns {Promise<{ healthy: boolean, statusCode: number, latencyMs: number, checkedAt: string, error?: string }>}
 ***/
export async function probeAppHealth(targetUrl, { timeoutMs } = {}) {
	const budget =
		Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
			? Math.floor(Number(timeoutMs))
			: DEFAULT_PROBE_TIMEOUT_MS;
	const started = Date.now();
	try {
		const res = await fetch(targetUrl, {
			method: "GET",
			redirect: "manual",
			signal: AbortSignal.timeout(budget),
		});
		return {
			healthy: res.status >= 200 && res.status < 400,
			statusCode: res.status,
			latencyMs: Date.now() - started,
			checkedAt: new Date().toISOString(),
		};
	} catch (err) {
		return {
			healthy: false,
			statusCode: 0,
			latencyMs: Date.now() - started,
			checkedAt: new Date().toISOString(),
			error: err?.name === "TimeoutError" ? "probe timed out" : "app unreachable",
		};
	}
}
