/***
 * MARK: appUrl (shared app-link helpers)
 * @description THE single implementation of the "Go to App" URL rules, shared
 *   verbatim by the backend (`api/projectStore.js`, `api/routes/projects.js`)
 *   and the frontend (`GoToAppLink.jsx`, `ProjectSettings.jsx`) so validation
 *   and network-override rewriting cannot drift. Plain ESM, zero dependencies.
 *
 *   A project may carry `appStatus.url` (the dev server an agent or script is
 *   running, e.g. `http://localhost:5173`). Only `http:`/`https:` links are
 *   ever honored — anything else (`javascript:`, `file:`, `data:`) is rejected
 *   so a stored link can never become a redirect attack. A loopback host in
 *   the stored URL is rewritten to the configured `networkHost` (e.g. a LAN
 *   name like `home.home`) or, when the page itself is served remotely, to the
 *   page host — the same loopback self-heal as `frontend/.../apiBase.js`.
 ***/

/** Hostnames that mean "this machine" and may be rewritten to a LAN host. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/***
 * MARK: isLoopbackHostname
 * @description Whether a hostname is a loopback address.
 * @example isLoopbackHostname('localhost') => true
 * @example isLoopbackHostname('home.home') => false
 * @param {string} host
 * @returns {boolean}
 ***/
export function isLoopbackHostname(host) {
	if (typeof host !== "string") return false;
	const clean = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
	return LOOPBACK_HOSTS.has(clean);
}

/***
 * MARK: validateAppUrl
 * @description Validates a stored "Go to App" link. Only absolute `http:` and
 *   `https:` URLs are accepted; anything else (wrong scheme, relative path,
 *   unparseable text) is rejected so callers can refuse it loudly (API: 400)
 *   or drop it silently (load path: garbage degrades to "no link").
 * @example validateAppUrl('http://localhost:5173') => 'http://localhost:5173'
 * @example validateAppUrl('javascript:alert(1)') => null
 * @param {*} value - Candidate link text.
 * @returns {string|null} The trimmed valid URL, or null when invalid.
 ***/
export function validateAppUrl(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	let parsed;
	try {
		parsed = new URL(trimmed);
	} catch {
		return null;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
	if (!parsed.hostname) return null;
	return trimmed;
}

/***
 * MARK: normalizeNetworkHost
 * @description Normalizes a network-override host (a LAN name or IP such as
 *   `home.home` that replaces loopback in the stored URL). Accepts a bare
 *   host, tolerates a pasted URL (takes its hostname), and rejects anything
 *   with whitespace, paths, or userinfo. A trailing `:port` is honored: the
 *   override replaces host AND port together.
 * @example normalizeNetworkHost('home.home') => { host: 'home.home', port: '' }
 * @example normalizeNetworkHost('http://home.home:8080/x') => { host: 'home.home', port: '8080' }
 * @example normalizeNetworkHost('not a host') => null
 * @param {*} value - Candidate override text.
 * @returns {{ host: string, port: string }|null} The override, or null when blank/invalid.
 ***/
export function normalizeNetworkHost(value) {
	if (value === undefined || value === null) return null;
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/\s/.test(trimmed)) return null;
	// Tolerate a pasted URL: only the host (and explicit port) matter.
	if (trimmed.includes("://")) {
		let parsed;
		try {
			parsed = new URL(trimmed);
		} catch {
			return null;
		}
		if (!parsed.hostname || parsed.username || parsed.password) return null;
		return { host: parsed.hostname.toLowerCase(), port: parsed.port || "" };
	}
	if (trimmed.includes("/") || trimmed.includes("@")) return null;
	// Bare host with an optional explicit :port (IPv6 must be bracketed).
	let host = trimmed;
	let port = "";
	const bracketed = trimmed.match(/^\[([^\]]+)\](?::(\d+))?$/);
	const bare = trimmed.match(/^([^:[\]]+)(?::(\d+))?$/);
	const match = bracketed || bare;
	if (!match) return null;
	host = match[1].toLowerCase();
	port = match[2] || "";
	if (!host) return null;
	if (port && (Number(port) < 1 || Number(port) > 65535)) return null;
	return { host, port };
}

/***
 * MARK: resolveAppUrl
 * @description Resolves the clickable "Go to App" link from a stored URL. A
 *   loopback host is rewritten to the network override when one is set,
 *   otherwise to the serving page host when the page itself is remote (same
 *   self-heal as `resolveApiBase`); anything else passes through unchanged.
 *   Port, path, query, and scheme are always preserved (an explicit override
 *   port wins over the stored port). Invalid links resolve to '' (no link).
 * @example resolveAppUrl('http://localhost:5173', 'home.home', '') => 'http://home.home:5173/'
 * @example resolveAppUrl('http://127.0.0.1:3000/a?b=1', null, '192.0.2.10') => 'http://192.0.2.10:3000/a?b=1'
 * @example resolveAppUrl('javascript:alert(1)', 'home.home', '') => ''
 * @param {string} rawUrl - Stored app URL.
 * @param {string|null} [networkHost] - LAN override host (optionally with :port).
 * @param {string} [pageHost] - Hostname serving the KainBain page ('' when unknown).
 * @returns {string} The resolved absolute URL, or '' when there is no safe link.
 ***/
export function resolveAppUrl(rawUrl, networkHost = null, pageHost = "") {
	const valid = validateAppUrl(rawUrl);
	if (!valid) return "";
	const parsed = new URL(valid);
	if (!isLoopbackHostname(parsed.hostname)) return parsed.toString();
	const override = normalizeNetworkHost(networkHost);
	if (override) {
		parsed.hostname = override.host;
		if (override.port) parsed.port = override.port;
		return parsed.toString();
	}
	const page = typeof pageHost === "string" ? pageHost.trim().toLowerCase() : "";
	if (page && !isLoopbackHostname(page) && !/\s/.test(page)) {
		parsed.hostname = page.replace(/:\d+$/, "");
		return parsed.toString();
	}
	return parsed.toString();
}

/***
 * MARK: joinHealthUrl
 * @description Appends a health endpoint path to an app base URL for the
 *   backend health probe. Only http(s) bases are joined; anything else yields
 *   '' so the probe refuses instead of fetching an attacker's URL.
 * @example joinHealthUrl('http://localhost:3000', '/health') => 'http://localhost:3000/health'
 * @example joinHealthUrl('http://localhost:3000/app/', 'health') => 'http://localhost:3000/health'
 * @param {string} base - App base URL.
 * @param {string} [endpoint] - Health endpoint path (default '/').
 * @returns {string} The absolute probe URL, or '' when unsafe.
 ***/
export function joinHealthUrl(base, endpoint = "/") {
	const valid = validateAppUrl(base);
	if (!valid) return "";
	let path = typeof endpoint === "string" && endpoint.trim() ? endpoint.trim() : "/";
	if (!path.startsWith("/")) path = `/${path}`;
	let joined;
	try {
		joined = new URL(path, valid);
	} catch {
		return "";
	}
	if (joined.protocol !== "http:" && joined.protocol !== "https:") return "";
	return joined.toString();
}
